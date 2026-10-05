// Testes do orquestrador. Sem Chrome, sem rede e sem Gemini: tudo entra falso.
// Codigo de anuncio montado por partes, porque o Gate 1 barra as letras seguidas de 6 ou mais digitos.
// Rodar: node --test rx.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { argumentos, caminhos, rodadaGratis, gerarSaidas, passoVer } from './rx.mjs'

const L = 'MLB'
const id = n => L + n

test('argumentos: termo obrigatorio, slug e as chaves', () => {
  assert.deepEqual(argumentos(['--termo', ' Caneca Térmica ']), { termo: 'Caneca Térmica', slug: 'caneca-termica', soTradicional: false, ver: false, sim: false })
  assert.equal(argumentos(['--termo', 'x', '--so-tradicional']).soTradicional, true)
  // regressao do ensaio de 2026-10-04: a rodada tradicional nao pode sobrescrever a outra do mesmo dia
  assert.equal(argumentos(['--termo', 'Caneca Termica', '--so-tradicional']).slug, 'caneca-termica-tradicional')
  assert.deepEqual([argumentos(['--termo', 'x', '--ver', '--sim']).ver, argumentos(['--termo', 'x', '--ver', '--sim']).sim], [true, true])
  assert.throws(() => argumentos([]), /--termo/)
  assert.throws(() => argumentos(['--termo', 'x', '--sim']), /--sim so vale junto com --ver/)
  // regressao da revisao final: '--sim nao' nao pode virar sim
  assert.throws(() => argumentos(['--termo', 'x', '--ver', '--sim', 'nao']), /--sim nao leva valor/)
  assert.throws(() => argumentos(['--termo', 'x', '--ver', '--so-tradicional', 'sim']), /--so-tradicional nao leva valor/)
})

test('caminhos: dados por termo e relatorio datado', () => {
  const c = caminhos('caneca-termica', '2026-10-04', 'R')
  assert.equal(c.relatorio, join('R', 'relatorios', 'engenharia-reversa-caneca-termica-2026-10-04.md'))
  assert.equal(c.coleta, join('R', 'dados', 'engenharia-reversa', 'caneca-termica', 'coleta.json'))
})

// 12 anuncios: 6 que vendem muito e 6 que vendem pouco, mais um catalogo e um patrocinado repetido
function busca() {
  const itens = []
  for (let i = 1; i <= 6; i++) itens.push({ id: id(`10000${i}`), titulo: `Caneca Inox ${i}`, url: `https://produto.mercadolivre.com.br/${L}-10000${i}-x`, preco: 50, vendidos: 5000, tipo: 'tradicional', patrocinado: false })
  for (let i = 1; i <= 6; i++) itens.push({ id: id(`20000${i}`), titulo: `Caneca Inox fraca ${i}`, url: `https://produto.mercadolivre.com.br/${L}-20000${i}-x`, preco: 50, vendidos: 10 + i, tipo: 'tradicional', patrocinado: false })
  itens.push({ id: id('3000001'), titulo: 'Caneca Inox Catalogo', url: `https://www.mercadolivre.com.br/c/p/${L}3000001`, preco: 55, vendidos: 50000, tipo: 'catalogo', patrocinado: false })
  itens.push({ id: id('4000001'), titulo: 'Caneca Inox Patrocinada', url: 'https://click1.mercadolivre.com.br/mclics/x', preco: 55, vendidos: 40, tipo: null, patrocinado: true })
  itens.push({ id: id('4000002'), titulo: 'Caneca Inox Anuncio Pago', url: 'https://click1.mercadolivre.com.br/mclics/y', preco: 50, vendidos: 20, tipo: null, patrocinado: true })
  itens.push({ id: null, titulo: 'sem codigo', url: 'https://exemplo.com', preco: 1, vendidos: 1 })
  return { total: itens.length, itens }
}

