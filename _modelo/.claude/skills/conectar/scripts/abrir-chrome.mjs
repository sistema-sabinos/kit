#!/usr/bin/env node
// Abre (ou reaproveita) o Chrome dedicado deste projeto, na porta propria dele, sem depender de pacote.
// Uso, da raiz do projeto: node .claude/skills/conectar/scripts/abrir-chrome.mjs
import { abrirChrome, perfilDedicado } from './lib/navegador.mjs'
import { RAIZ } from './lib/raiz.mjs'

try {
  const r = await abrirChrome({ raiz: RAIZ })
  if (r.jaEstavaAberto) console.log(`O Chrome dedicado ja estava aberto na porta ${r.porta}.`)
  else console.log(`Chrome dedicado aberto na porta ${r.porta} (processo ${r.pid}). Perfil em ${perfilDedicado(RAIZ)}.`)
  console.log('Na primeira vez, entre na conta do site nessa janela. O login fica salvo nesse perfil, so nele.')
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
