#!/usr/bin/env node
// Item 3 do /checar. Rodar da raiz do projeto:
//   node .claude/skills/checar/scripts/gitignore.mjs
// Pergunta ao proprio git, pelo .gitignore deste projeto, se cada caminho de chave, sessao e
// peso fica fora do backup e se a memoria sobe. Imprime "ok" (saida 0), uma linha por caminho
// que furou (saida 1) ou o erro (saida 2). So nome de caminho: nunca abre arquivo, e o caminho
// nem precisa existir no disco.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FICA_FORA = ['.env', '.env.local', 'app/codigo/.env.local', '.origem', '.backup-falhou',
  '.claude/settings.local.json', 'dados/chrome-perfil/x', 'dados/sessao/x', 'storage-state.json', '.secrets/x',
  'video.mp4', 'x.zip', 'node_modules/x.js']
export const SOBE = ['_memoria/diario/2026-01-01.md', '_memoria/decisoes.md', '_contexto/agora.md',
  '.claude/skills/x/SKILL.md', '.sabinos/instalado.json', '.env.example']

// O git-dir e um repositorio vazio de fora: o .git/info/exclude do projeto fica de fora e o
// arquivo ja rastreado responde pela regra do .gitignore (o indice de fora e vazio). O .gitignore
// global da maquina fica neutro pelo -c. O que se testa e o .gitignore do projeto, que vai junto
// pro outro computador.
export function conferirGitignore(dir = '.') {
  const opcoes = { encoding: 'utf8', timeout: 30000, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } }
  const repo = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], opcoes)
  if (repo.error) return { erro: repo.error.message }
  if (repo.status !== 0) return { erro: (repo.stderr || '').trim() || 'pasta sem git' }
  const vazio = mkdtempSync(join(tmpdir(), 'checar-gitignore-'))
  let r
  try {
    if (spawnSync('git', ['init', '-q', vazio], opcoes).status !== 0) return { erro: 'nao deu pra criar o repositorio de conferencia' }
    const todos = [...FICA_FORA, ...SOBE]
    r = spawnSync('git', ['--git-dir', join(vazio, '.git'), '--work-tree', repo.stdout.trim(), '-c', 'core.excludesFile=',
      'check-ignore', '--stdin', '-z'], { ...opcoes, cwd: repo.stdout.trim(), input: todos.join('\0') + '\0' })
  } finally { rmSync(vazio, { recursive: true, force: true }) }
  if (r.error) return { erro: r.error.message }
  if (r.status !== 0 && r.status !== 1) return { erro: (r.stderr || '').trim() || `git saiu ${r.status}` }
  const ignorados = new Set(r.status === 0 ? r.stdout.split('\0').filter(Boolean) : [])
  return {
    furos: [
      ...FICA_FORA.filter(c => !ignorados.has(c)).map(c => `${c}: sobe pro backup e devia ficar fora`),
      ...SOBE.filter(c => ignorados.has(c)).map(c => `${c}: fica fora do backup e devia subir`),
    ],
  }
}

function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  const r = conferirGitignore()
  if (r.erro) { console.error(`erro: ${r.erro}`); process.exitCode = 2 }
  else if (r.furos.length) { console.log(r.furos.join('\n')); process.exitCode = 1 }
  else console.log('ok')
}
