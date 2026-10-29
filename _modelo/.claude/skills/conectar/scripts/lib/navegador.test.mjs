// Testes da lib do Chrome dedicado do nucleo. Sem Chrome de verdade: spawn, fetch, existe e livre
// sao injetados; o conferirPerfil e o portaLivre rodam contra servidor de mentira em 127.0.0.1.
// Rodar: node --test navegador.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { createServer as servidorHttp } from 'node:http'
import { createServer as servidorTcp } from 'node:net'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  FAIXA, SENTINELA, AVISO, perfilDedicado, portaDoProjeto, candidatosDeChrome, acharChrome, argumentosDoChrome,
  guidDaPorta, portaLivre, esperarPorta, pidDoChrome, conferirPerfil, abrirChrome, conectar, sessaoCaiu,
  relogar, receitaValida, abaDoSite, tentouHaPouco, marcarTentativa, desmarcarTentativa, JANELA_RELOGIN_MS,
  travarRelogin, expressaoClique, conferirServidor, anotarSessao, pastaDaAnotacao, RELIGAR,
  SAIDA, apontarDownload, desminimizar, fecharChrome, opcoesDeAbrir, processoVivo, FOLGA_SEM_PID_MS,
} from './navegador.mjs'
import { SAIDA_NAVEGADOR } from '../../../../hooks/barrar-mcp.mjs'
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

// conferirServidor (5.30): .claude.json de mentira na forma do C1 (chave com barra normal e a caixa
// do disco, args do claude mcp add navegador do Degrau 5); nenhum teste le o de verdade
const argsDoC1 = porta => ['@playwright/mcp@0.0.83', '--cdp-endpoint', `http://127.0.0.1:${porta}`, '--output-dir', 'dados/navegador-saida', '--no-webmcp']
const chaveDoC1 = raiz => raiz.split(String.fromCharCode(92)).join('/')
// um arquivo por chamada: casos montados juntos nao se sobrescrevem (Codex comum, volta 1)
let configs = 0
function config(dir, projetos) {
  const f = join(dir, `config-${++configs}.json`)
  writeFileSync(f, typeof projetos === 'string' ? projetos : JSON.stringify({ projects: projetos }))
  return f
}
const navegadorEm = args => ({ mcpServers: { navegador: { type: 'stdio', command: 'npx', args, env: {} } } })
// projeto de mentira com a raiz, a pasta da configuracao, o perfil e a pasta da anotacao (5.31), que
// fica no mkdtemp e nunca no temporario de verdade. conferir abre a janela J1 com o navegador na
// porta do arquivo e confere a mesma janela.
function projetoDoServidor() {
  const base = temp()
  const raiz = join(base, 'Proj')
  mkdirSync(raiz)
  const pasta = join(base, 'anotacao')
  const anotar = (cfg, extra = {}) => anotarSessao({ raiz, janela: 'J1', sessao: 'S1', origem: 'startup', config: cfg, pasta, ...extra })
  const conferirSo = (cfg, extra = {}) => conferirServidor({ raiz, janela: 'J1', sessao: 'S1', config: cfg, pasta, ...extra })
  const conferir = (cfg, extra = {}) => { anotar(cfg); return conferirSo(cfg, extra) }
  return { base, raiz, pasta, perfil: perfilDedicado(raiz), anotar, conferirSo, conferir, limpar: () => rmSync(base, { recursive: true, force: true }) }
}
const doProjeto = (p, porta) => config(p.base, { [chaveDoC1(p.raiz)]: navegadorEm(argsDoC1(porta)) })
// a pasta da raiz (uma so por projeto, na pasta do teste) e as anotacoes dela, um arquivo por janela,
// pela chave que a lib usa
const pastaDaRaizNoTeste = p => { const [d] = readdirSync(p.pasta); return join(p.pasta, d) }
const anotacoes = p => {
  const dir = pastaDaRaizNoTeste(p)
  return Object.fromEntries(readdirSync(dir).filter(n => n.endsWith('.json')).map(n => {
    const a = JSON.parse(readFileSync(join(dir, n), 'utf8'))
    return [a.janela ? `janela:${a.janela}` : `sessao:${a.sessao}`, a]
  }))
}

