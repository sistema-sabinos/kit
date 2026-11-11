// Testes da ficha do atendimento. Sem rede: a api falsa responde por rota (molde do publicar-ml.test.mjs) e grava
// cada chamada. Cada teste monta a raiz numa pasta temporaria, apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { montarFichas, hashDaFicha, arquivoFichas, CAMPOS_FICHA } from './ficha-ml.mjs'
import { CAMPOS } from '../../auditar-conta/scripts/coletar.mjs'

function apiFalsa(rotas = {}) {
  const chamadas = []
  const get = async c => {
    chamadas.push(`GET ${c}`)
    const k = Object.keys(rotas).find(r => `GET ${c}`.startsWith(r))
    if (!k) throw new Error(`rota sem resposta no teste: ${c}`)
    const v = typeof rotas[k] === 'function' ? rotas[k](c) : rotas[k]
    if (v instanceof Error) throw v
    return v
  }
  return { chamadas, get }
}

const ITEM = (id, extra = {}) => ({ id, status: 'active', title: `Moedor ${id}`, category_id: 'MLB99', price: 84.9, last_updated: '2026-11-10T10:00:00.000Z', condition: 'new',
  attributes: [{ id: 'BRAND', name: 'Marca', value_name: 'Acme' }, { id: 'COLOR', name: 'Cor', value_name: 'Preto' }],
  sale_terms: [{ id: 'WARRANTY_TIME', name: 'Tempo de garantia', value_name: '90 dias' }], ...extra })

const ROTAS = {
  'GET /users/7/items/search': { results: ['MLB1', 'MLB2', 'MLB3', 'MLB4'] },
  'GET /items?ids=': [
    { code: 200, body: ITEM('MLB1') },
    { code: 200, body: ITEM('MLB2', { attributes: [{ id: 'COLOR', name: 'Cor', value_name: 'Preto' }] }) },
    { code: 200, body: ITEM('MLB3', { catalog_listing: true, catalog_product_id: 'MLBP9' }) },
    { code: 200, body: ITEM('MLB4', { status: 'paused' }) },
  ],
  'GET /items/MLB1/description': { plain_text: 'Moedor com 3 velocidades.' },
  'GET /items/MLB2/description': { plain_text: '' },
  'GET /items/MLB3/description': Object.assign(new Error('404'), { status: 404 }),
  'GET /products/MLBP9': { short_description: { content: 'Moedor de catalogo.' } },
  'GET /categories/MLB99/attributes': [{ id: 'BRAND', name: 'Marca', tags: { required: true } }],
}

test('ficha-ml: monta so anuncio ativo, com hash, fontes e o motivo da ficha incompleta', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ficha-ml-'))
  try {
    const api = apiFalsa(ROTAS)
    const r = await montarFichas({ get: api.get, uid: '7', raiz, dormir: async () => {} })
    assert.deepEqual(Object.keys(r.fichas).sort(), ['MLB1', 'MLB2', 'MLB3'])
    const f1 = r.fichas.MLB1
    assert.deepEqual(f1.incompleto, [])
    assert.equal(f1.last_updated, '2026-11-10T10:00:00.000Z')
    assert.equal(f1.fontes.descricao, 'Moedor com 3 velocidades.')
    assert.match(f1.fontes.atributos, /Cor: Preto/)
    assert.match(f1.fontes.condicoes, /Tempo de garantia: 90 dias/)
    assert.match(f1.fontes.anuncio, /R\$ 84,90/)
    assert.equal(f1.hash, hashDaFicha(f1))
    // sem descricao e atributo obrigatorio faltando
    assert.deepEqual(r.fichas.MLB2.incompleto, ['sem descricao', 'atributo obrigatorio faltando: Marca'])
    // catalogo: a descricao do produto vale, a falta da do item nao derruba
    assert.deepEqual(r.fichas.MLB3.incompleto, [])
    assert.equal(r.fichas.MLB3.fontes.catalogo, 'Moedor de catalogo.')
    assert.deepEqual(JSON.parse(readFileSync(arquivoFichas(raiz), 'utf8')).fichas.MLB1, f1)
    // a multiget pede last_updated e sale_terms, e o CAMPOS da auditoria fica como estava
    assert.ok(api.chamadas.some(c => c.includes(`attributes=${CAMPOS_FICHA}`)))
    assert.ok(!CAMPOS.includes('last_updated') && !CAMPOS.includes('sale_terms'))
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('ficha-ml: leitura que falhou deixa a ficha incompleta com o motivo', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ficha-ml-'))
  try {
    const rotas = { ...ROTAS, 'GET /items/MLB1/description': Object.assign(new Error('caiu'), { status: 500 }), 'GET /categories/MLB99/attributes': new Error('caiu') }
    const r = await montarFichas({ get: apiFalsa(rotas).get, uid: '7', raiz, dormir: async () => {} })
    assert.ok(r.fichas.MLB1.incompleto.includes('leitura que falhou: descricao (500)'), JSON.stringify(r.fichas.MLB1.incompleto))
    assert.ok(r.fichas.MLB1.incompleto.includes('leitura que falhou: atributos da categoria'))
    await assert.rejects(montarFichas({ get: apiFalsa(ROTAS).get, uid: '', raiz }), /ML_USER_ID/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('ficha-ml: anuncio que a multiget nao devolveu fica com ficha incompleta e o motivo', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ficha-ml-'))
  try {
    const rotas = { ...ROTAS, 'GET /users/7/items/search': { results: ['MLB1', 'MLB2'] }, 'GET /items?ids=': [{ code: 200, body: ITEM('MLB1') }, { code: 500, body: { message: 'erro' } }] }
    const r = await montarFichas({ get: apiFalsa(rotas).get, uid: '7', raiz, dormir: async () => {} })
    assert.deepEqual(r.fichas.MLB2?.incompleto, ['leitura que falhou: anuncio'])
    assert.equal(r.fichas.MLB2.hash, hashDaFicha(r.fichas.MLB2))
    assert.deepEqual(r.fichas.MLB1.incompleto, [])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})
