// Testes do --configurar da Graph API. Sem rede: fetch falso por URL.
// Rodar: node --test publish-graph-api.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { configurar, graph } = createRequire(import.meta.url)('./publish-graph-api.js')

// valores curtos de proposito: o Gate 1 do kit acusa segredo atribuido com 8 ou mais caracteres
const LONGO = 'lng77', CURTO = 'cur77', SEGREDO = 'sec77'
const ENV = { META_APP_ID: 'app1', META_APP_SECRET: SEGREDO, INSTAGRAM_TOKEN_CURTO: CURTO }

function meta(urls, { duasContas = false, paginado = false } = {}) {
  return async url => {
    const u = String(url)
    urls.push(u)
    const r = j => ({ json: async () => j })
    if (u.includes('/oauth/access_token')) return r({ access_token: LONGO })
    if (paginado && u.includes('/me/accounts?after=f2')) return r({ data: [{ id: 'pg2' }] })
    if (paginado && u.includes('/me/accounts')) return r({ data: [{ id: 'pg1' }], paging: { next: 'https://graph.facebook.com/v25.0/me/accounts?after=f2' } })
    if (u.includes('/me/accounts')) return r({ data: [{ id: 'pg1' }, { id: 'pg2' }] })
    if (u.includes('/pg1?')) return r(duasContas ? { instagram_business_account: { id: 'ig5' } } : { id: 'pg1' })
    if (u.includes('/ig5?')) return r({ username: 'pessoal' })
    if (u.includes('/pg2?')) return r({ instagram_business_account: { id: 'ig9' } })
    if (u.includes('/ig9?')) return r({ username: 'lojateste' })
    throw new Error('url inesperada')
  }
}

function pasta(env) {
  const dir = mkdtempSync(join(tmpdir(), 'graph-'))
  writeFileSync(join(dir, '.env'), env)
  return dir
}

test('--configurar grava token longo e conta no .env, apaga o token curto e nao mostra segredo', async () => {
  const dir = pasta('OUTRA=1\r\nINSTAGRAM_TOKEN_CURTO=' + CURTO + '\r\nIMGBB_API_KEY=k\r\n')
  try {
    const urls = [], log = []
    const id = await configurar({ env: ENV, fetchFn: meta(urls), envPath: join(dir, '.env'), log: m => log.push(m) })
    assert.equal(id, 'ig9')
    assert.ok(urls.length > 0, 'canario: houve chamada')
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), 'OUTRA=1\r\nIMGBB_API_KEY=k\r\nINSTAGRAM_ACCESS_TOKEN=' + LONGO + '\r\nINSTAGRAM_USER_ID=ig9\r\n')
    const saida = log.join('\n')
    assert.ok(saida.length > 0, 'canario: houve saida')
    assert.equal(saida, 'ok, conta @lojateste ligada')
    for (const s of [LONGO, CURTO, SEGREDO]) assert.ok(!saida.includes(s), 'segredo na saida')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--configurar sem a variavel usa a v25.0, e META_GRAPH_VERSAO troca a versao', async () => {
  const dir = pasta('')
  try {
    const urls = []
    await configurar({ env: ENV, fetchFn: meta(urls), envPath: join(dir, '.env'), log: () => {} })
    assert.ok(urls.length > 0)
    assert.ok(urls.every(u => u.startsWith('https://graph.facebook.com/v25.0/')))
    const urls26 = []
    await configurar({ env: { ...ENV, META_GRAPH_VERSAO: 'v26.0' }, fetchFn: meta(urls26), envPath: join(dir, '.env'), log: () => {} })
    assert.ok(urls26.length > 0 && urls26.every(u => u.startsWith('https://graph.facebook.com/v26.0/')))
    assert.equal(graph({}), 'https://graph.facebook.com/v25.0')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--configurar com duas contas no login lista as duas e nao grava; INSTAGRAM_CONTA escolhe', async () => {
  const antes = 'INSTAGRAM_TOKEN_CURTO=' + CURTO + '\n'
  const dir = pasta(antes)
  try {
    const urls = []
    await assert.rejects(configurar({ env: ENV, fetchFn: meta(urls, { duasContas: true }), envPath: join(dir, '.env'), log: () => {} }),
      /achei 2 contas do Instagram neste login: @pessoal, @lojateste\. Escreve no \.env a linha INSTAGRAM_CONTA=/)
    assert.ok(urls.some(u => u.includes('/pg2?')), 'canario: a segunda Pagina foi consultada')
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), antes)
    const id = await configurar({ env: { ...ENV, INSTAGRAM_CONTA: '@lojateste' }, fetchFn: meta([], { duasContas: true }), envPath: join(dir, '.env'), log: () => {} })
    assert.equal(id, 'ig9')
    assert.match(readFileSync(join(dir, '.env'), 'utf8'), /INSTAGRAM_USER_ID=ig9/)
    await assert.rejects(configurar({ env: { ...ENV, INSTAGRAM_CONTA: 'outra' }, fetchFn: meta([], { duasContas: true }), envPath: join(dir, '.env'), log: () => {} }),
      /a conta @outra nao esta neste login \(achei @pessoal, @lojateste\)/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--configurar segue o paging.next da lista de Paginas antes de escolher a conta', async () => {
  const antes = 'INSTAGRAM_TOKEN_CURTO=' + CURTO + '\n'
  const dir = pasta(antes)
  try {
    const urls = []
    await assert.rejects(configurar({ env: ENV, fetchFn: meta(urls, { duasContas: true, paginado: true }), envPath: join(dir, '.env'), log: () => {} }),
      /achei 2 contas do Instagram neste login: @pessoal, @lojateste/)
    assert.ok(urls.some(u => u.includes('after=f2')), 'canario: a segunda folha foi pedida')
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), antes)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--configurar sem as chaves no .env nao chama a rede', async () => {
  const urls = []
  await assert.rejects(configurar({ env: {}, fetchFn: meta(urls), envPath: 'nao-usado', log: () => {} }), /faltam no \.env: META_APP_ID, META_APP_SECRET, INSTAGRAM_TOKEN_CURTO/)
  assert.equal(urls.length, 0)
})
