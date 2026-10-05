// Casca de linha de comando do registrarCusto, pra script que nao e Node (o fiscal.py)
// gravar a cobranca no mesmo dados/custos.jsonl. So avisa se a gravacao falhar: a cobranca
// ja aconteceu e quem chamou nao pode parar por causa do registro, entao sai 0 sempre.
// Uso: node registrar-custo-cli.mjs --servico X --usd 0.05 --contexto "texto" [--raiz <pasta>]
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registrarCusto } from './custos.mjs'

export function lerArgumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i]
  }
  return a
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const a = lerArgumentos(process.argv.slice(2))
  const usd = Number(a.usd)
  if (!a.servico || !Number.isFinite(usd)) {
    console.error('[custo] faltou --servico ou --usd valido; a cobranca nao foi registrada, anote a mao')
  } else {
    registrarCusto({ servico: a.servico, usd, contexto: a.contexto || '' }, a.raiz ? { raiz: a.raiz } : {})
  }
  process.exit(0)
}