function falsos(dir, { falhaEm = null, loginEm = null, pagoVaiPara = `https://www.mercadolivre.com.br/caneca/up/${L}U5000001#polycard` } = {}) {
  const abertos = []
  return {
    abertos,
    buscar: async () => busca(),
    get: async caminho => (caminho.includes('5000002') ? { paging: { total: 1 }, results: [{ item_id: id('4000002'), price: 50 }] } : caminho.includes('3000001') ? { paging: { total: 2 }, results: [{ item_id: id('4000001'), price: 55 }, { item_id: 'MLB9', price: 60 }] } : {}),
    lerAnuncio: async url => {
      abertos.push(url)
      if (loginEm && url.includes(loginEm)) throw new Error('a pagina pediu login')
      if (falhaEm && url.includes(falhaEm)) throw new Error('timeout')
      const url_final = url.includes('-4000002') ? pagoVaiPara : url
      return { url_final, fotos: [`https://http2.mlstatic.com/D_NQ_1-MLA1-F.jpg`, `https://http2.mlstatic.com/D_NQ_2-MLA2-F.webp`], video: url.includes('10000'), descricao: 'Caneca de inox', link_perguntas: url.includes('100001') ? 'https://perguntas' : null }
    },
    lerPerguntas: async () => [{ pergunta: 'Vai no micro-ondas?', resposta: null }],
    baixar: async (url, arquivo) => writeFileSync(arquivo, 'x'),
    medidor: { medir: async () => ({ fundo: { branco_puro: true }, respiro: 0.1, densidade_borda: 0.1 }) },
    pastaFotos: join(dir, 'fotos'),
    dormir: async () => {},
    hoje: '2026-10-04',
  }
}

