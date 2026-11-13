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
Diga '--- dentro do perfil do usuario (pastas de ponto, OneDrive, Documentos) ---'
foreach ($linha in (TopPastas $env:USERPROFILE 12)) { Diga ('{0,7:N2} GB  {1}' -f $linha.GB, $linha.Nome) }
Diga ''
Diga '--- dentro de AppData\Roaming ---'
foreach ($linha in (TopPastas $env:APPDATA 5)) { Diga ('{0,7:N2} GB  {1}' -f $linha.GB, $linha.Nome) }

Diga ''
Diga '########## O QUE FOI GRAVADO NOS ULTIMOS 7 DIAS (quem enche sozinho) ##########'
$cresc = @()
foreach ($base in $env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA, $env:ProgramData) {
    foreach ($d in (Get-ChildItem -LiteralPath $base -Directory -Force)) {
        if ($d.FullName -in $env:LOCALAPPDATA, $env:APPDATA, (Join-Path $env:USERPROFILE 'AppData')) { continue }
        $b = BytesRapido $d.FullName 7
        if ($b -gt 100MB) { $cresc += [PSCustomObject]@{ GB = [math]::Round($b / 1GB, 2); Onde = $d.FullName } }
    }
}
foreach ($c in ($cresc | Sort-Object GB -Descending | Select-Object -First 12)) { Diga ('{0,7:N2} GB  {1}' -f $c.GB, $c.Onde) }
if (-not $cresc) { Diga 'Nada acima de 100 MB.' }

Diga ''
Diga '########## TRAVAS CONTRA ENCHER DE NOVO ##########'
$pfMB = (Get-CimInstance Win32_PageFileUsage | Measure-Object AllocatedBaseSize -Sum).Sum
if ($pfMB) {
    $aviso = ''
    if ($pfMB -gt 6144) { $aviso = '   <<< esticou por falta de RAM, encolhe ao reiniciar' }
    Diga ('pagefile.sys: {0:N1} GB{1}' -f ($pfMB / 1024), $aviso)
} else { Diga 'pagefile.sys: nao deu pra ler' }
if (ChromeIaTravada) { Diga 'IA local do Chrome: travada por politica (nao baixa o modelo de 4 GB)' }
else { Diga 'IA local do Chrome: SEM trava. Se apagar o modelo, o Chrome baixa de novo.' }
$forcadas = @()
foreach ($k in 'HKLM:\SOFTWARE\Google\Chrome\Extensions', 'HKLM:\SOFTWARE\WOW6432Node\Google\Chrome\Extensions', 'HKCU:\Software\Google\Chrome\Extensions') {
    $forcadas += (Get-ChildItem $k).PSChildName
}
$forcadas = @($forcadas | Where-Object { $_ } | Sort-Object -Unique)
Diga ('Extensoes que o registro forca em todo Chrome novo: {0}  {1}' -f $forcadas.Count, ($forcadas -join ', '))
if ($forcadas.Count -gt 3) { Diga '   <<< cada Chrome de teste/robo instala essas e larga sobra no TEMP. Ver de qual programa sao.' }
$sp = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
$cad = switch ($sp.'2048') { 1 { 'todo dia' } 7 { 'toda semana' } 30 { 'todo mes' } default { 'so com disco quase cheio' } }
if ($sp.'01' -ne 1) { $cad = 'DESLIGADO' }
Diga ('Sensor de Armazenamento: {0}' -f $cad)
$cfg = Get-Content -LiteralPath (Join-Path $env:USERPROFILE '.claude\settings.json') -Raw | ConvertFrom-Json
if ($cfg.cleanupPeriodDays) { Diga ('Historico do Claude Code: {0} dias' -f $cfg.cleanupPeriodDays) }
else { Diga 'Historico do Claude Code: padrao de 30 dias (cleanupPeriodDays nao definido)' }

