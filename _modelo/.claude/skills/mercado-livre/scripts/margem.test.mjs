import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { margem, argumentos, rodar, impostoDaConfiguracao, MODO_DA_LOGISTICA } from './margem.mjs'

const SCRIPT = fileURLToPath(new URL('./margem.mjs', import.meta.url))
const ARGS = ['--preco', '100', '--custo', '30', '--frete', '10', '--categoria', 'MLB1234', '--tipo', 'classico', '--imposto', '6']
// a resposta do listing_prices e uma lista com uma linha por tipo; o Premium vem primeiro de proposito
const RESPOSTA = [
  { listing_type_id: 'gold_pro', sale_fee_amount: 19, sale_fee_details: { percentage_fee: 16, fixed_fee: 3 } },
  { listing_type_id: 'gold_special', sale_fee_amount: 17, sale_fee_details: { percentage_fee: 14, fixed_fee: 3 } },
]
const falso = (resposta = RESPOSTA) => {
  const pedidos = []
  return { pedidos, consultar: async c => { pedidos.push(c); return resposta } }
}
const deps = (f, extra = {}) => ({ consultar: f.consultar, imposto: () => { throw new Error('nao devia ler a configuracao') }, data: () => '2026-11-15', ...extra })

test('margem: comissao da linha do tipo pedido, com a tarifa fixa dentro', async () => {
  const f = falso()
  const m = await margem(argumentos(ARGS), deps(f))
  // 100 - 17 (14% + 3 fixos) - 10 de frete - 6 de imposto - 30 de custo = 37
  assert.equal(m.comissao_rs, 17)
  assert.equal(m.comissao_pct, 14)
  assert.equal(m.tarifa_fixa, 3)
  assert.equal(m.imposto_rs, 6)
  assert.equal(m.margem_rs, 37)
  assert.equal(m.margem_pct, 37)
  assert.equal(m.data, '2026-11-15')
  const premium = await margem(argumentos([...ARGS.slice(0, 9), 'premium', '--imposto', '6']), deps(falso()))
  assert.equal(premium.margem_rs, 35)
})

test('margem: a consulta leva categoria, tipo, logistica e o modo de envio que a doc casa com ela', async () => {
  const f = falso()
  await margem(argumentos(ARGS), deps(f))
  assert.equal(f.pedidos.length, 1)
  const [caminho, query] = f.pedidos[0].split('?')
  assert.equal(caminho, '/sites/MLB/listing_prices')
  const q = new URLSearchParams(query)
  assert.equal(q.get('price'), '100.00')
  assert.equal(q.get('category_id'), 'MLB1234')
  assert.equal(q.get('listing_type_id'), 'gold_special')
  assert.equal(q.get('logistic_type'), 'drop_off')
  assert.equal(q.get('shipping_mode'), 'me2')
  for (const [logistica, modo] of [['default', 'me1'], ['custom', 'custom'], ['not_specified', 'not_specified'], ['self_service', 'me2']]) {
    const g = falso()
    await margem(argumentos([...ARGS, '--logistica', logistica]), deps(g))
    assert.equal(new URLSearchParams(g.pedidos[0].split('?')[1]).get('shipping_mode'), modo, logistica)
  }
  assert.equal(Object.keys(MODO_DA_LOGISTICA).length, 9)
})

