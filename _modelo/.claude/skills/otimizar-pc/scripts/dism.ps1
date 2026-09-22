# Bloco 4: limpeza oficial do repositorio de componentes do Windows (WinSxS).
# Descarta as versoes obsoletas que sobraram de atualizacao antiga.
# EFEITO COLATERAL: depois disso nao da mais pra desinstalar as atualizacoes ja instaladas.
# PRECISA DE ADMIN. Leva de 10 a 20 min e trava a maquina em rajadas.
param([switch]$SemResetBase)   # -SemResetBase limpa menos mas preserva a desinstalacao de update

. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'
$log = Iniciar-Log 'dism'

if (-not (EhAdmin)) { Diga 'ERRO: precisa rodar como administrador. Abortado.'; exit 1 }

$antes = LivreNoSistema
Diga ('Livre no inicio: {0:N1} GB' -f ($antes / 1GB))

# tira a barra de progresso do DISM, que polui o log com centenas de linhas
function SemBarra($texto) {
    return (($texto -split "`r?`n" | Where-Object { $_ -notmatch '^\s*\[[=\s]*\d+[,.]\d+%' -and $_.Trim() -ne '' }) -join "`r`n")
}

Diga ''
Diga '########## ANTES ##########'
Diga (SemBarra (dism /online /cleanup-image /analyzecomponentstore 2>&1 | Out-String))

Diga ''
Diga '########## LIMPANDO ##########'
if ($SemResetBase) {
    Diga 'Modo conservador (sem /ResetBase): limpa menos, preserva desinstalacao de update.'
    $saida = dism /online /cleanup-image /startcomponentcleanup 2>&1 | Out-String
} else {
    $saida = dism /online /cleanup-image /startcomponentcleanup /resetbase 2>&1 | Out-String
}
Diga (SemBarra $saida)

Diga ''
Diga '########## DEPOIS ##########'
Diga (SemBarra (dism /online /cleanup-image /analyzecomponentstore 2>&1 | Out-String))

$depois = LivreNoSistema
Diga ''
Diga ('>>> LIVRE: {0:N1} GB -> {1:N1} GB  (ganho de {2:N1} GB)' -f ($antes / 1GB), ($depois / 1GB), (($depois - $antes) / 1GB))
Diga ('Log: ' + $log)
