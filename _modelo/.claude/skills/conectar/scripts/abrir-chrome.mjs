#!/usr/bin/env node
// Abre (ou reaproveita) o Chrome dedicado deste projeto, na porta propria dele, sem depender de pacote.
// Uso, da raiz do projeto: node .claude/skills/conectar/scripts/abrir-chrome.mjs [--sem-janela | --fechar]
// --sem-janela: tarefa sem a pessoa na frente. --fechar: fecha o Chrome deste projeto (so ele).
import { abrirChrome, fecharChrome, opcoesDeAbrir, perfilDedicado } from './lib/navegador.mjs'
import { RAIZ } from './lib/raiz.mjs'

const FECHAR = 'node .claude/skills/conectar/scripts/abrir-chrome.mjs --fechar'

try {
  const o = opcoesDeAbrir(process.argv.slice(2))
  if (o.fechar) {
    const r = await fecharChrome({ raiz: RAIZ })
    if (r.fechado) console.log(`Chrome dedicado fechado (porta ${r.porta}).`)
    else if (r.estado === 'porta-fechada') console.log(`O Chrome dedicado ja estava fechado (porta ${r.porta}).`)
    else {
      console.error(`Nao fechei nada: quem responde na porta ${r.porta} nao e o Chrome deste projeto (${r.estado}).`)
      process.exitCode = 1
    }
  } else {
    const r = await abrirChrome({ raiz: RAIZ, headless: o.headless })
    if (r.jaEstavaAberto) {
      console.log(`O Chrome dedicado ja estava aberto na porta ${r.porta}${r.semJanela ? ', sem janela' : ''}.`)
      // D24: com a pessoa pedindo janela, nada se fecha sozinho
      if (r.semJanela && !o.headless) console.log(`Ele esta sem janela porque um robo abriu. Se o robo estiver no meio de uma tarefa, espere ele terminar; depois rode ${FECHAR} e abra de novo sem o --fechar.`)
      if (r.perfilConferido && r.semPastaDeSaida) console.log(`Esse Chrome abriu antes da pasta de download apontar pro projeto: o que ele baixar cai fora do projeto. Rode ${FECHAR} e abra de novo.`)
    } else console.log(`Chrome dedicado aberto na porta ${r.porta}${o.headless ? ', sem janela' : ''} (processo ${r.pid}). Perfil em ${perfilDedicado(RAIZ)}.`)
    if (!o.headless) console.log('Na primeira vez, entre na conta do site nessa janela. O login fica salvo nesse perfil, so nele.')
  }
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
