// Testes do Gate A. Sem navegador: a pagina entra falsa. Rodar: node --test ml.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlDaBusca, medirPresenca, presencaNoML } from './ml.mjs'

const card = (titulo, rotulo = '', link = '') => ({ titulo, rotulo, link: link || `https://produto.exemplo/${encodeURIComponent(titulo)}` })

test('urlDaBusca: minusculo, espaco vira hifen, acento codificado', () => {
  assert.equal(urlDaBusca(' Max Titanium '), 'https://lista.mercadolivre.com.br/max-titanium')
  assert.equal(urlDaBusca('Ypê'), 'https://lista.mercadolivre.com.br/yp%C3%AA')
})

test('presente: 3 ou mais anuncios com a marca no titulo ou no rotulo do cartao', () => {
  const bruto = { qtd: '1.234 resultados', itens: [card('Whey Acme 900g'), card('Isolado Termofort', 'ACME'), card('Creatina Acme'), card('Outra coisa')] }
  const r = medirPresenca(bruto, 'Acme')
  assert.equal(r.veredito, 'PRESENTE')
  assert.equal(r.totalBusca, 1234)
  assert.equal(r.anunciosComAMarca, 3)
  assert.equal(r.cardsLidos, 4)
})

test('apelido conta; rara abaixo de 3', () => {
  const bruto = { qtd: '80 resultados', itens: [card('Termofort 60 caps'), card('Outra marca')] }
  assert.equal(medirPresenca(bruto, 'Acme', ['Termofort']).veredito, 'RARA')
})

test('cartao repetido (mesmo link) conta uma vez so', () => {
  const um = card('Whey Acme', '', 'https://produto.exemplo/1')
  const bruto = { qtd: '3 resultados', itens: [um, { ...um }, card('Acme Creatina', '', 'https://produto.exemplo/2')] }
  const r = medirPresenca(bruto, 'Acme')
  assert.equal(r.cardsLidos, 2)
  assert.equal(r.veredito, 'RARA')
})

test('marca limpa do site: pagina de nenhum anuncio e AUSENTE, nunca erro', () => {
  const r = medirPresenca({ qtd: '', itens: [], semResultado: true }, 'Acme')
  assert.equal(r.veredito, 'AUSENTE')
  assert.equal(r.totalBusca, 0)
})

test('busca com cartoes mas nenhum da marca e AUSENTE', () => {
  const r = medirPresenca({ qtd: '9.000 resultados', itens: [card('Produto qualquer'), card('Outro')] }, 'Acme')
  assert.equal(r.veredito, 'AUSENTE')
  assert.equal(r.totalBusca, 9000)
})

test('zero cartao sem a pagina de nenhum anuncio e erro: o layout mudou', () => {
  assert.throws(() => medirPresenca({ qtd: '', itens: [], semResultado: false }, 'Acme'), /nenhum anuncio lido/)
})

test('marca com acento casa com titulo sem acento', () => {
  const bruto = { qtd: '500 resultados', itens: [card('Detergente YPE 500ml'), card('Lava-louças Ypê'), card('Ype Clear')] }
  assert.equal(medirPresenca(bruto, 'Ypê').veredito, 'PRESENTE')
})

function paginaFalsa({ url = 'https://lista.mercadolivre.com.br/acme', bruto }) {
  const visitas = []
  return {
    visitas,
    goto: async u => { visitas.push(u) },
    waitForTimeout: async () => {},
    url: () => url,
    evaluate: async () => bruto,
  }
}

test('presencaNoML abre a busca da marca e mede', async () => {
  const page = paginaFalsa({ bruto: { qtd: '10 resultados', itens: [card('Acme 1'), card('Acme 2'), card('Acme 3')] } })
  const r = await presencaNoML(page, 'Acme', [], { esperarMs: 0 })
  assert.deepEqual(page.visitas, ['https://lista.mercadolivre.com.br/acme'])
  assert.equal(r.url, 'https://lista.mercadolivre.com.br/acme')
  assert.equal(r.veredito, 'PRESENTE')
})

test('presencaNoML para quando o Mercado Livre pede login', async () => {
  const page = paginaFalsa({ url: 'https://www.mercadolivre.com.br/login?x=1', bruto: { itens: [] } })
  await assert.rejects(presencaNoML(page, 'Acme', [], { esperarMs: 0 }), /pediu login/)
})

test('presencaNoML le de novo quando a pagina navegou no meio da leitura', async () => {
  let vezes = 0
  const page = paginaFalsa({ bruto: { qtd: '10 resultados', itens: [card('Acme 1'), card('Acme 2'), card('Acme 3')] } })
  const ler = page.evaluate
  page.evaluate = async () => {
    vezes++
    if (vezes === 1) throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation')
    return ler()
  }
  const r = await presencaNoML(page, 'Acme', [], { esperarMs: 0 })
  assert.equal(vezes, 2)
  assert.equal(r.veredito, 'PRESENTE')
})

test('presencaNoML nao engole outro erro da pagina', async () => {
  const page = paginaFalsa({ bruto: {} })
  page.evaluate = async () => { throw new Error('Target closed') }
  await assert.rejects(presencaNoML(page, 'Acme', [], { esperarMs: 0 }), /Target closed/)
})
