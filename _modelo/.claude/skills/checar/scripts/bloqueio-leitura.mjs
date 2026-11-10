#!/usr/bin/env node
// Item 9 do /checar (5.54, B3). Rodar da raiz do projeto:
//   node .claude/skills/checar/scripts/bloqueio-leitura.mjs ler
//   node .claude/skills/checar/scripts/bloqueio-leitura.mjs tirar
// Procura permissions.blockReadsOutsideWorkingDirectories no ~/.claude/settings.json do usuario e no
// .claude/settings.json e .claude/settings.local.json do projeto. Com ela ligada, a leitura da pasta-mae
// (o _modelo, a _ferramentas) trava em todo projeto e em todo modo. O `ler` imprime o caminho de cada
// arquivo que tem a chave com true (com false nada trava), ou "nada"; o `tirar` (so com o sim da pessoa) tira a chave preservando o
// resto do JSON e imprime o caminho de cada arquivo que mudou, ou "nada".
// Saida: 0 feito, 1 uso errado, 2 arquivo JSON quebrado (nada gravado em arquivo nenhum).
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHAVE = 'blockReadsOutsideWorkingDirectories'

class Quebrado extends Error {}

const semBom = s => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s

export const arquivos = (projeto = process.cwd(), casa = homedir()) => [
  join(casa, '.claude', 'settings.json'),
  join(projeto, '.claude', 'settings.json'),
  join(projeto, '.claude', 'settings.local.json'),
]

// le os tres antes de gravar qualquer um: um quebrado para tudo
function comChave(projeto, casa) {
  const achados = []
  for (const arq of arquivos(projeto, casa)) {
    if (!existsSync(arq)) continue
    const texto = readFileSync(arq, 'utf8')
    let j
    try { j = JSON.parse(semBom(texto)) } catch { throw new Quebrado(arq) }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Quebrado(arq)
    const p = j.permissions
    // so o true trava: com false a leitura de fora fica liberada e nao ha o que tirar
    if (p && typeof p === 'object' && p[CHAVE] === true) achados.push({ arq, texto, j })
  }
  return achados
}

export const ler = (projeto, casa) => comChave(projeto, casa).map(a => a.arq)

export function tirar(projeto, casa) {
  const achados = comChave(projeto, casa)
  for (const { arq, texto, j } of achados) {
    delete j.permissions[CHAVE]
    const fim = texto.includes('\r\n') ? '\r\n' : '\n'
    writeFileSync(arq, JSON.stringify(j, null, 2).split('\n').join(fim) + fim)
  }
  return achados.map(a => a.arq)
}

function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  const comando = process.argv[2]
  if (comando !== 'ler' && comando !== 'tirar') {
    console.error('uso: bloqueio-leitura.mjs ler|tirar')
    process.exit(1)
  }
  try {
    const r = comando === 'ler' ? ler() : tirar()
    console.log(r.length ? r.join('\n') : 'nada')
  } catch (e) {
    if (!(e instanceof Quebrado)) throw e
    console.error(`o arquivo ${e.message} nao e um JSON valido; nada foi gravado. Conserte o arquivo (ou peca ajuda) e rode de novo.`)
    process.exit(2)
  }
}
