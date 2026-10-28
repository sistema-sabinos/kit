// Testes da casca do Chrome dedicado. A lib e os testes dela moram no nucleo
// (.claude/skills/conectar/scripts/lib/); aqui so o que e do pacote: a reexportacao e o nome da skill.
// Rodar: node --test chrome.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as casca from './chrome.mjs'
import * as lib from '../../../conectar/scripts/lib/navegador.mjs'

test('casca reexporta a lib do nucleo sem copiar codigo', () => {
  assert.deepEqual(Object.keys(casca).sort(), Object.keys(lib).sort())
  for (const k of Object.keys(lib)) if (k !== 'conectar') assert.equal(casca[k], lib[k], `${k} nao e o da lib`)
})

test('conectar sem Playwright instalado manda rodar o npm install da skill', async () => {
  await assert.rejects(casca.conectar({ carregar: async () => { throw new Error('Cannot find package') } }), /npm install --prefix \.claude\/skills\/mercado-livre/)
})

test('conectar com o Chrome fechado manda rodar o abrir-chrome da skill', async () => {
  await assert.rejects(
    casca.conectar({ porta: lib.FAIXA.inicio, perfil: '/nao/existe', carregar: async () => ({ chromium: {} }), fetchFn: async () => { throw new Error('recusou') } }),
    /node \.claude\/skills\/mercado-livre\/scripts\/abrir-chrome\.mjs/,
  )
})
