// Testes da casca do Chrome dedicado. A lib e os testes dela moram no nucleo
// (.claude/skills/conectar/scripts/lib/); aqui so o que e do pacote: a reexportacao e o nome da skill.
// Rodar: node --test chrome.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as casca from './chrome.mjs'
import * as lib from '../../../conectar/scripts/lib/navegador.mjs'

test('casca reexporta a lib do nucleo sem copiar codigo', () => {
  assert.deepEqual(Object.keys(casca).sort(), Object.keys(lib).sort())
  for (const k of Object.keys(lib)) if (k !== 'conectar') assert.equal(casca[k], lib[k], `${k} nao e o da lib`)
})

test('conectar sem Playwright instalado manda rodar o npm install da skill', async () => {
  await assert.rejects(casca.conectar({ carregar: async () => { throw new Error('Cannot find package') } }), /npm install --prefix \.claude\/skills\/midia-social/)
})

test('conectar com o Chrome fechado manda rodar o abrir-chrome da skill', async () => {
  await assert.rejects(
    casca.conectar({ porta: lib.FAIXA.inicio, perfil: '/nao/existe', carregar: async () => ({ chromium: {} }), fetchFn: async () => { throw new Error('recusou') } }),
    /node \.claude\/skills\/midia-social\/scripts\/abrir-chrome\.mjs/,
  )
})

// 5.36: a casca repassa as opcoes e o Playwright recebe noDefaults sem a casca pedir
test('conectar da casca repassa as opcoes e liga com noDefaults', async () => {
  const perfil = mkdtempSync(join(tmpdir(), 'casca-'))
  try {
    const porta = lib.FAIXA.inicio
    writeFileSync(join(perfil, lib.SENTINELA), JSON.stringify({ porta, guid: 'g-1', perfil }))
    const fetchFn = async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: `ws://127.0.0.1:${porta}/devtools/browser/g-1` }) })
    const chamadas = []
    const browser = { contexts: () => [{ pages: () => [], on: () => {}, newCDPSession: async () => ({ send: async () => {} }) }] }
    const carregar = async () => ({ chromium: { connectOverCDP: async (...a) => { chamadas.push(a); return browser } } })
    assert.equal(await casca.conectar({ porta, perfil, carregar, fetchFn }), browser)
    assert.deepEqual(chamadas, [[`http://127.0.0.1:${porta}`, { noDefaults: true }]])
  } finally { rmSync(perfil, { recursive: true, force: true }) }
})
