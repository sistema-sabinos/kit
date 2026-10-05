// Gasto do video num lugar so. Toda cobranca vira UMA linha em dados/custos.jsonl, no
// formato do kit ({em, servico, usd, contexto}). Linha de "aberta" com custo conta em
// dobro na soma, por isso nao existe aqui. Falha ao gravar so avisa: a cobranca ja
// aconteceu e o video nao pode parar por causa do registro.
import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from '../../../mercado-livre/scripts/lib/raiz.mjs'

export function registrarCusto({ servico, usd, contexto }, { raiz = RAIZ, avisar = console.error, agora = () => new Date() } = {}) {
  const linha = { em: agora().toISOString(), servico, usd: Math.round(usd * 1e6) / 1e6, contexto }
  try {
    mkdirSync(join(raiz, 'dados'), { recursive: true })
    appendFileSync(join(raiz, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n')
    return true
  } catch (e) {
    avisar(`[custo] ${servico} cobrado (US$ ${linha.usd}) mas a linha nao foi gravada em dados/custos.jsonl; anote a mao. Motivo: ${e.message}`)
    return false
  }
}

export function estimar({ n, precoUsd, limiteUsd }) {
  const total = Math.round(n * precoUsd * 10000) / 10000
  return { total, cabe: total <= limiteUsd }
}

export function liberarGasto({ totalUsd, limiteUsd, autorizado }) {
  if (totalUsd > limiteUsd) return { codigo: 3, parou: `passa do limite_gasto_usd (US$ ${limiteUsd}); divida em partes ou suba o teto em _contexto/mercado-livre.md`, estimativa_usd: totalUsd }
  if (!autorizado) return { codigo: 3, parou: 'precisa do pode ir da pessoa (rode de novo com --autorizado depois do sim)', estimativa_usd: totalUsd }
  return { codigo: 0, estimativa_usd: totalUsd }
}

export function custoPorTokens(uso, { entradaUsdMtok, saidaUsdMtok }) {
  if (!uso) return null
  const e = (uso.promptTokenCount || 0) * entradaUsdMtok / 1e6
  const s = ((uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0)) * saidaUsdMtok / 1e6
  return Math.round((e + s) * 1e6) / 1e6
}

export function somarCustos(texto) {
  let total = 0
  for (const l of String(texto).split(/\r?\n/)) {
    try { total += JSON.parse(l).usd || 0 } catch { /* linha quebrada nao derruba a soma */ }
  }
  return Math.round(total * 1e6) / 1e6
}
