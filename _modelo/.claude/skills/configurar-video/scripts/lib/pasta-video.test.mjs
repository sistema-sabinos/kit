import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pastaVideo, caminhos, hashPasta, conferirPronto } from './pasta-video.mjs'

test('sem SABINOS_VIDEO, _video fica na pasta-mae (irma do projeto)', () => {
  const raiz = join(tmpdir(), 'mae', 'projeto')
  assert.equal(pastaVideo({ raiz, env: {} }), resolve(raiz, '..', '_video'))
})

test('SABINOS_VIDEO relativo resolve a partir da raiz; absoluto fica igual', () => {
  const raiz = join(tmpdir(), 'mae', 'projeto')
  assert.equal(pastaVideo({ raiz, env: { SABINOS_VIDEO: '../outra' } }), resolve(raiz, '../outra'))
  const abs = join(tmpdir(), 'video-sem-espaco')
  assert.equal(pastaVideo({ raiz, env: { SABINOS_VIDEO: abs } }), abs)
})

test('caminhos tem todas as subpastas', () => {
  const c = caminhos(join(tmpdir(), 'v'))
  for (const k of ['base', 'motor', 'midia', 'ferramentas', 'tmp', 'py', 'maquina', 'pronto']) assert.ok(c[k], k)
})

test('hashPasta muda quando um arquivo muda e ignora node_modules', () => {
  const d = mkdtempSync(join(tmpdir(), 'hash-'))
  try {
    writeFileSync(join(d, 'a.txt'), '1')
    const h1 = hashPasta(d)
    mkdirSync(join(d, 'node_modules'))
    writeFileSync(join(d, 'node_modules', 'x'), 'y')
    assert.equal(hashPasta(d), h1)
    writeFileSync(join(d, 'a.txt'), '2')
    assert.notEqual(hashPasta(d), h1)
    assert.match(h1, /^[0-9a-f]{16}$/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('conferirPronto: sem pronto.json, ou motor diferente, manda configurar', () => {
  const base = mkdtempSync(join(tmpdir(), 'pronto-'))
  const motor = mkdtempSync(join(tmpdir(), 'motor-'))
  try {
    writeFileSync(join(motor, 'a.tsx'), 'x')
    assert.equal(conferirPronto({ base, motorKit: motor }).ok, false)
    writeFileSync(join(base, 'pronto.json'), JSON.stringify({ versaoMotor: hashPasta(motor) }))
    assert.equal(conferirPronto({ base, motorKit: motor }).ok, true)
    writeFileSync(join(motor, 'a.tsx'), 'mudou')
    const r = conferirPronto({ base, motorKit: motor })
    assert.equal(r.ok, false)
    assert.match(r.motivo, /configurar-video/)
  } finally { rmSync(base, { recursive: true, force: true }); rmSync(motor, { recursive: true, force: true }) }
})

test('hashPasta ignora arquivo que comeca com ponto (.DS_Store), menos o .gitignore do motor', () => {
  const d = mkdtempSync(join(tmpdir(), 'hash-'))
  try {
    writeFileSync(join(d, 'a.txt'), '1')
    const h1 = hashPasta(d)
    writeFileSync(join(d, '.DS_Store'), 'lixo do Mac')
    mkdirSync(join(d, 'src'))
    writeFileSync(join(d, 'src', '.DS_Store'), 'lixo')
    writeFileSync(join(d, '.lock-instalado'), 'marca')
    assert.equal(hashPasta(d), h1)
    writeFileSync(join(d, '.gitignore'), 'node_modules')
    assert.notEqual(hashPasta(d), h1)
  } finally { rmSync(d, { recursive: true, force: true }) }
})
