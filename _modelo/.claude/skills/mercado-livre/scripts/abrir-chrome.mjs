#!/usr/bin/env node
// Abre (ou reaproveita) o Chrome dedicado deste projeto, na porta propria dele.
// Uso, da raiz do projeto: node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs
import { abrirChrome, avisosDeAbrir, perfilDedicado } from './lib/chrome.mjs'

try {
  const r = await abrirChrome()
  if (r.jaEstavaAberto) console.log(`O Chrome dedicado ja estava aberto na porta ${r.porta}.`)
  else console.log(`Chrome dedicado aberto (processo ${r.pid}). Perfil em ${perfilDedicado()}.`)
  for (const linha of avisosDeAbrir(r)) console.log(linha)
  if (!r.semJanela) console.log('Na primeira vez, entre em mercadolivre.com.br nessa janela e faca login na sua conta de vendedor. O login fica salvo nesse perfil, so nele.')
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
