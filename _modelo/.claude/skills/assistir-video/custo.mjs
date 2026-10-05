// Custo de cada video assistido, gravado em dados/custos.jsonl no contrato do kit
// ({em, servico, usd, contexto}). A skill nao depende de outra, por isso a tabela mora aqui.
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A skill mora em <projeto>/.claude/skills/assistir-video/, tres niveis abaixo da raiz.
export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// US$ por 1 milhao de tokens, pagina oficial ai.google.dev/gemini-api/docs/pricing.
// Preco muda: conferir na pagina e trocar aqui, com a data nova. Modelo fora da tabela grava
// os tokens com usd null, e quem le confere o preco.
export const PRECOS = {
  'gemini-3.8-flash': { entrada: 0.75, saida: 3.75, promocional_ate: '2026-12-31', depois: { entrada: 1.5, saida: 7.5 }, conferido_em: '2026-10-04' },
  'gemini-3.7-flash': { entrada: 0.75, saida: 3.75, promocional_ate: '2026-12-31', depois: { entrada: 1.5, saida: 7.5 }, conferido_em: '2026-10-04' },
  'gemini-3.1-pro-preview': { entrada: 2, saida: 12, conferido_em: '2026-10-04' },
}

export function tokensDaResposta(uso = {}) {
  uso = uso || {}
  return { entrada: uso.promptTokenCount ?? 0, saida: (uso.candidatesTokenCount ?? 0) + (uso.thoughtsTokenCount ?? 0) }
}

export function linhaDeCusto({ modelo, uso, contexto, hoje, agora }) {
  const t = tokensDaResposta(uso)
  const p = PRECOS[modelo]
  const base = { em: agora, servico: 'gemini-video', modelo, tokens_entrada: t.entrada, tokens_saida: t.saida, contexto }
  if (!p) return { ...base, usd: null, nota: `modelo fora da tabela de preco (assistir-video/custo.mjs): conferir na pagina oficial do Gemini` }
  const preco = p.promocional_ate && hoje > p.promocional_ate ? p.depois : p
  return { ...base, usd: Math.round(((t.entrada * preco.entrada + t.saida * preco.saida) / 1e6) * 1e6) / 1e6 }
}

export function registrarCusto(linha, raiz = RAIZ) {
  mkdirSync(join(raiz, 'dados'), { recursive: true })
  appendFileSync(join(raiz, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n')
}
