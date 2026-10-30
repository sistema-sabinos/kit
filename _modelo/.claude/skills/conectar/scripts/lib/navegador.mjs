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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, rmSync, statSync, realpathSync, linkSync } from 'node:fs'
import { join, resolve, dirname, basename, relative, isAbsolute, sep, win32, posix } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomUUID } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { RAIZ } from './raiz.mjs'
import { codigo as codigoTotp, CONTA } from '../totp.mjs'

// Abaixo das portas efemeras do Windows, do Mac e do Linux (32768 em diante) e longe das portas
// comuns de depuracao; a faixa estava sem registro na IANA em 2026-10-23.
export const FAIXA = { inicio: 29200, tamanho: 700 }
export const SENTINELA = '.sabinos-porta.json'
// quantas portas seguintes a lib tenta quando a do projeto esta com outro programa
const TENTATIVAS = 10

// A lib so refaz o login na conta em que a pessoa ligou o relogin automatico (relogar, abaixo, e
// referencias/relogar.md); no resto avisa e para.
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
      typeof s.perfil === 'string' && chave(s.perfil) === chave(perfil)) return { porta: s.porta, guid: s.guid, semJanela: s.semJanela === true, saida: s.saida === true }
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

// Os tres --disable-* sao os que o Playwright passa ao Chrome que ele mesmo abre: sem eles o Chrome
// congela a pagina em segundo plano (prova C1c da 5.32, volta 3). Janela minimizada trava o clique
// mesmo com eles (volta 2): o Windows nao desenha janela minimizada.
export function argumentosDoChrome(perfil, porta, { headless = false } = {}) {
  const a = [`--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding']
  if (headless) a.push('--headless=new')
  return a
}

// Onde o navegador da IA grava o que baixa; igual ao SAIDA_NAVEGADOR do hook barrar-mcp.mjs (um
// teste confere), que esta lib nao importa.
export const SAIDA = 'dados/navegador-saida'

// caminho real do pedaco que ja existe, mais o resto que ainda vai nascer (o real do hook)
function caminhoReal(p) {
  const resto = []
  for (let atual = p; ; atual = dirname(atual)) {
    try { return join(realpathSync.native(atual), ...resto) } catch {}
    if (dirname(atual) === atual) return p
    resto.unshift(basename(atual))
  }
}

function dentroDe(base, alvo) {
  const r = relative(base, alvo).split(sep).join('/').toLowerCase()
  return r !== '' && r !== '..' && !r.startsWith('../') && !isAbsolute(r)
}

// O caminho real da SAIDA quando ela fica dentro do projeto; null quando dados/ ou a propria SAIDA e
// juncao ou link pra fora. A regra e a do dentroDaSaida do hook barrar-mcp.mjs (um teste confere).
export function saidaNoProjeto(raiz = RAIZ) {
  const saida = caminhoReal(resolve(raiz, SAIDA))
  return dentroDe(caminhoReal(resolve(raiz)), saida) ? saida : null
}

// Aponta a pasta de download do perfil pra SAIDA do projeto, mexendo so nessa chave e na do
// "perguntar onde salvar" do Default/Preferences. So com o Chrome fechado: aberto, ele reescreve o arquivo ao fechar. Arquivo
// ilegivel fica como esta (o perfil guarda o login), e a SAIDA que sai do projeto nao se aponta. true
// quando a pasta ficou gravada.
export function apontarDownload(perfil, raiz, { log = console.log } = {}) {
  const saida = join(raiz, SAIDA)
  if (!saidaNoProjeto(raiz)) {
    log(`a pasta ${SAIDA} leva pra fora do projeto (atalho ou juncao); o arquivo que o Chrome baixar pode cair na pasta Downloads. Troque o atalho por uma pasta comum e abra o Chrome de novo`)
    return false
  }
  const pasta = join(perfil, 'Default')
  const arquivo = join(pasta, 'Preferences')
  let dados = {}
  if (existsSync(arquivo)) {
    try { dados = JSON.parse(readFileSync(arquivo, 'utf8')) } catch { dados = null }
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      log(`nao consegui ler ${arquivo}; o arquivo que o Chrome baixar pode cair na pasta Downloads, fora do projeto`)
      return false
    }
  }
  const download = dados.download && typeof dados.download === 'object' ? dados.download : {}
  // com o "perguntar onde salvar" ligado o Chrome abre o Salvar como e o robo fica esperando a pessoa
  dados.download = { ...download, default_directory: resolve(saida), prompt_for_download: false }
  mkdirSync(pasta, { recursive: true })
  mkdirSync(saida, { recursive: true })
  const tmp = arquivo + '.sabinos-tmp'
  writeFileSync(tmp, JSON.stringify(dados))
  renameSync(tmp, arquivo)
  return true
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

// Um comando do CDP no Chrome desse guid; devolve o result, ou null quando nao deu pra perguntar.
export function comandoCdp(porta, guid, method, params = {}, { timeoutMs = 3000 } = {}) {
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
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }))
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(ev.data)
        if (m.id === 1) acabar(m.result ?? null)
      } catch { acabar(null) }
    }
    ws.onerror = () => acabar(null)
  })
}

// Janela minimizada trava o clique do robo (C1c, volta 2): cada janela de aba minimizada volta pra
// normal. Quantas voltaram.
export async function desminimizar(porta, guid, { cdp = comandoCdp } = {}) {
  const alvos = (await cdp(porta, guid, 'Target.getTargets'))?.targetInfos || []
  const vistas = new Set()
  let voltaram = 0
  for (const a of alvos.filter(x => x.type === 'page')) {
    const j = await cdp(porta, guid, 'Browser.getWindowForTarget', { targetId: a.targetId })
    if (!j || vistas.has(j.windowId)) continue
    vistas.add(j.windowId)
    if (j.bounds?.windowState !== 'minimized') continue
    if (!(await cdp(porta, guid, 'Browser.setWindowBounds', { windowId: j.windowId, bounds: { windowState: 'normal' } }))) {
      throw new Error('a janela do Chrome dedicado esta minimizada e nao voltou pro tamanho normal: minimizada, o clique do robo trava. Restaure a janela e rode de novo.')
    }
    voltaram += 1
  }
  return voltaram
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

// A configuracao local do Claude Code (o claude mcp add do passo 3 do Degrau 5 grava ali), no
// lugar que o C1 da 5.30 mediu: <CLAUDE_CONFIG_DIR>/.claude.json com a variavel, senao a home.
function configDoClaude(env = process.env) {
  return join(env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json')
}

// A porta do --cdp-endpoint com que o servidor navegador desta raiz foi ligado; null quando a
// entrada nao existe, nao tem a forma do C1 ou duas chaves da mesma raiz discordam.
function portaDoServidor(raiz, config) {
  const projetos = JSON.parse(readFileSync(config, 'utf8'))?.projects
  if (!projetos || typeof projetos !== 'object') return null
  const portas = new Set()
  for (const [k, p] of Object.entries(projetos)) {
    if (chave(k) !== chave(raiz)) continue
    const args = p?.mcpServers?.navegador?.args
    if (!Array.isArray(args)) continue
    const i = args.indexOf('--cdp-endpoint')
    const u = i >= 0 && typeof args[i + 1] === 'string' ? /^http:\/\/127\.0\.0\.1:(\d+)\/?$/.exec(args[i + 1]) : null
    const n = u ? Number(u[1]) : NaN
    portas.add(n >= 1024 && n <= 65535 ? n : null)
  }
  return portas.size === 1 ? [...portas][0] : null
}

// O texto de religar mora so aqui: o log do pulo de porta do abrirChrome e os recados do hook usam ele.
export const RELIGAR = 'ligue o `navegador` de novo com a porta nova (`claude mcp remove navegador` e o passo 3 do Degrau 5) e feche e abra o Claude Code antes de usar, porque o `navegador` que já está rodando só pega a porta nova numa sessão nova'

// A anotacao da porta (5.31). O servidor navegador le o .claude.json so quando nasce: religar no meio
// da sessao troca o arquivo e nao o servidor (P1 da final da 5.30). O hook anota no SessionStart a
// porta com que o servidor nasceu, e a conferencia usa a anotada. A chave e a janela, pelo CLAUDE_PID
// que o Claude Code passa ao hook (C1 da 5.31: estavel na janela, diferente entre janelas); sem ele,
// o session_id, e o /clear herda a ultima anotacao da raiz (D21). Mora no temporario do sistema: fora
// do backup, do perfil do Chrome (que o soExistente da sonda acharia) e da pasta de saida do navegador.
export function pastaDaAnotacao() {
  return join(tmpdir(), 'sabinos-navegador')
}
const VIDA_DA_ANOTACAO_MS = 30 * 24 * 60 * 60_000
const chaveDaJanela = (janela, sessao) => (janela ? `janela:${janela}` : sessao ? `sessao:${sessao}` : null)
const portaValida = n => Number.isInteger(n) && n >= 1024 && n <= 65535
const resumo = texto => createHash('sha256').update(texto).digest('hex').slice(0, 32)
// uma pasta por raiz e um arquivo por janela: cada janela so grava o proprio arquivo, entao duas
// abrindo juntas nao apagam a anotacao uma da outra (Codex comum da 5.31)
const pastaDaRaiz = (raiz, pasta) => join(pasta, resumo(chave(raiz)))

function lerAnotacao(arquivo) {
  const a = JSON.parse(readFileSync(arquivo, 'utf8'))
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('anotacao quebrada')
  return a
}

// Pelo C1: startup anota pelo arquivo, sempre (o servidor nasceu agora). Janela ja anotada mantem
// (/compact, /clear e /resume de dentro nao fazem o servidor renascer); janela sem anotacao e o
// --resume ou --continue de processo novo, que renasce, e anota pelo arquivo. Sem o CLAUDE_PID o
// /clear chega com session_id novo e herda a porta da ultima anotacao da raiz. Sincrona, nunca joga
// erro: anotar e melhor esforco, e quem barra e a conferencia.
export function anotarSessao({ raiz, janela, sessao, origem, config = configDoClaude(), pasta = pastaDaAnotacao(), agora = Date.now() } = {}) {
  try {
    const k = chaveDaJanela(janela, sessao)
    if (!raiz || !k) return
    const dir = pastaDaRaiz(raiz, pasta)
    const nome = resumo(k) + '.json'
    // as anotacoes desta raiz que valem; a velha ou quebrada sai (o temporario de quem grava agora fica)
    const vivas = {}
    let nomes = []
    try { nomes = readdirSync(dir).filter(n => n.endsWith('.json')) } catch {}
    for (const n of nomes) {
      let a = null
      try { a = lerAnotacao(join(dir, n)) } catch {}
      if (agora - a?.em < VIDA_DA_ANOTACAO_MS) vivas[n] = a
      else try { rmSync(join(dir, n), { force: true }) } catch {}
    }
    if (origem !== 'startup' && nome in vivas) return
    // janela sem anotacao no compact ou no clear (anotacao perdida ou vencida) fica null e barra ate
    // reabrir: ler o arquivo ali reabriria o religar no meio (Codex final da 5.31)
    let porta = null
    if (['startup', 'resume', 'fork'].includes(origem)) {
      try { porta = portaDoServidor(raiz, config) } catch {}
    } else if (!janela) {
      const ultima = Object.values(vivas).sort((a, b) => b.em - a.em)[0]
      porta = portaValida(ultima?.porta) ? ultima.porta : null
    }
    mkdirSync(dir, { recursive: true })
    // grava ao lado e troca: a conferencia nunca le o arquivo pela metade
    const arquivo = join(dir, nome)
    const temp = `${arquivo}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify({ janela: janela || null, sessao: sessao || null, porta, origem: origem ?? null, em: agora }) + '\n')
    renameSync(temp, arquivo)
  } catch {}
}

