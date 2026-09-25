// Testes do estado da esteira. Pasta temporaria, apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { slugDe, lerJson, gravarJson, caminhoDaCategoria, gravarEtapaDaCategoria, dataLocal } from './pipeline.mjs'

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
