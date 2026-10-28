#!/usr/bin/env node
// Imprime a porta do Chrome dedicado deste projeto: a do --cdp-endpoint do navegador do /conectar.
// Uso, da raiz do projeto: node .claude/skills/conectar/scripts/porta.mjs
import { portaDoProjeto } from './lib/navegador.mjs'
import { RAIZ } from './lib/raiz.mjs'

console.log(portaDoProjeto(RAIZ))