test('conferirServidor: Chrome deste projeto na porta do servidor da conferido, so com a porta', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('g-1')
  try {
    gravar(p.perfil, { porta: s.porta, guid: 'g-1' })
    assert.deepEqual(await p.conferir(doProjeto(p, s.porta)), { estado: 'conferido', porta: s.porta })
  } finally { await s.fechar(); p.limpar() }
})

test('conferirServidor: outro Chrome na porta do servidor da outro-na-porta', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('de-outro-projeto')
  try {
    gravar(p.perfil, { porta: s.porta, guid: 'g-velho' })
    assert.deepEqual(await p.conferir(doProjeto(p, s.porta)), { estado: 'outro-na-porta', porta: s.porta })
  } finally { await s.fechar(); p.limpar() }
})

test('conferirServidor: sem sentinela da sem-sentinela, e a pasta-mae (sem dados/chrome-perfil) nao passa', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('g-2')
  try {
    assert.ok(!existsSync(p.perfil), 'canario: a raiz nao tem perfil, como a pasta-mae')
    assert.deepEqual(await p.conferir(doProjeto(p, s.porta)), { estado: 'sem-sentinela', porta: s.porta })
  } finally { await s.fechar(); p.limpar() }
})

test('conferirServidor: ninguem na porta do servidor da porta-fechada', async () => {
  const p = projetoDoServidor()
  try {
    const porta = await portaMorta()
    gravar(p.perfil, { porta, guid: 'g-velho' })
    assert.deepEqual(await p.conferir(doProjeto(p, porta)), { estado: 'porta-fechada', porta })
  } finally { p.limpar() }
})

test('conferirServidor: servidor numa porta e sentinela noutra da porta-mudou, mesmo com o Chrome deste projeto vivo', async () => {
  const p = projetoDoServidor()
  const deste = await servidorDoGuid('g-deste')
  const outro = await servidorDoGuid('g-outro')
  try {
    // o Chrome deste projeto pulou de porta; na porta antiga, onde o navegador foi ligado, responde outro
    gravar(p.perfil, { porta: deste.porta, guid: 'g-deste' })
    assert.deepEqual(await p.conferir(doProjeto(p, outro.porta)), { estado: 'porta-mudou', porta: outro.porta })
  } finally { await deste.fechar(); await outro.fechar(); p.limpar() }
})

test('conferirServidor: configuracao que nao se le ou sem a forma do C1 da sem-config', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('g-1')
  try {
    gravar(p.perfil, { porta: s.porta, guid: 'g-1' })
    const k = chaveDoC1(p.raiz)
    const certo = doProjeto(p, s.porta)
    assert.equal((await p.conferir(certo)).estado, 'conferido', 'canario: a entrada certa confere')
    const semCdp = argsDoC1(s.porta).filter((a, i, l) => a !== '--cdp-endpoint' && l[i - 1] !== '--cdp-endpoint')
    const casos = {
      'sem arquivo': join(p.base, 'nao-existe.json'),
      'arquivo quebrado': config(p.base, '{ isso nao e json'),
      'sem a entrada do projeto': config(p.base, { [k + '-outro']: navegadorEm(argsDoC1(s.porta)) }),
      'servidor de outro nome': config(p.base, { [k]: { mcpServers: { playwright: { args: argsDoC1(s.porta) } } } }),
      'args sem --cdp-endpoint': config(p.base, { [k]: navegadorEm(semCdp) }),
      'endpoint fora de 127.0.0.1': config(p.base, { [k]: navegadorEm(['--cdp-endpoint', `http://10.0.0.1:${s.porta}`]) }),
      'porta fora da faixa valida': config(p.base, { [k]: navegadorEm(['--cdp-endpoint', 'http://127.0.0.1:80']) }),
    }
    assert.equal(new Set(Object.values(casos)).size, Object.keys(casos).length, 'canario: cada caso le o proprio arquivo')
    // a janela segue anotada na porta certa; so o arquivo de agora estragou
    for (const [nome, arquivo] of Object.entries(casos))
      assert.deepEqual(await p.conferirSo(arquivo), { estado: 'sem-config', porta: null }, nome)
  } finally { await s.fechar(); p.limpar() }
})

