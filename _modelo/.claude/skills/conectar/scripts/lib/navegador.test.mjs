// Testes da lib do Chrome dedicado do nucleo. Sem Chrome de verdade: spawn, fetch, existe e livre
// sao injetados; o conferirPerfil e o portaLivre rodam contra servidor de mentira em 127.0.0.1.
// Rodar: node --test navegador.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { createServer as servidorHttp } from 'node:http'
import { createServer as servidorTcp } from 'node:net'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FAIXA, SENTINELA, AVISO, perfilDedicado, portaDoProjeto, candidatosDeChrome, acharChrome, argumentosDoChrome,
  guidDaPorta, portaLivre, esperarPorta, pidDoChrome, conferirPerfil, abrirChrome, conectar, sessaoCaiu,
} from './navegador.mjs'
import { RAIZ } from './raiz.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const P = FAIXA.inicio + 7

const temp = () => mkdtempSync(join(tmpdir(), 'navegador-'))
// a sentinela de mentira leva o caminho do proprio perfil, como a que a lib grava
const gravar = (perfil, dados) => { mkdirSync(perfil, { recursive: true }); writeFileSync(join(perfil, SENTINELA), typeof dados === 'string' ? dados : JSON.stringify({ perfil, ...dados })) }
const crua = perfil => JSON.parse(readFileSync(join(perfil, SENTINELA), 'utf8'))
const sentinela = perfil => { const s = crua(perfil); return { porta: s.porta, guid: s.guid } }

// Chrome de mentira: cada porta viva responde o proprio guid; o spawn faz a porta pedida subir
// depois de duas perguntas, com guid novo
function chromeFalso(vivos = {}) {
  const portas = { ...vivos }
  const subindo = {}
  const abertos = []
  // o guidDaPorta engole erro do fetch, entao a falta de prazo se conta aqui e se confere no teste
  const semPrazo = []
  const fetchFn = async (url, opcoes) => {
    if (!(opcoes && opcoes.signal)) semPrazo.push(url)
    const p = Number(new URL(url).port)
    if (subindo[p] > 0) { subindo[p] -= 1; throw new Error('subindo') }
    if (!portas[p]) throw new Error('recusou')
    return { ok: true, json: async () => ({ webSocketDebuggerUrl: `ws://127.0.0.1:${p}/devtools/browser/${portas[p]}` }) }
  }
  const spawnFn = (bin, args, opts) => {
    const p = Number(args.find(a => a.startsWith('--remote-debugging-port=')).split('=')[1])
    abertos.push({ bin, args, opts, porta: p })
    portas[p] = `novo-${abertos.length}`
    subindo[p] = 2
    pids[p] = 4240 + abertos.length
    return { pid: pids[p], unref() {} }
  }
  // o processo que responde na porta e o que o spawn abriu nela
  const pids = {}
  const perguntarPid = async p => pids[p] ?? null
  return { portas, abertos, semPrazo, fetchFn, spawnFn, perguntarPid }
}

const MAC = { env: { HOME: '/Users/x' }, plataforma: 'darwin', existe: () => true, dormir: async () => {}, log: () => {}, livre: async () => true }

// servidor de mentira do /json/version, na porta que o sistema der
async function servidorDoGuid(guid) {
  const s = servidorHttp((req, res) => {
    const porta = s.address().port
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ Browser: 'Chrome/1', webSocketDebuggerUrl: `ws://127.0.0.1:${porta}/devtools/browser/${guid}` }))
  })
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  return { porta: s.address().port, fechar: () => new Promise(r => s.close(r)) }
}

async function portaMorta() {
  const s = servidorTcp()
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const porta = s.address().port
  await new Promise(r => s.close(r))
  return porta
}

test('perfilDedicado fica em dados/chrome-perfil da raiz', () => {
  assert.equal(perfilDedicado('/raiz'), join('/raiz', 'dados', 'chrome-perfil'))
})

