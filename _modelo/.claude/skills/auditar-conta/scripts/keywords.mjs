// Palavra-chave por anuncio: cruza os termos mais buscados da categoria (API de tendencias do
// Mercado Livre, gratis) com o titulo de cada anuncio e aponta o termo forte que o titulo nao usa.
// E assistente de pesquisa: ordena por demanda, e quem conhece o produto escolhe o que encaixa.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'e', 'a', 'o', 'os', 'as', 'em', 'un', 'und', 'p', 'c'])

export const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(DIACRITICOS, '')
export const palavras = s => normalizar(s).split(/[^a-z0-9]+/).filter(t => t.length > 1 && !PARADAS.has(t))

// tendencias: [{ termo, posicao }] da categoria do anuncio. Termo relevante divide pelo menos uma
// palavra com o titulo ou com os atributos; a nota pesa as palavras em comum pela popularidade.
export function analisarAnuncio(it, tendencias) {
  const doProduto = new Set([...palavras(it.title), ...palavras((it.attributes || []).map(a => a.value_name).filter(Boolean).join(' '))])
  const doTitulo = new Set(palavras(it.title))
  const relevantes = tendencias
    .map(t => {
      const ps = palavras(t.termo)
      const comum = ps.filter(p => doProduto.has(p)).length
      return { ...t, comum, noTitulo: ps.length > 0 && ps.every(p => doTitulo.has(p)), nota: comum / Math.sqrt(t.posicao) }
    })
    .filter(t => t.comum > 0)
    .sort((x, y) => y.nota - x.nota || x.posicao - y.posicao)
  return { relevantes: relevantes.slice(0, 6), faltando: relevantes.filter(t => !t.noTitulo).slice(0, 5) }
}

export async function minerar({ itens, get }) {
  const porCategoria = new Map()
  for (const cat of new Set(itens.map(i => i.category_id).filter(Boolean))) {
    try { porCategoria.set(cat, (await get(`/trends/MLB/${cat}`) || []).map((x, i) => ({ termo: x.keyword, posicao: i + 1 }))) } catch { porCategoria.set(cat, []) }
  }
  return itens.filter(i => i.status !== 'closed').map(it => ({ it, ...analisarAnuncio(it, porCategoria.get(it.category_id) || []) }))
}

export function relatorio(analises, data) {
  const md = [`# Palavra-chave por anuncio, ${data}`, '', 'Termos mais buscados na categoria de cada anuncio. "Faltando no titulo" e termo forte que o titulo nao usa: entra so se descrever o produto, e so antes da primeira venda (depois o titulo trava; ai o lugar e a descricao).', '']
  for (const a of analises) {
    md.push(`## ${a.it.title}`, `${a.it.id}, ${a.it.status}`)
    if (!a.relevantes.length) { md.push('- Sem termo em alta que case com este produto.', ''); continue }
    md.push(`- Em alta e relevantes: ${a.relevantes.map(t => `${t.termo} (#${t.posicao})`).join(', ')}`)
    md.push(a.faltando.length ? `- Faltando no titulo: ${a.faltando.map(t => t.termo).join(', ')}` : '- O titulo ja cobre os termos fortes.', '')
  }
  return md.join('\n') + '\n'
}
