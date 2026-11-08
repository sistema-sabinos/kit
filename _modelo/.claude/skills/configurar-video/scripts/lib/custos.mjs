// Gasto do video. A trava, a reserva e o registrador moram na lib comum do nucleo
// (conectar/scripts/lib/orcamento.mjs), que vale pro projeto inteiro; aqui fica o reexport
// pra quem ja importava daqui e as contas do video. Linha de "aberta" com custo conta em
// dobro na soma, por isso nao existe.
export { registrarCusto, liberarGasto, fecharReserva, avisoDaPermissao } from '../../../conectar/scripts/lib/orcamento.mjs'

export function estimar({ n, precoUsd, limiteUsd }) {
  const total = Math.round(n * precoUsd * 10000) / 10000
  return { total, cabe: total <= limiteUsd }
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
