# Funcoes compartilhadas da skill otimizar-pc. Carregado com dot-source pelos outros scripts.

$Global:OtimLogDir = Join-Path $env:USERPROFILE '.claude\logs\otimizar-pc'
if (-not (Test-Path -LiteralPath $Global:OtimLogDir)) {
    New-Item -ItemType Directory -Path $Global:OtimLogDir -Force | Out-Null
}

function Iniciar-Log($nome) {
    $carimbo = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $Global:OtimLog = Join-Path $Global:OtimLogDir ("{0}-{1}.txt" -f $carimbo, $nome)
    Set-Content -LiteralPath $Global:OtimLog -Value ("=== {0} | {1} ===" -f $nome, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -Encoding UTF8
    return $Global:OtimLog
}

# Escreve na tela E no log ao mesmo tempo
function Diga($texto) {
    Write-Output $texto
    if ($Global:OtimLog) { Add-Content -LiteralPath $Global:OtimLog -Value $texto -Encoding UTF8 }
}

function Bytes($caminho) {
    if (-not (Test-Path -LiteralPath $caminho)) { return 0 }
    $m = Get-ChildItem -LiteralPath $caminho -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum
    if ($m.Sum) { return $m.Sum }
    return 0
}

function LivreNoSistema() {
    return (Get-Volume ($env:SystemDrive.TrimEnd(':'))).SizeRemaining
}

function EhAdmin() {
    $eu = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $eu.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Apaga um caminho e reporta quanto liberou de fato
function Remover($caminho, $rotulo) {
    if (-not (Test-Path -LiteralPath $caminho)) {
        Diga ('        --   {0} (nao existe)' -f $rotulo)
        return 0
    }
    $antes = Bytes $caminho
    Remove-Item -LiteralPath $caminho -Recurse -Force -ErrorAction SilentlyContinue
    $resto = Bytes $caminho
    $liberado = $antes - $resto
    $linha = '{0,9:N0} MB  {1}' -f ($liberado / 1MB), $rotulo
    if ($resto -gt 1MB) { $linha += (' (sobrou {0:N0} MB em uso)' -f ($resto / 1MB)) }
    Diga $linha
    return $liberado
}

# Sobras de programa antigo e jogo: a tabela unica que o diagnostico mede e o limpar apaga.
# Cada id e o que a pessoa escolhe item por item no bloco 3.
$Global:Sobras = [ordered]@{
    'eclipse'       = @{ Rotulo = 'Eclipse (.p2)';                   Caminhos = @((Join-Path $env:USERPROFILE '.p2')) }
    'gradle'        = @{ Rotulo = 'Gradle';                          Caminhos = @((Join-Path $env:USERPROFILE '.gradle')) }
    'maven'         = @{ Rotulo = 'Maven';                           Caminhos = @((Join-Path $env:USERPROFILE '.m2')) }
    'android'       = @{ Rotulo = 'Android SDK (chave de teste e emuladores)'; Caminhos = @((Join-Path $env:USERPROFILE '.android')) }
    'androidstudio' = @{ Rotulo = 'Android Studio 2021';             Caminhos = @((Join-Path $env:LOCALAPPDATA 'Google\AndroidStudio2021.1')) }
    'fortnite'      = @{ Rotulo = 'Fortnite';                        Caminhos = @((Join-Path $env:LOCALAPPDATA 'FortniteGame')) }
    'pubg'          = @{ Rotulo = 'PUBG';                            Caminhos = @((Join-Path $env:LOCALAPPDATA 'TslGame')) }
    'battlenet'     = @{ Rotulo = 'Battle.net';                      Caminhos = @((Join-Path $env:LOCALAPPDATA 'Battle.net'), (Join-Path $env:APPDATA 'Battle.net'), (Join-Path $env:ProgramData 'Battle.net_components')) }
    'psnow'         = @{ Rotulo = 'PlayStation Now';                 Caminhos = @((Join-Path $env:APPDATA 'playstation-now')) }
    'tencent'       = @{ Rotulo = 'Tencent';                         Caminhos = @((Join-Path $env:APPDATA 'Tencent')) }
    'mcafee'        = @{ Rotulo = 'McAfee (resto de desinstalacao)'; Caminhos = @((Join-Path $env:APPDATA 'McAfee')) }
}

# Imprime as sobras acima de 10 MB: tamanho, id e rotulo
function MostrarSobras() {
    foreach ($id in $Global:Sobras.Keys) {
        $b = 0
        foreach ($c in $Global:Sobras[$id].Caminhos) { $b += (Bytes $c) }
        if ($b -gt 10MB) { Diga ('{0,9:N0} MB  {1}  {2}' -f ($b / 1MB), $id, $Global:Sobras[$id].Rotulo) }
    }
}

# Top N subpastas por tamanho
function TopPastas($base, $n) {
    if (-not (Test-Path -LiteralPath $base)) { return }
    Get-ChildItem -LiteralPath $base -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        [PSCustomObject]@{ GB = [math]::Round((Bytes $_.FullName) / 1GB, 2); Nome = $_.Name }
    } | Sort-Object GB -Descending | Select-Object -First $n
}

# Levanta os .msi/.msp de C:\Windows\Installer que NENHUM programa instalado referencia.
# Precisa de admin pra enxergar o registro inteiro (sem admin subestima o que esta em uso).
function InstaladoresOrfaos() {
    $refs = New-Object System.Collections.Generic.HashSet[string]
    $base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\UserData'
    foreach ($sid in (Get-ChildItem $base -ErrorAction SilentlyContinue)) {
        foreach ($prod in (Get-ChildItem "$($sid.PSPath)\Products" -ErrorAction SilentlyContinue)) {
            $lp = (Get-ItemProperty "$($prod.PSPath)\InstallProperties" -Name LocalPackage -ErrorAction SilentlyContinue).LocalPackage
            if ($lp) { [void]$refs.Add($lp.ToLower()) }
            foreach ($patch in (Get-ChildItem "$($prod.PSPath)\Patches" -ErrorAction SilentlyContinue)) {
                $pp = (Get-ItemProperty $patch.PSPath -Name LocalPackage -ErrorAction SilentlyContinue).LocalPackage
                if ($pp) { [void]$refs.Add($pp.ToLower()) }
            }
        }
    }
    $pasta = Join-Path $env:SystemRoot 'Installer'
    $todos = Get-ChildItem -LiteralPath $pasta -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.msi', '.msp' }
    $orfaos = $todos | Where-Object { -not $refs.Contains($_.FullName.ToLower()) }
    return [PSCustomObject]@{
        Referenciados = $refs.Count
        Todos         = $todos
        Orfaos        = $orfaos
    }
}

# Escolhe o disco de destino da quarentena: o de mais espaco livre que NAO seja o do sistema
function DiscoDeSobra() {
    $sis = $env:SystemDrive.TrimEnd(':')
    $cand = Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveLetter -ne $sis -and $_.DriveType -eq 'Fixed' } |
            Sort-Object SizeRemaining -Descending | Select-Object -First 1
    if ($cand) { return ($cand.DriveLetter + ':') }
    return $null
}
