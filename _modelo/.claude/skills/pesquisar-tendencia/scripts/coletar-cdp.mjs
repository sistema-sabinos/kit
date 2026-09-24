#!/usr/bin/env node
// Coleta da /pesquisar-tendencia. Pra cada produto do pesquisa-input, junta duas fontes:
//   1. API do Mercado Livre (gratis): se o produto tem catalogo unificado e quem disputa a compra
//   2. a pagina de busca aberta no Chrome dedicado: ate --max-itens anuncios, com preco e vendedor
// e grava fornecedores/<f>/_raw-pesquisa-<categoria>.json. No fim chama o processamento
// (pesquisar.mjs), que gera o md, o csv e a etapa da categoria. Custo: zero.
//
// Uso, da raiz do projeto (Chrome dedicado aberto e logado, ver /mercado-livre):
//   node .claude/skills/pesquisar-tendencia/scripts/coletar-cdp.mjs --fornecedor <f> --categoria <c> [--max-itens 120] [--max-paginas 2] [--sem-processar]
// Entrada: fornecedores/<f>/pesquisa-input-<categoria>.json, lista de { "nome", "custo", "termo", "cuidado" }
//
// Conferido ao vivo em 2026-09-24: o layout da busca (Playwright contra
// lista.mercadolivre.com.br/bala-de-coco, os seletores de extrairCards e o clique do "Seguinte")
// e a rota /products/search, contra a doc oficial (developers.mercadolibre.com.ar/en_us/products-search).
// A rota /products/<id>/items NAO foi confirmada: sem token o api.mercadolibre.com devolveu 403,
// e nao achei pagina de doc oficial pra ela; conferir na fumaca do plano D. Se o Mercado Livre
// mudar a pagina, extrairCards e o clique do "Seguinte" sao o que precisa de ajuste.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { conectar } from '../../mercado-livre/scripts/lib/chrome.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { mlGet } from '../../mercado-livre/scripts/lib/ml-api.mjs'
import { processar } from './pesquisar.mjs'

export function argumentos(argv) {
  const pega = (nome, padrao) => {
    const i = argv.indexOf('--' + nome)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : padrao
  }
  const fornecedor = pega('fornecedor', '')
  const categoria = pega('categoria', '')
  if (!fornecedor || !categoria) throw new Error('uso: --fornecedor <nome da pasta em fornecedores/> --categoria <categoria>')
  const inteiro = (nome, padrao) => {
    const n = Number(pega(nome, padrao))
    if (!Number.isInteger(n) || n < 1) throw new Error(`--${nome} precisa ser um numero inteiro maior que zero`)
    return n
  }
  return { fornecedor, categoria, maxItens: inteiro('max-itens', 120), maxPaginas: inteiro('max-paginas', 2), semProcessar: argv.includes('--sem-processar') }
}

// A entrada e escrita pelo agente; erro aqui aponta a linha, em vez de estourar no meio da coleta.
export function lerEntrada(caminho) {
  if (!existsSync(caminho)) throw new Error(`nao existe ${caminho}. Monte a lista de { "nome", "custo", "termo" } a partir do catalogo-analisado.csv (passo 4 da skill).`)
  const lista = JSON.parse(readFileSync(caminho, 'utf8'))
  if (!Array.isArray(lista) || !lista.length) throw new Error(`${caminho} precisa ser uma lista com pelo menos um produto`)
  lista.forEach((p, i) => {
    if (!p || !String(p.nome ?? '').trim()) throw new Error(`produto ${i + 1} sem "nome"`)
    if (!String(p.termo ?? '').trim()) throw new Error(`"${p.nome}" sem "termo" de busca`)
    if (typeof p.custo !== 'number' || !(p.custo > 0)) throw new Error(`"${p.nome}" com custo invalido (${JSON.stringify(p.custo)}): use numero com ponto, como 12.5`)
  })
  return lista
}

export const urlDaBusca = termo => `https://lista.mercadolivre.com.br/${String(termo).trim().toLowerCase().replace(/\s+/g, '-')}`

