// Citacoes do mentor.md no formato (aula N, marca), com marca = minuto (6:15, 1:02:03) ou pagina
// (p. 41). Funcoes puras: quem le os arquivos e o conferir-citacoes.mjs.

const CITACAO = /\(aula (\d+), (\d{1,2}(?::\d{2}){1,2}|p\. \d+)\)/g
const CITACAO_INTEIRA = new RegExp(`^${CITACAO.source}$`)
// busca larga: tudo que abre com (aula ou (aulas, sem diferenciar maiuscula, ate o ) ou o fim da linha
const QUASE_CITACAO = /\(\s*aulas?\b[^)]*(?:\)|$)/gi
const NUMERO_ARQUIVO = /^(\d+)-.*\.md$/

export function acharCitacoes(texto) {
  const citacoes = []
  String(texto ?? '').split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(CITACAO)) citacoes.push({ aula: Number(m[1]), marca: m[2], linha: i + 1 })
  })
  return citacoes
}

// Citacao quase no formato ('(Aula 3, 6:15)', '(aula 3, p.41)', '(aulas 3 e 4, 6:15)') que a busca
// exata deixaria passar calada: cada uma vira problema em vez de sumir.
export function acharForaDoFormato(texto) {
  const fora = []
  String(texto ?? '').split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(QUASE_CITACAO)) if (!CITACAO_INTEIRA.test(m[0])) fora.push({ trecho: m[0], linha: i + 1 })
  })
  return fora
}

// aulas: [{ nome, texto }] com o nome do arquivo dentro de aulas/. Problema repetido sai uma vez so.
export function conferir(citacoes, aulas) {
  const porNumero = new Map()
  for (const a of aulas) {
    const m = a.nome.match(NUMERO_ARQUIVO)
    if (!m) continue
    const n = Number(m[1])
    if (!porNumero.has(n)) porNumero.set(n, [])
    porNumero.get(n).push(a)
  }
  const problemas = new Set()
  for (const { aula, marca } of citacoes) {
    const achadas = porNumero.get(aula) ?? []
    if (!achadas.length) problemas.add(`aula ${aula} nao existe em aulas/`)
    else if (achadas.length > 1) problemas.add(`aula ${aula} em dois arquivos: ${achadas.map(a => a.nome).sort().join(', ')}`)
    else if (!achadas[0].texto.includes(`[${marca}]`)) problemas.add(`aula ${aula} sem a marca [${marca}]`)
  }
  return { ok: problemas.size === 0, problemas: [...problemas] }
}
