// Testes das partes puras das cascas da coleta. Sem Chrome e sem rede; o --help roda de verdade.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { opcoes, lista, exigirFfmpeg } from './lib/pagina.mjs'
import { tagDeEncode, escolherFaixas } from './coletar.mjs'
import { juntarLevas } from './refiltrar.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const efg = tag => 'https://cdn/x.mp4?efg=' + encodeURIComponent(Buffer.from(JSON.stringify({ vencode_tag: tag })).toString('base64'))

test('opcoes separa --nome valor, bandeira sozinha e argumento solto', () => {
  assert.deepEqual(opcoes(['--dias', '7', '--help', 'a', '--tag', 'x']), { _: ['a'], dias: '7', help: true, tag: 'x' })
})

test('lista tira espaco e arroba', () => {
  assert.deepEqual(lista(' @a, b ,,c'), ['a', 'b', 'c'])
  assert.deepEqual(lista(true), [])
})

test('exigirFfmpeg acusa quando o programa nao existe', () => {
  assert.throws(() => exigirFfmpeg(() => ({ error: new Error('ENOENT') })), /ffmpeg nao encontrado/)
  assert.doesNotThrow(() => exigirFfmpeg(() => ({ status: 0 })))
})

test('escolherFaixas pega a melhor resolucao e separa o audio', () => {
  const urls = [efg('dash_360p_video'), efg('dash_audio'), efg('dash_1080p_video'), 'https://cdn/sem-tag.mp4']
  assert.equal(tagDeEncode(urls[1]), 'dash_audio')
  assert.equal(tagDeEncode('https://cdn/sem-tag.mp4'), '')
  const r = escolherFaixas(urls)
  assert.equal(r.video, urls[2])
  assert.equal(r.audio, urls[1])
  assert.deepEqual(escolherFaixas(['https://cdn/a.mp4']), { video: 'https://cdn/a.mp4', audio: null })
})

test('juntarLevas deixa cada perfil uma vez so', () => {
  const r = juntarLevas([{ perfis: [{ user: 'a', posts: [] }, { user: 'b', posts: [] }] }, { perfis: [{ user: 'a', posts: [1] }] }])
  assert.deepEqual(r.map(p => p.user), ['a', 'b'])
  assert.deepEqual(r[0].posts, [])
})

test('cada casca responde ao --help sem abrir Chrome', () => {
  for (const s of ['coletar.mjs', 'garimpo.mjs', 'refiltrar.mjs', 'frequencia.mjs']) {
    const r = spawnSync(process.execPath, [join(AQUI, s), '--help'], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${s}: ${r.stderr}`)
    assert.match(r.stdout, /uso:/, s)
  }
})
