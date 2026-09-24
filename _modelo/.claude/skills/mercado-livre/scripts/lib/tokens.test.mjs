// Testes do token do Mercado Livre e do Bling. Sem rede: o fetch e injetado.
// Rodar: node --test tokens.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lerEnv } from './env.mjs'
import { expirou, chavesDe, pedidoDeRefresh, patchDeToken, token, resumoDoToken, URL_TOKEN_ML, URL_TOKEN_BLING } from './tokens.mjs'

const AGORA = Date.parse('2026-09-23T12:00:00Z')

test('expirou: ISO no futuro nao, ISO no passado sim, dentro da margem sim', () => {
  assert.equal(expirou('2026-09-23T13:00:00Z', AGORA), false)
  assert.equal(expirou('2026-09-23T11:00:00Z', AGORA), true)
  assert.equal(expirou('2026-09-23T12:03:00Z', AGORA), true)
})

test('expirou aceita milissegundos numericos herdados de ferramenta antiga', () => {
  assert.equal(expirou(String(AGORA + 3_600_000), AGORA), false)
  assert.equal(expirou(String(AGORA - 1), AGORA), true)
})

test('expirou trata vazio e lixo como vencido', () => {
  assert.equal(expirou('', AGORA), true)
  assert.equal(expirou(undefined, AGORA), true)
  assert.equal(expirou('amanha', AGORA), true)
})

test('chavesDe monta os nomes das variaveis e recusa servico desconhecido', () => {
  assert.equal(chavesDe('ml').acesso, 'ML_ACCESS_TOKEN')
  assert.equal(chavesDe('bling').expira, 'BLING_TOKEN_EXPIRES_AT')
  assert.throws(() => chavesDe('shopee'), /ml ou bling/)
})

const envMl = { ML_CLIENT_ID: 'id-exemplo', ML_CLIENT_SECRET: 'segredo-exemplo', ML_REFRESH_TOKEN: 'refresh-exemplo' }
const envBling = { BLING_CLIENT_ID: 'id-exemplo', BLING_CLIENT_SECRET: 'segredo-exemplo', BLING_REFRESH_TOKEN: 'refresh-exemplo' }

test('pedidoDeRefresh do ML manda form com grant refresh_token e credenciais no corpo', () => {
  const { url, init } = pedidoDeRefresh('ml', envMl)
  assert.equal(url, URL_TOKEN_ML)
  const corpo = new URLSearchParams(init.body)
  assert.equal(corpo.get('grant_type'), 'refresh_token')
  assert.equal(corpo.get('client_id'), 'id-exemplo')
  assert.equal(corpo.get('refresh_token'), 'refresh-exemplo')
})

test('pedidoDeRefresh do Bling usa Basic auth e o cabecalho enable-jwt', () => {
  const { url, init } = pedidoDeRefresh('bling', envBling)
  assert.equal(url, URL_TOKEN_BLING)
  assert.equal(init.headers.authorization, 'Basic ' + Buffer.from('id-exemplo:segredo-exemplo').toString('base64'))
  assert.equal(init.headers['enable-jwt'], '1')
  assert.equal(new URLSearchParams(init.body).get('grant_type'), 'refresh_token')
})

test('pedidoDeRefresh sem credencial explica o que falta e como resolver', () => {
  assert.throws(() => pedidoDeRefresh('ml', {}), /ML_CLIENT_ID.*conectar/s)
})

test('patchDeToken grava a validade em ISO e mantem o refresh antigo quando a resposta nao traz outro', () => {
  const p = patchDeToken('bling', { access_token: 'acesso-exemplo', expires_in: 21600 }, AGORA)
  assert.equal(p.BLING_ACCESS_TOKEN, 'acesso-exemplo')
  assert.equal(p.BLING_TOKEN_EXPIRES_AT, '2026-09-23T18:00:00.000Z')
  assert.equal('BLING_REFRESH_TOKEN' in p, false)
  const q = patchDeToken('ml', { access_token: 'a-exemplo', refresh_token: 'r-exemplo', expires_in: 100 }, AGORA)
  assert.equal(q.ML_REFRESH_TOKEN, 'r-exemplo')
  assert.throws(() => patchDeToken('ml', {}, AGORA), /access_token/)
})

