# Bloco 2: move os instaladores ORFAOS de C:\Windows\Installer pra quarentena em outro disco.
# NAO APAGA NADA. Grava manifesto CSV pra dar pra desfazer.
# PRECISA DE ADMIN. Disparar assim:
#   Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","<este arquivo>" -Verb RunAs -Wait
# Pra desfazer:  .\quarentena-installer.ps1 -Desfazer
param(
    [string]$Destino,
    [switch]$Desfazer
)

. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'Stop'
$log = Iniciar-Log 'quarentena-installer'

try {
    if (-not (EhAdmin)) {
        Diga 'ERRO: precisa rodar como administrador. Abortado.'
        exit 1
    }

    if (-not $Destino) {
        $disco = DiscoDeSobra
        if (-not $disco) { Diga 'ERRO: nenhum disco alem do de sistema pra usar de quarentena.'; exit 1 }
        $Destino = Join-Path $disco '_quarentena-instaladores'
    }
    $manifesto = Join-Path $Destino 'manifesto.csv'

    # ---------- DESFAZER ----------
    if ($Desfazer) {
        if (-not (Test-Path -LiteralPath $manifesto)) { Diga "Sem manifesto em $manifesto, nada a desfazer."; exit 0 }
        $reg = Import-Csv -LiteralPath $manifesto
        $volta = 0
        foreach ($r in $reg) {
            $atual = Join-Path $Destino $r.Arquivo
            if (Test-Path -LiteralPath $atual) {
                Move-Item -LiteralPath $atual -Destination $r.OrigemCompleta -Force
                $volta++
            }
        }
        Diga "Devolvidos pra C:\Windows\Installer: $volta arquivos"
        exit 0
    }

    # ---------- MOVER ----------
    $antes = LivreNoSistema
    $r = InstaladoresOrfaos
    $gbT = 0; $gbO = 0
    if ($r.Todos) { $gbT = ($r.Todos | Measure-Object Length -Sum).Sum / 1GB }
    if ($r.Orfaos) { $gbO = ($r.Orfaos | Measure-Object Length -Sum).Sum / 1GB }

    Diga ('Referenciados por software instalado : {0}' -f $r.Referenciados)
    Diga ('Total .msi/.msp na pasta            : {0} ({1:N2} GB)' -f $r.Todos.Count, $gbT)
    Diga ('ORFAOS a mover                      : {0} ({1:N2} GB)' -f $r.Orfaos.Count, $gbO)

    if ($r.Orfaos.Count -eq 0) { Diga 'Nada a fazer.'; exit 0 }

    if (-not (Test-Path -LiteralPath $Destino)) { New-Item -ItemType Directory -Path $Destino -Force | Out-Null }

    $reg = @()
    $ok = 0; $falhou = 0
    foreach ($f in $r.Orfaos) {
        try {
            Move-Item -LiteralPath $f.FullName -Destination (Join-Path $Destino $f.Name) -Force -ErrorAction Stop
            $reg += [PSCustomObject]@{ Arquivo = $f.Name; OrigemCompleta = $f.FullName; Bytes = $f.Length }
            $ok++
        } catch {
            Diga ('FALHOU (em uso): {0}' -f $f.Name)
            $falhou++
        }
    }
    $reg | Export-Csv -LiteralPath $manifesto -NoTypeInformation -Encoding UTF8

    $depois = LivreNoSistema
    Diga ''
    Diga "Movidos: $ok | Falharam: $falhou"
    Diga "Quarentena: $Destino"
    Diga "Manifesto : $manifesto"
    Diga ('>>> LIVRE: {0:N1} GB -> {1:N1} GB  (ganho de {2:N1} GB)' -f ($antes / 1GB), ($depois / 1GB), (($depois - $antes) / 1GB))
    Diga ''
    Diga 'Deixar a quarentena parada 30 a 60 dias. Se nenhum programa reclamar ao'
    Diga 'desinstalar ou reparar nesse periodo, pode apagar a pasta.'
    Diga 'CONCLUIDO'
} catch {
    Diga ('ERRO GERAL: ' + $_.Exception.Message)
    exit 1
}
