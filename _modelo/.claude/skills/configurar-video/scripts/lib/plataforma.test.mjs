import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { python, exe, tarDoSistema, rodarPython } from './plataforma.mjs'

test('python: lancador py -3.12 no Windows, python3.12 no Mac sem ambiente proprio', () => {
  assert.deepEqual(python('win32'), { cmd: 'py', base: ['-3.12'] })
  // o brew install python@3.12 so poe python3.12 no PATH (o python3 pode ser outro)
  assert.deepEqual(python('darwin'), { cmd: 'python3.12', base: [] })
  const semVenv = mkdtempSync(join(tmpdir(), 'plat-'))
  try { assert.deepEqual(python('darwin', semVenv), { cmd: 'python3.12', base: [] }) } finally { rmSync(semVenv, { recursive: true, force: true }) }
})

test('python no Mac prefere o ambiente proprio do video quando existe', () => {
  const base = mkdtempSync(join(tmpdir(), 'plat-'))
  try {
    mkdirSync(join(base, 'py', 'bin'), { recursive: true })
    writeFileSync(join(base, 'py', 'bin', 'python3'), '')
    assert.equal(python('darwin', base).cmd, join(base, 'py', 'bin', 'python3'))
    assert.equal(python('win32', base).cmd, 'py')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('exe so ganha extensao no Windows', () => {
  assert.equal(exe('deep-filter', 'win32'), 'deep-filter.exe')
  assert.equal(exe('deep-filter', 'darwin'), 'deep-filter')
})

test('tar do sistema: o do Windows pelo SystemRoot, nunca o GNU tar do Git Bash', () => {
  const raizWin = join('X', 'Windows')
  assert.equal(tarDoSistema('win32', { SystemRoot: raizWin }), join(raizWin, 'System32', 'tar.exe'))
  // no Mac, o bsdtar do sistema pelo caminho: um gnu-tar do brew no PATH nao abre zip
  assert.equal(tarDoSistema('darwin', {}), '/usr/bin/tar')
  assert.throws(() => tarDoSistema('win32', {}), /SystemRoot/)
})

test('rodarPython monta comando e argumentos pela plataforma', () => {
  const chamadas = []
  rodarPython('a.py', ['x'], { plat: 'win32', executar: (c, a) => { chamadas.push([c, a]); return { status: 0 } } })
  assert.deepEqual(chamadas[0], ['py', ['-3.12', 'a.py', 'x']])
})
