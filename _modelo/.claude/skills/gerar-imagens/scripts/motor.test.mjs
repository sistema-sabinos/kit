// Testes do motor. Rodar: node --test motor.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherDegrau, lerStatusCodex, detectarCodex } from './motor.mjs'

test('Codex logado pela conta ChatGPT ganha, mesmo com chave do Gemini', () => {
  assert.equal(escolherDegrau({ codex: { logado: true }, env: { GEMINI_API_KEY: 'x' } }).degrau, 'codex')
})

test('o motivo do Codex avisa que credito avulso comprado pode ser gasto', () => {
  const r = escolherDegrau({ codex: { logado: true }, env: {} })
  assert.match(r.motivo, /cota do plano/)
  assert.match(r.motivo, /creditos avulsos/)
})

test('sem Codex e com chave do Gemini, Gemini', () => {
  assert.equal(escolherDegrau({ codex: { logado: false }, env: { GEMINI_API_KEY: 'x' } }).degrau, 'gemini')
})

test('sem nada, zero IA, e o motivo diz que custa zero', () => {
  const r = escolherDegrau({ codex: { logado: false }, env: {} })
  assert.equal(r.degrau, 'zero-ia')
  assert.match(r.motivo, /custo zero/)
})

test('lerStatusCodex: so conta o login pela conta ChatGPT', () => {
  assert.deepEqual(lerStatusCodex({ status: 0, stdout: '', stderr: 'Logged in using ChatGPT\n' }), { instalado: true, logado: true })
  assert.deepEqual(lerStatusCodex({ status: 0, stdout: 'Logged in using an API key - sk-...\n', stderr: '' }), { instalado: true, logado: false })
  assert.deepEqual(lerStatusCodex({ status: 1, stdout: 'Not logged in\n', stderr: '' }), { instalado: true, logado: false })
})

test('lerStatusCodex: comando que nao existe', () => {
  assert.deepEqual(lerStatusCodex({ error: new Error('ENOENT') }), { instalado: false, logado: false })
  assert.deepEqual(lerStatusCodex({ status: 1, stdout: '', stderr: "'codex' is not recognized as an internal or external command" }), { instalado: false, logado: false })
  assert.deepEqual(lerStatusCodex({ status: 1, stdout: '', stderr: "'codex' n" + String.fromCharCode(0xe3) + "o " + String.fromCharCode(0xe9) + " reconhecido como um comando interno" }), { instalado: false, logado: false })
})

test('detectarCodex chama "codex login status" e usa shell so no Windows', () => {
  const vistos = []
  detectarCodex((cmd, args, op) => { vistos.push([cmd, args, op.shell]); return { status: 0, stdout: 'Logged in using ChatGPT', stderr: '' } })
  assert.deepEqual(vistos[0], ['codex', ['login', 'status'], process.platform === 'win32'])
})
