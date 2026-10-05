import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { conferirResultado, gravarPronto, testeRapido, PALAVRAS } from './teste-rapido.mjs'

const cap = (...textos) => textos.map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250 }))

test('tres palavras esperadas, com pontuacao e acento, passam', () => {
  const r = conferirResultado({ palavras: cap('Este', 'e', 'o', 'teste.', 'do', 'sistema', 'de', 'vídeo,'), duracaoSeg: 8, esperadaSeg: 8 })
  assert.equal(r.ok, true)
  assert.deepEqual([...r.achadas].sort(), ['sistema', 'teste', 'video'])
})

test('duas palavras so nao bastam', () => {
  const r = conferirResultado({ palavras: cap('teste', 'sistema', 'casa'), duracaoSeg: 8, esperadaSeg: 8 })
  assert.equal(r.ok, false)
  assert.match(r.motivos.join(' '), /palavras/)
  assert.equal(r.achadas.length, 2)
})

test('duracao fora de mais ou menos 0,5 s da fala reprova, nos limites passa', () => {
  const palavras = cap('teste', 'sistema', 'video')
  assert.equal(conferirResultado({ palavras, duracaoSeg: 7.4, esperadaSeg: 8 }).ok, false)
  assert.equal(conferirResultado({ palavras, duracaoSeg: 8.6, esperadaSeg: 8 }).ok, false)
  assert.equal(conferirResultado({ palavras, duracaoSeg: 7.5, esperadaSeg: 8 }).ok, true)
  assert.equal(conferirResultado({ palavras, duracaoSeg: 8.5, esperadaSeg: 8 }).ok, true)
  assert.match(conferirResultado({ palavras, duracaoSeg: 7.4, esperadaSeg: 8 }).motivos.join(' '), /dura/)
})

test('lista de palavras do teste', () => {
  assert.deepEqual(PALAVRAS, ['teste', 'sistema', 'video', 'ouvindo', 'certo'])
})

test('gravarPronto guarda em, versaoMotor, whisper e sistema', () => {
  const d = mkdtempSync(join(tmpdir(), 'pronto-'))
  try {
    gravarPronto({ base: d, versaoMotor: 'abc123', whisper: 'small', sistema: 'win32', agora: () => new Date('2026-10-04T10:00:00Z') })
    const j = JSON.parse(readFileSync(join(d, 'pronto.json'), 'utf8'))
    assert.deepEqual(j, { em: '2026-10-04T10:00:00.000Z', versaoMotor: 'abc123', whisper: 'small', sistema: 'win32' })
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('sem teste-voz.wav sai com mensagem clara e nao grava pronto', async () => {
  const d = mkdtempSync(join(tmpdir(), 'tr-'))
  try {
    mkdirSync(join(d, 'motor'), { recursive: true })
    await assert.rejects(
      testeRapido({ base: d, vozPadrao: join(d, 'nao-existe.wav'), motorKit: d, executar: () => { throw new Error('nao devia rodar nada') } }),
      /falta referencias\/teste-voz\.wav \(arquivo do kit\)/,
    )
    assert.equal(existsSync(join(d, 'pronto.json')), false)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('motor de _video diferente do kit: sai 1 sem rodar nada e sem gravar pronto', async () => {
  const d = mkdtempSync(join(tmpdir(), 'tr-'))
  try {
    const kit = join(d, 'kit')
    mkdirSync(kit, { recursive: true })
    writeFileSync(join(kit, 'package.json'), '{"v":2}')
    mkdirSync(join(d, 'video', 'motor'), { recursive: true })
    writeFileSync(join(d, 'video', 'motor', 'package.json'), '{"v":1}')
    writeFileSync(join(d, 'voz.wav'), 'x')
    await assert.rejects(
      testeRapido({ base: join(d, 'video'), motorKit: kit, vozTeste: join(d, 'voz.wav'), executar: () => { throw new Error('nao devia rodar nada') } }),
      /sincronizar-motor.mjs/,
    )
    assert.equal(existsSync(join(d, 'video', 'pronto.json')), false)
  } finally { rmSync(d, { recursive: true, force: true }) }
})
