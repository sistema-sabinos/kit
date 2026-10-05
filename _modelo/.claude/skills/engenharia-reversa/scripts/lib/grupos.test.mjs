// Testes de campeao e controle. Rodar: node --test grupos.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receitaEstimada, mediana, embaralhadorFixo, numerosDoTitulo, especificacaoDosCampeoes, especCompativel, separarGrupos, composicao } from './grupos.mjs'

const anuncio = (id, preco, vendidos, extra = {}) => ({ id, titulo: `Caneca Termica ${id}`, preco, vendidos, tipo: 'tradicional', ...extra })

test('receita e preco vezes vendidos, com null valendo zero', () => {
  assert.equal(receitaEstimada(anuncio('a', 20, 500)), 10000)
  assert.equal(receitaEstimada(anuncio('b', 20, null)), 0)
})

test('mediana de lista par, impar e vazia', () => {
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([4, 1, 2, 3]), 2.5)
  assert.equal(mediana([]), null)
})

test('embaralhador com a mesma semente da a mesma ordem', () => {
  const lista = [1, 2, 3, 4, 5, 6, 7, 8]
  assert.deepEqual(embaralhadorFixo('x')(lista), embaralhadorFixo('x')(lista))
  assert.deepEqual([...embaralhadorFixo('x')(lista)].sort(), lista)
})

test('especificacao 80 contra 12: controle de 12 cores sai, campeao de 24 fica nomeado', () => {
  const campeoes = [1, 2, 3, 4].map(i => anuncio(`c${i}`, 30, 1000, { titulo: `Lapis de Cor 80 Cores Kit ${i}` }))
  campeoes.push(anuncio('c5', 30, 900, { titulo: 'Lapis de Cor 24 Cores' }))
  const controle12 = anuncio('k12', 30, 50, { titulo: 'Lapis de Cor 12 Cores' })
  const controleSem = anuncio('ksem', 30, 40, { titulo: 'Lapis de Cor Colorida' })
  const r = separarGrupos([...campeoes, controle12, controleSem], { nCampeoes: 5 })
  assert.deepEqual(numerosDoTitulo('Kit 80 Cores 2'), [80, 2])
  assert.deepEqual(r.diagnostico.especificacao, [80])
  assert.deepEqual(r.controle.map(x => x.id), ['ksem'])
  assert.equal(r.diagnostico.descartados.especificacao_diferente, 1)
  assert.deepEqual(r.diagnostico.campeoes_fora_da_especificacao.map(c => c.id), ['c5'])
  assert.equal(especCompativel('Sem numero', [80]), true)
  assert.deepEqual(especificacaoDosCampeoes([]), [])
})

test('venda desconhecida fica fora do controle e e contada; teto de 200 vendas e faixa de preco valem', () => {
  const campeoes = [1, 2, 3].map(i => anuncio(`c${i}`, 100, 100000))
  const r = separarGrupos([
    ...campeoes,
    anuncio('nulo', 100, null),
    anuncio('alto', 100, 1000),
    anuncio('barato', 10, 50),
    anuncio('caro', 300, 50),
    anuncio('bom', 100, 150),
  ], { nCampeoes: 3 })
  assert.deepEqual(r.controle.map(x => x.id), ['bom'])
  assert.deepEqual(r.diagnostico.descartados, { receita_alta: 0, vendas_desconhecidas: 1, vendas_altas: 1, fora_da_faixa_de_preco: 2, especificacao_diferente: 0 })
  assert.deepEqual(r.diagnostico.faixa_preco, { min: 50, max: 200 })
  assert.equal(r.diagnostico.restricao_nao_cumprida, true)
})

test('receita alta demais pro controle sai pela trava relativa', () => {
  const campeoes = [1, 2, 3].map(i => anuncio(`c${i}`, 100, 150))
  const r = separarGrupos([...campeoes, anuncio('meio', 100, 100), anuncio('baixo', 100, 10)], { nCampeoes: 3 })
  // teto = 15000 x 0,1 = 1500; 'meio' tem 10000
  assert.equal(r.diagnostico.teto_receita, 1500)
  assert.deepEqual(r.controle.map(x => x.id), ['baixo'])
  assert.equal(r.diagnostico.descartados.receita_alta, 1)
})

test('anuncio sem venda nenhuma nunca vira campeao', () => {
  const r = separarGrupos([anuncio('a', 50, null), anuncio('b', 50, 10)], { nCampeoes: 2 })
  assert.deepEqual(r.campeoes.map(x => x.id), ['b'])
})

test('o sorteio do controle e o mesmo em duas rodadas', () => {
  const lista = [anuncio('c', 100, 100000), ...Array.from({ length: 15 }, (_, i) => anuncio(`k${i}`, 100, 10 + i))]
  const a = separarGrupos(lista, { nCampeoes: 1, nControle: 5 })
  const b = separarGrupos(lista, { nCampeoes: 1, nControle: 5 })
  assert.equal(a.controle.length, 5)
  assert.deepEqual(a.controle.map(x => x.id), b.controle.map(x => x.id))
})

test('composicao: maioria dos campeoes em /p/ vira escopo produto; /up/ conta como anuncio', () => {
  const cat = { tipo: 'catalogo' }
  const up = { tipo: 'produto' }
  assert.equal(composicao([cat, cat, up], []).escopo, 'produto')
  assert.equal(composicao([cat, up, up], []).escopo, 'anuncio')
  assert.equal(composicao([cat, up], []).escopo, 'anuncio')
  assert.equal(composicao([], []).escopo, 'anuncio')
  assert.deepEqual(composicao([cat, {}], [up]).controle, { catalogo: 0, produto: 1, tradicional: 0, desconhecido: 0, total: 1 })
})
