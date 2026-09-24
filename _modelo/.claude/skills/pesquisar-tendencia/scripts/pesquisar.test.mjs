// Testes do processamento da pesquisa. Dado sintetico, pasta temporaria apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { mediana, semOutliers, metricas, nota, gerarCsv, gerarMd, processar, argumentos, COLUNAS } from './pesquisar.mjs'

const itens = precos => precos.map((preco, i) => ({ titulo: `Anuncio ${i + 1}`, url: `https://exemplo.com/${i}`, preco }))
// A: barato de comprar, pouca concorrencia, catalogo sem loja oficial
const A = { nome: 'Produto A', custo: 10, termo: 'produto a', busca: { total: 5, itens: itens([30, 32, 35, 36, 40]) }, catalogo: { produtos: [{ id: 'X1' }] }, buybox: { itens: [{ loja_oficial_id: null }, { loja_oficial_id: null }] } }
// B: margem apertada, sem catalogo
const B = { nome: 'Produto B', custo: 20, termo: 'produto b', busca: { total: 5, itens: itens([21, 25, 26, 27, 28]) }, catalogo: { produtos: [] }, buybox: null }
// C: 60 anuncios com preco colado (saturado) e margem apertada
const C = { nome: 'Produto C', custo: 50, termo: 'produto c', busca: { total: 60, itens: itens(Array.from({ length: 60 }, (_, i) => 60 + (i % 6))) } }
// D: a busca caiu no login e voltou vazia
const D = { nome: 'Produto "D"', custo: 5, termo: 'produto d', busca: { total: 0, itens: [], erro: 'a busca pediu login' } }
// E: busca ok, mas a API de catalogo nem foi consultada (sem token)
const E = { nome: 'Produto E', custo: 10, termo: 'produto e', busca: { total: 5, itens: itens([30, 32, 35, 36, 40]) }, catalogo: { total: 0, produtos: [], erro: 'sem token' }, buybox: null }
// F: catalogo achado, mas o buybox falhou
const F = { nome: 'Produto F', custo: 10, termo: 'produto f', busca: { total: 5, itens: itens([30, 32, 35, 36, 40]) }, catalogo: { produtos: [{ id: 'X9' }] }, buybox: { itens: [], erro: 'timeout' } }

test('mediana e corte de preco fora da faixa', () => {
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([4, 1, 2, 3]), 2.5)
  assert.equal(mediana([]), null)
  assert.deepEqual(semOutliers([10, 100, 101, 102, 103, 2000]), [100, 101, 102, 103])
  assert.deepEqual(semOutliers([1, 1000]), [1, 1000])
})

test('metricas da mediana e da margem bruta', () => {
  const m = metricas(10, A.busca)
  assert.equal(m.med, 35)
  assert.equal(m.margemBruta, 25)
  assert.equal(m.margemPct.toFixed(2), '71.43')
  assert.equal(metricas(10, { itens: [] }), null)
})

test('nota soma e tira pontos pela regra da skill', () => {
  assert.deepEqual([nota(A).nota, nota(A).classificacao], [85, 'oportunidade forte'])
  assert.deepEqual([nota(B).nota, nota(B).classificacao], [50, 'vale considerar'])
  assert.deepEqual([nota(C).nota, nota(C).classificacao], [25, 'fora'])
  assert.deepEqual([nota(D).nota, nota(D).classificacao], [null, 'sem dado'])
})

test('CSV sai com as colunas do contrato 0, aspas no produto e campos vazios sem dado', () => {
  const linhas = gerarCsv([A, D]).trim().split('\n')
  assert.equal(linhas[0], COLUNAS)
  assert.equal(linhas[1], '"Produto A",10.00,30.00,35.00,40.00,25.00,71.4,5,sim,2,nao,85,oportunidade forte')
  assert.equal(linhas[2], '"Produto ""D""",5.00,,,,,,0,nao,0,nao,,sem dado')
})

test('CSV com erro de catalogo deixa tem_catalogo, buybox_concorrentes e loja_oficial vazios; erro so no buybox deixa so os dois ultimos vazios', () => {
  const posicao = nome => COLUNAS.split(',').indexOf(nome)
  const iTemCatalogo = posicao('tem_catalogo')
  const iBuybox = posicao('buybox_concorrentes')
  const iLojaOficial = posicao('loja_oficial')

  const colunasE = gerarCsv([E]).trim().split('\n')[1].split(',')
  assert.equal(colunasE[iTemCatalogo], '')
  assert.equal(colunasE[iBuybox], '')
  assert.equal(colunasE[iLojaOficial], '')

  const colunasF = gerarCsv([F]).trim().split('\n')[1].split(',')
  assert.equal(colunasF[iTemCatalogo], 'sim')
  assert.equal(colunasF[iBuybox], '')
  assert.equal(colunasF[iLojaOficial], '')

  // catalogo normal (produto A) continua com sim/nao, sem afetar o resto
  const colunasA = gerarCsv([A]).trim().split('\n')[1].split(',')
  assert.equal(colunasA[iTemCatalogo], 'sim')
  assert.notEqual(colunasA[iBuybox], '')
  assert.equal(colunasA[iLojaOficial], 'nao')
})

