// Testes do adaptador do Buffer. Sem rede: fetch falso que guarda o que recebeu.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inputDoPost, criarPost, apagarPost, organizacoes, canais, pendentesPorCanal, consultarPost, acharPost, ErroIncerto } from './agendador-buffer.mjs'

const resposta = data => async (url, init) => { resposta.ultimo = { url, init, corpo: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ data }) } }

test('inputDoPost de video leva url, capa em ms e agenda em horario fixo', () => {
  const i = inputDoPost({ channelId: 'canal-ig-1', text: 'oi', dueAt: '2026-10-10T14:30:00.000Z', metadata: { instagram: { type: 'reel', shouldShareToFeed: true } }, videoUrl: 'https://x/v.mp4', capaMs: 2500 })
  assert.deepEqual(i.assets, [{ video: { url: 'https://x/v.mp4', metadata: { thumbnailOffset: 2500 } } }])
  assert.equal(i.mode, 'customScheduled')
  assert.equal(i.schedulingType, 'automatic')
  assert.equal(i.dueAt, '2026-10-10T14:30:00.000Z')
})

test('inputDoPost sem capa nao manda metadata no video, e carrossel vira lista de imagens na ordem', () => {
  assert.deepEqual(inputDoPost({ channelId: 'c', text: '', dueAt: 'd', metadata: {}, videoUrl: 'u' }).assets, [{ video: { url: 'u' } }])
  assert.deepEqual(inputDoPost({ channelId: 'c', text: '', dueAt: 'd', metadata: {}, imagensUrls: ['a', 'b'] }).assets, [{ image: { url: 'a' } }, { image: { url: 'b' } }])
})

test('criarPost manda Bearer e devolve o post', async () => {
  const f = resposta({ createPost: { post: { id: 'p1', dueAt: 'd', status: 'scheduled' } } })
  const r = await criarPost('chave', { channelId: 'c', text: 't', dueAt: 'd', metadata: {}, videoUrl: 'u' }, { fetchFn: f })
  assert.deepEqual(r, { id: 'p1', dueAt: 'd', status: 'scheduled' })
  assert.equal(resposta.ultimo.url, 'https://api.buffer.com')
  assert.equal(resposta.ultimo.init.headers.Authorization, 'Bearer chave')
})

test('criarPost com recusa do Buffer lanca a mensagem dele', async () => {
  await assert.rejects(criarPost('k', { channelId: 'c', text: 't', dueAt: 'd', metadata: {}, videoUrl: 'u' }, { fetchFn: resposta({ createPost: { message: 'limit reached' } }) }), /recusou: limit reached/)
})

test('erro de GraphQL vira Error com as mensagens', async () => {
  const f = async () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: 'bad' }] }) })
  await assert.rejects(organizacoes('k', { fetchFn: f }), /Buffer: bad/)
})

test('rede caindo no criarPost vira ErroIncerto, porque o post pode ter entrado', async () => {
  const f = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(criarPost('k', { channelId: 'c', text: 't', dueAt: 'd', metadata: {}, videoUrl: 'u' }, { fetchFn: f }), e => e instanceof ErroIncerto && /conferir/.test(e.message))
})

test('HTTP 5xx no criarPost tambem e incerto', async () => {
  const f = async () => ({ ok: false, status: 502, json: async () => { throw new Error('html') } })
  await assert.rejects(criarPost('k', { channelId: 'c', text: 't', dueAt: 'd', metadata: {}, videoUrl: 'u' }, { fetchFn: f }), ErroIncerto)
})

test('apagarPost confere o id devolvido', async () => {
  await apagarPost('k', 'p1', { fetchFn: resposta({ deletePost: { id: 'p1' } }) })
  await assert.rejects(apagarPost('k', 'p1', { fetchFn: resposta({ deletePost: { message: 'not found' } }) }), /nao apagou p1: not found/)
})

test('organizacoes e canais', async () => {
  assert.deepEqual(await organizacoes('k', { fetchFn: resposta({ account: { organizations: [{ id: 'org-1', name: 'Loja' }] } }) }), [{ id: 'org-1', name: 'Loja' }])
  const lista = [{ id: 'canal-ig-1', service: 'instagram', name: 'lojateste', isDisconnected: false }]
  assert.deepEqual(await canais('k', 'org-1', { fetchFn: resposta({ channels: lista }) }), lista)
  assert.deepEqual(resposta.ultimo.corpo.variables, { input: { organizationId: 'org-1' } })
})

test('pendentesPorCanal conta os agendados de cada canal, inclusive zero', async () => {
  const edges = [{ node: { channelId: 'a' } }, { node: { channelId: 'a' } }, { node: { channelId: 'b' } }]
  const r = await pendentesPorCanal('k', 'org-1', ['a', 'b', 'c'], { fetchFn: resposta({ posts: { edges, pageInfo: { hasNextPage: false } } }) })
  assert.deepEqual(r, { a: 2, b: 1, c: 0 })
  assert.deepEqual(resposta.ultimo.corpo.variables.input.filter, { channelIds: ['a', 'b', 'c'], status: ['scheduled'] })
})

test('consultarPost devolve status e link publicado', async () => {
  const p = { id: 'p1', status: 'sent', externalLink: 'https://www.instagram.com/reel/abc/', dueAt: 'd', sentAt: 's' }
  assert.deepEqual(await consultarPost('k', 'p1', { fetchFn: resposta({ post: p }) }), p)
})

test('rede caindo no apagarPost avisa pra conferir se apagou, sem falar em post que entrou', async () => {
  const f = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(apagarPost('k', 'p1', { fetchFn: f }), e => e instanceof ErroIncerto && /apagou/.test(e.message) && !/pode ter entrado/.test(e.message))
})

test('resposta que cai no meio da leitura depois de um envio tambem e incerta', async () => {
  const f = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } })
  await assert.rejects(criarPost('k', { channelId: 'c', text: 't', dueAt: 'd', metadata: {}, videoUrl: 'u' }, { fetchFn: f }), ErroIncerto)
})

test('acharPost procura o agendado do canal naquele horario exato', async () => {
  const f = resposta({ posts: { edges: [{ node: { id: 'p7', channelId: 'c', dueAt: '2026-10-10T14:30:00.000Z' } }], pageInfo: { hasNextPage: false } } })
  assert.equal(await acharPost('k', 'org-1', 'c', '2026-10-10T14:30:00.000Z', { fetchFn: f }), 'p7')
  assert.deepEqual(resposta.ultimo.corpo.variables.input.filter, { channelIds: ['c'], status: ['scheduled'], dueAt: { start: '2026-10-10T14:30:00.000Z', end: '2026-10-10T14:30:00.000Z' } })
  assert.equal(await acharPost('k', 'org-1', 'c', 'd', { fetchFn: resposta({ posts: { edges: [], pageInfo: { hasNextPage: false } } }) }), null)
})
