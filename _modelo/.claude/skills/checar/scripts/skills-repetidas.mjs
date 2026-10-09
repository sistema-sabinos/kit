#!/usr/bin/env node
// Item 4 do /checar. Rodar da raiz do projeto:
//   node .claude/skills/checar/scripts/skills-repetidas.mjs
// Imprime o nome de cada pasta de ~/.claude/skills/ que tem o mesmo nome de uma skill
// deste projeto, separados por espaco, ou "nenhuma". A pessoal roda no lugar da do
// projeto (doc de skills do Claude Code, "personal over project", conferida em 2026-10-08).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const pastas = dir => {
  try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch { return [] }
}

export function skillsRepetidas(projeto = '.', casa = homedir()) {
  const doProjeto = new Set(pastas(join(projeto, '.claude', 'skills')))
  return pastas(join(casa, '.claude', 'skills')).filter(n => doProjeto.has(n)).sort()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = skillsRepetidas()
  console.log(r.length ? r.join(' ') : 'nenhuma')
}
