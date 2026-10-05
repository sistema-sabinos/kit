// Prova a casca: grava uma linha numa raiz temporaria e sai 0 mesmo quando nao consegue gravar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'registrar-custo-cli.mjs')
const rodar = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })

test('grava uma linha em dados/custos.jsonl da raiz passada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'custo-cli-'))
  try {
    const r = rodar(['--servico', 'gemini-fiscal', '--usd', '0.42', '--contexto', 'olho final da peca', '--raiz', raiz])
    assert.equal(r.status, 0, r.stderr)
    const linhas = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split('\n')
    assert.equal(linhas.length, 1)
    const l = JSON.parse(linhas[0])
    assert.equal(l.servico, 'gemini-fiscal')
    assert.equal(l.usd, 0.42)
    assert.equal(l.contexto, 'olho final da peca')
    assert.ok(l.em)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('sai 0 e avisa quando a gravacao falha', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'custo-cli-'))
  try {
    writeFileSync(join(raiz, 'dados'), 'arquivo no lugar da pasta')
    const r = rodar(['--servico', 'x', '--usd', '1', '--contexto', 'c', '--raiz', raiz])
    assert.equal(r.status, 0)
    assert.match(r.stderr, /nao foi gravada/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('sem valor valido avisa e sai 0', () => {
  const r = rodar(['--servico', 'x'])
  assert.equal(r.status, 0)
  assert.match(r.stderr, /faltou/)
})
