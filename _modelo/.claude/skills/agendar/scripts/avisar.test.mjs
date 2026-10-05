// Testes do aviso no Telegram, com a rede simulada. Rodar: node --test avisar.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { avisar, descobrirChats, caminhoRecados, origemDoRobo, LIMITE_TEXTO } from './avisar.mjs'

const ENV = { TELEGRAM_TOKEN: 'exemplo-123', TELEGRAM_CHAT_ID: '42' }
// 2026-10-05 23:30 no fuso local: em UTC-3 ja seria dia 6, e o recado tem que sair dia 5
const NOITE = new Date(2026, 9, 5, 23, 30)

function resposta(status, corpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo }
}

function cenario(responder) {
  const raiz = mkdtempSync(join(tmpdir(), 'avisar-'))
  const chamadas = []
  const fetch = async (url, init) => { chamadas.push({ url, init }); return responder() }
  const recados = () => existsSync(caminhoRecados(raiz)) ? readdirSync(caminhoRecados(raiz)).sort() : []
  const ler = (nome) => readFileSync(join(caminhoRecados(raiz), nome), 'utf8')
  return { raiz, chamadas, fetch, recados, ler, limpar: () => rmSync(raiz, { recursive: true, force: true }) }
}

test('com token e chat, manda pelo sendMessage e nao deixa recado', async () => {
  const c = cenario(() => resposta(200, { ok: true }))
  try {
    const r = await avisar('oi', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: true })
    assert.equal(c.chamadas.length, 1)
    assert.equal(c.chamadas[0].url, 'https://api.telegram.org/botexemplo-123/sendMessage')
    assert.equal(c.chamadas[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(c.chamadas[0].init.body), { chat_id: '42', text: 'oi' })
    assert.deepEqual(c.recados(), [])
  } finally { c.limpar() }
})

test('token recusado: vira um recado assinado pelo robo, com cabecalho do contrato', async () => {
  const c = cenario(() => resposta(401, { ok: false, description: 'Unauthorized' }))
  try {
    const r = await avisar('oi', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch, agora: NOITE })
    assert.deepEqual(r, { entregue: false })
    assert.deepEqual(c.recados(), ['2026-10-05-robo-estoque-aviso-2330.md'])
    assert.equal(c.ler('2026-10-05-robo-estoque-aviso-2330.md'),
      'de: robo-estoque\nquando: 2026-10-05 23:30\nprecisa de ação: sim\n\noi\n')
    assert.equal(existsSync(join(c.raiz, 'robos', 'avisos-pendentes.md')), false)
  } finally { c.limpar() }
})

test('rede fora: vira recado', async () => {
  const c = cenario(() => { throw new Error('fetch failed') })
  try {
    const r = await avisar('oi', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: false })
    assert.equal(c.recados().length, 1)
    assert.match(c.ler(c.recados()[0]), /\n\noi\n$/)
  } finally { c.limpar() }
})

test('sem token no .env nem tenta a rede e deixa recado', async () => {
  const c = cenario(() => resposta(200, { ok: true }))
  try {
    const r = await avisar('oi', { env: {}, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: false })
    assert.equal(c.chamadas.length, 0)
    assert.equal(c.recados().length, 1)
  } finally { c.limpar() }
})

test('dois avisos no mesmo minuto viram dois recados, sem apagar o primeiro', async () => {
  const c = cenario(() => resposta(500, { ok: false }))
  try {
    await avisar('primeiro', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch, agora: NOITE })
    await avisar('segundo', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch, agora: NOITE })
    assert.deepEqual(c.recados(), ['2026-10-05-robo-estoque-aviso-2330-2.md', '2026-10-05-robo-estoque-aviso-2330.md'])
    assert.match(c.ler('2026-10-05-robo-estoque-aviso-2330.md'), /primeiro/)
    assert.match(c.ler('2026-10-05-robo-estoque-aviso-2330-2.md'), /segundo/)
  } finally { c.limpar() }
})

test('aviso de varias linhas fica inteiro no recado', async () => {
  const c = cenario(() => resposta(500, { ok: false }))
  try {
    await avisar('linha 1\nlinha 2', { env: ENV, raiz: c.raiz, robo: 'x', fetch: c.fetch })
    assert.match(c.ler(c.recados()[0]), /\n\nlinha 1\nlinha 2\n$/)
  } finally { c.limpar() }
})

test('nome de robo com acento, espaco e barra vira origem segura', () => {
  assert.equal(origemDoRobo('Estoque Baixo'), 'robo-estoque-baixo')
  assert.equal(origemDoRobo('preço/ação'), 'robo-preco-acao')
  assert.equal(origemDoRobo('../..'), 'robo-sem-nome')
})

test('recado de robo com nome estranho nasce dentro de recados/', async () => {
  const c = cenario(() => resposta(500, { ok: false }))
  try {
    await avisar('oi', { env: ENV, raiz: c.raiz, robo: '../Preço Novo', fetch: c.fetch, agora: NOITE })
    assert.deepEqual(c.recados(), ['2026-10-05-robo-preco-novo-aviso-2330.md'])
  } finally { c.limpar() }
})

test('texto longo e cortado no limite antes de sair', async () => {
  const c = cenario(() => resposta(200, { ok: true }))
  try {
    await avisar('a'.repeat(LIMITE_TEXTO + 900), { env: ENV, raiz: c.raiz, robo: 'x', fetch: c.fetch })
    assert.equal(JSON.parse(c.chamadas[0].init.body).text.length, LIMITE_TEXTO)
  } finally { c.limpar() }
})

test('descobrirChats junta as conversas sem repetir e le o nome', async () => {
  const urls = []
  const fetch = async (url) => {
    urls.push(url)
    return resposta(200, { ok: true, result: [
      { message: { chat: { id: 111, first_name: 'Ana', last_name: 'Souza' } } },
      { message: { chat: { id: 111, first_name: 'Ana', last_name: 'Souza' } } },
      { message: { chat: { id: -222, title: 'Grupo da loja' } } },
      { edited_message: { chat: { id: 333 } } },
    ] })
  }
  const chats = await descobrirChats('exemplo-123', fetch)
  assert.equal(urls[0], 'https://api.telegram.org/botexemplo-123/getUpdates')
  assert.deepEqual(chats, [{ id: '111', nome: 'Ana Souza' }, { id: '-222', nome: 'Grupo da loja' }])
})

test('descobrirChats com token recusado explica em portugues', async () => {
  const fetch = async () => resposta(401, { ok: false })
  await assert.rejects(descobrirChats('exemplo-123', fetch), /recusou o token/)
})
