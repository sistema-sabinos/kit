// Print de pagina real pra inserção por cima da fala (passo 4A, referencias/insercoes.md): abre a pagina no Chrome
// em tela de celular (390 px com escala 2,77, o print sai 1080 por 1920), marca a frase dita em marca-texto e grava o
// print com a frase no meio da tela. A frase marcada e a prova: o espectador le o que a pessoa acabou de dizer.
// Usa o Playwright do /gerar-imagens (ou o do Mercado Livre e o da midia social), sem baixar navegador.
//
// Tenta em degraus, e sobe quando o site barra (status 400 ou mais, sem resposta ou conexao cortada), quando a pagina nao assenta no
// prazo, quando a pagina veio em branco (respondeu sem texto na tela), quando o degrau logado nao esta disponivel ou
// quando o nome ou o email do aluno aparecem na tela:
//   1. sem-janela: Chrome sem janela, com identidade de celular (sem a palavra Headless);
//   2. logado: o Chrome dedicado do projeto, ja aberto e com a sessao do site, so com ALUNO_NOME, ALUNO_EMAIL ou um
//      *_USUARIO com email no .env (pra procurar o nome na tela); o cabecalho sai borrado. Nunca no Mercado Livre;
//   3. com-janela: Chrome com janela, perfil limpo;
//   4. nenhum deu: saida 2, peca o print ao aluno.
// O print so se grava no fim: degrau que falhou nao deixa arquivo. Nada do .env aparece na saida.
//
// uso: node print-pagina.mjs <url ou arquivo.html> <saida.png> [--marcar "frase da pagina"]
// Saida: 0 gravou (a linha diz o degrau), 1 nao abriu a pagina ou nao achou a frase, 2 o site barrou todos os degraus
// (ou a pagina veio em branco em todos).
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { abrirNavegador, acharPlaywright, opcoesDaFoto } from '../../gerar-imagens/scripts/lib/render.mjs'
import { conectar, paginaPedeLogin } from '../../conectar/scripts/lib/navegador.mjs'
import { lerEnv } from '../../conectar/scripts/lib/env.mjs'

export const TELA = { width: 390, height: 693 }, ESCALA = 2.77
// teto da espera pela pagina assentar (networkidle): estourou, sobe de degrau
export const PRAZO_MS = 45000

