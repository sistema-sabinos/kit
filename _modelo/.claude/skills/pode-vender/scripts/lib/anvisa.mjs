// Gates B e C do gate de marca: as bases publicas da ANVISA, por marca.
//   dossie      -> a marca ja foi apreendida ou proibida?
//   notificacao -> a marca tem produto notificado ativo? (o numero sai de graca)
// Desde 2026-09 a ANVISA exige Cloudflare Turnstile: pedido feito de fora do navegador (curl,
// fetch do Node) volta 403. Dentro da pagina de consultas, aberta no Chrome dedicado, o
// proprio site gera o token e a consulta passa. O primeiro token as vezes demora minutos
// numa pagina nova e depois flui (medido em 2026-09-29), por isso o aquecimento. A base
// tambem derruba rajada, por isso a pausa entre chamadas: nao baixar.
import { casaPalavraInteira, norm } from './texto.mjs'

// Travessao que vem no texto da ANVISA vira hifen: o aluno nunca le travessao.
const TRACOS = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`, 'g')

export const PAGINA = 'https://consultas.anvisa.gov.br/#/alimentos/'
export const PAUSA_MS = 1800
export const AQUECIMENTO_MS = 240_000
export const TENTATIVA_MS = 30_000
export const ESPERA_RAJADA_MS = 60_000

export function caminhoDossie(termo) {
  const p = new URLSearchParams({ page: '1', count: '50' })
  p.set('filter[tipoAssunto]', '1')
  p.set('filter[parametroProduto]', termo)
  return `/api/dossie/dossie?${p}`
}

export function caminhoNotificacao(marca) {
  const p = new URLSearchParams({ page: '1', count: '50' })
  p.set('filter[marca]', marca)
  return `/api/consulta/alimento/produtos?${p}`
}

// Roda DENTRO da pagina (o Playwright serializa a funcao): nada de fora dela existe aqui.
// Pede o token ao servico do proprio site e faz a consulta com ele.
export async function naPagina({ caminho, esperarMs }) {
  let tok
  try {
    const svc = window.angular.element(document.body).injector().get('turnstileService')
    tok = await Promise.race([
      svc.obterToken(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('sem-token')), esperarMs)),
    ])
  } catch (e) {
    return { semToken: true, detalhe: String((e && (e.message || e.mensagem)) || e) }
  }
  if (!tok) return { semToken: true, detalhe: 'token vazio' }
  const r = await fetch(caminho, { headers: { Authorization: 'Guest', Accept: 'application/json', 'X-Turnstile-Token': tok } })
  return { status: r.status, texto: await r.text() }
}

// `avaliar(args)` e quem roda `naPagina` na pagina de verdade (page.evaluate). Relogio e
// espera entram por fora pra o teste nao esperar minutos.
export function criarConsulta({ avaliar, dormir = ms => new Promise(r => setTimeout(r, ms)), agora = Date.now, log = () => {} }) {
  let aquecida = false
  let ultima = 0
  const tentar = caminho => avaliar({ caminho, esperarMs: TENTATIVA_MS })

  return async function consultar(caminho) {
    const desde = agora() - ultima
    if (ultima && desde < PAUSA_MS) await dormir(PAUSA_MS - desde)
    let r
    if (!aquecida) {
      const fim = agora() + AQUECIMENTO_MS
      r = await tentar(caminho)
      while (r.semToken && agora() < fim) {
        log('a ANVISA ainda nao liberou a consulta (verificacao anti-robo), tentando de novo...')
        r = await tentar(caminho)
      }
      if (r.semToken) throw new Error(`a ANVISA nao liberou a consulta em ${AQUECIMENTO_MS / 60_000} minutos (verificacao anti-robo). Tente de novo mais tarde`)
      aquecida = true
    } else {
      r = await tentar(caminho)
      if (r.semToken) r = await tentar(caminho)
      if (r.semToken) throw new Error('a ANVISA parou de liberar a consulta no meio da rodada (verificacao anti-robo)')
    }
    if (r.status === 403) {
      await dormir(ESPERA_RAJADA_MS)
      r = await tentar(caminho)
    }
    ultima = agora()
    if (r.semToken || r.status !== 200) throw new Error(`a ANVISA respondeu ${r.status ?? 'sem liberar'} pra ${caminho}`)
    try {
      return JSON.parse(r.texto)
    } catch {
      throw new Error(`a ANVISA devolveu algo que nao e JSON: ${String(r.texto).slice(0, 120)}`)
    }
  }
}

function lista(json, campos) {
  if (!json || !Array.isArray(json.content)) throw new Error('a resposta da ANVISA veio sem a lista "content": o site mudou o formato')
  if (json.content.some(x => !x || campos.some(c => !(c in x)))) throw new Error(`a resposta da ANVISA veio sem os campos ${campos.join(', ')}: o site mudou o formato`)
  return json.content
}

// Medida contra a marca inteira: "TODOS OS SUPLEMENTOS ... MARCA X", "TODOS OS PRODUTOS ...".
// Frase comum ("PARA TODOS OS TIPOS DE PELE", "TODOS OS LOTES") nao conta.
const MARCA_INTEIRA = /\bTOD[OA]S (OS|AS) (PRODUTOS|SUPLEMENTOS|ALIMENTOS|COSMETICOS|SANEANTES|MEDICAMENTOS)\b/

// A busca de dossie casa frouxo (pedir uma marca traz dossie de outra coisa). Quem decide e
// `confirmados`: o nome da marca, ou um apelido dela, aparece MESMO no texto, como palavra
// inteira, e o dossie e do tipo de produto da categoria.
export function lerDossies(json, { marca, aliases = [], tipos = [] }) {
  const todos = lista(json, ['produtosConcatenados', 'tipoProduto']).map(x => ({
    data: String(x.dataUltimaMedidaCautelar || '').slice(0, 10),
    tipo: x.tipoProduto?.descricao || '',
    empresa: x.empresa?.razaoSocial || '',
    produtos: String(x.produtosConcatenados || '').replace(TRACOS, '-').replace(/\s+/g, ' ').trim(),
  }))
  const chaves = [marca, ...aliases].filter(k => norm(k).length >= 3)
  const doTipo = tipos.length ? todos.filter(d => tipos.includes(d.tipo)) : todos
  const dossies = doTipo
    .filter(d => chaves.some(k => casaPalavraInteira(`${d.produtos} ${d.empresa}`, k)))
    .map(d => ({ ...d, guardaChuva: MARCA_INTEIRA.test(norm(d.produtos)) }))
  const total = json.totalElements ?? todos.length
  return {
    total,
    incompleto: total > todos.length,
    confirmados: dossies.length,
    guardaChuva: dossies.filter(d => d.guardaChuva).length,
    dossies,
    descartados: todos.length - dossies.length,
  }
}

export function lerNotificacoes(json) {
  const itens = lista(json, ['produto']).map(x => ({
    produto: x.produto?.descricao || '',
    numero: x.produto?.numeroRegistroOuNotificacao || '',
    tipo: x.produto?.tipoRegularizacao || '',
    situacao: x.produto?.situacaoRegistro || '',
    detentor: x.detentorRegistro?.razaoSocial || '',
  }))
  const ativos = itens.filter(i => i.situacao === 'Ativo')
  return {
    total: json.totalElements ?? itens.length,
    ativos: ativos.length,
    notificadosAtivos: ativos.filter(i => i.tipo === 'Notificado').length,
    itens,
  }
}

export async function irregulares(consultar, marca, { aliases = [], tipos = [] } = {}) {
  return lerDossies(await consultar(caminhoDossie(marca)), { marca, aliases, tipos })
}

export async function regularizados(consultar, marca) {
  return lerNotificacoes(await consultar(caminhoNotificacao(marca)))
}
