// Testes da ata de decisoes. Arquivo temporario, apagado no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validarDecisao, prazoDe, diasDesde, decisoesVigentes, estadoDaDecisao, lerDecisoes, gravarDecisao } from './decisoes.mjs'

const base = (extra = {}) => ({ ts: '2026-09-01T12:00:00.000Z', escopo: 'ads', alvo: { id: 10, nome: 'Campanha kits' }, decisao: 'nao_mexer', resumo: 'deixar aprender', motivo: 'pouco dado', baseline: { acos_7d: 0.1 }, ...extra })

test('validarDecisao aponta campo faltando, ts sem hora e permanente com prazo', () => {
  assert.deepEqual(validarDecisao(base()), [])
  assert.ok(validarDecisao({ ...base(), motivo: undefined }).some(e => /motivo/.test(e)))
  assert.ok(validarDecisao(base({ ts: '01/09/2026' })).some(e => /ts invalido/.test(e)))
  assert.ok(validarDecisao(base({ alvo: { nome: 'x' } })).some(e => /alvo\.id/.test(e)))
  assert.ok(validarDecisao(base({ permanente: true, reavaliar_em: '2026-10-01' })).some(e => /permanente/.test(e)))
  assert.ok(validarDecisao(null).length > 0)
})

test('validarDecisao recusa baseline.acos_7d em porcentagem e aceita em fracao', () => {
  const erros = validarDecisao(base({ baseline: { acos_7d: 18 } }))
  assert.ok(erros.length > 0)
  assert.ok(erros.some(e => /acos_7d vai em fracao: 18% e 0\.18/.test(e)))
  assert.deepEqual(validarDecisao(base({ baseline: { acos_7d: 0.18 } })), [])
})

test('validarDecisao aceita ACOS acima de 100% em fracao (campanha sangrando) e recusa acima de 5', () => {
  assert.deepEqual(validarDecisao(base({ baseline: { acos_7d: 1.5 } })), [])
  assert.deepEqual(validarDecisao(base({ baseline: { acos_7d: 5 } })), [])
  const erros = validarDecisao(base({ baseline: { acos_7d: 5.01 } }))
  assert.ok(erros.length > 0)
  assert.ok(erros.some(e => /acos_7d vai em fracao/.test(e)))
})

test('prazoDe usa reavaliar_em, cai em 7 dias sem ele, e some quando permanente', () => {
  assert.equal(prazoDe(base({ reavaliar_em: '2026-09-15' })), '2026-09-15')
  assert.equal(prazoDe(base()), '2026-09-08')
  assert.equal(prazoDe(base({ permanente: true })), null)
  assert.equal(diasDesde('2026-09-01T23:00:00Z', '2026-09-04'), 3)
  assert.equal(diasDesde('2026-09-05T00:00:00Z', '2026-09-04'), 0)
})

test('decisoesVigentes fica com a mais recente de cada alvo e respeita o escopo', () => {
  const lista = [base(), base({ ts: '2026-09-03T12:00:00.000Z', decisao: 'reduzir' }), base({ escopo: 'conta', alvo: { id: 99 } })]
  const m = decisoesVigentes(lista, { escopo: 'ads' })
  assert.equal(m.size, 1)
  assert.equal(m.get('10').decisao, 'reduzir')
})

test('estadoDaDecisao: em vigor, vencida, permanente', () => {
  assert.equal(estadoDaDecisao(base(), {}, {}, '2026-09-05').estado, 'em_vigor')
  assert.equal(estadoDaDecisao(base(), {}, {}, '2026-09-08').estado, 'vencida')
  assert.match(estadoDaDecisao(base({ esperado: 'ACOS abaixo de 12%' }), {}, {}, '2026-09-08').motivo, /Esperavamos: ACOS abaixo de 12%/)
  assert.equal(estadoDaDecisao(base({ permanente: true }), {}, {}, '2027-01-01').estado, 'em_vigor')
})

test('estadoDaDecisao fura quando o ACOS sobe, mas gasto sem venda (Infinity) espera o limiar de gasto', () => {
  assert.equal(estadoDaDecisao(base(), { acos_7d: 0.14 }, {}, '2026-09-03').estado, 'furou')
  assert.equal(estadoDaDecisao(base(), { acos_7d: 0.12 }, {}, '2026-09-03').estado, 'em_vigor')
  assert.equal(estadoDaDecisao(base(), { acos_7d: Infinity, cost_7d: 7, total_amount_7d: 0 }, {}, '2026-09-03').estado, 'em_vigor')
  const sangria = estadoDaDecisao(base(), { acos_7d: Infinity, cost_7d: 70, total_amount_7d: 0 }, {}, '2026-09-04')
  assert.equal(sangria.estado, 'furou')
  assert.match(sangria.motivo, /R\$ 30\.00/)
})

test('lerDecisoes ignora linha quebrada e ata ausente, e gravarDecisao acrescenta', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ata-'))
  try {
    const arquivo = join(pasta, 'dados', 'decisoes.jsonl')
    assert.deepEqual(lerDecisoes(arquivo), [])
    gravarDecisao(base(), arquivo)
    gravarDecisao(base({ ts: '2026-09-02T12:00:00.000Z' }), arquivo)
    writeFileSync(arquivo, readFileSync(arquivo, 'utf8') + '{quebrada\n' + JSON.stringify({ escopo: 'ads' }) + '\n')
    const avisos = []
    const lidas = lerDecisoes(arquivo, { log: m => avisos.push(m) })
    assert.equal(lidas.length, 2)
    assert.equal(avisos.length, 2)
    assert.throws(() => gravarDecisao({ escopo: 'ads' }, arquivo), /decisao invalida/)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
