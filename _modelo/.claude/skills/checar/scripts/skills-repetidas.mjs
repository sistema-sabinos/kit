#!/usr/bin/env node
// Item 4 do /checar. Rodar da raiz do projeto:
//   node .claude/skills/checar/scripts/skills-repetidas.mjs
// Imprime o nome de cada pasta de ~/.claude/skills/ que tem o mesmo nome de uma skill
// deste projeto, separados por espaco, ou "nenhuma". A pessoal roda no lugar da do
// projeto (doc de skills do Claude Code, "personal over project", conferida em 2026-10-08).
import { readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const pastas = dir => {
  try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch { return [] }
}

export function skillsRepetidas(projeto = '.', casa = homedir()) {
  const doProjeto = new Set(pastas(join(projeto, '.claude', 'skills')))
  return pastas(join(casa, '.claude', 'skills')).filter(n => doProjeto.has(n)).sort()
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  const r = skillsRepetidas()
  console.log(r.length ? r.join(' ') : 'nenhuma')
}
