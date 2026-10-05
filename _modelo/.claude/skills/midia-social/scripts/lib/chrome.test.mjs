// Testes do Chrome dedicado. Sem Chrome de verdade: spawn, fetch e existsSync sao injetados.
// Rodar: node --test chrome.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PORTA, CDP_URL, perfilDedicado, candidatosDeChrome, acharChrome, argumentosDoChrome, portaResponde, esperarPorta, abrirChrome, conectar } from './chrome.mjs'

test('no Windows os candidatos saem das variaveis de ambiente, sem letra de unidade escrita no codigo', () => {
  const env = { ProgramFiles: 'PF', 'ProgramFiles(x86)': 'PF86', LOCALAPPDATA: 'LA' }
  const c = candidatosDeChrome(env, 'win32')
  assert.equal(c.length, 3)
  for (const x of c) assert.ok(x.endsWith('chrome.exe'), x)
  assert.ok(c[0].startsWith('PF'))
  assert.deepEqual(candidatosDeChrome({}, 'win32'), [])
})

test('no Mac o candidato principal e o app em Applications, com espaco no caminho', () => {
  const c = candidatosDeChrome({ HOME: '/Users/x' }, 'darwin')
  assert.equal(c[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  assert.ok(c[1].startsWith('/Users/x/'))
})

test('no Linux os candidatos sao os binarios comuns', () => {
  assert.ok(candidatosDeChrome({}, 'linux').includes('/usr/bin/google-chrome'))
})

test('acharChrome devolve o primeiro que existe, ou null', () => {
  const env = { ProgramFiles: 'PF', 'ProgramFiles(x86)': 'PF86' }
  const so86 = p => p.startsWith('PF86')
  assert.ok(acharChrome({ env, plataforma: 'win32', existe: so86 }).startsWith('PF86'))
  assert.equal(acharChrome({ env, plataforma: 'win32', existe: () => false }), null)
})

test('argumentosDoChrome leva porta e perfil', () => {
  const a = argumentosDoChrome('/p/perfil', 9222)
  assert.ok(a.includes('--remote-debugging-port=9222'))
  assert.ok(a.includes('--user-data-dir=/p/perfil'))
  assert.equal(PORTA, 9222)
  assert.equal(CDP_URL, 'http://127.0.0.1:9222')
})

test('perfilDedicado fica em dados/chrome-perfil da raiz', () => {
  assert.equal(perfilDedicado('/raiz'), join('/raiz', 'dados', 'chrome-perfil'))
})

test('portaResponde: 200 sim, erro de rede nao, sem estourar', async () => {
  assert.equal(await portaResponde(CDP_URL, { fetchFn: async () => ({ ok: true }) }), true)
  assert.equal(await portaResponde(CDP_URL, { fetchFn: async () => { throw new Error('recusou') } }), false)
})

test('esperarPorta insiste ate responder e desiste no prazo', async () => {
  let n = 0
  const fetchFn = async () => { n += 1; if (n < 3) throw new Error('ainda nao'); return { ok: true } }
  assert.equal(await esperarPorta({ fetchFn, esperarMs: 10_000, passoMs: 1, dormir: async () => {} }), true)
  assert.equal(n, 3)
  assert.equal(await esperarPorta({ fetchFn: async () => { throw new Error('x') }, esperarMs: 5, passoMs: 1, dormir: async () => {} }), false)
})

test('abrirChrome reaproveita o Chrome que ja responde, sem abrir outro', async () => {
  let abriu = false
  const r = await abrirChrome({ fetchFn: async () => ({ ok: true }), spawnFn: () => { abriu = true }, log: () => {} })
  assert.equal(r.jaEstavaAberto, true)
  assert.equal(abriu, false)
})

test('abrirChrome acha o binario, cria o perfil, abre com os argumentos certos e espera a porta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrome-'))
  const chamadas = []
  let n = 0
  const fetchFn = async () => { n += 1; if (n < 3) throw new Error('subindo'); return { ok: true } }
  try {
    const r = await abrirChrome({
      raiz: dir, env: { HOME: '/Users/x' }, plataforma: 'darwin', existe: () => true,
      spawnFn: (bin, args, opts) => { chamadas.push({ bin, args, opts }); return { pid: 4242, unref() {} } },
      fetchFn, dormir: async () => {}, log: () => {},
    })
    assert.equal(r.jaEstavaAberto, false)
    assert.equal(r.pid, 4242)
    assert.equal(chamadas.length, 1)
    // o caminho com espaco vai inteiro num argumento so
    assert.equal(chamadas[0].bin, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    assert.ok(chamadas[0].args.includes(`--user-data-dir=${join(dir, 'dados', 'chrome-perfil')}`))
    assert.equal(chamadas[0].opts.detached, true)
    assert.ok(existsSync(join(dir, 'dados', 'chrome-perfil')))
    const ignora = join(dir, 'dados', 'chrome-perfil', '.gitignore')
    assert.ok(existsSync(ignora), 'o perfil nasce com .gitignore proprio')
    assert.match(readFileSync(ignora, 'utf8'), /^\*$/m)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('abrirChrome sem Chrome instalado explica o que fazer', async () => {
  await assert.rejects(abrirChrome({ fetchFn: async () => { throw new Error('x') }, existe: () => false, env: {}, plataforma: 'win32', log: () => {} }), /google\.com\/chrome/)
})

test('abrirChrome com porta que nunca sobe avisa pra fechar o Chrome', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chrome-'))
  try {
    await assert.rejects(abrirChrome({
      raiz: dir, env: { HOME: '/x' }, plataforma: 'darwin', existe: () => true,
      spawnFn: () => ({ pid: 1, unref() {} }), fetchFn: async () => { throw new Error('x') },
      esperarMs: 5, dormir: async () => {}, log: () => {},
    }), /Feche todas as janelas do Chrome/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('conectar sem Playwright instalado manda rodar o npm install da skill', async () => {
  await assert.rejects(conectar({ carregar: async () => { throw new Error('Cannot find package') } }), /npm install --prefix \.claude\/skills\/midia-social/)
})

test('conectar com Playwright falso e porta viva chama connectOverCDP na porta 9222', async () => {
  let url = null
  const pw = { chromium: { connectOverCDP: async u => { url = u; return { fechado: false } } } }
  const b = await conectar({ carregar: async () => pw, fetchFn: async () => ({ ok: true }) })
  assert.equal(url, CDP_URL)
  assert.equal(b.fechado, false)
})
