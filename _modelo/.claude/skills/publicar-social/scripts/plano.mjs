// Plano de publicacao: da pasta producao/<post>/ sai o que vai pra cada rede, sem tocar em rede nenhuma.
// Separado da casca pra a simulacao (o que o aluno ve antes do "pode ir") ser exatamente o que roda depois.
// Regras do Buffer medidas em uso real: carrossel vai como type "post"; TikTok foto nao aceita rotulo de IA
// e precisa de 4 imagens; YouTube nao recebe imagem e exige categoria; teto de 10 imagens.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exigir } from '../../midia-social/scripts/lib/config.mjs'

export const REDES = ['instagram', 'tiktok', 'youtube']
const MAX_SLIDES = 10
const MIN_SLIDES_TIKTOK = 4

// Brasilia e UTC-3 o ano todo (sem horario de verao desde 2019).
export function utcDeBrasilia(quando) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(String(quando || '').trim())
  if (!m) throw new Error('--quando no formato "AAAA-MM-DD HH:MM" (horario de Brasilia), ex.: "2026-10-10 11:30"')
  const [a, me, d, h, mi] = m.slice(1).map(Number)
  const local = new Date(Date.UTC(a, me - 1, d, h, mi))
  if (local.getUTCFullYear() !== a || local.getUTCMonth() !== me - 1 || local.getUTCDate() !== d || h > 23 || mi > 59) throw new Error(`a data ${quando} nao existe`)
  return new Date(local.getTime() + 3 * 3600e3).toISOString()
}

export function brasiliaParaUTC(quando, agora = new Date()) {
  const utc = utcDeBrasilia(quando)
  if (new Date(utc).getTime() < agora.getTime() + 5 * 60e3) throw new Error('--quando precisa ser pelo menos 5 minutos no futuro')
  return utc
}

const semAcento = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

export function lerTextoDoPost(texto) {
  const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/)
  const secoes = {}
  let atual = null
  for (const l of linhas) {
    const h = /^##\s+(.+)$/.exec(l)
    if (h) { atual = semAcento(h[1]); secoes[atual] = []; continue }
    if (atual) secoes[atual].push(l)
  }
  // texto que ainda e o do molde (uma linha inteira entre < e >) nunca vai pro ar
  const pega = nome => {
    const t = (secoes[nome] || []).join('\n').trim()
    if (t.split('\n').some(l => /^<[^>]+>$/.test(l.trim()))) throw new Error(`post.md ainda tem o texto do molde em "## ${nome}": escrever o texto de verdade antes de publicar`)
    return t
  }
  const legenda = pega('legenda')
  if (!legenda) throw new Error('post.md sem a secao "## Legenda" (quem escreve e a /pauta; molde em producao/_molde/post.md)')
  const ia = linhas.some(l => /^ia:\s*sim\s*$/i.test(l.trim()))
  return { legenda, tituloYoutube: pega('youtube titulo'), descricaoYoutube: pega('youtube descricao'), ia }
}

const ordenar = lista => lista.filter(f => /^slide-\d+\.(png|jpe?g)$/i.test(f)).sort()

export function acharMidia(dirFinal, { ls = d => { try { return readdirSync(d) } catch { return [] } }, mtime = f => statSync(f).mtimeMs } = {}) {
  const nomes = ls(dirFinal)
  const mp4 = nomes.filter(f => /\.mp4$/i.test(f) && !f.includes('-preview')).map(f => join(dirFinal, f)).sort((a, b) => mtime(b) - mtime(a))
  const slides = ordenar(nomes).map(f => join(dirFinal, f))
  if (mp4.length && slides.length) throw new Error(`${dirFinal} tem mp4 e slide ao mesmo tempo: deixar so um tipo de post na pasta final/`)
  if (mp4.length) return { tipo: 'video', video: mp4[0] }
  if (!slides.length) throw new Error(`nenhum mp4 nem slide-NN.png em ${dirFinal}: o arquivo final ainda nao chegou`)
  const dir916 = dirFinal + '-916'
  return { tipo: 'carrossel', slides, slides916: ordenar(ls(dir916)).map(f => join(dir916, f)) }
}

