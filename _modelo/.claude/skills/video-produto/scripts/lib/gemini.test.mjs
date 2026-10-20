import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { carregarChave, escolherModelo } from './gemini.mjs'

// ListModels falso; devolve o fetch original pra restaurar no finally
function listar(models) {
  const original = global.fetch
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ models }) })
  return original
}

test('escolherModelo le a versao depois do gemini-omni- e fica com o Omni mais novo, nas duas ordens', async () => {
  delete process.env.GEMINI_SEM_API // o fetch e falso: a trava dura nao pode quebrar o teste
  process.env.GEMINI_API_KEY ??= 'chave-de-teste-fake'
  const omni = ['gemini-omni-1.1-flash', 'gemini-omni-1.2-flash'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] }))
  for (const models of [omni, [...omni].reverse()]) {
    const original = listar(models)
    try {
      assert.equal(await escolherModelo(/^gemini-omni-/), 'gemini-omni-1.2-flash')
    } finally { global.fetch = original }
  }
})

test('escolherModelo com metodo null aceita modelo sem o metodo; com metodo, exige', async () => {
  delete process.env.GEMINI_SEM_API // o fetch e falso: a trava dura nao pode quebrar o teste
  process.env.GEMINI_API_KEY ??= 'chave-de-teste-fake'
  const original = listar([{ name: 'models/lyria-3.5', supportedGenerationMethods: ['countTokens'] }])
  try {
    assert.equal(await escolherModelo(/^lyria-/, null), 'lyria-3.5')
    await assert.rejects(() => escolherModelo(/^lyria-/), /nenhum modelo casa/)
  } finally { global.fetch = original }
})

test('GEMINI_SEM_API trava antes de ler chave', () => {
  assert.throws(() => carregarChave({ env: { GEMINI_SEM_API: '1', GEMINI_API_KEY: 'x' } }), /GEMINI_SEM_API/)
})

test('chave vem do ambiente e depois do .env do projeto; sem chave, manda pro /conectar', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'gem-'))
  try {
    assert.equal(carregarChave({ env: { GEMINI_API_KEY: 'amb' }, raiz }), 'amb')
    writeFileSync(join(raiz, '.env'), 'GEMINI_API_KEY=doenv\n')
    assert.equal(carregarChave({ env: {}, raiz }), 'doenv')
    rmSync(join(raiz, '.env'))
    assert.throws(() => carregarChave({ env: {}, raiz }), /conectar/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})
