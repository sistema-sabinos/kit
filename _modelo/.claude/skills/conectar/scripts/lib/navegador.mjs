// O Chrome dedicado do projeto: um Chrome separado, com perfil proprio em dados/chrome-perfil/,
// aberto com porta de depuracao propria deste projeto. Site que bloqueia navegador sem sessao (o
// Mercado Livre) roda nesse Chrome, onde a pessoa logou uma vez.
// Cada projeto tem a sua porta (hash do caminho, numa faixa alta) e grava no perfil uma sentinela
// com a porta e o guid do Chrome que abriu. Antes de usar a porta, a lib confere que quem responde
// nela e o Chrome deste perfil: o guid muda a cada abertura, entao outro Chrome na mesma porta, ou
// um Chrome velho com o mesmo numero, nao passa.
// O caminho do binario no Windows sai das variaveis de ambiente, nunca de letra de unidade
// escrita aqui (o kit precisa rodar no Windows e no Mac).
// Os pacotes (mercado-livre, midia-social) tem uma casca chrome.mjs que reexporta esta lib e poe o
// Playwright do proprio pacote; esta lib nao importa pacote nenhum.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, win32, posix } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { RAIZ } from './raiz.mjs'

// Abaixo das portas efemeras do Windows, do Mac e do Linux (32768 em diante) e longe das portas
// comuns de depuracao; a faixa estava sem registro na IANA em 2026-10-23.
export const FAIXA = { inicio: 29200, tamanho: 700 }
export const SENTINELA = '.sabinos-porta.json'
// quantas portas seguintes a lib tenta quando a do projeto esta com outro programa
const TENTATIVAS = 10

// A lib nunca refaz o login sozinha: avisa e para.
export const AVISO = {
  'sessao-caida': 'a pagina pediu login: a sessao do Chrome dedicado caiu. Entre de novo na conta e rode outra vez',
  captcha: 'o Mercado Livre pediu verificacao (captcha): resolva na janela do Chrome dedicado e rode de novo',
}

export function perfilDedicado(raiz = RAIZ) {
  return join(raiz, 'dados', 'chrome-perfil')
}

// No Windows caixa e barra nao mudam o caminho.
function chave(caminho, plataforma = process.platform) {
  const normal = resolve(caminho).split(String.fromCharCode(92)).join('/')
  return plataforma === 'win32' ? normal.toLowerCase() : normal
}

// A sentinela leva o caminho do perfil que a gravou: a pasta de um projeto copiada com o Chrome
// dele aberto leva a sentinela junto, e a copia nao pode passar pelo Chrome do original.
function lerSentinela(perfil) {
  try {
    const s = JSON.parse(readFileSync(join(perfil, SENTINELA), 'utf8'))
    if (Number.isInteger(s?.porta) && s.porta >= 1024 && s.porta <= 65535 && typeof s.guid === 'string' &&
      typeof s.perfil === 'string' && chave(s.perfil) === chave(perfil)) return { porta: s.porta, guid: s.guid }
  } catch {}
  return null
}

function gravarSentinela(perfil, dados) {
  writeFileSync(join(perfil, SENTINELA), JSON.stringify({ ...dados, perfil: resolve(perfil) }) + '\n')
}

// A porta que a sentinela gravou vence; sem ela, o hash do caminho da raiz.
export function portaDoProjeto(raiz = RAIZ, { plataforma = process.platform } = {}) {
  const s = lerSentinela(perfilDedicado(raiz))
  if (s) return s.porta
  return FAIXA.inicio + createHash('sha256').update(chave(raiz, plataforma)).digest().readUInt32BE(0) % FAIXA.tamanho
}

