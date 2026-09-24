// Testes do cliente do Bling. Sem rede: fetch falso que responde por roteiro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarUrl, clienteBling, API_BLING } from './bling-api.mjs'

const resposta = (status, corpo, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: k => headers[k.toLowerCase()] ?? null },
  text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)),
})

function fetchFalso(roteiro) {
  const chamadas = []
  const fn = async (url, init) => { chamadas.push({ url, init }); return roteiro[Math.min(chamadas.length - 1, roteiro.length - 1)] }
  return { fn, chamadas }
}

test('montarUrl pula filtro vazio e repete chave de lista', () => {
  assert.equal(montarUrl('/produtos', { pesquisa: 'LOJA-DOC-', pagina: 1, vazio: '', nada: null }), `${API_BLING}/produtos?pesquisa=LOJA-DOC-&pagina=1`)
  assert.equal(montarUrl('depositos'), `${API_BLING}/depositos`)
  assert.equal(montarUrl('/x', { ids: [1, 2] }), `${API_BLING}/x?ids=1&ids=2`)
})

test('req manda corpo em JSON e devolve a resposta lida', async () => {
  const { fn, chamadas } = fetchFalso([resposta(201, { data: { id: 55 } })])
  const req = clienteBling({ token: 'token-exemplo', fetchFn: fn })
  assert.deepEqual(await req('POST', '/produtos', { corpo: { nome: 'x' } }), { data: { id: 55 } })
  assert.equal(chamadas[0].init.method, 'POST')
  assert.equal(chamadas[0].init.body, '{"nome":"x"}')
  assert.equal(chamadas[0].init.headers['content-type'], 'application/json')
  assert.equal(chamadas[0].init.headers.authorization, 'Bearer token-exemplo')
})

test('req espera e repete no 429, e resposta sem corpo vira null', async () => {
  const { fn, chamadas } = fetchFalso([resposta(429, {}, { 'retry-after': '0' }), resposta(204)])
  const req = clienteBling({ token: 'token-exemplo', fetchFn: fn, esperaMs: 0 })
  assert.equal(await req('PATCH', '/produtos/1', { corpo: { condicao: 1 } }), null)
  assert.equal(chamadas.length, 2)
})

test('req sobe o erro com a mensagem original do Bling', async () => {
  const erroBling = { error: { type: 'VALIDATION_ERROR', description: 'O codigo ja foi cadastrado' } }
  const { fn } = fetchFalso([resposta(400, erroBling)])
  const req = clienteBling({ token: 'token-exemplo', fetchFn: fn })
  await assert.rejects(req('POST', '/produtos', { corpo: {} }), e => {
    assert.equal(e.status, 400)
    assert.match(e.message, /ja foi cadastrado/)
    assert.deepEqual(e.resposta, erroBling)
    return true
  })
})
