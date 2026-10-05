// Testes da comparacao campeao contra controle. Rodar: node --test lift.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { medir, calcularLift, classificar, bloqueioDoTeste, compararPadrao, diagnosticoDeAmostra, exigeMaioria, LIFT_SO_CAMPEOES } from './lift.mjs'

const grupo = (sim, nao) => [...Array(sim).fill({ x: true }), ...Array(nao).fill({ x: false })]
const temX = a => a.x

test('medir conta excecao como erro, separado de zero', () => {
  const r = medir([{ x: true }, null, { x: false }], a => a.x)
  assert.deepEqual(r, { contagem: 1, erros: 1, total: 3, freq: 1 / 3 })
})

test('lift: controle zero da Infinity, que sai como 999 com a flag', () => {
  assert.equal(calcularLift(0.5, 0), Infinity)
  assert.equal(calcularLift(0, 0), 0)
  const p = compararPadrao('x', grupo(5, 5), grupo(0, 10), temX)
  assert.equal(p.lift, LIFT_SO_CAMPEOES)
  assert.equal(p.lift_so_campeoes, true)
  assert.equal(JSON.parse(JSON.stringify(p)).lift, 999)
  assert.equal(p.veredito, 'regra')
})

test('regra, custo de entrada e irrelevante', () => {
  assert.equal(compararPadrao('a', grupo(8, 2), grupo(3, 7), temX).veredito, 'regra')
  assert.equal(compararPadrao('b', grupo(8, 2), grupo(7, 3), temX).veredito, 'custo-de-entrada')
  assert.equal(compararPadrao('c', grupo(1, 9), grupo(1, 9), temX).veredito, 'irrelevante')
})

test('anti-padrao precisa do controle acima do proprio piso', () => {
  // 1 de 10 campeoes contra 6 de 10 do controle: lift 0,17, controle fala
  assert.equal(compararPadrao('v', grupo(1, 9), grupo(6, 4), temX).veredito, 'anti-padrao')
  // 0 de 4 campeoes contra 2 de 4 do controle: controle abaixo do piso de 3
  const p = compararPadrao('v', grupo(0, 4), grupo(2, 2), temX)
  assert.equal(p.veredito, 'irrelevante')
  assert.equal(p.bloqueio, 'piso-de-controle')
})

test('2 campeoes que concordam 100% nao viram regra: bloqueio por piso de campeoes', () => {
  const p = compararPadrao('x', grupo(2, 0), grupo(0, 8), temX)
  assert.equal(p.freq_campeoes, 1)
  assert.equal(p.veredito, 'irrelevante')
  assert.equal(p.bloqueio, 'piso-de-campeoes')
})

test('amostra abaixo de 8 e ruido e bloqueio de amostra pequena', () => {
  const e = { freqCampeoes: 1, freqControle: 0, amostra: 6, numCampeoesFazendo: 3, numControleFazendo: 0 }
  assert.equal(classificar(e), 'ruido')
  assert.equal(bloqueioDoTeste(e), 'amostra-pequena')
})

test('frequencia baixa e achado, nao bloqueio', () => {
  assert.equal(compararPadrao('x', grupo(1, 9), grupo(1, 9), temX).bloqueio, null)
})

test('maioria estrita: empate nao e maioria', () => {
  assert.equal(exigeMaioria(5), 3)
  assert.equal(exigeMaioria(10), 6)
  const decidido = { bloqueio: null }
  const preso = { bloqueio: 'piso-de-campeoes' }
  const empate = diagnosticoDeAmostra(10, 10, [decidido, decidido, decidido, decidido, decidido, preso, preso, preso, preso, preso])
  assert.equal(empate.inconclusivo, true)
  assert.match(empate.motivos[0], /5 de 10 testes/)
  assert.equal(diagnosticoDeAmostra(10, 10, [decidido, decidido, decidido, preso, preso]).inconclusivo, false)
})

test('poucos campeoes ou pouco controle derrubam a rodada com os numeros reais', () => {
  const d = diagnosticoDeAmostra(2, 10, [])
  assert.equal(d.inconclusivo, true)
  assert.match(d.motivos.join(' '), /so 2 campeoes/)
  const k = diagnosticoDeAmostra(10, 2, [])
  assert.match(k.motivos.join(' '), /so 2 anuncios de controle/)
  assert.equal(diagnosticoDeAmostra(10, 10, []).inconclusivo, false)
})

test('excecao dentro do teste sobe como erros_no_teste', () => {
  const p = compararPadrao('quebra', [{}, {}], [{}], () => { throw new Error('bug') })
  assert.equal(p.erros_no_teste, 3)
})
