// Ordem das aulas de um curso. Playlist do YouTube vem na ordem que o dono montou, e muitas
// vem de tras pra frente; o numero no titulo manda. Aula sem numero (bonus, live) vai pro fim
// na ordem da playlist, e numero repetido devolve tudo pra ordem da playlist. Qualquer duvida
// vira aviso, porque checagem que escolhe sozinha sem avisar da sobra erra calada.

// Gemini assistindo video com imagem e som: tokens de entrada por segundo de video.
// Medido em 2026-10-04: 43.946 tokens numa aula de 481 s, 153.780 numa de 1.688 s
// (gemini-3.8-flash, rota YouTube). Recalibrar com o numero que o ver-video.mjs imprime.
export const TOKENS_POR_SEGUNDO = 92

export const tokensGemini = segundos => Math.round(segundos * TOKENS_POR_SEGUNDO)

// "aula 3", "class 3", "lesson 3", "ep 3", "episodio 3"; o ano solto nunca conta.
const PADRAO = /\b(?:aula|aul[aã]o|class|lesson|ep|epis[oó]dio)\s*(?:n[ºo°.]?\s*)?0*(\d{1,3})\b/gi

export function numeroDaAula(titulo) {
  const achados = [...String(titulo ?? '').matchAll(PADRAO)].map(m => Number(m[1]))
  return achados.length ? achados[achados.length - 1] : null
}

export function ordenarAulas(itens) {
  const avisos = []
  const todas = itens.map((a, i) => ({ ...a, posicao: i + 1, numero: numeroDaAula(a.titulo), tokens_gemini: tokensGemini(Number(a.duracao) || 0) }))
  if (!todas.length) avisos.push('a playlist veio vazia (privada, removida ou link errado)')

  const numeradas = todas.filter(a => a.numero != null)
  const semNumero = todas.filter(a => a.numero == null)
  const vistos = new Map()
  for (const a of numeradas) vistos.set(a.numero, (vistos.get(a.numero) ?? 0) + 1)
  const repetidos = [...vistos].filter(([, n]) => n > 1).map(([num]) => num)

  let aulas = todas
  let criterio = 'ordem da playlist'
  if (repetidos.length) {
    avisos.push(`numero de aula repetido (${repetidos.join(', ')}), mantive a ordem da playlist`)
  } else if (numeradas.length) {
    aulas = [...numeradas].sort((a, b) => a.numero - b.numero).concat(semNumero)
    criterio = semNumero.length ? 'numero no titulo, sem numero no fim' : 'numero no titulo'
    const faltando = []
    const max = Math.max(...numeradas.map(a => a.numero))
    for (let n = 1; n <= max; n++) if (!vistos.has(n)) faltando.push(n)
    if (faltando.length) avisos.push(`numero de aula faltando: ${faltando.join(', ')} (aula fora da playlist, ou com o numero escondido no titulo)`)
  }
  if (semNumero.length) avisos.push(`sem numero no titulo${criterio === 'ordem da playlist' ? '' : ', ficaram no fim'}: ${semNumero.map(a => `"${a.titulo}"`).join('; ')}`)

  const segundos = aulas.reduce((s, a) => s + (Number(a.duracao) || 0), 0)
  return { criterio, aulas, avisos, segundos, tokens_gemini: tokensGemini(segundos) }
}