export function montarPlano({ dir, quando, capa, redes, config, agora = new Date(), ls, mtime, lerTexto = f => readFileSync(f, 'utf8') }) {
  const avisos = []
  const midia = acharMidia(join(dir, 'final'), { ls, mtime })
  const texto = lerTextoDoPost(lerTexto(join(dir, 'post.md')))
  const dueAt = brasiliaParaUTC(quando, agora)
  for (const r of redes || []) if (!REDES.includes(r)) throw new Error(`--redes: "${r}" nao existe (${REDES.join(', ')})`)
  let escolhidas = redes ? [...redes] : REDES.filter(r => config[`canal_${r}`])
  if (redes) exigir({ config, env: {} }, escolhidas.map(r => `canal_${r}`))
  if (!escolhidas.length) throw new Error('nenhuma rede configurada: rodar /midia-social pra ligar os canais do Buffer')
  const posts = []
  let capaMs
  if (midia.tipo === 'video') {
    if (capa != null) {
      capaMs = Math.round(Number(String(capa).replace(',', '.')) * 1000)
      if (!(capaMs >= 0)) throw new Error('--capa em segundos, ex.: --capa 2.5')
    } else avisos.push('sem --capa: a capa do Reel e do TikTok vira o primeiro quadro do video')
    const meta = {
      instagram: { instagram: { type: 'reel', shouldShareToFeed: true, isAiGenerated: texto.ia } },
      tiktok: { tiktok: { isAiGenerated: texto.ia } },
    }
    for (const rede of escolhidas) {
      if (rede === 'youtube') {
        if (!texto.tituloYoutube || !texto.descricaoYoutube) throw new Error('post.md sem "## YouTube titulo" ou "## YouTube descricao": preencher ou publicar com --redes instagram,tiktok')
        posts.push({ rede, channelId: config.canal_youtube, text: texto.descricaoYoutube, midia: 'video',
          metadata: { youtube: { title: texto.tituloYoutube, categoryId: config.categoria_youtube || '22', privacy: 'public', notifySubscribers: true, madeForKids: false, embeddable: true, isAiGenerated: texto.ia } } })
      } else posts.push({ rede, channelId: config[`canal_${rede}`], text: texto.legenda, midia: 'video', metadata: meta[rede] })
    }
    return { tipo: 'video', arquivos: [midia.video], dueAt, posts, avisos, capaMs }
  }
  const { slides, slides916 } = midia
  if (slides.length > MAX_SLIDES) throw new Error(`${slides.length} slides: o Buffer aceita no maximo ${MAX_SLIDES} por post`)
  if (slides916.length && slides916.length !== slides.length) throw new Error(`final/ tem ${slides.length} slides e final-916/ tem ${slides916.length}: remontar os dois`)
  if (escolhidas.includes('youtube')) { escolhidas = escolhidas.filter(r => r !== 'youtube'); avisos.push('YouTube fora: o Buffer so publica video la') }
  if (escolhidas.includes('tiktok') && slides.length < MIN_SLIDES_TIKTOK) { escolhidas = escolhidas.filter(r => r !== 'tiktok'); avisos.push(`TikTok fora: foto la precisa de pelo menos ${MIN_SLIDES_TIKTOK} imagens`) }
  if (!escolhidas.length) throw new Error('nenhuma rede sobrou pra este carrossel')
  for (const rede of escolhidas) {
    if (rede === 'instagram') posts.push({ rede, channelId: config.canal_instagram, text: texto.legenda, midia: 'slides', metadata: { instagram: { type: 'post', shouldShareToFeed: true, isAiGenerated: texto.ia } } })
    if (rede === 'tiktok') posts.push({ rede, channelId: config.canal_tiktok, midia: slides916.length ? 'slides916' : 'slides',
      text: texto.ia ? `${texto.legenda}\n\n(imagens geradas com IA)` : texto.legenda,
      metadata: { tiktok: { title: texto.legenda.split('\n')[0].slice(0, 90) } } })
  }
  return { tipo: 'carrossel', arquivos: [...slides, ...slides916], slides, slides916, dueAt, posts, avisos }
}

// Registro da publicacao: a secao VALIDO AGORA e a lista do que esta agendado de verdade (uma linha por rede),
// reescrita a cada post apagado ou criado; o Historico so acumula. Linha "incerto" (id "?") e post que pode ter
// entrado no Buffer sem resposta: o proximo --confirmar confere no Buffer antes de qualquer coisa.
const RE_VALIDO = /## VALIDO AGORA\r?\n([\s\S]*?)(?=\r?\n## |$)/
const RE_LINHA = /^\|\s*(instagram|tiktok|youtube)\s*\|\s*([^|\s]+)\s*\|(?:\s*([^|]*?)\s*\|)?(?:\s*([^|]*?)\s*\|)?/
const SCRIPT = 'node .claude/skills/publicar-social/scripts/publicar-social.mjs'

export function linhasValidas(texto) {
  const m = RE_VALIDO.exec(String(texto))
  if (!m) return []
  return m[1].split(/\r?\n/).map(l => RE_LINHA.exec(l)).filter(Boolean).map(x => ({ rede: x[1], id: x[2], quando: x[3] || '', status: x[4] || '' }))
}

export const idsValidosAgora = texto => linhasValidas(texto).map(l => l.id).filter(id => id !== '?')

export function gravarPublicacao(textoAntigo, { linhas, evento, agora = new Date() }) {
  const carimbo = agora.toISOString().slice(0, 16).replace('T', ' ')
  const historicoAntigo = ((/## Historico\r?\n([\s\S]*)$/.exec(String(textoAntigo)) || [])[1] || '').trim()
  const ids = linhas.map(l => l.id).filter(id => id !== '?')
  const valido = linhas.length
    ? ['| Rede | Post ID | Quando (Brasilia) | Status |', '|---|---|---|---|',
      ...linhas.map(l => `| ${l.rede} | ${l.id} | ${l.quando} | ${l.status} |`), '',
      ids.length ? 'Desfazer: `' + `${SCRIPT} --apagar ${ids.join(',')}` + '`' : '',
      linhas.some(l => l.status === 'incerto') ? 'Linha "incerto": o post pode ter entrado no Buffer. O proximo --confirmar confere sozinho.' : '',
    ].filter(Boolean).join('\n')
    : 'nada agendado'
  const historico = [historicoAntigo, `- ${carimbo} UTC: ${evento}`].filter(Boolean).join('\n')
  return `# Publicacao\n\n## VALIDO AGORA\n\n${valido}\n\n## Historico\n\n${historico}\n`
}

export function tirarIds(texto, ids, agora = new Date()) {
  const linhas = linhasValidas(texto)
  const tirados = linhas.filter(l => ids.includes(l.id)).map(l => l.id)
  if (!tirados.length) return { texto, tirados }
  return { texto: gravarPublicacao(texto, { linhas: linhas.filter(l => !ids.includes(l.id)), evento: `apagado com --apagar: ${tirados.join(', ')}`, agora }), tirados }
}
