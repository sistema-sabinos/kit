// Testes do travar-nome.mjs rodando o CLI numa pasta temporaria.
// Rodar: node --test travar-nome.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./travar-nome.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)

function conselheiro({ inventario, skill = 'Conselheiro de persuasao.', agente = 'Agente fino.' }) {
  const dir = mkdtempSync(join(tmpdir(), 'travar-nome-'))
  if (inventario != null) writeFileSync(join(dir, 'inventario.md'), inventario)
  if (skill != null) writeFileSync(join(dir, 'SKILL.md'), skill)
  if (agente != null) writeFileSync(join(dir, 'agente.md'), agente)
  return dir
}
const rodar = dir => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
const INV = ['# Inventario', 'pessoa: José de Souza', 'nome-no-agente: nao', ''].join(CRLF)

test('persona sem o nome sai 0', () => {
  const dir = conselheiro({ inventario: INV })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'sem o nome: 2 partes conferidas em 2 arquivos')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('nome no SKILL.md ou no agente.md sai 1 com arquivo e linha', () => {
  const dir = conselheiro({ inventario: INV, skill: ['# P', 'Como o Souza ensina'].join(CRLF), agente: 'Voce e o JOSE.' })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      'SKILL.md:2: "souza" (parte "souza")',
      'agente.md:1: "jose" (parte "jose")',
      'ocorrencias: 2',
    ])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('nome-no-agente: sim libera', () => {
  const dir = conselheiro({ inventario: INV.replace('nome-no-agente: nao', 'nome-no-agente: sim'), skill: 'Souza' })
  try {
    const r = rodar(dir)
    assert.equal(r.status, 0)
    assert.equal(r.stdout.trim(), 'nome liberado pelo aluno')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('sem inventario, sem pessoa ou sem arquivo da persona sai 1 com aviso', () => {
  const casos = [
    [{ inventario: null }, /sem a linha "pessoa:/],
    [{ inventario: '# Inventario' }, /sem a linha "pessoa:/],
    [{ inventario: INV, agente: null }, /falta agente\.md/],
    [{ inventario: INV.replace('José de Souza', 'Li Wu') }, /nenhuma parte/],
  ]
  for (const [c, re] of casos) {
    const dir = conselheiro(c)
    try {
      const r = rodar(dir)
      assert.equal(r.status, 1, JSON.stringify(c))
      assert.match(r.stdout, re)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
})
