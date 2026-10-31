// Casca de linha de comando do liberarGasto, pra script que nao e Node (o fiscal.py) passar pela
// mesma trava do gasto avulso antes de chamar o Gemini. Imprime UMA linha JSON no stdout
// ({codigo, parou?, reserva?, aviso?}) e sai com o codigo dela: 0 libera, 3 parou. Qualquer erro sai 3:
// sem resposta da trava, o gasto nao acontece.
// Uso: node liberar-gasto-cli.mjs --usd 0.05 [--autorizado] [--pid <pid de quem vai gastar>] [--contexto "texto"] [--raiz <pasta>]
// O pid vai na reserva: quem gasta e quem chamou (a CLI sai logo), e a reserva dele fecha pelo
// registrar-custo-cli.mjs com --reserva.
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { liberarGasto } from './orcamento.mjs'

export function lerArgumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) a[argv[i].slice(2)] = true
    else { a[argv[i].slice(2)] = v; i++ }
  }
  return a
}

export function rodar(argv) {
  const a = lerArgumentos(argv)
  const usd = Number(a.usd)
  if (!Number.isFinite(usd) || usd < 0) return { codigo: 3, parou: 'faltou --usd valido; o gasto parou antes de comecar' }
  const pid = Number(a.pid)
  const op = { contexto: typeof a.contexto === 'string' ? a.contexto : '', ...(Number.isInteger(pid) && pid > 0 ? { pid } : {}) }
  if (typeof a.raiz === 'string') op.raiz = a.raiz
  return liberarGasto({ estimativaUsd: usd, autorizado: a.autorizado === true }, op)
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  let r
  try { r = rodar(process.argv.slice(2)) } catch (e) { r = { codigo: 3, parou: `a trava de gasto falhou (${e.message}); o gasto parou antes de comecar` } }
  console.log(JSON.stringify(r))
  process.exitCode = r.codigo === 0 ? 0 : 3
}
