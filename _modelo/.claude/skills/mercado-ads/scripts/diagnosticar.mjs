// Raio-X do Mercado Ads: aplica as regras (estrategia.mjs) ao snapshot e cruza com a ata de
// decisoes, pra nao recomendar hoje o que a pessoa decidiu ontem. Devolve o relatorio em
// Markdown e a fila do que fazer. Nada aqui mexe em campanha.
import { classificarCampanha, tacos } from './estrategia.mjs'
import { decisoesVigentes, estadoDaDecisao, prazoDe } from '../../mercado-livre/scripts/lib/decisoes.mjs'

const pct = v => `${(v * 100).toFixed(1)}%`
const brl = v => `R$ ${v.toFixed(2).replace('.', ',')}`
const MARCA = { boa: 'verde', observar: 'amarela', ruim: 'vermelha' }

// ACOS dos ultimos 7 dias pela razao gasto/venda. null sem o dado; Infinity quando gastou sem vender.
export function acos7d(c) {
  if (c.cost_7d == null || c.total_amount_7d == null || c.cost_7d === 0) return null
  return c.total_amount_7d > 0 ? c.cost_7d / c.total_amount_7d : Infinity
}

export function diagnosticar(snap, freio, { decisoes = [] } = {}) {
  const hoje = snap.data
  const porAlvo = decisoesVigentes(decisoes, { escopo: 'ads' })
  const resolvidas = new Set()
  const emVigor = []
  const acoes = []
  const linhas = []
  const ativas = snap.campanhas.filter(c => String(c.status).toLowerCase() !== 'paused')
  const pausadas = snap.campanhas.length - ativas.length

  for (const c of ativas) {
    const cls = classificarCampanha({ clicks: c.clicks, cost: c.cost, conversions: c.conversions, acos: c.acos, orcamento: c.orcamento ?? 0, gasto_diario: (c.cost_7d ?? 0) / 7 }, { ...freio, dias_dados: c.dias_dados ?? 0 })
    linhas.push({ ...c, ...cls })
    const dec = porAlvo.get(String(c.id))
    if (dec) {
      resolvidas.add(String(c.id))
      const est = estadoDaDecisao(dec, { acos_7d: acos7d(c), cost_7d: c.cost_7d, total_amount_7d: c.total_amount_7d }, freio, hoje)
      // em vigor cala a recomendacao; vencida ou furada vira cobranca do combinado, nunca recomendacao crua
      if (est.estado === 'em_vigor') { emVigor.push(dec); continue }
      acoes.push({ campanhaId: c.id, nome: c.nome, acao: 'revisar', status: cls.status, motivo: est.motivo })
      continue
    }
    if (cls.acao !== 'manter' && cls.acao !== 'aprender') acoes.push({ campanhaId: c.id, nome: c.nome, acao: cls.acao, status: cls.status, motivo: cls.motivo })
  }

  // Decisao de campanha pausada ou fora do snapshot: sem metrica, so o prazo decide. Vencida volta
  // pra fila; senao a pausa decidida sumia da vista no oitavo dia sem deixar rastro.
  const noSnapshot = new Set(snap.campanhas.map(c => String(c.id)))
  for (const [k, dec] of porAlvo) {
    if (resolvidas.has(k)) continue
    const est = estadoDaDecisao(dec, {}, freio, hoje)
    if (est.estado === 'em_vigor') { emVigor.push(dec); continue }
    const onde = noSnapshot.has(k) ? 'campanha pausada.' : 'campanha fora do snapshot de hoje (excluida ou sem dado).'
    acoes.push({ campanhaId: dec.alvo.id, nome: dec.alvo.nome || k, acao: 'revisar', status: 'observar', motivo: `${onde} ${est.motivo}` })
  }

  const t = snap.totais
  const md = [`# Mercado Ads, raio-X de ${snap.data} (janela de ${snap.dias} dias)`, '']
  md.push(`Gasto ${brl(t.cost)}, vendas atribuidas ${brl(t.total_amount)}, TACOS ${pct(tacos({ cost: t.cost, totalAmount: t.total_amount }))}, ${ativas.length} campanha(s) ativa(s)${pausadas ? ` e ${pausadas} pausada(s) fora da conta` : ''}.`)
  if (freio._padrao) md.push('', '> O freio ainda esta no padrao do kit. Ajuste acos_alvo e acos_teto pela margem dos seus produtos com a /mercado-ads antes de agir sobre este relatorio.')
  md.push('', '## Campanhas')
  for (const l of linhas) {
    const a7 = acos7d(l)
    const tendencia = a7 === null ? '' : a7 === Infinity ? ' (7 dias: sem venda)' : ` (7 dias: ${pct(a7)})`
    md.push(`- **${l.nome}** (faixa ${MARCA[l.status]}): ACOS ${pct(l.acos)}${tendencia}, gasto ${brl(l.cost)}, ${l.conversions} vendas, ROAS ${l.roas.toFixed(1)}`, `  - ${l.motivo}`)
  }
  if (!linhas.length) md.push('- Nenhuma campanha ativa.')
  if (acoes.length) { md.push('', '## O que fazer (uma por vez, no painel, com o seu "pode ir")'); for (const a of acoes) md.push(`- **${a.acao.toUpperCase()}** ${a.nome}: ${a.motivo}`) }
  if (emVigor.length) {
    md.push('', '## Decisoes em vigor', 'Fora da fila porque ja foram decididas. Pra reabrir, grave uma decisao nova na ata.')
    for (const d of emVigor) md.push(`- **${d.alvo.nome || d.alvo.id}** (${String(d.ts).slice(0, 10)}): ${d.resumo}. ${prazoDe(d) ? `Reavaliar em ${prazoDe(d)}.` : 'Permanente.'}`)
  }
  return { relatorioMd: md.join('\n') + '\n', acoes, emVigor, ativas: ativas.length, pausadas }
}
