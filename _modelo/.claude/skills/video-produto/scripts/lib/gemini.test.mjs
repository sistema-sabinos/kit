import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { carregarChave } from './gemini.mjs'

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
