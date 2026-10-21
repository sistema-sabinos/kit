// Citacoes no formato (<rotulo> N, marca). Rotulo 'aula': mentor.md do /aprender-curso, marca =
// minuto (6:15, 1:02:03) ou pagina (p. 41). Rotulo 'fonte': persona da /clonar-especialista, que
// aceita tambem o trecho de pagina web (§3). Com mais de um curso (citacoesComCurso), a citacao
// leva o curso no fim: (aula N, marca, <curso>). Funcoes puras: quem le os arquivos e o
// conferir-citacoes.mjs.

const TEMPO_OU_PAGINA = /\d{1,2}(?::\d{2}){1,2}|p\. \d+/.source
const MARCAS = { aula: TEMPO_OU_PAGINA, fonte: `${TEMPO_OU_PAGINA}|${/§\d+/.source}` }
const NUMERO_ARQUIVO = /^(\d+)-.*\.md$/
// nome da pasta do curso em inteligencia/cursos/: minusculas, sem acento, com hifen
const CURSO = /[a-z0-9]+(?:-[a-z0-9]+)*/.source

// arquivos: [{ nome, texto }] com o nome do arquivo dentro da pasta. Problema repetido sai uma vez
// so. onde: sufixo que diz o curso (' em x') nas mensagens que nao trazem a pasta.
function conferirArquivos(citacoes, arquivos, rotulo, pasta, onde, problemas) {
  const porNumero = new Map()
  for (const a of arquivos) {
    const m = a.nome.match(NUMERO_ARQUIVO)
    if (!m) continue
    const n = Number(m[1])
    if (!porNumero.has(n)) porNumero.set(n, [])
    porNumero.get(n).push(a)
  }
  for (const c of citacoes) {
    const n = c[rotulo]
    const achadas = porNumero.get(n) ?? []
    if (!achadas.length) problemas.add(`${rotulo} ${n} nao existe em ${pasta}/`)
    else if (achadas.length > 1) problemas.add(`${rotulo} ${n} em dois arquivos${onde}: ${achadas.map(a => a.nome).sort().join(', ')}`)
    else if (!achadas[0].texto.includes(`[${c.marca}]`)) problemas.add(`${rotulo} ${n} sem a marca [${c.marca}]${onde}`)
  }
}

const linhasDe = texto => String(texto ?? '').split(/\r?\n/)

export function citacoesDe(rotulo, pasta) {
  if (!MARCAS[rotulo]) throw new Error(`rotulo desconhecido: ${rotulo}`)
  const CITACAO = new RegExp(`\\(${rotulo} (\\d+), (${MARCAS[rotulo]})\\)`, 'g')
  const CITACAO_INTEIRA = new RegExp(`^${CITACAO.source}$`)
  // busca larga: tudo que abre com (rotulo ou (rotulos, sem diferenciar maiuscula, ate o ) ou o fim da linha
  const QUASE_CITACAO = new RegExp(`\\(\\s*${rotulo}s?\\b[^)]*(?:\\)|$)`, 'gi')

  function acharCitacoes(texto) {
    const citacoes = []
    linhasDe(texto).forEach((l, i) => {
      for (const m of l.matchAll(CITACAO)) citacoes.push({ [rotulo]: Number(m[1]), marca: m[2], linha: i + 1 })
    })
    return citacoes
  }

  // Citacao quase no formato ('(Aula 3, 6:15)', '(aula 3, p.41)', '(aulas 3 e 4, 6:15)') que a busca
  // exata deixaria passar calada: cada uma vira problema em vez de sumir.
  function acharForaDoFormato(texto) {
    const fora = []
    linhasDe(texto).forEach((l, i) => {
      for (const m of l.matchAll(QUASE_CITACAO)) if (!CITACAO_INTEIRA.test(m[0])) fora.push({ trecho: m[0], linha: i + 1 })
    })
    return fora
  }

  function conferir(citacoes, arquivos) {
    const problemas = new Set()
    conferirArquivos(citacoes, arquivos, rotulo, pasta, '', problemas)
    return { ok: problemas.size === 0, problemas: [...problemas] }
  }

  return { acharCitacoes, acharForaDoFormato, conferir }
}

export const { acharCitacoes, acharForaDoFormato, conferir } = citacoesDe('aula', 'aulas')

// Mais de um curso: (aula N, marca, <curso>), conferida contra <pasta>/<curso>/aulas/. Citacao sem
// o curso, que no modo de um curso so passaria, aqui vira problema proprio.
export function citacoesComCurso(pasta) {
  const CITACAO = new RegExp(`\\(aula (\\d+), (${TEMPO_OU_PAGINA}), (${CURSO})\\)`, 'g')
  const CITACAO_INTEIRA = new RegExp(`^${CITACAO.source}$`)
  const SEM_CURSO = new RegExp(`^\\(aula \\d+, (?:${TEMPO_OU_PAGINA})\\)$`)
  const QUASE_CITACAO = /\(\s*aulas?\b[^)]*(?:\)|$)/gi

  function acharCitacoes(texto) {
    const citacoes = []
    linhasDe(texto).forEach((l, i) => {
      for (const m of l.matchAll(CITACAO)) citacoes.push({ aula: Number(m[1]), marca: m[2], curso: m[3], linha: i + 1 })
    })
    return citacoes
  }

  function acharForaDoFormato(texto) {
    const fora = []
    linhasDe(texto).forEach((l, i) => {
      for (const m of l.matchAll(QUASE_CITACAO)) if (!CITACAO_INTEIRA.test(m[0])) fora.push({ trecho: m[0], linha: i + 1, semCurso: SEM_CURSO.test(m[0]) })
    })
    return fora
  }

  // cursos: Map <curso> -> [{ nome, texto }] dos aulas/ dele; curso fora do Map nao existe na pasta
  function conferir(citacoes, cursos) {
    const problemas = new Set()
    const porCurso = new Map()
    for (const c of citacoes) {
      if (!porCurso.has(c.curso)) porCurso.set(c.curso, [])
      porCurso.get(c.curso).push(c)
    }
    for (const [curso, dele] of porCurso) {
      if (!cursos.has(curso)) problemas.add(`curso ${curso} nao existe em ${pasta}/`)
      else conferirArquivos(dele, cursos.get(curso), 'aula', `${curso}/aulas`, ` em ${curso}`, problemas)
    }
    return { ok: problemas.size === 0, problemas: [...problemas] }
  }

  return { acharCitacoes, acharForaDoFormato, conferir }
}