test('md com erro de catalogo avisa "nao consultado" e a nota pode estar abaixo do real', () => {
  const md = gerarMd([E], { fornecedor: 'fornecedor-exemplo', categoria: 'doces', hoje: '2026-09-23' })
  assert.match(md, /Catálogo unificado: não consultado \(sem token\)/)
  assert.match(md, /Atenção: sem a consulta de catálogo, a nota pode estar até 5 pontos abaixo do real\./)
  const mdNormal = gerarMd([A], { fornecedor: 'fornecedor-exemplo', categoria: 'doces', hoje: '2026-09-23' })
  assert.doesNotMatch(mdNormal, /não consultado/)
  assert.doesNotMatch(mdNormal, /Atenção: sem a consulta de catálogo/)
})

// Catalogo achado (produtos.length > 0) mas buybox falhou: lojaOficialNoTopo le p.buybox.itens, que
// fica [] no erro, e da "sem loja oficial" sem ter checado de verdade. nota() concede o bonus de
// catalogo (+5) nesse "sem loja oficial" que na real e "nao sei": se existir loja oficial de verdade,
// o bonus nao devia ter entrado, entao a nota mostrada pode estar ate 5 pontos ACIMA do real (o
// oposto do caso de catalogo nao consultado, que fica ABAIXO por nao levar o bonus).
test('md com erro so no buybox (catalogo achado) avisa "vendedores nao consultados" e a nota pode estar acima do real', () => {
  const md = gerarMd([F], { fornecedor: 'fornecedor-exemplo', categoria: 'doces', hoje: '2026-09-23' })
  assert.match(md, /Catálogo unificado: sim, vendedores não consultados \(timeout\)/)
  assert.doesNotMatch(md, /0 vendedores disputando/)
  assert.match(md, /Atenção: sem a consulta do buybox, a nota pode estar até 5 pontos acima do real\./)
})

test('o cabecalho do CSV e o mesmo do contratos.md', () => {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const contratos = readFileSync(join(aqui, '..', '..', 'mercado-livre', 'referencias', 'contratos.md'), 'utf8')
  assert.ok(contratos.includes(COLUNAS))
})

test('md ordena por nota, explica o sem dado e lembra que a nota e heuristica', () => {
  const md = gerarMd([B, D, A], { fornecedor: 'fornecedor-exemplo', categoria: 'doces', hoje: '2026-09-23' })
  assert.ok(md.length > 0)
  assert.ok(md.indexOf('## Produto A') < md.indexOf('## Produto B'))
  assert.ok(md.indexOf('## Produto B') < md.indexOf('## Produto "D"'))
  assert.match(md, /Sem dado: a busca pediu login/)
  assert.match(md, /heurística/)
})

test('processar grava md, csv e a etapa da categoria; sem coleta, explica o que rodar', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pesq-'))
  try {
    assert.throws(() => processar({ fornecedor: 'fornecedor-exemplo', categoria: 'doces', raiz }), /coletar-cdp/)
    const pasta = join(raiz, 'fornecedores', 'fornecedor-exemplo')
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, '_raw-pesquisa-doces.json'), JSON.stringify([A, B, C, D]))
    const r = processar({ fornecedor: 'fornecedor-exemplo', categoria: 'doces', raiz, hoje: '2026-09-23' })
    assert.deepEqual(r.distribuicao, { 'oportunidade forte': 1, 'vale considerar': 1, desafiador: 0, fora: 1, 'sem dado': 1 })
    assert.equal(readFileSync(join(pasta, 'pesquisa-tendencia-doces.csv'), 'utf8').trim().split('\n').length, 5)
    const cat = JSON.parse(readFileSync(join(raiz, 'dados', 'pipeline', '_categorias', 'fornecedor-exemplo-doces.json'), 'utf8'))
    assert.equal(cat.etapas.pesquisa.status, 'ok')
    assert.equal(cat.etapas.pesquisa.produtos, 4)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('argumentos exige fornecedor e categoria', () => {
  assert.deepEqual(argumentos(['--fornecedor', 'f', '--categoria', 'c']), { fornecedor: 'f', categoria: 'c' })
  assert.throws(() => argumentos(['--fornecedor', 'f']), /--categoria/)
})
