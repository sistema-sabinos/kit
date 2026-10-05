// Legenda automatica do YouTube (.vtt) vira texto limpo: "[m:ss] frase", uma por linha.
// A legenda automatica repete cada frase em tres blocos seguidos e traz marca de tempo por
// palavra; sem limpar, uma aula de 20 min passa de 200 KB e enche a conversa a toa.

const BLOCO = /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> /

export function tempo(hhmmss) {
  const [h, m, s] = hhmmss.split(':').map(Number)
  const ss = String(Math.floor(s)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function limparVtt(texto, janela = 3) {
  const saida = []
  const recentes = []
  let inicio = null
  for (const bruta of texto.split(/\r?\n/)) {
    const b = BLOCO.exec(bruta)
    if (b) { inicio = b[1]; continue }
    if (inicio == null) continue
    const linha = bruta.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!linha || recentes.includes(linha)) continue
    saida.push(`[${tempo(inicio)}] ${linha}`)
    recentes.push(linha)
    if (recentes.length > janela) recentes.shift()
  }
  return saida
}