// Chave de um anuncio pra tirar repetido. Link patrocinado (/mclics/) so se distingue pela query,
// onde vem o item_id; cortar a query juntava todos os patrocinados num so e sumia com eles.
export function chaveDoAnuncio(item) {
  const alvo = item.urlCompleta || item.url || ''
  const patrocinado = alvo.match(/item_id(?:%3A|:)(MLBU?)(\d{7,12})/i)
  if (patrocinado) return patrocinado[1].toUpperCase() + patrocinado[2]
  const direto = alvo.match(/\/(MLBU?)-?(\d{7,12})/)
  if (direto) return direto[1] + direto[2]
  return alvo
}

// Guarda o codigo do anuncio em `id` (a URL limpa do patrocinado nao tem), porque a
// /espionar-concorrente abre o anuncio por ele. Sem codigo, `id` fica null.
export function deduplicar(itens) {
  const vistos = new Set()
  const saida = []
  for (const { urlCompleta, ...resto } of itens) {
    const k = chaveDoAnuncio({ urlCompleta, ...resto })
    if (vistos.has(k)) continue
    vistos.add(k)
    saida.push({ ...resto, id: /^MLBU?\d+$/.test(k) ? k : null })
  }
  return saida
}

// Roda dentro da pagina (page.evaluate): nada de fora desta funcao existe la.
// Os dois seletores de card casam aninhados no layout atual; fica so o mais externo de cada card,
// senao todo anuncio entra duas vezes e a concorrencia sai dobrada.
export function extrairCards() {
  const saida = []
  const brutos = [...document.querySelectorAll('li.ui-search-layout__item, .ui-search-result__wrapper')]
  const cards = brutos.filter(el => !brutos.some(outro => outro !== el && outro.contains(el)))
  for (const card of cards) {
    const tituloEl = card.querySelector('.poly-component__title, h2.ui-search-item__title a, a.poly-component__title-wrapper')
    const linkEl = card.querySelector('a.poly-component__title, .poly-component__title a, a.ui-search-link, a.poly-component__title-wrapper') || (tituloEl && tituloEl.closest('a'))
    const titulo = tituloEl ? tituloEl.textContent.trim() : null
    const url = linkEl ? linkEl.href : null
    if (!titulo || !url) continue
    const caixa = card.querySelector('.poly-price__current, .ui-search-price__second-line') || card
    const inteiro = caixa.querySelector('.andes-money-amount__fraction')
    const centavos = caixa.querySelector('.andes-money-amount__cents')
    if (!inteiro) continue
    const preco = parseFloat(inteiro.textContent.replace(/\./g, '') + '.' + (centavos ? centavos.textContent : '00'))
    if (!preco || preco < 1) continue
    const vendedorEl = card.querySelector('.poly-component__seller')
    saida.push({
      titulo,
      url: url.split('#')[0].split('?')[0],
      urlCompleta: url,
      preco,
      vendedor: vendedorEl ? vendedorEl.textContent.replace(/^Por\s+/i, '').trim() : null,
      frete_gratis: /frete grátis|chegará grátis/i.test(card.textContent),
      patrocinado: /patrocinado/i.test(card.textContent),
    })
  }
  return saida
}

// A barra de paginacao vem com href vazio (e href vazio resolve pra propria pagina), e montar a
// URL na mao volta pra pagina 1. Entao clica em "Seguinte" como gente e so aceita se a URL mudar.
export async function coletarBusca(page, termo, { maxItens = 120, maxPaginas = 2, espera = ms => page.waitForTimeout(ms) } = {}) {
  const url = urlDaBusca(termo)
  const itens = []
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  for (let pagina = 1; pagina <= maxPaginas && itens.length < maxItens; pagina++) {
    await espera(2500)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7))
    await espera(1200)
    if (/login|registration/i.test(page.url())) return { total: 0, itens: [], url, erro: 'a busca pediu login: a sessao do Chrome dedicado caiu, entre de novo na conta' }
    const daPagina = await page.evaluate(extrairCards)
    if (!daPagina.length) {
      if (pagina === 1) return { total: 0, itens: [], url, erro: 'nenhum anuncio lido: a busca veio vazia ou a pagina mudou (olhe a janela do Chrome dedicado)' }
      break
    }
    itens.push(...daPagina)
    if (pagina === maxPaginas) break
    const seletor = 'a.andes-pagination__link[title="Seguinte"], li.andes-pagination__button--next a'
    const antes = page.url()
    if (!(await page.locator(seletor).count())) break
    try { await page.click(seletor) } catch { break }
    let andou = false
    for (let t = 0; t < 20 && !andou; t++) { await espera(400); andou = page.url() !== antes }
    if (!andou) break
  }
  const unicos = deduplicar(itens).slice(0, maxItens)
  return { total: unicos.length, itens: unicos, url }
}

