// Testes do conferir-citacoes.mjs rodando o CLI de verdade numa pasta temporaria.
// Rodar: node --test conferir-citacoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./conferir-citacoes.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)

function curso({ mentor, aulas = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'conferir-citacoes-'))
  if (mentor != null) writeFileSync(join(dir, 'mentor.md'), mentor)
  mkdirSync(join(dir, 'aulas'))
  for (const [nome, texto] of Object.entries(aulas)) writeFileSync(join(dir, 'aulas', nome), texto)
  return dir
}

const rodar = dir => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })

test('CLI com curso valido sai 0 e conta as conferidas', () => {
  const dir = curso({
    mentor: ['# Mentor', 'Caixa primeiro (aula 1, 6:15) e (aula 2, p. 41).', 'Revisao (aula 1, 1:02:03).'].join(CRLF),
    aulas: { '01-caixa.md': `[6:15] fala${CRLF}[1:02:03] fecha`, '02-apostila.md': '[p. 41] texto' },
  })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'conferidas: 3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI com defeito sai 1 e lista cada problema', () => {
  const dir = curso({
    mentor: 'A (aula 1, 6:15), B (aula 7, 1:00), C (aula 1, 9:99).',
    aulas: { '01-caixa.md': '[6:15] fala' },
  })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['aula 7 nao existe em aulas/', 'aula 1 sem a marca [9:99]', 'problemas: 2'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI reprova citacao fora do formato mesmo com outra valida', () => {
  const dir = curso({
    mentor: 'A (aula 1, 6:15). B (aula 9, p.41). C (Aula 9, 1:00). D (aula 9, 6:15 a 7:00).',
    aulas: { '01-a.md': '[6:15] x' },
  })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      'citacao fora do formato: (aula 9, p.41)',
      'citacao fora do formato: (Aula 9, 1:00)',
      'citacao fora do formato: (aula 9, 6:15 a 7:00)',
      'problemas: 3',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mentor sem citacao sai 1 com aviso', () => {
  const dir = curso({ mentor: 'Texto sem citacao nenhuma, so fala da aula 3.', aulas: { '03-x.md': '[1:00]' } })
  try {
    const r = rodar(dir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /nenhuma citacao/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pasta sem mentor.md sai 1 com aviso', () => {
  const dir = curso({ aulas: { '01-x.md': '[1:00]' } })
  try {
    const r = rodar(dir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /sem mentor\.md/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
