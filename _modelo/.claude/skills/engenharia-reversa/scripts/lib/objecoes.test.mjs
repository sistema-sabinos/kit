// Testes das objecoes sem resposta. Rodar: node --test objecoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, palavrasDeConteudo, pareceUmaPergunta, mesmaObjecao, objecoesNaoRespondidas, coberturaDePerguntas } from './objecoes.mjs'

const q = (...textos) => textos.map(pergunta => ({ pergunta, resposta: null }))

test('normalizar tira acento, pontuacao e caixa', () => {
  assert.equal(normalizar('  Ótima, pra Água-quente?! '), 'otima pra agua quente')
})

test('palavras de conteudo tiram cortesia, interrogativa e palavra curta sem assunto', () => {
  assert.deepEqual(palavrasDeConteudo('Boa tarde, consigo escolher as cores?'), ['escolher', 'cores'])
  assert.deepEqual(palavrasDeConteudo('tem tampa de 500 ml?'), ['tampa', 'ml'])
})

test('pergunta: com interrogacao, com abertura depois do cumprimento, e elogio fora', () => {
  assert.equal(pareceUmaPergunta('mantem quente por quantas horas?'), true)
  assert.equal(pareceUmaPergunta('boa tarde serve para cafe'), true)
  assert.equal(pareceUmaPergunta('Sao otimas, amei demais'), false)
  assert.equal(pareceUmaPergunta('oi'), false)
})

test('mesma objecao: sobreposicao sobre o menor conjunto, com piso de 2 palavras', () => {
  assert.equal(mesmaObjecao(['escolher', 'cores'], ['escolher', 'cores', 'canecas']), true)
  assert.equal(mesmaObjecao(['serve', 'tecido'], ['serve', 'decupagem']), false)
})

test('variacoes agrupam e o grupo repetido sai validada, antes das avulsas', () => {
  const r = objecoesNaoRespondidas([
    { id: 'A', descricao: 'Caneca de inox.', perguntas: q('Consigo escolher as cores?', 'Aceita devolucao depois de usar?') },
    { id: 'B', descricao: 'Tampa rosqueavel.', perguntas: q('Posso escolher as cores das canecas?') },
  ])
  assert.equal(r[0].validada, true)
  assert.equal(r[0].ocorrencias, 2)
  assert.equal(r[0].anuncios, 2)
  assert.equal(r[0].variacoes.length, 2)
  assert.equal(r[1].validada, false)
})

test('corpus por concorrente: palavras espalhadas em dois anuncios nao respondem juntas', () => {
  const perguntas = q('Aguenta lava louca automatica?')
  const espalhado = [
    { id: 'A', descricao: 'Pode ir na lava rapido.', perguntas },
    { id: 'B', descricao: 'Lavagem louca automatica opcional.' },
  ]
  // A cobre "lava" e "louca" nao; B cobre "louca" e "automatica" mas nao "aguenta" nem "lava":
  // nenhum sozinho chega a 60% das 4 palavras (aguenta, lava, louca, automatica)
  assert.equal(objecoesNaoRespondidas(espalhado).length, 1)
  const umSo = [{ id: 'A', descricao: 'Aguenta lava louca automatica sem problema.', perguntas }]
  assert.equal(objecoesNaoRespondidas(umSo).length, 0)
})

test('texto das fotos (com --ver) tambem responde', () => {
  const r = objecoesNaoRespondidas([{ id: 'A', descricao: '', textos_fotos: ['Mantem quente 12 horas'], perguntas: q('Mantem quente quantas horas?') }])
  assert.equal(r.length, 0)
})

test('so pergunta lida por elemento entra: texto solto de rodape nao vira objecao', () => {
  const r = objecoesNaoRespondidas([{ id: 'A', descricao: '', perguntas: ['Como cuidamos da sua privacidade?', { linha: 'Denunciar' }, ...q('Vem com tampa extra?')] }])
  assert.deepEqual(r.map(o => o.texto), ['Vem com tampa extra?'])
})

test('cobertura diz sobre quantos anuncios a lista foi montada e quais vieram sem pergunta', () => {
  const c = coberturaDePerguntas([{ id: 'A', perguntas: q('Tem azul?', 'Tem rosa?') }, { id: 'B', perguntas: [] }, { id: 'C' }])
  assert.deepEqual(c, { anuncios: 3, com_perguntas: 1, perguntas: 2, sem_perguntas: ['B', 'C'] })
})
