// Testes da coleta da conta. API do Mercado Livre e do Bling falsas, sem espera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pedacos, idsDaConta, visitasDaJanela, vendasDaJanela, enriquecerQualidade, skuDoItem, custoDoBling, coletar } from './coletar.mjs'
import { argumentos, snapshotAnterior } from './rodar.mjs'

const nada = async () => {}

test('pedacos divide a lista no tamanho pedido', () => {
  assert.deepEqual(pedacos([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(pedacos([], 20), [])
})

test('idsDaConta segue o scroll ate a lista acabar', async () => {
  const get = async c => (c.includes('scroll_id=s2') ? { results: ['c'], scroll_id: 's3' } : c.includes('scroll_id=s3') ? { results: [], scroll_id: 's4' } : { results: ['a', 'b'], scroll_id: 's2' })
  assert.deepEqual(await idsDaConta(1, get), ['a', 'b', 'c'])
})

test('visitas: lote que falha vai item por item, e o que falha de novo fica null', async () => {
  const get = async c => {
    if (c.startsWith('/items/visits')) throw new Error('500')
    if (c.includes('/b/')) throw new Error('404')
    return { total_visits: 12 }
  }
  const r = await visitasDaJanela(['a', 'b'], get, 30, new Date(2026, 8, 23, 12), nada)
  assert.deepEqual(r.mapa, { a: 12, b: null })
  assert.deepEqual(r.janela, { de: '2026-08-24', ate: '2026-09-23', dias: 30 })
})

test('vendas somam quantidade por anuncio e pulam pedido cancelado', async () => {
  const get = async () => ({ paging: { total: 3 }, results: [
    { status: 'paid', order_items: [{ item: { id: 'a' }, quantity: 2 }] },
    { status: 'cancelled', order_items: [{ item: { id: 'a' }, quantity: 9 }] },
    { status: 'paid', order_items: [{ item: { id: 'b' }, quantity: 1 }, { item: { id: 'a' }, quantity: 1 }] },
  ] })
  assert.deepEqual(await vendasDaJanela(1, get, 30, new Date(), nada), { porItem: { a: 3, b: 1 }, pedidos: 2, dias: 30 })
})

test('qualidade le a descricao do catalogo quando o anuncio e de catalogo, e aponta obrigatorio faltando', async () => {
  const get = async c => {
    if (c.startsWith('/categories/')) return [{ id: 'BRAND', name: 'Marca', tags: { required: true } }, { id: 'COLOR', name: 'Cor', tags: {} }]
    if (c.startsWith('/products/')) return { short_description: { content: 'x'.repeat(40) } }
    return { plain_text: 'y'.repeat(500) }
  }
  const itens = [{ id: 'a', category_id: 'C1', attributes: [] }, { id: 'b', category_id: 'C1', catalog_listing: true, catalog_product_id: 'P1', attributes: [{ id: 'BRAND', value_name: 'Sem marca' }] }]
  await enriquecerQualidade(itens, get, nada)
  assert.deepEqual([itens[0]._descricao_len, itens[0]._descricao_origem, itens[0]._obrigatorios_faltando], [500, 'item', ['Marca']])
  assert.deepEqual([itens[1]._descricao_len, itens[1]._descricao_origem, itens[1]._obrigatorios_faltando], [40, 'catalogo', []])
})

test('custo do Bling casa pelo SKU e conta quem ficou sem', async () => {
  assert.equal(skuDoItem({ attributes: [{ id: 'SELLER_SKU', value_name: 'LOJA-DOC-001' }] }), 'LOJA-DOC-001')
  const req = async (m, c, { query }) => ({ data: query.codigo === 'LOJA-DOC-001' ? [{ id: 5, precoCusto: '30.00' }] : query.codigo === 'LOJA-DOC-002' ? [{ id: 6, precoCusto: 0 }] : [] })
  const itens = [{ seller_custom_field: 'LOJA-DOC-001' }, { seller_custom_field: 'LOJA-DOC-002' }, { seller_custom_field: 'OUTRO' }, {}]
  assert.deepEqual(await custoDoBling(itens, req, nada), { casados: 1, semCusto: 1, semSku: 2, erros: 0 })
  assert.equal(itens[0]._custo, 30)
})

test('erro do Bling conta em erros, nao em semSku', async () => {
  const req = async (m, c, { query }) => { if (query.codigo === 'LOJA-DOC-001') throw new Error('Bling fora'); return { data: [] } }
  const itens = [{ seller_custom_field: 'LOJA-DOC-001' }, { seller_custom_field: 'LOJA-DOC-001' }, { seller_custom_field: 'OUTRO' }]
  assert.deepEqual(await custoDoBling(itens, req, nada), { casados: 0, semCusto: 0, semSku: 1, erros: 2 })
})

test('coletar exige a conta e monta os totais', async () => {
  await assert.rejects(coletar({ get: async () => ({}), uid: null }), /ML_USER_ID/)
  const get = async c => {
    if (c.includes('/items/search')) return { results: ['a', 'b'] }
    if (c.startsWith('/items?ids=')) return [{ code: 200, body: { id: 'a', status: 'active' } }, { code: 200, body: { id: 'b', status: 'paused' } }]
    if (c.startsWith('/items/visits')) return [{ item_id: 'a', total_visits: 3 }]
    if (c.startsWith('/orders/search')) return { paging: { total: 0 }, results: [] }
    if (c.startsWith('/users/')) return { seller_reputation: { level_id: '5_green' } }
    if (c.startsWith('/seller-promotions')) throw new Error('403')
    return {}
  }
  const s = await coletar({ get, uid: 1, dormir: nada, agora: new Date(2026, 8, 23, 12) })
  assert.deepEqual(s.totais, { itens: 2, ativos: 1, pausados: 1, encerrados: 0 })
  assert.equal(s.data, '2026-09-23')
  assert.match(s.promocoes.erro, /403/)
})

test('rodar: argumentos e a foto anterior de outro dia', () => {
  assert.deepEqual(argumentos([]), { dias: 30, semKeywords: false })
  assert.throws(() => argumentos(['--dias', '0']), /1 a 90/)
  const pasta = mkdtempSync(join(tmpdir(), 'aud-'))
  try {
    assert.equal(snapshotAnterior(join(pasta, 'nao-existe'), '2026-09-23'), null)
    writeFileSync(join(pasta, '2026-09-16.json'), JSON.stringify({ data: '2026-09-16' }))
    writeFileSync(join(pasta, '2026-09-23.json'), JSON.stringify({ data: '2026-09-23' }))
    assert.equal(snapshotAnterior(pasta, '2026-09-23').data, '2026-09-16')
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
