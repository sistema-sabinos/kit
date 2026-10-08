// Testes da espionagem. Sem Chrome e sem rede. Codigo de anuncio montado por partes, porque o
// Gate 1 barra as letras seguidas de 6 ou mais digitos em qualquer arquivo do kit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { argumentos, idDoAnuncio, escolherTopo, urlParaAbrir, vendidosDe, vendedorDe, perguntasDoTexto, palavrasDoTitulo, vocabulario, textoDoVocabulario, atributosConsensuais, fotosUnicas, avaliacoesDe, espionar, recalcularArquivos, acharProduto, mesclarAnuncios, oQueFaltaEspionar, pontoDePartida, limparFundo, somaAlertas } from './espionar.mjs'

const L = 'MLB'
const id = n => L + n

test('argumentos: produto obrigatorio, padroes 5 e 3', () => {
  assert.deepEqual(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--produto', 'Bala de Coco']), { fornecedor: 'f', categoria: 'c', produto: 'Bala de Coco', n: 5, perguntas: 3, retomar: false })
  assert.equal(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--produto', 'x', '--perguntas', '0']).perguntas, 0)
  assert.equal(argumentos(['--fornecedor', 'f', '--categoria', 'c', '--produto', 'x', '--retomar']).retomar, true)
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

// Formato REAL do innerText da aba de perguntas (estrutura copiada de uma pagina lida, textos
// inventados): pergunta, "Denunciar" e "Vai abrir em uma nova janela", resposta, a data numa
// linha so dela, "Denunciar" e "Vai abrir..." de novo. A secao acaba no rodape "Mais informacoes".
const D = ['Denunciar', 'Vai abrir em uma nova janela']
const ABA = [
  'Bala de Coco 500 g', 'Perguntas neste anúncio',
  'É sem glúten?', ...D, 'Sim, não contém glúten.', '12/08/2026', ...D,
  'Faz kit de 10', ...D, 'Não fazemos. Quer o de 5?', '03/09/2026', ...D,
  '', '', 'Mais informações', 'Copyright © 1999-2026 Exemplo LTDA.', 'Termos e condições',
].join('\n')

test('perguntasDoTexto pega a secao inteira, passando pelos "Denunciar", e para no rodape', () => {
  const p = perguntasDoTexto(ABA)
  assert.ok(p.length > 0)
  assert.match(p, /^Perguntas neste anúncio/)
  assert.match(p, /Faz kit de 10/)
  assert.match(p, /03\/09\/2026/)
  assert.doesNotMatch(p, /Mais informações|Copyright|Termos e condições/)
  assert.equal(perguntasDoTexto('Bala de Coco\nComprar agora'), '')
  // o rodape antigo da pagina de anuncio tambem fecha a secao
  const antigo = ['Perguntas neste anúncio', 'Tem sem açúcar?', ...D, 'Não.', '01/09/2026', ...D, 'Termos mais procurados', 'bala de coco caseira'].join('\n')
  assert.doesNotMatch(perguntasDoTexto(antigo), /mais procurados|caseira/)
})

test('perguntasDoTexto acima do limite corta no fim de um par, sem pergunta pela metade', () => {
  const pares = Array.from({ length: 40 }, (_, i) => [`Pergunta numero ${i}`, ...D, `Resposta numero ${i}.`, '01/09/2026', ...D]).flat()
  const p = perguntasDoTexto(['Perguntas neste anúncio', ...pares, 'Mais informações'].join('\n'), 600)
  assert.ok(p.length <= 600, `passou do limite: ${p.length}`)
  assert.ok(p.endsWith('Vai abrir em uma nova janela'), p.slice(-80))
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

test('mesclarAnuncios troca pelo id, mantem a ordem e poe o novo no fim', () => {
  const existentes = [{ id: id('3000001'), titulo: 'A' }, { id: id('3000002'), titulo: 'B' }]
  const r = mesclarAnuncios(existentes, [{ id: id('3000002'), titulo: 'B novo' }, { id: id('3000003'), titulo: 'C' }])
  assert.deepEqual(r.map(a => `${a.id}:${a.titulo}`), [`${id('3000001')}:A`, `${id('3000002')}:B novo`, `${id('3000003')}:C`])
  assert.deepEqual(mesclarAnuncios([], [{ id: id('9000009') }]), [{ id: id('9000009') }])
})

test('oQueFaltaEspionar pula quem foi coletado hoje, recomeca se o carimbo e de outro dia, falta ou o arquivo nao existe', () => {
  const itens = [{ id: id('4000001') }, { id: id('4000002') }]
  const arquivoDeHoje = { em: '2026-09-25', anuncios: [{ id: id('4000001'), titulo: 'ja lido', coletado_em: '2026-09-25' }] }
  const r = oQueFaltaEspionar(arquivoDeHoje, itens, '2026-09-25')
  assert.deepEqual(r.aColetar.map(i => i.id), [id('4000002')])
  assert.equal(r.puladas, 1)

  // o `em` do arquivo diz hoje, mas o anuncio e de ontem (ou de arquivo antigo, sem carimbo)
  const arquivoMisturado = { em: '2026-09-25', anuncios: [{ id: id('4000001'), titulo: 'velho', coletado_em: '2026-09-24' }, { id: id('4000002'), titulo: 'sem carimbo' }] }
  const rm = oQueFaltaEspionar(arquivoMisturado, itens, '2026-09-25')
  assert.deepEqual(rm.aColetar.map(i => i.id), itens.map(i => i.id))
  assert.equal(rm.puladas, 0)

  const arquivoDeOntem = { em: '2026-09-24', anuncios: [{ id: id('4000001'), coletado_em: '2026-09-24' }] }
  const r2 = oQueFaltaEspionar(arquivoDeOntem, itens, '2026-09-25')
  assert.deepEqual(r2.aColetar.map(i => i.id), itens.map(i => i.id))
  assert.equal(r2.puladas, 0)

  const r3 = oQueFaltaEspionar(null, itens, '2026-09-25')
  assert.equal(r3.puladas, 0)
})

test('oQueFaltaEspionar recoleta quem deu erro hoje, mesmo estando no arquivo de hoje (erro nao e "ja feito")', () => {
  const itens = [{ id: id('4000001') }, { id: id('4000002') }]
  const arquivo = { em: '2026-09-25', anuncios: [{ id: id('4000001'), titulo: 'ok', coletado_em: '2026-09-25' }, { id: id('4000002'), erro: 'pagina: timeout', coletado_em: '2026-09-25' }] }
  const r = oQueFaltaEspionar(arquivo, itens, '2026-09-25')
  assert.deepEqual(r.aColetar.map(i => i.id), [id('4000002')])
  assert.equal(r.puladas, 1)
})

test('espionar grava cada anuncio assim que termina de ler a pagina', async () => {
  const itens = [{ id: id('5000001'), url: 'https://exemplo.com/1', preco: 10 }, { id: id('5000002'), url: 'https://exemplo.com/2', preco: 12 }]
  const paginas = {
    'https://exemplo.com/1': { titulo: 'A', subtitulo: '+10 vendidos', fotos: [], atributos: {}, link_perguntas: null },
    'https://exemplo.com/2': { titulo: 'B', subtitulo: '+10 vendidos', fotos: [], atributos: {}, link_perguntas: null },
  }
  const lerAnuncio = async url => paginas[url]
  const lerPerguntas = async () => ''
  const get = async () => ({ paging: { total: 0 }, reviews: [] })
  const salvos = []
  const r = await espionar({ itens, lerAnuncio, lerPerguntas, get, perguntas: 0, dormir: async () => {}, salvar: a => salvos.push(a.id) })
  assert.deepEqual(salvos, [id('5000001'), id('5000002')])
  assert.equal(r.length, 2)
})

// Retomada: a fase de perguntas olha o conjunto inteiro (os de hoje ja gravados mais os novos),
// senao uma queda depois das paginas deixa o dia sem pergunta nenhuma, calado.
const HOJE = '2026-09-25'
const semRede = { get: async () => ({ paging: { total: 0 }, reviews: [] }), dormir: async () => {}, hoje: HOJE }

test('espionar retomado sem anuncio novo ainda busca as perguntas dos que faltam', async () => {
  const jaColetados = [
    { id: id('6000001'), titulo: 'A', vendidos: 50, link_perguntas: 'qa' },
    { id: id('6000002'), titulo: 'B', vendidos: 5000, link_perguntas: 'qb' },
    { id: id('6000003'), titulo: 'C', vendidos: 900, link_perguntas: 'qc', perguntas: 'ja lidas', perguntas_em: HOJE },
  ]
  const abertas = []
  const lerPerguntas = async link => { abertas.push(link); return ABA }
  const r = await espionar({ ...semRede, itens: [], jaColetados, lerAnuncio: async () => { throw new Error('nao devia abrir') }, lerPerguntas, perguntas: 2 })
  assert.equal(r.length, 0)
  assert.ok(abertas.length > 0, 'a fase de perguntas rodou')
  assert.deepEqual(abertas, ['qb'])
  assert.match(jaColetados[1].perguntas, /glúten/)
  assert.equal(jaColetados[1].perguntas_em, HOJE)
  assert.equal(jaColetados[2].perguntas, 'ja lidas')
})

test('espionar: pergunta de outro dia (ou sem data) conta como faltando e e lida de novo', async () => {
  const jaColetados = [
    { id: id('6100001'), titulo: 'A', vendidos: 900, link_perguntas: 'qa', perguntas: 'de ontem', perguntas_em: '2026-09-24' },
    { id: id('6100002'), titulo: 'B', vendidos: 800, link_perguntas: 'qb', perguntas: 'sem data' },
  ]
  const abertas = []
  await espionar({ ...semRede, itens: [], jaColetados, lerAnuncio: async () => ({}), lerPerguntas: async link => { abertas.push(link); return ABA }, perguntas: 2 })
  assert.deepEqual(abertas, ['qa', 'qb'])
  assert.match(jaColetados[0].perguntas, /glúten/)
})

// Cenario da revisao: bruto completo de 09-24; a rodada de 09-25 sem --retomar cai depois do A;
// o --retomar tem que recoletar B e C (e as perguntas deles), nao aceitar os dados de ontem como de hoje.
test('retomar depois de queda no dia seguinte recoleta os anuncios de ontem e as perguntas deles', async () => {
  const itens = ['7100001', '7100002', '7100003'].map((n, i) => ({ id: id(n), url: `https://exemplo.com/${i}`, preco: 10 }))
  const velho = (it, t) => ({ id: it.id, titulo: t, vendidos: 1000, link_perguntas: 'q' + t, perguntas: 'de ontem', perguntas_em: '2026-09-24', coletado_em: '2026-09-24' })
  const arquivo0924 = { em: '2026-09-24', anuncios: [velho(itens[0], 'A'), velho(itens[1], 'B'), velho(itens[2], 'C')] }
  const paginas = Object.fromEntries(itens.map((it, i) => [it.url, { titulo: 'ABC'[i] + ' novo', subtitulo: '+5 mil vendidos', fotos: [], atributos: {}, link_perguntas: 'q' + 'ABC'[i] }]))
  // rodada sem --retomar que cai logo depois de gravar o A
  const p1 = pontoDePartida(arquivo0924, itens, HOJE, false)
  let atual = p1.atual
  await assert.rejects(espionar({ ...semRede, itens: p1.itens, jaColetados: p1.jaColetados, lerAnuncio: async url => paginas[url], lerPerguntas: async () => ABA, perguntas: 3, salvar: a => { atual = mesclarAnuncios(atual, [a]); throw new Error('queda') } }), /queda/)
  const arquivoDaQueda = { em: HOJE, anuncios: atual }
  // retomada
  const p2 = pontoDePartida(arquivoDaQueda, itens, HOJE, true)
  assert.deepEqual(p2.itens.map(i => i.id), [itens[1].id, itens[2].id])
  assert.equal(p2.puladas, 1)
  const abertas = []
  const novos = await espionar({ ...semRede, itens: p2.itens, jaColetados: p2.jaColetados, lerAnuncio: async url => paginas[url], lerPerguntas: async link => { abertas.push(link); return ABA }, perguntas: 3 })
  assert.deepEqual(novos.map(a => a.titulo), ['B novo', 'C novo'])
  assert.ok(novos.every(a => a.coletado_em === HOJE))
  assert.deepEqual([...abertas].sort(), ['qA', 'qB', 'qC'])
})

test('espionar retomado depois de ler 3 de 5 escolhe os que mais vendem pelo conjunto inteiro', async () => {
  const jaColetados = [
    { id: id('7000001'), titulo: 'A', vendidos: 5000, link_perguntas: 'qa' },
    { id: id('7000002'), titulo: 'B', vendidos: 3000, link_perguntas: 'qb' },
    { id: id('7000003'), titulo: 'C', vendidos: 10, link_perguntas: 'qc' },
  ]
  const itens = [{ id: id('7000004'), url: 'https://exemplo.com/4', preco: 10 }, { id: id('7000005'), url: 'https://exemplo.com/5', preco: 10 }]
  const paginas = {
    'https://exemplo.com/4': { titulo: 'D', subtitulo: '+100 vendidos', fotos: [], atributos: {}, link_perguntas: 'qd' },
    'https://exemplo.com/5': { titulo: 'E', subtitulo: '+4 mil vendidos', fotos: [], atributos: {}, link_perguntas: 'qe' },
  }
  const abertas = []
  const lerPerguntas = async link => { abertas.push(link); return ABA }
  const r = await espionar({ ...semRede, itens, jaColetados, lerAnuncio: async url => paginas[url], lerPerguntas, perguntas: 3 })
  assert.equal(r.length, 2)
  assert.deepEqual(abertas, ['qa', 'qe', 'qb'])
})

test('pontoDePartida sem --retomar coleta tudo mas parte do bruto que ja existe, pra nao encolher', () => {
  const itens = [{ id: id('8000001') }, { id: id('8000002') }]
  const antigo = { em: '2026-09-20', anuncios: [{ id: id('8000001'), titulo: 'velho' }, { id: id('8000009'), titulo: 'fora do topo' }] }
  const r = pontoDePartida(antigo, itens, '2026-09-25', false)
  assert.deepEqual(r.itens.map(i => i.id), itens.map(i => i.id))
  assert.deepEqual(r.atual.map(a => a.id), [id('8000001'), id('8000009')])
  assert.deepEqual(r.jaColetados, [])
  assert.equal(r.puladas, 0)
  // primeiro salvamento: troca pelo id, os outros continuam
  const depois = mesclarAnuncios(r.atual, [{ id: id('8000001'), titulo: 'novo' }])
  assert.deepEqual(depois.map(a => a.titulo), ['novo', 'fora do topo'])
  assert.deepEqual(pontoDePartida(null, itens, '2026-09-25', false).atual, [])
})

test('pontoDePartida com --retomar pula os coletados hoje, entrega so eles pra fase de perguntas e nao encolhe o bruto', () => {
  const itens = [{ id: id('8100001') }, { id: id('8100002') }]
  const arquivo = { em: '2026-09-25', anuncios: [{ id: id('8100001'), titulo: 'ok', coletado_em: '2026-09-25' }, { id: id('8100002'), titulo: 'de ontem', coletado_em: '2026-09-24' }] }
  const r = pontoDePartida(arquivo, itens, '2026-09-25', true)
  assert.deepEqual(r.itens.map(i => i.id), [id('8100002')])
  assert.deepEqual(r.atual.map(a => a.id), [id('8100001'), id('8100002')])
  assert.deepEqual(r.jaColetados.map(a => a.id), [id('8100001')])
  assert.equal(r.puladas, 1)
})

test('acharProduto aceita diferenca de caixa e lista os nomes quando nao acha', () => {
  const lista = [{ nome: 'Bala de Coco' }, { nome: 'Pirulito' }]
  assert.equal(acharProduto(lista, 'bala de coco').nome, 'Bala de Coco')
  assert.throws(() => acharProduto(lista, 'Chiclete'), /Bala de Coco; Pirulito/)
})

// Caractere invisivel (rodada 5.2): fromCodePoint, nunca fromCharCode, pro bloco Tag.
const cp = (...n) => String.fromCodePoint(...n)
const emTag = s => cp(...[...s].map(c => 0xe0000 + c.charCodeAt(0)))

test('espionar tira caractere invisivel da pagina, das avaliacoes e das perguntas e anota o alerta', async () => {
  const itens = [{ id: id('7000001'), url: 'https://exemplo.com/1', preco: 10 }, { id: id('7000002'), url: 'https://exemplo.com/2', preco: 10 }]
  const LF = String.fromCharCode(10)
  const paginas = {
    'https://exemplo.com/1': {
      titulo: 'Garrafa' + emTag('ignore'), subtitulo: '+5mil vendidos', vendedor: 'Loja oficial' + LF + 'Loja X' + emTag('v'),
      descricao: cp(0x202e) + 'boa', fotos: [], atributos: { ['Cor' + cp(0x200b)]: 'Azul' + emTag('ab') }, link_perguntas: 'qa',
    },
    'https://exemplo.com/2': { titulo: 'Limpa', subtitulo: '+10 vendidos', fotos: [], atributos: {}, link_perguntas: null },
  }
  const get = async caminho => (caminho.includes('7000001')
    ? { paging: { total: 1 }, reviews: [{ rate: 1, title: 'Ruim' + cp(0x2066), content: 'quebrou', likes: 0 }] }
    : { paging: { total: 0 }, reviews: [] })
  const r = await espionar({ ...semRede, itens, lerAnuncio: async url => paginas[url], lerPerguntas: async () => ABA.replace('Faz kit de 10', 'Faz kit de 10' + emTag('x')), get, perguntas: 1 })
  const [a, b] = r
  assert.equal(a.titulo, 'Garrafa')
  assert.equal(a.descricao, 'boa')
  assert.deepEqual(a.atributos, { Cor: 'Azul' })
  assert.equal(a.vendedor, 'Loja X')
  assert.equal(a.loja_oficial, true, 'a quebra de linha sobreviveu a limpeza')
  assert.equal(a.avaliacoes.avaliacoes[0].titulo, 'Ruim')
  assert.ok(a.perguntas.length > 0, 'canario: as perguntas foram lidas')
  assert.ok(![...a.perguntas].some(c => c.codePointAt(0) >= 0xe0000), 'perguntas sem bloco Tag')
  assert.deepEqual(a.alertas, { tag: 6 + 1 + 2 + 1, bidi: 2 })
  assert.equal(b.alertas, undefined, 'anuncio limpo nao ganha o campo')
  assert.deepEqual(somaAlertas(r), { tag: 10, bidi: 2 })
})

test('espionar limpa a aba antes do teto de tamanho: invisivel em massa nao empurra pergunta pra fora', async () => {
  const D2 = ['Denunciar', 'Vai abrir em uma nova janela']
  const aba = ['Perguntas neste anúncio', 'Tem azul?', ...D2, 'Tem sim.', ...D2, cp(...Array(10000).fill(0xe0041)), 'Serve no carro?', ...D2, 'Serve.', ...D2].join(String.fromCharCode(10))
  const jaColetados = [{ id: id('7100001'), titulo: 'A', vendidos: 10, link_perguntas: 'qa' }]
  await espionar({ ...semRede, itens: [], jaColetados, lerAnuncio: async () => ({}), lerPerguntas: async () => aba, perguntas: 1 })
  assert.match(jaColetados[0].perguntas, /Tem azul\?/, 'canario: a primeira pergunta entrou')
  assert.match(jaColetados[0].perguntas, /Serve no carro\?/)
  assert.deepEqual(jaColetados[0].alertas, { tag: 10000, bidi: 0 })
})

test('limparFundo limpa texto, chave e lista e deixa numero e nulo como estao', () => {
  const conta = { tag: 0, bidi: 0 }
  assert.deepEqual(limparFundo({ ['a' + cp(0xe0041)]: [1, null, 'b' + cp(0x202a)] }, conta), { a: [1, null, 'b'] })
  assert.deepEqual(conta, { tag: 1, bidi: 1 })
})
