// Registro de gasto pago do pacote (hoje so o Gemini, sempre opcional).
// Toda chamada paga vira uma linha em dados/custos.jsonl, o mesmo formato que o aluno ja ve no resto do kit.
// Uso: node .claude/skills/midia-social/scripts/lib/custos.mjs --servico "gemini (pauta)" --reais 0,30 [--tokens 18000] [--nota "..."]
import { appendFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './raiz.mjs'

const numero = v => Number(String(v).replace(',', '.'))

export function registrarCusto({ servico, tokens = null, reais, nota = '' }, { raiz = RAIZ, agora = new Date() } = {}) {
  const custo = numero(reais)
  if (!Number.isFinite(custo)) throw new Error(`reais precisa ser numero, veio "${reais}"`)
  const data = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const linha = { data, servico, tokens: tokens == null ? null : numero(tokens), custo_reais: custo, nota }
  mkdirSync(join(raiz, 'dados'), { recursive: true })
  appendFileSync(join(raiz, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n')
  return linha
}

export function argumentos(v) {
  const a = { servico: null, reais: null, tokens: null, nota: '' }
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '--servico') a.servico = v[++i]
    else if (v[i] === '--reais') a.reais = numero(v[++i])
    else if (v[i] === '--tokens') a.tokens = numero(v[++i])
    else if (v[i] === '--nota') a.nota = v[++i]
  }
  if (!a.servico) throw new Error('faltou --servico')
  return a
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try { console.log('registrado:', JSON.stringify(registrarCusto(argumentos(process.argv.slice(2))))) }
  catch (e) { console.error('ERRO:', e.message); process.exit(1) }
}
