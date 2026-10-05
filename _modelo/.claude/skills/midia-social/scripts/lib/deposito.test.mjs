// Testes do deposito. Sem rede: fetch falso e leitura de arquivo injetada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { assinaturaCloudinary, subirCloudinary, subirR2, conferirUrl, subir, TETO_CLOUDINARY, tipoDoArquivo } from './deposito.mjs'

const corpo = Buffer.from('video falso')
const ler = () => corpo
const agora = new Date('2026-10-04T12:00:00Z')
const ENV_CLD = { CLOUDINARY_CLOUD_NAME: 'n', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }

test('assinatura do Cloudinary: parametros em ordem alfabetica, & entre eles, segredo no fim, SHA-1', () => {
  const esperado = createHash('sha1').update('public_id=a/b&timestamp=1759579200segredo').digest('hex')
  assert.equal(assinaturaCloudinary({ timestamp: 1759579200, public_id: 'a/b' }, 'segredo'), esperado)
})

test('subirCloudinary manda multipart assinado e devolve secure_url', async () => {
  let visto
  const fetchFn = async (url, init) => { visto = { url, form: init.body }; return { ok: true, status: 200, json: async () => ({ secure_url: 'https://res.cloudinary.com/n/video/upload/v1/sabinos/p/v.mp4' }) } }
  const url = await subirCloudinary(ENV_CLD, 'v.mp4', 'sabinos/p/v.mp4', { fetchFn, agora, ler, tamanho: () => corpo.length })
  assert.equal(url, 'https://res.cloudinary.com/n/video/upload/v1/sabinos/p/v.mp4')
  assert.equal(visto.url, 'https://api.cloudinary.com/v1_1/n/video/upload')
  assert.equal(visto.form.get('public_id'), 'sabinos/p/v')
  assert.equal(visto.form.get('api_key'), 'k')
  assert.equal(visto.form.get('timestamp'), String(agora.getTime() / 1000))
  assert.equal(visto.form.get('signature'), assinaturaCloudinary({ public_id: 'sabinos/p/v', timestamp: agora.getTime() / 1000 }, 's'))
})

test('Cloudinary recusa arquivo acima do teto antes de subir', async () => {
  let chamou = false
  await assert.rejects(subirCloudinary(ENV_CLD, 'v.mp4', 'c.mp4', { fetchFn: async () => { chamou = true }, agora, ler, tamanho: () => TETO_CLOUDINARY + 1 }), /100 MB/)
  assert.equal(chamou, false)
})

test('Cloudinary com erro devolve a mensagem dele', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid Signature' } }) })
  await assert.rejects(subirCloudinary(ENV_CLD, 'v.mp4', 'c.mp4', { fetchFn, agora, ler, tamanho: () => 1 }), /Invalid Signature/)
})

test('subirR2 faz PUT assinado no bucket e devolve a URL publica', async () => {
  let visto
  const fetchFn = async (url, init) => { visto = { url, init }; return { status: 200, text: async () => '' } }
  const env = { R2_ACCESS_KEY_ID: 'ak', R2_SECRET_ACCESS_KEY: 'sk', CLOUDFLARE_ACCOUNT_ID: 'conta', R2_BUCKET: 'balde', R2_URL_PUBLICA: 'https://pub-x.r2.dev/' }
  const url = await subirR2(env, 'v.mp4', 'sabinos/p/v 1.mp4', { fetchFn, agora, ler })
  assert.equal(url, 'https://pub-x.r2.dev/sabinos/p/v%201.mp4')
  assert.equal(visto.url, 'https://conta.r2.cloudflarestorage.com/balde/sabinos/p/v%201.mp4')
  assert.equal(visto.init.method, 'PUT')
  assert.equal(visto.init.headers['x-amz-content-sha256'], createHash('sha256').update(corpo).digest('hex'))
  assert.match(visto.init.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=ak\/20261004\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/)
})

test('subirR2 sem chave aponta o guia', async () => {
  await assert.rejects(subirR2({}, 'v.mp4', 'c', { fetchFn: async () => {}, agora, ler }), /configurar\.md/)
})

test('conferirUrl recusa http, link assinado e link com validade', () => {
  assert.equal(conferirUrl('https://a/b.mp4'), 'https://a/b.mp4')
  assert.throws(() => conferirUrl('http://a/b.mp4'), /https/)
  assert.throws(() => conferirUrl('https://a/b.mp4?X-Amz-Signature=1'), /validade/)
  assert.throws(() => conferirUrl('https://a/b.mp4?Expires=1'), /validade/)
  assert.throws(() => conferirUrl('https://a/b.mp4?token=1'), /validade/)
})

test('subir escolhe pelo config, cloudinary por padrao, e recusa deposito desconhecido', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ secure_url: 'https://res.cloudinary.com/x.png' }) })
  assert.equal(await subir({ config: {}, env: ENV_CLD }, 's.png', 'c.png', { fetchFn, agora, ler, tamanho: () => 1 }), 'https://res.cloudinary.com/x.png')
  await assert.rejects(subir({ config: { deposito: 'dropbox' }, env: ENV_CLD }, 's.png', 'c.png', { fetchFn }), /cloudinary ou r2/)
})

test('tipoDoArquivo', () => {
  assert.equal(tipoDoArquivo('a/b.MP4'), 'video')
  assert.equal(tipoDoArquivo('slide-01.png'), 'image')
})
