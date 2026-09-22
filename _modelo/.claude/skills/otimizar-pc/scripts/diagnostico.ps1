# Raio-X do PC. SO LEITURA, nao apaga nada. Rode sempre antes de qualquer limpeza.
# Sem admin ja funciona; com admin a analise de instaladores orfaos fica precisa.
. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'
$log = Iniciar-Log 'diagnostico'

$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor
$os = Get-CimInstance Win32_OperatingSystem

Diga ''
Diga '########## MAQUINA ##########'
Diga ('Modelo  : {0} {1}' -f $cs.Manufacturer, $cs.Model)
Diga ('CPU     : {0} ({1} nucleos / {2} threads)' -f $cpu.Name, $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors)
Diga ('RAM     : {0} GB total | {1} GB livre agora' -f [math]::Round($cs.TotalPhysicalMemory / 1GB, 1), [math]::Round($os.FreePhysicalMemory / 1MB, 1))
Diga ('Windows : {0} build {1}' -f $os.Caption, $os.BuildNumber)
Diga ('Ligado ha: {0:N1} horas' -f ((Get-Date) - $os.LastBootUpTime).TotalHours)

Diga ''
Diga '########## DISCOS (qual letra e SSD, qual e HD) ##########'
foreach ($p in (Get-Partition | Where-Object DriveLetter | Sort-Object DriveLetter)) {
    $d = Get-PhysicalDisk -DeviceNumber $p.DiskNumber
    $v = Get-Volume -DriveLetter $p.DriveLetter
    if ($v.Size -gt 0) {
        $pct = [math]::Round(100 * $v.SizeRemaining / $v.Size, 0)
        $alerta = ''
        if ($pct -lt 15) { $alerta = '   <<< APERTADO, e provavelmente a causa da lentidao' }
        Diga ('{0}: {1,6:N1} GB total | {2,6:N1} GB livre ({3,3}%) | {4} {5}{6}' -f $p.DriveLetter, ($v.Size / 1GB), ($v.SizeRemaining / 1GB), $pct, $d.MediaType, $d.FriendlyName, $alerta)
    }
}

