// Testes do registro de custo. Sem rede; pasta temporaria apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registrarCusto, argumentos } from './custos.mjs'
import { liberarGasto, saldoDoMes } from '../../../conectar/scripts/lib/orcamento.mjs'

const NL = String.fromCharCode(10)

test('registrarCusto grava pelo registrador comum {em, servico, usd, contexto}, com area e tokens, uma linha por chamada', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-custo-'))
  try {
    const agora = new Date('2026-10-04T15:00:00Z')
    registrarCusto({ servico: 'gemini (pauta)', tokens: 18000, usd: 0.012, contexto: 'perfil x' }, { raiz, agora })
    registrarCusto({ servico: 'openai (carrossel)', usd: 0.05, area: 'imagem' }, { raiz, agora })
    const linhas = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split(NL).map(l => JSON.parse(l))
    assert.equal(linhas.length, 2)
    // em com o fuso da maquina, o mesmo instante
    assert.equal(new Date(linhas[0].em).getTime(), agora.getTime())
    assert.match(linhas[0].em, /[+-]\d{2}:\d{2}$/)
    assert.deepEqual({ ...linhas[0], em: undefined }, { em: undefined, servico: 'gemini (pauta)', usd: 0.012, contexto: 'perfil x', area: 'outros', tokens: 18000 })
    assert.equal(linhas[1].tokens, undefined)
    assert.equal(linhas[1].contexto, '')
    assert.equal(linhas[1].area, 'imagem')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('registrarCusto recusa valor que nao e numero e area fora da lista', () => {
  assert.throws(() => registrarCusto({ servico: 's', usd: 'abc' }, { raiz: tmpdir() }), /usd/)
  assert.throws(() => registrarCusto({ servico: 's', usd: 1, area: 'carro' }, { raiz: tmpdir() }), /area precisa ser/)
})

// D56: a midia-social respeita o orcamento do mes; a reserva da liberacao fecha quando a linha entra
test('com --reserva a linha leva o id, a reserva fecha e o gasto conta no saldo do mes', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-custo-'))
  try {
    mkdirSync(join(raiz, '_contexto'))
    writeFileSync(join(raiz, '_contexto', 'orcamento.md'), ['```orcamento', 'orcamento_mes_usd: 5', '```', ''].join(NL))
    const lib = liberarGasto({ estimativaUsd: 1, autorizado: true }, { raiz, contexto: 'carrossel' })
    assert.equal(lib.codigo, 0)
    assert.equal(saldoDoMes({ raiz }).reservado_usd, 1)
    const r = registrarCusto({ servico: 'openai (carrossel)', usd: 0.8, area: 'imagem', reserva: lib.reserva }, { raiz })
    assert.equal(r.reserva_fechada, true)
    const s = saldoDoMes({ raiz })
    assert.deepEqual([s.gasto_usd, s.reservado_usd, s.saldo_usd, s.por_area.imagem], [0.8, 0, 4.2, 0.8])
    assert.equal(JSON.parse(readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8')).reserva, lib.reserva)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('falha ao gravar lanca, e a reserva fica aberta', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-custo-'))
  try {
    // dados como arquivo: o registrador nao consegue criar a pasta
    writeFileSync(join(raiz, 'dados'), 'nao sou pasta')
    assert.throws(() => registrarCusto({ servico: 's', usd: 1, reserva: 'r1' }, { raiz }), /nao foi gravada/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('argumentos da linha de comando, com virgula decimal, area e reserva', () => {
  assert.deepEqual(argumentos(['--servico', 'gemini', '--usd', '0,03', '--tokens', '1200']), { servico: 'gemini', usd: 0.03, tokens: 1200, contexto: '' })
  assert.deepEqual(argumentos(['--servico', 's', '--usd', '1', '--area', 'imagem', '--reserva', 'abc']), { servico: 's', usd: 1, tokens: null, contexto: '', area: 'imagem', reserva: 'abc' })
  assert.throws(() => argumentos(['--usd', '1']), /--servico/)
})
