#!/usr/bin/env node
// Cria uma pasta do projeto e abre ela no Explorer (Windows) ou no Finder (Mac) (5.54, B4). Video e foto
// entram por essa pasta: o arquivo arrastado pro chat fica numa pasta temporaria do app, fora do projeto.
// O caminho vale a partir da raiz do projeto, e o que cai fora dela (../, outro disco, atalho ou juncao que
// leva pra fora, conferidos pelo caminho real) e recusado antes de criar qualquer coisa.
// Uso, da raiz do projeto:
//   node .claude/skills/conectar/scripts/abrir-pasta.mjs producao/<slug>/bruto
// Saida: 0 pasta criada e aberta (imprime o caminho), 1 pasta fora do projeto ou uso errado (nada criado).
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'

const PROGRAMA = { win32: 'explorer.exe', darwin: 'open' }

// o explorer.exe sai 1 mesmo quando abre: o codigo nao se confere, e o processo segue sozinho
function abridorPadrao(programa, caminho) {
  const p = spawn(programa, [caminho], { detached: true, stdio: 'ignore' })
  p.on('error', () => {})
  p.unref()
}

// a pasta existente mais funda do caminho, comparada pelo caminho real com a raiz
function dentroDoProjeto(alvo, raiz) {
  let p = alvo
  while (!existsSync(p)) {
    const pai = dirname(p)
    if (pai === p) return false
    p = pai
  }
  const r = relative(realpathSync.native(raiz), realpathSync.native(p))
  return r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r)
}

export function abrirPasta(pasta, { raiz = RAIZ, plataforma = process.platform, abrir = abridorPadrao } = {}) {
  const caminho = resolve(raiz, pasta)
  if (!dentroDoProjeto(caminho, raiz)) return { ok: false, caminho }
  mkdirSync(caminho, { recursive: true })
  const programa = PROGRAMA[plataforma]
  if (programa) abrir(programa, caminho)
  return { ok: true, caminho, programa }
}

function direto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

// o que o comando faz, com o abridor injetavel: o teste da recusa nunca chega num Explorer de verdade
export function cli(args, opcoes = {}) {
  const pasta = args[0]
  if (!pasta) return { codigo: 1, texto: 'uso: abrir-pasta.mjs <pasta do projeto>, por exemplo producao/<slug>/bruto' }
  const r = abrirPasta(pasta, opcoes)
  if (!r.ok) return { codigo: 1, texto: `a pasta ${r.caminho} fica fora do projeto (${opcoes.raiz ?? RAIZ}); nada foi criado.` }
  return { codigo: 0, texto: r.programa ? `pasta aberta: ${r.caminho}` : `pasta criada: ${r.caminho} (abra pelo gerenciador de arquivos)` }
}

if (direto()) {
  const { codigo, texto } = cli(process.argv.slice(2))
  if (codigo) console.error(texto)
  else console.log(texto)
  process.exitCode = codigo
}
