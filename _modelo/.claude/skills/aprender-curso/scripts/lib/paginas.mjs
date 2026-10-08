// Paginas do texto que o pdftotext devolve. Cada pagina termina num form feed, inclusive a
// ultima. A medida e pagina a pagina: media global deixa passar PDF misto (capitulo escaneado
// no meio) como se fosse texto, e as paginas sem texto somem do estudo caladas.

const CR = String.fromCharCode(13)
const FORM_FEED = String.fromCharCode(12)
const SUBSTITUICAO = String.fromCharCode(0xFFFD)

// Pagina com menos letras que isso, ou com mais dessa fracao de caractere de substituicao
// (fonte sem mapa de caracteres), conta como sem texto. Pagina escaneada sai do pdftotext so com
// o form feed, entao basta nenhuma letra: limite maior derrubava pagina curta de verdade (uma
// regra, um titulo de capitulo).
export const LIMITE_LETRAS = 1
export const LIMITE_SUBSTITUICAO = 0.05

// Razao tokens por palavra em portugues, medida uma vez na bancada pelo count_tokens.
// Enquanto for null, a estimativa de tokens sai como "sem medida". Medida: duas chamadas de
// claude -p (so a instrucao, e a instrucao com 2000 palavras), diferenca do total de entrada.
// Prosa (Dom Casmurro, Projeto Gutenberg 55752) deu 2,78; texto do kit com link e comando, 2,95.
export const RAZAO_TOKENS = {
  tokensPorPalavra: 2.8,
  medidoEm: '2026-10-08',
  modelo: 'claude-opus-5-5',
  fonte: 'claude -p --output-format json, usage de entrada, 2000 palavras de prosa em portugues',
}

export function cortarPaginas(texto) {
  const paginas = String(texto ?? '').split(CR).join('').split(FORM_FEED)
  if (paginas.length && paginas[paginas.length - 1] === '') paginas.pop()
  return paginas
}

export function marcarPaginas(paginas) {
  return paginas.map((p, i) => `[p. ${i + 1}]\n${p}`).join('\n')
}

const contar = (texto, padrao) => (texto.match(padrao) ?? []).length

export function medir(paginas) {
  const porPagina = paginas.map((p, i) => ({
    n: i + 1,
    letras: contar(p, /\p{L}/gu),
    substituicao: p.split(SUBSTITUICAO).length - 1,
  }))
  const palavras = paginas.reduce((s, p) => s + p.split(/\s+/).filter(Boolean).length, 0)
  return { paginas: paginas.length, palavras, porPagina }
}

const semTexto = ({ letras, substituicao }) =>
  letras < LIMITE_LETRAS || substituicao / (letras + substituicao) > LIMITE_SUBSTITUICAO

export function veredito(medida) {
  const vazias = medida.porPagina.filter(semTexto).map(p => p.n)
  let rotulo = 'misto'
  if (!medida.porPagina.length || vazias.length === medida.porPagina.length) rotulo = 'escaneado'
  else if (!vazias.length) rotulo = 'texto'
  return { rotulo, semTexto: vazias }
}

export function tokensEstimados(palavras, razao = RAZAO_TOKENS) {
  if (razao.tokensPorPalavra == null) return null
  return Math.round(palavras * razao.tokensPorPalavra)
}
