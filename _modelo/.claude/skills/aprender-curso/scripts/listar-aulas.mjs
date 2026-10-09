// Lista as aulas de um curso (playlist do YouTube ou de outro site que o yt-dlp abre), na ordem certa,
// com a duracao total e os tokens que o Gemini gastaria assistindo tudo. Nunca gasta: so le a lista.
// O titulo vem no idioma original (youtube:lang=pt): sem isso o YouTube traduz e corta, e o numero da
// aula some do titulo.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/listar-aulas.mjs "<link da playlist>" [--json]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ordenarAulas } from './lib/aulas.mjs'

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

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const url = process.argv[2]
  if (!url || url.startsWith('--')) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/listar-aulas.mjs "<link da playlist>" [--json]')
    process.exit(1)
  }
  let lista
  try { lista = lerPlaylist(url) } catch (e) {
    console.error(`Nao consegui abrir a playlist. Confira se o link abre no navegador sem login e se o yt-dlp esta instalado (Windows: winget install --id yt-dlp.yt-dlp -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity; Mac: brew install yt-dlp; depois feche todas as janelas do VS Code e abra de novo). Detalhe: ${e.message.split('\n')[0]}`)
    process.exit(1)
  }
  const r = ordenarAulas(lista.itens)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ titulo: lista.titulo, canal: lista.canal, ...r }, null, 2))
  } else {
    console.log(`${lista.titulo ?? 'Curso'}${lista.canal ? ` | ${lista.canal}` : ''}`)
    console.log(`${r.aulas.length} aulas, ${minutos(r.segundos)} no total, ordem por ${r.criterio}`)
    r.aulas.forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}. ${a.numero == null ? '[sem numero] ' : `[aula ${a.numero}] `}${a.titulo} (${a.duracao ? minutos(a.duracao) : '?'}, ${a.tokens_gemini.toLocaleString('pt-BR')} tokens) [${a.id}]`))
    console.log(`Gemini assistindo tudo: uns ${r.tokens_gemini.toLocaleString('pt-BR')} tokens de entrada (conferir o preco do dia antes de rodar)`)
    for (const a of r.avisos) console.log(`AVISO: ${a}`)
  }
}
