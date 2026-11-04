// 5.49 (bloco C, 2026-11-03): o sinal de login do paginaPedeLogin contra paginas reais do Mercado
// Livre gravadas em fixtures/ sem logar e sem digitar nada (a entrada, pra onde o ML manda quem abre a
// conta sem sessao, e o muro de verificacao que a busca mostra pra quem nao esta logado), com script,
// estilo e o token publico de origin-trial tirados. A busca real da engenharia-reversa e o canario do
// outro lado: pagina sem pedido de login.
// O Playwright vem da pasta apontada em SABINOS_PLAYWRIGHT (bancada de desenvolvimento). Sem ela, os
// testes aparecem como PULADOS no placar (nunca como verdes).
// Rodar: node --test navegador-real.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { paginaPedeLogin, sessaoCaiu } from './navegador.mjs'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const BUSCA = fileURLToPath(new URL('../../../engenharia-reversa/scripts/fixtures/busca.html', import.meta.url))

async function carregarPlaywright() {
  if (!process.env.SABINOS_PLAYWRIGHT) return null
  try { return await import(pathToFileURL(createRequire(join(process.env.SABINOS_PLAYWRIGHT, 'package.json')).resolve('playwright')).href) } catch { return null }
}

const pw = await carregarPlaywright()
const pular = pw ? false : 'sem Playwright (SABINOS_PLAYWRIGHT)'
let navegador
let pagina

before(async () => {
  if (pular) return
  navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
  pagina = await navegador.newPage()
  // as paginas gravadas apontam imagem do mlstatic; nenhum sinal precisa delas
  await pagina.route(/^https?:/, rota => rota.abort())
})
after(async () => { if (navegador) await navegador.close() })

const abrir = caminho => pagina.goto(pathToFileURL(caminho).href)

test('entrada real do ML: o campo de usuario visivel pede login', { skip: pular }, async () => {
  await abrir(join(FIXTURES, 'login-ml-2026-11-03.html'))
  assert.equal(await pagina.locator('input[name="identifier"]').count(), 1, 'canario: o campo de usuario esta no bruto')
  assert.equal(await paginaPedeLogin(pagina), true)
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login/identification', host: 'mercadolivre.com.br', pedeLogin: await paginaPedeLogin(pagina) }), 'sessao-caida')
})

test('muro real de verificacao do ML: o botao "Ja tenho conta" pede login', { skip: pular }, async () => {
  await abrir(join(FIXTURES, 'muro-ml-2026-11-03.html'))
  assert.equal(await pagina.locator('a.old-user-button').count(), 1, 'canario: o botao esta no bruto')
  assert.equal(await paginaPedeLogin(pagina), true)
})

test('busca real do ML: sem pedido de login', { skip: pular }, async () => {
  await abrir(BUSCA)
  assert.ok((await pagina.content()).length > 5000, 'canario: a busca gravada abriu')
  assert.equal(await paginaPedeLogin(pagina), false)
})
