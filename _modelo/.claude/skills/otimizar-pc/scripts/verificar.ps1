# Checagem de integridade DEPOIS da faxina. Nunca pular esta etapa.
# Confere que a operacao continua de pe: credenciais, Chrome dedicado dos robos, perfis de navegador,
# tarefas agendadas e o git do workspace.
# Sem -Workspace, assume a raiz do projeto (4 niveis acima deste script: scripts -> otimizar-pc -> skills -> .claude).
param([string]$Workspace = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path)

. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'
$log = Iniciar-Log 'verificacao'
$problemas = 0

Diga ''
Diga '########## ESPACO ##########'
foreach ($v in (Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | Sort-Object DriveLetter)) {
    if ($v.Size -gt 0) {
        Diga ('{0}: {1,6:N1} GB livre de {2,6:N1} GB ({3}%)' -f $v.DriveLetter, ($v.SizeRemaining / 1GB), ($v.Size / 1GB), [math]::Round(100 * $v.SizeRemaining / $v.Size, 0))
    }
}

Diga ''
Diga '########## NAVEGADOR (perfil, senha, cookie) ##########'
$ud = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
if (Test-Path -LiteralPath $ud) {
    $perfis = Get-ChildItem -LiteralPath $ud -Directory | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile*' }
    Diga ("{0} perfis presentes" -f $perfis.Count)
    # ATENCAO: cookie mudou de lugar nas versoes novas, mora em <Perfil>\Network\Cookies
    # Estes sao os arquivos que TEM que existir num perfil vivo. Se sumiram, a limpeza passou do ponto.
    $obrigatorios = @('Login Data', 'Network\Cookies', 'Preferences')
    foreach ($p in $perfis) {
        foreach ($f in $obrigatorios) {
            $x = Join-Path $p.FullName $f
            if (Test-Path -LiteralPath $x) { Diga ('OK       {0}\{1}' -f $p.Name, $f) }
            else { Diga ('FALTANDO {0}\{1}' -f $p.Name, $f); $problemas++ }
        }
        # 'Bookmarks' NAO entra na conta: o Chrome so cria esse arquivo no primeiro favorito,
        # entao perfil que nunca favoritou nada legitimamente nao tem. Ja deu falso positivo.
        if (-not (Test-Path -LiteralPath (Join-Path $p.FullName 'Bookmarks'))) {
            Diga ('info     {0} sem favoritos (normal, o arquivo nasce no primeiro)' -f $p.Name)
        }
    }
}

Diga ''
Diga '########## TAREFAS AGENDADAS ##########'
$tarefas = Get-ScheduledTask | Where-Object { $_.TaskPath -eq '\' -and $_.State -ne 'Disabled' }
Diga ("{0} tarefas ativas na raiz" -f $tarefas.Count)
foreach ($t in ($tarefas | Sort-Object TaskName)) { Diga ('{0,-10} {1}' -f $t.State, $t.TaskName) }

if (Test-Path -LiteralPath $Workspace) {
    Diga ''
    Diga ('########## WORKSPACE: {0} ##########' -f $Workspace)

    $envFile = Join-Path $Workspace '.env'
    if (Test-Path -LiteralPath $envFile) {
        $n = (Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^\s*[A-Z_0-9]+=' }).Count
        # A faxina nao mexe no .env; so o arquivo sem nenhuma chave indica estrago
        if ($n -ge 1) { Diga ("OK  .env com {0} chaves" -f $n) }
        else { Diga 'ALERTA: .env existe mas nao tem nenhuma chave, parece truncado'; $problemas++ }
    } else {
        Diga 'AVISO: .env nao encontrado (pode ser normal se o workspace nao usa)'
    }

    # Robos do kit: o Chrome dedicado (login do Mercado Livre e das redes) e o Playwright de cada pacote
    $perfil = Join-Path (Join-Path $Workspace 'dados') 'chrome-perfil'
    if (Test-Path -LiteralPath (Join-Path $perfil 'Default')) {
        foreach ($f in @('Default\Preferences', 'Default\Network\Cookies')) {
            if (Test-Path -LiteralPath (Join-Path $perfil $f)) { Diga ('OK       dados\chrome-perfil\{0}' -f $f) }
            else { Diga ('FALTANDO dados\chrome-perfil\{0}' -f $f); $problemas++ }
        }
    } else { Diga 'info     sem Chrome dedicado ainda (normal antes do primeiro login do /mercado-livre ou do /midia-social)' }
    foreach ($pkg in (Get-ChildItem (Join-Path $Workspace '.claude\skills\*\package.json') -ErrorAction SilentlyContinue)) {
        if ((Get-Content -LiteralPath $pkg.FullName -Raw) -notmatch '"playwright"') { continue }
        if (Test-Path -LiteralPath (Join-Path $pkg.DirectoryName 'node_modules\playwright')) { Diga ('OK       Playwright do {0}' -f $pkg.Directory.Name) }
        else { Diga ('info     Playwright do {0} nao instalado (o npm install da skill traz)' -f $pkg.Directory.Name) }
    }

    Push-Location $Workspace
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($branch) { Diga ('OK  git no branch ' + $branch) } else { Diga 'AVISO: git nao respondeu' }
    Pop-Location
}

Diga ''
Diga '########## NAVEGADORES DO PLAYWRIGHT ##########'
Diga '(os robos do kit usam o Chrome instalado, nao estes)'
$pw = Join-Path $env:LOCALAPPDATA 'ms-playwright'
if (Test-Path -LiteralPath $pw) {
    foreach ($d in (Get-ChildItem -LiteralPath $pw -Directory)) {
        $b = Bytes $d.FullName
        if ($b -gt 1MB) { Diga ('{0,7:N0} MB  {1}' -f ($b / 1MB), $d.Name) }
    }
}

Diga ''
if ($problemas -eq 0) { Diga '>>> TUDO INTEGRO, nenhum problema encontrado.' }
else { Diga (">>> ATENCAO: {0} item(ns) com problema acima. Resolver antes de fechar." -f $problemas) }
Diga ('Log: ' + $log)