function portaAnotada(raiz, janela, sessao, pasta) {
  const k = chaveDaJanela(janela, sessao)
  if (!raiz || !k) return null
  try {
    const p = lerAnotacao(join(pastaDaRaiz(raiz, pasta), resumo(k) + '.json')).porta
    return portaValida(p) ? p : null
  } catch {
    return null
  }
}

// O porteiro do perfil (5.30, D19 e D20; 5.31): o Chrome na porta em que o navegador desta janela
// nasceu e o deste projeto? Os estados do conferirPerfil, mais sem-anotacao (nada anotado desta
// janela, ou anotado null), religado (o arquivo mudou depois da anotacao), porta-mudou (servidor numa
// porta e sentinela noutra) e sem-config. Nunca joga erro e nunca devolve nada do arquivo alem da porta.
export async function conferirServidor({ raiz, janela, sessao, pasta = pastaDaAnotacao(), config = configDoClaude(), fetchFn, timeoutMs = 1500 } = {}) {
  try {
    const anotada = portaAnotada(raiz, janela, sessao, pasta)
    if (anotada === null) return { estado: 'sem-anotacao', porta: null }
    const porta = portaDoServidor(raiz, config)
    if (porta === null) return { estado: 'sem-config', porta: null }
    if (porta !== anotada) return { estado: 'religado', porta: anotada }
    const perfil = perfilDedicado(raiz)
    const s = lerSentinela(perfil)
    if (s && s.porta !== porta) return { estado: 'porta-mudou', porta }
    return { estado: (await conferirPerfil({ porta, perfil, fetchFn, timeoutMs })).estado, porta }
  } catch {
    return { estado: 'sem-config', porta: null }
  }
}

