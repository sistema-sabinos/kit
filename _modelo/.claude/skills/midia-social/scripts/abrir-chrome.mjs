#!/usr/bin/env node
// Abre (ou reaproveita) o Chrome dedicado deste projeto, na porta propria dele, o mesmo do pacote Mercado Livre quando ele existe.
// Uso, da raiz do projeto: node .claude/skills/midia-social/scripts/abrir-chrome.mjs
import { abrirChrome, perfilDedicado } from './lib/chrome.mjs'

try {
  const r = await abrirChrome()
  if (r.jaEstavaAberto) console.log(`O Chrome dedicado ja estava aberto na porta ${r.porta}.`)
  else console.log(`Chrome dedicado aberto (processo ${r.pid}). Perfil em ${perfilDedicado()}.`)
  console.log('A coleta da /pauta le so paginas publicas do Instagram: nao precisa (e nao deve) fazer login no Instagram nessa janela.')
} catch (e) {
  console.error(e.message)
  process.exitCode = 1
}
