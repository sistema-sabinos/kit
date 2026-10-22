// Lista as aulas de um curso (playlist do YouTube ou de outro site que o yt-dlp abre), na ordem certa,
// com a duracao total e os tokens que o Gemini gastaria assistindo tudo. Nunca gasta: so le a lista.
// O titulo vem no idioma original (youtube:lang=pt): sem isso o YouTube traduz e corta, e o numero da
// aula some do titulo.
// Pasta de videos ou lista de links: --titulos le um arquivo com uma aula por linha, "titulo" ou
// "titulo | duracao" (segundos, m:ss ou h:mm:ss; NA avisa e conta 0 s), e passa pela mesma ordem e
// pelos mesmos lotes.
// Curso grande sai com a linha LOTES (passo 1b da SKILL).
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/listar-aulas.mjs "<link da playlist>" [--json]
//   node .claude/skills/aprender-curso/scripts/listar-aulas.mjs --titulos <arquivo> [--na-ordem] [--json]
// --na-ordem: a lista ja vem na ordem decidida com a pessoa; nao reordena, so avisa e divide em lotes.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ordenarAulas, textoDosLotes } from './lib/aulas.mjs'

const minutos = s => `${Math.round(s / 60)} min`

export function lerPlaylist(url, { rodar = execFileSync } = {}) {
  const saida = rodar('yt-dlp', ['--flat-playlist', '-J', '--no-warnings', '--extractor-args', 'youtube:lang=pt', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const j = JSON.parse(saida)
  const entradas = j.entries ?? [j]
  return {
    titulo: j.title ?? null,
    canal: j.channel ?? j.uploader ?? null,
    itens: entradas.map(e => ({ id: e.id, titulo: e.title ?? '', duracao: e.duration ?? null, url: e.url ?? e.webpage_url ?? null })),
  }
}

// "1:02:03" -> 3723, "12:40" -> 760, "95" e "95.4" (o yt-dlp de outro site) -> 95; o resto vira
// null (sem duracao, conta 0 s)
function segundosDe(s) {
  if (/^\d+(?:\.\d+)?$/.test(s)) return Math.round(Number(s))
  return /^\d+(?::\d{1,2}){1,2}$/.test(s) ? s.split(':').reduce((t, p) => t * 60 + Number(p), 0) : null
}

export function lerTitulos(texto) {
  const avisos = []
  const itens = String(texto).split(/\r?\n/).map((l, i) => [l.trim(), i + 1]).filter(([l]) => l).map(([l, n]) => {
    const corte = l.lastIndexOf('|')
    const depois = corte < 0 ? '' : l.slice(corte + 1).trim()
    const duracao = corte < 0 ? null : segundosDe(depois)
    // NA e o que o yt-dlp grava quando o site nao informa a duracao (5.24, link solto)
    const na = corte >= 0 && depois === 'NA'
    // "1h02" ou "45min" contariam 0 s calados e baixariam o custo e os lotes
    if (na) avisos.push(`sem duracao na linha ${n} (NA: o site nao informou); a aula conta 0 s`)
    else if (duracao == null && /\d/.test(depois)) avisos.push(`duracao que nao entendi na linha ${n} ("${depois}"): use segundos, m:ss ou h:mm:ss; ate corrigir, a aula conta 0 s`)
    const titulo = corte < 0 || (duracao == null && !na) ? l : l.slice(0, corte).trim()
    return { id: `linha ${n}`, titulo, duracao }
  })
  return { titulo: null, canal: null, itens, avisos }
}

export function linhasDaLista(lista, r) {
  const linhas = [`${lista.titulo ?? 'Curso'}${lista.canal ? ` | ${lista.canal}` : ''}`]
  linhas.push(`${r.aulas.length} aulas, ${minutos(r.segundos)} no total, ordem por ${r.criterio}`)
  r.aulas.forEach((a, i) => linhas.push(`  ${String(i + 1).padStart(2)}. ${a.numero == null ? '[sem numero] ' : `[aula ${a.numero}] `}${a.titulo} (${a.duracao ? minutos(a.duracao) : '?'}, ${a.tokens_gemini.toLocaleString('pt-BR')} tokens) [${a.id}]`))
  linhas.push(`Gemini assistindo tudo: uns ${r.tokens_gemini.toLocaleString('pt-BR')} tokens de entrada (conferir o preco do dia antes de rodar)`)
  if (r.lotes.length) linhas.push(`LOTES: ${textoDosLotes(r.lotes)}`)
  for (const a of r.avisos) linhas.push(`AVISO: ${a}`)
  return linhas
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
  const args = process.argv.slice(2)
  const iTitulos = args.indexOf('--titulos')
  const alvo = iTitulos < 0 ? args[0] : args[iTitulos + 1]
  if (!alvo || alvo.startsWith('--')) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/listar-aulas.mjs "<link da playlist>" [--json]\n     node .claude/skills/aprender-curso/scripts/listar-aulas.mjs --titulos <arquivo> [--na-ordem] [--json]')
    process.exit(1)
  }
  let lista
  if (iTitulos >= 0) {
    try { lista = lerTitulos(readFileSync(alvo, 'utf8')) } catch (e) {
      console.error(`Nao consegui ler a lista de titulos ${alvo}: ${e.message.split('\n')[0]}`)
      process.exit(1)
    }
  } else {
    try { lista = lerPlaylist(alvo) } catch (e) {
      console.error(`Nao consegui abrir a playlist. Confira se o link abre no navegador sem login e se o yt-dlp esta instalado. Quem le esta mensagem e a IA: se faltar o yt-dlp, diga a pessoa em uma frase, peca o sim e instale voce mesma, nunca passe o comando pra ela (Windows: winget install --id yt-dlp.yt-dlp -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity; Mac: brew install yt-dlp; no Windows, depois peca pra pessoa fechar todas as janelas do VS Code e abrir de novo). Detalhe: ${e.message.split('\n')[0]}`)
      process.exit(1)
    }
  }
  // --na-ordem: lista ja na ordem decidida com a pessoa, so recalcula os lotes
  const r = ordenarAulas(lista.itens, { manterOrdem: iTitulos >= 0 && args.includes('--na-ordem') })
  r.avisos.push(...(lista.avisos ?? []))
  if (args.includes('--json')) {
    console.log(JSON.stringify({ titulo: lista.titulo, canal: lista.canal, ...r, ...(r.lotes.length ? { linha_lotes: `LOTES: ${textoDosLotes(r.lotes)}` } : {}) }, null, 2))
  } else {
    for (const l of linhasDaLista(lista, r)) console.log(l)
  }
}
