// Testes da escrita na API do Mercado Livre. Sem rede: o fetch e falso e conta as chamadas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mlEscrever, mlSubirImagem, API_ML } from './ml-api.mjs'

const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) })

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

test('mlEscrever manda JSON com token e devolve status e dado', async () => {
  const { fn, chamadas } = fetchFalso([resposta(201, { id: 'MLB1' })])
  const r = await mlEscrever('POST', '/items', { family_name: 'X' }, { token: 'token-exemplo', fetchFn: fn })
  assert.deepEqual(r, { ok: true, status: 201, dado: { id: 'MLB1' } })
  assert.equal(chamadas[0].url, `${API_ML}/items`)
  assert.equal(chamadas[0].init.method, 'POST')
  assert.equal(chamadas[0].init.headers.authorization, 'Bearer token-exemplo')
  assert.equal(chamadas[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(chamadas[0].init.body), { family_name: 'X' })
})

test('mlEscrever devolve a recusa sem lancar e nunca tenta de novo', async () => {
  const causa = { cause: [{ type: 'error', code: 'item.family_name.length_invalid', message: 'longo' }] }
  for (const status of [400, 429, 500]) {
    const { fn, chamadas } = fetchFalso([resposta(status, causa), resposta(201, { id: 'MLB2' })])
    const r = await mlEscrever('POST', '/items', {}, { token: 't', fetchFn: fn })
    assert.equal(r.ok, false)
    assert.equal(r.status, status)
    assert.deepEqual(r.dado, causa)
    assert.equal(chamadas.length, 1, `repetiu depois de ${status}`)
  }
})

test('mlEscrever aceita 204 sem corpo', async () => {
  const { fn } = fetchFalso([resposta(204)])
  assert.deepEqual(await mlEscrever('POST', '/items/validate', {}, { token: 't', fetchFn: fn }), { ok: true, status: 204, dado: null })
})

test('mlEscrever marca semResposta quando a rede cai, e nao repete', async () => {
  const { fn, chamadas } = fetchFalso([new Error('socket hang up'), resposta(201, { id: 'MLB3' })])
  await assert.rejects(mlEscrever('POST', '/items', {}, { token: 't', fetchFn: fn }), e => e.semResposta === true && /socket hang up/.test(e.message))
  assert.equal(chamadas.length, 1)
})

test('mlSubirImagem manda o arquivo em multipart e devolve o id', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ml-img-'))
  try {
    const arquivo = join(pasta, '01-capa.jpg')
    writeFileSync(arquivo, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    const { fn, chamadas } = fetchFalso([resposta(201, { id: '123-MLB456_092026', max_size: '1200x1200' })])
    const r = await mlSubirImagem(arquivo, { token: 't', fetchFn: fn })
    assert.deepEqual(r, { id: '123-MLB456_092026' })
    assert.equal(chamadas[0].url, `${API_ML}/pictures/items/upload`)
    assert.equal(chamadas[0].init.method, 'POST')
    assert.ok(chamadas[0].init.body instanceof FormData)
    const f = chamadas[0].init.body.get('file')
    assert.ok(f, 'o campo file veio vazio')
    assert.equal(f.type, 'image/jpeg')
    assert.equal(f.name, '01-capa.jpg')
    assert.equal(f.size, 4)
    assert.ok(!('content-type' in chamadas[0].init.headers), 'multipart monta o proprio content-type')
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('mlSubirImagem recusa formato errado antes da rede e explica recusa da API', async () => {
  const { fn, chamadas } = fetchFalso([resposta(400, { message: 'invalid image' })])
  await assert.rejects(mlSubirImagem('capa.webp', { token: 't', fetchFn: fn }), /JPG ou PNG/)
  assert.equal(chamadas.length, 0)
  const pasta = mkdtempSync(join(tmpdir(), 'ml-img-'))
  try {
    const arquivo = join(pasta, 'a.png')
    writeFileSync(arquivo, Buffer.from([1, 2, 3]))
    await assert.rejects(mlSubirImagem(arquivo, { token: 't', fetchFn: fn }), /a\.png.*400.*invalid image/)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
