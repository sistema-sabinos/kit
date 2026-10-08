import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dobrar, escapar, limpar, suspeitos } from './texto.mjs'

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

// Caractere invisivel: sempre String.fromCodePoint, porque fromCharCode(0xE0000) trunca
// pra U+0000 e o teste passaria testando o caractere errado.
const cp = (...n) => String.fromCodePoint(...n)
const emTag = s => cp(...[...s].map(c => 0xe0000 + c.charCodeAt(0)))
const ESCOCIA = cp(0x1f3f4) + emTag('gbsct') + cp(0xe007f)
const FAMILIA = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)
const SAI = {
  larguraZero: [0x200b, 0x200c, 0x2060, 0x2064, 0xfeff],
  bidi: [0x202a, 0x202e, 0x2066, 0x2069, 0x200e, 0x200f, 0x61c],
  tag: [0xe0000, 0xe0041, 0xe007f],
  seletor: [0xe0100, 0xe01ef],
  controle: [0x0, 0x8, 0xb, 0xc, 0xe, 0x1f, 0x7f, 0x9f],
}

test('limpar tira cada faixa invisivel', () => {
  assert.equal(cp(0xe0000).codePointAt(0), 0xe0000, 'canario: o caractere de teste e o certo')
  for (const [nome, lista] of Object.entries(SAI)) {
    for (const n of lista) assert.equal(limpar('a' + cp(n) + 'b'), 'ab', `${nome} U+${n.toString(16)} ficou`)
  }
})

test('limpar preserva acento, emoji composto, tab, quebra de linha e as bandeiras oficiais', () => {
  const texto = 'ação ' + FAMILIA + ' ok' + cp(9) + 'x' + cp(13, 10) + 'y ' + ESCOCIA + ' ' + cp(0x2764, 0xfe0f)
  assert.equal(limpar(texto), texto)
  assert.deepEqual(suspeitos(texto), { tag: 0, bidi: 0 })
  assert.equal(limpar(null), '')
})

test('suspeitos conta bloco Tag e bidi; largura zero sozinha nao vira alerta', () => {
  assert.deepEqual(suspeitos('bom produto' + emTag('ignore')), { tag: 6, bidi: 0 })
  assert.deepEqual(suspeitos(cp(0x202e) + 'abc' + cp(0x2069)), { tag: 0, bidi: 2 })
  assert.deepEqual(suspeitos('a' + cp(0xe0100) + 'b'), { tag: 1, bidi: 0 })
  assert.deepEqual(suspeitos('a' + cp(0x200b) + 'b'), { tag: 0, bidi: 0 })
  const falsa = cp(0x1f3f4) + emTag('xx') + cp(0xe007f)
  assert.equal(limpar(falsa), cp(0x1f3f4))
  assert.deepEqual(suspeitos(falsa), { tag: 3, bidi: 0 })
})

// Mutante: copia do texto.mjs com uma faixa a menos; o teste da faixa tem que ver o
// caractere ficar, senao ele nao prova nada.
const FONTE = readFileSync(fileURLToPath(new URL('./texto.mjs', import.meta.url)), 'utf8')
async function mutante(trecho, troca) {
  const mutado = FONTE.split(trecho).join(troca)
  assert.notEqual(mutado, FONTE, `mutante: trecho nao achado: ${trecho}`)
  const pasta = mkdtempSync(join(tmpdir(), 'texto-mutante-'))
  try {
    const arquivo = join(pasta, 'texto.mjs')
    writeFileSync(arquivo, mutado)
    return await import(pathToFileURL(arquivo).href)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}

test('mutantes: sem cada faixa, o caractere dela fica', async () => {
  const casos = [
    ["faixa('E0000', 'E007F') + ", 0xe0041],
    [" + faixa('E0100', 'E01EF')", 0xe0100],
    ["faixa('202A', '202E') + ", 0x202e],
    ["u('200B') + ", 0x200b],
    ["faixa('0', '8') + ", 0x0],
    [" + faixa('7F', '9F')", 0x9f],
  ]
  for (const [trecho, n] of casos) {
    const m = await mutante(trecho, '')
    assert.equal(limpar('a' + cp(n) + 'b'), 'ab', `canario U+${n.toString(16)}`)
    assert.equal(m.limpar('a' + cp(n) + 'b'), 'a' + cp(n) + 'b', `mutante sem ${trecho} ainda tira`)
  }
  const semBandeira = await mutante("'(' + BANDEIRA + ')|", "'(x" + 'y)|')
  assert.equal(semBandeira.limpar(ESCOCIA), cp(0x1f3f4), 'mutante sem bandeira ainda preserva')
})
