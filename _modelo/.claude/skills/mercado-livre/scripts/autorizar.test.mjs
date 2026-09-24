// Testes da primeira autorizacao. Sem rede: o fetch e injetado; o receptor local sobe numa porta livre.
// Rodar: node --test autorizar.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lerEnv } from './lib/env.mjs'
import { URL_TOKEN_ML, URL_TOKEN_BLING } from './lib/tokens.mjs'
import { URL_AUTORIZA_ML, URL_AUTORIZA_BLING, urlDeAutorizacao, codigoDe, pedidoDeTroca, trocarCodigo, ouvirCallback } from './autorizar.mjs'

const envMl = { ML_CLIENT_ID: 'id-exemplo', ML_CLIENT_SECRET: 'segredo-exemplo', ML_REDIRECT_URI: 'http://localhost:8765/callback' }
const envBling = { BLING_CLIENT_ID: 'id-exemplo', BLING_CLIENT_SECRET: 'segredo-exemplo' }

test('urlDeAutorizacao do ML leva response_type, client_id e redirect_uri', () => {
  const u = new URL(urlDeAutorizacao('ml', envMl))
  assert.ok(u.href.startsWith(URL_AUTORIZA_ML))
  assert.equal(u.searchParams.get('response_type'), 'code')
  assert.equal(u.searchParams.get('client_id'), 'id-exemplo')
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:8765/callback')
})

test('urlDeAutorizacao do ML sem redirect explica que e a URL cadastrada no aplicativo', () => {
  assert.throws(() => urlDeAutorizacao('ml', { ML_CLIENT_ID: 'id-exemplo' }), /ML_REDIRECT_URI.*aplicativo/s)
})

test('urlDeAutorizacao do Bling leva client_id e state', () => {
  const u = new URL(urlDeAutorizacao('bling', envBling))
  assert.ok(u.href.startsWith(URL_AUTORIZA_BLING))
  assert.equal(u.searchParams.get('client_id'), 'id-exemplo')
  assert.ok(u.searchParams.get('state'))
})

test('codigoDe aceita o codigo puro ou a URL de retorno inteira', () => {
  assert.equal(codigoDe('  TG-abc  '), 'TG-abc')
  assert.equal(codigoDe('http://localhost:8765/callback?code=TG-xyz&state=1'), 'TG-xyz')
  assert.throws(() => codigoDe('http://localhost:8765/callback?erro=1'), /parametro code/)
  assert.throws(() => codigoDe(''), /codigo/)
})

test('pedidoDeTroca do ML manda grant authorization_code com o code e o redirect', () => {
  const { url, init } = pedidoDeTroca('ml', 'TG-1', envMl)
  assert.equal(url, URL_TOKEN_ML)
  const corpo = new URLSearchParams(init.body)
  assert.equal(corpo.get('grant_type'), 'authorization_code')
  assert.equal(corpo.get('code'), 'TG-1')
  assert.equal(corpo.get('redirect_uri'), envMl.ML_REDIRECT_URI)
})

test('pedidoDeTroca do Bling usa Basic auth', () => {
  const { url, init } = pedidoDeTroca('bling', 'C-1', envBling)
  assert.equal(url, URL_TOKEN_BLING)
  assert.equal(init.headers.authorization, 'Basic ' + Buffer.from('id-exemplo:segredo-exemplo').toString('base64'))
  assert.equal(new URLSearchParams(init.body).get('code'), 'C-1')
})

