import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dobrar, escapar } from './texto.mjs'

test('dobrar tira acento e poe em minuscula', () => {
  assert.equal(dobrar('PREÇO da Ação é ótimo, não'), 'preco da acao e otimo, nao')
  assert.equal(dobrar('preço'), dobrar('preco'))
  assert.equal(dobrar('PREÇO'), 'preco')
})

test('dobrar mantem o tamanho e a posicao de cada caractere', () => {
  const emoji = String.fromCodePoint(0x1f600)
  const s = 'Veio ' + emoji + ' QUEBRADO, ação'
  const d = dobrar(s)
  assert.equal(d.length, s.length)
  assert.equal(d.indexOf('quebrado'), s.indexOf('QUEBRADO'))
  assert.equal(s.slice(d.indexOf('quebrado'), d.indexOf('quebrado') + 8), 'QUEBRADO')
  assert.ok(d.includes(emoji))
})

test('dobrar aceita vazio e nulo', () => {
  assert.equal(dobrar(''), '')
  assert.equal(dobrar(null), '')
  assert.equal(dobrar(undefined), '')
})

test('escapar deixa todo caractere especial literal, com a flag u', () => {
  const barra = String.fromCharCode(92)
  const especiais = '^$.*+?()[]{}|/' + barra
  for (const c of especiais) {
    const rx = new RegExp('^' + escapar('a' + c + 'b') + '$', 'u')
    assert.ok(rx.test('a' + c + 'b'), `nao casou o literal com ${c}`)
    assert.ok(!rx.test('axb'), `${c} virou curinga`)
  }
  for (const s of ['meu-app', 'app.com.br', 'a_b c', 'R$ 9,90 (promo)']) {
    assert.ok(new RegExp('^' + escapar(s) + '$', 'iu').test(s.toUpperCase()), s)
  }
  assert.equal(escapar(''), '')
})
