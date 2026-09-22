# Bloco 5: atualiza os programas (winget) e aplica o Windows Update.
# PRECISA DE ADMIN. Feche o navegador antes, senao o update dele falha.
. (Join-Path $PSScriptRoot '_comum.ps1')
$ErrorActionPreference = 'SilentlyContinue'
$log = Iniciar-Log 'atualizar-apps'

if (-not (EhAdmin)) { Diga 'ERRO: precisa rodar como administrador. Abortado.'; exit 1 }

Diga ''
Diga '########## WINGET ##########'
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Diga (winget upgrade --all --include-unknown --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | Out-String)
    Diga ''
    Diga '--- sobrou algum? ---'
    Diga (winget upgrade --include-unknown --accept-source-agreements 2>&1 | Out-String)
    Diga ''
    Diga 'NOTA: o Microsoft Edge costuma recusar o winget ("tecnologia de instalacao diferente")'
    Diga 'e tambem resiste ao proprio updater por linha de comando. Mandar o usuario abrir o Edge'
    Diga 'e ir em Ajuda e comentarios > Sobre o Microsoft Edge. Ele se atualiza ao abrir a tela.'
} else {
    Diga 'winget nao instalado, pulando.'
}

Diga ''
Diga '########## WINDOWS UPDATE ##########'
try {
    $s = New-Object -ComObject Microsoft.Update.Session
    $r = $s.CreateUpdateSearcher().Search('IsInstalled=0 and IsHidden=0')
    if ($r.Updates.Count -eq 0) {
        Diga 'Nada pendente.'
    } else {
        $col = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($u in $r.Updates) {
            if (-not $u.EulaAccepted) { $u.AcceptEula() }
            [void]$col.Add($u)
            Diga ('Na fila: ' + $u.Title)
        }
        $d = $s.CreateUpdateDownloader(); $d.Updates = $col
        $rd = $d.Download()
        Diga ('Download: codigo ' + $rd.ResultCode + '  (2 = sucesso)')

        $inst = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($u in $col) { if ($u.IsDownloaded) { [void]$inst.Add($u) } }
        if ($inst.Count -gt 0) {
            $i = $s.CreateUpdateInstaller(); $i.Updates = $inst
            $ri = $i.Install()
            Diga ('Instalacao: codigo ' + $ri.ResultCode + '  (2 = sucesso) | precisa reiniciar: ' + $ri.RebootRequired)
        } else {
            Diga 'Nenhuma baixada com sucesso.'
        }
    }
} catch {
    Diga ('ERRO no Windows Update: ' + $_.Exception.Message)
}

Diga ''
Diga ('Livre agora: {0:N1} GB' -f ((LivreNoSistema) / 1GB))
Diga ('Log: ' + $log)