// soExistente: so usa perfil que ja existe e nunca pula de porta (a sonda agendada roda assim).
// headless: tarefa sem a pessoa na frente; o login feito com janela vale sem janela (C1c, volta 4).
// O Chrome conferido se reaproveita como esta: semJanela diz se ele abriu sem janela, e
// semPastaDeSaida, se abriu antes da pasta de download apontar pro projeto (lib de antes da 5.29).
export async function abrirChrome({ raiz = RAIZ, perfil = perfilDedicado(raiz), porta = portaDoProjeto(raiz), soExistente = false, headless = false, env = process.env, plataforma = process.platform, existe = existsSync, spawnFn = spawn, fetchFn, livre = portaLivre, perguntarPid = pidDoChrome, cdp = comandoCdp, esperarMs = 45_000, dormir, log = console.log } = {}) {
  if (soExistente && !existe(perfil)) throw Object.assign(new Error(`o perfil do Chrome dedicado nao existe (${perfil}). Perfil novo nao se cria aqui: o Mercado Livre manda perfil novo pra verificacao de conta. Abra o Chrome dedicado do projeto e entre na conta uma vez.`), { estado: 'sem-perfil' })
  const atual = await conferirPerfil({ porta, perfil, fetchFn })
  if (atual.estado === 'conferido') {
    const s = lerSentinela(perfil)
    if (headless && !s.semJanela && (await desminimizar(porta, atual.guid, { cdp })) > 0) log('a janela do Chrome dedicado estava minimizada e voltou pro tamanho normal: minimizada, o clique do robo trava')
    return { jaEstavaAberto: true, perfilConferido: true, porta, pid: null, semJanela: s.semJanela, semPastaDeSaida: !s.saida }
  }
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
  // so o perfil dedicado do projeto: perfil de fora (a sonda da bancada abre o do Raio-X) nao se mexe
  const saida = chave(perfil, plataforma) === chave(perfilDedicado(raiz), plataforma) && apontarDownload(perfil, raiz, { log })
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
  gravarSentinela(perfil, { porta: escolhida, guid, semJanela: headless, saida })
  if (escolhida !== porta) log(`a porta ${porta} estava com outro programa, entao o Chrome deste projeto passou pra porta ${escolhida}. Se o navegador da IA estava ligado na porta antiga, ${RELIGAR}.`)
  return { jaEstavaAberto: false, perfilConferido: true, porta: escolhida, pid }
}

// Fecha o Chrome deste projeto pelo CDP, so quando quem responde na porta e ele (conferido); com
// outro estado nao fecha nada e devolve o estado. Script de rotina que abriu o Chrome fecha no fim:
// ele nasce solto (detached) e sobreviveria ao script. A porta cai antes do processo, que ainda
// grava o Preferences por uns 400 ms (P1 da 5.33): so volta com o processo morto, senao quem abre
// logo em seguida perde a pasta de download.
export const FOLGA_SEM_PID_MS = 2000

