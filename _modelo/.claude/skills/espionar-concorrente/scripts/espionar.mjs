#!/usr/bin/env node
// Coleta da /espionar-concorrente. Abre os anuncios do topo de um produto no Chrome dedicado
// (anuncio de outro vendedor nao se le pela API, que devolve 403), junta as avaliacoes pela
// API de reviews (gratis; em 2026-10-08 so respondeu pra anuncio da propria conta, e de
// concorrente deu 403 com token valido, que vira erro na linha) e as perguntas reais pela aba de perguntas
// dos anuncios que mais vendem. Grava o bruto e recalcula vocabulario.txt e atributos.json da
// categoria (contrato 0). O briefing em Markdown quem escreve e o agente, lendo o bruto.
//
// Uso, da raiz do projeto (Chrome dedicado aberto e logado):
//   node .claude/skills/espionar-concorrente/scripts/espionar.mjs --fornecedor <f> --categoria <c> --produto "<nome como no pesquisa-input>" [--n 5] [--perguntas 3]
// Entrada: fornecedores/<f>/_raw-pesquisa-<c>.json (a /pesquisar-tendencia rodou)
// Saida:   fornecedores/<f>/concorrentes/<c>/_raw-concorrentes-<slug>.json, vocabulario.txt, atributos.json
//          e a etapa espionagem de dados/pipeline/_categorias/<f>-<c>.json
//
// Pagina de anuncio conferida ao vivo em 2026-09-24: h1, meta[itemprop="price"], .ui-pdp-subtitle,
// .andes-table__row/tr da ficha, .ui-pdp-gallery img com data-zoom, .ui-pdp-description__content e o
// link "Ver todas as perguntas" batem com a pagina real. O seletor de vendedor tinha mudado (a classe
// antiga sumiu) e foi ajustado pro que existe hoje. A aba de perguntas confere: comeca em "Perguntas
// neste anuncio" e termina no rodape ("Mais informações" ou "Termos mais procurados"). O link do produto no formato
// produto.mercadolivre.com.br/MLB-<numeros> abre o anuncio, como urlParaAbrir monta pro patrocinado.
// A rota /reviews/item/<id> devolve 403 sem token, batendo com o uso de mlGet com token aqui; os nomes
// dos campos da resposta (reviews, rate, title, content, likes, rating_average, rating_levels,
// paging.total) nao vieram de fonte oficial porque a documentacao do Mercado Livre tambem devolve 403
// pra robo: conferir na fumaca do plano D. Se o Mercado Livre mudar a pagina de novo, os seletores de
// lerPagina sao o que precisa de ajuste.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { conectar } from '../../mercado-livre/scripts/lib/chrome.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { mlGet } from '../../mercado-livre/scripts/lib/ml-api.mjs'
import { slugDe, gravarJson, gravarEtapaDaCategoria, dataLocal } from '../../mercado-livre/scripts/lib/pipeline.mjs'

export function argumentos(argv) {
  const pega = (nome, padrao) => {
    const i = argv.indexOf('--' + nome)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao
  }
  const fornecedor = pega('fornecedor', '')
  const categoria = pega('categoria', '')
  const produto = pega('produto', '')
  if (!fornecedor || !categoria || !produto) throw new Error('uso: --fornecedor <f> --categoria <c> --produto "<nome como no pesquisa-input>" [--n 5] [--perguntas 3]')
  const inteiro = (nome, padrao, min) => {
    const n = Number(pega(nome, padrao))
    if (!Number.isInteger(n) || n < min) throw new Error(`--${nome} precisa ser um numero inteiro de ${min} pra cima`)
    return n
  }
  return { fornecedor, categoria, produto, n: inteiro('n', 5, 1), perguntas: inteiro('perguntas', 3, 0), retomar: argv.includes('--retomar') }
}

// Codigo do anuncio numa URL do Mercado Livre (com ou sem hifen, na query do patrocinado ou no caminho).
export function idDoAnuncio(url) {
  const s = String(url ?? '')
  const q = s.match(/item_id(?:%3A|:)(MLBU?)(\d{7,12})/i)
  if (q) return q[1].toUpperCase() + q[2]
  const c = s.match(/(MLBU?)-?(\d{7,12})/)
  return c ? c[1] + c[2] : null
}

