// Testes do aviso no Telegram, com a rede simulada. Rodar: node --test avisar.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { avisar, descobrirChats, caminhoPendentes, LIMITE_TEXTO } from './avisar.mjs'

const ENV = { TELEGRAM_TOKEN: 'exemplo-123', TELEGRAM_CHAT_ID: '42' }

function resposta(status, corpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo }
}

function cenario(responder) {
  const raiz = mkdtempSync(join(tmpdir(), 'avisar-'))
  const chamadas = []
  const fetch = async (url, init) => { chamadas.push({ url, init }); return responder() }
  const pendentes = () => existsSync(caminhoPendentes(raiz)) ? readFileSync(caminhoPendentes(raiz), 'utf8') : ''
  return { raiz, chamadas, fetch, pendentes, limpar: () => rmSync(raiz, { recursive: true, force: true }) }
}

test('com token e chat, manda pelo sendMessage e nao guarda nada', async () => {
  const c = cenario(() => resposta(200, { ok: true }))
  try {
    const r = await avisar('oi', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: true })
    assert.equal(c.chamadas.length, 1)
    assert.equal(c.chamadas[0].url, 'https://api.telegram.org/botexemplo-123/sendMessage')
    assert.equal(c.chamadas[0].init.method, 'POST')
    assert.deepEqual(JSON.parse(c.chamadas[0].init.body), { chat_id: '42', text: 'oi' })
    assert.equal(c.pendentes(), '')
  } finally { c.limpar() }
})

test('token recusado pelo Telegram: o aviso fica guardado com o nome do robo', async () => {
  const c = cenario(() => resposta(401, { ok: false, description: 'Unauthorized' }))
  try {
    const r = await avisar('oi', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: false })
    assert.equal(c.chamadas.length, 1)
    assert.match(c.pendentes(), /^- \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] estoque: oi\n$/)
  } finally { c.limpar() }
})

test('rede fora: o aviso fica guardado', async () => {
  const c = cenario(() => { throw new Error('fetch failed') })
  try {
    const r = await avisar('oi', { env: ENV, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: false })
    assert.match(c.pendentes(), /estoque: oi/)
  } finally { c.limpar() }
})

test('sem token no .env nem tenta a rede e guarda', async () => {
  const c = cenario(() => resposta(200, { ok: true }))
  try {
    const r = await avisar('oi', { env: {}, raiz: c.raiz, robo: 'estoque', fetch: c.fetch })
    assert.deepEqual(r, { entregue: false })
    assert.equal(c.chamadas.length, 0)
    assert.match(c.pendentes(), /estoque: oi/)
  } finally { c.limpar() }
})

test('texto longo e cortado no limite antes de sair', async () => {
  const c = cenario(() => resposta(200, { ok: true }))
  try {
    await avisar('a'.repeat(LIMITE_TEXTO + 900), { env: ENV, raiz: c.raiz, robo: 'x', fetch: c.fetch })
    assert.equal(JSON.parse(c.chamadas[0].init.body).text.length, LIMITE_TEXTO)
  } finally { c.limpar() }
})

test('aviso de varias linhas guardado vira uma linha so no arquivo', async () => {
  const c = cenario(() => resposta(500, { ok: false }))
  try {
    await avisar('linha 1\nlinha 2', { env: ENV, raiz: c.raiz, robo: 'x', fetch: c.fetch })
    const linhas = c.pendentes().split('\n').filter(Boolean)
    assert.equal(linhas.length, 1)
    assert.match(linhas[0], /x: linha 1 \/ linha 2$/)
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
