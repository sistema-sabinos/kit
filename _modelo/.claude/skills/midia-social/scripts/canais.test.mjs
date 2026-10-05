// Testes da escolha de canais do Buffer. Sem rede.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherCanais } from './canais.mjs'

test('escolherCanais pega um canal por rede e ignora o desconectado', () => {
  const r = escolherCanais([
    { id: 'canal-ig-1', service: 'instagram', name: 'lojateste', isDisconnected: false },
    { id: 'canal-tt-0', service: 'tiktok', name: 'velho', isDisconnected: true },
    { id: 'canal-tt-1', service: 'tiktok', name: 'lojateste', isDisconnected: false },
    { id: 'canal-fb-1', service: 'facebook', name: 'x', isDisconnected: false },
  ])
  assert.deepEqual({ ig: r.canal_instagram, tt: r.canal_tiktok, yt: r.canal_youtube }, { ig: 'canal-ig-1', tt: 'canal-tt-1', yt: undefined })
  assert.ok(r.avisos.some(a => /desconectado/.test(a)))
  assert.ok(r.avisos.some(a => /youtube/i.test(a)))
})

test('escolherCanais com dois canais da mesma rede avisa e nao escolhe', () => {
  const r = escolherCanais([
    { id: 'a', service: 'instagram', name: 'loja1', isDisconnected: false },
    { id: 'b', service: 'instagram', name: 'loja2', isDisconnected: false },
  ])
  assert.equal(r.canal_instagram, undefined)
  assert.ok(r.avisos.some(a => /loja1/.test(a) && /loja2/.test(a)))
})
