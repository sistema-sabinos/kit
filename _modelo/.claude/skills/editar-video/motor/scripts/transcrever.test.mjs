import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerArgumentos, checarSemEspaco, juntarPalavras } from './transcrever.mjs'

test('lerArgumentos: audio, saida e modelo padrao small', () => {
  assert.deepEqual(lerArgumentos(['a.wav', 'saida.json']), { audio: 'a.wav', saida: 'saida.json', modelo: 'small' })
  assert.equal(lerArgumentos(['a.wav', 'saida.json', 'medium']).modelo, 'medium')
})

test('lerArgumentos: faltando argumento mostra o uso', () => {
  assert.throws(() => lerArgumentos(['a.wav']), /uso: node transcrever\.mjs/)
  assert.throws(() => lerArgumentos([]), /uso: node transcrever\.mjs/)
})

test('lerArgumentos: modelo desconhecido recusa', () => {
  assert.throws(() => lerArgumentos(['a.wav', 's.json', 'gigante']), /modelo/)
})

test('caminho com espaco e recusado e a mensagem cita SABINOS_VIDEO', () => {
  assert.throws(() => checarSemEspaco('pasta com espaco'), /SABINOS_VIDEO/)
  assert.doesNotThrow(() => checarSemEspaco('sem_espaco_nenhum'))
})

test('juntarPalavras cola pedaco de palavra e tira marcacao de som', () => {
  const tokens = [
    { text: ' Ola', startMs: 0, endMs: 100, timestampMs: 50, confidence: 0.9 },
    { text: 'mundo', startMs: 100, endMs: 200, timestampMs: 150, confidence: 0.5 },
    { text: ' tudo', startMs: 300, endMs: 400, timestampMs: 350, confidence: 0.8 },
    { text: ' [Musica]', startMs: 400, endMs: 500, timestampMs: 450, confidence: 0.8 },
  ]
  const p = juntarPalavras(tokens)
  assert.deepEqual(p.map((x) => x.text), [' Olamundo', ' tudo'])
  assert.equal(p[0].endMs, 200)
  assert.equal(p[0].confidence, 0.5)
})
