// Testes do cliente do YouTube. Sem rede.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { urlDeAutorizacao, trocarCodigo, tokenValido, pedidosDoComando, diffDoVideo, corpoDaAtualizacao, clienteDoArquivo, clienteDoEnv, tokenDoEnv, envDoToken, erroDaGravacao } from './yt.mjs'

test('urlDeAutorizacao pede offline, consentimento e os dois escopos', () => {
  const u = new URL(urlDeAutorizacao({ clientId: 'cid', redirect: 'http://127.0.0.1:8765', estado: 'e1' }))
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(u.searchParams.get('access_type'), 'offline')
  assert.equal(u.searchParams.get('prompt'), 'consent')
  assert.match(u.searchParams.get('scope'), /youtube\.force-ssl/)
  assert.match(u.searchParams.get('scope'), /yt-analytics\.readonly/)
  assert.equal(u.searchParams.get('state'), 'e1')
})

test('trocarCodigo posta no endpoint de token e calcula o vencimento', async () => {
  let visto
  const fetchFn = async (url, init) => { visto = { url, corpo: init.body.toString() }; return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }) } }
  const t = await trocarCodigo({ cliente: { client_id: 'cid', client_secret: 'seg' }, codigo: 'c', redirect: 'http://127.0.0.1:8765' }, { fetchFn, agora: new Date('2026-10-04T12:00:00Z') })
  assert.equal(visto.url, 'https://oauth2.googleapis.com/token')
  assert.match(visto.corpo, /grant_type=authorization_code/)
  assert.equal(t.refresh_token, 'r')
  assert.equal(t.vence_em, '2026-10-04T13:00:00.000Z')
})

test('tokenValido renova quando falta menos de um minuto e mantem o refresh', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ access_token: 'novo', expires_in: 3600 }) })
  const t = await tokenValido({ access_token: 'velho', refresh_token: 'r', vence_em: '2026-10-04T12:00:30.000Z' }, { cliente: { client_id: 'c', client_secret: 's' }, fetchFn, agora: new Date('2026-10-04T12:00:00Z') })
  assert.equal(t.access_token, 'novo')
  assert.equal(t.refresh_token, 'r')
  const igual = await tokenValido({ access_token: 'ok', refresh_token: 'r', vence_em: '2026-10-04T13:00:00.000Z' }, { cliente: {}, fetchFn: async () => { throw new Error('nao devia') }, agora: new Date('2026-10-04T12:00:00Z') })
  assert.equal(igual.access_token, 'ok')
})

test('tokenValido com refresh recusado manda refazer o auth', async () => {
  const fetchFn = async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) })
  await assert.rejects(tokenValido({ access_token: 'v', refresh_token: 'r', vence_em: '2026-01-01T00:00:00Z' }, { cliente: {}, fetchFn, agora: new Date('2026-10-04T12:00:00Z') }), /auth/)
})

test('pedidosDoComando monta canal, videos, relatorio e comentarios', () => {
  assert.deepEqual(pedidosDoComando('canal', [])[0].params, { part: 'snippet,statistics', mine: 'true' })
  assert.deepEqual(pedidosDoComando('videos', ['5'])[0].params, { part: 'contentDetails', mine: 'true' })
  const [geral, top] = pedidosDoComando('relatorio', ['28'], { hoje: '2026-10-04' })
  assert.equal(geral.base, 'https://youtubeanalytics.googleapis.com/v2')
  assert.equal(geral.params.startDate, '2026-09-06')
  assert.equal(geral.params.endDate, '2026-10-04')
  assert.equal(top.params.dimensions, 'video')
  assert.equal(pedidosDoComando('comentarios', ['vid1', '20'])[0].params.videoId, 'vid1')
  assert.throws(() => pedidosDoComando('comentarios', []), /video_id/)
  assert.throws(() => pedidosDoComando('apagar', []), /comando/)
})

test('diffDoVideo mostra so o que muda', () => {
  const d = diffDoVideo({ title: 'A', description: 'x', tags: ['t'] }, { title: 'B', description: 'x' })
  assert.deepEqual(d, [{ campo: 'title', antes: 'A', depois: 'B' }])
})

