// Testes das regras do Mercado Ads. Puras, sem rede; o freio sai de arquivo temporario.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { classificarCampanha, tacos, carregarFreio, PADROES } from './estrategia.mjs'

const maduro = { dias_dados: 10 }

test('campanha nova aprende, e gasto sem venda pede pausa', () => {
  assert.equal(classificarCampanha({ cost: 10, conversions: 0, acos: 0 }, { dias_dados: 3 }).acao, 'aprender')
  const r = classificarCampanha({ cost: 30, conversions: 0, acos: 0 }, maduro)
  assert.deepEqual([r.status, r.acao], ['ruim', 'pausar'])
})

test('campanha de 1 dia que gastou R$ 500 sem venda pausa, sem esperar a janela', () => {
  const r = classificarCampanha({ cost: 500, conversions: 0, acos: 0 }, { dias_dados: 1 })
  assert.deepEqual([r.status, r.acao], ['ruim', 'pausar'])
  assert.match(r.motivo, /R\$ 500\.00 sem nenhuma venda/)
})

test('campanha madura sem venda e sem gasto relevante observa, sem falar de ACOS', () => {
  const r = classificarCampanha({ cost: 12, conversions: 0, acos: 0 }, maduro)
  assert.deepEqual([r.status, r.acao], ['observar', 'manter'])
  assert.equal(r.motivo, 'sem venda ainda e gasto abaixo do limite de R$ 30: observar.')
  assert.doesNotMatch(r.motivo, /ACOS/)
})

test('ACOS acima do teto: a alavanca depende de quem trava a campanha', () => {
  assert.equal(classificarCampanha({ cost: 100, conversions: 3, acos: 0.3, orcamento: 10, gasto_diario: 9 }, maduro).alavanca, 'orcamento')
  const lance = classificarCampanha({ cost: 100, conversions: 3, acos: 0.3, orcamento: 10, gasto_diario: 2 }, maduro)
  assert.equal(lance.alavanca, 'lance')
  assert.match(lance.motivo, /ROAS objetivo/)
  assert.equal(classificarCampanha({ cost: 100, conversions: 3, acos: 0.3 }, maduro).alavanca, undefined)
})

test('ACOS no alvo so escala se bate no orcamento; entre alvo e teto mantem', () => {
  assert.equal(classificarCampanha({ cost: 50, conversions: 5, acos: 0.1, orcamento: 10, gasto_diario: 9 }, maduro).acao, 'escalar')
  assert.equal(classificarCampanha({ cost: 50, conversions: 5, acos: 0.1, orcamento: 10, gasto_diario: 1 }, maduro).acao, 'manter')
  const meio = classificarCampanha({ cost: 50, conversions: 5, acos: 0.2 }, maduro)
  assert.deepEqual([meio.status, meio.acao], ['observar', 'manter'])
})

test('o freio da pessoa manda sobre o padrao', () => {
  assert.equal(classificarCampanha({ cost: 50, conversions: 5, acos: 0.13 }, { ...maduro, acos_teto: 0.12, acos_alvo: 0.1 }).acao, 'reduzir')
})

test('tacos sem receita e zero', () => {
  assert.equal(tacos({ cost: 10, totalAmount: 0 }), 0)
  assert.equal(tacos({ cost: 10, totalAmount: 100 }), 0.1)
})

test('carregarFreio: sem arquivo e o padrao marcado; com arquivo soma; alvo acima do teto e erro', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'freio-'))
  try {
    const f = join(pasta, 'guard-rails.json')
    assert.deepEqual(carregarFreio(f), { ...PADROES, _padrao: true })
    writeFileSync(f, JSON.stringify({ acos_alvo: 0.1, acos_teto: 0.12 }))
    const freio = carregarFreio(f)
    assert.equal(freio.acos_teto, 0.12)
    assert.equal(freio.janela_minima_dias, 7)
    assert.equal(freio._padrao, undefined)
    writeFileSync(f, JSON.stringify({ acos_alvo: 0.3, acos_teto: 0.12 }))
    assert.throws(() => carregarFreio(f), /acima do acos_teto/)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
