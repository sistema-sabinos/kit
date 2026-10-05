// A disputa dentro de uma pagina de catalogo (/p/ no link). La a foto e a mesma pra todo
// vendedor, entao a pergunta que existe e quanto custa entrar: a escada de preco, quantos
// disputam, quem tem frete gratis, loja oficial e Full. Sem custo do produto, nao opina
// sobre margem. A pagina /up/ e de um vendedor so (a lista de vendedores volta com 1) e
// conta como anuncio, fora daqui. Conferido ao vivo em 2026-10-04.

const ehNum = v => typeof v === 'number' && Number.isFinite(v)

export function percentil(valores, p) {
  const r = valores.filter(ehNum).sort((a, b) => a - b)
  if (!r.length) return null
  const pos = (r.length - 1) * p
  const baixo = Math.floor(pos)
  const alto = Math.ceil(pos)
  return r[baixo] + (r[alto] - r[baixo]) * (pos - baixo)
}

// Conta so sobre quem respondeu o campo: null e "nao deu pra apurar", nunca "nao tem".
export function fracaoConhecida(ofertas, ler) {
  const conhecidas = ofertas.map(ler).filter(v => v != null)
  if (!conhecidas.length) return { fracao: null, base: 0 }
  return { fracao: conhecidas.filter(Boolean).length / conhecidas.length, base: conhecidas.length }
}

// Item da resposta de /products/<id>/items virando oferta.
export function ofertaDaApi(i) {
  return {
    item_id: i?.item_id ?? null,
    preco: ehNum(i?.price) ? i.price : null,
    modalidade: i?.listing_type_id ?? null,
    frete_gratis: typeof i?.shipping?.free_shipping === 'boolean' ? i.shipping.free_shipping : null,
    loja_oficial: i?.official_store_id === undefined ? null : i.official_store_id !== null,
    logistica: i?.shipping?.logistic_type ?? null,
  }
}

// Lista inteira de vendedores, de 100 em 100. 404 ("No winners found") e catalogo sem
// oferta ativa: volta sem_dado em vez de derrubar a rodada.
export async function listaDeVendedores(idCatalogo, get, { maximo = 500 } = {}) {
  const ofertas = []
  try {
    for (let offset = 0; offset < maximo; offset += 100) {
      const d = await get(`/products/${idCatalogo}/items?limit=100&offset=${offset}`)
      const lote = d?.results || []
      ofertas.push(...lote.map(ofertaDaApi))
      if (lote.length < 100 || ofertas.length >= (d?.paging?.total ?? 0)) break
    }
    return { id: idCatalogo, ofertas }
  } catch (e) {
    if (e.status === 404) return { id: idCatalogo, ofertas: [], sem_dado: 'o catalogo nao tem vendedor ativo agora (404)' }
    return { id: idCatalogo, ofertas: [], sem_dado: `a lista de vendedores falhou: ${String(e.message).slice(0, 160)}` }
  }
}

// Lotes de `tamanho` em paralelo, pra 40 catalogos nao virarem 40 esperas em fila.
export async function emLotes(lista, tamanho, fazer) {
  const saida = []
  for (let i = 0; i < lista.length; i += tamanho) saida.push(...(await Promise.all(lista.slice(i, i + tamanho).map(fazer))))
  return saida
}

export function analisarCatalogo(ofertas = []) {
  const precos = ofertas.map(o => o.preco).filter(ehNum)
  const modalidades = {}
  for (const o of ofertas) if (o.modalidade) modalidades[o.modalidade] = (modalidades[o.modalidade] ?? 0) + 1
  return {
    vendedores: ofertas.length,
    piso: precos.length ? Math.min(...precos) : null,
    p25: percentil(precos, 0.25),
    mediana: percentil(precos, 0.5),
    teto: precos.length ? Math.max(...precos) : null,
    frete_gratis: fracaoConhecida(ofertas, o => o.frete_gratis),
    loja_oficial: fracaoConhecida(ofertas, o => o.loja_oficial),
    modalidades,
    full: ofertas.filter(o => o.logistica === 'fulfillment').length,
  }
}

// Card patrocinado que e so mais um vendedor de um catalogo ja presente na busca e o mesmo
// produto contado duas vezes. Sai, e e contado. Card de catalogo nunca sai por aqui.
export function tirarDuplicatas(anuncios, listas) {
  const vendedoresDeCatalogo = new Set(listas.flatMap(l => l.ofertas.map(o => o.item_id)).filter(Boolean))
  const fica = []
  const saiu = []
  for (const a of anuncios) (a.tipo !== 'catalogo' && a.patrocinado && vendedoresDeCatalogo.has(a.id) ? saiu : fica).push(a)
  return { anuncios: fica, duplicatas: saiu.map(a => a.id) }
}