test('conferirServidor: no Windows a chave com outra caixa e outra barra acha a entrada; duas chaves que discordam dao sem-config', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('g-1')
  try {
    gravar(p.perfil, { porta: s.porta, guid: 'g-1' })
    // fora do Windows caixa muda o caminho: a chave vai igual e o teste confere so a discordancia
    const variante = process.platform === 'win32' ? p.raiz.toUpperCase() : chaveDoC1(p.raiz)
    if (process.platform === 'win32') assert.ok(variante.includes(String.fromCharCode(92)) && variante !== chaveDoC1(p.raiz), 'canario: a variante tem outra caixa e barra invertida')
    assert.deepEqual(await p.conferir(config(p.base, { [variante]: navegadorEm(argsDoC1(s.porta)) })), { estado: 'conferido', porta: s.porta })
    const duas = { [chaveDoC1(p.raiz)]: navegadorEm(argsDoC1(s.porta)), [chaveDoC1(p.raiz) + '/']: navegadorEm(argsDoC1(s.porta + 1)) }
    assert.deepEqual(await p.conferirSo(config(p.base, duas)), { estado: 'sem-config', porta: null })
  } finally { await s.fechar(); p.limpar() }
})

// A anotacao da porta (5.31): a porta que vale e a de quando o servidor nasceu, nunca a do arquivo de agora.
test('conferirServidor: o P1 da 5.30, anotada X e o arquivo em Y com o Chrome do projeto em Y, barra religado sem perguntar ao Chrome', async () => {
  const p = projetoDoServidor()
  const ch = chromeFalso()
  try {
    const x = FAIXA.inicio + 11
    const y = FAIXA.inicio + 12
    ch.portas[y] = 'g-y'
    gravar(p.perfil, { porta: y, guid: 'g-y' })
    assert.deepEqual(await p.conferir(doProjeto(p, y), { fetchFn: ch.fetchFn }), { estado: 'conferido', porta: y }, 'canario: anotada em Y, o Chrome em Y passa')
    // a janela abriu com o navegador em X e foi religada de outro terminal pra Y: o servidor segue em X
    p.anotar(doProjeto(p, x))
    let perguntas = 0
    const contar = async (...a) => { perguntas += 1; return ch.fetchFn(...a) }
    assert.deepEqual(await p.conferirSo(doProjeto(p, y), { fetchFn: contar }), { estado: 'religado', porta: x })
    assert.equal(perguntas, 0, 'nenhum pedido ao Chrome de mentira')
  } finally { p.limpar() }
})

test('conferirServidor: sem anotacao da janela, anotada null ou sem janela e sem sessao da sem-anotacao', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('g-1')
  try {
    gravar(p.perfil, { porta: s.porta, guid: 'g-1' })
    const cfg = doProjeto(p, s.porta)
    assert.deepEqual(await p.conferirSo(cfg), { estado: 'sem-anotacao', porta: null }, 'nada anotado')
    p.anotar(config(p.base, { [chaveDoC1(p.raiz) + '-outro']: navegadorEm(argsDoC1(s.porta)) }))
    assert.equal(anotacoes(p)['janela:J1'].porta, null, 'canario: o navegador nao estava ligado quando a janela abriu')
    assert.deepEqual(await p.conferirSo(cfg), { estado: 'sem-anotacao', porta: null }, 'anotada null')
    p.anotar(cfg)
    assert.equal((await p.conferirSo(cfg)).estado, 'conferido', 'canario: anotada na porta, passa')
    assert.deepEqual(await p.conferirSo(cfg, { janela: 'J2' }), { estado: 'sem-anotacao', porta: null }, 'outra janela')
    assert.deepEqual(await p.conferirSo(cfg, { janela: undefined, sessao: undefined }), { estado: 'sem-anotacao', porta: null }, 'sem janela e sem sessao')
    assert.deepEqual(await conferirServidor({ raiz: undefined, janela: 'J1', config: cfg, pasta: p.pasta }), { estado: 'sem-anotacao', porta: null }, 'sem raiz')
  } finally { await s.fechar(); p.limpar() }
})

