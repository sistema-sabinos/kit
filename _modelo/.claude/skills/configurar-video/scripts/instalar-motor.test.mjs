import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { instalarMotor, marcaEmDia, hashLock, MARCA } from './instalar-motor.mjs'

function motor() {
  const d = mkdtempSync(join(tmpdir(), 'instmotor-'))
  writeFileSync(join(d, 'package-lock.json'), 'lock1')
  return { d, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

test('npm ci com saida 0 grava a marca com o hash do lock', () => {
  const t = motor()
  try {
    const chamadas = []
    const r = instalarMotor({ motor: t.d, plat: 'darwin', executar: (cmd, args, op) => { chamadas.push({ cmd, args, op }); return { status: 0 } } })
    assert.equal(r.ok, true)
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].cmd, 'npm')
    assert.deepEqual(chamadas[0].args, ['ci'])
    assert.equal(chamadas[0].op.cwd, t.d)
    assert.equal(chamadas[0].op.shell, false)
    assert.equal(readFileSync(join(t.d, MARCA), 'utf8').trim(), hashLock(t.d))
    assert.equal(marcaEmDia(t.d), true)
  } finally { t.limpar() }
})

test('npm ci que falha (ou cai no meio) nao grava a marca e apaga a velha', () => {
  const t = motor()
  try {
    writeFileSync(join(t.d, MARCA), hashLock(t.d) + '\n')
    const r = instalarMotor({ motor: t.d, plat: 'win32', executar: (cmd, args, op) => { assert.equal(op.shell, true); return { status: 1 } } })
    assert.equal(r.ok, false)
    assert.equal(existsSync(join(t.d, MARCA)), false)
    assert.equal(marcaEmDia(t.d), false)
  } finally { t.limpar() }
})

test('marca de outro lock nao vale', () => {
  const t = motor()
  try {
    instalarMotor({ motor: t.d, plat: 'darwin', executar: () => ({ status: 0 }) })
    assert.equal(marcaEmDia(t.d), true)
    writeFileSync(join(t.d, 'package-lock.json'), 'lock2')
    assert.equal(marcaEmDia(t.d), false)
    assert.equal(marcaEmDia(join(t.d, 'nao-existe')), false)
  } finally { t.limpar() }
})
