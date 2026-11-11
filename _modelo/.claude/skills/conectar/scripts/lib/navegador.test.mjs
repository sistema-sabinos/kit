// Testes da lib do Chrome dedicado do nucleo. Sem Chrome de verdade: spawn, fetch, existe e livre
// sao injetados; o conferirPerfil e o portaLivre rodam contra servidor de mentira em 127.0.0.1.
// Rodar: node --test navegador.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync, utimesSync, renameSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { createServer as servidorHttp } from 'node:http'
import { createServer as servidorTcp } from 'node:net'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FAIXA, SENTINELA, AVISO, perfilDedicado, portaDoProjeto, candidatosDeChrome, acharChrome, argumentosDoChrome,
  guidDaPorta, portaLivre, esperarPorta, pidDoChrome, conferirPerfil, abrirChrome, conectar, sessaoCaiu, paginaPedeLogin, sessaoDaPagina, SINAL_LOGIN, estadoDaUrl,
  relogar, receitaValida, abaDoSite, tentouHaPouco, marcarTentativa, desmarcarTentativa, JANELA_RELOGIN_MS,
  travarRelogin, expressaoClique, RELIGAR, religar,
  SAIDA, apontarDownload, desminimizar, fecharChrome, opcoesDeAbrir, processoVivo, FOLGA_SEM_PID_MS,
  FECHAR_CHROME, avisosDeAbrir, saidaNoProjeto, baixarNaSaida, TRAVA_DOWNLOAD,
} from './navegador.mjs'
import { randomUUID } from 'node:crypto'
import { SAIDA_NAVEGADOR, dentroDaSaida } from '../../../../hooks/barrar-mcp.mjs'
import { runInNewContext } from 'node:vm'
import { RAIZ } from './raiz.mjs'
import { codigo } from '../totp.mjs'

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

test('argumentosDoChrome leva os tres --disable-* da prova C1c, com e sem janela', () => {
  const tres = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  const base = [`--remote-debugging-port=${P}`, '--user-data-dir=/p/perfil', '--no-first-run', '--no-default-browser-check', ...tres]
  assert.deepEqual(argumentosDoChrome('/p/perfil', P), base)
  assert.deepEqual(argumentosDoChrome('/p/perfil', P, { headless: true }), [...base, '--headless=new'])
})

test('SAIDA da lib e a mesma pasta que o hook barrar-mcp.mjs deixa o navegador gravar', () => {
  assert.equal(SAIDA, SAIDA_NAVEGADOR)
  assert.equal(SAIDA, 'dados/navegador-saida')
})

const prefs = perfil => JSON.parse(readFileSync(join(perfil, 'Default', 'Preferences'), 'utf8'))

test('apontarDownload: perfil sem Default ganha o Preferences so com a pasta, e a pasta nasce', () => {
  const raiz = temp()
  try {
    const perfil = join(raiz, 'perfil')
    const saida = join(raiz, SAIDA)
    assert.equal(apontarDownload(perfil, raiz, { log: () => {} }), true)
    assert.deepEqual(prefs(perfil), { download: { default_directory: saida, prompt_for_download: false } })
    assert.ok(existsSync(saida), 'a pasta de saida existe')
    assert.deepEqual(readdirSync(join(perfil, 'Default')), ['Preferences'], 'sem temporario sobrando')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('apontarDownload: Preferences com outras chaves mantem todas, troca a pasta e desliga o perguntar onde salvar', () => {
  const raiz = temp()
  try {
    const perfil = join(raiz, 'perfil')
    mkdirSync(join(perfil, 'Default'), { recursive: true })
    const antes = { profile: { name: 'Pessoa 1' }, download: { prompt_for_download: true, default_directory: '/velha', directory_upgrade: true }, extensions: { x: 1 } }
    writeFileSync(join(perfil, 'Default', 'Preferences'), JSON.stringify(antes))
    assert.equal(apontarDownload(perfil, raiz, { log: () => {} }), true)
    assert.deepEqual(prefs(perfil), { ...antes, download: { directory_upgrade: true, prompt_for_download: false, default_directory: join(raiz, SAIDA) } })
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('apontarDownload: Preferences ilegivel fica byte a byte igual e o log avisa', () => {
  const raiz = temp()
  try {
    const perfil = join(raiz, 'perfil')
    mkdirSync(join(perfil, 'Default'), { recursive: true })
    const arq = join(perfil, 'Default', 'Preferences')
    for (const quebrado of ['{"download": ', '[1,2]', 'null']) {
      writeFileSync(arq, quebrado)
      const avisos = []
      assert.equal(apontarDownload(perfil, raiz, { log: m => avisos.push(m) }), false, quebrado)
      assert.equal(readFileSync(arq, 'utf8'), quebrado)
      assert.ok(avisos.length === 1 && avisos[0].includes('Downloads'), avisos.join(' | '))
    }
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

// Rodada 5.35, chat 3: a SAIDA so vale dentro do projeto, pelo caminho real. Cada caso monta o
// projeto num mkdtemp, com juncao de verdade quando o caso pede.
const CASOS_DA_SAIDA = {
  'nada existe ainda': { dentro: true, montar: () => {} },
  'dados e a saida pastas comuns': { dentro: true, montar: p => mkdirSync(join(p, SAIDA), { recursive: true }) },
  'dados e juncao pra fora': { dentro: false, montar: (p, fora) => symlinkSync(fora, join(p, 'dados'), 'junction') },
  'a saida e juncao pra fora': { dentro: false, montar: (p, fora) => { mkdirSync(join(p, 'dados')); symlinkSync(fora, join(p, SAIDA), 'junction') } },
  'a saida e juncao pra outra pasta do projeto': { dentro: true, montar: p => { mkdirSync(join(p, 'outra')); mkdirSync(join(p, 'dados')); symlinkSync(join(p, 'outra'), join(p, SAIDA), 'junction') } },
}

async function comProjeto(caso, fn) {
  const base = temp()
  try {
    const proj = join(base, 'proj')
    const fora = join(base, 'fora')
    mkdirSync(proj)
    mkdirSync(fora)
    CASOS_DA_SAIDA[caso].montar(proj, fora)
    return await fn(proj, fora)
  } finally { rmSync(base, { recursive: true, force: true }) }
}

test('saidaNoProjeto tem a regra do dentroDaSaida do hook, com juncao real', async () => {
  const vistos = new Set()
  for (const [caso, { dentro }] of Object.entries(CASOS_DA_SAIDA)) {
    await comProjeto(caso, proj => {
      const lib = saidaNoProjeto(proj) !== null
      vistos.add(lib)
      assert.equal(lib, dentro, `${caso}: a lib`)
      assert.equal(dentroDaSaida(proj, SAIDA + '/relatorio.csv'), dentro, `${caso}: o hook`)
    })
  }
  assert.deepEqual([...vistos].sort(), [false, true], 'canario: os casos cobrem dentro e fora')
})

test('apontarDownload: dados ou a saida em juncao pra fora nao aponta, avisa e nao cria nada fora', async () => {
  for (const caso of ['dados e juncao pra fora', 'a saida e juncao pra fora']) {
    await comProjeto(caso, (proj, fora) => {
      const perfil = join(proj, 'perfil')
      const avisos = []
      assert.equal(apontarDownload(perfil, proj, { log: m => avisos.push(m) }), false, caso)
      assert.ok(avisos.length === 1 && avisos[0].includes(SAIDA), `${caso}: ${avisos.join(' | ')}`)
      assert.equal(existsSync(join(perfil, 'Default', 'Preferences')), false, `${caso}: o Preferences nasceu`)
      assert.deepEqual(readdirSync(fora), [], `${caso}: nasceu coisa fora do projeto`)
    })
  }
  await comProjeto('a saida e juncao pra outra pasta do projeto', proj => {
    assert.equal(apontarDownload(join(proj, 'perfil'), proj, { log: () => {} }), true, 'canario: juncao dentro do projeto aponta')
  })
})

// Chrome de mentira pro baixarNaSaida (rota dos eventos, 5.36): cada pagina tem o quadro dela, toda
// sessao do navegador viva recebe os eventos de download, e cada comando CDP mandado fica anotado
// ([quadro ou 'navegador', metodo, args]); aoMandar roda depois de cada comando do navegador
function chromeDeEventos() {
  const vivas = new Set()
  // paginas: os quadros das paginas abertas, que o Target.getTargets lista (falharTargets faz ele falhar)
  const ch = { comandos: [], abertas: 0, aoMandar: () => {}, paginas: new Set(), falharTargets: false }
  const browser = {
    newBrowserCDPSession: async () => {
      const ouvintes = {}
      const s = {
        ouvintes,
        on: (ev, fn) => { (ouvintes[ev] ||= []).push(fn) },
        send: async (m, a) => {
          ch.comandos.push(['navegador', m, a])
          ch.aoMandar(m)
          if (m !== 'Target.getTargets') return {}
          if (ch.falharTargets) throw new Error('Target.getTargets falhou')
          return { targetInfos: [...ch.paginas].map(q => ({ targetId: q, type: 'page' })).concat([{ targetId: 'SW', type: 'service_worker' }]) }
        },
        detach: async () => { vivas.delete(s) },
      }
      ch.abertas++
      vivas.add(s)
      return s
    },
  }
  ch.vivas = () => vivas.size
  ch.pagina = quadro => {
    ch.paginas.add(quadro)
    const ctx = { browser: () => browser, newCDPSession: async () => ({ send: async (m, a) => { ch.comandos.push([quadro, m, a]); return m === 'Page.getFrameTree' ? { frameTree: { frame: { id: quadro } } } : {} } }) }
    return { context: () => ctx }
  }
  ch.emitir = (ev, dados) => { for (const s of [...vivas]) for (const fn of s.ouvintes[ev] || []) fn(dados) }
  ch.comecar = (quadro, nome, guid = randomUUID()) => { ch.emitir('Browser.downloadWillBegin', { frameId: quadro, guid, url: 'http://127.0.0.1/' + nome, suggestedFilename: nome }); return guid }
  ch.terminar = (guid, saida, nome, state = 'completed') => {
    if (state === 'completed') writeFileSync(join(saida, nome), nome)
    ch.emitir('Browser.downloadProgress', { guid, state, ...(state === 'completed' ? { filePath: join(saida, nome) } : {}) })
  }
  // a acao que baixa um arquivo inteiro pela pagina do quadro
  ch.baixando = (quadro, saida, nome) => () => ch.terminar(ch.comecar(quadro, nome), saida, nome)
  return ch
}

// projeto de mentira pro baixarNaSaida: o perfil existe (o Chrome dedicado ja abriu)
function comBaixador(fn) {
  const raiz = temp()
  const perfil = perfilDedicado(raiz)
  mkdirSync(perfil, { recursive: true })
  return Promise.resolve().then(() => fn(raiz, perfil, saidaNoProjeto(raiz), chromeDeEventos())).finally(() => rmSync(raiz, { recursive: true, force: true }))
}
const RAPIDO = { prazoMs: 300, passoMs: 10 }
// a marca do download vencido no perfil (a lib nao exporta o nome)
const MARCA_VENCIDO = '.sabinos-baixando-vencido'
const marcas = perfil => existsSync(join(perfil, MARCA_VENCIDO)) ? JSON.parse(readFileSync(join(perfil, MARCA_VENCIDO), 'utf8')) : null

test('baixarNaSaida: o download da acao volta pelo filePath do Chrome, com o foco ligado antes da acao, e a trava e a sessao saem', () => comBaixador(async (raiz, perfil, saida, ch) => {
  let naAcao = null
  const baixa = ch.baixando('Q1', saida, 'relatorio.csv')
  const caminho = await baixarNaSaida(() => { naAcao = [...ch.comandos]; baixa() }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO })
  assert.equal(caminho, join(saida, 'relatorio.csv'))
  assert.equal(readFileSync(caminho, 'utf8'), 'relatorio.csv')
  // a pagina recem-aberta pode chegar antes da sessao de foco do conectar: o ajudante liga o foco nela
  assert.deepEqual(naAcao, [
    ['Q1', 'Emulation.setFocusEmulationEnabled', { enabled: true }],
    ['Q1', 'Page.getFrameTree', undefined],
    ['navegador', 'Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true }],
  ])
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
  assert.equal(marcas(perfil), null, 'marcou o quadro de um download que terminou')
  assert.equal(ch.vivas(), 0, 'a sessao do navegador ficou aberta')
}))

test('baixarNaSaida: sem a pagina para antes da trava', () => comBaixador(async (raiz, perfil) => {
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { raiz, ...RAPIDO }), /precisa da pagina/)
  assert.equal(rodou, false)
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava nasceu')
}))

test('baixarNaSaida: pagina que nao abre a sessao CDP no prazo para antes da acao e larga a trava', () => comBaixador(async (raiz, perfil, saida, ch) => {
  // no Chrome real a sessao de uma pagina com navegacao pendente so abre quando a resposta chega
  const presa = { context: () => ({ browser: () => ({}), newCDPSession: () => new Promise(() => {}) }) }
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: presa, raiz, ...RAPIDO }), /a pagina nao respondeu em 1 segundos/)
  assert.equal(rodou, false, 'a acao rodou')
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
  assert.equal(marcas(perfil), null, 'marcou sem a acao disparar')
}))

test('baixarNaSaida: so o download do quadro da pagina volta; o atrasado de outra pagina nao conta, e sozinho para com erro', () => comBaixador(async (raiz, perfil, saida, ch) => {
  // o atrasado de uma chamada que estourou o prazo chega no meio desta, antes do dela
  const caminho = await baixarNaSaida(() => { ch.baixando('Q0', saida, 'atrasado.csv')(); ch.baixando('Q1', saida, 'meu.csv')() }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO })
  assert.equal(caminho, join(saida, 'meu.csv'))
  // so o de outra pagina: o prazo estoura com o erro que diz isso
  await assert.rejects(baixarNaSaida(ch.baixando('Q0', saida, 'outro.csv'), { pagina: ch.pagina('Q2'), raiz, ...RAPIDO }), /nao apareceu.*outro\.csv\) veio de outra pagina/)
  assert.equal(ch.vivas(), 0, 'a sessao do navegador ficou aberta')
}))

test('baixarNaSaida: o download de um iframe da pagina conta como dela (Codex comum)', () => comBaixador(async (raiz, perfil, saida, ch) => {
  const pagina = ch.pagina('Q1')
  const ctx = pagina.context()
  const sessao = ctx.newCDPSession
  // a arvore da pagina traz o iframe I1 embaixo do quadro principal
  ctx.newCDPSession = async p => { const s = await sessao(p); return { send: async (m, a) => m === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'Q1' }, childFrames: [{ frame: { id: 'I1' } }] } } : s.send(m, a) } }
  assert.equal(await baixarNaSaida(ch.baixando('I1', saida, 'iframe.csv'), { pagina, raiz, ...RAPIDO }), join(saida, 'iframe.csv'))
}))

