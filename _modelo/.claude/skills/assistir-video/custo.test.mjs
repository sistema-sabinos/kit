// Testes do custo do /assistir-video. Sem rede e sem gravar no projeto: pasta temporaria.
// Rodar: node --test custo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tokensDaResposta, linhaDeCusto, registrarCusto, PRECOS } from './custo.mjs'

test('raciocinio do modelo entra como saida, porque o Google cobra como saida', () => {
  assert.deepEqual(tokensDaResposta({ promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 300 }), { entrada: 1000, saida: 500 })
  assert.deepEqual(tokensDaResposta(undefined), { entrada: 0, saida: 0 })
})

test('linha no contrato do kit {em, servico, usd, contexto} com o preco da tabela', () => {
  const l = linhaDeCusto({ modelo: 'gemini-3.8-flash', uso: { promptTokenCount: 1e6, candidatesTokenCount: 1e6 }, contexto: 'assistir-video x', hoje: '2026-10-04', agora: '2026-10-04T12:00:00.000Z' })
  assert.equal(l.em, '2026-10-04T12:00:00.000Z')
  assert.equal(l.servico, 'gemini-video')
  assert.equal(l.usd, PRECOS['gemini-3.8-flash'].entrada + PRECOS['gemini-3.8-flash'].saida)
  assert.equal(l.contexto, 'assistir-video x')
  assert.equal(l.tokens_entrada, 1e6)
})

test('depois do fim da promocao vale o preco cheio', () => {
  const l = linhaDeCusto({ modelo: 'gemini-3.8-flash', uso: { promptTokenCount: 1e6 }, contexto: 'c', hoje: '2027-01-02', agora: 'a' })
  assert.equal(l.usd, PRECOS['gemini-3.8-flash'].depois.entrada)
})

test('modelo fora da tabela grava os tokens com usd null e diz por que, nunca inventa preco', () => {
  const l = linhaDeCusto({ modelo: 'gemini-9-pro', uso: { promptTokenCount: 10 }, contexto: 'c', hoje: '2026-10-04', agora: 'a' })
  assert.equal(l.usd, null)
  assert.match(l.nota, /tabela/)
  assert.equal(l.tokens_entrada, 10)
})

test('registrarCusto acrescenta uma linha por chamada em dados/custos.jsonl', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'custo-'))
  try {
    registrarCusto({ em: 'a', servico: 's', usd: 0.1, contexto: 'c' }, raiz)
    registrarCusto({ em: 'b', servico: 's', usd: 0.2, contexto: 'c' }, raiz)
    const linhas = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    assert.equal(linhas.length, 2)
    assert.equal(linhas[1].usd, 0.2)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})
