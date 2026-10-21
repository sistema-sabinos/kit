// Testes da ordem das aulas. Sem rede: os titulos sao os de uma playlist real que veio de tras pra frente.
// Rodar: node --test aulas.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroDaAula, ordenarAulas, tokensGemini, TOKENS_POR_SEGUNDO, lotesDoCurso, textoDosLotes } from './aulas.mjs'

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

// 5.21, tarefa 3.2: curso grande em lotes, um lote por conversa
const H = 3600
const curtas = n => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, titulo: `Aula ${i + 1}`, duracao: 600 }))
const comDuracao = (...d) => d.map((duracao, i) => ({ id: `d${i + 1}`, titulo: `Aula ${i + 1}`, duracao }))

test('lotesDoCurso: tabela de cursos pequeno, longo, sem duracao e com aula maior que o teto', () => {
  const casos = [
    { nome: 'curso pequeno sai sem lote', aulas: invertida, lotes: '' },
    { nome: '15 aulas curtas ainda cabem numa conversa', aulas: curtas(15), lotes: '' },
    { nome: '8 h certinhas ainda cabem numa conversa', aulas: comDuracao(4 * H, 4 * H), lotes: '' },
    { nome: '8 h e 1 s ja viram lote', aulas: comDuracao(4 * H, 4 * H + 1), lotes: 'L1 aula 1, L2 aula 2' },
    { nome: '16 aulas curtas dao 2 lotes', aulas: curtas(16), lotes: 'L1 aulas 1-8, L2 aulas 9-16' },
    { nome: '3 aulas de 3 h dao um lote por aula', aulas: comDuracao(3 * H, 3 * H, 3 * H), lotes: 'L1 aula 1, L2 aula 2, L3 aula 3' },
    { nome: 'aula sem duracao conta 0 s e entra no lote', aulas: comDuracao(3 * H, null, 3 * H, 3 * H), lotes: 'L1 aulas 1-2, L2 aula 3, L3 aula 4' },
    { nome: 'curso todo sem duracao vale o teto de aulas', aulas: curtas(17).map(a => ({ ...a, duracao: null })), lotes: 'L1 aulas 1-8, L2 aulas 9-16, L3 aula 17' },
    { nome: 'aula maior que o teto fica num lote sozinha', aulas: comDuracao(5 * H, 2 * H, 2 * H), lotes: 'L1 aula 1, L2 aulas 2-3' },
  ]
  for (const c of casos) {
    const lotes = lotesDoCurso(c.aulas)
    assert.equal(textoDosLotes(lotes), c.lotes, c.nome)
    if (!lotes.length) continue
    // soma das aulas dos lotes = total, sem repetir nem perder aula
    const posicoes = lotes.flatMap(l => Array.from({ length: l.ate - l.de + 1 }, (_, i) => l.de + i))
    assert.deepEqual(posicoes, c.aulas.map((_, i) => i + 1), c.nome)
    assert.equal(lotes.reduce((s, l) => s + l.aulas, 0), c.aulas.length, c.nome)
  }
})

test('manterOrdem nao reordena, avisa numero repetido e divide em lotes na ordem dada', () => {
  const lista = [{ id: 'b', titulo: 'Bonus', duracao: 60 }, invertida[0], invertida[5], { id: 'm', titulo: 'Modulo B - Aula 1', duracao: 60 }]
  const r = ordenarAulas(lista, { manterOrdem: true })
  assert.deepEqual(r.aulas.map(a => a.id), ['b', 'f', 'a', 'm'])
  assert.equal(r.criterio, 'ordem do arquivo')
  assert.ok(r.avisos.some(a => /repetido \(1\), mantive a ordem do arquivo/.test(a)), r.avisos.join(' | '))
  assert.ok(r.avisos.some(a => a === 'sem numero no titulo: "Bonus"'), r.avisos.join(' | '))
  const grande = ordenarAulas([...curtas(16)].reverse(), { manterOrdem: true })
  assert.deepEqual(grande.aulas.slice(0, 2).map(a => a.id), ['c16', 'c15'])
  assert.equal(textoDosLotes(grande.lotes), 'L1 aulas 1-8, L2 aulas 9-16')
})

test('ordenarAulas devolve os lotes num campo proprio, fora dos avisos', () => {
  const pequeno = ordenarAulas(invertida)
  assert.deepEqual(pequeno.lotes, [])
  const grande = ordenarAulas([...curtas(16)].reverse())
  assert.ok(grande.lotes.length > 0, 'curso grande saiu sem lote')
  assert.deepEqual(grande.lotes.map(l => [l.lote, l.de, l.ate, l.aulas, l.segundos]), [['L1', 1, 8, 8, 4800], ['L2', 9, 16, 8, 4800]])
  assert.deepEqual(grande.aulas.slice(0, 2).map(a => a.id), ['c1', 'c2'])
  assert.deepEqual(grande.avisos, [])
})
