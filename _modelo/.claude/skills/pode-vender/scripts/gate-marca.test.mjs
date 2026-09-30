// Testes do script do gate de marca. Sem navegador e sem rede. Rodar: node --test gate-marca.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { CONTROLES, argumentos, nomeDoArquivo, caminhoLivre, rodarGate, tabela } from './gate-marca.mjs'
import { SELO, CATEGORIAS } from './lib/veredito.mjs'

const hoje = () => '2026-09-29'

test('toda categoria tem marca de controle', () => {
  for (const c of CATEGORIAS) assert.ok(CONTROLES[c], c)
})

test('argumentos: uma marca, com apelidos, controle padrao e nome pela marca', () => {
  const a = argumentos(['--categoria', 'suplemento', '--marca=Acme', '--aliases', 'Termofort, Acmefit'], { hoje })
  assert.deepEqual(a.marcas, [{ marca: 'Acme', aliases: ['Termofort', 'Acmefit'] }])
  assert.equal(a.controle, CONTROLES.suplemento)
  assert.equal(a.nome, 'Acme')
  assert.equal(a.data, '2026-09-29')
})

test('argumentos: lista do fornecedor tira o controle, junta repetida e aceita texto puro', () => {
  const ler = () => JSON.stringify({ marcas: ['Acme', { marca: 'ACME' }, { marca: 'Bravo', aliases: ['BravoFit'] }, CONTROLES.alimento] })
  const a = argumentos(['--categoria', 'alimento', '--marcas', 'forn/lista-acme.json'], { ler, hoje })
  assert.deepEqual(a.marcas, [{ marca: 'Acme', aliases: [] }, { marca: 'Bravo', aliases: ['BravoFit'] }])
  assert.equal(a.nome, 'forn-lista-acme')
})

test('argumentos: item sem nome aborta dizendo qual', () => {
  const ler = () => JSON.stringify({ marcas: ['Acme', { aliases: ['x'] }] })
  assert.throws(() => argumentos(['--categoria', 'outra', '--marcas', 'l.json'], { ler, hoje }), /marca 2 de l\.json esta sem nome/)
})

test('argumentos: erros de uso', () => {
  assert.throws(() => argumentos(['--marca', 'Acme'], { hoje }), /falta --categoria/)
  assert.throws(() => argumentos(['--categoria', 'eletronico', '--marca', 'Acme'], { hoje }), /nao existe/)
  assert.throws(() => argumentos(['--categoria', 'outra'], { hoje }), /--marca .* ou --marcas/)
  assert.throws(() => argumentos(['--categoria', 'outra', '--marca', 'A', '--marcas', 'l.json'], { hoje }), /uma das duas/)
  assert.throws(() => argumentos(['--categoria', 'outra', '--marca', 'A', '--sem-ml'], { hoje }), /opcao desconhecida --sem-ml/)
  assert.throws(() => argumentos(['--categoria', 'outra', '--marca'], { hoje }), /--marca precisa de um valor/)
  assert.throws(() => argumentos(['--categoria', 'outra', '--marca', 'A', '--data', '29/09'], { hoje }), /AAAA-MM-DD/)
  assert.throws(() => argumentos(['--categoria', 'outra', '--marcas', 'l.json'], { ler: () => '{', hoje }), /nao e um JSON valido/)
})

test('nomeDoArquivo: slug do nome, categoria e data', () => {
  assert.equal(nomeDoArquivo('Fornecedor Açaí', 'suplemento', '2026-09-29'), 'fornecedor-acai-suplemento-2026-09-29.json')
  assert.equal(nomeDoArquivo('***', 'outra', '2026-09-29'), 'marcas-outra-2026-09-29.json')
})

test('caminhoLivre nunca aponta pra arquivo que ja existe', () => {
  const ja = new Set([join('d', 'x.json'), join('d', 'x-2.json')])
  assert.equal(caminhoLivre('d', 'x.json', { existe: c => ja.has(c) }), join('d', 'x-3.json'))
  assert.equal(caminhoLivre('d', 'y.json', { existe: () => false }), join('d', 'y.json'))
})

const presente = { veredito: 'PRESENTE', totalBusca: 5000, anunciosComAMarca: 10, cardsLidos: 40, exemplos: [] }
const vazio = { content: [], totalElements: 0 }
const comNotificacao = { totalElements: 1, content: [{ produto: { descricao: 'P', numeroRegistroOuNotificacao: '9', tipoRegularizacao: 'Notificado', situacaoRegistro: 'Ativo' } }] }

