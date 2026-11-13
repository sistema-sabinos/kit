# Funcoes compartilhadas da skill otimizar-pc. Carregado com dot-source pelos outros scripts.

# Elevado pelo UAC com a senha de outra conta, o USERPROFILE e o dela: quem chama passa -LogDir
$Global:OtimLogDir = if ($LogDir) { $LogDir } else { Join-Path $env:USERPROFILE '.claude\logs\otimizar-pc' }
if (-not (Test-Path -LiteralPath $Global:OtimLogDir)) {
    New-Item -ItemType Directory -Path $Global:OtimLogDir -Force | Out-Null
}

function Iniciar-Log($nome) {
    $carimbo = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $Global:OtimLog = Join-Path $Global:OtimLogDir ("{0}-{1}.txt" -f $carimbo, $nome)
    # o nome do script que abriu o log vai no cabecalho: o elevar.ps1 so aceita log do script que ele disparou
    $quem = Split-Path -Leaf ((Get-PSCallStack)[1].ScriptName)
    Set-Content -LiteralPath $Global:OtimLog -Value ("=== {0} | {1} | {2} ===" -f $nome, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $quem) -Encoding UTF8
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

# Mede pasta grande sem estourar tempo e sem seguir junction (o Bytes comum devolve 0 pra C:\Users
# e trava em Temp\claude). $Dias > 0 devolve so o que foi gravado nesses ultimos dias.
# -Estrito: pra medida que decide se apaga. Robocopy com codigo 8 ou mais nao leu tudo (16 em pasta
# sem permissao), e o zero dele pode ser so o que nao conseguiu ler: volta $null.
function BytesRapido($caminho, $Dias = 0, [switch]$Estrito) {
    if (-not (Test-Path -LiteralPath $caminho)) { return 0 }
    $alvo = $caminho
    if ($alvo.EndsWith('\')) { $alvo += '.' }
    $a = @($alvo, 'NUL', '/L', '/S', '/NFL', '/NDL', '/NJH', '/BYTES', '/XJ', '/R:0', '/W:0')
    if ($Dias -gt 0) { $a += ('/MAXAGE:' + $Dias) }
    $saida = & robocopy @a 2>$null
    $rc = $LASTEXITCODE
    $global:LASTEXITCODE = 0   # robocopy em /L sai com 1, 9, 16... e a ferramenta leria isso como falha do script
    if ($Estrito -and $rc -ge 8) { return $null }
    foreach ($l in $saida) {
        if ($l -match '^\s*Bytes\s*:\s*(\d+)\s+(\d+)') {
            if ($Dias -gt 0) { return [int64]$Matches[2] }
            return [int64]$Matches[1]
        }
    }
    return $null   # nao mediu. Soma como 0, mas ($null -eq 0) e falso: falha de medicao nunca libera apagar.
}

# Perfis de navegador que o Playwright MCP largou, parados ha mais de $dias.
# A data da pasta raiz nao basta: login recente la dentro (em Default) nao mexe nela.
# Parado e sem NENHUM arquivo gravado nesses dias; falha de medida ($null) nunca entra.
function PerfisMcpVelhos($dias = 90) {
    $corte = (Get-Date).AddDays(-$dias)
    foreach ($base in 'ms-playwright', 'ms-playwright-mcp') {
        foreach ($p in (Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA $base) -Directory -Filter 'mcp-chrome-*' -ErrorAction SilentlyContinue)) {
            if ($p.LastWriteTime -ge $corte) { continue }
            $novo = BytesRapido $p.FullName $dias -Estrito
            if ($null -ne $novo -and $novo -eq 0) { $p }
        }
    }
}

# Rascunho (scratchpad) de chat do Claude Code sem arquivo novo ha mais de $dias.
# Chat aberto e ocioso NAO grava nada, entao idade sozinha nao basta: pula toda sessao que o
# Claude Code ainda lista como viva em ~/.claude/sessions (pid existente).
# Sessao e a pasta com nome de UUID dentro de TEMP\claude\<projeto>; o resto fica.
function SessoesClaudeParadas($dias = 7) {
    $corte = (Get-Date).AddDays(-$dias)
    $vivas = @()
    # Sem saber quais estao vivas, nao apaga nenhuma: pasta de registros ausente ou registro
    # ilegivel deixaria um chat aberto fora da lista.
    $pastaSessoes = Join-Path $env:USERPROFILE '.claude\sessions'
    if (-not (Test-Path -LiteralPath $pastaSessoes)) { return }
    $registros = $null
    try { $registros = @(Get-ChildItem -LiteralPath $pastaSessoes -Filter '*.json' -ErrorAction Stop) } catch { return }
    foreach ($j in $registros) {
        $s = $null
        try { $s = Get-Content -LiteralPath $j.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop } catch { return }
        if (-not $s -or -not $s.sessionId -or -not $s.pid) { return }
        if (Get-Process -Id $s.pid -ErrorAction SilentlyContinue) { $vivas += $s.sessionId }
    }
    $raiz = Join-Path $env:TEMP 'claude'
    foreach ($proj in (Get-ChildItem -LiteralPath $raiz -Directory -Force -ErrorAction SilentlyContinue)) {
        foreach ($sess in (Get-ChildItem -LiteralPath $proj.FullName -Directory -Force -ErrorAction SilentlyContinue)) {
            # so pasta com nome de sessao (UUID); pasta interna do Claude Code (bash-edit-diff e outras) fica
            if ($sess.Name -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { continue }
            if ($sess.Name -in $vivas) { continue }
            $novo = BytesRapido $sess.FullName $dias -Estrito
            if ($null -ne $novo -and $novo -eq 0 -and $sess.LastWriteTime -lt $corte) { $sess }
        }
    }
}

# Versoes de extensao que o proprio VS Code ja marcou pra apagar (arquivo .obsolete)
function ExtensoesVscodeObsoletas() {
    $ext = Join-Path $env:USERPROFILE '.vscode\extensions'
    $obs = Join-Path $ext '.obsolete'
    if (-not (Test-Path -LiteralPath $obs)) { return }
    $lista = Get-Content -LiteralPath $obs -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
    if (-not $lista) { return }
    foreach ($nome in $lista.PSObject.Properties.Name) {
        $alvo = Join-Path $ext $nome
        if (Test-Path -LiteralPath $alvo) { Get-Item -LiteralPath $alvo }
    }
}

# O Chrome so para de baixar o modelo de IA (4 GB) com esta politica em 1
function ChromeIaTravada() {
    $v = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome' -Name 'GenAILocalFoundationalModelSettings' -ErrorAction SilentlyContinue).GenAILocalFoundationalModelSettings
    return ($v -eq 1)
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
        [PSCustomObject]@{ GB = [math]::Round((BytesRapido $_.FullName) / 1GB, 2); Nome = $_.Name }
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

# Onde a quarentena ficou: gravado ao mover, lido no -Desfazer e na rodada seguinte.
# Sem isso o disco sai do DiscoDeSobra na hora, e depois de mover GBs pode ser outro.
$Global:OtimDestinoQuarentena = Join-Path $Global:OtimLogDir 'quarentena-destino.txt'
function DestinoDaQuarentena() {
    if (Test-Path -LiteralPath $Global:OtimDestinoQuarentena) {
        $d = Get-Content -LiteralPath $Global:OtimDestinoQuarentena -TotalCount 1
        if ($d) { return $d.Trim() }
    }
    $disco = DiscoDeSobra
    if (-not $disco) { return $null }
    return (Join-Path $disco '_quarentena-instaladores')
}
function GuardarDestinoDaQuarentena($destino) {
    Set-Content -LiteralPath $Global:OtimDestinoQuarentena -Value $destino -Encoding UTF8
}
# Soma as linhas novas ao manifesto: a rodada seguinte nao apaga o caminho de volta da anterior
function SomarAoManifesto($reg, $manifesto) {
    if ($reg) { $reg | Export-Csv -LiteralPath $manifesto -NoTypeInformation -Encoding UTF8 -Append }
}
