// Testes do registro de custo. Sem rede; pasta temporaria apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registrarCusto, argumentos } from './custos.mjs'

test('registrarCusto grava no contrato do kit {em, servico, usd, contexto}, uma linha por chamada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-custo-'))
  try {
    const agora = new Date('2026-10-04T15:00:00Z')
    registrarCusto({ servico: 'gemini (pauta)', tokens: 18000, usd: 0.012, contexto: 'perfil x' }, { raiz, agora })
    registrarCusto({ servico: 'gemini (decupagem)', usd: 0.05 }, { raiz, agora })
    const linhas = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    assert.equal(linhas.length, 2)
    assert.deepEqual(linhas[0], { em: '2026-10-04T15:00:00.000Z', servico: 'gemini (pauta)', usd: 0.012, contexto: 'perfil x', tokens: 18000 })
    assert.equal(linhas[1].tokens, null)
    assert.equal(linhas[1].contexto, '')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('registrarCusto recusa valor que nao e numero', () => {
  assert.throws(() => registrarCusto({ servico: 's', usd: 'abc' }, { raiz: tmpdir() }), /usd/)
})

test('argumentos da linha de comando, com virgula decimal', () => {
  assert.deepEqual(argumentos(['--servico', 'gemini', '--usd', '0,03', '--tokens', '1200']), { servico: 'gemini', usd: 0.03, tokens: 1200, contexto: '' })
  assert.throws(() => argumentos(['--usd', '1']), /--servico/)
})