// Os organicos primeiro, na ordem da busca (e quem o Mercado Livre mostra sem ninguem pagar);
// patrocinado so completa se faltar. Sem codigo nao da pra abrir, entao fica de fora.
export function escolherTopo(produto, n) {
  const vistos = new Set()
  const comId = (produto.busca?.itens || []).map(i => ({ ...i, id: i.id || idDoAnuncio(i.url) })).filter(i => i.id && !vistos.has(i.id) && vistos.add(i.id))
  return [...comId.filter(i => !i.patrocinado), ...comId.filter(i => i.patrocinado)].slice(0, n)
}

// Anuncio patrocinado guarda um link de clique que nao abre o anuncio; o codigo abre.
export function urlParaAbrir(item) {
  if (item.url && !/\/mclics\//.test(item.url)) return item.url
  if (/^MLB\d+$/.test(item.id)) return `https://produto.mercadolivre.com.br/MLB-${item.id.slice(3)}`
  return null
}

// O elemento do vendedor tem dois filhos ("Vendido por" ou "Loja oficial", e o nome). Le o texto
// bruto (innerText, que separa os filhos por quebra de linha; textContent colaria "Vendido
// porLOJA EXEMPLO"). nome e a ultima linha nao vazia; loja_oficial e true se alguma linha for
// exatamente "Loja oficial".
export function vendedorDe(texto) {
  const linhas = String(texto ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  if (!linhas.length) return { nome: null, loja_oficial: false }
  return { nome: linhas[linhas.length - 1], loja_oficial: linhas.some(l => l === 'Loja oficial') }
}

// '+1000 vendidos' -> 1000; '+5 mil vendidos' -> 5000; '37 vendidos' -> 37; sem numero -> null
export function vendidosDe(texto) {
  const m = String(texto ?? '').match(/(\d+(?:[.,]\d+)?)\s*(mil)?\s+vendid/i)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return m[2] ? Math.round(n * 1000) : n
}

// A aba de perguntas, como a pagina entrega no innerText: o que fica entre o titulo da secao
// e o rodape ("Mais informações" na pagina de perguntas, "Termos mais procurados" na de anuncio).
// Cada pergunta e cada resposta vem seguida de "Denunciar" e "Vai abrir em uma nova janela", entao
// "Denunciar" fica dentro do texto (cortar nele deixava so a primeira pergunta). Acima do limite,
// corta no fim do ultimo par inteiro, pra nao sobrar pergunta pela metade. Vazio sem a secao.
const FIM_DO_PAR = 'Vai abrir em uma nova janela'
export function perguntasDoTexto(texto, limite = 20000) {
  const s = String(texto ?? '')
  const ini = s.search(/Perguntas neste anúncio|Últimas feitas/i)
  if (ini < 0) return ''
  const resto = s.slice(ini)
  const fim = resto.search(/\n\s*(Termos mais procurados|Mais informa[cç][oõ]es)\s*(\n|$)/i)
  const secao = (fim > 0 ? resto.slice(0, fim) : resto).trim()
  if (secao.length <= limite) return secao
  const corte = secao.lastIndexOf(FIM_DO_PAR, limite - FIM_DO_PAR.length)
  return corte > 0 ? secao.slice(0, corte + FIM_DO_PAR.length) : secao.slice(0, limite)
}

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'sem', 'e', 'ou', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'por', 'p', 'c', 'un', 'und'])

