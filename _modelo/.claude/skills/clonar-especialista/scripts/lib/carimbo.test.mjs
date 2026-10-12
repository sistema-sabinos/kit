// Testes do carimbo.mjs. Rodar: node --test carimbo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { carimboPersona } from './carimbo.mjs'

const CRLF = String.fromCharCode(13, 10)
const LF = String.fromCharCode(10)

function pasta(fim = CRLF, mexer = {}) {
  const p = mkdtempSync(join(tmpdir(), 'carimbo-'))
  mkdirSync(join(p, 'fichas'))
  const t = { skill: ['# Persona', 'Regra um.'], agente: ['---', 'name: x', '---'], ficha: ['[p. 1] x', 'y'], ...mexer }
  writeFileSync(join(p, 'SKILL.md'), t.skill.join(fim))
  writeFileSync(join(p, 'agente.md'), t.agente.join(fim))
  writeFileSync(join(p, 'fichas', '01-livro.md'), t.ficha.join(fim))
  return p
}

test('mesmo conteudo em CRLF e em LF da o mesmo carimbo, de 64 hex', () => {
  const a = pasta(CRLF), b = pasta(LF)
  try {
    const ca = carimboPersona(a)
    assert.match(ca, /^[0-9a-f]{64}$/)
    assert.equal(ca, carimboPersona(b))
  } finally { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }) }
})

test('uma letra mudada no SKILL.md, no agente.md ou numa ficha muda o carimbo', () => {
  const base = pasta()
  const mexidas = [
    pasta(CRLF, { skill: ['# Persona', 'Regra uma.'] }),
    pasta(CRLF, { agente: ['---', 'name: y', '---'] }),
    pasta(CRLF, { ficha: ['[p. 2] x', 'y'] }),
  ]
  try {
    const c = carimboPersona(base)
    for (const m of mexidas) assert.notEqual(carimboPersona(m), c, m)
  } finally { for (const p of [base, ...mexidas]) rmSync(p, { recursive: true, force: true }) }
})

test('ficha nova muda o carimbo', () => {
  const p = pasta()
  try {
    const antes = carimboPersona(p)
    writeFileSync(join(p, 'fichas', '02-post.md'), '')
    assert.notEqual(carimboPersona(p), antes)
  } finally { rmSync(p, { recursive: true, force: true }) }
})

test('arquivo ausente nao derruba e entra como vazio', () => {
  const p = mkdtempSync(join(tmpdir(), 'carimbo-'))
  try {
    assert.match(carimboPersona(p), /^[0-9a-f]{64}$/)
  } finally { rmSync(p, { recursive: true, force: true }) }
})
