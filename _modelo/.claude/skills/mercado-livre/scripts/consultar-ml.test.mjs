import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { consultar } from './consultar-ml.mjs'

const SCRIPT = fileURLToPath(new URL('./consultar-ml.mjs', import.meta.url))

test('consultar-ml: devolve o JSON da API pelo mlGet', async () => {
  const pedidos = []
  const get = async caminho => { pedidos.push(caminho); return { sale_fee_amount: 12.5 } }
  const caminho = '/sites/MLB/listing_prices?price=100&category_id=MLB1&listing_type_id=gold_special'
  assert.deepEqual(await consultar(caminho, { get }), { sale_fee_amount: 12.5 })
  assert.deepEqual(pedidos, [caminho])
})

test('consultar-ml: so caminho da API, nunca outro endereco', async () => {
  const get = async () => { throw new Error('nao devia chamar a API') }
  for (const caminho of ['https://exemplo.com/x', 'http://exemplo.com/x', '//exemplo.com/x', 'sites/MLB', '', undefined]) {
    await assert.rejects(consultar(caminho, { get }), /caminho da API/, `aceitou ${caminho}`)
  }
})

test('consultar-ml: sem caminho ou com endereco de fora sai 2 sem ler o .env', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'consultar-ml-'))
  try {
    for (const args of [[], ['https://exemplo.com/x']]) {
      const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: pasta, encoding: 'utf8' })
      assert.equal(r.status, 2, `args ${JSON.stringify(args)}`)
      assert.match(r.stderr, /caminho da API/)
      assert.equal(r.stdout, '')
    }
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})
