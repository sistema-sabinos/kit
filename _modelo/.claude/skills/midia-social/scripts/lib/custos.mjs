// Registro de gasto pago do pacote (hoje so o Gemini, sempre opcional).
// Toda chamada paga vira uma linha em dados/custos.jsonl, no contrato do kit ({em, servico, usd, contexto},
// mercado-livre/referencias/contratos.md, secao 8), com os tokens de brinde quando houver.
// Em dolar porque e assim que o Google cobra: reais dependeriam do cambio do dia.
// Uso: node .claude/skills/midia-social/scripts/lib/custos.mjs --servico "gemini (pauta)" --usd 0,03 [--tokens 18000] [--contexto "..."]
import { appendFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './raiz.mjs'

const numero = v => Number(String(v).replace(',', '.'))

export function registrarCusto({ servico, tokens = null, usd, contexto = '' }, { raiz = RAIZ, agora = new Date() } = {}) {
  const custo = numero(usd)
  if (!Number.isFinite(custo)) throw new Error(`usd precisa ser numero, veio "${usd}"`)
  const linha = { em: agora.toISOString(), servico, usd: custo, contexto, tokens: tokens == null ? null : numero(tokens) }
  mkdirSync(join(raiz, 'dados'), { recursive: true })
  appendFileSync(join(raiz, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n')
  return linha
}

export function argumentos(v) {
  const a = { servico: null, usd: null, tokens: null, contexto: '' }
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '--servico') a.servico = v[++i]
    else if (v[i] === '--usd') a.usd = numero(v[++i])
    else if (v[i] === '--tokens') a.tokens = numero(v[++i])
    else if (v[i] === '--contexto') a.contexto = v[++i]
  }
  if (!a.servico) throw new Error('faltou --servico')
  return a
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try { console.log('registrado:', JSON.stringify(registrarCusto(argumentos(process.argv.slice(2))))) }
  catch (e) { console.error('ERRO:', e.message); process.exit(1) }
}