// Identidade de celular a partir da versao do Chrome aberto (navegador.version()): user agent e Sec-CH-UA de Android,
// sem "Headless". So o numero maior da versao entra, como o Chrome de verdade manda.
export function identidadeCelular(versao) {
  const maior = String(versao).match(/\d+/)?.[0]
  if (!maior) throw new Error(`versao do Chrome ilegivel: ${versao}`)
  return {
    userAgent: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${maior}.0.0.0 Mobile Safari/537.36`,
    userAgentMetadata: {
      brands: [{ brand: 'Google Chrome', version: maior }, { brand: 'Chromium', version: maior }, { brand: 'Not_A Brand', version: '24' }],
      platform: 'Android', platformVersion: '10.0.0', architecture: '', model: 'K', mobile: true,
    },
  }
}

// Resposta do goto: status 400 ou mais barra; sem resposta barra em http e passa em file: (pagina local). Medido no
// Playwright 1.63 com o Chrome 157 (2026-11-11): file: responde 200, entao o null em file: e so folga.
export function conferirResposta(resp, url) {
  if (resp == null) return { barrado: !/^file:/i.test(String(url)), status: null }
  const status = resp.status()
  return { barrado: status >= 400, status }
}

// Pagina que responde normal mas chega sem texto na tela (o site devolve o esqueleto e nao monta o conteudo pro
// navegador automatico) conta como barrada: menos de PISO_LETRAS letras no texto visivel e pagina em branco.
export const PISO_LETRAS = 20
export const paginaVazia = (texto) => (String(texto ?? '').match(/\p{L}/gu) || []).length < PISO_LETRAS

// o texto que aparece na tela (o innerText ja deixa de fora o escondido). Roda dentro da pagina.
function textoVisivel() { return document.body ? document.body.innerText : '' }

// sem acento, minusculo, espaco unico: "JOÃO" casa com "joao"
export const normalizar = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// O que nao pode aparecer no print do degrau logado: ALUNO_NOME (inteiro e cada palavra de 3 letras ou mais),
// ALUNO_EMAIL e todo *_USUARIO que e email (inteiro e a parte antes do @). Normalizado. Nunca se imprime.
export function agulhasDoAluno(env = {}) {
  const achadas = new Set()
  const por = (v) => { const n = normalizar(v); if (n.length >= 3) achadas.add(n) }
  if (env.ALUNO_NOME) { por(env.ALUNO_NOME); for (const p of normalizar(env.ALUNO_NOME).split(' ')) por(p) }
  const emails = [env.ALUNO_EMAIL, ...Object.keys(env).filter((k) => /_USUARIO$/.test(k)).map((k) => env[k])]
    .filter((v) => EMAIL.test(String(v || '').trim()))
  for (const e of emails) { por(e); por(String(e).trim().split('@')[0]) }
  return [...achadas]
}

// Mercado Livre e Mercado Libre, de qualquer pais (.com.br, .cl, .co.cr, .com.ar ...)
export const MERCADO_LIVRE = /(^|\.)mercado(livre|libre)(\.[a-z]{2,3}){1,2}$/i

// A escada do site. O logado so entra com agulha (sem ela nao da pra conferir que o print saiu sem o nome do aluno)
// e nunca no Mercado Livre (sem a conta do aluno no meio).
export function degrausDe({ host = '', temAgulhas = false } = {}) {
  return temAgulhas && !MERCADO_LIVRE.test(host) ? ['sem-janela', 'logado', 'com-janela'] : ['sem-janela', 'com-janela']
}

// Acha a frase no texto da pagina (sem diferenca de maiuscula e de espaco), mesmo atravessando negrito ou link,
// embrulha cada pedaco num <mark> e centraliza. Roda dentro da pagina: so pode usar o que o navegador tem.
function marcarNaPagina(frase) {
  const minusculo = (s) => {
    let limpo = ''
    for (const c of s) { if (/\s/.test(c)) { if (!limpo.endsWith(' ')) limpo += ' ' } else limpo += c.toLowerCase() }
    return limpo
  }
  const alvo = minusculo(frase.trim())
  if (!alvo) return null
  // o texto da pagina todo, limpo (espaco repetido vira um, tudo minusculo), com o no e a posicao de cada letra
  let limpo = ''
  const onde = []
  // so texto que aparece: o escondido (hidden, display none, visibility hidden) daria marca fora do print
  const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode.nodeName)
      || !n.parentElement.checkVisibility({ visibilityProperty: true }) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let no = andar.nextNode(); no; no = andar.nextNode()) {
    const s = no.nodeValue
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i])) { if (limpo.endsWith(' ')) continue; limpo += ' ' } else limpo += s[i].toLowerCase()
      onde.push([no, i])
    }
  }
  const k = limpo.indexOf(alvo)
  if (k < 0) return null
  // um pedaco por no de texto, do ultimo pro primeiro, pra marcar um nao mexer na posicao do outro
  const pedacos = []
  for (let j = k; j < k + alvo.length; j++) {
    const [no, i] = onde[j]
    const p = pedacos[pedacos.length - 1]
    if (p && p.no === no) p.fim = i + 1; else pedacos.push({ no, ini: i, fim: i + 1 })
  }
  const marcas = []
  for (const p of pedacos.reverse()) {
    const r = document.createRange()
    r.setStart(p.no, p.ini); r.setEnd(p.no, p.fim)
    const mark = document.createElement('mark')
    mark.style.cssText = 'background:#ffe600;color:inherit;padding:0 2px'
    r.surroundContents(mark)
    marcas.unshift(mark)
  }
  marcas[0].scrollIntoView({ block: 'center' })
  const topo = marcas[0].getBoundingClientRect().top, pe = marcas[marcas.length - 1].getBoundingClientRect().bottom
  return (topo + pe) / 2 / window.innerHeight
}

// Esconde o aviso de cookie e de consentimento: caixa fixa na tela que fala de cookie cobre metade do print.
// Devolve quantos escondeu. Roda dentro da pagina.
function esconderAvisos() {
  let n = 0
  for (const el of document.querySelectorAll('body *')) {
    const pos = getComputedStyle(el).position
    if ((pos === 'fixed' || pos === 'sticky') && /cookie|consent|privacidade|lgpd/i.test(el.textContent || '')
      && el.getBoundingClientRect().height < window.innerHeight * 0.9) { el.style.setProperty('display', 'none', 'important'); n++ }
  }
  return n
}

// Degrau logado: borra o cabecalho (header, banner, nav e caixa fixa no topo da tela), onde o site mostra o nome de
// quem entrou, e marca o borrado. Devolve quantos borrou. Roda dentro da pagina.
export function borrarCabecalho() {
  let n = 0
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[data-sabinos-borrado]')) continue
    const pos = getComputedStyle(el).position
    const fixoNoTopo = (pos === 'fixed' || pos === 'sticky') && el.getBoundingClientRect().top < window.innerHeight * 0.15
    if (!fixoNoTopo && !el.matches('header, [role=banner], nav')) continue
    el.style.setProperty('filter', 'blur(14px)', 'important')
    el.setAttribute('data-sabinos-borrado', '')
    n++
  }
  return n
}

// Degrau logado: true quando alguma agulha aparece na tela que vira print, fora do borrado: texto visivel, value de
// campo, alt, title, aria-label e placeholder. Devolve so true ou false, nunca o trecho. Roda dentro da pagina.
export function temDadoPessoal(agulhas) {
  const norm = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ')
  const naTela = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
  // o borrado vale atravessando o Shadow DOM: sobe pelo host de cada raiz de sombra
  const borrado = (el) => { for (let e = el; e; e = e.parentNode && e.parentNode.host ? e.parentNode.host : e.parentElement) if (e.closest('[data-sabinos-borrado]')) return true; return false }
  const fora = (el) => borrado(el) || !el.checkVisibility({ visibilityProperty: true })
  // o documento e cada Shadow DOM aberto (componente da pagina): o nome dentro dele tambem sai no print
  const raizes = [document.body]
  for (let i = 0; i < raizes.length; i++) for (const el of raizes[i].querySelectorAll('*')) if (el.shadowRoot) raizes.push(el.shadowRoot)
  let texto = ''
  for (const raiz of raizes) {
    const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
    for (let no = andar.nextNode(); no; no = andar.nextNode()) {
      const pai = no.parentElement || (no.parentNode && no.parentNode.host) // texto solto na raiz da sombra: o host
      if (!pai || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(pai.nodeName) || fora(pai)) continue
      const r = document.createRange()
      r.selectNodeContents(no)
      if ([...r.getClientRects()].some(naTela)) texto += no.nodeValue
    }
    for (const el of raiz.querySelectorAll('*')) {
      if (fora(el) || !naTela(el.getBoundingClientRect())) continue
      for (const a of ['alt', 'title', 'aria-label', 'placeholder']) if (el.hasAttribute(a)) texto += ' ' + el.getAttribute(a)
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.nodeName)) texto += ' ' + el.value
    }
  }
  const t = norm(texto)
  return agulhas.some((a) => t.includes(a))
}

// Degrau logado: procura as agulhas em todos os frames da pagina (o print pega o iframe junto). Frame que nao deixa
// conferir conta como achado: sobe de degrau, nunca grava sem conferir.
export async function dadoPessoalNaTela(pagina, agulhas) {
  for (const quadro of pagina.frames()) {
    if (await quadro.evaluate(temDadoPessoal, agulhas).catch(() => true)) return true
  }
  return false
}

// identidade de celular pela sessao CDP da propria pagina (user agent e Sec-CH-UA); no logado, tambem a tela
async function vestirCelular(pagina, versao, { tela = false } = {}) {
  const s = await pagina.context().newCDPSession(pagina)
  if (tela) await s.send('Emulation.setDeviceMetricsOverride', { width: TELA.width, height: TELA.height, deviceScaleFactor: ESCALA, mobile: true })
  await s.send('Emulation.setUserAgentOverride', identidadeCelular(versao))
}

// Um degrau numa pagina aberta. Devolve { foto, centro, avisos } ou { motivo } pra subir de degrau. Frase nao achada
// numa pagina que respondeu lanca (o erro de hoje), sem subir.
async function naPagina(pagina, { url, marcar, opcoes, logado, agulhas }) {
  let resp
  try {
    resp = await pagina.goto(url, { waitUntil: 'networkidle', timeout: PRAZO_MS })
  } catch (e) {
    if (e?.name === 'TimeoutError') return { motivo: `a pagina nao assentou em ${PRAZO_MS / 1000} s` }
    // o site cortou ou recusou a conexao (net::ERR_EMPTY_RESPONSE, ERR_CONNECTION_RESET ...): sobe de degrau
    const rede = String(e?.message || '').match(/net::(ERR_[A-Z_]+)/)
    if (rede) return { motivo: `o site cortou a conexao (${rede[1]})` }
    throw e
  }
  const c = conferirResposta(resp, url)
  if (c.barrado) return { motivo: c.status ? `o site respondeu ${c.status}` : 'o site nao respondeu' }
  if (paginaVazia(await pagina.evaluate(textoVisivel))) return { motivo: 'a pagina veio em branco' }
  if (logado && await paginaPedeLogin(pagina)) return { motivo: 'o site pediu login no Chrome dedicado' }
  const avisos = await pagina.evaluate(esconderAvisos)
  if (logado) await pagina.evaluate(borrarCabecalho)
  // altura do meio da frase na tela, de 0 (topo) a 1 (pe)
  const centro = marcar ? await pagina.evaluate(marcarNaPagina, marcar) : null
  if (marcar && centro === null) {
    throw new Error(`nao achei a frase "${marcar}" na pagina. Copie a frase exatamente como esta escrita la (sem resumir).`)
  }
  // depois de marcar: a marca rola a pagina, e o que se confere e a tela que vira print
  if (logado && await dadoPessoalNaTela(pagina, agulhas)) return { motivo: 'o nome ou o email do aluno apareceu na tela' }
  const foto = await pagina.screenshot({ ...opcoes })
  return { foto, centro, avisos }
}

async function degrauLimpo({ janela, raiz, carregar, ...resto }) {
  const navegador = await abrirNavegador({ raiz, carregar, headless: janela ? false : undefined })
  try {
    const pagina = await navegador.newPage({ viewport: TELA, deviceScaleFactor: ESCALA, isMobile: true })
    await vestirCelular(pagina, navegador.version())
    return await naPagina(pagina, resto)
  } finally {
    await navegador.close()
  }
}

// O Chrome dedicado do projeto, ja aberto (nunca abre nem fecha o Chrome do aluno). Abre uma aba so e fecha so ela; o
// close no fim so desliga a conexao (no Playwright 1.63 o close de quem ligou pelo CDP fecha o transporte, sem fechar
// o Chrome).
async function degrauLogado({ conectarLogado, url, ...resto }) {
  let navegador
  try { navegador = await conectarLogado() } catch { return { motivo: 'o Chrome dedicado do projeto nao esta aberto' } }
  let pagina
  try {
    const ctx = navegador.contexts()[0]
    if (!(await ctx.cookies(url)).length) return { motivo: 'o Chrome dedicado nao tem a sessao deste site' }
    pagina = await ctx.newPage()
    await vestirCelular(pagina, navegador.version(), { tela: true })
    return await naPagina(pagina, { url, logado: true, ...resto })
  } finally {
    if (pagina) await pagina.close().catch(() => {})
    await navegador.close().catch(() => {})
  }
}

// env: o .env do projeto (so pras agulhas). degraus: a escada, pros testes; sem ela, a do site.
export async function printar({ fonte, saida, marcar, raiz, carregar, env = lerEnv(), degraus, conectarLogado }) {
  const opcoes = opcoesDaFoto(saida)
  const url = /^https?:|^file:/.test(fonte) ? fonte : pathToFileURL(resolve(fonte)).href
  const host = /^https?:/.test(url) ? new URL(url).hostname : ''
  const agulhas = agulhasDoAluno(env)
  const escada = degraus || degrausDe({ host, temAgulhas: agulhas.length > 0 })
  const ligar = conectarLogado || (() => conectar({ carregar: carregar || (() => import(pathToFileURL(acharPlaywright(raiz)).href)) }))
  const motivos = []
  for (const degrau of escada) {
    const comum = { url, marcar, opcoes, agulhas }
    const r = degrau === 'logado'
      ? await degrauLogado({ conectarLogado: ligar, ...comum })
      : await degrauLimpo({ janela: degrau === 'com-janela', raiz, carregar, ...comum })
    if (r.foto) {
      mkdirSync(dirname(resolve(saida)), { recursive: true })
      writeFileSync(saida, r.foto)
      return { saida, centro: r.centro, avisos: r.avisos, degrau, motivos }
    }
    motivos.push(`${degrau}: ${r.motivo}`)
  }
  throw Object.assign(new Error(`o site barrou o navegador automatico nos ${escada.length} jeitos (${motivos.join('; ')}). `
    + 'Peca ao aluno o print da tela dele, que entra como material proprio.'), { codigo: 2, motivos })
}

// argv e deps pros testes; log e erro no lugar do console
export async function main(argv = process.argv.slice(2), { log = console.log, erro = console.error, ...deps } = {}) {
  const { values: o, positionals: [fonte, saida] } = parseArgs({ args: argv, allowPositionals: true, options: { marcar: { type: 'string' } } })
  if (!fonte || !saida) { erro('uso: node print-pagina.mjs <url ou arquivo.html> <saida.png> [--marcar "frase"]'); return 1 }
  if (!/^https?:|^file:/.test(fonte) && !existsSync(fonte)) { erro(`nao achei ${fonte}`); return 1 }
  try {
    const r = await printar({ fonte, saida, marcar: o.marcar, ...deps })
    log(`print-pagina: ${saida} (1080 por 1920${o.marcar ? ', frase marcada no meio' : ''}, degrau ${r.degrau})`)
    return 0
  } catch (e) {
    erro(String(e.message || e))
    return e.codigo === 2 ? 2 : 1
  }
}

const principal = () => {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}
if (principal()) process.exitCode = await main()