test('rodada gratis: grupos, catalogo, duplicata, paginas, fotos e capa', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-'))
  try {
    const f = falsos(dir, { falhaEm: '200002' })
    const c = await rodadaGratis({ termo: 'caneca inox', ...f })
    assert.deepEqual(c.amostra.duplicatas, [id('4000001')])
    assert.equal(c.amostra.pool, 15)
    assert.equal(c.lidos.length + c.falharam.length, 14)
    assert.equal(c.busca.length, 16)
    const pago = c.lidos.find(a => a.id === id('4000002'))
    assert.deepEqual([pago.tipo, pago.url], ['produto', `https://www.mercadolivre.com.br/caneca/up/${L}U5000001`])
    assert.deepEqual(c.falharam, [{ id: id('200002'), erro: 'pagina: timeout' }])
    const campeao = c.lidos.find(a => a.id === id('100001'))
    assert.equal(campeao.video, true)
    assert.deepEqual(campeao.perguntas, [{ pergunta: 'Vai no micro-ondas?', resposta: null }])
    assert.deepEqual(campeao.fotos_locais.map(p => p.slice(-15)), [`${id('100001')}-01.jpg`.slice(-15), `${id('100001')}-02.webp`.slice(-15)])
    assert.ok(campeao.fotos_locais.every(p => existsSync(p)))
    assert.equal(campeao.capa.respiro, 0.1)
    assert.deepEqual(c.listas.map(l => l.id), [id('3000001')])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('--so-tradicional tira o catalogo da piscina', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-'))
  try {
    const c = await rodadaGratis({ termo: 'caneca inox', soTradicional: true, ...falsos(dir) })
    assert.ok(!c.lidos.some(a => a.tipo === 'catalogo'))
    // regressao do ensaio de 2026-10-04: o patrocinado esconde o destino (pode ser catalogo) e fica fora
    assert.ok(!c.lidos.some(a => a.patrocinado), JSON.stringify(c.lidos.filter(a => a.patrocinado).map(a => a.id)))
    assert.deepEqual(c.listas, [])
    assert.deepEqual(c.amostra.duplicatas, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('pagina pedindo login para a rodada com a mensagem de entrar de novo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-'))
  try {
    await assert.rejects(rodadaGratis({ termo: 'x', ...falsos(dir, { loginEm: '100003' }) }), /Entre de novo na conta/)
    await assert.rejects(rodadaGratis({ termo: 'x', ...falsos(dir), buscar: async () => ({ itens: [], erro: 'a busca pediu login: entre de novo' }) }), /a busca pediu login/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gerarSaidas: sem fichas sao 5 testes; com fichas sao 10 e a anatomia sai', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-'))
  try {
    const coleta = await rodadaGratis({ termo: 'caneca inox', ...falsos(dir) })
    const semVer = gerarSaidas(coleta)
    assert.equal(semVer.resultado.padroes.length, 5)
    assert.match(semVer.relatorio, /^# Engenharia reversa: caneca inox/)
    const fichas = Object.fromEntries(coleta.lidos.map(a => [a.id, [{ ordem: 1, papel: 'gancho', valida: true, texto: 'Vai no micro-ondas sim' }]]))
    const comVer = gerarSaidas(coleta, fichas)
    assert.equal(comVer.resultado.padroes.length, 10)
    assert.equal(comVer.resultado.anatomia.posicoes[0].papel, 'gancho')
    // o texto da foto responde a duvida do cliente
    assert.equal(semVer.resultado.objecoes.length, 1)
    assert.equal(comVer.resultado.objecoes.length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// O portao de custo do --ver. Regressao do ensaio de 2026-10-04: process.exit com a conexao do
// Gemini aberta derrubava o Node no Windows (codigo 127 em vez de 3); agora a funcao devolve o codigo.
function portao({ modelo = 'gemini-3.7-flash', fotos = 160, limite = 2, sim = false, devolve = { fichas: { A: [] }, gasto_usd: 0, parou: false } } = {}) {
  const chamadas = []
  const porAnuncio = [{ id: 'A', titulo: 't', fotos: Array(fotos).fill('f.jpg') }]
  return {
    chamadas,
    rodar: () => passoVer({ porAnuncio, chave: 'k', hoje: '2026-10-04', limite, sim, descobrir: async () => modelo, ver: async (lista, op, extra) => { chamadas.push([op.modelo, extra.limite]); return devolve } }),
  }
}

test('passoVer sem --sim: estima, para com codigo 3 e nunca chama o Gemini', async () => {
  const p = portao()
  const r = await p.rodar()
  assert.equal(r.codigo, 3)
  assert.equal(r.saida.parou, 'precisa do pode ir da pessoa')
  assert.deepEqual([r.saida.modelo, r.saida.fotos, r.saida.estimativa_usd, r.saida.preco_conferido_em], ['gemini-3.7-flash', 160, 0.82, '2026-10-04'])
  assert.deepEqual(p.chamadas, [])
})

test('passoVer: modelo fora da tabela e estimativa acima do limite param sem gastar, mesmo com --sim', async () => {
  const fora = portao({ modelo: 'gemini-9-flash', sim: true })
  const r1 = await fora.rodar()
  assert.equal(r1.codigo, 3)
  assert.match(r1.saida.parou, /tabela de preco/)
  const caro = portao({ fotos: 1000, limite: 2, sim: true })
  const r2 = await caro.rodar()
  assert.equal(r2.codigo, 3)
  assert.match(r2.saida.parou, /limite_gasto_usd/)
  assert.deepEqual([...fora.chamadas, ...caro.chamadas], [])
})

test('passoVer com --sim dentro do limite chama o Gemini com o modelo descoberto', async () => {
  const p = portao({ sim: true })
  const r = await p.rodar()
  assert.equal(r.codigo, 0)
  assert.deepEqual(r.fichas, { A: [] })
  assert.deepEqual(p.chamadas, [['gemini-3.7-flash', 2]])
})

// Regressao da revisao final de 2026-10-04: cota estourada no meio nao pode virar "regra".
test('passoVer: mais de 20% das fotos com erro ou parada no limite saem com codigo 1', async () => {
  const fichas = { A: [{ ordem: 1, valida: true }, { ordem: 2, erro: 'Gemini 429', valida: false }, { ordem: 3, erro: 'Gemini 429', valida: false }] }
  const r = await portao({ sim: true, devolve: { fichas, gasto_usd: 0.01, parou: false } }).rodar()
  assert.equal(r.codigo, 1)
  assert.match(r.erro, /2 de 3 fotos/)
  assert.deepEqual(r.fichas, fichas)
  const limite = await portao({ sim: true, devolve: { fichas: { A: [{ ordem: 1, valida: true }] }, gasto_usd: 2, parou: true } }).rodar()
  assert.equal(limite.codigo, 1)
  assert.match(limite.erro, /limite/)
})

// Regressao da revisao final de 2026-10-04: catalogo que chega por patrocinado tambem ganha escada.
test('patrocinado que abre num catalogo ganha a lista de vendedores depois de lido', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rx-'))
  try {
    const c = await rodadaGratis({ termo: 'caneca inox', ...falsos(dir, { pagoVaiPara: `https://www.mercadolivre.com.br/caneca/p/${L}5000002#polycard` }) })
    const pago = c.lidos.find(a => a.id === id('4000002'))
    assert.deepEqual([pago.tipo, pago.catalogo_id], ['catalogo', id('5000002')])
    assert.ok(c.listas.some(l => l.id === id('5000002') && l.ofertas.length === 1), JSON.stringify(c.listas.map(l => l.id)))
    const { resultado } = gerarSaidas(c)
    assert.ok(resultado.escada.some(e => e.id === id('5000002') && e.titulo === 'Caneca Inox Anuncio Pago'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
