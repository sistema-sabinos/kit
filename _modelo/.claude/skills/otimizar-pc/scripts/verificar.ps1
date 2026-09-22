# Checagem de integridade DEPOIS da faxina. Nunca pular esta etapa.
# Confere que a operacao continua de pe: credenciais, sessoes de robo, perfis de navegador,
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
        if ($n -ge 5) { Diga ("OK  .env com {0} chaves" -f $n) }
        else { Diga ("ALERTA: .env so tem {0} chaves, parece truncado" -f $n); $problemas++ }
    } else {
        Diga 'AVISO: .env nao encontrado (pode ser normal se o workspace nao usa)'
    }

    foreach ($sub in (Get-ChildItem (Join-Path $Workspace 'infra') -Directory -ErrorAction SilentlyContinue)) {
        foreach ($crit in @('.session', 'chrome-profile', 'node_modules')) {
            $x = Join-Path $sub.FullName $crit
            if (Test-Path -LiteralPath $x) { Diga ('OK  infra\{0}\{1}' -f $sub.Name, $crit) }
        }
    }

    Push-Location $Workspace
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($branch) { Diga ('OK  git no branch ' + $branch) } else { Diga 'AVISO: git nao respondeu' }
    Pop-Location
}

Diga ''
Diga '########## NAVEGADORES DO PLAYWRIGHT ##########'
Diga '(conferir se algum robo fixa uma versao que sumiu)'
$pw = Join-Path $env:LOCALAPPDATA 'ms-playwright'
if (Test-Path -LiteralPath $pw) {
    foreach ($d in (Get-ChildItem -LiteralPath $pw -Directory)) {
        $b = Bytes $d.FullName
        if ($b -gt 1MB) { Diga ('{0,7:N0} MB  {1}' -f ($b / 1MB), $d.Name) }
    }
    if (Test-Path -LiteralPath $Workspace) {
        Diga '--- versao exigida por cada robo ---'
        foreach ($sub in (Get-ChildItem (Join-Path $Workspace 'infra') -Directory -ErrorAction SilentlyContinue)) {
            $bj = Join-Path $sub.FullName 'node_modules\playwright-core\browsers.json'
            if (Test-Path -LiteralPath $bj) {
                $j = Get-Content -LiteralPath $bj -Raw | ConvertFrom-Json
                $rev = ($j.browsers | Where-Object name -eq 'chromium').revision
                $existe = Test-Path -LiteralPath (Join-Path $pw ('chromium-' + $rev))
                $marca = 'OK '
                if (-not $existe) { $marca = 'FALTA'; $problemas++ }
                Diga ('{0}  {1,-20} chromium-{2}' -f $marca, $sub.Name, $rev)
            }
        }
    }
}

Diga ''
if ($problemas -eq 0) { Diga '>>> TUDO INTEGRO, nenhum problema encontrado.' }
else { Diga (">>> ATENCAO: {0} item(ns) com problema acima. Resolver antes de fechar." -f $problemas) }
Diga ('Log: ' + $log)