test('portaDoProjeto fica na faixa alta, longe da porta padrao do Chrome e das portas efemeras', () => {
  assert.ok(FAIXA.inicio > 9229, `a faixa comeca em ${FAIXA.inicio}, no meio das portas de depuracao comuns`)
  assert.ok(FAIXA.inicio + FAIXA.tamanho + 10 < 32768, 'a faixa, com o pulo da colisao, entra nas efemeras do Linux')
  const dirs = [temp(), temp(), temp()]
  try {
    for (const d of dirs) {
      const p = portaDoProjeto(d)
      assert.ok(Number.isInteger(p) && p >= FAIXA.inicio && p < FAIXA.inicio + FAIXA.tamanho, `porta ${p} fora da faixa`)
    }
  } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }) }
})

test('portaDoProjeto: a mesma raiz da a mesma porta, e no Windows caixa e barra nao mudam a porta', () => {
  const d = temp()
  try {
    assert.equal(portaDoProjeto(d), portaDoProjeto(d))
  } finally { rmSync(d, { recursive: true, force: true }) }
  const b = String.fromCharCode(92)
  const comBarra = ['C:', 'Proj', 'Loja'].join(b)
  const outraCaixa = ['c:', 'proj', 'loja'].join('/')
  assert.equal(portaDoProjeto(comBarra, { plataforma: 'win32' }), portaDoProjeto(outraCaixa, { plataforma: 'win32' }))
})