test('baixarNaSaida: o download que comecou antes de a acao disparar nao conta', () => comBaixador(async (raiz, perfil, saida, ch) => {
  // o comeco chega logo depois de ligar os eventos, antes da acao; o fim, durante a acao
  let velho = null
  ch.aoMandar = m => { if (m === 'Browser.setDownloadBehavior') velho = ch.comecar('Q1', 'velho.csv') }
  await assert.rejects(baixarNaSaida(() => ch.terminar(velho, saida, 'velho.csv'), { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /nao apareceu/)
  assert.ok(velho, 'canario: o comeco de antes da acao foi emitido')
  assert.ok(existsSync(join(saida, 'velho.csv')), 'canario: o arquivo de antes caiu na saida')
}))

test('baixarNaSaida: canceled para com erro e nao marca o quadro; dois downloads da acao param e marcam', () => comBaixador(async (raiz, perfil, saida, ch) => {
  await assert.rejects(baixarNaSaida(() => ch.terminar(ch.comecar('Q1', 'x.csv'), saida, 'x.csv', 'canceled'), { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /cancelou o download de x\.csv/)
  assert.equal(marcas(perfil), null, 'o cancelado marcou o quadro')
  // o segundo pode seguir baixando depois do erro: a pagina fica marcada
  await assert.rejects(baixarNaSaida(() => { ch.comecar('Q2', 'a.csv'); ch.comecar('Q2', 'b.csv') }, { pagina: ch.pagina('Q2'), raiz, ...RAPIDO }), /comecou 2 downloads \(a\.csv, b\.csv\)/)
  assert.deepEqual(marcas(perfil), ['Q2'])
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
  assert.equal(ch.vivas(), 0, 'a sessao do navegador ficou aberta')
}))

test('baixarNaSaida: o fim sem o arquivo na saida para (filePath de fora, sem filePath ou o arquivo sumido)', () => comBaixador(async (raiz, perfil, saida, ch) => {
  const fora = join(raiz, 'fora.csv')
  writeFileSync(fora, 'f')
  const casos = {
    'filePath de fora': g => ch.emitir('Browser.downloadProgress', { guid: g, state: 'completed', filePath: fora }),
    'sem filePath': g => ch.emitir('Browser.downloadProgress', { guid: g, state: 'completed' }),
    'arquivo sumido': g => ch.emitir('Browser.downloadProgress', { guid: g, state: 'completed', filePath: join(saida, 'sumiu.csv') }),
  }
  let n = 0
  for (const [caso, fim] of Object.entries(casos)) {
    const q = 'Q' + ++n
    await assert.rejects(baixarNaSaida(() => fim(ch.comecar(q, 'r.csv')), { pagina: ch.pagina(q), raiz, ...RAPIDO }), /terminou o download de r\.csv, mas o arquivo nao esta em dados\/navegador-saida/, caso)
  }
}))

test('baixarNaSaida: download pela metade de antes segura a acao ate acabar, e o dele nao volta como desta', () => comBaixador(async (raiz, perfil, saida, ch) => {
  // o da chamada que estourou o prazo termina no meio da espera desta
  const velho = join(saida, 'velho.csv.crdownload')
  mkdirSync(saida, { recursive: true })
  writeFileSync(velho, 'v')
  let voltas = 0
  let disparou = null
  const dormir = async () => { if (++voltas === 3) renameSync(velho, join(saida, 'velho.csv')) }
  const baixa = ch.baixando('Q1', saida, 'novo.csv')
  const caminho = await baixarNaSaida(() => { disparou = voltas; baixa() }, { pagina: ch.pagina('Q1'), raiz, prazoMs: 5000, dormir })
  assert.equal(disparou, 3, 'a acao disparou com o download de antes pela metade')
  assert.equal(caminho, join(saida, 'novo.csv'))
  // pela metade ate o prazo: para sem disparar
  writeFileSync(join(saida, 'parado.csv.crdownload'), 'p')
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /pela metade/)
  assert.equal(rodou, false)
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
}))

test('baixarNaSaida: prazo estourado e erro da acao param com erro claro, largam a trava e a sessao, e marcam o quadro', () => comBaixador(async (raiz, perfil, saida, ch) => {
  await assert.rejects(baixarNaSaida(() => {}, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /nao apareceu em dados\/navegador-saida.*conexao de fora da lib/)
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou depois do prazo')
  assert.deepEqual(marcas(perfil), ['Q1'])
  await assert.rejects(baixarNaSaida(() => { throw new Error('clique falhou') }, { pagina: ch.pagina('Q2'), raiz, ...RAPIDO }), /clique falhou/)
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou depois do erro da acao')
  assert.deepEqual(marcas(perfil), ['Q1', 'Q2'])
  assert.equal(ch.vivas(), 0, 'a sessao do navegador ficou aberta')
}))

test('baixarNaSaida: pagina com marca para antes da acao; pagina nova baixa', () => comBaixador(async (raiz, perfil, saida, ch) => {
  await assert.rejects(baixarNaSaida(() => {}, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /nao apareceu/)
  assert.deepEqual(marcas(perfil), ['Q1'], 'canario: o prazo marcou o quadro')
  const abertas = ch.abertas
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /abra uma pagina nova \(newPage\)/)
  assert.equal(rodou, false, 'a acao rodou na pagina marcada')
  assert.equal(ch.abertas, abertas, 'a pagina marcada abriu sessao do navegador')
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
  // o quadro marcado nao pesa em outra pagina
  assert.equal(await baixarNaSaida(ch.baixando('Q2', saida, 'novo.csv'), { pagina: ch.pagina('Q2'), raiz, ...RAPIDO }), join(saida, 'novo.csv'))
  assert.deepEqual(marcas(perfil), ['Q1'])
}))

// decisao do controlador sobre o achado 1 da comum: a marca nao sai sozinha, a pagina marcada fica
// queimada (o frameId nao se repete entre paginas)
test('baixarNaSaida: a marca nao sai sozinha; dois atrasados do mesmo quadro nao fazem a mesma pagina aceitar nada', () => comBaixador(async (raiz, perfil, saida, ch) => {
  await assert.rejects(baixarNaSaida(() => {}, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /nao apareceu/)
  assert.deepEqual(marcas(perfil), ['Q1'], 'canario: o prazo marcou o quadro')
  // os dois atrasados de Q1 chegam inteiros, um em cada chamada de outra pagina
  assert.equal(await baixarNaSaida(() => { ch.baixando('Q1', saida, 'atrasado-1.csv')(); ch.baixando('Q2', saida, 'a.csv')() }, { pagina: ch.pagina('Q2'), raiz, ...RAPIDO }), join(saida, 'a.csv'))
  assert.equal(await baixarNaSaida(() => { ch.baixando('Q1', saida, 'atrasado-2.csv')(); ch.baixando('Q3', saida, 'b.csv')() }, { pagina: ch.pagina('Q3'), raiz, ...RAPIDO }), join(saida, 'b.csv'))
  assert.deepEqual(marcas(perfil), ['Q1'])
  // a pagina de Q1 segue parada antes da acao
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /abra uma pagina nova \(newPage\)/)
  assert.equal(rodou, false, 'a pagina marcada voltou a aceitar download')
}))

// final do Codex, achado 2: a poda por numero soltava a pagina aberta depois de outras vencerem; a poda
// e pela existencia (Target.getTargets), e sem a lista nada sai
test('baixarNaSaida: a poda da marca tira so quadro de pagina fechada, e sem a lista de paginas nada sai', () => comBaixador(async (raiz, perfil, saida, ch) => {
  const Q0 = ch.pagina('Q0')
  await assert.rejects(baixarNaSaida(() => {}, { pagina: Q0, raiz, ...RAPIDO }), /nao apareceu/)
  // 60 outras paginas abertas vencem depois dela
  const LENTO = { prazoMs: 20, passoMs: 5 }
  for (let i = 0; i < 60; i++) await assert.rejects(baixarNaSaida(() => {}, { pagina: ch.pagina('V' + i), raiz, ...LENTO }), /nao apareceu/)
  assert.equal(marcas(perfil).length, 61, 'canario: as 61 vencidas marcadas')
  assert.ok(marcas(perfil).includes('Q0'), 'a poda tirou a pagina aberta')
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: Q0, raiz, ...RAPIDO }), /abra uma pagina nova \(newPage\)/)
  assert.equal(rodou, false, 'a pagina aberta voltou a aceitar download')
  // a pagina V0 fecha: a gravacao seguinte tira a marca dela
  ch.paginas.delete('V0')
  await assert.rejects(baixarNaSaida(() => {}, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO }), /nao apareceu/)
  assert.ok(!marcas(perfil).includes('V0'), 'a marca da pagina fechada ficou')
  assert.ok(marcas(perfil).includes('Q0') && marcas(perfil).includes('Q1'))
  // a lista de paginas falha: nada sai
  ch.paginas.delete('V1')
  ch.falharTargets = true
  await assert.rejects(baixarNaSaida(() => {}, { pagina: ch.pagina('Q2'), raiz, ...RAPIDO }), /nao apareceu/)
  assert.ok(marcas(perfil).includes('V1') && marcas(perfil).includes('Q2'), 'sem a lista a poda tirou marca ou nao gravou')
}))