test('conferirServidor: arquivo de anotacao quebrado barra', async () => {
  const p = projetoDoServidor()
  const s = await servidorDoGuid('g-1')
  try {
    gravar(p.perfil, { porta: s.porta, guid: 'g-1' })
    const cfg = doProjeto(p, s.porta)
    assert.equal((await p.conferir(cfg)).estado, 'conferido', 'canario')
    const dir = pastaDaRaizNoTeste(p)
    const [arquivo] = readdirSync(dir)
    for (const ruim of ['{ quebrado', '[]', 'null', JSON.stringify({ porta: '29300', em: Date.now() }), JSON.stringify({ porta: 80, em: Date.now() })]) {
      writeFileSync(join(dir, arquivo), ruim)
      assert.deepEqual(await p.conferirSo(cfg), { estado: 'sem-anotacao', porta: null }, ruim)
    }
  } finally { await s.fechar(); p.limpar() }
})

test('anotarSessao: a regra do C1, startup anota pelo arquivo e a janela ja anotada mantem no compact, clear e resume', () => {
  const p = projetoDoServidor()
  try {
    const x = FAIXA.inicio + 21
    const y = FAIXA.inicio + 22
    p.anotar(doProjeto(p, x), { agora: 1000 })
    assert.deepEqual(anotacoes(p)['janela:J1'], { janela: 'J1', sessao: 'S1', porta: x, origem: 'startup', em: 1000 })
    // religado pra Y de outro processo: o servidor desta janela nao renasce
    for (const [origem, sessao] of [['compact', 'S1'], ['clear', 'S2'], ['resume', 'S1'], ['fork', 'S3']]) {
      p.anotar(doProjeto(p, y), { origem, sessao, agora: 2000 })
      assert.equal(anotacoes(p)['janela:J1'].porta, x, `${origem} mantem a porta da janela`)
    }
    // janela nova (o --resume ou o --continue de processo novo) nasce lendo o arquivo
    p.anotar(doProjeto(p, y), { janela: 'J2', origem: 'resume', agora: 3000 })
    assert.equal(anotacoes(p)['janela:J2'].porta, y)
    // startup sempre sobrescreve: pid reaproveitado por janela nova
    p.anotar(doProjeto(p, y), { agora: 4000 })
    assert.equal(anotacoes(p)['janela:J1'].porta, y)
  } finally { p.limpar() }
})

// Codex final da 5.31: a anotacao da janela some (temporario limpo, ou vencida) e vem um compact ou clear
test('anotarSessao: janela sem anotacao no compact ou clear anota null e barra, nunca le o arquivo', async () => {
  const p = projetoDoServidor()
  const y = await servidorDoGuid('g-y')
  try {
    // aberta em X, religado pra Y com o Chrome deste projeto em Y; o servidor desta janela segue em X
    gravar(p.perfil, { porta: y.porta, guid: 'g-y' })
    const cfgY = doProjeto(p, y.porta)
    for (const origem of ['compact', 'clear', undefined]) {
      rmSync(p.pasta, { recursive: true, force: true })
      p.anotar(cfgY, { origem })
      assert.equal(anotacoes(p)['janela:J1'].porta, null, `${origem}: anotada null`)
      assert.deepEqual(await p.conferirSo(cfgY), { estado: 'sem-anotacao', porta: null }, `${origem}: barra`)
    }
    // canario: o resume de processo novo le o arquivo e passa
    rmSync(p.pasta, { recursive: true, force: true })
    p.anotar(cfgY, { origem: 'resume' })
    assert.equal((await p.conferirSo(cfgY)).estado, 'conferido')
  } finally { await y.fechar(); p.limpar() }
})

