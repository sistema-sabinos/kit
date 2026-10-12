// Citacoes no formato (<rotulo> N, marca). Rotulo 'aula': mentor.md do /aprender-curso, marca =
// minuto (6:15, 1:02:03) ou pagina (p. 41). Rotulo 'fonte': persona da /clonar-especialista, que
// aceita tambem o trecho de pagina web (§3). Funcoes puras: quem le os arquivos e o
// conferir-citacoes.mjs.

const TEMPO_OU_PAGINA = /\d{1,2}(?::\d{2}){1,2}|p\. \d+/.source
const MARCAS = { aula: TEMPO_OU_PAGINA, fonte: `${TEMPO_OU_PAGINA}|${/§\d+/.source}` }
const NUMERO_ARQUIVO = /^(\d+)-.*\.md$/

export function citacoesDe(rotulo, pasta) {
  if (!MARCAS[rotulo]) throw new Error(`rotulo desconhecido: ${rotulo}`)
  const CITACAO = new RegExp(`\\(${rotulo} (\\d+), (${MARCAS[rotulo]})\\)`, 'g')
  const CITACAO_INTEIRA = new RegExp(`^${CITACAO.source}$`)
  // busca larga: tudo que abre com (rotulo ou (rotulos, sem diferenciar maiuscula, ate o ) ou o fim da linha
  const QUASE_CITACAO = new RegExp(`\\(\\s*${rotulo}s?\\b[^)]*(?:\\)|$)`, 'gi')

  function acharCitacoes(texto) {
    const citacoes = []
    String(texto ?? '').split(/\r?\n/).forEach((l, i) => {
      for (const m of l.matchAll(CITACAO)) citacoes.push({ [rotulo]: Number(m[1]), marca: m[2], linha: i + 1 })
    })
    return citacoes
  }

  // Citacao quase no formato ('(Aula 3, 6:15)', '(aula 3, p.41)', '(aulas 3 e 4, 6:15)') que a busca
  // exata deixaria passar calada: cada uma vira problema em vez de sumir.
  function acharForaDoFormato(texto) {
    const fora = []
    String(texto ?? '').split(/\r?\n/).forEach((l, i) => {
      for (const m of l.matchAll(QUASE_CITACAO)) if (!CITACAO_INTEIRA.test(m[0])) fora.push({ trecho: m[0], linha: i + 1 })
    })
    return fora
  }

  // arquivos: [{ nome, texto }] com o nome do arquivo dentro da pasta. Problema repetido sai uma vez so.
  function conferir(citacoes, arquivos) {
    const porNumero = new Map()
    for (const a of arquivos) {
      const m = a.nome.match(NUMERO_ARQUIVO)
      if (!m) continue
      const n = Number(m[1])
      if (!porNumero.has(n)) porNumero.set(n, [])
      porNumero.get(n).push(a)
    }
    const problemas = new Set()
    for (const c of citacoes) {
      const n = c[rotulo]
      const achadas = porNumero.get(n) ?? []
      if (!achadas.length) problemas.add(`${rotulo} ${n} nao existe em ${pasta}/`)
      else if (achadas.length > 1) problemas.add(`${rotulo} ${n} em dois arquivos: ${achadas.map(a => a.nome).sort().join(', ')}`)
      else if (!achadas[0].texto.includes(`[${c.marca}]`)) problemas.add(`${rotulo} ${n} sem a marca [${c.marca}]`)
    }
    return { ok: problemas.size === 0, problemas: [...problemas] }
  }

  return { acharCitacoes, acharForaDoFormato, conferir }
}

export const { acharCitacoes, acharForaDoFormato, conferir } = citacoesDe('aula', 'aulas')
