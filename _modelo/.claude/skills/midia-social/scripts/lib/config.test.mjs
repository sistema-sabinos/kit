// Testes da configuracao do pacote. Sem rede; arquivo temporario apagado no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { parseConfig, parseEnv, lerConfig, exigir, gravarEnv } from './config.mjs'

const CRASES = '`'.repeat(3)

test('parseConfig le so o bloco config, ignora comentario e linha vazia', () => {
  const md = ['# Midia social', '', 'modo: isso aqui e texto e nao conta', '',
    CRASES + 'config', 'modo: loja   # loja | pessoal', 'perfil: lojateste', 'ritmo: 3', 'canal_tiktok:', CRASES].join('\r\n')
  assert.deepEqual(parseConfig(md), { modo: 'loja', perfil: 'lojateste', ritmo: '3' })
})

test('parseConfig sem bloco devolve vazio', () => {
  assert.deepEqual(parseConfig('modo: loja'), {})
})

test('parseEnv tira aspas e ignora comentario', () => {
  assert.deepEqual(parseEnv('# x\nBUFFER_API_KEY="abc"\nR2_BUCKET=b\n'), { BUFFER_API_KEY: 'abc', R2_BUCKET: 'b' })
})

test('lerConfig junta config e env da raiz, e sem arquivo devolve vazio', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-config-'))
  try {
    assert.deepEqual(lerConfig({ raiz }), { config: {}, env: {} })
    mkdirSync(join(raiz, '_contexto'))
    writeFileSync(join(raiz, '_contexto', 'midia-social.md'), CRASES + 'config\nmodo: pessoal\n' + CRASES + '\n')
    writeFileSync(join(raiz, '.env'), 'BUFFER_API_KEY=k\n')
    assert.deepEqual(lerConfig({ raiz }), { config: { modo: 'pessoal' }, env: { BUFFER_API_KEY: 'k' } })
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('exigir aponta a secao do guia de cada chave que falta', () => {
  assert.throws(() => exigir({ config: {}, env: {} }, ['BUFFER_API_KEY', 'canal_instagram']),
    e => /BUFFER_API_KEY/.test(e.message) && /canal_instagram/.test(e.message) && /Buffer/.test(e.message) && /configurar\.md/.test(e.message))
  assert.doesNotThrow(() => exigir({ config: { canal_instagram: 'c' }, env: { BUFFER_API_KEY: 'k' } }, ['BUFFER_API_KEY', 'canal_instagram']))
})

test('gravarEnv troca so as chaves do patch, acrescenta as novas e preserva CRLF e o resto', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-env-'))
  try {
    writeFileSync(join(raiz, '.env'), '# chaves\r\nOUTRA=1\r\nexport TOKEN_A=velho\r\nB=2\r\n')
    gravarEnv({ TOKEN_A: 'novo', NOVA: 'x' }, { raiz })
    assert.equal(readFileSync(join(raiz, '.env'), 'utf8'), '# chaves\r\nOUTRA=1\r\nTOKEN_A=novo\r\nB=2\r\nNOVA=x\r\n')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('gravarEnv cria o .env quando nao existe', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-env-'))
  try {
    gravarEnv({ A: '1' }, { raiz })
    assert.equal(readFileSync(join(raiz, '.env'), 'utf8'), 'A=1\n')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})