export function processoVivo(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

export async function fecharChrome({ raiz = RAIZ, perfil = perfilDedicado(raiz), porta = portaDoProjeto(raiz), fetchFn, cdp = comandoCdp, perguntarPid = pidDoChrome, vivo = processoVivo, esperarMs = 15_000, passoMs = 250, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const atual = await conferirPerfil({ porta, perfil, fetchFn })
  if (atual.estado !== 'conferido') return { fechado: false, estado: atual.estado, porta }
  const pid = await perguntarPid(porta, atual.guid)
  await cdp(porta, atual.guid, 'Browser.close')
  const fim = Date.now() + esperarMs
  do {
    if (!(await guidDaPorta(porta, { fetchFn })) && !(pid && vivo(pid))) {
      // sem o numero do processo nao da pra ver ele morrer: folga de uns 5 vezes os 432 ms medidos
      if (!pid) await dormir(FOLGA_SEM_PID_MS)
      return { fechado: true, estado: 'conferido', porta }
    }
    await dormir(passoMs)
  } while (Date.now() < fim)
  throw new Error(`pedi pro Chrome dedicado fechar, mas a porta ${porta} seguiu aberta. Feche as janelas dele e rode de novo.`)
}

// As opcoes do abrir-chrome.mjs a partir do argv (sem o node e o script).
export function opcoesDeAbrir(argv) {
  const conhecidas = ['--sem-janela', '--fechar']
  const outra = argv.find(a => !conhecidas.includes(a))
  if (outra) throw new Error(`opcao desconhecida: ${outra}. Use --sem-janela (tarefa sem voce na frente) ou --fechar.`)
  if (argv.includes('--sem-janela') && argv.includes('--fechar')) throw new Error('use --sem-janela ou --fechar, um de cada vez.')
  return { headless: argv.includes('--sem-janela'), fechar: argv.includes('--fechar') }
}

// O --fechar mora so no abrir-chrome do nucleo; o do ML e o do MS nao aceitam argumento, e o Chrome
// e o mesmo (mesmo perfil e porta, pela mesma lib).
export const FECHAR_CHROME = 'node .claude/skills/conectar/scripts/abrir-chrome.mjs --fechar'

// As linhas de aviso dos tres abrir-chrome.mjs a partir do retorno do abrirChrome e do headless
// pedido. Chrome recem-aberto nao avisa nada.
export function avisosDeAbrir(r, headless = false) {
  if (!r || !r.jaEstavaAberto) return []
  const linhas = []
  // D24: com a pessoa pedindo janela, nada se fecha sozinho
  if (r.semJanela && !headless) linhas.push(`Ele esta sem janela porque um robo abriu. Se o robo estiver no meio de uma tarefa, espere ele terminar; depois rode ${FECHAR_CHROME} e abra de novo sem o --fechar.`)
  if (r.perfilConferido && r.semPastaDeSaida) linhas.push(`Esse Chrome abriu antes da pasta de download apontar pro projeto: o que ele baixar cai fora do projeto. Rode ${FECHAR_CHROME} e abra de novo.`)
  return linhas
}

// carregar traz o Playwright (a casca do pacote resolve do node_modules dela); skill so muda o texto
// das mensagens. Sempre com noDefaults (5.36): sem ele o Playwright segura o download do Chrome
// inteiro numa pasta temporaria que apaga ao desconectar (P1 da 5.33), e qualquer script ligado no
// mesmo Chrome tira o arquivo do baixarNaSaida. O noDefaults tambem desliga a emulacao de foco do
// Playwright, e a pagina que fica atras da aba de outra conexao vira hidden e o clique trava (P0 da
// 5.36): por isso o conectar liga a emulacao de foco pela propria pagina, em cada pagina do contexto
// padrao, as que ja existem e as que nascem depois, com a sessao aberta enquanto o script esta ligado.
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
  const url = `http://127.0.0.1:${porta}`
  const browser = await pw.chromium.connectOverCDP(url, { noDefaults: true })
  const ctx = browser.contexts()[0]
  const focar = pagina => ligarFoco(ctx, pagina)
  // pagina que fecha antes da sessao abrir nao derruba o script
  ctx.on('page', pagina => { focar(pagina).catch(() => {}) })
  for (const pagina of ctx.pages()) await focar(pagina).catch(e => { if (!pagina.isClosed()) throw e })
  return browser
}

// Liga a emulacao de foco numa sessao CDP da pagina e devolve a sessao, que fica aberta: e ela que
// segura a emulacao.
async function ligarFoco(ctx, pagina) {
  const s = await ctx.newCDPSession(pagina)
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  return s
}

// Script de rotina que baixa (P0 da 5.35): liga pelo conectar() e o Chrome grava
// sozinho na SAIDA que o apontarDownload apontou, com a higiene de nome e a numeracao dele (o evento
// download do Playwright nao dispara assim). Um baixador por vez no projeto (trava no perfil, a de
// processo morto sai). Desde a 5.36 (P0) o ajudante recebe a pagina da acao e le os eventos de download
// do Chrome numa sessao do navegador: so vale o download que comecou depois de a acao disparar, no
// quadro principal da pagina ou num iframe dela, e o arquivo e o filePath do completed dele. O
// download atrasado de uma chamada que estourou o prazo vem com o quadro da pagina dela e nao conta; a
// mesma pagina reaproveitada nao se distingue, entao a chamada que sai sem o fim do download dela grava o
// quadro na MARCA_VENCIDO, e pagina marcada para antes da acao, pra sempre. Conexao de fora da lib que liga no padrao do Playwright leva o download pra pasta
// temporaria dela (P0 da 5.35): ai o prazo estoura com o erro que diz isso.
export const TRAVA_DOWNLOAD = '.sabinos-baixando'
// fora do export: as cascas reexportam a lista da lib inteira
const MARCA_VENCIDO = '.sabinos-baixando-vencido'
// download pela metade: o Chrome grava primeiro um <guid>.tmp, depois o .crdownload, e so no fim troca
// pro nome do arquivo (o ponta a ponta da 5.35 pegou o .tmp, que a P0 nao viu)
const EM_ANDAMENTO = /\.crdownload$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/i

export async function baixarNaSaida(acao, { pagina, raiz = RAIZ, perfil = perfilDedicado(raiz), prazoMs = 120_000, passoMs = 250, vivo = processoVivo, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (typeof pagina?.context !== 'function') throw new Error('o baixarNaSaida precisa da pagina do Playwright em que a acao clica: baixarNaSaida(acao, { pagina }).')
  const saida = saidaNoProjeto(raiz)
  if (!saida) throw new Error(`a pasta ${SAIDA} leva pra fora do projeto (atalho ou juncao): o robo nao baixa ali. Troque o atalho por uma pasta comum e abra o Chrome de novo.`)
  const fim = Date.now() + prazoMs
  const trava = join(perfil, TRAVA_DOWNLOAD)
  // trava com dono (5.36): so quem criou apaga, e a de processo morto se rouba por rename, que so um
  // processo ganha (dois rmSync + wx juntos deixavam os dois baixarem, final do Codex da 5.35)
  const dono = randomUUID()
  const minha = JSON.stringify({ pid: process.pid, dono })
  for (;;) {
    try {
      writeFileSync(trava, minha, { flag: 'wx' })
      break
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error(`o perfil do Chrome dedicado nao existe (${perfil}). Abra o Chrome dedicado do projeto e rode de novo.`)
      if (e.code !== 'EEXIST') throw e
      let lida = null
      try { lida = readFileSync(trava, 'utf8') } catch {}
      const pid = pidDaTrava(lida)
      const roubada = `${trava}.velha-${dono}`
      let roubou = false
      // ENOENT: outro roubou antes, e a volta tenta o wx; outro erro (arquivo preso no Windows) espera
      if (pid && !(await vivo(pid))) try { renameSync(trava, roubada); roubou = true } catch (e) { if (e.code === 'ENOENT') continue }
      if (roubou) {
        let conteudo = null
        try { conteudo = readFileSync(roubada, 'utf8') } catch {}
        // outro trocou a do morto por uma viva entre a leitura e o rename: ela volta pro lugar; se um
        // terceiro ja criou outra no meio, a roubada sai e esta chamada segue esperando
        if (conteudo !== lida) try { linkSync(roubada, trava) } catch {}
        try { rmSync(roubada, { force: true }) } catch {}
        continue
      }
      if (Date.now() >= fim) throw new Error('outro robo do projeto esta baixando um arquivo e nao terminou a tempo: espere ele acabar e rode de novo.')
      await dormir(passoMs)
    }
  }
  // eventos da sessao do navegador: o comeco de cada download depois da acao (desta pagina ou de outra) e o
  // fim (completed ou canceled) de cada guid
  let sessao = null
  let quadro = null
  let disparou = false
  const nossos = []
  const deOutro = []
  const acabados = new Map()
  try {
    mkdirSync(saida, { recursive: true })
    // download pela metade de uma chamada que estourou o prazo terminaria no meio desta e passaria por
    // arquivo dela (Codex comum da 5.35): a acao so dispara com a pasta sem nenhum
    for (;;) {
      const metade = readdirSync(saida).filter(n => EM_ANDAMENTO.test(n))
      if (!metade.length) break
      if (Date.now() >= fim) throw new Error(`ha download pela metade em ${SAIDA} (${metade.join(', ')}): espere ele acabar; se o Chrome nao esta baixando nada, apague esse arquivo e rode de novo.`)
      await dormir(passoMs)
    }
    // a emulacao de foco tambem aqui: a pagina recem-aberta pode chegar antes da sessao de foco que o
    // conectar abre pelo evento page. A sessao de pagina com navegacao pendente so abre quando a
    // resposta chega (ponta a ponta da 5.36): ela espera so ate o prazo
    const ctx = pagina.context()
    const abrir = ligarFoco(ctx, pagina).then(s => s.send('Page.getFrameTree'))
    abrir.catch(() => {})
    let relogio
    const estouro = new Promise((_, nao) => { relogio = setTimeout(() => nao(new Error(`a pagina nao respondeu em ${Math.ceil(prazoMs / 1000)} segundos (ainda carregando?): abra uma pagina nova (newPage) e rode de novo.`)), Math.max(0, fim - Date.now())) })
    let frameTree
    try { ({ frameTree } = await Promise.race([abrir, estouro])) } finally { clearTimeout(relogio) }
    quadro = frameTree.frame.id
    // o download de um iframe da pagina tambem e dela (Codex comum); a marca fica no quadro principal
    const daPagina = new Set()
    const juntar = no => { daPagina.add(no.frame.id); for (const f of no.childFrames || []) juntar(f) }
    juntar(frameTree)
    const marcas = lerMarcas(perfil)
    if (marcas === null) throw new Error(`a marca ${join(perfil, MARCA_VENCIDO)} esta ilegivel: confira ${SAIDA}, apague a marca e rode de novo.`)
    if (marcas.includes(quadro)) throw new Error(`um download desta pagina estourou o prazo e ainda pode chegar, e chegaria como desta acao: abra uma pagina nova (newPage) e rode a acao nela.`)
    sessao = await ctx.browser().newBrowserCDPSession()
    sessao.on('Browser.downloadWillBegin', e => {
      // o que comecou antes de a acao disparar nao e dela
      if (!disparou) return
      if (daPagina.has(e.frameId)) nossos.push(e)
      else deOutro.push(e)
    })
    sessao.on('Browser.downloadProgress', e => { if (e.state === 'completed' || e.state === 'canceled') acabados.set(e.guid, e) })
    await sessao.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true })
    disparou = true
    await acao()
    do {
      if (nossos.length > 1) throw new Error(`a acao comecou ${nossos.length} downloads (${nossos.map(e => e.suggestedFilename).join(', ')}): o robo nao sabe qual e o certo e para aqui.`)
      const fimDoNosso = nossos.length ? acabados.get(nossos[0].guid) : null
      if (fimDoNosso?.state === 'canceled') throw new Error(`o Chrome cancelou o download de ${nossos[0].suggestedFilename}: rode de novo.`)
      if (fimDoNosso) {
        const arquivo = fimDoNosso.filePath ? caminhoReal(resolve(fimDoNosso.filePath)) : null
        if (!arquivo || chave(dirname(arquivo)) !== chave(saida) || !existsSync(arquivo)) throw new Error(`o Chrome terminou o download de ${nossos[0].suggestedFilename}, mas o arquivo nao esta em ${SAIDA} (${fimDoNosso.filePath || 'sem caminho'}): feche o Chrome dedicado e abra de novo, pra pasta de download apontar pro projeto.`)
        return arquivo
      }
      await dormir(passoMs)
    } while (Date.now() < fim)
    const outros = deOutro.length ? ` O download que chegou (${deOutro.map(e => e.suggestedFilename).join(', ')}) veio de outra pagina e nao conta como desta acao.` : ''
    throw new Error(`o arquivo nao apareceu em ${SAIDA} em ${Math.ceil(prazoMs / 1000)} segundos.${outros} Se uma conexao de fora da lib, ligada no padrao do Playwright, estava no mesmo Chrome, o download pode ter ido pra pasta temporaria dela: rode de novo sem ela.`)
  } finally {
    if (sessao) {
      // a chamada que sai sem o fim do download dela marca o quadro
      const pendente = disparou && (!nossos.length || nossos.some(e => !acabados.has(e.guid)))
      if (pendente) {
        // as paginas abertas no Chrome (o targetId da pagina e o frameId do quadro principal, conferido no
        // ponta a ponta); sem a lista, nada se poda
        let abertas = null
        try { abertas = new Set((await sessao.send('Target.getTargets')).targetInfos.filter(t => t.type === 'page').map(t => t.targetId)) } catch {}
        try { marcarQuadro(perfil, quadro, abertas) } catch {}
      }
      try { await sessao.detach() } catch {}
    }
    try { if (JSON.parse(readFileSync(trava, 'utf8')).dono === dono) rmSync(trava, { force: true }) } catch {}
  }
}

