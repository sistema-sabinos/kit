# Blocos 1 (caches, risco zero) e 3 (sobras de programa antigo, so os ids escolhidos),
# e a lixeira a parte. Escopo do usuario, nao precisa admin.
# Uso: .\limpar.ps1 -Blocos 1    .\limpar.ps1 -Lixeira    .\limpar.ps1 -Blocos 1,3 -Itens gradle,fortnite
#      .\limpar.ps1 -Blocos 1 -ManterHuggingFace   (poupa os modelos de transcricao da /pauta)
# Sem bloco padrao: cada coisa apagada tem de vir pedida (a lixeira aprovada sozinha nao leva os caches junto)
param([int[]]$Blocos = @(), [string[]]$Itens = @(), [switch]$Lixeira, [switch]$ManterHuggingFace)

. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'

# Pelo -File a lista chega como um texto so ("gradle,fortnite"): separa na virgula
$Itens = @($Itens | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
# Confere tudo antes de apagar qualquer coisa
if ($Blocos.Count -eq 0 -and -not $Lixeira) {
    Diga 'nada pedido: passe -Blocos com o que o usuario aprovou, ou -Lixeira; nada apagado'
    exit 2
}
$log = Iniciar-Log ('limpeza-blocos-' + ($Blocos -join '-') + $(if ($Lixeira) { '-lixeira' } else { '' }))
if (($Blocos -contains 3) -and $Itens.Count -eq 0) {
    Diga 'bloco 3 precisa de -Itens com o que o usuario escolheu; nada apagado'
    exit 2
}
foreach ($id in $Itens) {
    if (-not $Global:Sobras.Contains($id)) {
        Diga ("item desconhecido: {0}. Validos: {1}. Nada apagado" -f $id, ($Global:Sobras.Keys -join ', '))
        exit 2
    }
}

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
    [void](Remover (Join-Path $env:ProgramData 'NVIDIA Corporation\Downloader') 'instaladores NVIDIA antigos (Downloader)')
    if ($ManterHuggingFace) { Diga '        --   cache HuggingFace poupado (-ManterHuggingFace)' }
    else { [void](Remover (Join-Path $env:USERPROFILE '.cache\huggingface') 'cache HuggingFace') }

    # --- sobras de automacao e de chat ---
    $soma = 0; $n = 0
    foreach ($x in @(PerfisMcpVelhos)) { $soma += (BytesRapido $x.FullName); Remove-Item -LiteralPath $x.FullName -Recurse -Force; $n++ }
    Diga ('{0,9:N0} MB  {1} perfis do Playwright MCP parados ha 90+ dias (login deles se refaz)' -f ($soma / 1MB), $n)
    $soma = 0; $n = 0
    foreach ($x in @(SessoesClaudeParadas)) { $soma += (BytesRapido $x.FullName); Remove-Item -LiteralPath $x.FullName -Recurse -Force; $n++ }
    Diga ('{0,9:N0} MB  {1} rascunhos de chat do Claude fechado ha 7+ dias' -f ($soma / 1MB), $n)

    # --- modelo de IA do Chrome: so com a trava ligada, senao ele baixa os 4 GB de novo ---
    $ia = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data\OptGuideOnDeviceModel'
    if (Test-Path -LiteralPath $ia) {
        if (ChromeIaTravada) { [void](Remover $ia 'modelo de IA do Chrome (Gemini Nano)') }
        else { Diga ('        --   modelo de IA do Chrome ({0:N0} MB) NAO apagado: falta a politica que trava o download (precisa admin)' -f ((Bytes $ia) / 1MB)) }
    }
    [void](Remover (Join-Path $env:LOCALAPPDATA 'npm-cache') 'cache npm')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'pip\Cache') 'cache pip')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'CrashDumps') 'crash dumps')
    [void](Remover (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER') 'relatorios de erro do Windows')

    # --- TEMP ---
    # ATENCAO: NUNCA apagar %TEMP% inteiro. O Claude Code grava a saida dos comandos e o
    # scratchpad em %TEMP%\claude; apagar mata a saida do proprio comando em execucao.
    $protegidas = @('claude')
    $tmp = $env:TEMP
    # mede sem entrar na pasta claude (dezenas de milhares de arquivo de chat aberto estouram o tempo)
    function TempSemClaude {
        $t = 0
        foreach ($x in (Get-ChildItem -LiteralPath $tmp -Force | Where-Object { $_.Name -notin $protegidas })) {
            if ($x.PSIsContainer) { $t += (BytesRapido $x.FullName) } else { $t += $x.Length }
        }
        return $t
    }
    $sAntes = TempSemClaude
    Get-ChildItem -LiteralPath $tmp -Force | Where-Object { $_.Name -notin $protegidas } | Remove-Item -Recurse -Force
    Diga ('{0,9:N0} MB  TEMP do usuario (pasta "claude" preservada de proposito)' -f (($sAntes - (TempSemClaude)) / 1MB))

    $tmpWin = Join-Path $env:SystemRoot 'Temp'
    $sWin = Bytes $tmpWin
    Get-ChildItem -LiteralPath $tmpWin -Force | Remove-Item -Recurse -Force
    Diga ('{0,9:N0} MB  TEMP do Windows' -f (($sWin - (Bytes $tmpWin)) / 1MB))
}

if ($Lixeira) {
    Diga ''
    Diga '########## LIXEIRA (aprovada a parte, apaga de vez) ##########'
    Clear-RecycleBin -Force -Confirm:$false
    Diga '           lixeira esvaziada'
}

if ($Blocos -contains 3) {
    Diga ''
    Diga '########## BLOCO 3: SOBRAS DE PROGRAMA ANTIGO (so os itens escolhidos) ##########'
    foreach ($id in $Itens) {
        foreach ($c in $Global:Sobras[$id].Caminhos) {
            [void](Remover $c ('{0} ({1})' -f $Global:Sobras[$id].Rotulo, $c))
        }
    }
}

$depois = LivreNoSistema
Diga ''
Diga ('>>> LIVRE: {0:N1} GB -> {1:N1} GB  (ganho de {2:N1} GB)' -f ($antes / 1GB), ($depois / 1GB), (($depois - $antes) / 1GB))
Diga ('Log: ' + $log)
