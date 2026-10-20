// Limpa a legenda automatica do YouTube (.vtt) e grava o texto ao lado, com o mesmo nome em .txt.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/limpar-legenda.mjs <arquivo.vtt> [<arquivo.vtt> ...]
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { limparVtt } from './lib/legenda.mjs'

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
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
