// Limpa a legenda automatica do YouTube (.vtt) e grava o texto ao lado, com o mesmo nome em .txt.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/limpar-legenda.mjs <arquivo.vtt> [<arquivo.vtt> ...]
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { limparVtt } from './lib/legenda.mjs'

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const arquivos = process.argv.slice(2)
  if (!arquivos.length) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/limpar-legenda.mjs <arquivo.vtt> [...]')
    process.exit(1)
  }
  for (const vtt of arquivos) {
    const linhas = limparVtt(readFileSync(vtt, 'utf8'))
    const txt = vtt.replace(/\.vtt$/i, '') + '.txt'
    if (!linhas.length) { console.error(`AVISO: ${vtt} sem fala nenhuma, nada gravado`); continue }
    writeFileSync(txt, linhas.join('\n') + '\n')
    console.log(`${txt}: ${linhas.length} linhas`)
  }
}
