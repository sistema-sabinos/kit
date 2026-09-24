// Coleta do Mercado Ads pela API (so leitura): as campanhas de Product Ads com as metricas da
// janela, mais o gasto e a venda dos ultimos 7 dias pra mostrar a tendencia. A escrita fica de
// fora por decisao do projeto, gate humano: todo gasto pede o "pode ir" da pessoa no painel. Se a
// escrita de campanha tambem exige selo de parceiro certificado, nao deu pra confirmar em
// 2026-09-24 (fontes cruzadas divergem e a documentacao oficial barrou o robo com 403); conferir
// na fumaca do plano D.
// Rotas, cabecalho Api-Version, parametros e nomes de metricas conferidos em 2026-09-24 por busca
// cruzada (a documentacao oficial devolveu 403 pra robo): GET /advertising/advertisers?product_id=PADS
// com Api-Version 1; GET /marketplace/advertising/<site>/advertisers/<id>/product_ads/campaigns/search
// com Api-Version 2, parametros limit, offset, date_from, date_to e metrics; ACOS segue em
// porcentagem; o painel usa ROAS objetivo (substituiu o ACOS como meta central em 15/10/2025).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'

export const PASTA_SNAPSHOTS = join(RAIZ, 'dados', 'ads', 'snapshots')
export const METRICAS = ['clicks', 'prints', 'ctr', 'cost', 'cpc', 'acos', 'roas', 'cvr', 'units_quantity', 'total_amount', 'organic_units_quantity'].join(',')

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// Dia local da pessoa (toISOString daria o dia anterior perto da meia-noite no Brasil).
export function dia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Janela [hoje - dias, hoje], limitada aos 90 dias que a API aceita.
export function janela(dias, agora = new Date()) {
  const d = Math.min(Math.max(1, Math.trunc(dias) || 1), 90)
  return { date_from: dia(new Date(agora.getTime() - d * 86400000)), date_to: dia(agora) }
}

// A API devolve ACOS em porcentagem (15.89 quer dizer 15,89%); aqui ele vira fracao (0.1589),
// que e como o freio guarda os limites. A idade da campanha e o maior entre os dias desde a
// criacao (se o objeto trouxer a data) e os snapshots anteriores mais 1. O nome do campo de data
// (date_created ou created_date) nao foi conferido ao vivo: vai pra fumaca do plano D.
export function normalizar(resultados = [], historico = {}, agora = new Date()) {
  return resultados.map(c => {
    const m = c.metrics || {}
    const id = c.id ?? c.campaign_id
    const porSnapshot = (historico[id] ?? 0) + 1
    const criada = Date.parse(c.date_created ?? c.created_date ?? '')
    const porData = Number.isFinite(criada) ? Math.floor((agora.getTime() - criada) / 86400000) : 0
    return {
      id, nome: c.name ?? c.title ?? '', status: c.status ?? '',
      clicks: num(m.clicks), prints: num(m.prints), ctr: num(m.ctr), cost: num(m.cost), cpc: num(m.cpc),
      acos: num(m.acos) / 100, roas: num(m.roas), cvr: num(m.cvr),
      conversions: num(m.units_quantity), total_amount: num(m.total_amount), organic_units: num(m.organic_units_quantity),
      orcamento: num(c.budget),
      dias_dados: Math.max(porData, porSnapshot),
    }
  })
}

export function mesclarJanelaCurta(campanhas, bruto7) {
  const por = new Map(bruto7.map(c => [c.id ?? c.campaign_id, { cost_7d: num(c.metrics?.cost), total_amount_7d: num(c.metrics?.total_amount) }]))
  return campanhas.map(c => (por.has(c.id) ? { ...c, ...por.get(c.id) } : c))
}

// Em quantos snapshots anteriores cada campanha ja apareceu: e a idade dela em dias de dado.
// Arquivo quebrado se ignora; pasta que nao existe e a primeira rodada.
export function historicoDeSnapshots(pasta = PASTA_SNAPSHOTS) {
  const h = {}
  let arquivos = []
  try { arquivos = readdirSync(pasta).filter(f => f.endsWith('.json')) } catch { return h }
  for (const f of arquivos) {
    try {
      for (const c of JSON.parse(readFileSync(join(pasta, f), 'utf8')).campanhas || []) if (c.id != null) h[c.id] = (h[c.id] ?? 0) + 1
    } catch { /* snapshot quebrado nao derruba a coleta */ }
  }
  return h
}

export async function buscarCampanhas({ get, site, anunciante, jan, apiVersion }) {
  const saida = []
  for (let offset = 0, voltas = 0; voltas < 200; voltas++) {
    const qs = new URLSearchParams({ limit: '50', offset: String(offset), date_from: jan.date_from, date_to: jan.date_to, metrics: METRICAS })
    const d = await get(`/marketplace/advertising/${site}/advertisers/${anunciante}/product_ads/campaigns/search?${qs}`, { apiVersion })
    const lote = d.results || []
    saida.push(...lote)
    offset += lote.length
    if (!lote.length || offset >= (d.paging?.total ?? offset)) break
  }
  return saida
}

export async function coletar({ get, env, dias = 30, agora = new Date(), pasta = PASTA_SNAPSHOTS, log = () => {} }) {
  const anunciante = env.ML_ADVERTISER_ID
  const site = env.ML_ADVERTISER_SITE_ID || 'MLB'
  if (!anunciante) throw new Error('falta ML_ADVERTISER_ID no .env. Rode: node .claude/skills/mercado-ads/scripts/rodar.mjs --anunciante')
  const jan = janela(dias, agora)
  let apiVersion = 2
  let bruto
  try {
    bruto = await buscarCampanhas({ get, site, anunciante, jan, apiVersion })
  } catch (e) {
    if (e.status !== 400 && e.status !== 406) throw e
    apiVersion = 1
    bruto = await buscarCampanhas({ get, site, anunciante, jan, apiVersion })
  }
  let campanhas = normalizar(bruto, historicoDeSnapshots(pasta), agora)
  if (dias > 7) {
    try { campanhas = mesclarJanelaCurta(campanhas, await buscarCampanhas({ get, site, anunciante, jan: janela(7, agora), apiVersion })) } catch (e) { log(`janela de 7 dias falhou (${e.message.slice(0, 80)}): o relatorio sai sem a tendencia`) }
  }
  const totais = campanhas.reduce((a, c) => ({ cost: a.cost + c.cost, conversions: a.conversions + c.conversions, total_amount: a.total_amount + c.total_amount }), { cost: 0, conversions: 0, total_amount: 0 })
  return { data: dia(agora), dias, anunciante, site, janela: jan, campanhas, totais, api_version: apiVersion }
}

// Setup de uma vez: o id de anunciante de Product Ads da conta.
export async function descobrirAnunciante(get) {
  const d = await get('/advertising/advertisers?product_id=PADS', { apiVersion: 1 })
  const lista = d.advertisers || []
  if (!lista.length) throw new Error('nenhum anunciante de Product Ads nesta conta. O Mercado Ads esta ativo e o aplicativo tem permissao de publicidade?')
  const a = lista.find(x => String(x.site_id).toUpperCase() === 'MLB') || lista[0]
  return { ML_ADVERTISER_ID: String(a.advertiser_id), ML_ADVERTISER_SITE_ID: String(a.site_id) }
}
