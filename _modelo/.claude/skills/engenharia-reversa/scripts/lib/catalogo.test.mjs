// Testes da escada do catalogo. Sem rede: o get e falso. Rodar: node --test catalogo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { percentil, fracaoConhecida, ofertaDaApi, listaDeVendedores, emLotes, analisarCatalogo, tirarDuplicatas } from './catalogo.mjs'

const item = (n, extra = {}) => ({ item_id: `MLB${n}`, price: n, listing_type_id: 'gold_special', official_store_id: null, shipping: { free_shipping: true, logistic_type: 'drop_off' }, ...extra })

test('percentil interpola e aceita lista de um', () => {
  assert.equal(percentil([10, 20, 30, 40, 50], 0.25), 20)
  assert.equal(percentil([10, 20], 0.5), 15)
  assert.equal(percentil([7], 0.25), 7)
  assert.equal(percentil([], 0.5), null)
})

test('fracao conta so quem respondeu o campo', () => {
  assert.deepEqual(fracaoConhecida([{ f: true }, { f: null }, { f: false }], o => o.f), { fracao: 0.5, base: 2 })
  assert.deepEqual(fracaoConhecida([{ f: null }], o => o.f), { fracao: null, base: 0 })
})

test('oferta da API: loja oficial pelo id, campo ausente vira null', () => {
  assert.deepEqual(ofertaDaApi(item(30, { official_store_id: 123 })), { item_id: 'MLB30', preco: 30, modalidade: 'gold_special', frete_gratis: true, loja_oficial: true, logistica: 'drop_off' })
  assert.deepEqual(ofertaDaApi({ item_id: 'MLB1' }), { item_id: 'MLB1', preco: null, modalidade: null, frete_gratis: null, loja_oficial: null, logistica: null })
})

test('lista de vendedores pagina de 100 em 100 ate o total', async () => {
  const pedidos = []
  const get = async caminho => {
    pedidos.push(caminho)
    const offset = Number(caminho.match(/offset=(\d+)/)[1])
    const quantos = offset === 0 ? 100 : 30
    return { paging: { total: 130 }, results: Array.from({ length: quantos }, (_, i) => item(offset + i + 1)) }
  }
  const r = await listaDeVendedores('MLB9', get)
  assert.equal(r.ofertas.length, 130)
  assert.deepEqual(pedidos, ['/products/MLB9/items?limit=100&offset=0', '/products/MLB9/items?limit=100&offset=100'])
})

test('404 vira sem dado e nao derruba; outra falha tambem', async () => {
  const e404 = Object.assign(new Error('a API recusou: 404 No winners found'), { status: 404 })
  const r = await listaDeVendedores('MLB1', async () => { throw e404 })
  assert.deepEqual(r.ofertas, [])
  assert.match(r.sem_dado, /404/)
  const r2 = await listaDeVendedores('MLB2', async () => { throw new Error('rede caiu') })
  assert.match(r2.sem_dado, /rede caiu/)
})

test('em lotes: processa tudo, na ordem, de 5 em 5', async () => {
  let simultaneos = 0
  let pico = 0
  const r = await emLotes([1, 2, 3, 4, 5, 6, 7], 5, async n => { simultaneos++; pico = Math.max(pico, simultaneos); await new Promise(res => setTimeout(res, 5)); simultaneos--; return n * 2 })
  assert.deepEqual(r, [2, 4, 6, 8, 10, 12, 14])
  assert.equal(pico, 5)
})

test('escada: piso, p25, mediana, teto, modalidades e Full', () => {
  const ofertas = [10, 20, 30, 40, 50].map(n => ofertaDaApi(item(n)))
  ofertas[0].logistica = 'fulfillment'
  ofertas[1].modalidade = 'gold_pro'
  ofertas[2].frete_gratis = null
  const e = analisarCatalogo(ofertas)
  assert.deepEqual({ v: e.vendedores, piso: e.piso, p25: e.p25, med: e.mediana, teto: e.teto, full: e.full }, { v: 5, piso: 10, p25: 20, med: 30, teto: 50, full: 1 })
  assert.deepEqual(e.modalidades, { gold_special: 4, gold_pro: 1 })
  assert.deepEqual(e.frete_gratis, { fracao: 1, base: 4 })
  assert.equal(analisarCatalogo([]).piso, null)
})

test('patrocinado que ja e vendedor de um catalogo presente sai como duplicata', () => {
  const listas = [{ id: 'MLB100', ofertas: [{ item_id: 'MLB555' }] }]
  const anuncios = [
    { id: 'MLB100', tipo: 'catalogo', patrocinado: false },
    { id: 'MLB555', tipo: null, patrocinado: true },
    { id: 'MLB556', tipo: null, patrocinado: true },
    { id: 'MLB557', tipo: 'tradicional', patrocinado: false },
  ]
  const r = tirarDuplicatas(anuncios, listas)
  assert.deepEqual(r.duplicatas, ['MLB555'])
  assert.deepEqual(r.anuncios.map(a => a.id), ['MLB100', 'MLB556', 'MLB557'])
})
