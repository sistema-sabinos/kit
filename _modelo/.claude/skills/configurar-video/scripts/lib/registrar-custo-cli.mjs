// Casca de linha de comando do registrarCusto, pra script que nao e Node (o fiscal.py)
// gravar a cobranca no mesmo dados/custos.jsonl. So avisa se a gravacao falhar: a cobranca
// ja aconteceu e quem chamou nao pode parar por causa do registro, entao sai 0 sempre.
// Uso: node registrar-custo-cli.mjs --servico X --usd 0.05 --contexto "texto" [--raiz <pasta>]
import { fileURLToPath } from 'node:url'
import { registrarCusto } from './custos.mjs'
import { realpathSync } from 'node:fs'

export function lerArgumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i]
  }
  return a
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
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
