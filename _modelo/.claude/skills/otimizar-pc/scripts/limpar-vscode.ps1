# Bloco 7: so roda com TODAS as janelas do VS Code fechadas. Com o VS Code aberto, recusa e sai 1.
# Quem conversa com o Claude dentro do VS Code roda pelo Win+R, com o caminho inteiro deste arquivo:
#   powershell -ExecutionPolicy Bypass -File "<caminho inteiro deste arquivo>"
# Apaga versoes velhas de extensao (as do .obsolete) e instaladores de extensao guardados.
# O Code\WebStorage fica: guarda dado de pagina (IndexedDB) que nao volta sozinho.
. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'
if (Get-Process Code) {
    Write-Output 'O VS Code ainda esta aberto. Feche todas as janelas e rode de novo. Nada apagado.'
    Read-Host 'Enter pra sair'
    exit 1
}
$log = Iniciar-Log 'vscode'
$antes = LivreNoSistema
foreach ($x in @(ExtensoesVscodeObsoletas)) { [void](Remover $x.FullName ('versao velha: ' + $x.Name)) }
# resto de instalacao interrompida: pasta com nome de GUID comecando por ponto
Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.vscode\extensions') -Directory -Force |
    Where-Object { $_.Name -match '^\.[0-9a-f]{8}-[0-9a-f]{4}-' } | ForEach-Object { [void](Remover $_.FullName ('resto de instalacao: ' + $_.Name)) }
foreach ($p in @('Code\CachedExtensionVSIXs')) {
    $base = Join-Path $env:APPDATA $p
    if (-not (Test-Path -LiteralPath $base)) { continue }
    $b = BytesRapido $base
    Get-ChildItem -LiteralPath $base -Force | Remove-Item -Recurse -Force
    Diga ('{0,9:N0} MB  {1}' -f (($b - (BytesRapido $base)) / 1MB), $p)
}
$depois = LivreNoSistema
Diga ('>>> LIVRE: {0:N1} GB -> {1:N1} GB  (ganho de {2:N1} GB)' -f ($antes / 1GB), ($depois / 1GB), (($depois - $antes) / 1GB))
Diga ('Log: ' + $log)
Read-Host 'Enter pra fechar'
