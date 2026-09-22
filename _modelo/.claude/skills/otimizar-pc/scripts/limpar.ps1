# Blocos 1 (caches, risco zero) e 3 (sobras de programa antigo). Escopo do usuario, nao precisa admin.
# Uso: .\limpar.ps1 -Blocos 1,3     ou    .\limpar.ps1 -Blocos 1
param([int[]]$Blocos = @(1))

. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'
$log = Iniciar-Log ('limpeza-blocos-' + ($Blocos -join '-'))

$antes = LivreNoSistema
Diga ('Livre no inicio: {0:N1} GB' -f ($antes / 1GB))

if ($Blocos -contains 1) {
    Diga ''
    Diga '########## BLOCO 1: CACHES ##########'

    # --- navegador: SO o cache, perfil/senha/cookie/historico ficam intactos ---
    $ud = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
    if (Test-Path -LiteralPath $ud) {
        $nomes = @('Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
                   'ShaderCache', 'GrShaderCache', 'Service Worker\CacheStorage', 'Service Worker\ScriptCache')
        $perfis = Get-ChildItem -LiteralPath $ud -Directory | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile*' }
        $soma = 0
        foreach ($perfil in $perfis) {
            foreach ($n in $nomes) {
                $alvo = Join-Path $perfil.FullName $n
                if (Test-Path -LiteralPath $alvo) {
                    $soma += (Bytes $alvo)
                    Remove-Item -LiteralPath $alvo -Recurse -Force
                }
            }
        }
        Diga ('{0,9:N0} MB  cache do Chrome em {1} perfis (senha, cookie e favorito preservados)' -f ($soma / 1MB), $perfis.Count)
        [void](Remover (Join-Path $ud 'Snapshots') 'versoes antigas do Chrome')
    }
    [void](Remover (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data\Default\Cache') 'cache do Edge')

    # --- ferramentas ---
    [void](Remover (Join-Path $env:ProgramData 'NVIDIA Corporation\NVIDIA app\UpdateFramework\ota-artifacts') 'pacotes de driver NVIDIA ja instalados')
    [void](Remover (Join-Path $env:USERPROFILE '.cache\huggingface') 'cache HuggingFace')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'npm-cache') 'cache npm')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'pip\Cache') 'cache pip')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'CrashDumps') 'crash dumps')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER') 'relatorios de erro do Windows')

    # --- TEMP ---
    # ATENCAO: NUNCA apagar %TEMP% inteiro. O Claude Code grava a saida dos comandos e o
    # scratchpad em %TEMP%\claude; apagar mata a saida do proprio comando em execucao.
    $protegidas = @('claude')
    $tmp = $env:TEMP
    $sAntes = Bytes $tmp
    Get-ChildItem -LiteralPath $tmp -Force | Where-Object { $_.Name -notin $protegidas } | Remove-Item -Recurse -Force
    Diga ('{0,9:N0} MB  TEMP do usuario (pasta "claude" preservada de proposito)' -f (($sAntes - (Bytes $tmp)) / 1MB))

    $tmpWin = Join-Path $env:SystemRoot 'Temp'
    $sWin = Bytes $tmpWin
    Get-ChildItem -LiteralPath $tmpWin -Force | Remove-Item -Recurse -Force
    Diga ('{0,9:N0} MB  TEMP do Windows' -f (($sWin - (Bytes $tmpWin)) / 1MB))

    Clear-RecycleBin -Force -Confirm:$false
    Diga '           lixeira esvaziada'
}

if ($Blocos -contains 3) {
    Diga ''
    Diga '########## BLOCO 3: SOBRAS DE PROGRAMA ANTIGO ##########'
    Diga '(so rodar depois do usuario confirmar que nao usa mais)'
    [void](Remover (Join-Path $env:USERPROFILE '.p2')                        'Eclipse (.p2)')
    [void](Remover (Join-Path $env:USERPROFILE '.gradle')                    'Gradle')
    [void](Remover (Join-Path $env:USERPROFILE '.m2')                        'Maven')
    [void](Remover (Join-Path $env:USERPROFILE '.android')                   'Android SDK')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'Google\AndroidStudio2021.1') 'Android Studio 2021')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'FortniteGame')              'Fortnite')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'TslGame')                   'PUBG')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'Battle.net')                'Battle.net (local)')
    [void](Remover (Join-Path $env:APPDATA      'Battle.net')                'Battle.net (roaming)')
    [void](Remover (Join-Path $env:ProgramData  'Battle.net_components')     'Battle.net components')
    [void](Remover (Join-Path $env:APPDATA      'playstation-now')           'PlayStation Now')
    [void](Remover (Join-Path $env:APPDATA      'Tencent')                   'Tencent')
    [void](Remover (Join-Path $env:APPDATA      'McAfee')                    'McAfee (resto de desinstalacao)')
}

$depois = LivreNoSistema
Diga ''
Diga ('>>> LIVRE: {0:N1} GB -> {1:N1} GB  (ganho de {2:N1} GB)' -f ($antes / 1GB), ($depois / 1GB), (($depois - $antes) / 1GB))
Diga ('Log: ' + $log)
