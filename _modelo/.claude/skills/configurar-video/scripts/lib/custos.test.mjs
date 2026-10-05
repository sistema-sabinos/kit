import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registrarCusto, estimar, liberarGasto, custoPorTokens, somarCustos } from './custos.mjs'

test('registrarCusto cria dados/ e grava uma linha no formato do kit', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'custo-'))
  try {
    const ok = registrarCusto({ servico: 'gemini-video', usd: 0.4, contexto: 'video-produto x bloco-1' }, { raiz, agora: () => new Date('2026-10-04T12:00:00Z') })
    assert.equal(ok, true)
    const linhas = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split('\n')
    assert.equal(linhas.length, 1)
    assert.deepEqual(JSON.parse(linhas[0]), { em: '2026-10-04T12:00:00.000Z', servico: 'gemini-video', usd: 0.4, contexto: 'video-produto x bloco-1' })
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('falha ao gravar so avisa e devolve false, nunca lanca', () => {
  const avisos = []
  const raiz = join(tmpdir(), 'nao-existe-', String.fromCharCode(0))
  const ok = registrarCusto({ servico: 's', usd: 1, contexto: 'c' }, { raiz, avisar: (m) => avisos.push(m) })
  assert.equal(ok, false)
  assert.match(avisos[0], /anote a mao/)
})

test('estimar e liberarGasto: teto e pode ir', () => {
  assert.deepEqual(estimar({ n: 56, precoUsd: 0.05, limiteUsd: 4 }), { total: 2.8, cabe: true })
  assert.equal(liberarGasto({ totalUsd: 5, limiteUsd: 4, autorizado: true }).codigo, 3)
  assert.match(liberarGasto({ totalUsd: 2, limiteUsd: 4, autorizado: false }).parou, /pode ir/)
  assert.equal(liberarGasto({ totalUsd: 2, limiteUsd: 4, autorizado: true }).codigo, 0)
})

test('custoPorTokens usa usageMetadata e devolve null sem uso', () => {
  assert.equal(custoPorTokens({ promptTokenCount: 1000000, candidatesTokenCount: 500000 }, { entradaUsdMtok: 1, saidaUsdMtok: 10 }), 6)
  assert.equal(custoPorTokens(undefined, { entradaUsdMtok: 1, saidaUsdMtok: 10 }), null)
})

test('custoPorTokens soma thoughtsTokenCount a saida (thinking cobra a preco de saida)', () => {
  assert.equal(custoPorTokens({ promptTokenCount: 1000000, candidatesTokenCount: 500000, thoughtsTokenCount: 500000 }, { entradaUsdMtok: 1, saidaUsdMtok: 10 }), 11)
})

test('somarCustos soma usd linha a linha e ignora linha quebrada', () => {
  assert.equal(somarCustos('{"usd":0.4}\n{"usd":0.08}\nlixo\n'), 0.48)
})