// Os quadros marcados pelo download vencido: [] sem marca, null com a marca ilegivel.
function lerMarcas(perfil) {
  let texto
  try { texto = readFileSync(join(perfil, MARCA_VENCIDO), 'utf8') } catch (e) { return e.code === 'ENOENT' ? [] : null }
  try {
    const m = JSON.parse(texto)
    return Array.isArray(m) && m.every(q => typeof q === 'string') ? m : null
  } catch { return null }
}

// A marca nunca sai sozinha (decisao do controlador sobre o achado 1 da comum da 5.36: a chamada
// vencida pode ter deixado mais de um download atrasado). O frameId nao se repete entre paginas: ao
// gravar, sai so a marca de quadro que nao e mais uma pagina aberta no Chrome (abertas, do
// Target.getTargets); sem a lista (null), nada sai (final do Codex: a poda por numero soltava pagina aberta).
function marcarQuadro(perfil, quadro, abertas) {
  const antes = lerMarcas(perfil)
  if (antes === null) return
  const depois = antes.filter(q => q !== quadro && (abertas === null || abertas.has(q))).concat([quadro])
  writeFileSync(join(perfil, MARCA_VENCIDO), JSON.stringify(depois) + '\n')
}

// O pid de quem segura a trava: JSON { pid, dono } ou, de kit anterior, so o pid. Vazia ou ilegivel
// devolve null e conta como viva.
function pidDaTrava(texto) {
  if (typeof texto !== 'string') return null
  let pid = NaN
  const t = texto.trim()
  if (/^\d+$/.test(t)) pid = Number(t)
  else try { pid = JSON.parse(t).pid } catch {}
  return Number.isInteger(pid) && pid > 0 ? pid : null
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

// Relogin automatico (5.29, D15): so na conta com <CONTA>_USUARIO, <CONTA>_SENHA e <CONTA>_TOTP no
// .env. A receita e dado, por site: { conta, host, entrada?, sessao?, captcha?, passos }, com cada
// passo { campo: 'usuario' | 'senha' | 'codigo', seletor } ou { clicar: seletor }. conta amarra as
// variaveis ao site (a senha do ML nunca vai pra outro site); sessao e captcha sao regex da url, pro
// site fora da TABELA. Receita so entra no receitas-login.json com prova ao vivo.
const CAMPOS = { usuario: 'USUARIO', senha: 'SENHA', codigo: 'TOTP' }
// janela em que uma nova queda, depois de um relogin, para em vez de tentar de novo
export const JANELA_RELOGIN_MS = 10 * 60_000
export const MARCA_RELOGIN = '.sabinos-relogin.json'

// valor so vai pra pagina no host da receita, por https (ou http no proprio computador, como o
// navegador trata o localhost)
function noSite(url, host) {
  let u = null
  try { u = new URL(url) } catch { return false }
  const h = u.hostname.toLowerCase()
  const seguro = u.protocol === 'https:' || (u.protocol === 'http:' && (h === '127.0.0.1' || h === 'localhost'))
  return seguro && (h === host.toLowerCase() || h.endsWith('.' + host.toLowerCase()))
}

// A tentativa de cada conta fica marcada no perfil do Chrome dedicado (que nunca vai pro backup):
// cada chamada do relogar.mjs e um processo novo, e a memoria do processo nao segura a segunda queda.
export function tentouHaPouco({ perfil, conta, agora = Date.now(), janelaMs = JANELA_RELOGIN_MS } = {}) {
  try {
    const t = JSON.parse(readFileSync(join(perfil, MARCA_RELOGIN), 'utf8'))?.[conta]
    return Number.isFinite(t) && agora - t >= 0 && agora - t < janelaMs
  } catch {
    return false
  }
}

export function marcarTentativa({ perfil, conta, agora = Date.now() } = {}) {
  let marcas = {}
  try { marcas = JSON.parse(readFileSync(join(perfil, MARCA_RELOGIN), 'utf8')) || {} } catch {}
  writeFileSync(join(perfil, MARCA_RELOGIN), JSON.stringify({ ...marcas, [conta]: agora }) + '\n')
}

// Um relogin por conta de cada vez: dois disparos juntos passariam os dois pela marca acima antes de
// qualquer um gravar. A trava nasce exclusiva (wx) no perfil e a de um processo que morreu sai depois
// da janela. Devolve a funcao que solta, ou null quando outro processo esta no meio; sem perfil nao
// ha o que proteger (o abrirChrome com soExistente para logo depois).
export const TRAVA_RELOGIN = '.sabinos-relogin-trava-'
export function travarRelogin({ perfil, conta, agora = Date.now(), janelaMs = JANELA_RELOGIN_MS } = {}) {
  const f = join(perfil, TRAVA_RELOGIN + conta)
  for (let i = 0; i < 2; i++) {
    try {
      writeFileSync(f, String(agora), { flag: 'wx' })
      return () => { try { rmSync(f, { force: true }) } catch {} }
    } catch (e) {
      if (e.code === 'ENOENT') return () => {}
      if (e.code !== 'EEXIST') throw e
      let texto = ''
      try { texto = readFileSync(f, 'utf8').trim() } catch {}
      const t = texto ? Number(texto) : NaN
      if (Number.isFinite(t)) {
        if (agora - t >= 0 && agora - t < janelaMs) return null
      } else {
        // vazia ou ilegivel: o outro processo acabou de criar e ainda nao escreveu a hora, salvo
        // se o arquivo e mais velho que a janela pelo relogio do disco
        let m = NaN
        try { m = statSync(f).mtimeMs } catch {}
        if (!(Date.now() - m >= janelaMs)) return null
      }
      try { rmSync(f, { force: true }) } catch {}
    }
  }
  return null
}

export function desmarcarTentativa({ perfil, conta } = {}) {
  let marcas = {}
  try { marcas = JSON.parse(readFileSync(join(perfil, MARCA_RELOGIN), 'utf8')) || {} } catch { return }
  delete marcas[conta]
  writeFileSync(join(perfil, MARCA_RELOGIN), JSON.stringify(marcas) + '\n')
}

function regexValida(texto) {
  try { new RegExp(texto, 'i'); return true } catch { return false }
}

// null quando a receita serve; senao o motivo, sem dado de conta nenhum
export function receitaValida(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'a receita tem de ser um objeto'
  if (typeof r.conta !== 'string' || !CONTA.test(r.conta)) return 'conta da receita invalida (em maiuscula, como ML)'
  if (typeof r.host !== 'string' || !/^[a-z0-9.-]+$/i.test(r.host)) return 'host da receita invalido'
  if (r.entrada !== undefined) {
    let u = null
    try { u = new URL(r.entrada) } catch {}
    const h = u?.hostname.toLowerCase()
    if (!u || u.protocol !== 'https:' || !(h === r.host.toLowerCase() || h.endsWith('.' + r.host.toLowerCase()))) return 'entrada tem de ser https no host da receita'
  }
  for (const k of ['sessao', 'captcha']) if (r[k] !== undefined && (typeof r[k] !== 'string' || !regexValida(r[k]))) return `${k} da receita nao e regex valida`
  if (!Array.isArray(r.passos) || r.passos.length === 0) return 'a receita precisa de passos'
  for (const p of r.passos) {
    if (p && typeof p.clicar === 'string' && p.clicar) continue
    if (!p || !(p.campo in CAMPOS)) return 'passo com campo fora de usuario, senha e codigo'
    if (typeof p.seletor !== 'string' || !p.seletor) return 'passo de campo sem seletor'
  }
  return null
}

// sessao-caida, captcha ou null pra url, pela TABELA e pelo sessao e captcha da receita
export function estadoDaUrl(url, receita) {
  const daTabela = sessaoCaiu({ url, host: receita.host })
  if (daTabela || typeof url !== 'string') return daTabela
  if (receita.captcha && new RegExp(receita.captcha, 'i').test(url)) return 'captcha'
  if (receita.sessao && new RegExp(receita.sessao, 'i').test(url)) return 'sessao-caida'
  return null
}

// codigo que roda na pagina: clica no seletor (ja em JSON) so se a pagina esta no host por https
// (ou http no proprio computador), a mesma regra do noSite; devolve se clicou
export function expressaoClique(seletorJson, host) {
  const h = JSON.stringify(host.toLowerCase())
  return `(() => { const u = new URL(location.href); const h = u.hostname.toLowerCase();
    const seguro = u.protocol === 'https:' || (u.protocol === 'http:' && (h === '127.0.0.1' || h === 'localhost'));
    if (!seguro || !(h === ${h} || h.endsWith('.' + ${h}))) return false;
    document.querySelector(${seletorJson}).click(); return true })()`
}

// origem e caminho, sem query nem ancora, pra comparar onde a aba esta
function semQuery(u) {
  try { const x = new URL(u); return x.origin + x.pathname } catch { return String(u) }
}

// a url no meio de uma navegacao pode nao responder: null e "ainda carregando"
async function lerUrl(pagina) {
  try { return await pagina.url() } catch { return null }
}

// contas que ja tentaram relogar neste disparo (processo): a segunda queda para e avisa, pra nao
// travar a conta por tentativa repetida. Entre processos, quem chama passa o aoTentar (o
// relogar.mjs grava a marcarTentativa) e confere o tentouHaPouco antes. Captcha no meio devolve a
// tentativa (aoDesistir): a pessoa resolve na janela e roda de novo, como o aviso manda.
const TENTADAS = new Set()

// Devolve { resultado, motivo }: relogou, sem-receita, falta-variavel, captcha ou falhou. O valor
// vai pro campo pelo fill da pagina (o do Playwright, ou o da abaDoSite pelo CDP) e nunca entra no
// log, no motivo nem em argumento de linha de comando.
export async function relogar({ pagina, conta, receita, env, tentadas = TENTADAS, aoTentar = () => {}, aoDesistir = () => {}, gerarCodigo = codigoTotp, agora = Date.now, esperarMs = 30_000, passoMs = 500, assentarMs = 2000, dormir = ms => new Promise(r => setTimeout(r, ms)), log = () => {} } = {}) {
  if (!receita) return { resultado: 'sem-receita', motivo: 'nenhuma receita de login testada pra esse site' }
  if (receita.conta !== conta) return { resultado: 'falhou', motivo: `a receita e da conta ${receita.conta}, nao de ${conta}: a senha de uma conta nunca vai pro site de outra` }
  const valor = campo => (env instanceof Map ? env.get(`${conta}_${CAMPOS[campo]}`) : env?.[`${conta}_${CAMPOS[campo]}`]) || ''
  const faltam = Object.keys(CAMPOS).filter(c => !valor(c)).map(c => `${conta}_${CAMPOS[c]}`)
  if (faltam.length) return { resultado: 'falta-variavel', motivo: `falta no .env: ${faltam.join(', ')}` }
  const voltas = Math.max(1, Math.ceil(esperarMs / passoMs))
  let url = null
  for (let i = 0; i < voltas && url === null; i++) if ((url = await lerUrl(pagina)) === null) await dormir(passoMs)
  const avisoCaptcha = `o site ${receita.host} pediu verificacao (captcha): resolva na janela do Chrome dedicado e rode de novo`
  const inicio = estadoDaUrl(url, receita)
  if (inicio === 'captcha') return { resultado: 'captcha', motivo: avisoCaptcha }
  if (inicio !== 'sessao-caida') return { resultado: 'falhou', motivo: 'a pagina nao esta no login do site, entao nao ha o que relogar' }
  if (!noSite(url, receita.host)) return { resultado: 'falhou', motivo: `a pagina de login nao esta em ${receita.host} por https: o robo para sem preencher` }
  if (tentadas.has(conta)) return { resultado: 'falhou', motivo: `a sessao de ${conta} caiu de novo depois do relogin neste disparo: o robo para aqui. Entre na conta pela janela do Chrome dedicado` }
  tentadas.add(conta)
  aoTentar()
  const captcha = () => {
    tentadas.delete(conta)
    aoDesistir()
    return { resultado: 'captcha', motivo: avisoCaptcha }
  }
  const urlDaHora = async () => {
    let u = null
    for (let i = 0; i < voltas && u === null; i++) if ((u = await lerUrl(pagina)) === null) await dormir(passoMs)
    return u
  }
  let ultima = url
  // a receita comeca do primeiro passo: aba parada no meio do login (a senha, depois de um captcha
  // resolvido) volta pra entrada antes, senao o campo do usuario nao existe ali
  if (receita.entrada && semQuery(url) !== semQuery(receita.entrada)) {
    try { await (pagina.ir ? pagina.ir(receita.entrada) : pagina.goto(receita.entrada)) } catch {
      return { resultado: 'falhou', motivo: `a aba esta no meio do login e nao deu pra voltar pra ${semQuery(receita.entrada)}` }
    }
    await dormir(assentarMs)
    ultima = await urlDaHora()
  }
  for (const p of receita.passos) {
    let u = await urlDaHora()
    // a pagina acabou de mudar: espera ela ligar os botoes antes do passo (no ML, o clique logo
    // depois da navegacao se perdia; prova ao vivo da 5.29). Depois de todo clique tambem, porque
    // a url pode ainda nao ter mudado quando o passo seguinte olha. A conferencia abaixo usa a url
    // de depois da espera
    if (u !== ultima) {
      await dormir(assentarMs)
      u = await urlDaHora()
      ultima = u
    }
    if (estadoDaUrl(u, receita) === 'captcha') return captcha()
    const alvo = p.clicar ?? p.seletor
    // clique tambem: botao de outro site nao se aperta
    if (!noSite(u, receita.host)) return { resultado: 'falhou', motivo: `a pagina saiu de ${receita.host} (ou de https) antes de ${p.clicar ? `clicar em ${p.clicar}` : `preencher ${p.campo}`}: o robo para aqui` }
    try {
      if (p.clicar) await pagina.click(p.clicar)
      else {
        log(`relogin de ${conta}: preenchendo ${p.campo}`)
        await pagina.fill(p.seletor, p.campo === 'codigo' ? gerarCodigo(valor('codigo'), agora()) : valor(p.campo))
      }
    } catch {
      // a mensagem do erro fica de fora: pode citar o valor que ia pro campo
      return { resultado: 'falhou', motivo: `nao deu pra usar ${alvo} na pagina de login (a pagina mudou?)` }
    }
    if (p.clicar) await dormir(assentarMs)
  }
  for (let i = 0; i < voltas; i++) {
    const u = await lerUrl(pagina)
    const e = u === null ? 'carregando' : estadoDaUrl(u, receita)
    if (e === 'captcha') return captcha()
    // fora do login e fora do site nao conta como entrou: pode ser a pagina de outro site
    if (e === null && !noSite(u, receita.host)) return { resultado: 'falhou', motivo: `depois dos passos a pagina saiu de ${receita.host}: o login nao se confirmou` }
    if (e === null) {
      log(`relogin de ${conta}: entrou`)
      return { resultado: 'relogou', motivo: null }
    }
    await dormir(passoMs)
  }
  return { resultado: 'falhou', motivo: 'a pagina continuou no login depois dos passos da receita' }
}

// A aba do site no Chrome dedicado, falada pelo CDP direto (o nucleo nao tem Playwright), com o
// mesmo url, fill e click que o relogar usa. O valor vai pro campo pelo Input.insertText: nunca
// entra no codigo que roda na pagina. abrir e a url de uma aba nova quando nenhuma esta no site.
// Com mais de uma aba do site, vai na frente a que o naFrente(url) aceita (a que esta no login), e
// o log avisa da sobra. null quando a porta nao responde ou nao ha aba do site.
export async function abaDoSite({ porta, hosts, abrir = null, naFrente = () => false, log = () => {}, fetchFn = fetch, timeoutMs = 15_000, passoMs = 250, dormir = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const base = `http://127.0.0.1:${porta}`
  const doSite = u => {
    let h = ''
    try { h = new URL(u).hostname.toLowerCase() } catch {}
    return hosts.find(x => h === x.toLowerCase() || h.endsWith('.' + x.toLowerCase())) || null
  }
  let aba = null
  try {
    const r = await fetchFn(`${base}/json/list`, { signal: AbortSignal.timeout(3000) })
    const doSiteTodas = (await r.json()).filter(a => a.type === 'page' && doSite(a.url))
    const ordem = [...doSiteTodas.filter(a => naFrente(a.url)), ...doSiteTodas.filter(a => !naFrente(a.url))]
    aba = ordem[0] || null
    // so origem e caminho no aviso: a query pode levar token
    const semQuery = u => { try { const x = new URL(u); return x.origin + x.pathname } catch { return '?' } }
    if (ordem.length > 1) log(`${ordem.length} abas do site abertas; usando ${semQuery(aba.url)} e deixando ${ordem.slice(1).map(a => semQuery(a.url)).join(', ')}`)
    if (!aba && abrir) aba = await (await fetchFn(`${base}/json/new?${encodeURI(abrir)}`, { method: 'PUT', signal: AbortSignal.timeout(3000) })).json()
  } catch {
    return null
  }
  if (!aba?.webSocketDebuggerUrl) return null
  const host = doSite(aba.url) || doSite(abrir)
  const ws = new WebSocket(aba.webSocketDebuggerUrl)
  const pendentes = new Map()
  let id = 0
  // cada comando tem prazo: Chrome travado nao deixa o script esperando pra sempre
  const enviar = (method, params) => new Promise((ok, falha) => {
    const n = ++id
    const prazo = setTimeout(() => { pendentes.delete(n); falha(new Error('o Chrome nao respondeu a tempo')) }, timeoutMs)
    pendentes.set(n, { ok: v => { clearTimeout(prazo); ok(v) }, falha: e => { clearTimeout(prazo); falha(e) } })
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  ws.onmessage = ev => {
    let m = null
    try { m = JSON.parse(ev.data) } catch { return }
    const p = pendentes.get(m.id)
    if (!p) return
    pendentes.delete(m.id)
    if (m.error) p.falha(new Error('o Chrome recusou o comando'))
    else p.ok(m.result)
  }
  ws.onclose = () => { for (const p of pendentes.values()) p.falha(new Error('a aba fechou')); pendentes.clear() }
  // a conexao tambem tem prazo: servidor que aceita e nao responde o handshake nao prende o relogin
  const aberta = await new Promise(ok => {
    const prazo = setTimeout(() => ok(false), timeoutMs)
    ws.onopen = () => { clearTimeout(prazo); ok(true) }
    ws.onerror = () => { clearTimeout(prazo); ok(false) }
  })
  if (!aberta) {
    try { ws.close() } catch {}
    return null
  }
  const avaliar = async expressao => (await enviar('Runtime.evaluate', { expression: expressao, returnByValue: true }))?.result?.value
  const voltas = Math.max(1, Math.ceil(timeoutMs / passoMs))
  // espera o seletor aparecer (a pagina pode estar no meio de uma navegacao)
  async function achar(seletor) {
    const s = JSON.stringify(seletor)
    for (let i = 0; i < voltas; i++) {
      try { if (await avaliar(`!!document.querySelector(${s})`)) return s } catch {}
      await dormir(passoMs)
    }
    throw new Error(`nao achei ${seletor}`)
  }
  return {
    host,
    // aba nova nasce em about:blank ja carregada: conta como carregando ate o site abrir
    url: () => avaliar('document.readyState === "complete" && location.href !== "about:blank" ? location.href : null'),
    fill: async (seletor, valor) => {
      const s = await achar(seletor)
      // o foco devolve a url da hora: navegou pra outro site no meio, o valor nao sai
      const onde = await avaliar(`(() => { const e = document.querySelector(${s}); e.focus(); if (typeof e.select === 'function') e.select(); return location.href })()`)
      if (!host || !noSite(onde, host)) throw new Error('a pagina saiu do site da receita')
      await enviar('Input.insertText', { text: String(valor) })
    },
    click: async seletor => {
      const s = await achar(seletor)
      // o endereco se confere na mesma volta do clique: navegou pra outro site na espera, nao clica
      if (!host || !(await avaliar(expressaoClique(s, host)))) throw new Error('a pagina saiu do site da receita')
    },
    ir: async destino => { await enviar('Page.navigate', { url: destino }) },
    fechar: () => { try { ws.close() } catch {} },
  }
}
