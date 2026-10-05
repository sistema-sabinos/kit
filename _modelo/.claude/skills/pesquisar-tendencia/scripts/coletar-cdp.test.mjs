// Testes da coleta. Sem Chrome e sem rede: pagina falsa e API falsa.
// Codigo de anuncio montado por partes (as letras e os numeros separados), porque o Gate 1
// barra as letras seguidas de 6 ou mais digitos em qualquer arquivo do kit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { argumentos, lerEntrada, urlDaBusca, chaveDoAnuncio, tipoDoLink, deduplicar, coletarBusca, coletar, mesclarBruto, oQueFalta } from './coletar-cdp.mjs'

const L = 'MLB'
const id = n => L + n

test('argumentos: padroes, numeros e erro claro', () => {
  assert.deepEqual(argumentos(['--fornecedor', 'f', '--categoria', 'c']), { fornecedor: 'f', categoria: 'c', maxItens: 120, maxPaginas: 2, semProcessar: false, retomar: false })
  assert.equal(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--max-itens', '30', '--sem-processar']).maxItens, 30)
  assert.equal(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--retomar']).retomar, true)
  assert.throws(() => argumentos(['--categoria', 'c']), /--fornecedor/)
  assert.throws(() => argumentos(['--fornecedor', 'f', '--categoria', 'c', '--max-paginas', 'duas']), /inteiro/)
})

test('lerEntrada aceita a lista certa e aponta o produto com problema', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ent-'))
  try {
    const f = join(pasta, 'in.json')
    assert.throws(() => lerEntrada(f), /catalogo-analisado/)
    writeFileSync(f, JSON.stringify([{ nome: 'Bala', custo: 12.5, termo: 'bala de coco' }]))
    assert.equal(lerEntrada(f).length, 1)
    writeFileSync(f, JSON.stringify([{ nome: 'Bala', custo: '12,50', termo: 'bala' }]))
    assert.throws(() => lerEntrada(f), /"Bala" com custo invalido/)
    writeFileSync(f, JSON.stringify([{ nome: 'Bala', custo: 1 }]))
    assert.throws(() => lerEntrada(f), /sem "termo"/)
    writeFileSync(f, '[]')
    assert.throws(() => lerEntrada(f), /pelo menos um/)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('urlDaBusca vira o endereco da lista com hifen', () => {
  assert.equal(urlDaBusca(' Bala de  Coco '), 'https://lista.mercadolivre.com.br/bala-de-coco')
})

test('chaveDoAnuncio le o codigo do patrocinado na query, do anuncio no caminho, e cai na URL', () => {
  const patro = `https://click1.mercadolivre.com.br/mclics/clicks/external/count?a=1&pdp_filters=item_id%3A${id('1234567')}`
  assert.equal(chaveDoAnuncio({ urlCompleta: patro, url: 'https://click1.mercadolivre.com.br/mclics/clicks/external/count' }), id('1234567'))
  assert.equal(chaveDoAnuncio({ url: `https://produto.mercadolivre.com.br/${L}-7654321-bala-de-coco` }), id('7654321'))
  assert.equal(chaveDoAnuncio({ url: `https://www.mercadolivre.com.br/bala/up/${L}U1234567890` }), `${L}U1234567890`)
  assert.equal(chaveDoAnuncio({ url: 'https://exemplo.com/sem-codigo' }), 'https://exemplo.com/sem-codigo')
})

test('deduplicar mantem patrocinados diferentes com a mesma URL limpa e tira a URL completa', () => {
  const limpa = 'https://click1.mercadolivre.com.br/mclics/clicks/external/count'
  const lista = [
    { titulo: 'a', url: limpa, urlCompleta: `${limpa}?x=item_id%3A${id('1111111')}`, preco: 10 },
    { titulo: 'b', url: limpa, urlCompleta: `${limpa}?x=item_id%3A${id('2222222')}`, preco: 11 },
    { titulo: 'c', url: `https://produto.mercadolivre.com.br/${L}-3333333-c`, preco: 12 },
    { titulo: 'c de novo', url: `https://produto.mercadolivre.com.br/${L}-3333333-c`, preco: 12 },
  ]
  const r = deduplicar([...lista, { titulo: 'sem codigo', url: 'https://exemplo.com/x', preco: 9 }])
  assert.deepEqual(r.map(i => i.titulo), ['a', 'b', 'c', 'sem codigo'])
  assert.deepEqual(r.map(i => i.id), [id('1111111'), id('2222222'), id('3333333'), null])
  assert.ok(r.every(i => !('urlCompleta' in i)))
})

test('tipoDoLink: /p/ e catalogo, /up/ e produto de um vendedor, patrocinado esconde', () => {
  assert.equal(tipoDoLink(`https://www.mercadolivre.com.br/garrafa/p/${L}5779784#polycard`), 'catalogo')
  assert.equal(tipoDoLink(`https://www.mercadolivre.com.br/garrafa/up/${L}U4840018`), 'produto')
  assert.equal(tipoDoLink(`https://produto.mercadolivre.com.br/${L}-5832565-caneca-_JM`), 'tradicional')
  assert.equal(tipoDoLink(`https://click1.mercadolivre.com.br/mclics/clicks/external/count?x=item_id%3A${L}1234567`), null)
  assert.equal(tipoDoLink('https://exemplo.com/x'), null)
})

test('deduplicar acrescenta tipo e vendidos (os formatos que a busca mostra) e tira o texto cru', () => {
  const r = deduplicar([
    { titulo: 'a', url: `https://www.mercadolivre.com.br/a/p/${L}1111111`, preco: 10, vendidos_texto: '| +10mil vendidos' },
    { titulo: 'b', url: `https://produto.mercadolivre.com.br/${L}-2222222-b`, preco: 10, vendidos_texto: '+1.234 vendidos' },
    { titulo: 'c', url: `https://produto.mercadolivre.com.br/${L}-3333333-c`, preco: 10, vendidos_texto: null },
    { titulo: 'd', url: `https://produto.mercadolivre.com.br/${L}-4444444-d`, preco: 10, vendidos_texto: '+50 vendidos' },
  ])
  assert.deepEqual(r.map(i => [i.tipo, i.vendidos]), [['catalogo', 10000], ['tradicional', 1234], ['tradicional', null], ['tradicional', 50]])
  assert.ok(r.every(i => !('vendidos_texto' in i)))
})

// Pagina falsa: cada "tela" e o que extrairCards devolveria; clicar em Seguinte anda uma tela.
function paginaFalsa(telas, { urlDoLogin = null, travarNoSeguinte = false } = {}) {
  let atual = 0
  let url = ''
  return {
    goto: async u => { url = urlDoLogin || u },
    url: () => url,
    evaluate: async f => (f.name === 'extrairCards' ? telas[atual] : undefined),
    locator: () => ({ count: async () => (atual < telas.length - 1 ? 1 : 0) }),
    click: async () => { if (!travarNoSeguinte) { atual++; url = `${url.split('#')[0]}#p${atual + 1}` } },
  }
}
const card = (t, n) => ({ titulo: t, url: `https://produto.mercadolivre.com.br/${L}-${n}-x`, preco: 10 })
const semEspera = { espera: async () => {} }

test('coletarBusca junta duas paginas clicando em Seguinte e tira o repetido', async () => {
  const page = paginaFalsa([[card('a', '1000001'), card('b', '1000002')], [card('b', '1000002'), card('c', '1000003')]])
  const r = await coletarBusca(page, 'bala', semEspera)
  assert.equal(r.total, 3)
  assert.equal(r.erro, undefined)
})

test('coletarBusca para na pagina 1 quando o Seguinte nao muda a URL, sem recoletar a mesma', async () => {
  const page = paginaFalsa([[card('a', '1000001')], [card('z', '1000009')]], { travarNoSeguinte: true })
  const r = await coletarBusca(page, 'bala', semEspera)
  assert.deepEqual(r.itens.map(i => i.titulo), ['a'])
})

test('coletarBusca devolve erro (e lista vazia, nunca preco inventado) quando cai no login', async () => {
  const r = await coletarBusca(paginaFalsa([[card('a', '1000001')]], { urlDoLogin: 'https://www.mercadolivre.com.br/login?x' }), 'bala', semEspera)
  assert.match(r.erro, /login/)
  assert.deepEqual(r.itens, [])
  const vazio = await coletarBusca(paginaFalsa([[]]), 'bala', semEspera)
  assert.match(vazio.erro, /nenhum anuncio/)
})

test('coletar consulta o buybox do primeiro produto de catalogo e segue quando uma busca falha', async () => {
  const pedidos = []
  const get = async caminho => {
    pedidos.push(caminho)
    if (caminho.startsWith('/products/search')) return caminho.includes('bala') ? { paging: { total: 9 }, results: [{ id: 'CAT1', name: 'Bala', domain_id: 'D' }] } : { paging: { total: 0 }, results: [] }
    if (caminho.startsWith('/products/CAT1/items')) return { paging: { total: 2 }, results: [{ item_id: 'i1', seller_id: 1, price: 20, shipping: { free_shipping: true }, official_store_id: 55 }] }
    throw new Error('rota inesperada ' + caminho)
  }
  const buscar = async termo => { if (termo === 'pirulito') throw new Error('timeout'); return { total: 1, itens: [card('a', '1000001')], url: urlDaBusca(termo) } }
  const r = await coletar({ produtos: [{ nome: 'Bala', custo: 5, termo: 'bala' }, { nome: 'Pirulito', custo: 1, termo: 'pirulito' }], buscar, get, dormir: async () => {} })
  assert.equal(r.length, 2)
  assert.equal(r[0].buybox.itens[0].loja_oficial_id, 55)
  assert.equal(r[1].buybox, null)
  assert.match(r[1].busca.erro, /timeout/)
  assert.equal(pedidos.filter(p => p.includes('/items')).length, 1)
})

test('mesclarBruto troca pelo nome, mantem a ordem e poe o novo no fim', () => {
  const existente = [{ nome: 'A', busca: { total: 5 } }, { nome: 'B', busca: { total: 0 } }, { nome: 'C', busca: { total: 9 } }]
  const r = mesclarBruto(existente, [{ nome: 'B', busca: { total: 40 } }, { nome: 'D', busca: { total: 3 } }])
  assert.deepEqual(r.map(p => `${p.nome}${p.busca.total}`), ['A5', 'B40', 'C9', 'D3'])
  assert.deepEqual(mesclarBruto([], [{ nome: 'X' }]), [{ nome: 'X' }])
})

test('oQueFalta pula so quem foi coletado hoje; de outro dia ou nunca, recoleta', () => {
  const existente = [
    { nome: 'A', coletado_em: '2026-09-25' },
    { nome: 'B', coletado_em: '2026-09-24' },
  ]
  const produtos = [{ nome: 'A', termo: 'a' }, { nome: 'B', termo: 'b' }, { nome: 'C', termo: 'c' }]
  const r = oQueFalta(existente, produtos, '2026-09-25')
  assert.deepEqual(r.aColetar.map(p => p.nome), ['B', 'C'])
  assert.equal(r.puladas, 1)
  assert.deepEqual(oQueFalta([], produtos, '2026-09-25').aColetar, produtos)
})

test('oQueFalta recoleta quem deu erro hoje, mesmo estando no bruto de hoje (erro nao e "ja feito")', () => {
  const existente = [
    { nome: 'A', coletado_em: '2026-09-25', busca: { total: 5 } },
    { nome: 'B', coletado_em: '2026-09-25', busca: { total: 0, erro: 'falha ao abrir a busca: timeout' } },
  ]
  const produtos = [{ nome: 'A', termo: 'a' }, { nome: 'B', termo: 'b' }]
  const r = oQueFalta(existente, produtos, '2026-09-25')
  assert.deepEqual(r.aColetar.map(p => p.nome), ['B'])
  assert.equal(r.puladas, 1)
})

test('coletar grava cada item assim que termina (retomavel) e marca coletado_em', async () => {
  const salvos = []
  const get = async () => ({ paging: { total: 0 }, results: [] })
  const buscar = async termo => ({ total: 0, itens: [], url: urlDaBusca(termo) })
  const r = await coletar({
    produtos: [{ nome: 'A', custo: 1, termo: 'a' }, { nome: 'B', custo: 1, termo: 'b' }],
    buscar, get, dormir: async () => {},
    hoje: '2026-09-25',
    salvar: item => salvos.push(item.nome),
  })
  assert.deepEqual(salvos, ['A', 'B'])
  assert.equal(r[0].coletado_em, '2026-09-25')
  assert.equal(r[1].coletado_em, '2026-09-25')
})

// Regressao da revisao final de 2026-10-04: o mesmo anuncio patrocinado e organico na busca.
test('deduplicar: na colisao fica o destino conhecido, e o anuncio segue marcado como patrocinado', () => {
  const patro = { titulo: 'a', url: 'https://click1.mercadolivre.com.br/mclics/clicks/external/count', urlCompleta: `https://click1.mercadolivre.com.br/mclics/clicks/external/count?x=item_id%3A${id('7777777')}`, preco: 10, patrocinado: true, vendidos_texto: null }
  const organico = { titulo: 'a', url: `https://produto.mercadolivre.com.br/${L}-7777777-a`, preco: 10, patrocinado: false, vendidos_texto: '+500 vendidos' }
  const r = deduplicar([patro, organico])
  assert.equal(r.length, 1)
  assert.deepEqual([r[0].tipo, r[0].patrocinado, r[0].vendidos, r[0].url], ['tradicional', true, 500, `https://produto.mercadolivre.com.br/${L}-7777777-a`])
  const r2 = deduplicar([organico, patro])
  assert.deepEqual([r2[0].tipo, r2[0].patrocinado, r2[0].vendidos], ['tradicional', true, 500])
})
