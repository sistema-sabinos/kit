# Disparo elevado. Todo script que pede admin sobe POR AQUI, nunca com Start-Process solto.
# Fecha tres erros que custam UAC a toa: (1) erro de sintaxe que so aparece depois do UAC,
# (2) caminho com espaco sem aspas embutidas, (3) ler log velho como se fosse o de agora.
# Repassa -LogDir pro script elevado: com a senha de outra conta no UAC, o log cai mesmo assim
# na pasta que este script le depois.
# Uso: .\elevar.ps1 -Script "<caminho inteiro do script>" [-Argumentos '-Desfazer']
#      .\elevar.ps1 -Script "<caminho>" -SoConferir   (so confere a sintaxe, nao pede UAC)
# Saida: 0 ok; 2 script nao existe; 3 erro de sintaxe (UAC nao pedido); 4 UAC negado;
#        5 sem log novo; qualquer outro codigo e o do script elevado, repassado.
param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Argumentos = @(), [switch]$SoConferir, [string]$LogDir)

. (Join-Path $PSScriptRoot '_comum.ps1')

if (-not (Test-Path -LiteralPath $Script)) { Write-Output ('NAO DISPAROU: script nao existe: ' + $Script); exit 2 }

$Script = (Resolve-Path -LiteralPath $Script).Path

# A sintaxe se confere no MESMO motor que vai executar (powershell.exe 5.1), e nao no pwsh 7 de quem chamou:
# ternario, e acento em arquivo sem BOM, passam no 7 e quebram no 5.1.
# Vai por -EncodedCommand: o 5.1 tira as aspas de dentro do -Command ao chamar outro programa.
$env:OTIM_ALVO = $Script
# Diz tambem se o script aceita -LogDir: script de admin escrito na hora pode nao ter, e o
# parametro sobrando faria o elevado cair antes de gravar o log.
$conferir = '$e = $null; $a = [System.Management.Automation.Language.Parser]::ParseFile($env:OTIM_ALVO, [ref]$null, [ref]$e); foreach ($x in $e) { "linha " + $x.Extent.StartLineNumber + ": " + $x.Message }; "ERROS=" + @($e).Count; if ($a.ParamBlock -and @($a.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq "LogDir" }).Count) { "LOGDIR=1" }'
$checagem = & powershell.exe -NoProfile -EncodedCommand ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($conferir)))
$global:LASTEXITCODE = 0
if (-not ($checagem -contains 'ERROS=0')) {
    Write-Output 'NAO DISPAROU: erro de sintaxe no PowerShell 5.1. UAC nao foi pedido.'
    foreach ($l in $checagem) { Write-Output ('  ' + $l) }
    exit 3
}
if ($SoConferir) { Write-Output 'SINTAXE OK no PowerShell 5.1. UAC nao foi pedido (-SoConferir).'; exit 0 }

$disparo = Get-Date
$extras = @($Argumentos | ForEach-Object { if ($_ -match '\s' -and $_ -notmatch '^".*"$') { '"' + $_ + '"' } else { $_ } })
$lista = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $Script + '"')) + $extras
if ($checagem -contains 'LOGDIR=1') { $lista += @('-LogDir', ('"' + $Global:OtimLogDir + '"')) }
try {
    $p = Start-Process powershell -ArgumentList $lista -Verb RunAs -Wait -PassThru -ErrorAction Stop
    Write-Output ('Processo elevado terminou com codigo ' + $p.ExitCode)
} catch {
    Write-Output ('NAO RODOU: UAC negado ou falha no disparo: ' + $_.Exception.Message)
    exit 4
}

# So vale log novo cujo cabecalho (Iniciar-Log) traz o nome DESTE script: outra rodada gravando
# na mesma pasta ao mesmo tempo nao pode passar pelo log daqui.
$folha = Split-Path -Leaf $Script
$novos = @(Get-ChildItem -LiteralPath $Global:OtimLogDir -Filter '*.txt' | Where-Object { $_.CreationTime -ge $disparo } | Sort-Object CreationTime)
$deste = @($novos | Where-Object { (Get-Content -LiteralPath $_.FullName -TotalCount 1) -like ('* | ' + $folha + ' ===') })
if ($deste.Count -eq 0) {
    Write-Output 'SEM LOG NOVO: o script nao chegou a subir. Isso NAO quer dizer "nada a fazer".'
    foreach ($o in $novos) { Write-Output ('  (log novo de outro script, ignorado: ' + $o.Name + ')') }
    exit 5
}
$novo = $deste[-1]
if ($deste.Count -gt 1) {
    Write-Output ('AVISO: ' + $deste.Count + ' logs novos deste script; mostrando o mais novo. Os outros:')
    foreach ($o in $deste[0..($deste.Count - 2)]) { Write-Output ('  ' + $o.FullName) }
}
Write-Output ('--- log desta rodada: ' + $novo.FullName)
Get-Content -LiteralPath $novo.FullName
# codigo diferente de 0 (ex.: DISM abortado por reinicio pendente) nao pode parecer sucesso
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
exit 0
