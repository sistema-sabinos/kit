#!/usr/bin/env node
// Abre (ou reaproveita) o Chrome dedicado deste projeto, na porta propria dele, sem depender de pacote.
// Uso, da raiz do projeto: node .claude/skills/conectar/scripts/abrir-chrome.mjs [--sem-janela | --fechar]
// --sem-janela: tarefa sem a pessoa na frente. --fechar: fecha o Chrome deste projeto (so ele).
import { abrirChrome, avisosDeAbrir, fecharChrome, opcoesDeAbrir, perfilDedicado } from './lib/navegador.mjs'
import { RAIZ } from './lib/raiz.mjs'

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
    if (r.jaEstavaAberto) console.log(`O Chrome dedicado ja estava aberto na porta ${r.porta}${r.semJanela ? ', sem janela' : ''}.`)
    else console.log(`Chrome dedicado aberto na porta ${r.porta}${o.headless ? ', sem janela' : ''} (processo ${r.pid}). Perfil em ${perfilDedicado(RAIZ)}.`)
    for (const linha of avisosDeAbrir(r, o.headless)) console.log(linha)
    if (!o.headless && !r.semJanela) console.log('Na primeira vez, entre na conta do site nessa janela. O login fica salvo nesse perfil, so nele.')
  }
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