test('baixarNaSaida: marca ilegivel para antes da acao em qualquer pagina e fica como esta', () => comBaixador(async (raiz, perfil, saida, ch) => {
  for (const conteudo of ['lixo', '{"quadro":"Q1"}', '[1]']) {
    writeFileSync(join(perfil, MARCA_VENCIDO), conteudo)
    let rodou = false
    await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: ch.pagina('Q7'), raiz, ...RAPIDO }), /esta ilegivel/, conteudo)
    assert.equal(rodou, false, `${conteudo}: a acao rodou`)
    assert.equal(readFileSync(join(perfil, MARCA_VENCIDO), 'utf8'), conteudo, `${conteudo}: a marca mudou`)
  }
}))

test('baixarNaSaida: um baixador por vez; trava de processo vivo segura, a de processo morto sai', () => comBaixador(async (raiz, perfil, saida, ch) => {
  // dois juntos: o segundo so dispara a acao depois de o primeiro achar o arquivo dele
  const ordem = []
  const lento = baixarNaSaida(async () => { ordem.push('lento'); await new Promise(r => setTimeout(r, 100)); ch.baixando('Q1', saida, 'lento.csv')() }, { pagina: ch.pagina('Q1'), raiz, prazoMs: 5000, passoMs: 10 })
  const pequeno = baixarNaSaida(() => { ordem.push('pequeno'); ch.baixando('Q2', saida, 'pequeno.csv')() }, { pagina: ch.pagina('Q2'), raiz, prazoMs: 5000, passoMs: 10 })
  assert.deepEqual([await lento, await pequeno], [join(saida, 'lento.csv'), join(saida, 'pequeno.csv')])
  assert.deepEqual(ordem, ['lento', 'pequeno'])
  // a trava de outro processo vivo: a acao nunca roda
  let rodou = false
  writeFileSync(join(perfil, TRAVA_DOWNLOAD), '4242')
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO, vivo: () => true }), /outro robo/)
  assert.equal(rodou, false)
  assert.ok(existsSync(join(perfil, TRAVA_DOWNLOAD)), 'a trava do outro processo sumiu')
  // a mesma trava com o processo morto sai, e o download segue
  const caminho = await baixarNaSaida(ch.baixando('Q1', saida, 'depois.csv'), { pagina: ch.pagina('Q1'), raiz, ...RAPIDO, vivo: () => false })
  assert.equal(caminho, join(saida, 'depois.csv'))
}))

// 5.36, trava com dono: a trava guarda { pid, dono } e so quem a criou apaga
const lerTravaJson = perfil => JSON.parse(readFileSync(join(perfil, TRAVA_DOWNLOAD), 'utf8'))
const sobrasDoRoubo = perfil => readdirSync(perfil).filter(n => n.startsWith(TRAVA_DOWNLOAD + '.'))

test('baixarNaSaida: a trava guarda pid e dono, e o finally nao apaga a trava de outro dono', () => comBaixador(async (raiz, perfil, saida, ch) => {
  let vista = null
  const outra = JSON.stringify({ pid: process.pid, dono: 'outro-dono' })
  const caminho = await baixarNaSaida(() => {
    vista = lerTravaJson(perfil)
    // a trava troca de dono no meio da chamada (roubada por engano): o finally tem de deixar
    writeFileSync(join(perfil, TRAVA_DOWNLOAD), outra)
    ch.baixando('Q1', saida, 'a.csv')()
  }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO })
  assert.equal(caminho, join(saida, 'a.csv'))
  assert.equal(vista.pid, process.pid)
  assert.ok(typeof vista.dono === 'string' && vista.dono.length >= 16, `dono: ${vista.dono}`)
  assert.equal(readFileSync(join(perfil, TRAVA_DOWNLOAD), 'utf8'), outra, 'o finally apagou a trava de outro dono')
}))

test('baixarNaSaida: dois roubadores sobre a mesma trava de processo morto, so um baixa por vez', () => comBaixador(async (raiz, perfil, saida, ch) => {
  const MORTO = 4242
  writeFileSync(join(perfil, TRAVA_DOWNLOAD), JSON.stringify({ pid: MORTO, dono: 'morto' }))
  // os dois leem a trava do morto e param juntos antes do roubo; a barreira solta os dois de uma vez
  let soltar
  const barreira = new Promise(r => { soltar = r })
  let leram = 0
  const vivo = async pid => {
    if (pid !== MORTO) return pid === process.pid
    if (++leram === 2) soltar()
    await barreira
    return false
  }
  let ativos = 0
  let pico = 0
  const acao = nome => async () => {
    pico = Math.max(pico, ++ativos)
    await new Promise(r => setTimeout(r, 50))
    ch.baixando(nome, saida, nome)()
    ativos--
  }
  const [a, b] = await Promise.all([
    baixarNaSaida(acao('a.csv'), { pagina: ch.pagina('a.csv'), raiz, prazoMs: 5000, passoMs: 10, vivo }),
    baixarNaSaida(acao('b.csv'), { pagina: ch.pagina('b.csv'), raiz, prazoMs: 5000, passoMs: 10, vivo }),
  ])
  assert.equal(leram, 2, 'canario: os dois leram a trava do morto')
  assert.deepEqual([a, b].sort(), [join(saida, 'a.csv'), join(saida, 'b.csv')])
  assert.equal(pico, 1, 'os dois baixaram ao mesmo tempo')
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
  assert.deepEqual(sobrasDoRoubo(perfil), [], 'sobrou arquivo do roubo')
}))