test('corpoDaAtualizacao preserva categoria e o que nao mudou', () => {
  const atual = { title: 'A', description: 'x', tags: ['t'], categoryId: '22', defaultLanguage: 'pt' }
  assert.deepEqual(corpoDaAtualizacao('vid1', atual, { title: 'B' }), { id: 'vid1', snippet: { title: 'B', description: 'x', tags: ['t'], categoryId: '22', defaultLanguage: 'pt' } })
})

test('corpoDaAtualizacao leva junto os idiomas do video, que a API apagaria se faltassem', () => {
  const atual = { title: 'A', description: 'x', categoryId: '22', defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt' }
  assert.deepEqual(corpoDaAtualizacao('v', atual, { title: 'B' }).snippet, { title: 'B', description: 'x', tags: [], categoryId: '22', defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt' })
})

const QUEDA = /^a conexao caiu durante a gravacao: conferir no YouTube Studio antes de repetir$/

test('erroDaGravacao: prazo estourado (TimeoutError do AbortSignal.timeout) manda conferir no Studio', () => {
  const e = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  assert.equal(e.name, 'TimeoutError', 'canario: o DOMException nasceu com o nome certo')
  assert.match(erroDaGravacao(e).message, QUEDA)
})

test('erroDaGravacao: fetch failed manda conferir no Studio', () => {
  assert.match(erroDaGravacao(new TypeError('fetch failed')).message, QUEDA)
})

test('erroDaGravacao: erro da API volta identico', () => {
  const e = new Error('403 forbidden')
  assert.strictEqual(erroDaGravacao(e), e)
})

test('credencial do Google vai pro .env, nunca pra arquivo solto no projeto', () => {
  const patch = clienteDoArquivo({ installed: { client_id: 'cid', client_secret: 'seg' } })
  assert.deepEqual(Object.keys(patch), ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'])
  assert.deepEqual(clienteDoEnv({ YOUTUBE_CLIENT_ID: 'cid', YOUTUBE_CLIENT_SECRET: 'seg' }), { client_id: 'cid', client_secret: 'seg' })
  assert.throws(() => clienteDoEnv({}), /YouTube/)
  assert.throws(() => clienteDoArquivo({ web: {} }), /client_id/)
})

test('o login do YouTube vai e volta do .env', () => {
  const token = { access_token: 'a', refresh_token: 'r', vence_em: '2026-10-04T13:00:00.000Z' }
  assert.deepEqual(tokenDoEnv(Object.fromEntries(Object.entries(envDoToken(token)))), token)
  assert.throws(() => tokenDoEnv({}), /auth/)
})

test('videos mostra o dia de publicacao no relogio do aluno: 22h em Sao Paulo segue no mesmo dia', () => {
  const url = new URL('./yt.mjs', import.meta.url).href
  const video = { id: 'v1', snippet: { title: 'T', publishedAt: '2026-10-20T01:00:00Z' }, status: { privacyStatus: 'public' }, statistics: {} }
  const codigo = `const { linhaDoVideo } = await import(${JSON.stringify(url)}); console.log(new Date('2026-10-20T01:00:00Z').getHours() + '|' + linhaDoVideo(${JSON.stringify(video)}))`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Sao_Paulo' } })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.stdout.trim().length > 0, 'canario: a sonda respondeu')
  const [hora, linha] = r.stdout.trim().split('|')
  assert.equal(hora, '22', 'canario: o fuso de Sao Paulo pegou na sonda')
  assert.match(linha, /^\[v1\] T/)
  assert.match(linha, /  2026-10-19  privacidade: public/)
})

test('comando vazio ou inexistente lista os comandos antes de pedir login', () => {
  const script = fileURLToPath(new URL('./yt.mjs', import.meta.url))
  for (const args of [[], ['ajuda']]) {
    const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 1, `canario: yt.mjs ${args.join(' ')} rodou e recusou (${r.stderr})`)
    assert.match(r.stderr, /nao existe: auth, canal, videos, relatorio, comentarios, atualizar/)
    assert.doesNotMatch(r.stderr, /sem login/)
  }
})
