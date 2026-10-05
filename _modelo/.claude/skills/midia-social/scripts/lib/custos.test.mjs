// Testes do registro de custo. Sem rede; pasta temporaria apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registrarCusto, argumentos } from './custos.mjs'

test('registrarCusto cria dados/ e acrescenta uma linha JSON por chamada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-custo-'))
  try {
    const agora = new Date('2026-10-04T15:00:00Z')
    registrarCusto({ servico: 'gemini (pauta)', tokens: 18000, reais: 0.05, nota: 'perfil x' }, { raiz, agora })
    registrarCusto({ servico: 'gemini (decupagem)', reais: 0.3 }, { raiz, agora })
    const linhas = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    assert.equal(linhas.length, 2)
    assert.deepEqual(linhas[0], { data: '2026-10-04', servico: 'gemini (pauta)', tokens: 18000, custo_reais: 0.05, nota: 'perfil x' })
    assert.equal(linhas[1].tokens, null)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('registrarCusto recusa valor que nao e numero', () => {
  assert.throws(() => registrarCusto({ servico: 's', reais: 'abc' }, { raiz: tmpdir() }), /reais/)
})

test('argumentos da linha de comando', () => {
  assert.deepEqual(argumentos(['--servico', 'gemini', '--reais', '0,30', '--tokens', '1200']), { servico: 'gemini', reais: 0.3, tokens: 1200, nota: '' })
  assert.throws(() => argumentos(['--reais', '1']), /--servico/)
})