export function palavrasDoTitulo(titulo) {
  return String(titulo ?? '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(p => p.length > 1 && !PARADAS.has(p))
}

// Em quantos titulos cada palavra aparece (repetida no mesmo titulo conta uma vez),
// da mais frequente pra menos, empate em ordem alfabetica.
export function vocabulario(titulos) {
  const conta = new Map()
  for (const t of titulos) for (const p of new Set(palavrasDoTitulo(t))) conta.set(p, (conta.get(p) || 0) + 1)
  return [...conta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
}

export const textoDoVocabulario = pares => pares.map(([p, n]) => `${p}\t${n}`).join('\n') + '\n'

// Atributo preenchido por `minimo` ou mais anuncios, com os valores do mais comum pro menos.
export function atributosConsensuais(anuncios, minimo = 4) {
  const porNome = new Map()
  for (const a of anuncios) {
    for (const [nome, valor] of Object.entries(a.atributos || {})) {
      const v = String(valor ?? '').trim()
      if (!v) continue
      if (!porNome.has(nome)) porNome.set(nome, new Map())
      const vals = porNome.get(nome)
      vals.set(v, (vals.get(v) || 0) + 1)
    }
  }
  const saida = {}
  for (const [nome, vals] of porNome) {
    const emQuantos = [...vals.values()].reduce((x, y) => x + y, 0)
    if (emQuantos >= minimo) saida[nome] = { em_quantos: emQuantos, valores: [...vals].sort((x, y) => y[1] - x[1]).map(([v]) => v) }
  }
  return saida
}

// A galeria repete cada foto em mais de um tamanho (a normal e a "_2X_", em resolucao dobrada) e
// entra o icone de video no meio; contar tudo infla a mediana de fotos do briefing. O codigo da foto
// e o <numero>-ML<letra><digitos> do caminho (formato D_<tamanho>_<numero>-ML<letra><digitos>_<mes><ano>-<letra>);
// sem esse codigo (o .svg do video) a URL fica de fora. O sufixo de data e letra (_<mes><ano>-<letra>)
// e opcional: variacao de URL sem ele ainda e foto valida, so sem o "-F"/"-R" pro desempate (sobra a
// "_2X_" no tamanho). Uma URL por codigo, preferindo a de maior resolucao ("_2X_" no tamanho, ou
// "-F" no ultimo pedaco; "-R" e a menor).
const CODIGO_FOTO = /(\d+-ML[A-Z]\d+)(?:_\d{6}-([A-Z]))?/
export function fotosUnicas(urls) {
  const porCodigo = new Map()
  for (const url of urls || []) {
    const m = String(url).match(CODIGO_FOTO)
    if (!m) continue
    const altaResolucao = url.includes('_2X_') || m[2] === 'F'
    const atual = porCodigo.get(m[1])
    if (!atual || (altaResolucao && !atual.altaResolucao)) porCodigo.set(m[1], { url, altaResolucao })
  }
  return [...porCodigo.values()].map(v => v.url)
}

// Avaliacoes pela API (custo zero). Pagina de `limite` em `limite` ate `maximo`.
export async function avaliacoesDe(id, get, { limite = 50, maximo = 100 } = {}) {
  const avaliacoes = []
  let primeira = null
  for (let offset = 0; offset < maximo; offset += limite) {
    const d = await get(`/reviews/item/${id}?limit=${limite}&offset=${offset}`)
    primeira = primeira || d
    const lote = (d.reviews || []).map(r => ({ nota: r.rate, titulo: r.title ?? '', texto: r.content ?? '', curtidas: r.likes ?? 0 }))
    avaliacoes.push(...lote)
    if (lote.length < limite || avaliacoes.length >= (d.paging?.total ?? 0)) break
  }
  return { media: primeira?.rating_average ?? null, total: primeira?.paging?.total ?? 0, niveis: primeira?.rating_levels ?? null, avaliacoes: avaliacoes.slice(0, maximo) }
}

// Roda dentro da pagina do anuncio (page.evaluate).
export function lerPagina() {
  const txt = el => (el ? el.textContent.trim() : null)
  const bruto = el => (el ? el.innerText : null)
  const q = s => document.querySelector(s)
  const atributos = {}
  for (const linha of document.querySelectorAll('.andes-table__row, tr')) {
    const nome = txt(linha.querySelector('th, .andes-table__header'))
    const valor = txt(linha.querySelector('td, .andes-table__column'))
    if (nome && valor) atributos[nome] = valor
  }
  const fotos = [...new Set([...document.querySelectorAll('.ui-pdp-gallery img, figure img')]
    .map(i => i.getAttribute('data-zoom') || i.getAttribute('src') || '')
    .filter(u => /mlstatic\.com/.test(u)))]
  const link = [...document.querySelectorAll('a')].find(a => /ver todas as perguntas/i.test(a.textContent))
  return {
    titulo: txt(q('h1')),
    preco: Number(q('meta[itemprop="price"]')?.getAttribute('content')) || null,
    subtitulo: txt(q('.ui-pdp-subtitle')),
    vendedor: bruto(q('.ui-pdp-seller-summary__link-trigger-button, .ui-pdp-seller-summary__header__title')),
    fotos,
    atributos,
    descricao: txt(q('.ui-pdp-description__content')),
    link_perguntas: link ? link.href : null,
    // video do VENDEDOR mora na galeria; o de comprador (.ui-video-clips__*) fica nas
    // avaliacoes e nao conta. [class*="clips"] casa os dois. Conferido em 2026-10-04.
    video: document.querySelectorAll('.ui-pdp-gallery__figure__clip, .ui-pdp-gallery .clip-picture-icon').length > 0,
  }
}

// Le cada anuncio (pagina e avaliacoes) e depois as perguntas dos `perguntas` que mais vendem.
// Anuncio que falha vira erro na linha dele e o resto segue. `salvar` roda logo apos cada
// anuncio da pagina principal (antes do sono seguinte), pra cair no meio nao perder o que ja leu;
// a fase de perguntas mexe nos mesmos objetos (mesma referencia), entao a gravacao final de quem
// chama ja sai com elas, sem precisar salvar de novo aqui. Na retomada, `jaColetados` sao os de
// hoje ja gravados: os `perguntas` que mais vendem saem do conjunto inteiro (eles mais os novos), e
// so abre a aba de quem ainda nao tem perguntas lidas hoje. Cada anuncio sai carimbado com o dia
// em que foi lido (coletado_em) e as perguntas com o dia delas (perguntas_em): o `em` do arquivo
// vale pro arquivo inteiro e nao diz de quando e cada anuncio.
export async function espionar({ itens, jaColetados = [], lerAnuncio, lerPerguntas, get, perguntas = 3, hoje = dataLocal(), dormir = ms => new Promise(r => setTimeout(r, ms)), log = () => {}, salvar = () => {} }) {
  const anuncios = []
  for (const item of itens) {
    const a = { id: item.id, url: urlParaAbrir(item), preco_na_busca: item.preco, patrocinado: Boolean(item.patrocinado), coletado_em: hoje }
    try {
      if (!a.url) throw new Error('sem endereco pra abrir')
      Object.assign(a, await lerAnuncio(a.url))
      const vendedor = vendedorDe(a.vendedor)
      a.vendedor = vendedor.nome
      a.loja_oficial = vendedor.loja_oficial
      a.vendidos = vendidosDe(a.subtitulo)
      a.fotos = fotosUnicas(a.fotos)
    } catch (e) { a.erro = `pagina: ${e.message}`.slice(0, 200) }
    try { a.avaliacoes = await avaliacoesDe(item.id, get) } catch (e) { a.avaliacoes = { erro: e.message.slice(0, 200) } }
    log(`${item.id}: ${a.erro || `${a.titulo?.slice(0, 50)}, ${a.fotos?.length ?? 0} fotos, ${a.avaliacoes.total ?? 0} avaliacoes`}`)
    anuncios.push(a)
    await salvar(a)
    await dormir(2000 + Math.floor(Math.random() * 2000))
  }
  const maisVendidos = mesclarAnuncios(jaColetados, anuncios).filter(a => a.link_perguntas).sort((x, y) => (y.vendidos ?? 0) - (x.vendidos ?? 0)).slice(0, perguntas)
  for (const a of maisVendidos.filter(x => !(x.perguntas && x.perguntas_em === hoje))) {
    try { a.perguntas = perguntasDoTexto(await lerPerguntas(a.link_perguntas)); a.perguntas_em = hoje } catch (e) { a.perguntas_erro = e.message.slice(0, 200) }
    await dormir(2000)
  }
  return anuncios
}

// Nova tentativa com poucos anuncios nao pode apagar os que ja tinham: quem repete o id e
// trocado no lugar, quem e novo entra no fim (mesma regra do mesclarBruto da pesquisa).
export function mesclarAnuncios(existentes, novos) {
  const porId = new Map(novos.map(a => [a.id, a]))
  const saida = existentes.map(a => (porId.has(a.id) ? porId.get(a.id) : a))
  const jaTinha = new Set(existentes.map(a => a.id))
  return [...saida, ...novos.filter(a => !jaTinha.has(a.id))]
}

// Pro --retomar: so pula o anuncio cujo proprio carimbo (coletado_em) e `hoje` E que deu certo
// (sem `erro`). O `em` do arquivo nao serve: sem --retomar o bruto antigo entra inteiro e cada
// salvamento grava o arquivo com a data de hoje. Anuncio sem carimbo (arquivo antigo), de outro
// dia ou com erro recoleta. anunciosDeHoje sao os que ficam pulados.
export function oQueFaltaEspionar(arquivoExistente, itens, hoje) {
  const doDia = (arquivoExistente?.anuncios || []).filter(a => a.coletado_em === hoje && !a.erro)
  const idsOk = new Set(doDia.map(a => a.id))
  const aColetar = itens.filter(it => !idsOk.has(it.id))
  return { aColetar, puladas: itens.length - aColetar.length, anunciosDeHoje: doDia }
}

// De onde a coleta parte. Com --retomar: so o que falta, e os de hoje ja gravados vao pra fase
// de perguntas (jaColetados). Nos dois casos `atual` comeca pelo bruto que ja existe, pro primeiro
// salvamento trocar pelo id em vez de encolher um arquivo antigo completo.
export function pontoDePartida(arquivoExistente, todosOsItens, hoje, retomar) {
  const atual = arquivoExistente?.anuncios || []
  if (!retomar) return { itens: todosOsItens, atual, jaColetados: [], puladas: 0 }
  const r = oQueFaltaEspionar(arquivoExistente, todosOsItens, hoje)
  return { itens: r.aColetar, atual, jaColetados: r.anunciosDeHoje, puladas: r.puladas }
}

// Vocabulario e atributos saem de todos os brutos da pasta da categoria, pra espionagem em lotes
// somar em vez de sobrescrever. Anuncio repetido entre produtos conta uma vez.
export function recalcularArquivos(pasta, { minimo = 4 } = {}) {
  const brutos = existsSync(pasta) ? readdirSync(pasta).filter(f => /^_raw-concorrentes-.+\.json$/.test(f)).sort() : []
  if (!brutos.length) throw new Error(`nenhum _raw-concorrentes-*.json em ${pasta}`)
  const porId = new Map()
  for (const f of brutos) for (const a of JSON.parse(readFileSync(join(pasta, f), 'utf8')).anuncios || []) if (a.titulo && !a.erro) porId.set(a.id || a.url, a)
  const anuncios = [...porId.values()]
  const voc = vocabulario(anuncios.map(a => a.titulo))
  const atr = atributosConsensuais(anuncios, minimo)
  writeFileSync(join(pasta, 'vocabulario.txt'), textoDoVocabulario(voc))
  writeFileSync(join(pasta, 'atributos.json'), JSON.stringify(atr, null, 2) + '\n')
  return { anuncios: anuncios.length, palavras: voc.length, atributos: Object.keys(atr).length }
}

export function acharProduto(lista, nome) {
  const alvo = String(nome).trim().toLowerCase()
  const p = lista.find(x => x.nome === nome) || lista.find(x => String(x.nome).trim().toLowerCase() === alvo)
  if (!p) throw new Error(`"${nome}" nao esta na pesquisa. Produtos que estao: ${lista.map(x => x.nome).join('; ')}`)
  return p
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  let browser = null
  try {
    const a = argumentos(process.argv.slice(2))
    const bruto = join(RAIZ, 'fornecedores', a.fornecedor, `_raw-pesquisa-${a.categoria}.json`)
    if (!existsSync(bruto)) throw new Error(`nao existe ${bruto}. Rode antes a /pesquisar-tendencia nessa categoria.`)
    const produto = acharProduto(JSON.parse(readFileSync(bruto, 'utf8')), a.produto)
    const todosOsItens = escolherTopo(produto, a.n)
    if (!todosOsItens.length) throw new Error(`a pesquisa de "${produto.nome}" nao tem anuncio com codigo pra abrir. Rode a pesquisa de novo com outro termo.`)
    const slug = slugDe(produto.nome)
    const hoje = dataLocal()
    const pasta = join(RAIZ, 'fornecedores', a.fornecedor, 'concorrentes', a.categoria)
    mkdirSync(pasta, { recursive: true })
    const arquivoBruto = join(pasta, `_raw-concorrentes-${slug}.json`)
    const arquivoExistente = existsSync(arquivoBruto) ? JSON.parse(readFileSync(arquivoBruto, 'utf8')) : null
    const partida = pontoDePartida(arquivoExistente, todosOsItens, hoje, a.retomar)
    const { itens, jaColetados } = partida
    let atual = partida.atual
    if (partida.puladas) console.error(`--retomar: ${partida.puladas} anuncio(s) ja coletado(s) hoje, pulando`)
    const token = await tokenMl()
    browser = await conectar()
    const ctx = browser.contexts()[0] || (await browser.newContext())
    const page = await ctx.newPage()
    const abrir = async url => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(2500)
      if (/login|registration/i.test(page.url())) throw new Error('a pagina pediu login: a sessao do Chrome dedicado caiu')
    }
    // grava (temporario + rename) assim que cada anuncio termina de ler a pagina
    const salvarBruto = () => gravarJson(arquivoBruto, { produto: produto.nome, categoria: a.categoria, em: hoje, termo: produto.termo, anuncios: atual })
    const lidosAgora = await espionar({
      itens,
      jaColetados,
      hoje,
      perguntas: a.perguntas,
      get: caminho => mlGet(caminho, { token }),
      lerAnuncio: async url => {
        await abrir(url)
        // a descricao so carrega quando rola ate ela
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(1500)
        return page.evaluate(lerPagina)
      },
      lerPerguntas: async url => { await abrir(url); return page.evaluate(() => document.body.innerText) },
      log: m => console.error(m),
      salvar: anuncio => { atual = mesclarAnuncios(atual, [anuncio]); salvarBruto() },
    })
    await page.close().catch(() => {})
    // a fase de perguntas mexe nos mesmos objetos que ja estao em `atual` (mesma referencia);
    // essa gravacao final so garante que a versao em disco saiu com elas.
    salvarBruto()
    const r = recalcularArquivos(pasta)
    gravarEtapaDaCategoria({ fornecedor: a.fornecedor, categoria: a.categoria, etapa: 'espionagem', dados: { status: 'ok', em: hoje, produtos_analisados: [slug], arquivos: [`fornecedores/${a.fornecedor}/concorrentes/${a.categoria}/`] }, acrescentar: ['produtos_analisados'] })
    // conta so o que foi lido nesta rodada e as perguntas lidas hoje, nunca o bruto antigo que entrou junto
    const lidos = lidosAgora.filter(x => !x.erro)
    console.log(`${lidos.length} de ${lidosAgora.length} anuncios lidos agora; ${atual.filter(x => x.perguntas && x.perguntas_em === hoje).length} com perguntas de hoje; campeoes (mais de 1000 vendidos): ${lidos.filter(x => (x.vendidos ?? 0) > 1000).length}`)
    console.log(`categoria: ${r.anuncios} anuncios no vocabulario, ${r.atributos} atributos preenchidos em 4 ou mais`)
    console.log(`fornecedores/${a.fornecedor}/concorrentes/${a.categoria}/_raw-concorrentes-${slug}.json`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
