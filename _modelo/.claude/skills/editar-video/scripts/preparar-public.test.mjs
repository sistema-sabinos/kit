import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { refsBiblioteca, prepararPublic } from './preparar-public.mjs'

test('refsBiblioteca acha o caminho em JSON aninhado', () => {
  const texto = JSON.stringify({ sfx: [{ arquivo: 'biblioteca/sfx/pop.wav', seg: 1 }], deep: { a: { musica: 'biblioteca/musica/x/faixa.mp3' } } })
  assert.deepEqual(refsBiblioteca(texto), ['biblioteca/musica/x/faixa.mp3', 'biblioteca/sfx/pop.wav'])
})

test('refsBiblioteca acha o caminho em tsx, com aspas simples, duplas e crase, sem repetir', () => {
  const tsx = [
    "const a = staticFile('biblioteca/sfx/pop.wav')",
    'const b = staticFile("biblioteca/sfx/whoosh.wav")',
    'const c = staticFile(`biblioteca/overlays/luz.mp4`)',
    "const d = staticFile('biblioteca/sfx/pop.wav')",
  ].join('\n')
  assert.deepEqual(refsBiblioteca(tsx), ['biblioteca/overlays/luz.mp4', 'biblioteca/sfx/pop.wav', 'biblioteca/sfx/whoosh.wav'])
})

test('refsBiblioteca no exemplo real de camadas so acha caminho de arquivo, sem comentario nem modelo', () => {
  const texto = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'motor', 'exemplos', 'camadas-exemplo.tsx'), 'utf8')
  assert.ok(texto.includes('biblioteca/sfx/<nome>.wav'), 'canario: o modelo precisa estar no exemplo')
  assert.deepEqual(refsBiblioteca(texto), ['biblioteca/sfx/pop.wav'])
})

test('refsBiblioteca ignora template com ${x}, ponto solto e sem extensao', () => {
  const texto = 'staticFile(`biblioteca/sfx/${nome}.wav`) // biblioteca/sfx/. e biblioteca/sfx/<x>.mp3 e biblioteca/sfx/ok.WAV "biblioteca/sfx/semext"'
  assert.deepEqual(refsBiblioteca(texto), ['biblioteca/sfx/ok.WAV'])
})

test('refsBiblioteca nao inventa nada em texto sem biblioteca', () => {
  assert.deepEqual(refsBiblioteca('{"pessoa":"pessoa.webm"}'), [])
})

test('prepararPublic copia (sem link), pula igual e lista o que falta', () => {
  const d = mkdtempSync(join(tmpdir(), 'prep-'))
  try {
    const midia = join(d, 'midia')
    const peca = join(d, 'producao', 'peca')
    mkdirSync(join(midia, 'biblioteca', 'sfx'), { recursive: true })
    writeFileSync(join(midia, 'biblioteca', 'sfx', 'pop.wav'), 'dados-pop')
    mkdirSync(peca, { recursive: true })
    const refs = ['biblioteca/sfx/pop.wav', 'biblioteca/sfx/nao-existe.wav']
    const r = prepararPublic({ pastaPeca: peca, midia, refs })
    assert.deepEqual(r.copiados, ['biblioteca/sfx/pop.wav'])
    assert.deepEqual(r.faltando, ['biblioteca/sfx/nao-existe.wav'])
    const destino = join(peca, 'public', 'biblioteca', 'sfx', 'pop.wav')
    assert.equal(lstatSync(destino).isSymbolicLink(), false)
    assert.equal(readFileSync(destino, 'utf8'), 'dados-pop')
    // segunda vez: mesmo tamanho, pula
    const r2 = prepararPublic({ pastaPeca: peca, midia, refs })
    assert.deepEqual(r2.copiados, [])
    assert.deepEqual(r2.faltando, ['biblioteca/sfx/nao-existe.wav'])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test('prepararPublic recusa caminho que sai da pasta', () => {
  const d = mkdtempSync(join(tmpdir(), 'prep-'))
  try {
    mkdirSync(join(d, 'midia'), { recursive: true })
    const r = prepararPublic({ pastaPeca: join(d, 'peca'), midia: join(d, 'midia'), refs: ['biblioteca/../../fora.txt'] })
    assert.deepEqual(r.copiados, [])
    assert.deepEqual(r.faltando, ['biblioteca/../../fora.txt'])
    assert.equal(existsSync(join(d, 'fora.txt')), false)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})
