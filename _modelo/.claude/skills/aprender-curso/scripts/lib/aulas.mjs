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

// Curso grande nao cabe numa conversa: passando de CURSO_GRANDE, vira lotes consecutivos de no
// maximo maxAulas e maxSegundos, um lote por conversa (passo 1b da SKILL). Aula sem duracao conta
// 0 s e so o teto de aulas pesa; aula maior que o teto fica num lote sozinha, nunca some.
export const CURSO_GRANDE = { aulas: 15, segundos: 8 * 3600 }
export const LOTE = { maxAulas: 8, maxSegundos: 4 * 3600 }

export function lotesDoCurso(aulas, { maxAulas = LOTE.maxAulas, maxSegundos = LOTE.maxSegundos } = {}) {
  const dur = a => Number(a.duracao) || 0
  const total = aulas.reduce((s, a) => s + dur(a), 0)
  if (aulas.length <= CURSO_GRANDE.aulas && total <= CURSO_GRANDE.segundos) return []
  const lotes = []
  let atual = null
  aulas.forEach((a, i) => {
    if (!atual || atual.aulas + 1 > maxAulas || atual.segundos + dur(a) > maxSegundos) {
      atual = { lote: `L${lotes.length + 1}`, de: i + 1, ate: i + 1, aulas: 0, segundos: 0 }
      lotes.push(atual)
    }
    atual.ate = i + 1
    atual.aulas += 1
    atual.segundos += dur(a)
  })
  return lotes
}

// "L1 aulas 1-8, L2 aula 9": o numero e a posicao na lista ja ordenada, a mesma do listar-aulas
export const textoDosLotes = lotes => lotes.map(l => `${l.lote} ${l.de === l.ate ? `aula ${l.de}` : `aulas ${l.de}-${l.ate}`}`).join(', ')

// manterOrdem: a ordem ja foi decidida com a pessoa (lista recalculada depois do passo 1); so avisa e
// divide em lotes, sem reordenar.
export function ordenarAulas(itens, { manterOrdem = false } = {}) {
  const avisos = []
  const todas = itens.map((a, i) => ({ ...a, posicao: i + 1, numero: numeroDaAula(a.titulo), tokens_gemini: tokensGemini(Number(a.duracao) || 0) }))
  if (!todas.length) avisos.push('a playlist veio vazia (privada, removida ou link errado)')

  const numeradas = todas.filter(a => a.numero != null)
  const semNumero = todas.filter(a => a.numero == null)
  const vistos = new Map()
  for (const a of numeradas) vistos.set(a.numero, (vistos.get(a.numero) ?? 0) + 1)
  const repetidos = [...vistos].filter(([, n]) => n > 1).map(([num]) => num)

  let aulas = todas
  let criterio = manterOrdem ? 'ordem do arquivo' : 'ordem da playlist'
  if (manterOrdem) {
    if (repetidos.length) avisos.push(`numero de aula repetido (${repetidos.join(', ')}), mantive a ordem do arquivo`)
  } else if (repetidos.length) {
    avisos.push(`numero de aula repetido (${repetidos.join(', ')}), mantive a ordem da playlist`)
  } else if (numeradas.length) {
    aulas = [...numeradas].sort((a, b) => a.numero - b.numero).concat(semNumero)
    criterio = semNumero.length ? 'numero no titulo, sem numero no fim' : 'numero no titulo'
    const faltando = []
    const max = Math.max(...numeradas.map(a => a.numero))
    for (let n = 1; n <= max; n++) if (!vistos.has(n)) faltando.push(n)
    if (faltando.length) avisos.push(`numero de aula faltando: ${faltando.join(', ')} (aula fora da playlist, ou com o numero escondido no titulo)`)
  }
  if (semNumero.length) avisos.push(`sem numero no titulo${criterio.startsWith('ordem d') ? '' : ', ficaram no fim'}: ${semNumero.map(a => `"${a.titulo}"`).join('; ')}`)

  const segundos = aulas.reduce((s, a) => s + (Number(a.duracao) || 0), 0)
  return { criterio, aulas, avisos, segundos, tokens_gemini: tokensGemini(segundos), lotes: lotesDoCurso(aulas) }
}