Diga ''
Diga '########## ONDE ESTA O ESPACO NO DISCO DE SISTEMA ##########'
Diga '(pode demorar alguns minutos)'
foreach ($linha in (TopPastas ($env:SystemDrive + '\') 8)) { Diga ('{0,7:N2} GB  {1}' -f $linha.GB, $linha.Nome) }
Diga ''
Diga '--- dentro de Windows ---'
foreach ($linha in (TopPastas (Join-Path $env:SystemRoot '') 6)) { Diga ('{0,7:N2} GB  {1}' -f $linha.GB, $linha.Nome) }
Diga ''
Diga '--- dentro de AppData\Local ---'
foreach ($linha in (TopPastas $env:LOCALAPPDATA 8)) { Diga ('{0,7:N2} GB  {1}' -f $linha.GB, $linha.Nome) }

Diga ''
Diga '########## CANDIDATOS A LIXO (medidos) ##########'
$alvos = [ordered]@{
    'cache do navegador Chrome (todos os perfis)' = 'CHROME_CACHE'
    'versoes antigas do Chrome'                   = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Snapshots')
    'cache Edge'                                  = (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Cache')
    'pacotes de driver NVIDIA ja instalados'      = (Join-Path $env:ProgramData 'NVIDIA Corporation\NVIDIA app\UpdateFramework\ota-artifacts')
    'cache npm'                                   = (Join-Path $env:LOCALAPPDATA 'npm-cache')
    'cache pip'                                   = (Join-Path $env:LOCALAPPDATA 'pip\Cache')
    'cache HuggingFace (modelos de IA)'           = (Join-Path $env:USERPROFILE '.cache\huggingface')
    'crash dumps'                                 = (Join-Path $env:LOCALAPPDATA 'CrashDumps')
    'relatorios de erro do Windows'               = (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER')
    'TEMP do usuario'                             = $env:TEMP
    'TEMP do Windows'                             = (Join-Path $env:SystemRoot 'Temp')
    'cache do Windows Update'                     = (Join-Path $env:SystemRoot 'SoftwareDistribution\Download')
    'lixeira'                                     = (Join-Path $env:SystemDrive '$Recycle.Bin')
}
$totalLixo = 0
foreach ($k in $alvos.Keys) {
    $v = $alvos[$k]
    if ($v -eq 'CHROME_CACHE') {
        $ud = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
        $nomes = @('Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'ShaderCache', 'GrShaderCache', 'Service Worker\CacheStorage', 'Service Worker\ScriptCache')
        $soma = 0
        foreach ($perfil in (Get-ChildItem -LiteralPath $ud -Directory | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile*' })) {
            foreach ($n in $nomes) { $soma += (Bytes (Join-Path $perfil.FullName $n)) }
        }
        $b = $soma
    } else {
        $b = Bytes $v
    }
    if ($b -gt 10MB) { Diga ('{0,9:N0} MB  {1}' -f ($b / 1MB), $k); $totalLixo += $b }
}
Diga ('---------  TOTAL EM CACHE DESCARTAVEL: {0:N1} GB' -f ($totalLixo / 1GB))

Diga ''
Diga '########## SOBRAS DE PROGRAMA ANTIGO / JOGO ##########'
$sobras = [ordered]@{
    'Eclipse (.p2)'         = (Join-Path $env:USERPROFILE '.p2')
    'Gradle'                = (Join-Path $env:USERPROFILE '.gradle')
    'Maven'                 = (Join-Path $env:USERPROFILE '.m2')
    'Android SDK'           = (Join-Path $env:USERPROFILE '.android')
    'Fortnite'              = (Join-Path $env:LOCALAPPDATA 'FortniteGame')
    'PUBG'                  = (Join-Path $env:LOCALAPPDATA 'TslGame')
    'Battle.net'            = (Join-Path $env:ProgramData 'Battle.net_components')
    'PlayStation Now'       = (Join-Path $env:APPDATA 'playstation-now')
    'Tencent'               = (Join-Path $env:APPDATA 'Tencent')
}
foreach ($k in $sobras.Keys) { $b = Bytes $sobras[$k]; if ($b -gt 10MB) { Diga ('{0,9:N0} MB  {1}' -f ($b / 1MB), $k) } }

Diga ''
Diga '########## INSTALADORES ORFAOS (C:\Windows\Installer) ##########'
if (EhAdmin) {
    $r = InstaladoresOrfaos
    $gbT = 0; $gbO = 0
    if ($r.Todos) { $gbT = ($r.Todos | Measure-Object Length -Sum).Sum / 1GB }
    if ($r.Orfaos) { $gbO = ($r.Orfaos | Measure-Object Length -Sum).Sum / 1GB }
    Diga ('Total .msi/.msp : {0} ({1:N2} GB)' -f $r.Todos.Count, $gbT)
    Diga ('Em uso          : {0}' -f $r.Referenciados)
    Diga ('ORFAOS          : {0} ({1:N2} GB)  <- vai pra quarentena, nao se apaga' -f $r.Orfaos.Count, $gbO)
} else {
    Diga 'Sem admin: a contagem sairia errada pra mais. Rodar o quarentena-installer.ps1 elevado pra ter o numero certo.'
}

Diga ''
Diga '########## WINSXS (tamanho REAL, nao o do Explorer) ##########'
if (EhAdmin) {
    $an = dism /online /cleanup-image /analyzecomponentstore 2>&1 | Out-String
    foreach ($l in ($an -split "`r?`n")) {
        if ($l -match 'Tamanho|Compartilhado|Backups|Cache e|Recuperaveis|Recuper|Recomendada') { Diga $l.Trim() }
    }
} else {
    Diga 'Precisa admin pra medir. Varredura comum reporta quase o dobro do real (conta hardlink duas vezes).'
}

Diga ''
Diga '########## APPS DESATUALIZADOS ##########'
if (Get-Command winget -ErrorAction SilentlyContinue) {
    $w = winget upgrade --include-unknown --accept-source-agreements 2>$null | Out-String
    Diga $w
} else {
    Diga 'winget nao instalado'
}

Diga ''
Diga '########## SOBE COM O WINDOWS ##########'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$appr = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
foreach ($item in (Get-Item $run -ErrorAction SilentlyContinue).Property) {
    $b = (Get-ItemProperty -Path $appr -Name $item -ErrorAction SilentlyContinue).$item
    $estado = 'ATIVO'
    if ($b -and $b[0] -ne 2) { $estado = 'desligado' }
    Diga ('{0,-11} {1}' -f $estado, $item)
}
foreach ($s in (Get-CimInstance Win32_StartupCommand | Where-Object { $_.Location -like 'HKLM*' })) {
    Diga ('{0,-11} {1}  (maquina inteira)' -f 'ATIVO', $s.Name)
}

Diga ''
Diga '########## RAM POR PROGRAMA AGORA ##########'
Get-Process | Group-Object ProcessName | ForEach-Object {
    [PSCustomObject]@{ Proc = $_.Name; Qtd = $_.Count; MB = [math]::Round((($_.Group | Measure-Object WorkingSet -Sum).Sum) / 1MB, 0) }
} | Sort-Object MB -Descending | Select-Object -First 10 | ForEach-Object { Diga ('{0,7:N0} MB  {1} (x{2})' -f $_.MB, $_.Proc, $_.Qtd) }

Diga ''
Diga ('Log salvo em: ' + $log)
