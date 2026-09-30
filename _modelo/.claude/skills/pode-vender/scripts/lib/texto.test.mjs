// Testes do casamento de nome de marca. Rodar: node --test texto.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { norm, casaPalavraInteira } from './texto.mjs'

test('norm tira acento, sobe pra maiusculo e junta separador num espaco', () => {
  assert.equal(norm('Ypê  Limpeza-Total'), 'YPE LIMPEZA TOTAL')
  assert.equal(norm(null), '')
})

test('casa palavra inteira, com acento de um lado e sem do outro', () => {
  assert.equal(casaPalavraInteira('DETERGENTE YPE CLEAR 500ML', 'Ypê'), true)
  assert.equal(casaPalavraInteira('Whey Max Titanium 900g', 'max titanium'), true)
})

test('nunca casa pedaco de palavra: marca curta dentro de outra palavra', () => {
  assert.equal(casaPalavraInteira('CHA DE BOLDO 30 SACHES', 'Bold'), false)
  assert.equal(casaPalavraInteira('SINGLE BOND UNIVERSAL', 'Universal Nutrition'), false)
})

test('chave vazia nunca casa', () => {
  assert.equal(casaPalavraInteira('qualquer coisa', ''), false)
  assert.equal(casaPalavraInteira('qualquer coisa', '---'), false)
})