test('anotarSessao: duas janelas na mesma conversa, a que ficou na porta velha barra e a nova passa', async () => {
  const p = projetoDoServidor()
  const x = await servidorDoGuid('g-x')
  const y = await servidorDoGuid('g-y')
  try {
    // janela A abre a conversa S com o navegador em X
    p.anotar(doProjeto(p, x.porta), { janela: 'A', sessao: 'S' })
    // religado pra Y e o Chrome deste projeto agora em Y; claude --resume S noutro terminal abre a janela B
    gravar(p.perfil, { porta: y.porta, guid: 'g-y' })
    const cfgY = doProjeto(p, y.porta)
    p.anotar(cfgY, { janela: 'B', sessao: 'S', origem: 'resume' })
    assert.deepEqual(await p.conferirSo(cfgY, { janela: 'A', sessao: 'S' }), { estado: 'religado', porta: x.porta }, 'A segue no servidor de X')
    assert.deepEqual(await p.conferirSo(cfgY, { janela: 'B', sessao: 'S' }), { estado: 'conferido', porta: y.porta }, 'B nasceu em Y')
  } finally { await x.fechar(); await y.fechar(); p.limpar() }
})

test('anotarSessao: sem CLAUDE_PID a chave e a sessao, e o clear herda a ultima anotacao da raiz (D21)', () => {
  const p = projetoDoServidor()
  try {
    const x = FAIXA.inicio + 31
    const y = FAIXA.inicio + 32
    const semJanela = { janela: undefined }
    p.anotar(doProjeto(p, x), { ...semJanela, agora: 1000 })
    assert.equal(anotacoes(p)['sessao:S1'].porta, x)
    assert.ok(!('janela:J1' in anotacoes(p)), 'sem janela nada se anota por janela')
    // religado pra Y; /clear e /compact chegam com sessao nova e o servidor segue em X
    p.anotar(doProjeto(p, y), { ...semJanela, origem: 'clear', sessao: 'S2', agora: 2000 })
    assert.equal(anotacoes(p)['sessao:S2'].porta, x, 'o clear herda a porta, nunca le o arquivo')
    p.anotar(doProjeto(p, y), { ...semJanela, origem: 'compact', sessao: 'S1', agora: 2500 })
    assert.equal(anotacoes(p)['sessao:S1'].porta, x, 'sessao ja anotada mantem')
    // processo novo (resume) nasce lendo o arquivo
    p.anotar(doProjeto(p, y), { ...semJanela, origem: 'resume', sessao: 'S9', agora: 3000 })
    assert.equal(anotacoes(p)['sessao:S9'].porta, y)
    // sem janela e sem sessao nao anota nada
    p.anotar(doProjeto(p, y), { janela: undefined, sessao: undefined, agora: 4000 })
    assert.equal(Object.keys(anotacoes(p)).length, 3)
  } finally { p.limpar() }
})