test('margem: virgula decimal, e o imposto da configuracao quando falta --imposto', async () => {
  const e = argumentos(['--preco', '49,90', '--custo', '15,5', '--frete', '0', '--categoria', 'mlb9', '--tipo', 'Clássico'])
  assert.equal(e.preco, 49.9)
  assert.equal(e.custo, 15.5)
  assert.equal(e.categoria, 'MLB9')
  assert.equal(e.impostoPct, undefined)
  const m = await margem(e, deps(falso([{ listing_type_id: 'gold_special', sale_fee_amount: 6.99, sale_fee_details: { percentage_fee: 14, fixed_fee: 0 } }]), { imposto: () => 4 }))
  assert.equal(m.imposto_pct, 4)
  assert.equal(m.margem_rs, 25.41)
  assert.equal(impostoDaConfiguracao(() => ({ imposto_pct: 8 })), 8)
  // milhar no formato brasileiro (revisao interna da 5.67): '1.200' e mil e duzentos, nunca R$ 1,20
  for (const [s, n] of [['1.200', 1200], ['1.299,90', 1299.9], ['R$ 1.299,90', 1299.9], ['1299.90', 1299.9], ['12.345.678', 12345678], ['0', 0], ['15,5', 15.5]]) {
    assert.equal(argumentos(['--preco', '1', '--custo', s, '--frete', '0', '--categoria', 'MLB1', '--tipo', 'classico']).custo, n, s)
  }
  for (const s of ['1,299.90', '1.2345', '12.34.56', '1,234', 'abc', '-5']) {
    assert.throws(() => argumentos(['--preco', '1', '--custo', s, '--frete', '0', '--categoria', 'MLB1', '--tipo', 'classico']), e3 => e3.codigo === 2, s)
  }
  assert.throws(() => impostoDaConfiguracao(() => { throw new Error('a configuracao esta sem: imposto_pct') }), e2 => e2.codigo === 2 && /--imposto/.test(e2.message))
})

test('margem: sem a linha do tipo, ou com duas, sai 1 em vez de pegar outra', async () => {
  for (const resposta of [[RESPOSTA[0]], [RESPOSTA[1], RESPOSTA[1]], [], { listing_type_id: 'gold_pro', sale_fee_amount: 1 }]) {
    await assert.rejects(margem(argumentos(ARGS), deps(falso(resposta))), e => e.codigo === 1 && /esperava 1/.test(e.message))
  }
})

test('margem: argumento faltando ou ruim sai 2 antes de consultar', async () => {
  const f = falso()
  for (const [i, troca] of [[1, ''], [1, '0'], [3, '-1'], [7, 'abc'], [9, 'ouro']]) {
    const a = [...ARGS]; a[i] = troca
    const r = await rodar(a, deps(f))
    assert.equal(r.codigo, 2, JSON.stringify(a))
    assert.equal(r.stdout, '')
  }
  assert.equal((await rodar([...ARGS, '--logistica', 'toString'], deps(f))).codigo, 2)
  assert.equal((await rodar(ARGS.slice(0, 8), deps(f))).codigo, 2)
  // opcao opcional escrita sem valor nao vira o padrao calada
  for (const a of [[...ARGS.slice(0, 10), '--imposto'], [...ARGS, '--logistica'], [...ARGS.slice(0, 10), '--imposto', '--logistica', 'drop_off']]) {
    const r = await rodar(a, deps(f, { imposto: () => 6 }))
    assert.equal(r.codigo, 2, JSON.stringify(a))
    assert.match(r.stderr, /sem valor/)
  }
  assert.equal(f.pedidos.length, 0)
})

test('margem: recusa da API nao leva a mensagem dela nem valor do .env pra saida', async () => {
  // isca montada em pedacos (T48): o erro do consultar traz um token, e nada dele pode sair
  const isca = ['APP', 'USR', '9137', 'isca', 'token'].join('-')
  const consultar = async () => { throw Object.assign(new Error(`401 invalid token ${isca} Bearer ${isca}`), { status: 401 }) }
  const r = await rodar(ARGS, deps({ consultar }))
  assert.equal(r.codigo, 1)
  assert.match(r.stderr, /recusou a consulta da comissao \(401\)/)
  assert.ok(`401 invalid token ${isca}`.includes(isca), 'canario: a busca acha a isca')
  assert.ok(!(r.stdout + r.stderr).includes(isca), 'a isca vazou')
  assert.ok(!(r.stdout + r.stderr).includes('9137'), 'pedaco da isca vazou')
})

test('margem: o CLI sem argumento sai 2 sem stdout e sem consultar', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'margem-'))
  try {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: pasta, encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /faltou --preco/)
    assert.equal(r.stdout, '')
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})
