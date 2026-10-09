// Testes da coleta do Mercado Ads. API falsa; snapshots em pasta temporaria.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { janela, normalizar, mesclarJanelaCurta, historicoDeSnapshots, coletar, descobrirAnunciante } from './ads.mjs'

test('janela conta os dias pra tras e trava em 90', () => {
  const agora = new Date(2026, 8, 23, 12)
  assert.deepEqual(janela(30, agora), { date_from: '2026-08-24', date_to: '2026-09-23' })
  assert.equal(janela(500, agora).date_from, '2026-06-25')
  assert.equal(janela(0, agora).date_from, '2026-09-22')
})

test('normalizar vira o ACOS de porcentagem em fracao e soma a idade pelo historico', () => {
  const [c] = normalizar([{ id: 7, name: 'Kits', status: 'active', budget: 20, metrics: { acos: 15.89, roas: 6.3, cost: 50, units_quantity: 4, total_amount: 314.6 } }], { 7: 9 })
  assert.equal(c.acos.toFixed(4), '0.1589')
  assert.equal(c.dias_dados, 10)
  assert.equal(c.orcamento, 20)
  assert.equal(c.conversions, 4)
  assert.equal(normalizar([{ campaign_id: 8 }])[0].clicks, 0)
})

test('normalizar usa a data de criacao quando ela e maior que o historico', () => {
  const agora = new Date(2026, 8, 23, 12)
  const criada = new Date(agora.getTime() - 60 * 86400000).toISOString()
  assert.equal(normalizar([{ id: 1, date_created: criada }], {}, agora)[0].dias_dados, 60)
  assert.equal(normalizar([{ id: 1, created_date: criada }], {}, agora)[0].dias_dados, 60)
  assert.equal(normalizar([{ id: 1, date_created: criada }], { 1: 80 }, agora)[0].dias_dados, 81)
  assert.equal(normalizar([{ id: 1 }], {}, agora)[0].dias_dados, 1)
})

test('mesclarJanelaCurta so poe os campos de 7 dias em quem tem dado', () => {
  const r = mesclarJanelaCurta([{ id: 1 }, { id: 2 }], [{ id: 1, metrics: { cost: 7, total_amount: 70 } }])
  assert.deepEqual(r, [{ id: 1, cost_7d: 7, total_amount_7d: 70 }, { id: 2 }])
})

test('historicoDeSnapshots conta aparicoes e pula arquivo quebrado', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ads-'))
  try {
    assert.deepEqual(historicoDeSnapshots(join(pasta, 'nao-existe')), {})
    writeFileSync(join(pasta, '2026-09-21.json'), JSON.stringify({ campanhas: [{ id: 1 }, { id: 2 }] }))
    writeFileSync(join(pasta, '2026-09-22.json'), JSON.stringify({ campanhas: [{ id: 1 }] }))
    writeFileSync(join(pasta, '2026-09-23.json'), '{quebrado')
    assert.deepEqual(historicoDeSnapshots(pasta), { 1: 2, 2: 1 })
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('coletar pagina, cai pra Api-Version 1 no 406 e junta a janela de 7 dias', async () => {
  const pedidos = []
  const get = async (caminho, { apiVersion }) => {
    pedidos.push({ caminho, apiVersion })
    if (apiVersion === 2) { const e = new Error('406'); e.status = 406; throw e }
    const offset = Number(new URLSearchParams(caminho.split('?')[1]).get('offset'))
    if (offset === 0) return { paging: { total: 2 }, results: [{ id: 1, name: 'A', metrics: { cost: 10, total_amount: 100, units_quantity: 1, acos: 10 } }] }
    return { paging: { total: 2 }, results: [{ id: 2, name: 'B', metrics: { cost: 5, total_amount: 0, acos: 0 } }] }
  }
  const pasta = mkdtempSync(join(tmpdir(), 'ads-'))
  try {
    const s = await coletar({ get, env: { ML_ADVERTISER_ID: '99' }, dias: 30, agora: new Date(2026, 8, 23, 12), pasta })
    assert.equal(s.api_version, 1)
    assert.equal(s.campanhas.length, 2)
    assert.deepEqual(s.totais, { cost: 15, conversions: 1, total_amount: 100 })
    assert.equal(s.campanhas[0].cost_7d, 10)
    assert.ok(pedidos.every(p => p.caminho.includes('/advertisers/99/product_ads/campaigns/search')))
    await assert.rejects(coletar({ get, env: {}, pasta }), /--anunciante/)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('coletar com dias 3 e 7 preenche cost_7d', async () => {
  const janelas = []
  const get = async caminho => {
    const q = new URLSearchParams(caminho.split('?')[1])
    janelas.push(`${q.get('date_from')}..${q.get('date_to')}`)
    return { paging: { total: 1 }, results: [{ id: 1, name: 'A', metrics: { cost: 3, total_amount: 30 } }] }
  }
  const pasta = mkdtempSync(join(tmpdir(), 'ads-'))
  try {
    const agora = new Date(2026, 8, 23, 12)
    const sete = await coletar({ get, env: { ML_ADVERTISER_ID: '99' }, dias: 7, agora, pasta })
    assert.equal(sete.campanhas[0].cost_7d, 3)
    assert.equal(janelas.length, 1, 'com 7 dias, a janela e pedida uma vez')
    janelas.length = 0
    const tres = await coletar({ get, env: { ML_ADVERTISER_ID: '99' }, dias: 3, agora, pasta })
    assert.equal(tres.campanhas[0].cost_7d, 3)
    assert.equal(janelas.length, 2, 'com 3 dias, busca tambem a janela de 7')
    assert.notEqual(janelas[0], janelas[1])
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('descobrirAnunciante prefere o do Brasil e explica quando nao ha nenhum', async () => {
  assert.deepEqual(await descobrirAnunciante(async () => ({ advertisers: [{ advertiser_id: 1, site_id: 'MLA' }, { advertiser_id: 2, site_id: 'MLB' }] })), { ML_ADVERTISER_ID: '2', ML_ADVERTISER_SITE_ID: 'MLB' })
  await assert.rejects(descobrirAnunciante(async () => ({ advertisers: [] })), /Mercado Ads esta ativo/)
})