test('baixarNaSaida: trava trocada por uma viva entre a leitura e o roubo volta pro lugar', () => comBaixador(async (raiz, perfil) => {
  const MORTO = 4242
  const viva = JSON.stringify({ pid: process.pid, dono: 'vivo' })
  writeFileSync(join(perfil, TRAVA_DOWNLOAD), JSON.stringify({ pid: MORTO, dono: 'morto' }))
  let trocou = false
  // depois de ler o morto e antes do roubo, outro processo ja roubou e criou a dele
  const vivo = pid => {
    if (pid === MORTO && !trocou) { trocou = true; writeFileSync(join(perfil, TRAVA_DOWNLOAD), viva); return false }
    return pid === process.pid
  }
  let rodou = false
  await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: chromeDeEventos().pagina('Q1'), raiz, ...RAPIDO, vivo }), /outro robo/)
  assert.ok(trocou, 'canario: a troca aconteceu')
  assert.equal(rodou, false, 'a acao rodou com a trava viva de outro')
  assert.equal(readFileSync(join(perfil, TRAVA_DOWNLOAD), 'utf8'), viva, 'a trava viva nao voltou pro lugar')
  assert.deepEqual(sobrasDoRoubo(perfil), [], 'sobrou arquivo do roubo')
}))

test('baixarNaSaida: trava na forma velha (so o pid) de processo morto e roubada; vazia segue viva', () => comBaixador(async (raiz, perfil, saida, ch) => {
  writeFileSync(join(perfil, TRAVA_DOWNLOAD), '4242')
  const caminho = await baixarNaSaida(ch.baixando('Q1', saida, 'velha.csv'), { pagina: ch.pagina('Q1'), raiz, ...RAPIDO, vivo: () => false })
  assert.equal(caminho, join(saida, 'velha.csv'))
  assert.equal(existsSync(join(perfil, TRAVA_DOWNLOAD)), false, 'a trava ficou')
  assert.deepEqual(sobrasDoRoubo(perfil), [], 'sobrou arquivo do roubo')
  for (const conteudo of ['', '   ', '{"dono":"x"}', 'lixo']) {
    writeFileSync(join(perfil, TRAVA_DOWNLOAD), conteudo)
    let rodou = false
    await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: ch.pagina('Q1'), raiz, ...RAPIDO, vivo: () => false }), /outro robo/, JSON.stringify(conteudo))
    assert.equal(rodou, false, `${JSON.stringify(conteudo)}: a acao rodou`)
    assert.equal(readFileSync(join(perfil, TRAVA_DOWNLOAD), 'utf8'), conteudo, `${JSON.stringify(conteudo)}: a trava sumiu`)
  }
}))

test('baixarNaSaida: saida em juncao pra fora para antes da acao', async () => {
  for (const caso of ['dados e juncao pra fora', 'a saida e juncao pra fora']) {
    // o perfil fica na raiz: a juncao toma o lugar de dados/
    await comProjeto(caso, async proj => {
      let rodou = false
      await assert.rejects(baixarNaSaida(() => { rodou = true }, { pagina: chromeDeEventos().pagina('Q1'), raiz: proj, perfil: proj, ...RAPIDO }), /leva pra fora do projeto/, caso)
      assert.equal(rodou, false, `${caso}: a acao rodou`)
      assert.equal(existsSync(join(proj, TRAVA_DOWNLOAD)), false, `${caso}: a trava nasceu`)
    })
  }
})

// 5.36: todo script liga com noDefaults (sem ele o Playwright segura o download numa pasta temporaria);
// a opcao saiu, entao pedir o padrao nao muda nada
test('conectar: liga sempre com noDefaults, sem pedir', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'g-1', saida: true })
    const pw = playwrightFalso()
    await conectar({ porta: P, perfil, carregar: pw.carregar, fetchFn: ch.fetchFn })
    await conectar({ porta: P, perfil, carregar: pw.carregar, fetchFn: ch.fetchFn, noDefaults: false })
    assert.deepEqual(pw.chamadas, [[`http://127.0.0.1:${P}`, { noDefaults: true }], [`http://127.0.0.1:${P}`, { noDefaults: true }]])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

