// Leitura da pagina publica do Instagram (sem login): data pelo codigo do link, numeros do og:description,
// mediana do perfil e ranking por multiplo. Funcoes puras, usadas pela coleta, pelo garimpo e pela frequencia.
// O og vem no idioma do Chrome do aluno, entao numero e rotulo se leem em portugues e em ingles.
const ALFA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export function dataDoCodigo(codigo) {
  let id = 0n
  for (const c of codigo) id = id * 64n + BigInt(ALFA.indexOf(c))
  return new Date(Number((id >> 23n) + 1314220021721n))
}

export function decodeEnt(s) {
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
}

const MULT = { mil: 1e3, k: 1e3, mi: 1e6, m: 1e6, b: 1e9 }
const NUM = '[\\d.,]+(?:\\s*(?:mil|mi|[KMB])(?![a-z]))?'

export function numero(s) {
  const m = /([\d.,]+)\s*(mil|mi|[kmb])?(?![a-z])/i.exec(String(s || ''))
  if (!m) return null
  const suf = (m[2] || '').toLowerCase()
  if (suf) return Math.round(parseFloat(m[1].replace(',', '.')) * MULT[suf])
  return Number(m[1].replace(/[.,]/g, ''))
}

export function parseOg(desc) {
  const d = decodeEnt(desc)
  const pega = rotulo => { const m = new RegExp(`(${NUM})\\s+${rotulo}`, 'i').exec(d); return m ? numero(m[1]) : null }
  const i = d.indexOf(': "')
  return {
    curtidas: pega('(?:likes?|curtidas?)'),
    comentarios: pega('(?:comments?|coment[aá]rios?)'),
    legenda: i >= 0 ? d.slice(i + 2).replace(/\.\s*$/, '').trim() : null,
  }
}

export function seguidoresDoOg(og) {
  const m = new RegExp(`(${NUM})\\s+(?:followers|seguidores)`, 'i').exec(decodeEnt(og))
  return m ? numero(m[1]) : null
}

export const proxy = p => Number.isFinite(p.curtidas) ? p.curtidas + 10 * (p.comentarios || 0) : null

export function mediana(lista) {
  const v = lista.filter(x => Number.isFinite(x)).sort((x, y) => x - y)
  if (!v.length) return null
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export function gradeDosLinks(links, teto = Infinity) {
  const vistos = new Map()
  for (const h of links) {
    const m = /\/(p|reel)\/([A-Za-z0-9_-]+)/.exec(h || '')
    if (m && !vistos.has(m[2])) vistos.set(m[2], { tipo: m[1] === 'reel' ? 'reel' : 'post', codigo: m[2], data: dataDoCodigo(m[2]) })
  }
  return [...vistos.values()].sort((a, b) => b.data - a.data).slice(0, teto)
}

// Multiplo contra a mediana da grade inteira do perfil; entra so o que esta na janela. Piso de curtidas porque
// multiplo alto em numero minusculo nao mede nada. Comentario acima de um terco das curtidas e sinal de
// automacao de funil ("comenta X que eu mando o link") inflando o proxy.
export function ranquear(perfis, { dias, piso = 0, agora = new Date() }) {
  const corte = agora.getTime() - dias * 864e5
  const todos = []
  for (const pf of perfis) {
    const base = mediana(pf.posts.map(proxy))
    for (const p of pf.posts) {
      const px = proxy(p)
      const multiplo = base && px ? Number((px / base).toFixed(2)) : null
      if (multiplo && new Date(p.data).getTime() >= corte) todos.push({ ...p, user: pf.user, seguidores: pf.seguidores ?? null, proxy: px, multiplo, funil: (p.comentarios || 0) > (p.curtidas || 0) / 3 })
    }
  }
  todos.sort((a, b) => b.multiplo - a.multiplo)
  const lista = todos.filter(p => (p.curtidas || 0) >= piso)
  return { lista, abaixoDoPiso: todos.length - lista.length }
}

export function ritmo(posts) {
  if (posts.length < 2) return null
  const datas = posts.map(p => new Date(p.data).getTime())
  const dias = (Math.max(...datas) - Math.min(...datas)) / 864e5
  return Number((posts.length / Math.max(dias, 0.5) * 7).toFixed(1))
}
