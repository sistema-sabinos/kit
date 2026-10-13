// Testes do estado da esteira. Pasta temporaria, apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { slugDe, lerJson, gravarJson, caminhoDaCategoria, gravarEtapaDaCategoria, dataLocal, marcaDaFicha, marcaNoTitulo } from './pipeline.mjs'

const titulo = t => ({ titulo: t })

test('marcaNoTitulo: produto com marca e titulo sem ela reprova', () => {
  assert.match(marcaNoTitulo({ copy: titulo('Moedor de Cafe Eletrico 200w'), decisao: { marca: 'Acme' } }), /nao tem a marca "Acme"/)
})

test('marcaNoTitulo: marca dentro de outra palavra nao vale', () => {
  assert.match(marcaNoTitulo({ copy: titulo('Camiseta Modelo Casual'), decisao: { marca: 'Elo' } }), /nao tem a marca "Elo"/)
  assert.match(marcaNoTitulo({ copy: titulo('Algodao 1 kg'), decisao: { marca: 'LG' } }), /nao tem a marca "LG"/)
  assert.match(marcaNoTitulo({ copy: titulo('Moedor Acmeplus Inox'), decisao: { marca: 'Acme' } }), /nao tem a marca "Acme"/)
  assert.equal(marcaNoTitulo({ copy: titulo("Base L'Oréal Paris 30 ml"), decisao: { marca: "L'Oreal" } }), null)
})

test('marcaNoTitulo: marca no titulo passa, sem ligar pra caixa e acento', () => {
  assert.equal(marcaNoTitulo({ copy: titulo('Moedor de Cafe ACME Pro 200w'), decisao: { marca: 'Acme' } }), null)
  assert.equal(marcaNoTitulo({ copy: titulo('Liquidificador Arno Power'), decisao: { marca: 'Árno' } }), null)
})

test('marcaNoTitulo: sem marca na decisao nao confere, e decisao antiga vale', () => {
  assert.equal(marcaNoTitulo({ copy: titulo('Kit 5 Suspiros'), decisao: { marca: null, marca_autorizada: 'Acme' } }), null)
  assert.equal(marcaNoTitulo({ copy: titulo('Kit 5 Suspiros'), decisao: {} }), null)
  assert.match(marcaNoTitulo({ copy: titulo('Kit 5 Suspiros'), decisao: { marca_autorizada: 'Acme' } }), /nao tem a marca "Acme"/)
})

const ficha = Marca => ({ ficha: { Marca } })

test('marcaDaFicha: produto com marca leva a marca real, em qualquer caixa', () => {
  assert.equal(marcaDaFicha({ copy: ficha('Acme'), decisao: { marca: 'Acme' } }), null)
  assert.equal(marcaDaFicha({ copy: ficha('ACME'), decisao: { marca: 'Acme' } }), null)
})

test('marcaDaFicha: Genérica em produto com marca reprova', () => {
  assert.match(marcaDaFicha({ copy: ficha('Genérica'), decisao: { marca: 'Acme' } }), /produto e da marca "Acme".*marca real/)
})

test('marcaDaFicha: produto sem marca so aceita Genérica', () => {
  assert.equal(marcaDaFicha({ copy: ficha('Genérica'), decisao: { marca: null } }), null)
  assert.match(marcaDaFicha({ copy: ficha('Minha Loja'), decisao: { marca: null } }), /grave o nome em "marca"/)
  assert.match(marcaDaFicha({ copy: ficha('Sem marca'), decisao: {} }), /leva "Genérica"/)
  assert.match(marcaDaFicha({ copy: {}, decisao: {} }), /nao tem Marca: use "Genérica"/)
})

test('marcaDaFicha: decisao de antes da 5.12 com marca_autorizada segue valendo', () => {
  assert.equal(marcaDaFicha({ copy: ficha('Acme'), decisao: { marca_autorizada: 'Acme' } }), null)
  assert.match(marcaDaFicha({ copy: ficha('Genérica'), decisao: { marca_autorizada: 'Acme' } }), /marca real/)
})

test('marcaDaFicha: marca null na decisao manda sobre marca_autorizada antiga', () => {
  assert.equal(marcaDaFicha({ copy: ficha('Genérica'), decisao: { marca: null, marca_autorizada: 'Acme' } }), null)
  assert.match(marcaDaFicha({ copy: ficha('Acme'), decisao: { marca: null, marca_autorizada: 'Acme' } }), /nao tem marca/)
})

test('slugDe tira acento, espaco e pontuacao', () => {
  assert.equal(slugDe('Suspiro Tradicional 1 kg'), 'suspiro-tradicional-1-kg')
  assert.equal(slugDe('Pão de Açúcar (500 g)'), 'pao-de-acucar-500-g')
  assert.equal(slugDe('  --  '), '')
})

// new Date().toISOString() usa UTC: 23h30 no Brasil (UTC-3) vira o dia seguinte em UTC.
// dataLocal le ano/mes/dia do relogio local, pra "hoje" bater com o fuso de quem roda o script.
test('dataLocal usa o calendario local, nao o UTC', () => {
  assert.equal(dataLocal(new Date(2026, 8, 24, 23, 30)), '2026-09-24')
  assert.equal(dataLocal(new Date(2026, 0, 5, 0, 0)), '2026-01-05')
})

test('gravarJson grava inteiro e nao deixa temporario', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'pipe-'))
  try {
    const f = join(pasta, 'a', 'b.json')
    gravarJson(f, { x: 1 })
    assert.deepEqual(lerJson(f), { x: 1 })
    assert.deepEqual(readdirSync(dirname(f)), ['b.json'])
    assert.equal(lerJson(join(pasta, 'nao-existe.json'), 'padrao'), 'padrao')
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('gravarEtapaDaCategoria preserva as outras etapas e soma as listas pedidas', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pipe-'))
  try {
    const f = { fornecedor: 'fornecedor-exemplo', categoria: 'doces', raiz }
    gravarEtapaDaCategoria({ ...f, etapa: 'pesquisa', dados: { status: 'ok', produtos: 3 } })
    gravarEtapaDaCategoria({ ...f, etapa: 'espionagem', dados: { status: 'ok', produtos_analisados: ['a'] }, acrescentar: ['produtos_analisados'] })
    const fim = gravarEtapaDaCategoria({ ...f, etapa: 'espionagem', dados: { status: 'ok', produtos_analisados: ['b', 'a'] }, acrescentar: ['produtos_analisados'] })
    assert.deepEqual(fim.etapas.pesquisa, { status: 'ok', produtos: 3 })
    assert.deepEqual(fim.etapas.espionagem.produtos_analisados, ['a', 'b'])
    assert.deepEqual(lerJson(caminhoDaCategoria('fornecedor-exemplo', 'doces', raiz)), fim)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
