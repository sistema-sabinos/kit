// Testes da leitura e escrita do .env. Rodar: node --test env.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RAIZ } from './raiz.mjs'
import { parseEnv, lerEnv, gravarEnv } from './env.mjs'

test('a raiz aponta pra pasta que tem esta skill dentro', () => {
  assert.ok(existsSync(join(RAIZ, '.claude', 'skills', 'mercado-livre', 'SKILL.md')), `RAIZ deu ${RAIZ}`)
})

test('parseEnv ignora comentario, linha vazia e aspas, e nao deixa o CR do Windows colado no valor', () => {
  const env = parseEnv('# chave\r\nA=1\r\n\r\nB="dois"\r\nC=\'tres\'\r\nSEM_IGUAL\r\n')
  assert.deepEqual(env, { A: '1', B: 'dois', C: 'tres' })
})

test('lerEnv de arquivo que nao existe devolve objeto vazio', () => {
  assert.deepEqual(lerEnv(join(tmpdir(), 'nao-existe-' + process.pid + '.env')), {})
})

test('gravarEnv troca valor no lugar, mantem comentario e ordem, acrescenta chave nova e nao deixa temporario', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'))
  const caminho = join(dir, '.env')
  try {
    writeFileSync(caminho, '# minhas chaves\nA=1\nB=2\n')
    gravarEnv({ B: 'dois', C: 'tres' }, caminho)
    const texto = readFileSync(caminho, 'utf8')
    assert.equal(texto, '# minhas chaves\nA=1\nB=dois\nC=tres\n')
    assert.deepEqual(readdirSync(dir), ['.env'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gravarEnv cria o arquivo quando ele nao existe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'))
  const caminho = join(dir, '.env')
  try {
    gravarEnv({ A: 'um' }, caminho)
    assert.deepEqual(lerEnv(caminho), { A: 'um' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gravarEnv nunca perde chave que ja estava la', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-'))
  const caminho = join(dir, '.env')
  try {
    writeFileSync(caminho, 'A=1\nB=2\nC=3\nD=4\nE=5\n')
    gravarEnv({ B: 'x' }, caminho)
    const depois = lerEnv(caminho)
    for (const k of ['A', 'B', 'C', 'D', 'E']) assert.ok(k in depois, `perdeu ${k}`)
    assert.equal(depois.B, 'x')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
