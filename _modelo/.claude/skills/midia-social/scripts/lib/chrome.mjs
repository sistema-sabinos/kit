// Copia do pacote Mercado Livre, porque este pacote nao pode depender dele; mesmo perfil (dados/chrome-perfil/)
// e mesma porta, entao os dois dividem o Chrome quando existem juntos.
// O Chrome dedicado do pacote: um Chrome separado, com perfil proprio em dados/chrome-perfil/,
// aberto com a porta de depuracao 9222. O Mercado Livre bloqueia navegador sem sessao, entao
// a coleta, a espionagem e o simulador rodam nesse Chrome, onde a pessoa logou uma vez.
// O caminho do binario no Windows sai das variaveis de ambiente, nunca de letra de unidade
// escrita aqui (o kit precisa rodar no Windows e no Mac).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, win32, posix } from 'node:path'
import { spawn } from 'node:child_process'
import { RAIZ } from './raiz.mjs'

export const PORTA = 9222
export const CDP_URL = `http://127.0.0.1:${PORTA}`

export function perfilDedicado(raiz = RAIZ) {
  return join(raiz, 'dados', 'chrome-perfil')
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

export function argumentosDoChrome(perfil, porta = PORTA) {
  return [`--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check']
}

export async function portaResponde(url = CDP_URL, { fetchFn = fetch, timeoutMs = 1500 } = {}) {
  try {
    const r = await fetchFn(`${url}/json/version`, { signal: AbortSignal.timeout(timeoutMs) })
    return Boolean(r && r.ok)
  } catch {
    return false
  }
}

export async function esperarPorta({ url = CDP_URL, fetchFn, esperarMs = 45_000, passoMs = 1000, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const fim = Date.now() + esperarMs
  do {
    if (await portaResponde(url, { fetchFn })) return true
    await dormir(passoMs)
  } while (Date.now() < fim)
  return false
}

export async function abrirChrome({ raiz = RAIZ, env = process.env, plataforma = process.platform, existe = existsSync, spawnFn = spawn, fetchFn, esperarMs = 45_000, dormir, log = console.log } = {}) {
  if (await portaResponde(CDP_URL, { fetchFn })) return { jaEstavaAberto: true, pid: null }
  const chrome = acharChrome({ env, plataforma, existe })
  if (!chrome) throw new Error('nao achei o Google Chrome instalado. Instale em google.com/chrome e rode de novo.')
  const perfil = perfilDedicado(raiz)
  mkdirSync(perfil, { recursive: true })
  // o perfil guarda a sessao logada: mesmo em projeto antigo, sem a linha no .gitignore da raiz,
  // ele nunca entra no backup
  const ignora = join(perfil, '.gitignore')
  if (!existsSync(ignora)) writeFileSync(ignora, '*\n')
  const filho = spawnFn(chrome, argumentosDoChrome(perfil), { detached: true, stdio: 'ignore' })
  if (filho && typeof filho.unref === 'function') filho.unref()
  log(`abrindo o Chrome dedicado (perfil em ${perfil})`)
  const subiu = await esperarPorta({ fetchFn, esperarMs, dormir })
  if (!subiu) throw new Error(`o Chrome abriu, mas a porta ${PORTA} nao respondeu em ${Math.ceil(esperarMs / 1000)} segundos. Feche todas as janelas do Chrome e tente de novo.`)
  return { jaEstavaAberto: false, pid: (filho && filho.pid) || null }
}

// O Playwright vem do node_modules desta skill (npm install --prefix .claude/skills/midia-social).
export async function conectar({ carregar = () => import('playwright'), fetchFn } = {}) {
  let pw
  try {
    pw = await carregar()
  } catch {
    throw new Error('o Playwright nao esta instalado nesta skill. Rode na raiz do projeto: npm install --prefix .claude/skills/midia-social')
  }
  if (!(await portaResponde(CDP_URL, { fetchFn }))) {
    throw new Error('o Chrome dedicado nao esta aberto. Rode: node .claude/skills/midia-social/scripts/abrir-chrome.mjs')
  }
  return pw.chromium.connectOverCDP(CDP_URL)
}
