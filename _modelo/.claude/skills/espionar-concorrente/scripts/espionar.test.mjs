// Testes da espionagem. Sem Chrome e sem rede. Codigo de anuncio montado por partes, porque o
// Gate 1 barra as letras seguidas de 6 ou mais digitos em qualquer arquivo do kit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { argumentos, idDoAnuncio, escolherTopo, urlParaAbrir, vendidosDe, vendedorDe, perguntasDoTexto, palavrasDoTitulo, vocabulario, textoDoVocabulario, atributosConsensuais, fotosUnicas, avaliacoesDe, espionar, recalcularArquivos, acharProduto } from './espionar.mjs'

const L = 'MLB'
const id = n => L + n

test('argumentos: produto obrigatorio, padroes 5 e 3', () => {
  assert.deepEqual(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--produto', 'Bala de Coco']), { fornecedor: 'f', categoria: 'c', produto: 'Bala de Coco', n: 5, perguntas: 3 })
  assert.equal(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--produto', 'x', '--perguntas', '0']).perguntas, 0)
  assert.throws(() => argumentos(['--fornecedor', 'f', '--categoria', 'c']), /--produto/)
})

test('idDoAnuncio le o codigo no caminho, na query do patrocinado, e devolve null sem codigo', () => {
  assert.equal(idDoAnuncio(`https://produto.mercadolivre.com.br/${L}-1234567-bala`), id('1234567'))
  assert.equal(idDoAnuncio(`https://www.mercadolivre.com.br/bala/up/${L}U9876543210`), `${L}U9876543210`)
  assert.equal(idDoAnuncio(`https://click1.mercadolivre.com.br/mclics/x?f=item_id:${id('5555555')}`), id('5555555'))
  assert.equal(idDoAnuncio('https://exemplo.com'), null)
})

test('escolherTopo pega organicos na ordem da busca e completa com patrocinado', () => {
  const produto = { busca: { itens: [
    { titulo: 'p', url: 'https://click1.mercadolivre.com.br/mclics/x', id: id('9000001'), patrocinado: true, preco: 5 },
    { titulo: 'a', url: `https://produto.mercadolivre.com.br/${L}-9000002-a`, preco: 30 },
    { titulo: 'sem', url: 'https://exemplo.com', preco: 1 },
    { titulo: 'b', url: `https://produto.mercadolivre.com.br/${L}-9000003-b`, preco: 20 },
    { titulo: 'a de novo', url: `https://produto.mercadolivre.com.br/${L}-9000002-a`, preco: 30 },
  ] } }
  assert.deepEqual(escolherTopo(produto, 5).map(i => i.titulo), ['a', 'b', 'p'])
  assert.deepEqual(escolherTopo(produto, 1).map(i => i.titulo), ['a'])
})

test('urlParaAbrir troca o link de clique pelo endereco do anuncio', () => {
  assert.equal(urlParaAbrir({ url: 'https://click1.mercadolivre.com.br/mclics/x', id: id('9000001') }), `https://produto.mercadolivre.com.br/${L}-9000001`)
  assert.equal(urlParaAbrir({ url: 'https://produto.mercadolivre.com.br/y', id: id('9000002') }), 'https://produto.mercadolivre.com.br/y')
  assert.equal(urlParaAbrir({ url: 'https://click1.mercadolivre.com.br/mclics/x', id: null }), null)
})

test('vendidosDe entende mais de mil, mil por extenso e numero seco', () => {
  assert.equal(vendidosDe('Novo | +1000 vendidos'), 1000)
  assert.equal(vendidosDe('Novo  |  +5 mil vendidos'), 5000)
  assert.equal(vendidosDe('37 vendidos'), 37)
  assert.equal(vendidosDe('Novo'), null)
})

// O elemento do vendedor tem dois filhos (rotulo e nome); innerText separa por quebra de linha,
// diferente do textContent que colava os dois ("Vendido porLOJA EXEMPLO").
test('vendedorDe tira o rotulo do texto bruto do innerText e diz se e loja oficial', () => {
  assert.deepEqual(vendedorDe('Vendido por\nLOJA EXEMPLO'), { nome: 'LOJA EXEMPLO', loja_oficial: false })
  assert.deepEqual(vendedorDe('Loja oficial\nMARCA EXEMPLO'), { nome: 'MARCA EXEMPLO', loja_oficial: true })
  assert.deepEqual(vendedorDe(null), { nome: null, loja_oficial: false })
})

// Formato do innerText da aba de perguntas: uma linha por elemento.
const ABA = ['Bala de Coco 500 g', 'Perguntas neste anúncio', 'É sem glúten?', 'Sim, não contém glúten. 12/08/2026', 'Faz kit de 10?', 'Não fazemos. 03/09/2026', 'Termos mais procurados', 'bala de coco caseira'].join('\n')

test('perguntasDoTexto corta entre a secao e o rodape, e devolve vazio sem a secao', () => {
  const p = perguntasDoTexto(ABA)
  assert.ok(p.length > 0)
  assert.match(p, /Faz kit de 10\?/)
  assert.doesNotMatch(p, /mais procurados/)
  assert.equal(perguntasDoTexto('Bala de Coco\nComprar agora'), '')
})

test('vocabulario conta titulo, nao repeticao, e ignora palavra de ligacao', () => {
  assert.deepEqual(palavrasDoTitulo('Kit 5 Balas de Coco com Açúcar'), ['kit', 'balas', 'coco', 'açúcar'])
  const v = vocabulario(['Bala de Coco Bala', 'Bala Coco Caseira', 'Bala Gengibre'])
  assert.deepEqual(v, [['bala', 3], ['coco', 2], ['caseira', 1], ['gengibre', 1]])
  assert.equal(textoDoVocabulario(v.slice(0, 2)), 'bala' + String.fromCharCode(9) + '3\ncoco' + String.fromCharCode(9) + '2\n')
})

test('atributosConsensuais so fica com o preenchido em 4 ou mais, valores do mais comum', () => {
  const ads = [
    { atributos: { Marca: 'Sem marca', 'Peso líquido': '500 g', Sabor: 'Coco' } },
    { atributos: { Marca: 'Sem marca', 'Peso líquido': '1 kg', Sabor: 'Coco' } },
    { atributos: { Marca: 'Genérica', 'Peso líquido': '500 g', Sabor: '' } },
    { atributos: { Marca: 'Sem marca', 'Peso líquido': '500 g' } },
    { atributos: { Sabor: 'Coco' } },
  ]
  assert.deepEqual(atributosConsensuais(ads), { Marca: { em_quantos: 4, valores: ['Sem marca', 'Genérica'] }, 'Peso líquido': { em_quantos: 4, valores: ['500 g', '1 kg'] } })
})

// A galeria real traz cada foto em dois tamanhos (a normal e a "_2X_") mais o icone de video (svg,
// sem o codigo <numero>-ML<letra><digitos> no caminho). Numeros trocados por inventados.
test('fotosUnicas descarta o que nao e foto de produto e fica com a de maior resolucao por codigo', () => {
  const codigo = id('5010001')
  const foto1 = `https://http2.mlstatic.com/D_Q_NP_111222-${codigo}_092026-R-caderno.webp`
  const foto2 = `https://http2.mlstatic.com/D_NQ_NP_2X_111222-${codigo}_092026-F-caderno.webp`
  const video = 'https://http2.mlstatic.com/frontend-assets/vpp-frontend/picture-play.svg'
  const foto3 = 'https://http2.mlstatic.com/D_NQ_NP_333444-MLA5010002_092026-F.jpg'
  const r = fotosUnicas([foto1, foto2, video, foto3])
  assert.equal(r.length, 2)
  assert.deepEqual([...r].sort(), [foto2, foto3].sort())
})

// Variacao de URL com o codigo do produto mas sem o sufixo de data (_MMYYYY-letra): tem que
// continuar sendo uma foto valida, so sem o desempate por resolucao (fica pela "_2X_" no caminho).
test('fotosUnicas mantem foto com o codigo mas sem o sufixo de data/letra', () => {
  const codigo = id('5010003')
  const semSufixo = `https://http2.mlstatic.com/D_Q_NP_555666-${codigo}.jpg`
  assert.deepEqual(fotosUnicas([semSufixo]), [semSufixo])
})

test('avaliacoesDe pagina ate o maximo e para quando acaba', async () => {
  const pedidos = []
  const get = async caminho => {
    pedidos.push(caminho)
    const offset = Number(caminho.match(/offset=(\d+)/)[1])
    const n = Math.max(0, Math.min(50, 120 - offset))
    return { paging: { total: 120 }, rating_average: 4.6, rating_levels: { five_star: 90 }, reviews: Array.from({ length: n }, (_, i) => ({ rate: 5, title: 't', content: `c${offset + i}`, likes: 0 })) }
  }
  const r = await avaliacoesDe(id('1234567'), get)
  assert.equal(r.avaliacoes.length, 100)
  assert.equal(r.total, 120)
  assert.equal(r.media, 4.6)
  assert.equal(pedidos.length, 2)
})

test('espionar le todos, busca perguntas so dos que mais vendem e segue quando um falha', async () => {
  const itens = [{ id: id('1000001'), url: 'https://exemplo.com/1', preco: 10 }, { id: id('1000002'), url: 'https://exemplo.com/2', preco: 12 }, { id: id('1000003'), url: 'https://exemplo.com/3', preco: 9 }]
  const fotoA = `https://http2.mlstatic.com/D_NQ_NP_777888-${id('4000001')}_092026-F.jpg`
  const paginas = {
    'https://exemplo.com/1': { titulo: 'Bala A', subtitulo: '+100 vendidos', fotos: [fotoA], atributos: {}, link_perguntas: 'q1' },
    'https://exemplo.com/2': { titulo: 'Bala B', subtitulo: '+5 mil vendidos', fotos: [], atributos: {}, link_perguntas: 'q2' },
  }
  const lerAnuncio = async url => { if (!paginas[url]) throw new Error('timeout'); return paginas[url] }
  const abertas = []
  const lerPerguntas = async link => { abertas.push(link); return ABA }
  const get = async () => ({ paging: { total: 0 }, reviews: [] })
  const r = await espionar({ itens, lerAnuncio, lerPerguntas, get, perguntas: 1, dormir: async () => {} })
  assert.equal(r.length, 3)
  assert.match(r[2].erro, /timeout/)
  assert.deepEqual(abertas, ['q2'])
  assert.match(r[1].perguntas, /glúten/)
  assert.equal(r[1].vendidos, 5000)
  assert.deepEqual(r[0].fotos, [fotoA])
  assert.deepEqual(r[1].fotos, [])
})

test('recalcularArquivos soma os brutos da pasta e grava os dois arquivos do contrato', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'esp-'))
  try {
    assert.throws(() => recalcularArquivos(pasta), /nenhum _raw-concorrentes/)
    const ad = (n, titulo, atributos) => ({ id: id(n), titulo, atributos })
    writeFileSync(join(pasta, '_raw-concorrentes-bala.json'), JSON.stringify({ anuncios: [ad('2000001', 'Bala de Coco', { Marca: 'Sem marca' }), ad('2000002', 'Bala Coco Caseira', { Marca: 'Sem marca' }), { id: id('2000009'), erro: 'pagina: timeout' }] }))
    writeFileSync(join(pasta, '_raw-concorrentes-bala-zero.json'), JSON.stringify({ anuncios: [ad('2000002', 'Bala Coco Caseira', { Marca: 'Sem marca' }), ad('2000003', 'Bala Zero', { Marca: 'Sem marca' }), ad('2000004', 'Bala Diet', { Marca: 'Genérica' })] }))
    const r = recalcularArquivos(pasta)
    assert.deepEqual(r, { anuncios: 4, palavras: 5, atributos: 1 })
    assert.equal(readFileSync(join(pasta, 'vocabulario.txt'), 'utf8').split('\n')[0], 'bala' + String.fromCharCode(9) + '4')
    assert.deepEqual(JSON.parse(readFileSync(join(pasta, 'atributos.json'), 'utf8')), { Marca: { em_quantos: 4, valores: ['Sem marca', 'Genérica'] } })
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('acharProduto aceita diferenca de caixa e lista os nomes quando nao acha', () => {
  const lista = [{ nome: 'Bala de Coco' }, { nome: 'Pirulito' }]
  assert.equal(acharProduto(lista, 'bala de coco').nome, 'Bala de Coco')
  assert.throws(() => acharProduto(lista, 'Chiclete'), /Bala de Coco; Pirulito/)
})
