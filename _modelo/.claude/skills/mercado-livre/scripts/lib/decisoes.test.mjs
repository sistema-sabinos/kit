// Testes da ata de decisoes. Arquivo temporario, apagado no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validarDecisao, prazoDe, diasDesde, diaDaDecisao, decisoesVigentes, estadoDaDecisao, lerDecisoes, gravarDecisao } from './decisoes.mjs'
import { dataLocal } from './pipeline.mjs'

// troca o fuso so dentro de fn e devolve o antigo, mesmo se um assert falhar
function noFuso(tz, fn) {
  const antes = process.env.TZ
  try {
    process.env.TZ = tz
    return fn()
  } finally {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  }
}

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
  // diasDesde conta pelo dia local da decisao, entao o fuso fica fixo aqui
  noFuso('America/Sao_Paulo', () => {
    assert.equal(diasDesde('2026-09-01T23:00:00Z', '2026-09-04'), 3)
    assert.equal(diasDesde('2026-09-05T00:00:00Z', '2026-09-04'), 0)
  })
})

test('decidido em e o prazo saem no mesmo relogio: decisao das 22h no Brasil mostra 7 dias de prazo', () => {
  noFuso('America/Sao_Paulo', () => {
    const ts = '2026-10-20T01:00:00.000Z' // 19/10 as 22h em Sao Paulo
    assert.equal(diaDaDecisao(ts), '2026-10-19')
    assert.match(estadoDaDecisao(base({ ts }), {}, {}, '2026-10-21').motivo, /decidido em 2026-10-19, reavaliar em 2026-10-26/)
    assert.equal(diasDesde(ts, '2026-10-21'), 2)
  })
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

test('prazoDe conta 7 dias a partir do dia local: decisao das 22h no Brasil nao ganha um dia', () => {
  noFuso('America/Sao_Paulo', () => {
    const ts = '2026-10-20T01:00:00.000Z' // 19/10 as 22h em Sao Paulo
    assert.equal(dataLocal(new Date(ts)), '2026-10-19', 'canario: o fuso pegou')
    assert.equal(prazoDe(base({ ts })), '2026-10-26')
  })
})

test('prazoDe soma dias de calendario: troca de horario de verao no meio nao tira nem poe um dia', () => {
  noFuso('America/New_York', () => {
    // fim do horario de verao em 01/11/2026 e inicio em 08/03/2026 nos EUA
    assert.equal(prazoDe(base({ ts: '2026-10-26T00:30:00-04:00' })), '2026-11-02')
    assert.equal(prazoDe(base({ ts: '2026-03-02T23:30:00-05:00' })), '2026-03-09')
  })
})

test('estadoDaDecisao sem hoje usa o dia local, nao o UTC (o --listar chama assim)', () => {
  // fuso escolhido pra que agora o dia local seja diferente do dia UTC, a qualquer hora
  const tz = new Date().getUTCHours() < 12 ? 'Etc/GMT+12' : 'Etc/GMT-14'
  noFuso(tz, () => {
    const local = dataLocal()
    const utc = new Date().toLocaleDateString('sv-SE', { timeZone: 'UTC' })
    assert.notEqual(local, utc, 'canario: dia local e UTC diferentes neste fuso')
    const prazo = local > utc ? local : utc
    const esperado = local >= prazo ? 'vencida' : 'em_vigor'
    assert.equal(estadoDaDecisao(base({ reavaliar_em: prazo })).estado, esperado)
  })
})