// P0 da 5.36: com noDefaults a pagina atras da aba de outra conexao vira hidden e o clique trava; o
// conectar liga a emulacao de foco pela propria pagina, nas que ja existem e nas que nascem depois
test('conectar: emulacao de foco em cada pagina do contexto padrao, a que ja existia e a nova', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'g-1', saida: true })
    const pw = playwrightFalso(['velha'])
    await conectar({ porta: P, perfil, carregar: pw.carregar, fetchFn: ch.fetchFn })
    assert.deepEqual(pw.enviados, [['velha', 'Emulation.setFocusEmulationEnabled', { enabled: true }]])
    pw.abrir('nova')
    await new Promise(r => setImmediate(r))
    assert.deepEqual(pw.enviados.slice(1), [['nova', 'Emulation.setFocusEmulationEnabled', { enabled: true }]])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome reaproveita so o Chrome conferido, sem abrir outro', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'g-1', saida: true })
    const r = await abrirChrome({ ...MAC, raiz, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.deepEqual(r, { jaEstavaAberto: true, perfilConferido: true, porta: P, pid: null, semJanela: false, semPastaDeSaida: false })
    assert.equal(ch.abertos.length, 0)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome: Chrome aberto pela lib de antes (sentinela sem saida) avisa semPastaDeSaida e nao toca no Preferences', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'g-1' })
    const r = await abrirChrome({ ...MAC, raiz, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.equal(r.semPastaDeSaida, true)
    assert.equal(ch.abertos.length, 0)
    assert.equal(existsSync(join(perfil, 'Default', 'Preferences')), false, 'Chrome aberto: o Preferences nao se grava')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('abrirChrome abre apontando o download pro projeto e grava semJanela e saida na sentinela', async () => {
  for (const headless of [false, true]) {
    const raiz = temp()
    const ch = chromeFalso()
    try {
      const perfil = perfilDedicado(raiz)
      await abrirChrome({ ...MAC, raiz, porta: P, headless, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
      assert.equal(ch.abertos[0].args.includes('--headless=new'), headless)
      assert.equal(prefs(perfil).download.default_directory, join(raiz, SAIDA))
      assert.equal(crua(perfil).semJanela, headless)
      assert.equal(crua(perfil).saida, true)
    } finally { rmSync(raiz, { recursive: true, force: true }) }
  }
})

test('abrirChrome com perfil de fora do projeto nao mexe no Preferences dele nem cria a pasta de saida', async () => {
  const raiz = temp()
  const ch = chromeFalso()
  try {
    const perfil = join(raiz, 'outro-negocio', 'chrome-profile')
    await abrirChrome({ ...MAC, raiz, perfil, porta: P, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.equal(ch.abertos.length, 1, 'canario: o Chrome abriu')
    assert.equal(existsSync(join(perfil, 'Default', 'Preferences')), false)
    assert.equal(existsSync(join(raiz, SAIDA)), false)
    assert.equal(crua(perfil).saida, false)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

// CDP de mentira: janelas por alvo, registra cada comando
function cdpFalso(janelas) {
  const feitos = []
  const cdp = async (porta, guid, method, params = {}) => {
    feitos.push({ method, params })
    if (method === 'Target.getTargets') return { targetInfos: [...Object.keys(janelas).map(t => ({ type: 'page', targetId: t })), { type: 'service_worker', targetId: 'sw' }] }
    if (method === 'Browser.getWindowForTarget') { const j = janelas[params.targetId]; return j ? { windowId: j.id, bounds: { windowState: j.estado } } : null }
    if (method === 'Browser.setWindowBounds') { for (const j of Object.values(janelas)) if (j.id === params.windowId) j.estado = params.bounds.windowState; return {} }
    if (method === 'Browser.close') return {}
    return null
  }
  return { cdp, feitos }
}

test('abrirChrome headless com o Chrome do projeto aberto com janela minimizada devolve a janela pro normal', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'g-1', saida: true })
    const janelas = { a: { id: 1, estado: 'minimized' }, b: { id: 1, estado: 'minimized' }, c: { id: 2, estado: 'normal' } }
    const { cdp, feitos } = cdpFalso(janelas)
    const avisos = []
    await abrirChrome({ ...MAC, raiz, headless: true, cdp, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid, log: m => avisos.push(m) })
    assert.deepEqual(feitos.filter(f => f.method === 'Browser.setWindowBounds').map(f => f.params), [{ windowId: 1, bounds: { windowState: 'normal' } }])
    assert.equal(janelas.a.estado, 'normal')
    assert.ok(avisos.some(m => m.includes('minimizada')), avisos.join(' | '))
    // sem headless (a pessoa na frente) a janela fica como a pessoa deixou
    const outro = cdpFalso({ a: { id: 1, estado: 'minimized' } })
    await abrirChrome({ ...MAC, raiz, cdp: outro.cdp, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.deepEqual(outro.feitos, [])
    assert.equal(ch.abertos.length, 0)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('desminimizar: janela minimizada que o CDP nao restaura para com erro, sem contar como restaurada', async () => {
  const { cdp } = cdpFalso({ a: { id: 1, estado: 'minimized' } })
  const falha = async (...a) => (a[2] === 'Browser.setWindowBounds' ? null : cdp(...a))
  await assert.rejects(desminimizar(P, 'g', { cdp: falha }), /minimizada e nao voltou/)
})

test('desminimizar: nenhuma janela minimizada nao manda comando de janela', async () => {
  const { cdp, feitos } = cdpFalso({ a: { id: 1, estado: 'normal' }, b: { id: 2, estado: 'maximized' } })
  assert.equal(await desminimizar(P, 'g', { cdp }), 0)
  assert.ok(feitos.length > 0, 'canario: perguntou as janelas')
  assert.ok(!feitos.some(f => f.method === 'Browser.setWindowBounds'))
})

test('abrirChrome sem headless com o Chrome do projeto aberto sem janela so devolve semJanela (D24)', async () => {
  const raiz = temp()
  const ch = chromeFalso({ [P]: 'g-1' })
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'g-1', saida: true, semJanela: true })
    const { cdp, feitos } = cdpFalso({})
    const r = await abrirChrome({ ...MAC, raiz, cdp, fetchFn: ch.fetchFn, spawnFn: ch.spawnFn, perguntarPid: ch.perguntarPid })
    assert.equal(r.semJanela, true)
    assert.equal(ch.abertos.length, 0)
    assert.deepEqual(feitos, [], 'nada se fecha nem se mexe sozinho')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('fecharChrome so fecha o Chrome conferido e espera a porta fechar', async () => {
  const raiz = temp()
  try {
    const perfil = perfilDedicado(raiz)
    gravar(perfil, { porta: P, guid: 'g-1' })
    // outro Chrome na porta: nada se fecha
    const outro = chromeFalso({ [P]: 'outro' })
    const c1 = cdpFalso({})
    assert.deepEqual(await fecharChrome({ raiz, porta: P, fetchFn: outro.fetchFn, cdp: c1.cdp, dormir: async () => {} }), { fechado: false, estado: 'outro-na-porta', porta: P })
    assert.deepEqual(c1.feitos, [])
    // porta fechada: nada a fechar
    const morto = chromeFalso()
    assert.equal((await fecharChrome({ raiz, porta: P, fetchFn: morto.fetchFn, cdp: c1.cdp, dormir: async () => {} })).estado, 'porta-fechada')
    assert.deepEqual(c1.feitos, [])
    // o deste projeto: Browser.close e a porta cai
    const ch = chromeFalso({ [P]: 'g-1' })
    const c2 = cdpFalso({})
    const cdp = async (...a) => { const v = await c2.cdp(...a); if (a[2] === 'Browser.close') delete ch.portas[P]; return v }
    assert.deepEqual(await fecharChrome({ raiz, porta: P, fetchFn: ch.fetchFn, cdp, dormir: async () => {} }), { fechado: true, estado: 'conferido', porta: P })
    assert.deepEqual(c2.feitos.map(f => f.method), ['Browser.close'])
    // a porta que nao cai vira erro, sem prometer que fechou
    const teimoso = chromeFalso({ [P]: 'g-1' })
    await assert.rejects(fecharChrome({ raiz, porta: P, fetchFn: teimoso.fetchFn, cdp: c2.cdp, esperarMs: 0, dormir: async () => {} }), /seguiu aberta/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('fecharChrome so volta com o processo do Chrome morto, depois da porta cair', async () => {
  const raiz = temp()
  try {
    gravar(perfilDedicado(raiz), { porta: P, guid: 'g-1' })
    const ch = chromeFalso({ [P]: 'g-1' })
    const c = cdpFalso({})
    const cdp = async (...a) => { const v = await c.cdp(...a); if (a[2] === 'Browser.close') delete ch.portas[P]; return v }
    // a porta cai na hora, o processo 4321 vive mais 3 perguntas
    let vidas = 3
    const perguntados = []
    const vivo = pid => { perguntados.push(pid); return vidas-- > 0 }
    let esperas = 0
    const r = await fecharChrome({ raiz, porta: P, fetchFn: ch.fetchFn, cdp, perguntarPid: async () => 4321, vivo, dormir: async () => { esperas += 1 } })
    assert.equal(r.fechado, true)
    assert.equal(esperas, 3, 'esperou o processo morrer')
    assert.ok(perguntados.every(p => p === 4321) && perguntados.length === 4, perguntados.join(','))
    assert.equal(processoVivo(process.pid), true, 'canario: o proprio processo esta vivo')
    // sem o numero do processo (CDP nao respondeu), espera a folga depois da porta cair
    gravar(perfilDedicado(raiz), { porta: P, guid: 'g-2' })
    const ch2 = chromeFalso({ [P]: 'g-2' })
    const cdp2 = async (...a) => { if (a[2] === 'Browser.close') delete ch2.portas[P]; return {} }
    const dormidas = []
    const r2 = await fecharChrome({ raiz, porta: P, fetchFn: ch2.fetchFn, cdp: cdp2, perguntarPid: async () => null, vivo: () => { throw new Error('sem pid nao pergunta') }, dormir: async ms => { dormidas.push(ms) } })
    assert.equal(r2.fechado, true)
    assert.deepEqual(dormidas, [FOLGA_SEM_PID_MS])
    assert.ok(FOLGA_SEM_PID_MS >= 2000, 'a folga cobre os 432 ms medidos com sobra')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('opcoesDeAbrir: --sem-janela, --fechar, nada, e opcao desconhecida ou as duas juntas recusam', () => {
  assert.deepEqual(opcoesDeAbrir([]), { headless: false, fechar: false })
  assert.deepEqual(opcoesDeAbrir(['--sem-janela']), { headless: true, fechar: false })
  assert.deepEqual(opcoesDeAbrir(['--fechar']), { headless: false, fechar: true })
  assert.throws(() => opcoesDeAbrir(['--headless']), /opcao desconhecida: --headless/)
  assert.throws(() => opcoesDeAbrir(['--sem-janela', '--fechar']), /um de cada vez/)
})

test('avisosDeAbrir: D24 so sem headless, pasta de saida so com perfil conferido, nada com Chrome recem-aberto', () => {
  assert.equal(FECHAR_CHROME, 'node .claude/skills/conectar/scripts/abrir-chrome.mjs --fechar')
  const aberto = { jaEstavaAberto: true, perfilConferido: true, porta: P, pid: null, semJanela: false, semPastaDeSaida: false }
  assert.deepEqual(avisosDeAbrir(aberto), [], 'canario: Chrome com janela e pasta apontada nao avisa')
  const semJanela = avisosDeAbrir({ ...aberto, semJanela: true })
  assert.equal(semJanela.length, 1)
  assert.match(semJanela[0], /sem janela porque um robo abriu/)
  assert.ok(semJanela[0].includes(FECHAR_CHROME), 'a linha da D24 traz o --fechar do nucleo')
  assert.deepEqual(avisosDeAbrir({ ...aberto, semJanela: true }, true), [], 'com headless pedido, a D24 nao avisa')
  const pasta = avisosDeAbrir({ ...aberto, semPastaDeSaida: true }, true)
  assert.equal(pasta.length, 1)
  assert.match(pasta[0], /cai fora do projeto/)
  assert.ok(pasta[0].includes(FECHAR_CHROME))
  assert.deepEqual(avisosDeAbrir({ ...aberto, perfilConferido: false, semPastaDeSaida: true }), [], 'sem perfil conferido, nada da pasta')
  assert.equal(avisosDeAbrir({ ...aberto, semJanela: true, semPastaDeSaida: true }).length, 2)
  assert.deepEqual(avisosDeAbrir({ jaEstavaAberto: false, perfilConferido: true, porta: P, pid: 4321, semJanela: true, semPastaDeSaida: true }), [], 'Chrome recem-aberto nao avisa')
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
    // o texto de religar e o mesmo dos recados do hook (5.31); 5.54 (B1): religa pelo ligar-mcp.mjs e sai de vez do app
    // 5.56 (A): o sair de vez sai do fraseSair, com o programa desta sessao
    assert.ok(RELIGAR.includes('ligar-mcp.mjs ligar navegador') && RELIGAR.includes('feche de vez o programa onde você conversa comigo'), 'canario: o texto de religar pede o script e o sair de vez do programa')
    assert.ok(avisos.some(m => m.includes(`passou pra porta ${P + 1}`) && m.includes(RELIGAR)), avisos.join(' | '))
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

// 5.56 (A): o religar fala so do programa em uso, e dos dois quando nao sabe
test('religar: cada programa com o seu jeito de sair, o desconhecido com os dois', () => {
  assert.ok(religar('vscode').includes('(VS Code: fecha todas as janelas; no Mac, Cmd+Q)') && !religar('vscode').includes('app do Claude'), religar('vscode'))
  assert.ok(religar('app').includes('(app do Claude: ícone perto do relógio, botão direito, Sair; no Mac, Cmd+Q)') && !religar('app').includes('VS Code'), religar('app'))
  assert.ok(religar('desconhecido').includes('VS Code: fecha todas as janelas; app do Claude:'), religar('desconhecido'))
  for (const p of ['vscode', 'app', 'desconhecido']) {
    const r = religar(p)
    assert.ok(r.includes('ligar-mcp.mjs ligar navegador') && r.includes('antes de usar, espere terminar o que roda nas outras conversas') && r.endsWith('numa sessão nova'), r)
  }
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

// Playwright de mentira que anota onde ligou (ligou), cada connectOverCDP inteiro (chamadas) e cada
// comando CDP mandado por pagina do contexto padrao (enviados); abrir(p) faz nascer uma pagina
function playwrightFalso(paginas = []) {
  const ligou = []
  const chamadas = []
  const enviados = []
  const ouvintes = []
  const ctx = {
    pages: () => [...paginas],
    on: (evento, fn) => { if (evento === 'page') ouvintes.push(fn) },
    newCDPSession: async p => ({ send: async (metodo, args) => { enviados.push([p, metodo, args]) } }),
  }
  const browser = { fechado: false, contexts: () => [ctx] }
  const abrir = p => { for (const fn of ouvintes) fn(p) }
  return { ligou, chamadas, enviados, abrir, carregar: async () => ({ chromium: { connectOverCDP: async (...a) => { ligou.push(a[0]); chamadas.push(a); return browser } } }) }
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

// 5.49 (bloco C, 2026-11-03): login e registration no endereco deixam de dar sessao-caida
// (a palavra login no endereco nao para mais a coleta); sessao caida so com a pagina pedindo login.
test('sessaoCaiu: pagina pedindo login no Mercado Livre da sessao-caida', () => {
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login/identification', host: 'mercadolivre.com.br', pedeLogin: true }), 'sessao-caida')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/gz/account-verification', host: 'lista.mercadolivre.com.br', pedeLogin: true }), 'sessao-caida', 'subdominio do site conta')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolibre.com/x', host: 'mercadolibre.com', pedeLogin: true }), 'sessao-caida')
  assert.match(AVISO['sessao-caida'], /Entre de novo na conta/)
})

test('sessaoCaiu: login no endereco sem formulario na pagina nao para', () => {
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login?x=1', host: 'mercadolivre.com.br', pedeLogin: false }), null)
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/registration?x=1', host: 'mercadolivre.com.br' }), null, 'sem o sinal da pagina, nao para')
  assert.equal(sessaoCaiu({ url: 'https://www.mercadolivre.com.br/login?x=1', host: 'mercadolivre.com.br', pedeLogin: 'sim' }), null, 'so o true da pagina conta')
})

test('estadoDaUrl: o relogin segue lendo o login pelo endereco', () => {
  const receita = { host: 'mercadolivre.com.br' }
  assert.equal(estadoDaUrl('https://www.mercadolivre.com.br/login?x=1', receita), 'sessao-caida')
  assert.equal(estadoDaUrl('https://www.mercadolivre.com.br/login/captcha', receita), 'captcha')
  assert.equal(estadoDaUrl('https://lista.mercadolivre.com.br/caneca', receita), null)
  assert.equal(estadoDaUrl('https://exemplo.com/entrar', { host: 'exemplo.com', sessao: 'entrar' }), 'sessao-caida', 'sessao da receita')
})

// pagina falsa que roda a funcao do paginaPedeLogin contra um documento de mentira
function paginaComDom(elementos) {
  return {
    evaluate: async (fn, sel) => {
      globalThis.document = { querySelectorAll: s => (s === sel ? elementos : []) }
      try { return fn(sel) } finally { delete globalThis.document }
    },
  }
}

test('paginaPedeLogin: so o sinal visivel conta, e pagina que falha da false', async () => {
  const visivel = { offsetWidth: 10, offsetHeight: 10, getClientRects: () => [1] }
  const escondido = { offsetWidth: 0, offsetHeight: 0, getClientRects: () => [] }
  assert.equal(await paginaPedeLogin(paginaComDom([visivel])), true, 'canario: o campo visivel casa')
  assert.equal(await paginaPedeLogin(paginaComDom([escondido])), false)
  assert.equal(await paginaPedeLogin(paginaComDom([])), false)
  assert.equal(await paginaPedeLogin({ evaluate: async () => { throw new Error('navegando') } }), false)
  for (const s of ['input[type="password"]', 'input[name="identifier"]', 'a.old-user-button']) assert.ok(SINAL_LOGIN.includes(s), s)
})

// 5.49 (bloco C, revisao 2026-11-03): o sinal da pagina chega por um lugar so. A revisao achou que
// tirar o pedeLogin do espionar, do simular ou do rx passava sem teste reprovar
test('sessaoDaPagina: junta o endereco e o sinal da pagina, e os 5 que leem pagina do ML usam ela', async () => {
  const visivel = { offsetWidth: 10, offsetHeight: 10, getClientRects: () => [1] }
  const pagina = (url, elementos) => ({ ...paginaComDom(elementos), url: () => url })
  const busca = 'https://lista.mercadolivre.com.br/acme'
  assert.equal(await sessaoDaPagina(pagina(busca, [visivel]), 'mercadolivre.com.br'), 'sessao-caida', 'canario: o formulario na tela cai')
  assert.equal(await sessaoDaPagina(pagina(busca, []), 'mercadolivre.com.br'), null)
  assert.equal(await sessaoDaPagina(pagina('https://www.mercadolivre.com.br/login?x=1', []), 'mercadolivre.com.br'), null, 'login so no endereco nao cai')
  assert.equal(await sessaoDaPagina(pagina('https://www.mercadolivre.com.br/captcha?x=1', []), 'mercadolivre.com.br'), 'captcha')
  const skills = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const quem = ['espionar-concorrente/scripts/espionar.mjs', 'montar-anuncio/scripts/simular.mjs', 'engenharia-reversa/scripts/rx.mjs', 'pesquisar-tendencia/scripts/coletar-cdp.mjs', 'pode-vender/scripts/lib/ml.mjs']
  for (const rel of quem) {
    const t = readFileSync(join(skills, rel), 'utf8')
    assert.ok(t.length > 500, 'canario: leu ' + rel)
    assert.ok(t.includes("await sessaoDaPagina(page, 'mercadolivre.com.br')"), rel + ' sem o sessaoDaPagina')
    assert.ok(!/sessaoCaiu\s*\(/.test(t), rel + ' monta o sessaoCaiu sozinho')
  }
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

// Relogin automatico (5.29, D15). Pagina falsa no molde da do Playwright (url, fill, click): o
// clique no #entrar leva pra pagina logada, a nao ser que a pagina falsa mande ficar no login.
const LOGIN = 'https://www.mercadolivre.com.br/login?go=vendas'
const LOGADA = 'https://www.mercadolivre.com.br/vendas/omni/lista'
const RECEITA = {
  conta: 'ML',
  host: 'mercadolivre.com.br',
  passos: [
    { campo: 'usuario', seletor: '#u' }, { clicar: '#seguir' },
    { campo: 'senha', seletor: '#s' }, { clicar: '#seguir2' },
    { campo: 'codigo', seletor: '#c' }, { clicar: '#entrar' },
  ],
}
// iscas montadas em pedacos: nenhum literal do teste e o valor inteiro
const ISCA = { usuario: ['vend', 'edor@', 'x.com'].join(''), senha: ['Se', 'nha', '-9', '!q'].join(''), semente: ['JBSW', 'Y3DP', 'EHPK', '3PXP'].join('') }
const envDe = (sem = []) => new Map([['ML_USUARIO', ISCA.usuario], ['ML_SENHA', ISCA.senha], ['ML_TOTP', ISCA.semente]].filter(([n]) => !sem.includes(n)))
const AGORA = 1_700_000_000_000

function paginaFalsa({ inicio = LOGIN, depois = LOGADA, captchaApos = null, desvio = null } = {}) {
  const feitos = []
  let url = inicio
  return {
    feitos,
    url: () => url,
    fill: async (seletor, valor) => { feitos.push(['fill', seletor, valor]) },
    click: async seletor => {
      feitos.push(['click', seletor])
      if (desvio && seletor === desvio.apos) url = desvio.para
      else if (seletor === captchaApos) url = 'https://www.mercadolivre.com.br/captcha?x=1'
      else if (seletor === '#entrar') url = depois
    },
    voltarProLogin() { url = inicio },
    irPara(u) { url = u },
    ir: async u => { feitos.push(['ir', u]); url = u },
  }
}
const opcoesRelogar = extra => ({ conta: 'ML', receita: RECEITA, env: envDe(), tentadas: new Set(), agora: () => AGORA, dormir: async () => {}, ...extra })

test('relogar: com as tres variaveis preenche usuario, senha e o codigo da hora e devolve relogou', async () => {
  const pagina = paginaFalsa()
  const r = await relogar({ pagina, ...opcoesRelogar() })
  assert.equal(r.resultado, 'relogou')
  assert.deepEqual(pagina.feitos, [
    ['fill', '#u', ISCA.usuario], ['click', '#seguir'], ['fill', '#s', ISCA.senha], ['click', '#seguir2'],
    ['fill', '#c', codigo(ISCA.semente, AGORA)], ['click', '#entrar'],
  ])
})

test('relogar: faltando qualquer uma das tres variaveis devolve falta-variavel sem tocar na pagina', async () => {
  for (const sem of ['ML_USUARIO', 'ML_SENHA', 'ML_TOTP']) {
    const pagina = paginaFalsa()
    const r = await relogar({ pagina, ...opcoesRelogar({ env: envDe([sem]) }) })
    assert.equal(r.resultado, 'falta-variavel', sem)
    assert.deepEqual(pagina.feitos, [], sem)
  }
})

test('relogar: sem receita devolve sem-receita', async () => {
  const pagina = paginaFalsa()
  assert.equal((await relogar({ pagina, ...opcoesRelogar({ receita: null }) })).resultado, 'sem-receita')
  assert.deepEqual(pagina.feitos, [])
})

test('relogar: com captcha nunca preenche, nem na entrada nem no meio dos passos', async () => {
  const naEntrada = paginaFalsa({ inicio: 'https://www.mercadolivre.com.br/captcha?x=1' })
  assert.equal((await relogar({ pagina: naEntrada, ...opcoesRelogar() })).resultado, 'captcha')
  assert.deepEqual(naEntrada.feitos, [])
  const noMeio = paginaFalsa({ captchaApos: '#seguir' })
  assert.equal((await relogar({ pagina: noMeio, ...opcoesRelogar() })).resultado, 'captcha')
  assert.deepEqual(noMeio.feitos, [['fill', '#u', ISCA.usuario], ['click', '#seguir']], 'parou antes da senha')
})

test('relogar: captcha na entrada nao gasta a tentativa; resolvido, o relogin ainda roda', async () => {
  const tentadas = new Set()
  const pagina = paginaFalsa({ inicio: 'https://www.mercadolivre.com.br/captcha?x=1' })
  assert.equal((await relogar({ pagina, ...opcoesRelogar({ tentadas }) })).resultado, 'captcha')
  assert.equal((await relogar({ pagina: paginaFalsa(), ...opcoesRelogar({ tentadas }) })).resultado, 'relogou')
})

test('relogar: uma tentativa por queda; caiu de novo no mesmo disparo, para sem preencher', async () => {
  const tentadas = new Set()
  const pagina = paginaFalsa()
  assert.equal((await relogar({ pagina, ...opcoesRelogar({ tentadas }) })).resultado, 'relogou')
  pagina.voltarProLogin()
  const antes = pagina.feitos.length
  const r = await relogar({ pagina, ...opcoesRelogar({ tentadas }) })
  assert.equal(r.resultado, 'falhou')
  assert.match(r.motivo, /caiu de novo/)
  assert.equal(pagina.feitos.length, antes, 'a segunda queda nao preencheu nada')
})

test('relogar: receita de outra conta nao preenche nada (a senha do ML nunca vai pra outro site)', async () => {
  const pagina = paginaFalsa()
  const r = await relogar({ pagina, ...opcoesRelogar({ receita: { ...RECEITA, conta: 'LOJA' } }) })
  assert.equal(r.resultado, 'falhou')
  assert.match(r.motivo, /conta LOJA/)
  assert.deepEqual(pagina.feitos, [])
})

test('relogar: pagina que sai do host da receita ou do https antes de um campo para sem preencher', async () => {
  for (const para of ['https://outro.exemplo/login', 'http://www.mercadolivre.com.br/login']) {
    const pagina = paginaFalsa({ desvio: { apos: '#seguir', para } })
    const r = await relogar({ pagina, ...opcoesRelogar() })
    assert.equal(r.resultado, 'falhou', para)
    assert.match(r.motivo, /antes de preencher senha/, para)
    assert.deepEqual(pagina.feitos, [['fill', '#u', ISCA.usuario], ['click', '#seguir']], para)
  }
  const naEntrada = paginaFalsa({ inicio: 'https://outro.exemplo/login' })
  assert.equal((await relogar({ pagina: naEntrada, ...opcoesRelogar({ receita: { ...RECEITA, host: 'mercadolivre.com.br', sessao: 'login' } }) })).resultado, 'falhou')
  assert.deepEqual(naEntrada.feitos, [], 'login de outro site na entrada nao recebe nada')
})

test('relogar: aoTentar roda uma vez quando o relogin comeca, e nao no captcha da entrada', async () => {
  let vezes = 0
  const aoTentar = () => { vezes += 1 }
  await relogar({ pagina: paginaFalsa({ inicio: 'https://www.mercadolivre.com.br/captcha?x=1' }), ...opcoesRelogar({ aoTentar }) })
  assert.equal(vezes, 0)
  await relogar({ pagina: paginaFalsa(), ...opcoesRelogar({ aoTentar }) })
  assert.equal(vezes, 1)
})

test('tentouHaPouco e marcarTentativa: a marca no perfil segura a segunda queda entre processos', () => {
  const perfil = temp()
  try {
    assert.equal(tentouHaPouco({ perfil, conta: 'ML', agora: AGORA }), false, 'sem marca')
    marcarTentativa({ perfil, conta: 'ML', agora: AGORA })
    marcarTentativa({ perfil, conta: 'LOJA', agora: AGORA - JANELA_RELOGIN_MS })
    assert.equal(tentouHaPouco({ perfil, conta: 'ML', agora: AGORA + 60_000 }), true)
    assert.equal(tentouHaPouco({ perfil, conta: 'ML', agora: AGORA + JANELA_RELOGIN_MS }), false, 'passou a janela')
    assert.equal(tentouHaPouco({ perfil, conta: 'LOJA', agora: AGORA }), false, 'marca de outra conta, fora da janela')
    assert.equal(tentouHaPouco({ perfil, conta: 'OUTRA', agora: AGORA }), false)
    desmarcarTentativa({ perfil, conta: 'ML' })
    assert.equal(tentouHaPouco({ perfil, conta: 'ML', agora: AGORA + 60_000 }), false, 'desmarcada')
    writeFileSync(join(perfil, '.sabinos-relogin.json'), '{')
    assert.equal(tentouHaPouco({ perfil, conta: 'ML', agora: AGORA }), false, 'marca quebrada nao derruba')
  } finally {
    rmSync(perfil, { recursive: true, force: true })
  }
})

test('travarRelogin: um relogin por conta de cada vez, e a trava velha sai', () => {
  const perfil = temp()
  try {
    const soltar = travarRelogin({ perfil, conta: 'ML', agora: AGORA })
    assert.equal(typeof soltar, 'function', 'canario: o primeiro trava')
    assert.equal(travarRelogin({ perfil, conta: 'ML', agora: AGORA + 1000 }), null, 'o segundo no meio fica de fora')
    assert.equal(typeof travarRelogin({ perfil, conta: 'LOJA', agora: AGORA }), 'function', 'outra conta trava a dela')
    soltar()
    const de_novo = travarRelogin({ perfil, conta: 'ML', agora: AGORA + 2000 })
    assert.equal(typeof de_novo, 'function', 'solta, trava de novo')
    assert.equal(typeof travarRelogin({ perfil, conta: 'ML', agora: AGORA + 2000 + JANELA_RELOGIN_MS }), 'function', 'trava de processo morto sai depois da janela')
    assert.equal(typeof travarRelogin({ perfil: join(perfil, 'nao-existe'), conta: 'ML' }), 'function', 'sem perfil nao lanca')
    assert.ok(!existsSync(join(perfil, 'nao-existe')), 'sem perfil nao cria')
    // criada e ainda sem a hora (o outro processo esta entre o wx e a escrita): segura
    const vazia = join(perfil, '.sabinos-relogin-trava-VAZIA')
    writeFileSync(vazia, '')
    assert.equal(travarRelogin({ perfil, conta: 'VAZIA', agora: AGORA }), null, 'trava vazia e nova segura')
    const velhaEm = new Date(2020, 0, 1)
    utimesSync(vazia, velhaEm, velhaEm)
    assert.equal(typeof travarRelogin({ perfil, conta: 'VAZIA', agora: AGORA }), 'function', 'trava vazia mais velha que a janela sai')
  } finally {
    rmSync(perfil, { recursive: true, force: true })
  }
})

test('abaDoSite: servidor que aceita a conexao e nao responde o handshake nao prende', async () => {
  const presos = []
  const mudo = servidorTcp(s => presos.push(s))
  await new Promise(r => mudo.listen(0, '127.0.0.1', r))
  const lista = servidorHttp((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify([{ type: 'page', url: 'https://www.mercadolivre.com.br/login', webSocketDebuggerUrl: `ws://127.0.0.1:${mudo.address().port}/devtools/page/a` }]))
  })
  await new Promise(r => lista.listen(0, '127.0.0.1', r))
  try {
    const aba = await Promise.race([
      abaDoSite({ porta: lista.address().port, hosts: ['mercadolivre.com.br'], timeoutMs: 300 }),
      new Promise(r => setTimeout(() => r('preso'), 5000)),
    ])
    // o prazo da lib (300 ms) vence a corrida com o 'preso': sem ele a promessa nunca resolve
    assert.equal(aba, null, 'saiu pelo prazo, sem ficar presa')
    assert.ok(presos.length > 0, 'canario: a lib chegou a conectar no servidor mudo')
  } finally {
    for (const s of presos) s.destroy()
    await new Promise(r => mudo.close(r))
    await new Promise(r => lista.close(r))
  }
})

test('relogar: captcha no meio devolve a tentativa; resolvido, roda de novo', async () => {
  const tentadas = new Set()
  let devolvidas = 0
  const aoDesistir = () => { devolvidas += 1 }
  assert.equal((await relogar({ pagina: paginaFalsa({ captchaApos: '#seguir' }), ...opcoesRelogar({ tentadas, aoDesistir }) })).resultado, 'captcha')
  assert.equal(devolvidas, 1)
  assert.equal((await relogar({ pagina: paginaFalsa(), ...opcoesRelogar({ tentadas, aoDesistir }) })).resultado, 'relogou')
})

test('relogar: espera a pagina assentar depois de todo clique e quando a url muda entre dois passos', async () => {
  const pagina = paginaFalsa({ desvio: { apos: '#seguir', para: LOGIN + '/senha' } })
  const dormir = async ms => { pagina.feitos.push(['dormir', ms]) }
  const r = await relogar({ pagina, ...opcoesRelogar({ dormir, assentarMs: 1234 }) })
  assert.equal(r.resultado, 'relogou')
  const A = ['dormir', 1234]
  assert.deepEqual(pagina.feitos, [
    ['fill', '#u', ISCA.usuario], ['click', '#seguir'], A, A, ['fill', '#s', ISCA.senha], ['click', '#seguir2'], A,
    ['fill', '#c', codigo(ISCA.semente, AGORA)], ['click', '#entrar'], A,
  ], 'uma espera depois de cada clique e mais uma onde a url mudou (#seguir)')
})

test('relogar: aba parada no meio do login volta pra entrada antes do primeiro passo', async () => {
  const receita = { ...RECEITA, entrada: LOGIN }
  const meio = paginaFalsa({ inicio: 'https://www.mercadolivre.com.br/login/senha' })
  assert.equal((await relogar({ pagina: meio, ...opcoesRelogar({ receita }) })).resultado, 'relogou')
  assert.deepEqual(meio.feitos.slice(0, 2), [['ir', LOGIN], ['fill', '#u', ISCA.usuario]])
  const naEntrada = paginaFalsa({ inicio: LOGIN })
  await relogar({ pagina: naEntrada, ...opcoesRelogar({ receita }) })
  assert.ok(!naEntrada.feitos.some(f => f[0] === 'ir'), 'ja na entrada, nao navega')
  const semEntrada = paginaFalsa({ inicio: 'https://www.mercadolivre.com.br/login/senha' })
  await relogar({ pagina: semEntrada, ...opcoesRelogar() })
  assert.ok(!semEntrada.feitos.some(f => f[0] === 'ir'), 'receita sem entrada, nao navega')
})

test('abaDoSite: o clique que roda na pagina confere o endereco na mesma volta', () => {
  const clicar = href => {
    let clicou = false
    const r = runInNewContext(expressaoClique(JSON.stringify('#ok'), 'mercadolivre.com.br'), {
      URL, location: { href }, document: { querySelector: () => ({ click: () => { clicou = true } }) },
    })
    return { r, clicou }
  }
  assert.deepEqual(clicar('https://www.mercadolivre.com.br/login'), { r: true, clicou: true }, 'canario: no site, clica')
  assert.deepEqual(clicar('http://127.0.0.1:9/login'), { r: false, clicou: false }, 'local fora do host da receita')
  for (const href of ['https://outro.exemplo/confirmar', 'http://www.mercadolivre.com.br/login', 'https://mercadolivre.com.br.outro.exemplo/x']) {
    assert.deepEqual(clicar(href), { r: false, clicou: false }, href)
  }
})

test('relogar: clique em pagina de outro site nao acontece', async () => {
  const receita = { ...RECEITA, passos: [{ campo: 'usuario', seletor: '#u' }, { clicar: '#seguir' }, { clicar: '#seguir2' }, { clicar: '#entrar' }] }
  const pagina = paginaFalsa({ desvio: { apos: '#seguir', para: 'https://outro.exemplo/confirmar' } })
  const r = await relogar({ pagina, ...opcoesRelogar({ receita }) })
  assert.equal(r.resultado, 'falhou')
  assert.match(r.motivo, /antes de clicar em #seguir2/)
  assert.deepEqual(pagina.feitos, [['fill', '#u', ISCA.usuario], ['click', '#seguir']], 'o botao do outro site nao foi apertado')
})

test('relogar: pagina que sai do site durante a espera nao recebe o campo seguinte', async () => {
  const pagina = paginaFalsa({ desvio: { apos: '#seguir', para: LOGIN + '/senha' } })
  let n = 0
  // a segunda espera e a da url mudada, antes do campo da senha: a pagina foge pra outro site nela
  const dormir = async ms => { if (ms === 1234 && ++n === 2) pagina.irPara('https://outro.exemplo/login') }
  const r = await relogar({ pagina, ...opcoesRelogar({ dormir, assentarMs: 1234 }) })
  assert.equal(n >= 2, true, 'canario: a espera da url mudada rodou')
  assert.equal(r.resultado, 'falhou')
  assert.ok(!pagina.feitos.some(f => f[0] === 'fill' && f[1] === '#s'), 'a senha nao foi pro outro site')
})

test('relogar: fora do login mas fora do site, depois dos passos, nao conta como relogou', async () => {
  const pagina = paginaFalsa({ depois: 'https://outro.exemplo/erro' })
  const r = await relogar({ pagina, ...opcoesRelogar() })
  assert.equal(r.resultado, 'falhou')
  assert.match(r.motivo, /saiu de mercadolivre\.com\.br/)
})

test('abaDoSite: com duas abas do site vai na frente a do login e o log avisa da sobra, sem query', async () => {
  const s = servidorHttp((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify([
      { type: 'page', url: 'https://www.mercadolivre.com.br/vendas?tok=x', webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/a' },
      { type: 'page', url: 'https://www.mercadolivre.com.br/login?tok=y', webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/b' },
    ]))
  })
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const linhas = []
  try {
    await abaDoSite({ porta: s.address().port, hosts: ['mercadolivre.com.br'], naFrente: u => /login/.test(u), log: m => linhas.push(m) })
  } finally {
    await new Promise(r => s.close(r))
  }
  assert.equal(linhas.length, 1)
  assert.match(linhas[0], /^2 abas do site abertas; usando https:\/\/www\.mercadolivre\.com\.br\/login e deixando https:\/\/www\.mercadolivre\.com\.br\/vendas$/)
})

test('relogar: pagina que fica no login depois dos passos devolve falhou', async () => {
  const pagina = paginaFalsa({ depois: LOGIN })
  const r = await relogar({ pagina, ...opcoesRelogar() })
  assert.equal(r.resultado, 'falhou')
  assert.match(r.motivo, /continuou no login/)
})

test('relogar: pagina fora do login nao preenche nada', async () => {
  const pagina = paginaFalsa({ inicio: LOGADA })
  assert.equal((await relogar({ pagina, ...opcoesRelogar() })).resultado, 'falhou')
  assert.deepEqual(pagina.feitos, [])
})

test('relogar: site fora da tabela usa o sessao e o captcha da receita', async () => {
  const receita = { conta: 'ML', host: 'loja.exemplo', sessao: '/entrar', captcha: '/desafio', passos: [{ campo: 'usuario', seletor: '#u' }, { clicar: '#entrar' }] }
  const pagina = paginaFalsa({ inicio: 'https://loja.exemplo/entrar', depois: 'https://loja.exemplo/painel' })
  assert.equal((await relogar({ pagina, ...opcoesRelogar({ receita }) })).resultado, 'relogou')
  const desafio = paginaFalsa({ inicio: 'https://loja.exemplo/desafio' })
  const r = await relogar({ pagina: desafio, ...opcoesRelogar({ receita }) })
  assert.equal(r.resultado, 'captcha')
  assert.match(r.motivo, /o site loja\.exemplo pediu verificacao/, 'o aviso cita o site da receita, nao o Mercado Livre')
})

test('relogar: campo que nao aparece devolve falhou com o seletor, sem o valor', async () => {
  const pagina = paginaFalsa()
  pagina.fill = async () => { throw new Error(`timeout esperando #s com ${ISCA.senha}`) }
  const r = await relogar({ pagina, ...opcoesRelogar() })
  assert.equal(r.resultado, 'falhou')
  assert.match(r.motivo, /#u/)
  assert.ok(!r.motivo.includes(ISCA.senha), 'o recado nao repassa a mensagem de erro, que pode levar o valor')
})

test('relogar: nenhum valor do .env vai pro log nem pro resultado', async () => {
  const linhas = []
  const pagina = paginaFalsa()
  const r = await relogar({ pagina, ...opcoesRelogar({ log: m => linhas.push(m) }) })
  const tudo = linhas.join('|') + JSON.stringify(r)
  assert.ok(linhas.length > 0, 'canario: o relogar escreveu no log')
  assert.ok(`(${ISCA.senha})`.includes(ISCA.senha), 'canario: a busca da isca casa')
  for (const v of [ISCA.usuario, ISCA.senha, ISCA.semente, codigo(ISCA.semente, AGORA)]) assert.ok(!tudo.includes(v), 'valor no log')
})

test('receitaValida: aceita a forma da receita e recusa o resto com o motivo', () => {
  assert.equal(receitaValida(RECEITA), null)
  assert.equal(receitaValida({ ...RECEITA, entrada: 'https://www.mercadolivre.com.br/vendas', sessao: 'login', captcha: 'captcha' }), null)
  assert.match(receitaValida(null), /objeto/)
  assert.match(receitaValida({ ...RECEITA, conta: undefined }), /conta/)
  assert.match(receitaValida({ ...RECEITA, conta: 'ml' }), /conta/)
  assert.match(receitaValida({ ...RECEITA, host: '' }), /host/)
  assert.match(receitaValida({ ...RECEITA, passos: [] }), /passos/)
  assert.match(receitaValida({ ...RECEITA, passos: [{ campo: 'cpf', seletor: '#x' }] }), /campo/)
  assert.match(receitaValida({ ...RECEITA, passos: [{ campo: 'senha' }] }), /seletor/)
  assert.match(receitaValida({ ...RECEITA, entrada: 'https://outro.site/login' }), /entrada/)
  assert.match(receitaValida({ ...RECEITA, entrada: 'http://www.mercadolivre.com.br/' }), /entrada/)
  assert.match(receitaValida({ ...RECEITA, sessao: '(' }), /sessao/)
})

// receita so entra com a prova ao vivo (a do ML no C3 de 2026-10-28); a data mora no relogar.md,
// conferida pelo bancada/relogar-kit.test.mjs
test('receitas-login.json: toda receita e valida e cada conta aparece uma vez', () => {
  const lista = JSON.parse(readFileSync(join(AQUI, '..', 'receitas-login.json'), 'utf8'))
  assert.ok(Array.isArray(lista) && lista.length > 0, 'canario: a lista veio')
  assert.deepEqual(lista.map(receitaValida).filter(Boolean), [])
  assert.equal(new Set(lista.map(r => r.conta)).size, lista.length, 'conta repetida na lista')
})

test('abaDoSite: sem aba no site e sem abrir devolve null; porta morta tambem', async () => {
  const s = servidorHttp((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify([{ type: 'page', url: 'https://outro.site/x', webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/a' }]))
  })
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  try {
    assert.equal(await abaDoSite({ porta: s.address().port, hosts: ['mercadolivre.com.br'] }), null)
  } finally {
    await new Promise(r => s.close(r))
  }
  assert.equal(await abaDoSite({ porta: await portaMorta(), hosts: ['mercadolivre.com.br'] }), null)
})