test('trocarCodigo grava os tokens no .env e devolve o patch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aut-'))
  const caminho = join(dir, '.env')
  try {
    writeFileSync(caminho, 'ML_CLIENT_ID=id-exemplo\nML_CLIENT_SECRET=segredo-exemplo\nML_REDIRECT_URI=http://localhost:8765/callback\n')
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'a-exemplo', refresh_token: 'r-exemplo', expires_in: 100 }), text: async () => '' })
    const p = await trocarCodigo('ml', 'TG-1', { caminhoEnv: caminho, fetchFn, agora: Date.parse('2026-09-23T12:00:00Z') })
    assert.equal(p.ML_ACCESS_TOKEN, 'a-exemplo')
    const env = lerEnv(caminho)
    assert.equal(env.ML_REFRESH_TOKEN, 'r-exemplo')
    assert.equal(env.ML_TOKEN_EXPIRES_AT, '2026-09-23T12:01:40.000Z')
    assert.equal(env.ML_CLIENT_ID, 'id-exemplo')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('trocarCodigo com resposta ruim mostra status e corpo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aut-'))
  const caminho = join(dir, '.env')
  try {
    writeFileSync(caminho, 'BLING_CLIENT_ID=id-exemplo\nBLING_CLIENT_SECRET=segredo-exemplo\n')
    const fetchFn = async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => 'invalid_grant' })
    await assert.rejects(trocarCodigo('bling', 'C-1', { caminhoEnv: caminho, fetchFn }), /400 invalid_grant/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('ouvirCallback recebe o code numa porta livre, responde a pagina e fecha', async () => {
  let recebido = null
  const servidor = ouvirCallback({ porta: 0, aoReceber: c => { recebido = c } })
  await new Promise(r => servidor.once('listening', r))
  const porta = servidor.address().port
  try {
    assert.equal(servidor.address().address, '127.0.0.1', 'o receptor so escuta na propria maquina')
    const r = await fetch(`http://127.0.0.1:${porta}/callback?code=TG-9&state=1`)
    assert.equal(r.status, 200)
    assert.match(await r.text(), /Codigo recebido/)
    assert.equal(recebido, 'TG-9')
    await new Promise(r => servidor.once('close', r))
  } finally { if (servidor.listening) servidor.close() }
})

test('ouvirCallback trata a recusa no site: responde, fecha e chama aoErro', async () => {
  let recebido = null
  let servidor
  try {
    const erro = await new Promise((resolve, reject) => {
      servidor = ouvirCallback({ porta: 0, aoReceber: c => { recebido = c }, aoErro: e => resolve(e) })
      servidor.once('listening', () => {
        fetch(`http://127.0.0.1:${servidor.address().port}/callback?error=access_denied`)
          .then(async r => { assert.equal(r.status, 200); assert.match(await r.text(), /Autorizacao recusada/) })
          .catch(reject)
      })
    })
    assert.match(erro.message, /recusada/)
    assert.match(erro.message, /access_denied/)
    assert.equal(recebido, null)
    if (servidor.listening) await new Promise(r => servidor.once('close', r))
    assert.equal(servidor.listening, false, 'o servidor fecha depois da recusa')
  } finally { if (servidor && servidor.listening) servidor.close() }
})

test('ouvirCallback devolve 404 fora do /callback e nao chama aoReceber', async () => {
  let chamou = false
  const servidor = ouvirCallback({ porta: 0, aoReceber: () => { chamou = true } })
  await new Promise(r => servidor.once('listening', r))
  try {
    const r = await fetch(`http://127.0.0.1:${servidor.address().port}/outro?code=x`)
    assert.equal(r.status, 404)
    await r.text()
    assert.equal(chamou, false)
    assert.equal(servidor.listening, true, 'caminho errado nao derruba o receptor')
  } finally { if (servidor.listening) servidor.close() }
})

test('ouvirCallback avisa erro em vez de derrubar quando a porta ja esta em uso', async () => {
  const ocupado = createServer(() => {})
  ocupado.listen(0, '127.0.0.1')
  await new Promise(r => ocupado.once('listening', r))
  const porta = ocupado.address().port
  let servidor
  try {
    const erro = await new Promise(resolve => {
      servidor = ouvirCallback({ porta, aoReceber: () => {}, aoErro: e => resolve(e) })
    })
    assert.equal(erro.code, 'EADDRINUSE')
  } finally {
    if (ocupado.listening) ocupado.close()
    if (servidor && servidor.listening) servidor.close()
  }
})
