// Testes da peca por HTML. Rodar: node --test montar-peca.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { montarPeca } from './montar-peca.mjs'

test('sem --html ou --out, recusa', async () => {
  await assert.rejects(montarPeca({ out: 'a.jpg' }), /--html ou --out/)
  await assert.rejects(montarPeca({ html: 'a.html' }), /--html ou --out/)
})

test('HTML que nao existe, recusa dizendo qual', async () => {
  await assert.rejects(montarPeca({ html: join(tmpdir(), 'nao-existe-' + process.pid + '.html'), out: 'a.jpg' }), /nao achei o HTML/)
})

test('manda o HTML por file:, quadrado 1200 por padrao, e devolve custo zero', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'peca-'))
  try {
    const html = join(dir, 'peca.html')
    writeFileSync(html, '<p>oi</p>')
    const chamadas = []
    const r = await montarPeca({ html, out: join(dir, '02.jpg'), foto: async (f, o) => chamadas.push([f, o]) })
    assert.equal(chamadas.length, 1)
    assert.ok(chamadas[0][0].startsWith('file:'))
    assert.equal(chamadas[0][1].largura, 1200)
    assert.equal(chamadas[0][1].altura, 1200)
    assert.equal(r.custo_usd, 0)
    assert.equal(r.ok, true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