Diga ''
Diga '########## CANDIDATOS A LIXO (medidos) ##########'
$alvos = [ordered]@{
    'perfis do Playwright MCP parados 90+ dias'   = 'MCP_PERFIS'
    'rascunho de chat do Claude fechado (7+ dias)' = 'CLAUDE_TMP'
    'VS Code: versoes velhas de extensao'         = 'VSCODE_OBSOLETAS'
    'VS Code: instaladores de extensao guardados' = (Join-Path $env:APPDATA 'Code\CachedExtensionVSIXs')
    'modelo de IA do Chrome (Gemini Nano)'        = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\OptGuideOnDeviceModel')
    'instaladores NVIDIA antigos (Downloader)'    = (Join-Path $env:ProgramData 'NVIDIA Corporation\Downloader')
    'cache do navegador Chrome (todos os perfis)' = 'CHROME_CACHE'
    'versoes antigas do Chrome'                   = (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\Snapshots')
    'cache Edge'                                  = (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Cache')
    'pacotes de driver NVIDIA ja instalados'      = (Join-Path $env:ProgramData 'NVIDIA Corporation\NVIDIA app\UpdateFramework\ota-artifacts')
    'cache npm'                                   = (Join-Path $env:LOCALAPPDATA 'npm-cache')
    'cache pip'                                   = (Join-Path $env:LOCALAPPDATA 'pip\Cache')
    'cache HuggingFace (guarda os modelos de transcricao da /pauta)' = (Join-Path $env:USERPROFILE '.cache\huggingface')
    'crash dumps'                                 = (Join-Path $env:LOCALAPPDATA 'CrashDumps')
    'relatorios de erro do Windows'               = (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER')
    'TEMP do usuario (fora a pasta claude)'       = 'TEMP_SEM_CLAUDE'
    'TEMP do Windows'                             = (Join-Path $env:SystemRoot 'Temp')
    'cache do Windows Update'                     = (Join-Path $env:SystemRoot 'SoftwareDistribution\Download')
}
$totalLixo = 0; $totalFora = 0
$iaTravada = ChromeIaTravada
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
    } elseif ($v -eq 'MCP_PERFIS') {
        $b = 0; foreach ($x in (PerfisMcpVelhos)) { $b += (BytesRapido $x.FullName) }
    } elseif ($v -eq 'CLAUDE_TMP') {
        $b = 0; foreach ($x in (SessoesClaudeParadas)) { $b += (BytesRapido $x.FullName) }
    } elseif ($v -eq 'VSCODE_OBSOLETAS') {
        $b = 0; foreach ($x in (ExtensoesVscodeObsoletas)) { $b += (BytesRapido $x.FullName) }
    } elseif ($v -eq 'TEMP_SEM_CLAUDE') {
        $b = 0
        foreach ($x in (Get-ChildItem -LiteralPath $env:TEMP -Force | Where-Object { $_.Name -ne 'claude' })) {
            if ($x.PSIsContainer) { $b += (BytesRapido $x.FullName) } else { $b += $x.Length }
        }
    } else {
        $b = Bytes $v
    }
    if ($b -gt 10MB) {
        # (*) = nao sai no bloco 1 de sempre: VS Code (bloco 7), Windows Update, HuggingFace (pergunta a parte)
        # e o modelo de IA do Chrome sem a trava ligada
        $fora = ($k -like 'VS Code*') -or ($k -like 'cache do Windows Update*') -or ($k -like 'cache HuggingFace*') -or
                (($k -like 'modelo de IA do Chrome*') -and -not $iaTravada)
        $marca = ''
        if ($fora) { $marca = '  (*)'; $totalFora += $b } else { $totalLixo += $b }
        Diga ('{0,9:N0} MB  {1}{2}' -f ($b / 1MB), $k, $marca)
    }
}
Diga ('---------  SAI NO BLOCO 1: {0:N1} GB' -f ($totalLixo / 1GB))
Diga ('---------  (*) SAI POR OUTRO CAMINHO: {0:N1} GB  (VS Code no bloco 7; Windows Update so depois de instalar as atualizacoes e reiniciar)' -f ($totalFora / 1GB))
Diga 'HuggingFace so sai com o sim a parte, junto do bloco 1 sem -ManterHuggingFace. Modelo de IA do Chrome so sai com a trava ligada. TEMP do Windows sem admin nao se mede.'
Diga ('{0,9:N0} MB  lixeira (item separado, apaga de vez)' -f ((Bytes (Join-Path $env:SystemDrive '$Recycle.Bin')) / 1MB))

Diga ''
Diga '########## SOBRAS DE PROGRAMA ANTIGO / JOGO ##########'
Diga '(o id e o que vai no -Itens do limpar.ps1)'
MostrarSobras

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
