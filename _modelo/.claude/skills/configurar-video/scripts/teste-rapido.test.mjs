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

// O teste-rapido renderiza um videov2 vazio de proposito: o gate de densidade do render nao pode derruba-lo.
test('P3: teste-rapido renderiza o video vazio sem cair na densidade', async () => {
  const d = mkdtempSync(join(tmpdir(), 'tr-'))
  try {
    const base = join(d, 'video'), kit = join(d, 'kit')
    for (const m of [kit, join(base, 'motor')]) { mkdirSync(join(m, 'scripts'), { recursive: true }); writeFileSync(join(m, 'scripts', 'x.py'), '#\n') }
    const voz = join(d, 'voz.wav')
    writeFileSync(voz, 'w')
    const chamadas = []
    const executar = (cmd, args) => {
      const a = args.map(String)
      chamadas.push(a)
      if (cmd === 'ffprobe') return { status: 0, stdout: '5\n' }
      if (a.some((x) => x.endsWith('tratar-voz.py'))) { writeFileSync(a.at(-1), 'w'); return { status: 0 } }
      if (a.some((x) => x.endsWith('transcrever.mjs'))) { writeFileSync(a[2], JSON.stringify(PALAVRAS.map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250 })))); return { status: 0 } }
      const mp4 = a.find((x) => x.endsWith('.mp4'))
      if (mp4) writeFileSync(mp4, 'v')
      return { status: 0, stdout: '', stderr: '' }
    }
    const r = await testeRapido({ base, motorKit: kit, vozTeste: voz, executar })
    assert.ok(chamadas.some((a) => a.includes('render')), 'canario: o teste chegou ao render')
    assert.equal(r.ok, true, r.motivos.join('; '))
    assert.ok(existsSync(join(base, 'pronto.json')))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

// Windows nao deixa apagar a pasta do teste com o teste.mp4 aberto num player (EPERM). O apagar
// falso faz o papel do player.
test('P8: teste-rapido com o video do teste aberto no player da recado de fechar o video e nao roda nada', async () => {
  const d = mkdtempSync(join(tmpdir(), 'tr-'))
  try {
    const kit = join(d, 'kit')
    mkdirSync(kit, { recursive: true })
    writeFileSync(join(kit, 'package.json'), '{"v":1}')
    mkdirSync(join(d, 'video', 'motor'), { recursive: true })
    writeFileSync(join(d, 'video', 'motor', 'package.json'), '{"v":1}')
    writeFileSync(join(d, 'voz.wav'), 'x')
    const pasta = join(d, 'video', 'tmp', 'teste-rapido')
    let tentou = false
    const apagar = (p, op) => {
      if (p === pasta) { tentou = true; throw Object.assign(new Error(`EPERM, Permission denied: ${p}`), { code: 'EPERM' }) }
      return rmSync(p, op)
    }
    await assert.rejects(
      testeRapido({ base: join(d, 'video'), motorKit: kit, vozTeste: join(d, 'voz.wav'), apagar, executar: () => { throw new Error('nao devia rodar nada') } }),
      (e) => {
        assert.match(e.message, /Feche o video no player e rode de novo/)
        assert.doesNotMatch(e.message, /EPERM|Permission denied|nao devia rodar nada/)
        return true
      },
    )
    assert.ok(tentou, 'canario: o teste-rapido tentou apagar a pasta pelo apagar injetado')
  } finally { rmSync(d, { recursive: true, force: true }) }
})
