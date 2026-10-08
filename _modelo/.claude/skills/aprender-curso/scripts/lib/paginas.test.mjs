// Testes das paginas do PDF. Sem pdftotext: o texto e montado aqui, com o form feed e o CR
// montados por codigo, igual ao que o pdftotext devolve.
// Rodar: node --test paginas.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cortarPaginas, marcarPaginas, medir, veredito, tokensEstimados,
  LIMITE_LETRAS, LIMITE_SUBSTITUICAO, RAZAO_TOKENS,
} from './paginas.mjs'

const FF = String.fromCharCode(12)
const CR = String.fromCharCode(13)
const SUBST = String.fromCharCode(0xFFFD)
const acao = 'a' + String.fromCharCode(0xE7) + String.fromCharCode(0xE3) + 'o'

// Pagina de texto real: frase de apostila repetida ate passar folgado do limite de letras.
const frase = `O metodo do curso diz que a ${acao} diaria vem antes do resultado e que o caixa manda na decisao. `
const cheia = frase.repeat(6)

test('cortarPaginas corta no form feed e descarta o vazio depois do ultimo', () => {
  const paginas = cortarPaginas(`um${FF}dois${FF}tres${FF}`)
  assert.deepEqual(paginas, ['um', 'dois', 'tres'])
})

test('cortarPaginas tira o CR e mantem a pagina vazia do meio', () => {
  const paginas = cortarPaginas(`linha 1${CR}\nlinha 2${CR}\n${FF}${FF}fim${FF}`)
  assert.deepEqual(paginas, ['linha 1\nlinha 2\n', '', 'fim'])
  assert.ok(!paginas.join('').includes(CR))
})

test('marcarPaginas poe [p. N] no comeco de cada pagina e preserva o acento', () => {
  const texto = marcarPaginas(cortarPaginas(`a ${acao}${FF}segunda${FF}`))
  assert.equal(texto, `[p. 1]\na ${acao}\n[p. 2]\nsegunda`)
  assert.equal(texto.match(/\[p\. \d+\]/g).length, 2)
  assert.ok(texto.includes(acao))
})

test('canario: texto real de 3 paginas sai texto, sem pagina de fora', () => {
  const medida = medir(cortarPaginas(`${cheia}${FF}${cheia}${FF}${cheia}${FF}`))
  assert.equal(medida.paginas, 3)
  assert.ok(medida.porPagina.every(p => p.letras >= LIMITE_LETRAS), 'canario sem letras suficientes')
  assert.ok(medida.palavras > 0)
  assert.deepEqual(veredito(medida), { rotulo: 'texto', semTexto: [] })
})

test('escaneado: todas as paginas vazias saem escaneado', () => {
  const medida = medir(cortarPaginas(`${FF}  \n${FF}${FF}`))
  assert.equal(medida.paginas, 3)
  assert.deepEqual(veredito(medida), { rotulo: 'escaneado', semTexto: [1, 2, 3] })
})

test('pagina curta de verdade conta como texto', () => {
  const curta = 'Nunca misture o caixa pessoal com o caixa da empresa.'
  const medida = medir(cortarPaginas(`${curta}${FF}Cap${String.fromCharCode(0xED)}tulo 3${FF}`))
  assert.equal(medida.paginas, 2)
  assert.deepEqual(veredito(medida), { rotulo: 'texto', semTexto: [] })
})

test('PDF misto lista as paginas sem texto e nunca sai texto', () => {
  const medida = medir(cortarPaginas(`${cheia}${FF}${FF}${FF}`))
  assert.equal(medida.paginas, 3)
  assert.ok(medida.porPagina[0].letras >= LIMITE_LETRAS * 3, 'pagina 1 precisa estar cheia pra media enganar')
  const v = veredito(medida)
  assert.equal(v.rotulo, 'misto')
  assert.deepEqual(v.semTexto, [2, 3])
})

test('caractere de substituicao alto marca a pagina como sem texto', () => {
  const letras = medir([cheia]).porPagina[0].letras
  const ruim = cheia + SUBST.repeat(Math.ceil(letras * LIMITE_SUBSTITUICAO * 2))
  const medida = medir([cheia, ruim])
  assert.ok(medida.porPagina[1].substituicao > 0, 'substituicao nao contada')
  assert.deepEqual(veredito(medida), { rotulo: 'misto', semTexto: [2] })
})

test('tokensEstimados devolve null enquanto a razao nao foi medida', () => {
  assert.equal(tokensEstimados(1000, { tokensPorPalavra: null }), null)
})

test('tokensEstimados usa a razao medida, com data e modelo', () => {
  assert.equal(typeof RAZAO_TOKENS.tokensPorPalavra, 'number')
  assert.match(RAZAO_TOKENS.medidoEm, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(RAZAO_TOKENS.modelo)
  assert.equal(tokensEstimados(1000), Math.round(1000 * RAZAO_TOKENS.tokensPorPalavra))
})
