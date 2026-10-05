// Testes da ordem das aulas. Sem rede: os titulos sao os de uma playlist real que veio de tras pra frente.
// Rodar: node --test aulas.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroDaAula, ordenarAulas, tokensGemini, TOKENS_POR_SEGUNDO } from './aulas.mjs'

const invertida = [
  { id: 'f', titulo: 'COMO CONFIGURAR A MINHA PÁGINA DO MERCADO LIVRE - AULA 6', duracao: 1212 },
  { id: 'e', titulo: 'AULÃO SOBRE CENTRAL DE PROMOÇÕES DO MERCADO LIVRE - AULA 5', duracao: 1688 },
  { id: 'd', titulo: 'COMO ANUNCIAR UM PRODUTO [PASSO A PASSO 2026] - AULA 4', duracao: 1175 },
  { id: 'c', titulo: 'COMO PRECIFICAR UM PRODUTO + PLANILHA GRATUITA - AULA 3', duracao: 481 },
  { id: 'b', titulo: 'DECOLA MERCADO LIVRE - CURSO GRATUITO MERCADO LIVRE AULA 2', duracao: 462 },
  { id: 'a', titulo: 'COMO ABRIR UMA CONTA - CURSO GRATUIRO MERCADO LIVRE - AULA 1', duracao: 467 },
]

test('numeroDaAula acha o numero em portugues, ingles e com zero na frente', () => {
  assert.equal(numeroDaAula('Curso basico Aula 07 fotos'), 7)
  assert.equal(numeroDaAula('HOW TO PRICE - CLASS 3'), 3)
  assert.equal(numeroDaAula('Lesson 12: ads'), 12)
  assert.equal(numeroDaAula('Módulo 2 - Aula 4'), 4)
})

test('numeroDaAula nao confunde ano nem passo a passo com numero de aula', () => {
  assert.equal(numeroDaAula('COMO ANUNCIAR [PASSO A PASSO 2026]'), null)
  assert.equal(numeroDaAula('AULÃO SOBRE CENTRAL DE PROMOÇÕES'), null)
  assert.equal(numeroDaAula(''), null)
})

test('playlist de tras pra frente sai na ordem das aulas, sem aviso', () => {
  const r = ordenarAulas(invertida)
  assert.deepEqual(r.aulas.map(a => a.id), ['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(r.aulas.map(a => a.numero), [1, 2, 3, 4, 5, 6])
  assert.equal(r.criterio, 'numero no titulo')
  assert.deepEqual(r.avisos, [])
})

test('aula sem numero vai pro fim, as numeradas saem em ordem, e o aviso diz quais', () => {
  const lista = [invertida[0], { id: 'x', titulo: 'Bonus: perguntas', duracao: 300 }, invertida[4], invertida[5]]
  const r = ordenarAulas(lista)
  assert.deepEqual(r.aulas.map(a => a.id), ['a', 'b', 'f', 'x'])
  assert.equal(r.criterio, 'numero no titulo, sem numero no fim')
  assert.ok(r.avisos.some(a => /Bonus: perguntas/.test(a)))
})

test('buraco na numeracao avisa mesmo com aula sem numero na lista (a aula 2 sumia assim)', () => {
  const r = ordenarAulas([invertida[0], invertida[2], { id: 'x', titulo: 'Bonus', duracao: 1 }, invertida[5]])
  assert.ok(r.avisos.some(a => /faltando: 2, 3, 5/.test(a)))
})

test('cada aula traz os tokens dela, pra refazer a conta depois de tirar aula', () => {
  const r = ordenarAulas(invertida)
  assert.equal(r.aulas[0].tokens_gemini, 467 * TOKENS_POR_SEGUNDO)
})

test('numero repetido ou buraco na sequencia vira aviso, nunca some calado', () => {
  const r = ordenarAulas([invertida[5], { id: 'z', titulo: 'Revisao AULA 1', duracao: 60 }, invertida[2]])
  assert.equal(r.criterio, 'ordem da playlist')
  assert.deepEqual(r.aulas.map(a => a.id), ['a', 'z', 'd'])
  assert.ok(r.avisos.some(a => /repetido/.test(a)))
  const b = ordenarAulas([invertida[5], invertida[2]])
  assert.equal(b.criterio, 'numero no titulo')
  assert.ok(b.avisos.some(a => /faltando: 2, 3/.test(a)))
})

test('tokensGemini usa a taxa medida e soma a duracao do curso', () => {
  assert.equal(tokensGemini(100), 100 * TOKENS_POR_SEGUNDO)
  const r = ordenarAulas(invertida)
  assert.equal(r.segundos, 467 + 462 + 481 + 1175 + 1688 + 1212)
  assert.equal(r.tokens_gemini, r.segundos * TOKENS_POR_SEGUNDO)
})

test('lista vazia volta vazia com aviso', () => {
  const r = ordenarAulas([])
  assert.deepEqual(r.aulas, [])
  assert.ok(r.avisos.length)
})