export async function consultarCatalogo(termo, get) {
  try {
    const d = await get(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(termo)}&limit=5`)
    return { total: d.paging?.total ?? 0, produtos: (d.results || []).slice(0, 5).map(p => ({ id: p.id, nome: p.name, dominio: p.domain_id })) }
  } catch (e) { return { total: 0, produtos: [], erro: e.message } }
}

export async function consultarBuybox(idDoCatalogo, get) {
  try {
    const d = await get(`/products/${idDoCatalogo}/items?limit=20`)
    return { total: d.paging?.total ?? 0, itens: (d.results || []).map(i => ({ item_id: i.item_id, vendedor_id: i.seller_id, preco: i.price, frete_gratis: i.shipping?.free_shipping ?? null, loja_oficial_id: i.official_store_id ?? null })) }
  } catch (e) { return { total: 0, itens: [], erro: e.message } }
}

// Falha de um produto vira erro na linha dele e a coleta segue: um termo ruim nao derruba a rodada.
export async function coletar({ produtos, buscar, get, dormir = ms => new Promise(r => setTimeout(r, ms)), log = () => {} }) {
  const saida = []
  for (const p of produtos) {
    const catalogo = await consultarCatalogo(p.termo, get)
    const buybox = catalogo.produtos[0]?.id ? await consultarBuybox(catalogo.produtos[0].id, get) : null
    let busca
    try { busca = await buscar(p.termo) } catch (e) { busca = { total: 0, itens: [], url: urlDaBusca(p.termo), erro: `falha ao abrir a busca: ${e.message}`.slice(0, 200) } }
    log(`${p.nome}: ${busca.total} anuncios${busca.erro ? `, ${busca.erro}` : ''}`)
    saida.push({ ...p, catalogo, buybox, busca })
    await dormir(2000 + Math.floor(Math.random() * 1500))
  }
  return saida
}

// Nova tentativa com poucos produtos nao pode apagar a categoria: quem tem o mesmo nome e
// trocado no lugar, quem e novo entra no fim.
export function mesclarBruto(existente, novos) {
  const porNome = new Map(novos.map(p => [p.nome, p]))
  const saida = existente.map(p => (porNome.has(p.nome) ? porNome.get(p.nome) : p))
  const jaTinha = new Set(existente.map(p => p.nome))
  return [...saida, ...novos.filter(p => !jaTinha.has(p.nome))]
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  let browser = null
  try {
    const a = argumentos(process.argv.slice(2))
    const pasta = join(RAIZ, 'fornecedores', a.fornecedor)
    const produtos = lerEntrada(join(pasta, `pesquisa-input-${a.categoria}.json`))
    const token = await tokenMl()
    browser = await conectar()
    const ctx = browser.contexts()[0] || (await browser.newContext())
    const page = await ctx.newPage()
    const dados = await coletar({
      produtos,
      buscar: termo => coletarBusca(page, termo, a),
      get: caminho => mlGet(caminho, { token }),
      log: m => console.error(m),
    })
    await page.close().catch(() => {})
    const bruto = join(pasta, `_raw-pesquisa-${a.categoria}.json`)
    const final = existsSync(bruto) ? mesclarBruto(JSON.parse(readFileSync(bruto, 'utf8')), dados) : dados
    writeFileSync(bruto, JSON.stringify(final, null, 2) + '\n')
    console.error(`coleta gravada em ${bruto} (custo zero)`)
    if (!a.semProcessar) {
      const r = processar({ fornecedor: a.fornecedor, categoria: a.categoria })
      console.log(`${r.produtos} produtos: ${Object.entries(r.distribuicao).filter(([, n]) => n).map(([c, n]) => `${n} ${c}`).join(', ')}`)
      for (const f of r.arquivos) console.log(f)
    }
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  } finally {
    // numa conexao por CDP, close so desconecta: o Chrome dedicado continua aberto
    if (browser) await browser.close().catch(() => {})
  }
}