function consultaFalsa(porCaminho) {
  const pedidos = []
  const consultar = async caminho => {
    pedidos.push(caminho)
    const r = porCaminho(caminho)
    if (r instanceof Error) throw r
    return r
  }
  return { pedidos, consultar }
}

test('rodarGate: controle primeiro, depois as marcas, com veredito', async () => {
  const medidas = []
  const { consultar, pedidos } = consultaFalsa(c => (c.includes('alimento/produtos') ? comNotificacao : vazio))
  const r = await rodarGate({
    marcas: [{ marca: 'Acme', aliases: [] }],
    categoria: 'suplemento',
    controle: 'Controle X',
    medirML: async marca => { medidas.push(marca); return presente },
    consultar,
  })
  assert.deepEqual(medidas, ['Controle X', 'Acme'])
  assert.equal(pedidos.length, 4)
  assert.equal(r.controle.ok, true)
  assert.equal(r.resultados[0].veredito.selo, SELO.PODE)
})

test('rodarGate: controle ausente do ML derruba a rodada e nao gasta consulta com as marcas', async () => {
  const { consultar, pedidos } = consultaFalsa(() => vazio)
  const r = await rodarGate({
    marcas: [{ marca: 'Acme', aliases: [] }, { marca: 'Bravo', aliases: [] }],
    categoria: 'alimento',
    controle: 'Controle X',
    medirML: async () => ({ ...presente, veredito: 'AUSENTE' }),
    consultar,
  })
  assert.equal(r.controle.ok, false)
  assert.equal(pedidos.length, 1)
  assert.deepEqual(r.resultados.map(x => x.veredito.selo), [SELO.INCONCLUSIVO, SELO.INCONCLUSIVO])
})

test('rodarGate: ANVISA que nao aquece no controle derruba a rodada', async () => {
  const { consultar } = consultaFalsa(() => new Error('a ANVISA nao liberou a consulta em 4 minutos'))
  const r = await rodarGate({ marcas: [{ marca: 'Acme', aliases: [] }], categoria: 'cosmetico', controle: 'C', medirML: async () => presente, consultar })
  assert.equal(r.controle.ok, false)
  assert.match(r.controle.gates.dossie.erro, /4 minutos/)
  assert.equal(r.resultados[0].veredito.selo, SELO.INCONCLUSIVO)
})

test('rodarGate: token que some no meio afeta so aquela marca', async () => {
  let n = 0
  const { consultar } = consultaFalsa(() => (++n === 3 ? new Error('a ANVISA parou de liberar a consulta no meio da rodada') : vazio))
  const r = await rodarGate({
    marcas: [{ marca: 'Acme', aliases: [] }, { marca: 'Bravo', aliases: [] }, { marca: 'Charlie', aliases: [] }],
    categoria: 'alimento',
    controle: 'C',
    medirML: async () => presente,
    consultar,
  })
  assert.deepEqual(r.resultados.map(x => x.veredito.selo), [SELO.PODE_NA_MARCA, SELO.INCONCLUSIVO, SELO.PODE_NA_MARCA])
})

test('rodarGate: categoria outra nunca chama a ANVISA', async () => {
  const r = await rodarGate({
    marcas: [{ marca: 'Acme', aliases: [] }],
    categoria: 'outra',
    controle: 'C',
    medirML: async () => presente,
    consultar: null,
  })
  assert.equal(r.resultados[0].veredito.selo, SELO.PODE_NA_MARCA)
  assert.deepEqual(Object.keys(r.resultados[0].gates), ['ml'])
})

test('tabela: controle que falhou mostra o motivo', () => {
  const r = {
    controle: { marca: 'C', ok: false, gates: { ml: { erro: 'o Mercado Livre pediu login ou verificacao: entre na sua conta no Chrome dedicado e rode de novo' } } },
    resultados: [],
  }
  const t = tabela(r)
  assert.match(t, /controle C: FALHOU/)
  assert.match(t, /ml: o Mercado Livre pediu login/)
})

test('tabela: uma linha por marca, com o controle no topo', () => {
  const r = {
    controle: { marca: 'C', ok: true, gates: { ml: presente } },
    resultados: [{ marca: 'Acme', gates: { ml: presente, dossie: { confirmados: 0 } }, veredito: { selo: SELO.PODE_NA_MARCA, motivos: ['m1'], rota: null, vetados: [] } }],
  }
  const t = tabela(r)
  assert.match(t.split('\n')[0], /controle C: ok/)
  assert.match(t, /Acme .*ML:PRESENTE .*dossies:0 .*=> PODE NA MARCA/)
  assert.match(t, /m1/)
})
