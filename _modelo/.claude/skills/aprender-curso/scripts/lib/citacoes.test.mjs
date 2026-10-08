// Testes da busca e da conferencia de citacoes (aula N, marca).
// Rodar: node --test lib/citacoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharCitacoes, acharForaDoFormato, conferir } from './citacoes.mjs'

test('acha citacao de minuto, de hora e de pagina com a linha certa', () => {
  const c = acharCitacoes('Intro\nO caixa manda (aula 2, 6:15).\nRevisao (aula 10, 1:02:03) e apostila (aula 1, p. 41).')
  assert.ok(c.length > 0, 'saida veio vazia')
  assert.deepEqual(c, [
    { aula: 2, marca: '6:15', linha: 2 },
    { aula: 10, marca: '1:02:03', linha: 3 },
    { aula: 1, marca: 'p. 41', linha: 3 },
  ])
})

test('varias citacoes na mesma linha saem separadas', () => {
  const c = acharCitacoes('Isso aparece (aula 3, 9:00), (aula 4, 12:40) e (aula 5, p. 2).')
  assert.deepEqual(c.map(x => `${x.aula}|${x.marca}`), ['3|9:00', '4|12:40', '5|p. 2'])
})

test('ignora texto parecido fora do formato', () => {
  const texto = 'Na aula 3 ele fala disso. (aula 3) (aula 3,6:15) (Aula 3, 6:15) (aula 3, minuto 6) (aula x, 6:15)'
  assert.deepEqual(acharCitacoes(texto), [])
  // canario: o mesmo texto com uma citacao valida acha so ela
  assert.equal(acharCitacoes(`${texto} (aula 3, 6:15)`).length, 1)
})

test('citacao quase no formato vira problema em vez de sumir', () => {
  const quase = ['(aula 3, 6:5)', '(Aula 3, 6:15)', '(aula 3, p.41)', '(aula 3,  6:15)', '(aula  3, 6:15)',
    '(aula 3, 12:40 a 13:10)', '(aula 3, p. 41-42)', '(aulas 3 e 4, 6:15)', '(aula 3, 6:15; aula 4, 1:00)', '(aula 3, 6:15']
  const texto = `Na aula 3 ele fala disso. Valida (aula 3, 6:15) e (aula 1, p. 4).\n${quase.join(' x ')}`
  const fora = acharForaDoFormato(texto)
  assert.ok(fora.length > 0, 'saida veio vazia')
  assert.deepEqual(fora.map(f => f.trecho), quase)
  assert.ok(fora.every(f => f.linha === 2))
})

test('citacao valida passa', () => {
  const r = conferir([{ aula: 3, marca: '6:15', linha: 1 }, { aula: 3, marca: 'p. 4', linha: 2 }],
    [{ nome: '03-metodo.md', texto: '[6:15] fala\n[p. 4] apostila' }])
  assert.deepEqual(r, { ok: true, problemas: [] })
})

test('aula inexistente reprova', () => {
  const r = conferir([{ aula: 7, marca: '1:00', linha: 1 }], [{ nome: '03-metodo.md', texto: '[1:00]' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, ['aula 7 nao existe em aulas/'])
})

test('marca ausente no arquivo da aula reprova', () => {
  const r = conferir([{ aula: 3, marca: '9:99', linha: 1 }], [{ nome: '03-metodo.md', texto: '[6:15] fala\n9:99 sem colchete' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, ['aula 3 sem a marca [9:99]'])
})

test('aula em dois arquivos lista os dois em ordem', () => {
  const r = conferir([{ aula: 3, marca: '1:00', linha: 1 }],
    [{ nome: '03-b.md', texto: '[1:00]' }, { nome: '03-a.md', texto: '[1:00]' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, ['aula 3 em dois arquivos: 03-a.md, 03-b.md'])
})

test('numero com zero a esquerda no arquivo casa com a aula', () => {
  const r = conferir([{ aula: 3, marca: '2:00', linha: 1 }, { aula: 12, marca: 'p. 1', linha: 1 }],
    [{ nome: '003-x.md', texto: '[2:00]' }, { nome: '12-y.md', texto: '[p. 1]' }, { nome: '30-z.md', texto: '' }])
  assert.deepEqual(r, { ok: true, problemas: [] })
})
