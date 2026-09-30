// Gate A do gate de marca: a marca aparece no Mercado Livre hoje? O Mercado Livre pode limpar
// uma marca inteira do site sem publicar nada, e o jeito de saber e medir. Zero anuncio
// sozinho nao prova proibicao (pode ser que ninguem venda): por isso a marca de controle na
// mesma rodada e o cruzamento com a ANVISA.
import { casaPalavraInteira, norm } from './texto.mjs'

export function urlDaBusca(marca) {
  const slug = encodeURIComponent(String(marca).trim().toLowerCase()).replace(/%20/g, '-')
  return `https://lista.mercadolivre.com.br/${slug}`
}

// Roda DENTRO da pagina da busca (o Playwright serializa a funcao). Fica so com o cartao de
// fora: o seletor duplo casa o cartao e o miolo dele, e contaria cada anuncio duas vezes.
// O rotulo de marca do cartao importa: tem marca que vende sem o proprio nome no titulo.
export function lerBusca() {
  const todos = [...document.querySelectorAll('li.ui-search-layout__item, div.poly-card')]
  const cards = todos.filter(c => !todos.some(o => o !== c && o.contains(c)))
  const itens = cards.map(c => ({
    titulo: c.querySelector('h2, .poly-component__title')?.innerText?.trim() || '',
    rotulo: c.querySelector('.poly-component__brand, .poly-component__seller')?.innerText?.trim() || '',
    link: (c.querySelector('a')?.href || '').split('#')[0],
  }))
  const qtd = document.querySelector('[class*="quantity-results"]')?.innerText || ''
  const texto = document.body.innerText.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toUpperCase()
  return { itens, qtd, semResultado: /NAO HA ANUNCIOS/.test(texto) }
}

export function medirPresenca(bruto, marca, aliases = []) {
  const vistos = new Set()
  const itens = (bruto.itens || []).filter(i => {
    if (!i.titulo) return false
    const k = i.link || i.titulo
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
  if (!itens.length && !bruto.semResultado) {
    throw new Error('nenhum anuncio lido na busca do Mercado Livre: a pagina mudou ou pediu verificacao. Abra a busca no Chrome dedicado e confira')
  }
  const chaves = [marca, ...aliases].filter(k => norm(k))
  const bate = s => chaves.some(k => casaPalavraInteira(s, k))
  const com = itens.filter(i => bate(i.titulo) || bate(i.rotulo))
  const totalBusca = parseInt(((bruto.qtd || '').match(/[\d.]+/) || ['0'])[0].replace(/\./g, ''), 10) || 0
  const veredito = com.length === 0 ? 'AUSENTE' : com.length < 3 ? 'RARA' : 'PRESENTE'
  return { totalBusca, cardsLidos: itens.length, anunciosComAMarca: com.length, exemplos: com.slice(0, 3).map(i => i.titulo), veredito }
}

export async function presencaNoML(page, marca, aliases = [], { esperarMs = 3200 } = {}) {
  const url = urlDaBusca(marca)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(esperarMs)
  if (/login|registration|captcha/i.test(page.url())) {
    throw new Error('o Mercado Livre pediu login ou verificacao: entre na sua conta no Chrome dedicado e rode de novo')
  }
  let bruto
  try {
    bruto = await page.evaluate(lerBusca)
  } catch (e) {
    // A busca as vezes navega de novo depois de carregar (visto no ensaio): espera e le de novo.
    if (!/context was destroyed|navigation/i.test(e.message)) throw e
    await page.waitForTimeout(esperarMs)
    bruto = await page.evaluate(lerBusca)
  }
  return { url, ...medirPresenca(bruto, marca, aliases) }
}
