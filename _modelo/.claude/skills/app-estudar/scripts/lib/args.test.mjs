import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerArgs, numero } from './args.mjs'

test('lerArgs sem lista de multiplos le valor simples, flag solta e posicionais', () => {
  const a = lerArgs(['funcoes.csv', '--minimo', '80', 'outro.csv', '--json'])
  assert.deepEqual(a._, ['funcoes.csv', 'outro.csv'])
  assert.equal(a.minimo, '80')
  assert.equal(a.json, true)
})

test('lerArgs junta valor multiplo ate o proximo --', () => {
  const a = lerArgs(['funcoes.csv', '--visual', 'a.json', 'b.json', '--json'], ['visual'])
  assert.deepEqual(a.visual, ['a.json', 'b.json'])
  assert.equal(a.json, true)
  assert.deepEqual(a._, ['funcoes.csv'])
})

test('lerArgs com multiplo repetido acumula e sem valor fica lista vazia', () => {
  const a = lerArgs(['--visual', 'a.json', '--visual', 'pasta', '--avoid'], ['visual', 'avoid'])
  assert.deepEqual(a.visual, ['a.json', 'pasta'])
  assert.deepEqual(a.avoid, [])
  assert.deepEqual(a._, [])
})

test('numero aceita virgula, usa o padrao e reprova fora da faixa', () => {
  assert.equal(numero({ minimo: '7,5' }, 'minimo', 80), 7.5)
  assert.equal(numero({}, 'minimo', 80), 80)
  assert.throws(() => numero({ minimo: '200' }, 'minimo', 80, { min: 0, max: 100 }), /--minimo precisa ser numero entre 0 e 100/)
  assert.throws(() => numero({ minimo: 'abc' }, 'minimo', 80), /--minimo/)
})
