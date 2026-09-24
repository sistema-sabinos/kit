// Coleta da /auditar-conta: uma foto da conta inteira do Mercado Livre pela API (so leitura).
// Todos os anuncios, visitas e vendas da janela, reputacao, campanhas de desconto e os sinais de
// qualidade que nao vem na listagem (tamanho da descricao, atributo obrigatorio faltando). Com
// Bling, o custo de cada anuncio pelo SKU. Cada foto vira dados/auditoria/snapshots/<data>.json.
// Rotas conferidas em 2026-09-24, por busca cruzada (docs oficiais devolveram 403 pra robo):
// scan/scroll, multiget de 20, visits com date_from/date_to e o time_window, orders/search com
// order.date_created.from, categories/attributes com tags.required, items/description com
// plain_text, e o termometro de reputacao (reclamacoes 2%, atrasos 10%, cancelamentos 1,5%), tudo
// batendo com o codigo. Unico ponto sem confirmacao independente: o campo short_description.content
// em /products/<id> (so achei mencao ao endpoint, nao ao formato do campo) -- conferir na fumaca do
// plano D.
import { join } from 'node:path'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'

export const PASTA_SNAPSHOTS = join(RAIZ, 'dados', 'auditoria', 'snapshots')
export const CAMPOS = ['id', 'title', 'status', 'sub_status', 'health', 'catalog_listing', 'catalog_product_id', 'listing_type_id', 'price', 'available_quantity', 'sold_quantity', 'permalink', 'category_id', 'shipping', 'pictures', 'attributes', 'seller_custom_field', 'warranty', 'condition'].join(',')

const esperar = ms => new Promise(r => setTimeout(r, ms))
export const pedacos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n))
export const dia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Todos os ids, pela busca em modo scan (a paginacao comum para em mil).
export async function idsDaConta(uid, get) {
  const ids = []
  let scroll = null
  for (let voltas = 0; voltas < 1000; voltas++) {
    const qs = new URLSearchParams({ search_type: 'scan', limit: '100' })
    if (scroll) qs.set('scroll_id', scroll)
    const d = await get(`/users/${uid}/items/search?${qs}`)
    if (d.results?.length) ids.push(...d.results)
    scroll = d.scroll_id
    if (!scroll || !d.results?.length) break
  }
  return ids
}

export async function itensDaConta(ids, get, dormir = esperar) {
  const itens = []
  for (const grupo of pedacos(ids, 20)) {
    for (const r of await get(`/items?ids=${grupo.join(',')}&attributes=${CAMPOS}`)) if (r.code === 200 && r.body) itens.push(r.body)
    await dormir(250)
  }
  return itens
}

// Visitas em lote; se o lote falha, item por item, e o que nao vem fica null (desconhecido, nunca zero).
export async function visitasDaJanela(ids, get, dias, agora = new Date(), dormir = esperar) {
  const de = dia(new Date(agora.getTime() - dias * 86400000))
  const ate = dia(agora)
  const mapa = {}
  for (const grupo of pedacos(ids, 50)) {
    try {
      const r = await get(`/items/visits?ids=${grupo.join(',')}&date_from=${de}&date_to=${ate}`)
      for (const v of Array.isArray(r) ? r : r.results || []) mapa[v.item_id || v.id] = v.total_visits ?? 0
    } catch {
      for (const id of grupo) {
        try { mapa[id] = (await get(`/items/${id}/visits/time_window?last=${dias}&unit=day`)).total_visits ?? 0 } catch { mapa[id] = null }
      }
    }
    await dormir(250)
  }
  return { mapa, janela: { de, ate, dias } }
}

export async function vendasDaJanela(uid, get, dias, agora = new Date(), dormir = esperar) {
  const de = new Date(agora.getTime() - dias * 86400000).toISOString()
  const porItem = {}
  let pedidos = 0
  for (let offset = 0, voltas = 0; voltas < 200; voltas++) {
    const d = await get(`/orders/search?seller=${uid}&order.date_created.from=${encodeURIComponent(de)}&sort=date_desc&limit=51&offset=${offset}`)
    const lote = d.results || []
    for (const o of lote) {
      if (o.status === 'cancelled') continue
      pedidos++
      for (const oi of o.order_items || []) if (oi.item?.id) porItem[oi.item.id] = (porItem[oi.item.id] || 0) + (oi.quantity || 0)
    }
    offset += 51
    if (!lote.length || offset >= (d.paging?.total || 0)) break
    await dormir(300)
  }
  return { porItem, pedidos, dias }
}