test('patchDeToken do ML grava o ML_USER_ID quando a resposta traz user_id', () => {
  const p = patchDeToken('ml', { access_token: 'a-exemplo', expires_in: 100, user_id: 123 }, AGORA)
  assert.equal(p.ML_USER_ID, '123')
  const q = patchDeToken('ml', { access_token: 'a-exemplo', expires_in: 100 }, AGORA)
  assert.equal('ML_USER_ID' in q, false)
  const b = patchDeToken('bling', { access_token: 'a-exemplo', expires_in: 100, user_id: 123 }, AGORA)
  assert.equal('ML_USER_ID' in b, false)
})

function envTemp(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), 'tok-'))
  const caminho = join(dir, '.env')
  writeFileSync(caminho, conteudo)
  return { dir, caminho }
}

function fetchFalso(respostas) {
  const chamadas = []
  const fn = async (url, init) => {
    chamadas.push({ url, init })
    const r = respostas.shift()
    return { ok: r.status === 200, status: r.status, json: async () => r.json, text: async () => r.text || '' }
  }
  fn.chamadas = chamadas
  return fn
}

test('token valido volta do .env sem chamar a rede', async () => {
  const { dir, caminho } = envTemp('ML_ACCESS_TOKEN=vivo-exemplo\nML_TOKEN_EXPIRES_AT=2026-09-23T13:00:00Z\n')
  const fetchFn = fetchFalso([])
  try {
    assert.equal(await token('ml', { caminhoEnv: caminho, fetchFn, agora: AGORA }), 'vivo-exemplo')
    assert.equal(fetchFn.chamadas.length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('token vencido renova, grava no .env e devolve o novo', async () => {
  const { dir, caminho } = envTemp('ML_CLIENT_ID=id-exemplo\nML_CLIENT_SECRET=segredo-exemplo\nML_REFRESH_TOKEN=refresh-exemplo\nML_ACCESS_TOKEN=morto-exemplo\nML_TOKEN_EXPIRES_AT=2026-09-23T11:00:00Z\n')
  const fetchFn = fetchFalso([{ status: 200, json: { access_token: 'novo-exemplo', refresh_token: 'refresh2-exemplo', expires_in: 21600 } }])
  try {
    assert.equal(await token('ml', { caminhoEnv: caminho, fetchFn, agora: AGORA }), 'novo-exemplo')
    const env = lerEnv(caminho)
    assert.equal(env.ML_ACCESS_TOKEN, 'novo-exemplo')
    assert.equal(env.ML_REFRESH_TOKEN, 'refresh2-exemplo')
    assert.equal(env.ML_TOKEN_EXPIRES_AT, '2026-09-23T18:00:00.000Z')
    assert.equal(env.ML_CLIENT_ID, 'id-exemplo')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('429 e 500 tentam de novo, 400 nao', async () => {
  const base = 'BLING_CLIENT_ID=id-exemplo\nBLING_CLIENT_SECRET=segredo-exemplo\nBLING_REFRESH_TOKEN=refresh-exemplo\n'
  const a = envTemp(base)
  const b = envTemp(base)
  try {
    const f1 = fetchFalso([{ status: 429 }, { status: 500 }, { status: 200, json: { access_token: 'ok-exemplo', expires_in: 10 } }])
    assert.equal(await token('bling', { caminhoEnv: a.caminho, fetchFn: f1, agora: AGORA, esperaMs: 0 }), 'ok-exemplo')
    assert.equal(f1.chamadas.length, 3)
    const f2 = fetchFalso([{ status: 400, text: 'invalid_grant' }])
    await assert.rejects(token('bling', { caminhoEnv: b.caminho, fetchFn: f2, agora: AGORA, esperaMs: 0 }), /autorizacao do Bling venceu.*autorizar\.mjs --bling --url/)
    assert.equal(f2.chamadas.length, 1)
  } finally {
    rmSync(a.dir, { recursive: true, force: true })
    rmSync(b.dir, { recursive: true, force: true })
  }
})

test('resumoDoToken diz a validade e nunca o token', () => {
  const env = { ML_ACCESS_TOKEN: 'acesso-exemplo', ML_TOKEN_EXPIRES_AT: '2026-09-23T18:00:00.000Z' }
  const frase = resumoDoToken('ml', env)
  assert.equal(frase, 'token do ml valido ate 2026-09-23T18:00:00.000Z')
  assert.ok(!frase.includes('acesso-exemplo'))
  assert.equal(resumoDoToken('bling', { BLING_TOKEN_EXPIRES_AT: '2026-09-24T00:00:00.000Z' }), 'token do bling valido ate 2026-09-24T00:00:00.000Z')
})

const ENV_ML_VENCIDO = 'ML_CLIENT_ID=id-exemplo\nML_CLIENT_SECRET=segredo-exemplo\nML_REFRESH_TOKEN=refresh-exemplo\nML_ACCESS_TOKEN=morto-exemplo\nML_TOKEN_EXPIRES_AT=2026-09-23T11:00:00Z\n'

test('400 no refresh depois de outro processo renovar devolve o token que ele gravou', async () => {
  const { dir, caminho } = envTemp(ENV_ML_VENCIDO)
  let chamadas = 0
  // simula o outro processo: antes do 400 chegar, o .env ja ganhou token novo e vivo
  const fetchFn = async () => {
    chamadas++
    writeFileSync(caminho, ENV_ML_VENCIDO
      .replace('ML_ACCESS_TOKEN=morto-exemplo', 'ML_ACCESS_TOKEN=do-outro-exemplo')
      .replace('ML_TOKEN_EXPIRES_AT=2026-09-23T11:00:00Z', 'ML_TOKEN_EXPIRES_AT=2026-09-23T18:00:00Z'))
    return { ok: false, status: 400, json: async () => ({}), text: async () => 'invalid_grant' }
  }
  try {
    assert.equal(await token('ml', { caminhoEnv: caminho, fetchFn, agora: AGORA, esperaMs: 0 }), 'do-outro-exemplo')
    assert.equal(chamadas, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('400 no refresh sem ninguem ter renovado explica em portugues como reautorizar', async () => {
  const { dir, caminho } = envTemp(ENV_ML_VENCIDO)
  const fetchFn = fetchFalso([{ status: 400, text: 'invalid_grant' }])
  try {
    const erro = await token('ml', { caminhoEnv: caminho, fetchFn, agora: AGORA, esperaMs: 0 }).then(() => null, e => e)
    assert.ok(erro, 'tinha que rejeitar')
    assert.match(erro.message, /autorizar\.mjs --ml --url/)
    assert.match(erro.message, /Mercado Livre/)
    assert.ok(!erro.message.includes('invalid_grant'), 'o corpo cru em ingles nao aparece pro aluno')
    assert.equal(fetchFn.chamadas.length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('excecao de rede tenta de novo', async () => {
  const base = 'BLING_CLIENT_ID=id-exemplo\nBLING_CLIENT_SECRET=segredo-exemplo\nBLING_REFRESH_TOKEN=refresh-exemplo\n'
  const { dir, caminho } = envTemp(base)
  let chamadas = 0
  const fetchFn = async () => {
    chamadas++
    if (chamadas <= 2) throw new Error('tempo esgotado')
    return { ok: true, status: 200, json: async () => ({ access_token: 'ok-exemplo', expires_in: 10 }), text: async () => '' }
  }
  try {
    assert.equal(await token('bling', { caminhoEnv: caminho, fetchFn, agora: AGORA, esperaMs: 0 }), 'ok-exemplo')
    assert.equal(chamadas, 3)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('excecao em todas as tentativas desiste com a mensagem', async () => {
  const base = 'BLING_CLIENT_ID=id-exemplo\nBLING_CLIENT_SECRET=segredo-exemplo\nBLING_REFRESH_TOKEN=refresh-exemplo\n'
  const { dir, caminho } = envTemp(base)
  let chamadas = 0
  const fetchFn = async () => { chamadas++; throw new Error('tempo esgotado') }
  try {
    await assert.rejects(token('bling', { caminhoEnv: caminho, fetchFn, agora: AGORA, esperaMs: 0 }), /tempo esgotado/)
    assert.equal(chamadas, 4)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
