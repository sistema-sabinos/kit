// Testes da leitura da API do Mercado Livre. Sem rede: o fetch e falso e conta as chamadas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlDa, mlGet, API_ML } from './ml-api.mjs'

const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) })

function fetchFalso(roteiro) {
  const chamadas = []
  const fn = async (url, init) => {
    chamadas.push({ url, init })
    const passo = roteiro[Math.min(chamadas.length - 1, roteiro.length - 1)]
    if (passo instanceof Error) throw passo
    return passo
  }
  return { fn, chamadas }
}

test('urlDa completa o caminho e deixa URL inteira em paz', () => {
  assert.equal(urlDa('/users/1'), `${API_ML}/users/1`)
  assert.equal(urlDa('users/1'), `${API_ML}/users/1`)
  assert.equal(urlDa('https://outra.com/x'), 'https://outra.com/x')
})

test('mlGet manda o token e tenta de novo depois de um 429', async () => {
  const { fn, chamadas } = fetchFalso([resposta(429, {}), resposta(200, { id: 7 })])
  const dado = await mlGet('/users/7', { token: 'token-exemplo', fetchFn: fn, esperaMs: 0 })
  assert.deepEqual(dado, { id: 7 })
  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[0].init.headers.authorization, 'Bearer token-exemplo')
  assert.equal(chamadas[0].init.headers['api-version'], undefined)
})

test('mlGet tenta de novo quando a rede cai e passa o Api-Version pedido', async () => {
  const { fn, chamadas } = fetchFalso([new Error('socket hang up'), resposta(200, { ok: 1 })])
  assert.deepEqual(await mlGet('/x', { token: 'token-exemplo', fetchFn: fn, esperaMs: 0, apiVersion: 2 }), { ok: 1 })
  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[1].init.headers['api-version'], '2')
})

test('mlGet nao insiste em 404, e o erro traz o status sem a query', async () => {
  const { fn, chamadas } = fetchFalso([resposta(404, { message: 'not_found' })])
  await assert.rejects(mlGet('/items/1?access_token=token-exemplo', { token: 'token-exemplo', fetchFn: fn, esperaMs: 0 }), e => {
    assert.equal(e.status, 404)
    assert.match(e.message, /items\/1: 404/)
    assert.doesNotMatch(e.message, /access_token/)
    return true
  })
  assert.equal(chamadas.length, 1)
})

test('mlGet desiste depois das tentativas em 5xx', async () => {
  const { fn, chamadas } = fetchFalso([resposta(503, {})])
  await assert.rejects(mlGet('/x', { token: 'token-exemplo', fetchFn: fn, esperaMs: 0, tentativas: 3 }), /503/)
  assert.equal(chamadas.length, 3)
})