export function candidatosDeChrome(env = process.env, plataforma = process.platform) {
  if (plataforma === 'win32') {
    const fim = ['Google', 'Chrome', 'Application', 'chrome.exe']
    return [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean).map(b => win32.join(b, ...fim))
  }
  if (plataforma === 'darwin') {
    const app = ['Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome']
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', posix.join(env.HOME || '', 'Applications', ...app)]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
}

export function acharChrome({ env = process.env, plataforma = process.platform, existe = existsSync } = {}) {
  return candidatosDeChrome(env, plataforma).find(c => existe(c)) || null
}

export function argumentosDoChrome(perfil, porta, { headless = false } = {}) {
  const a = [`--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check']
  if (headless) a.push('--headless=new')
  return a
}

// O guid e o fim do webSocketDebuggerUrl do /json/version; null quando a porta nao responde
// como Chrome.
export async function guidDaPorta(porta, { fetchFn = fetch, timeoutMs = 1500 } = {}) {
  try {
    const r = await fetchFn(`http://127.0.0.1:${porta}/json/version`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!r || !r.ok) return null
    const ws = (await r.json())?.webSocketDebuggerUrl
    if (typeof ws !== 'string') return null
    return ws.split('/').pop() || null
  } catch {
    return null
  }
}

export function portaLivre(porta) {
  return new Promise(ok => {
    const s = createServer()
    s.once('error', () => ok(false))
    s.listen(porta, '127.0.0.1', () => s.close(() => ok(true)))
  })
}

export async function esperarPorta({ porta, fetchFn, esperarMs = 45_000, passoMs = 1000, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const fim = Date.now() + esperarMs
  do {
    const guid = await guidDaPorta(porta, { fetchFn })
    if (guid) return guid
    await dormir(passoMs)
  } while (Date.now() < fim)
  return null
}

// O numero do processo principal do Chrome que responde por esse guid na porta, pelo
// SystemInfo.getProcessInfo do CDP (o getBrowserCommandLine, que diria a pasta do perfil, so
// responde com --enable-automation, que o site enxerga). null quando nao deu pra perguntar.
export function pidDoChrome(porta, guid, { timeoutMs = 3000 } = {}) {
  return new Promise(ok => {
    let ws
    const prazo = setTimeout(() => acabar(null), timeoutMs)
    function acabar(v) {
      clearTimeout(prazo)
      try { ws?.close() } catch {}
      ok(v)
    }
    try {
      ws = new WebSocket(`ws://127.0.0.1:${porta}/devtools/browser/${guid}`)
    } catch {
      return acabar(null)
    }
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' }))
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(ev.data)
        if (m.id === 1) acabar(m.result?.processInfo?.find(p => p.type === 'browser')?.id ?? null)
      } catch { acabar(null) }
    }
    ws.onerror = () => acabar(null)
  })
}

// conferido: o Chrome na porta e o deste perfil. outro-na-porta: responde um Chrome com outro
// guid. sem-sentinela: a porta responde, mas o perfil nao diz de quem ela e. porta-fechada:
// ninguem responde.
export async function conferirPerfil({ porta, perfil, fetchFn, timeoutMs } = {}) {
  const guid = await guidDaPorta(porta, { fetchFn, timeoutMs })
  if (!guid) return { estado: 'porta-fechada', guid: null }
  const s = lerSentinela(perfil)
  if (!s) return { estado: 'sem-sentinela', guid }
  return { estado: s.porta === porta && s.guid === guid ? 'conferido' : 'outro-na-porta', guid }
}

