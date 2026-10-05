import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { URLS, baixarDeepFilter } from './baixar-deep-filter.mjs'

const resposta = (bytes, ok = true) => ({ ok, status: ok ? 200 : 404, arrayBuffer: async () => new Uint8Array(bytes).buffer })

test('URLS cobre Windows x64 e Mac arm64 e x64 com a versao 0.5.6', () => {
  assert.match(URLS['win32-x64'], /deep-filter-0\.5\.6-x86_64-pc-windows-msvc\.exe$/)
  assert.match(URLS['darwin-arm64'], /deep-filter-0\.5\.6-aarch64-apple-darwin$/)
  assert.match(URLS['darwin-x64'], /deep-filter-0\.5\.6-x86_64-apple-darwin$/)
  for (const u of Object.values(URLS)) assert.match(u, /^https:\/\/github\.com\/Rikorose\/DeepFilterNet\/releases\/download\/v0\.5\.6\//)
})

test('baixa pro lugar certo e confere o tamanho', async () => {
  const d = mkdtempSync(join(tmpdir(), 'dfn-'))
  try {
    const chamadas = []
    const r = await baixarDeepFilter({ base: d, plat: 'win32', arch: 'x64', buscar: async (u) => { chamadas.push(u); return resposta(2 * 1024 * 1024) } })
    assert.equal(r.baixou, true)
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0], URLS['win32-x64'])
    const alvo = join(d, 'ferramentas', 'deep-filter', 'deep-filter.exe')
    assert.equal(existsSync(alvo), true)
    assert.equal(statSync(alvo).size, 2 * 1024 * 1024)
    // ja existe: nao baixa de novo
    const r2 = await baixarDeepFilter({ base: d, plat: 'win32', arch: 'x64', buscar: async () => { throw new Error('nao devia buscar') } })
    assert.equal(r2.baixou, false)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('arquivo pequeno demais e recusado e nao fica no disco', async () => {
  const d = mkdtempSync(join(tmpdir(), 'dfn-'))
  try {
    await assert.rejects(baixarDeepFilter({ base: d, plat: 'darwin', arch: 'arm64', buscar: async () => resposta(1000) }), /pequeno|1 MB/)
    assert.equal(existsSync(join(d, 'ferramentas', 'deep-filter', 'deep-filter')), false)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('status de erro vira mensagem clara', async () => {
  const d = mkdtempSync(join(tmpdir(), 'dfn-'))
  try {
    await assert.rejects(baixarDeepFilter({ base: d, plat: 'win32', arch: 'x64', buscar: async () => resposta(0, false) }), /download/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('plataforma sem binario avisa do afftdn e nao baixa', async () => {
  const d = mkdtempSync(join(tmpdir(), 'dfn-'))
  try {
    const avisos = []
    const r = await baixarDeepFilter({ base: d, plat: 'linux', arch: 'x64', buscar: async () => { throw new Error('nao devia buscar') }, avisar: (m) => avisos.push(m) })
    assert.equal(r.baixou, false)
    assert.equal(r.suportado, false)
    assert.match(avisos.join(' '), /afftdn/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})