test('anotarSessao: tira anotacao com mais de 30 dias, conserta arquivo quebrado e nunca joga erro', () => {
  const p = projetoDoServidor()
  try {
    const dia = 24 * 60 * 60_000
    const cfg = doProjeto(p, FAIXA.inicio + 41)
    p.anotar(cfg, { janela: 'velha', agora: 0 })
    p.anotar(cfg, { janela: 'nova', agora: 29 * dia })
    p.anotar(cfg, { janela: 'hoje', agora: 31 * dia })
    assert.deepEqual(Object.keys(anotacoes(p)).sort(), ['janela:hoje', 'janela:nova'])
    // anotacao quebrada de outra janela sai na proxima gravacao; o temporario de quem grava agora fica
    const dir = pastaDaRaizNoTeste(p)
    writeFileSync(join(dir, 'quebrada.json'), '{ quebrado')
    writeFileSync(join(dir, 'outra.json.77.tmp'), '{')
    p.anotar(cfg, { agora: 32 * dia })
    assert.deepEqual(readdirSync(dir).filter(n => n.endsWith('.json')).length, 3, 'hoje, nova e J1')
    assert.ok(!readdirSync(dir).includes('quebrada.json'))
    assert.ok(readdirSync(dir).includes('outra.json.77.tmp'), 'o temporario alheio fica')
    assert.equal(readdirSync(dir).filter(n => n.endsWith('.tmp')).length, 1, 'nenhum temporario proprio sobrou')
    // configuracao quebrada anota null; pasta que nao se cria nao joga erro
    p.anotar(config(p.base, '{ nao e json'), { agora: 33 * dia })
    assert.equal(anotacoes(p)['janela:J1'].porta, null)
    writeFileSync(join(p.base, 'arquivo'), 'x')
    assert.doesNotThrow(() => anotarSessao({ raiz: p.raiz, janela: 'J1', origem: 'startup', config: cfg, pasta: join(p.base, 'arquivo', 'dentro') }))
    assert.doesNotThrow(() => anotarSessao())
  } finally { p.limpar() }
})

// Codex comum da 5.31: com um arquivo so por raiz, duas janelas abrindo juntas liam o mesmo arquivo e a
// segunda gravacao apagava a primeira. Agora cada janela grava so o proprio arquivo.
test('anotarSessao: a gravacao de uma janela nunca reescreve a anotacao de outra', () => {
  const p = projetoDoServidor()
  try {
    const cfg = doProjeto(p, FAIXA.inicio + 61)
    p.anotar(cfg, { janela: 'A' })
    const dir = pastaDaRaizNoTeste(p)
    const [deA] = readdirSync(dir)
    // marca que so sobrevive se ninguem reescrever o arquivo da A
    const marca = JSON.stringify({ janela: 'A', sessao: 'S1', porta: FAIXA.inicio + 62, origem: 'startup', em: Date.now() })
    writeFileSync(join(dir, deA), marca)
    p.anotar(cfg, { janela: 'B' })
    p.anotar(cfg, { janela: 'C', origem: 'resume' })
    assert.equal(readFileSync(join(dir, deA), 'utf8'), marca)
    assert.deepEqual(Object.keys(anotacoes(p)).sort(), ['janela:A', 'janela:B', 'janela:C'])
  } finally { p.limpar() }
})

test('anotarSessao: o arquivo da anotacao fica fora do projeto e um por raiz', () => {
  const p = projetoDoServidor()
  const q = projetoDoServidor()
  try {
    const cfg = doProjeto(p, FAIXA.inicio + 51)
    p.anotar(cfg)
    anotarSessao({ raiz: q.raiz, janela: 'J1', sessao: 'S1', origem: 'startup', config: cfg, pasta: p.pasta })
    assert.equal(readdirSync(p.pasta).length, 2)
    assert.ok(!existsSync(p.perfil), 'nada nasce no perfil do Chrome')
    assert.ok(pastaDaAnotacao().startsWith(tmpdir()), 'a pasta de verdade fica no temporario do sistema')
  } finally { p.limpar(); q.limpar() }
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
    assert.equal(apontarDownload(perfil, saida, { log: () => {} }), true)
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
    assert.equal(apontarDownload(perfil, join(raiz, SAIDA), { log: () => {} }), true)
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
      assert.equal(apontarDownload(perfil, join(raiz, SAIDA), { log: m => avisos.push(m) }), false, quebrado)
      assert.equal(readFileSync(arq, 'utf8'), quebrado)
      assert.ok(avisos.length === 1 && avisos[0].includes('Downloads'), avisos.join(' | '))
    }
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
    // o texto de religar e o mesmo dos recados do hook (5.31), com o fechar e abrir
    assert.ok(RELIGAR.includes('feche e abra o Claude Code'), 'canario: o texto de religar pede o fechar e abrir')
    assert.ok(avisos.some(m => m.includes(`passou pra porta ${P + 1}`) && m.includes(RELIGAR)), avisos.join(' | '))
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
