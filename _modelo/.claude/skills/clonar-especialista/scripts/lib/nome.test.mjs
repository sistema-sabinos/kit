// Testes da busca do nome real na persona.
// Rodar: node --test lib/nome.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharNome, partesDoNome, normalizar, iniciaisDoNome } from './nome.mjs'

test('partes com 4 letras ou mais, sem acento e sem particula curta', () => {
  assert.deepEqual(partesDoNome('José de Souza Araújo'), ['jose', 'souza', 'araujo'])
  assert.deepEqual(partesDoNome('Ana Li'), [])
})

test('acha nome sem acento, maiusculo, espacado e pontuado, com a linha', () => {
  const texto = ['Sou conselheiro.', 'Como diz SOUZA no livro', 'o s.o.u.z.a disse', 'ou s o u z a', 'jose falou'].join('\n')
  const a = acharNome(texto, 'José de Souza')
  assert.ok(a.length > 0, 'saida veio vazia')
  assert.deepEqual(a.map(x => `${x.parte}@${x.linha}`).sort(), ['jose@5', 'souza@2', 'souza@3', 'souza@4'])
})

test('palavra que so contem o nome nao acusa', () => {
  const texto = 'souzandia e josephina e asouza'
  assert.deepEqual(acharNome(texto, 'José de Souza'), [])
  // canario: o mesmo texto com o nome solto acusa
  assert.equal(acharNome(`${texto} souza`, 'José de Souza').length, 1)
})

test('normalizar tira acento e cedilha', () => {
  assert.equal(normalizar('Conceição ÁGUA'), 'conceicao agua')
})

test('acha as iniciais com ponto, inteiras e de primeiro e ultimo nome', () => {
  const a = acharNome('Metodo de J. S. no livro\ncomo R.B.C. ensina\nR. C. diz', 'Rogerio B. Camargo')
  assert.ok(a.length > 0, 'saida veio vazia')
  assert.deepEqual(a.filter(x => x.parte === 'iniciais').map(x => `${x.trecho}@${x.linha}`), ['r.b.c.@2', 'r. c.@3'])
  assert.deepEqual(acharNome('Metodo de J. S. no livro', 'José de Souza').map(x => x.trecho), ['j. s.'])
})

test('iniciais sem ponto nao acusam (JS, RC sao palavra comum)', () => {
  assert.deepEqual(acharNome('codigo em JS e RC do carro', 'José de Souza'), [])
  assert.deepEqual(iniciaisDoNome('José de Souza'), ['js'])
  assert.deepEqual(iniciaisDoNome('Madonna'), [])
})
