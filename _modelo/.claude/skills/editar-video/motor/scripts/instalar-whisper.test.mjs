import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lerArgumentos, conferirModelo, pastaDoWhisper } from './instalar-whisper.mjs'

test('lerArgumentos: padrao small, aceita small e medium', () => {
  assert.deepEqual(lerArgumentos([]), { modelo: 'small' })
  assert.equal(lerArgumentos(['--modelo', 'medium']).modelo, 'medium')
  assert.equal(lerArgumentos(['--modelo=small']).modelo, 'small')
})

test('lerArgumentos: modelo fora de small e medium recusa', () => {
  assert.throws(() => lerArgumentos(['--modelo', 'large']), /small|medium/)
  assert.throws(() => lerArgumentos(['--modelo']), /small|medium/)
})

test('conferirModelo exige arquivo com tamanho maior que zero', () => {
  const d = mkdtempSync(join(tmpdir(), 'whisper-'))
  try {
    assert.throws(() => conferirModelo(d, 'small'), /modelo/)
    writeFileSync(join(d, 'ggml-small.bin'), '')
    assert.throws(() => conferirModelo(d, 'small'), /vazio|zero/)
    writeFileSync(join(d, 'ggml-small.bin'), 'x')
    assert.doesNotThrow(() => conferirModelo(d, 'small'))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('pastaDoWhisper: sem WHISPER_DIR usa <_video>/ferramentas/whisper.cpp, a partir da pasta do script', () => {
  const video = join(tmpdir(), 'v-teste')
  const aqui = join(video, 'motor', 'scripts')
  assert.equal(pastaDoWhisper({ env: {}, aqui }), join(video, 'ferramentas', 'whisper.cpp'))
  assert.equal(pastaDoWhisper({ env: { WHISPER_DIR: '' }, aqui }), join(video, 'ferramentas', 'whisper.cpp'))
  assert.equal(pastaDoWhisper({ env: { WHISPER_DIR: join(tmpdir(), 'outra') }, aqui }), join(tmpdir(), 'outra'))
})