test('portaDoProjeto: a porta da sentinela vence o hash', () => {
  const d = temp()
  try {
    const hash = portaDoProjeto(d)
    const outra = hash === 30001 ? 30002 : 30001
    gravar(perfilDedicado(d), { porta: outra, guid: 'g' })
    assert.equal(portaDoProjeto(d), outra)
    gravar(perfilDedicado(d), '{quebrada')
    assert.equal(portaDoProjeto(d), hash, 'sentinela quebrada volta pro hash')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('guidDaPorta tira o guid do webSocketDebuggerUrl e devolve null em erro, sem ok ou sem o campo', async () => {
  let pediu = null
  const responde = corpo => async (url, opcoes) => { pediu = { url, opcoes }; return { ok: true, json: async () => corpo } }
  assert.equal(await guidDaPorta(P, { fetchFn: responde({ webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/abc-1' }) }), 'abc-1')
  assert.equal(pediu.url, `http://127.0.0.1:${P}/json/version`)
  assert.ok(pediu.opcoes.signal, 'a pergunta leva prazo')
  assert.equal(await guidDaPorta(P, { fetchFn: async () => { throw new Error('recusou') } }), null)
  assert.equal(await guidDaPorta(P, { fetchFn: async () => ({ ok: false, json: async () => ({}) }) }), null)
  assert.equal(await guidDaPorta(P, { fetchFn: responde({ Browser: 'Chrome/1' }) }), null)
})

test('esperarPorta insiste ate a porta dar guid e desiste no prazo', async () => {
  let n = 0
  const fetchFn = async () => { n += 1; if (n < 3) throw new Error('ainda nao'); return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://x/devtools/browser/g3' }) } }
  const dormiu = []
  assert.equal(await esperarPorta({ porta: P, fetchFn, esperarMs: 10_000, passoMs: 7, dormir: async ms => { dormiu.push(ms) } }), 'g3')
  assert.equal(n, 3)
  assert.deepEqual(dormiu, [7, 7], 'espera o passo entre as tentativas')
  assert.equal(await esperarPorta({ porta: P, fetchFn: async () => { throw new Error('x') }, esperarMs: 5, passoMs: 1, dormir: async () => {} }), null)
})

test('portaLivre: porta ocupada da false e porta solta da true', async () => {
  const s = servidorTcp()
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const porta = s.address().port
  try {
    assert.equal(await portaLivre(porta), false)
  } finally { await new Promise(r => s.close(r)) }
  assert.equal(await portaLivre(porta), true)
})

test('conferirPerfil: guid igual ao da sentinela da conferido', async () => {
  const d = temp()
  const s = await servidorDoGuid('g-1')
  try {
    gravar(d, { porta: s.porta, guid: 'g-1' })
    assert.deepEqual(await conferirPerfil({ porta: s.porta, perfil: d }), { estado: 'conferido', guid: 'g-1' })
  } finally { await s.fechar(); rmSync(d, { recursive: true, force: true }) }
})

test('conferirPerfil: guid diferente na porta da sentinela da outro-na-porta', async () => {
  const d = temp()
  const s = await servidorDoGuid('outro')
  try {
    gravar(d, { porta: s.porta, guid: 'velho' })
    assert.deepEqual(await conferirPerfil({ porta: s.porta, perfil: d }), { estado: 'outro-na-porta', guid: 'outro' })
  } finally { await s.fechar(); rmSync(d, { recursive: true, force: true }) }
})

test('conferirPerfil: porta viva sem sentinela, ou sentinela quebrada, da sem-sentinela', async () => {
  const d = temp()
  const s = await servidorDoGuid('g-2')
  try {
    assert.deepEqual(await conferirPerfil({ porta: s.porta, perfil: d }), { estado: 'sem-sentinela', guid: 'g-2' })
    gravar(d, '{nao e json')
    assert.equal((await conferirPerfil({ porta: s.porta, perfil: d })).estado, 'sem-sentinela')
    gravar(d, { porta: 'x', guid: 'g-2' })
    assert.equal((await conferirPerfil({ porta: s.porta, perfil: d })).estado, 'sem-sentinela')
    for (const ruim of [{ porta: 80, guid: 'g-2' }, { porta: 70000, guid: 'g-2' }, { porta: s.porta + 0.5, guid: 'g-2' }, { porta: s.porta, guid: 7 }]) {
      gravar(d, ruim)
      assert.equal((await conferirPerfil({ porta: s.porta, perfil: d })).estado, 'sem-sentinela', JSON.stringify(ruim))
    }
  } finally { await s.fechar(); rmSync(d, { recursive: true, force: true }) }
})

test('conferirPerfil: sentinela copiada de outro projeto da sem-sentinela e a porta volta pro hash', async () => {
  const a = temp()
  const b = temp()
  const s = await servidorDoGuid('g-a')
  try {
    const hashB = portaDoProjeto(b)
    gravar(perfilDedicado(a), { porta: s.porta, guid: 'g-a' })
    assert.equal((await conferirPerfil({ porta: s.porta, perfil: perfilDedicado(a) })).estado, 'conferido', 'canario: no projeto dono a sentinela confere')
    // a pasta do projeto A copiada pra B com o Chrome do A aberto
    mkdirSync(perfilDedicado(b), { recursive: true })
    writeFileSync(join(perfilDedicado(b), SENTINELA), readFileSync(join(perfilDedicado(a), SENTINELA)))
    assert.equal((await conferirPerfil({ porta: s.porta, perfil: perfilDedicado(b) })).estado, 'sem-sentinela')
    assert.equal(portaDoProjeto(b), hashB)
    // sentinela sem o caminho do perfil tambem nao vale
    gravar(perfilDedicado(b), { perfil: undefined, porta: s.porta, guid: 'g-a' })
    assert.equal((await conferirPerfil({ porta: s.porta, perfil: perfilDedicado(b) })).estado, 'sem-sentinela')
  } finally { await s.fechar(); rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }) }
})

test('conferirPerfil: porta morta com sentinela velha da porta-fechada', async () => {
  const d = temp()
  try {
    const porta = await portaMorta()
    gravar(d, { porta, guid: 'velho' })
    assert.deepEqual(await conferirPerfil({ porta, perfil: d }), { estado: 'porta-fechada', guid: null })
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('candidatos e acharChrome', () => {
  // no Windows os candidatos saem das variaveis de ambiente, sem letra de unidade escrita no codigo
  const env = { ProgramFiles: 'PF', 'ProgramFiles(x86)': 'PF86', LOCALAPPDATA: 'LA' }
  const c = candidatosDeChrome(env, 'win32')
  assert.equal(c.length, 3)
  for (const x of c) assert.ok(x.endsWith('chrome.exe'), x)
  assert.ok(c[0].startsWith('PF'))
  assert.deepEqual(candidatosDeChrome({}, 'win32'), [])
  // no Mac o candidato principal e o app em Applications, com espaco no caminho
  const m = candidatosDeChrome({ HOME: '/Users/x' }, 'darwin')
  assert.equal(m[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  assert.ok(m[1].startsWith('/Users/x/'))
  // no Linux os candidatos sao os binarios comuns
  assert.ok(candidatosDeChrome({}, 'linux').includes('/usr/bin/google-chrome'))
  // acharChrome devolve o primeiro que existe, ou null
  const so86 = p => p.startsWith('PF86')
  assert.ok(acharChrome({ env, plataforma: 'win32', existe: so86 }).startsWith('PF86'))
  assert.equal(acharChrome({ env, plataforma: 'win32', existe: () => false }), null)
})

test('argumentosDoChrome leva porta, perfil e headless', () => {
  const a = argumentosDoChrome('/p/perfil', P)
  assert.ok(a.includes(`--remote-debugging-port=${P}`))
  assert.ok(a.includes('--user-data-dir=/p/perfil'))
  assert.ok(!a.some(x => x.startsWith('--headless')))
  assert.ok(argumentosDoChrome('/p/perfil', P, { headless: true }).includes('--headless=new'))
})

test('abrirChrome reaproveita so o Chrome conferido, sem abrir outro', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'g-1' })
    const r = await abrirChrome({ ...MAC, raiz, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.deepEqual(r, { jaEstavaAberto: true, perfilConferido: true, porta: P, pid: null })
    assert.equal(ch.abertos.length, 0)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome abre, espera a porta e grava a sentinela com o guid', async () => {
  const raiz = temp()
  const ch = chromeFalso()
  try {
    const r = await abrirChrome({ ...MAC, raiz, porta: P, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.deepEqual(r, { jaEstavaAberto: false, perfilConferido: true, porta: P, pid: 4241 })
    assert.equal(ch.abertos.length, 1)
    // o caminho com espaco vai inteiro num argumento so
    assert.equal(ch.abertos[0].bin, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    const perfil = perfilDedicado(raiz)
    assert.ok(ch.abertos[0].args.includes(`--user-data-dir=${perfil}`))
    assert.ok(ch.abertos[0].args.includes(`--remote-debugging-port=${P}`))
    assert.equal(ch.abertos[0].opts.detached, true)
    const ignora = join(perfil, '.gitignore')
    assert.ok(existsSync(ignora), 'o perfil nasce com .gitignore proprio')
    assert.match(readFileSync(ignora, 'utf8'), /^\*$/m)
    assert.deepEqual(sentinela(perfil), { porta: P, guid: 'novo-1' })
    assert.equal(crua(perfil).perfil, perfil, 'a sentinela leva o caminho do perfil que a gravou')
    assert.ok(ch.semPrazo.length === 0 && ch.abertos.length === 1, `pergunta sem prazo: ${ch.semPrazo.join(', ')}`)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome: sentinela velha com a porta morta reabre na mesma porta', async () => {
  const raiz = temp()
  const ch = chromeFalso()
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'velho' })
    const r = await abrirChrome({ ...MAC, raiz, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.equal(ch.abertos.length, 1)
    assert.equal(ch.abertos[0].porta, P)
    assert.equal(r.porta, P)
    assert.equal(r.jaEstavaAberto, false)
    assert.deepEqual(sentinela(perfilDedicado(raiz)), { porta: P, guid: 'novo-1' })
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome: porta viva com outro Chrome abre na porta seguinte livre e grava a sentinela', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'outro' })
  const avisos = []
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'velho' })
    const r = await abrirChrome({ ...MAC, raiz, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid, livre: async p => p !== P, log: m => avisos.push(m) })
    assert.equal(ch.abertos.length, 1)
    assert.ok(ch.abertos[0].args.includes(`--remote-debugging-port=${P + 1}`))
    assert.equal(r.porta, P + 1)
    assert.equal(r.perfilConferido, true)
    assert.deepEqual(sentinela(perfilDedicado(raiz)), { porta: P + 1, guid: 'novo-1' })
    assert.equal(portaDoProjeto(raiz), P + 1)
    assert.ok(avisos.some(m => m.includes('/conectar')), 'avisa que o navegador da IA precisa ligar de novo')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome soExistente: perfil que nao existe nao cria perfil (licao 262)', async () => {
  const raiz = temp()
  const ch = chromeFalso()
  const perfil = join(raiz, 'sem-perfil')
  try {
    await assert.rejects(
      abrirChrome({ ...MAC, raiz, perfil, porta: P, soExistente: true, existe: c => c !== perfil, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid }),
      e => e.estado === 'sem-perfil' && /perfil novo/.test(e.message),
    )
    assert.equal(ch.abertos.length, 0)
    assert.equal(existsSync(perfil), false)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome soExistente: outro Chrome na porta nao abre nem pula de porta', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'outro' })
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'velho' })
    const r = await abrirChrome({ ...MAC, raiz, perfil, porta: P, soExistente: true, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid, livre: async p => p !== P })
    assert.deepEqual(r, { jaEstavaAberto: true, perfilConferido: false, porta: P, pid: null })
    assert.equal(ch.abertos.length, 0)
    assert.deepEqual(sentinela(perfil), { porta: P, guid: 'velho' })
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome: as portas seguintes todas tomadas explica e nao abre', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'outro' })
  try {
    await assert.rejects(abrirChrome({ ...MAC, raiz, porta: P, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid, livre: async () => false }), new RegExp(`nenhuma porta livre de ${P} a ${P + 10}`))
    assert.equal(ch.abertos.length, 0)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome soExistente: porta tomada por outro programa explica e nao pula de porta', async () => {
  const raiz = temp()
  const ch = chromeFalso()
  const perguntadas = []
  try {
    await assert.rejects(
      abrirChrome({ ...MAC, raiz, porta: P, soExistente: true, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid, livre: async p => { perguntadas.push(p); return false } }),
      new RegExp(`a porta ${P} do Chrome dedicado esta com outro programa`),
    )
    assert.equal(ch.abertos.length, 0)
    assert.deepEqual(perguntadas, [P])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome: outro Chrome que pega a porta enquanto este abre nao grava a sentinela', async () => {
  const raiz = temp()
  const ch = chromeFalso()
  try {
    await assert.rejects(
      abrirChrome({ ...MAC, raiz, porta: P, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: async () => 999 }),
      new RegExp(`outro Chrome pegou a porta ${P}`),
    )
    assert.equal(ch.abertos.length, 1)
    assert.equal(existsSync(join(perfilDedicado(raiz), SENTINELA)), false)
    // sem conseguir perguntar, tambem nao grava
    await assert.rejects(abrirChrome({ ...MAC, raiz, porta: P + 1, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: async () => null }), /outro Chrome pegou a porta/)
    assert.equal(existsSync(join(perfilDedicado(raiz), SENTINELA)), false)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('pidDoChrome devolve null quando a porta nao responde', async () => {
  assert.equal(await pidDoChrome(await portaMorta(), 'g', { timeoutMs: 2000 }), null)
})

test('abrirChrome sem Chrome instalado explica o que fazer', async () => {
  const raiz = temp()
  try {
    await assert.rejects(abrirChrome({ raiz, porta: P, fetchFn: async () => { throw new Error('x') }, existe: () => false, env: {}, plataforma: 'win32', livre: async () => true, log: () => {} }), /google\.com\/chrome/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome com porta que nunca sobe avisa pra fechar o Chrome', async () => {
  const raiz = temp()
  try {
    await assert.rejects(abrirChrome({
      ...MAC, raiz, porta: P,
      spawnFn: () => ({ pid: 1, unref() {} }), fetchFn: async () => { throw new Error('x') }, esperarMs: 5,
    }), /Feche todas as janelas do Chrome/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

// Playwright de mentira que anota onde ligou
function playwrightFalso() {
  const ligou = []
  return { ligou, carregar: async () => ({ chromium: { connectOverCDP: async u => { ligou.push(u); return { fechado: false } } } }) }
}

test('conectar: perfil conferido chama connectOverCDP na porta do projeto', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  const pw = playwrightFalso()
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'g-1' })
    const b = await conectar({ porta: portaDoProjeto(raiz), perfil, carregar: pw.carregar, fetchFn: ch.fetchFn })
    assert.deepEqual(pw.ligou, [`http://127.0.0.1:${P}`])
    assert.equal(b.fechado, false)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('conectar: outro Chrome na porta nao chama connectOverCDP', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'outro' })
  const pw = playwrightFalso()
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'velho' })
    await assert.rejects(
      conectar({ porta: P, perfil, carregar: pw.carregar, skill: 'mercado-livre', fetchFn: ch.fetchFn }),
      e => e.estado === 'outro-na-porta' && e.message.includes(`na porta ${P} responde um Chrome que nao e o deste projeto`),
    )
    assert.deepEqual(pw.ligou, [])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('conectar: skills diferentes do mesmo projeto aceitam o mesmo Chrome', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  const pw = playwrightFalso()
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'g-1' })
    await conectar({ porta: P, perfil, carregar: pw.carregar, skill: 'mercado-livre', fetchFn: ch.fetchFn })
    await conectar({ porta: P, perfil, carregar: pw.carregar, skill: 'midia-social', fetchFn: ch.fetchFn })
    assert.deepEqual(pw.ligou, [`http://127.0.0.1:${P}`, `http://127.0.0.1:${P}`])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('conectar sem Playwright cita a skill no npm install', async () => {
  await assert.rejects(
    conectar({ porta: P, perfil: '/nao/existe', carregar: async () => { throw new Error('Cannot find package') }, skill: 'midia-social' }),
    /npm install --prefix \.claude\/skills\/midia-social/,
  )
})

test('sessaoCaiu: login e registration do Mercado Livre dao sessao-caida', () => {
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login?x=1', host: 'mercadolivre.com.br' }), 'sessao-caida')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/registration?x=1', host: 'mercadolivre.com.br' }), 'sessao-caida')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login?x=1', host: 'lista.mercadolivre.com.br' }), 'sessao-caida', 'subdominio do site conta')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolibre.com/registration?x=1', host: 'mercadolibre.com' }), 'sessao-caida')
  assert.match(AVISO['sessao-caida'], /Entre de novo na conta/)
})

test('sessaoCaiu: captcha do Mercado Livre da captcha', () => {
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/captcha?x=1', host: 'mercadolivre.com.br' }), 'captcha')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login/captcha?x=1', host: 'mercadolivre.com.br' }), 'captcha', 'captcha vem antes da sessao')
  assert.match(AVISO.captcha, /captcha/)
})

test('sessaoCaiu: pagina normal e url invalida dao null', () => {
  assert.equal(sessaoCaiu({ url: 'https://lista.mercadolivre.com.br/caneca-inox', host: 'mercadolivre.com.br' }), null)
  assert.equal(sessaoCaiu({ url: undefined, host: 'mercadolivre.com.br' }), null)
  assert.equal(sessaoCaiu({ url: 42, host: 'mercadolivre.com.br' }), null)
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login?x=1', host: 'falsomercadolivre.com.br' }), null, 'host parecido nao e o site')
  assert.equal(sessaoCaiu({ url: 'https://exemplo.com/login', host: 'exemplo.com' }), null, 'site fora da tabela')
  assert.equal(sessaoCaiu(), null)
})

test('sessaoCaiu: Instagram fica fora (a pauta roda sem login)', () => {
  assert.equal(sessaoCaiu({ url: 'https://www.instagram.com/accounts/login/', host: 'instagram.com' }), null)
  assert.equal(sessaoCaiu({ url: 'https://www.instagram.com/challenge/', host: 'www.instagram.com' }), null)
})

test('raiz da lib do nucleo e o _modelo dentro do kit', () => {
  assert.equal(basename(RAIZ), '_modelo')
  assert.ok(existsSync(join(RAIZ, '.claude', 'skills', 'conectar', 'SKILL.md')), `RAIZ deu ${RAIZ}`)
})

test('porta.mjs imprime so a porta do projeto', () => {
  const r = spawnSync(process.execPath, [join(AQUI, '..', 'porta.mjs')], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(r.status, 0, r.stderr)
  const saida = r.stdout.trim()
  assert.match(saida, /^[0-9]+$/)
  assert.equal(Number(saida), portaDoProjeto(RAIZ))
  assert.ok(Number(saida) >= FAIXA.inicio && Number(saida) < FAIXA.inicio + FAIXA.tamanho, `porta ${saida} fora da faixa`)
})