// Anuncio de catalogo nao tem descricao propria: ela mora no produto de catalogo. Ler a do item
// daria sempre zero e um falso "descricao vazia".
export async function enriquecerQualidade(itens, get, dormir = esperar) {
  const obrigatorios = new Map()
  const deCategoria = async cat => {
    if (!cat) return []
    if (!obrigatorios.has(cat)) {
      try { obrigatorios.set(cat, (await get(`/categories/${cat}/attributes`)).filter(a => a.tags?.required || a.tags?.catalog_required)) } catch { obrigatorios.set(cat, []) }
    }
    return obrigatorios.get(cat)
  }
  for (const it of itens) {
    try {
      if (it.catalog_listing && it.catalog_product_id) {
        it._descricao_len = ((await get(`/products/${it.catalog_product_id}`)).short_description?.content || '').length
        it._descricao_origem = 'catalogo'
      } else {
        const d = await get(`/items/${it.id}/description`)
        it._descricao_len = (d.plain_text || d.text || '').length
        it._descricao_origem = 'item'
      }
    } catch { it._descricao_len = null; it._descricao_origem = it.catalog_listing ? 'catalogo' : 'item' }
    const tem = new Set((it.attributes || []).filter(a => a.value_name || a.value_id).map(a => a.id))
    it._obrigatorios_faltando = (await deCategoria(it.category_id)).filter(a => !tem.has(a.id)).map(a => a.name)
    await dormir(150)
  }
}

export const skuDoItem = it => it.seller_custom_field || (it.attributes || []).find(a => a.id === 'SELLER_SKU')?.value_name || null

// Custo pelo SKU no Bling. Falha do Bling nao derruba a auditoria: ela so sai sem margem, e a
// falha conta em `erros` (separada de SKU que nao casou, pra nao parecer cadastro faltando).
const ERRO_BLING = Symbol('erro do Bling')
export async function custoDoBling(itens, req, dormir = esperar) {
  const cache = new Map()
  let casados = 0, semCusto = 0, semSku = 0, erros = 0
  for (const it of itens) {
    const sku = skuDoItem(it)
    if (!sku) { semSku++; continue }
    if (!cache.has(sku)) {
      try { cache.set(sku, (await req('GET', '/produtos', { query: { codigo: sku } }))?.data?.[0] || null) } catch { cache.set(sku, ERRO_BLING) }
      await dormir(350)
    }
    const p = cache.get(sku)
    if (p === ERRO_BLING) { erros++; continue }
    if (!p) { semSku++; continue }
    it._bling_id = p.id
    it._custo = Number(p.precoCusto) || 0
    if (it._custo > 0) casados++; else semCusto++
  }
  return { casados, semCusto, semSku, erros }
}

export async function coletar({ get, uid, dias = 30, blingReq = null, agora = new Date(), dormir = esperar, log = () => {} }) {
  if (!uid) throw new Error('falta ML_USER_ID no .env. Rode a autorizacao do Mercado Livre pelo /conectar.')
  const ids = await idsDaConta(uid, get)
  const itens = await itensDaConta(ids, get, dormir)
  log(`${itens.length} anuncios`)
  await enriquecerQualidade(itens, get, dormir)
  let bling = null
  if (blingReq) { bling = await custoDoBling(itens, blingReq, dormir); log(`Bling: ${bling.casados} com custo, ${bling.semCusto} sem custo, ${bling.semSku} sem SKU casado${bling.erros ? `, ${bling.erros} com erro do Bling (sem custo)` : ''}`) }
  const visitas = await visitasDaJanela(ids, get, dias, agora, dormir)
  const vendas = await vendasDaJanela(uid, get, dias, agora, dormir)
  const reputacao = (await get(`/users/${uid}`)).seller_reputation || null
  let promocoes
  try { promocoes = (await get(`/seller-promotions/users/${uid}?app_version=v2`)).results || [] } catch (e) { promocoes = { erro: e.message } }
  const conta = s => itens.filter(i => i.status === s).length
  return { data: dia(agora), coletado_em: agora.toISOString(), user_id: uid, janela_dias: dias, totais: { itens: itens.length, ativos: conta('active'), pausados: conta('paused'), encerrados: conta('closed') }, reputacao, promocoes, bling, visitas, vendas, itens }
}
