// Testes do ver-video.mjs sem rede: o fetch e o https.request viram falsos num modulo
// carregado antes do script (--import), e cada chamada fica anotada num arquivo.
// Rodar: node --test ver-video.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./ver-video.mjs', import.meta.url))

// falso: upload aceita, o estado do arquivo vem de ESTADO, a chamada de analise cai na rede
const FALSO = `
import fs from 'node:fs'
import https from 'node:https'
import { EventEmitter } from 'node:events'
const anotar = (l) => fs.appendFileSync(process.env.LOG_FALSO, l + String.fromCharCode(10))
const resposta = (corpo, cabecalhos = {}) => ({ status: 200, ok: true, headers: new Headers(cabecalhos), json: async () => corpo, text: async () => JSON.stringify(corpo) })
globalThis.fetch = async (url, op = {}) => {
  const u = String(url)
  anotar((op.method || 'GET') + ' ' + u.split('?')[0])
  if (op.method === 'DELETE') return resposta({})
  if (u.includes('/upload/')) return resposta({}, { 'x-goog-upload-url': 'https://falso.invalido/subir' })
  if (u.startsWith('https://falso.invalido/subir')) return resposta({ file: { name: 'files/abc' } })
  return resposta({ state: process.env.ESTADO, uri: 'https://falso.invalido/files/abc', name: 'files/abc', mimeType: 'video/mp4' })
}
https.request = () => {
  const req = new EventEmitter()
  req.setTimeout = () => req
  req.end = () => setImmediate(() => req.emit('error', new Error('rede caiu de proposito')))
  return req
}
`

function rodar(estado) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-video-'))
  try {
    const falso = path.join(dir, 'falso.mjs')
    fs.writeFileSync(falso, FALSO)
    const video = path.join(dir, 'aula.mp4')
    fs.writeFileSync(video, Buffer.alloc(1000))
    const log = path.join(dir, 'chamadas.log')
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(falso).href, SCRIPT, video, '--model', 'gemini-falso'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: 'falsa', LOG_FALSO: log, ESTADO: estado },
    })
    const chamadas = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
    return { status: r.status, stderr: r.stderr, chamadas }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('faxina: a copia no Gemini e apagada mesmo quando a chamada de analise cai', () => {
  const r = rodar('ACTIVE')
  assert.match(r.chamadas, /POST .*upload/, 'canario: o upload falso rodou')
  assert.match(r.stderr, /a chamada caiu/)
  assert.equal(r.status, 1)
  assert.match(r.chamadas, /DELETE .*files\/abc/, 'a copia no Gemini ficou pra tras')
})

test('faxina: a copia no Gemini e apagada mesmo quando o processamento do upload falha', () => {
  const r = rodar('FAILED')
  assert.match(r.chamadas, /POST .*upload/, 'canario: o upload falso rodou')
  assert.match(r.stderr, /nao conseguiu processar|não conseguiu processar/, 'canario: caiu no processamento')
  assert.notEqual(r.status, 0)
  assert.match(r.chamadas, /DELETE .*files\/abc/, 'a copia no Gemini ficou pra tras')
})
