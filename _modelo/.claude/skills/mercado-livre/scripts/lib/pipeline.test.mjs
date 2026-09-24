// Testes do estado da esteira. Pasta temporaria, apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { slugDe, lerJson, gravarJson, caminhoDaCategoria, gravarEtapaDaCategoria } from './pipeline.mjs'

test('slugDe tira acento, espaco e pontuacao', () => {
  assert.equal(slugDe('Suspiro Tradicional 1 kg'), 'suspiro-tradicional-1-kg')
  assert.equal(slugDe('Pão de Açúcar (500 g)'), 'pao-de-acucar-500-g')
  assert.equal(slugDe('  --  '), '')
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