// soExistente: so usa perfil que ja existe e nunca pula de porta (a sonda agendada roda assim).
export async function abrirChrome({ raiz = RAIZ, perfil = perfilDedicado(raiz), porta = portaDoProjeto(raiz), soExistente = false, headless = false, env = process.env, plataforma = process.platform, existe = existsSync, spawnFn = spawn, fetchFn, livre = portaLivre, perguntarPid = pidDoChrome, esperarMs = 45_000, dormir, log = console.log } = {}) {
  if (soExistente && !existe(perfil)) throw Object.assign(new Error(`o perfil do Chrome dedicado nao existe (${perfil}). Perfil novo nao se cria aqui: o Mercado Livre manda perfil novo pra verificacao de conta. Abra o Chrome dedicado do projeto e entre na conta uma vez.`), { estado: 'sem-perfil' })
  const atual = await conferirPerfil({ porta, perfil, fetchFn })
  if (atual.estado === 'conferido') return { jaEstavaAberto: true, perfilConferido: true, porta, pid: null }
  if (soExistente && atual.estado !== 'porta-fechada') return { jaEstavaAberto: true, perfilConferido: false, porta, pid: null }

  let escolhida = null
  if (atual.estado === 'porta-fechada' && (await livre(porta))) escolhida = porta
  else if (!soExistente) {
    for (let p = porta + 1; p <= porta + TENTATIVAS && escolhida === null; p++) if (await livre(p)) escolhida = p
  }
  if (escolhida === null) {
    throw new Error(soExistente
      ? `a porta ${porta} do Chrome dedicado esta com outro programa. Feche o programa que usa essa porta e rode de novo.`
      : `nenhuma porta livre de ${porta} a ${porta + TENTATIVAS} pro Chrome dedicado. Feche os Chrome dedicados de outros projetos e rode de novo.`)
  }

  const chrome = acharChrome({ env, plataforma, existe })
  if (!chrome) throw new Error('nao achei o Google Chrome instalado. Instale em google.com/chrome e rode de novo.')
  if (!soExistente) {
    mkdirSync(perfil, { recursive: true })
    // o perfil guarda a sessao logada: mesmo em projeto antigo, sem a linha no .gitignore da raiz,
    // ele nunca entra no backup
    const ignora = join(perfil, '.gitignore')
    if (!existsSync(ignora)) writeFileSync(ignora, '*\n')
  }
  const filho = spawnFn(chrome, argumentosDoChrome(perfil, escolhida, { headless }), { detached: true, stdio: 'ignore' })
  if (filho && typeof filho.unref === 'function') filho.unref()
  log(`abrindo o Chrome dedicado na porta ${escolhida} (perfil em ${perfil})`)
  const guid = await esperarPorta({ porta: escolhida, fetchFn, esperarMs, dormir })
  if (!guid) throw new Error(`o Chrome abriu, mas a porta ${escolhida} nao respondeu em ${Math.ceil(esperarMs / 1000)} segundos. Feche todas as janelas do Chrome dedicado e tente de novo.`)
  // dois projetos abrindo ao mesmo tempo podem pegar a mesma porta livre: so grava a sentinela
  // quando quem responde na porta e o processo aberto aqui
  const pid = (filho && filho.pid) || null
  const dono = await perguntarPid(escolhida, guid)
  if (!pid || dono !== pid) throw new Error(`outro Chrome pegou a porta ${escolhida} enquanto o deste projeto abria. Feche o Chrome dedicado deste projeto e rode de novo.`)
  gravarSentinela(perfil, { porta: escolhida, guid })
  if (escolhida !== porta) log(`a porta ${porta} estava com outro programa, entao o Chrome deste projeto passou pra porta ${escolhida}. Se o navegador da IA estava ligado na porta antiga, rode o /conectar de novo.`)
  return { jaEstavaAberto: false, perfilConferido: true, porta: escolhida, pid }
}

// carregar traz o Playwright (a casca do pacote resolve do node_modules dela); skill so muda o texto
// das mensagens.
export async function conectar({ porta = portaDoProjeto(RAIZ), perfil = perfilDedicado(RAIZ), carregar, skill, fetchFn } = {}) {
  let pw
  try {
    pw = await carregar()
  } catch {
    throw new Error(skill
      ? `o Playwright nao esta instalado nesta skill. Rode na raiz do projeto: npm install --prefix .claude/skills/${skill}`
      : 'o Playwright nao esta instalado.')
  }
  const c = await conferirPerfil({ porta, perfil, fetchFn })
  if (c.estado === 'porta-fechada') {
    throw Object.assign(new Error(skill
      ? `o Chrome dedicado nao esta aberto. Rode: node .claude/skills/${skill}/scripts/abrir-chrome.mjs`
      : `o Chrome dedicado nao esta aberto (porta ${porta}).`), { estado: c.estado })
  }
  if (c.estado !== 'conferido') throw Object.assign(new Error(`na porta ${porta} responde um Chrome que nao e o deste projeto. Feche esse Chrome e abra o deste projeto${skill ? `: node .claude/skills/${skill}/scripts/abrir-chrome.mjs` : ''}`), { estado: c.estado })
  return pw.chromium.connectOverCDP(`http://127.0.0.1:${porta}`)
}

// Pagina de login, cadastro ou verificacao no lugar da que o script pediu. host e o site que o
// script estava lendo (o proprio ou um subdominio dele); site fora da tabela devolve null.
// A regra da verificacao de conta e a de hoje ate ter pagina real gravada.
const TABELA = [
  { hosts: ['mercadolivre.com.br', 'mercadolibre.com'], sessao: /login|registration/i, captcha: /captcha/i },
]

export function sessaoCaiu({ url, host } = {}) {
  if (typeof url !== 'string' || typeof host !== 'string') return null
  const h = host.toLowerCase()
  const regra = TABELA.find(r => r.hosts.some(x => h === x || h.endsWith('.' + x)))
  if (!regra) return null
  if (regra.captcha.test(url)) return 'captcha'
  if (regra.sessao.test(url)) return 'sessao-caida'
  return null
}
