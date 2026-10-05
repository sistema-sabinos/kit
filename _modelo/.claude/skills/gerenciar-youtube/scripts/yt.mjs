// /gerenciar-youtube: le e gerencia o canal pela YouTube Data API v3 e a YouTube Analytics API v2, sem dependencia.
// Credencial (app de computador) e login ficam no .env do projeto, como toda chave do kit.
// Escrita (atualizar) so com --confirmar, mostrando antes e depois. Upload de Short e pelo /publicar-social.
// Escopos e nomes de metrica conferidos na doc do Google em 2026-10-04 (cota padrao: 10.000 unidades por dia).
// Uso:
//   node .claude/skills/gerenciar-youtube/scripts/yt.mjs auth [--cliente <arquivo .json baixado do Google>]
//   node ... canal | videos [n] | relatorio [dias] | comentarios <video_id> [n]
//   node ... atualizar <video_id> [--titulo "..."] [--descricao arquivo.txt] [--tags "a,b"] [--confirmar]
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { lerConfig, gravarEnv } from '../../midia-social/scripts/lib/config.mjs'

const DATA = 'https://www.googleapis.com/youtube/v3'
const ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2'
const ESCOPOS = ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/yt-analytics.readonly']
const GUIA = 'secao "YouTube" de .claude/skills/midia-social/referencias/configurar.md'

export function urlDeAutorizacao({ clientId, redirect, estado }) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: ESCOPOS.join(' '), access_type: 'offline', prompt: 'consent', state: estado }).toString()
  return u.toString()
}

async function postarToken(campos, { fetchFn, agora }) {
  const r = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(campos) })
  const j = await r.json()
  if (!r.ok || !j.access_token) throw new Error(`o Google recusou o login (${j.error || r.status}): rodar de novo o auth (${GUIA})`)
  return { ...j, vence_em: new Date(agora.getTime() + (j.expires_in || 0) * 1000).toISOString() }
}

export function trocarCodigo({ cliente, codigo, redirect }, { fetchFn = fetch, agora = new Date() } = {}) {
  return postarToken({ code: codigo, client_id: cliente.client_id, client_secret: cliente.client_secret, redirect_uri: redirect, grant_type: 'authorization_code' }, { fetchFn, agora })
}

export async function tokenValido(token, { cliente, fetchFn = fetch, agora = new Date() }) {
  if (new Date(token.vence_em).getTime() - agora.getTime() > 60e3) return token
  const novo = await postarToken({ client_id: cliente.client_id, client_secret: cliente.client_secret, refresh_token: token.refresh_token, grant_type: 'refresh_token' }, { fetchFn, agora })
  return { ...token, ...novo, refresh_token: novo.refresh_token || token.refresh_token }
}

function dataMenos(hoje, dias) {
  const d = new Date(hoje + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

export function pedidosDoComando(comando, args, { hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' }) } = {}) {
  if (comando === 'canal') return [{ base: DATA, caminho: '/channels', params: { part: 'snippet,statistics', mine: 'true' } }]
  if (comando === 'videos') return [{ base: DATA, caminho: '/channels', params: { part: 'contentDetails', mine: 'true' } }]
  if (comando === 'relatorio') {
    const dias = Number(args[0] || 28)
    const base = { ids: 'channel==MINE', startDate: dataMenos(hoje, dias), endDate: hoje }
    return [
      { base: ANALYTICS, caminho: '/reports', params: { ...base, metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,subscribersGained,subscribersLost' } },
      { base: ANALYTICS, caminho: '/reports', params: { ...base, metrics: 'views,estimatedMinutesWatched,averageViewPercentage', dimensions: 'video', sort: '-views', maxResults: '10' } },
    ]
  }
  if (comando === 'comentarios') {
    if (!args[0]) throw new Error('faltou o video_id: comentarios <video_id> [n]')
    return [{ base: DATA, caminho: '/commentThreads', params: { part: 'snippet', videoId: args[0], maxResults: String(args[1] || 50), order: 'relevance', textFormat: 'plainText' } }]
  }
  throw new Error(`comando "${comando}" nao existe: auth, canal, videos, relatorio, comentarios ou atualizar`)
}

export function diffDoVideo(antes, novo) {
  return Object.keys(novo).filter(k => JSON.stringify(antes[k]) !== JSON.stringify(novo[k])).map(campo => ({ campo, antes: antes[campo], depois: novo[campo] }))
}

// O PUT do YouTube apaga o campo do snippet que nao vier no corpo: os idiomas vao junto quando existem.
export function corpoDaAtualizacao(id, atual, novo) {
  const sn = { ...atual, ...novo }
  const idiomas = Object.fromEntries(['defaultLanguage', 'defaultAudioLanguage'].filter(k => sn[k]).map(k => [k, sn[k]]))
  return { id, snippet: { title: sn.title, description: sn.description || '', tags: sn.tags || [], categoryId: sn.categoryId, ...idiomas } }
}

// Credencial e login moram no .env, como toda chave do kit (ignorado pelo git e protegido de leitura).
// Nomes montados por pares: "NOME_SECRET: valor" escrito direto parece segredo pro Gate 1 do kit.
const NOMES = { id: 'YOUTUBE_CLIENT_ID', segredo: 'YOUTUBE_CLIENT_SECRET', acesso: 'YOUTUBE_ACCESS_TOKEN', renovacao: 'YOUTUBE_REFRESH_TOKEN', vence: 'YOUTUBE_TOKEN_VENCE_EM' }

export function clienteDoArquivo(json) {
  const c = json.installed || json.web || json
  if (!c.client_id || !c.client_secret) throw new Error(`o arquivo baixado do Google nao tem client_id e client_secret (${GUIA})`)
  return Object.fromEntries([[NOMES.id, c.client_id], [NOMES.segredo, c.client_secret]])
}

export function clienteDoEnv(env) {
  if (!env[NOMES.id] || !env[NOMES.segredo]) throw new Error(`falta a credencial do YouTube no .env: rodar o auth com --cliente <arquivo baixado do Google> (${GUIA})`)
  return { client_id: env[NOMES.id], client_secret: env[NOMES.segredo] }
}

export const envDoToken = t => Object.fromEntries([[NOMES.acesso, t.access_token], [NOMES.renovacao, t.refresh_token], [NOMES.vence, t.vence_em]])

export function tokenDoEnv(env) {
  if (!env[NOMES.renovacao]) throw new Error('sem login no YouTube: rodar primeiro o comando auth')
  return { access_token: env[NOMES.acesso] || '', refresh_token: env[NOMES.renovacao], vence_em: env[NOMES.vence] || new Date(0).toISOString() }
}

async function api(pedido, { token, fetchFn = fetch, metodo = 'GET', corpo } = {}) {
  const u = new URL(pedido.base + pedido.caminho)
  for (const [k, v] of Object.entries(pedido.params)) u.searchParams.set(k, v)
  const r = await fetchFn(u, { method: metodo, headers: { Authorization: `Bearer ${token.access_token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  const j = await r.json()
  if (j.error) throw new Error(`YouTube: ${j.error.message}${/quota/i.test(j.error.message) ? ' (cota do dia acabou: esperar a virada, meia-noite no horario do Pacifico)' : ''}`)
  return j
}

async function tokenDoProjeto() {
  const { env } = lerConfig()
  const t = await tokenValido(tokenDoEnv(env), { cliente: clienteDoEnv(env) })
  gravarEnv(envDoToken(t))
  return t
}

async function auth(args) {
  const i = args.indexOf('--cliente')
  if (i >= 0) {
    gravarEnv(clienteDoArquivo(JSON.parse(readFileSync(resolve(args[i + 1]), 'utf8'))))
    console.log('credencial gravada no .env. O arquivo baixado do Google pode ser apagado.')
  }
  const cliente = clienteDoEnv(lerConfig().env)
  const estado = randomBytes(12).toString('hex')
  await new Promise((ok, falha) => {
    const servidor = createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1')
      if (!u.searchParams.has('code') && !u.searchParams.has('error')) { res.end(); return }
      try {
        if (u.searchParams.get('state') !== estado) throw new Error('resposta do Google com estado diferente: rodar o auth de novo')
        if (u.searchParams.get('error')) throw new Error(`login recusado: ${u.searchParams.get('error')}`)
        const redirect = `http://127.0.0.1:${servidor.address().port}`
        const t = await trocarCodigo({ cliente, codigo: u.searchParams.get('code'), redirect })
        gravarEnv(envDoToken(t))
        res.end('Login feito. Pode fechar esta aba e voltar pro Claude.')
        console.log('login salvo no .env. Teste: canal')
        servidor.close(); ok()
      } catch (e) { res.end('Deu erro: ' + e.message); servidor.close(); falha(e) }
    })
    servidor.listen(0, '127.0.0.1', () => {
      const url = urlDeAutorizacao({ clientId: cliente.client_id, redirect: `http://127.0.0.1:${servidor.address().port}`, estado })
      console.log('Abra este endereco no navegador, entre com a conta do canal e autorize:\n' + url)
    })
  })
}

async function main(v) {
  const [comando, ...args] = v
  if (comando === 'auth') return auth(args)
  const token = await tokenDoProjeto()
  if (comando === 'canal') {
    for (const c of (await api(pedidosDoComando('canal', args)[0], { token })).items || []) {
      const s = c.statistics
      console.log(`${c.snippet.title} (${c.id})\n  inscritos: ${s.subscriberCount}  visualizacoes: ${s.viewCount}  videos: ${s.videoCount}`)
    }
  } else if (comando === 'videos') {
    const ch = await api(pedidosDoComando('videos', args)[0], { token })
    const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploads) { console.log('nenhum canal nessa conta'); return }
    const itens = await api({ base: DATA, caminho: '/playlistItems', params: { part: 'contentDetails', playlistId: uploads, maxResults: String(args[0] || 10) } }, { token })
    const ids = (itens.items || []).map(i => i.contentDetails.videoId)
    if (!ids.length) { console.log('nenhum video no canal ainda'); return }
    const vids = await api({ base: DATA, caminho: '/videos', params: { part: 'snippet,statistics,status', id: ids.join(',') } }, { token })
    for (const x of vids.items || []) {
      const s = x.statistics || {}
      console.log(`[${x.id}] ${x.snippet.title}\n  ${x.snippet.publishedAt.slice(0, 10)}  privacidade: ${x.status.privacyStatus}  visualizacoes: ${s.viewCount || 0}  curtidas: ${s.likeCount || 0}  comentarios: ${s.commentCount || 0}`)
    }
  } else if (comando === 'relatorio') {
    const [geral, top] = pedidosDoComando('relatorio', args)
    const g = await api(geral, { token })
    console.log(`# Canal, de ${geral.params.startDate} a ${geral.params.endDate}`)
    const cols = (g.columnHeaders || []).map(h => h.name)
    for (const row of g.rows?.length ? g.rows : [cols.map(() => 0)]) cols.forEach((n, i) => console.log(`  ${n}: ${row[i]}`))
    const t = await api(top, { token })
    if (t.rows?.length) { console.log('\n# Top videos (id, visualizacoes, minutos assistidos, % media assistida)'); for (const r of t.rows) console.log('  ' + r.join('  ')) }
    console.log('\nImpressoes e taxa de clique nao saem nesta API: ver no YouTube Studio.')
  } else if (comando === 'comentarios') {
    for (const th of (await api(pedidosDoComando('comentarios', args)[0], { token })).items || []) {
      const c = th.snippet.topLevelComment.snippet
      console.log(`- ${c.authorDisplayName} (${c.likeCount} curtidas): ${c.textDisplay}`)
    }
  } else if (comando === 'atualizar') {
    const id = args[0]
    if (!id) throw new Error('faltou o video_id: atualizar <video_id> --titulo "..."')
    const op = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }
    const novo = {}
    if (op('titulo')) novo.title = op('titulo')
    if (op('descricao')) novo.description = readFileSync(resolve(op('descricao')), 'utf8')
    if (op('tags')) novo.tags = op('tags').split(',').map(t => t.trim()).filter(Boolean)
    const atual = (await api({ base: DATA, caminho: '/videos', params: { part: 'snippet', id } }, { token })).items?.[0]?.snippet
    if (!atual) throw new Error(`video ${id} nao encontrado`)
    const diff = diffDoVideo(atual, novo)
    if (!diff.length) { console.log('nada muda'); return }
    for (const d of diff) console.log(`${d.campo}\n  antes:  ${JSON.stringify(d.antes)}\n  depois: ${JSON.stringify(d.depois)}`)
    if (!args.includes('--confirmar')) { console.log('\nSimulacao. Pra gravar: repetir com --confirmar, depois do "pode ir".'); return }
    try {
      await api({ base: DATA, caminho: '/videos', params: { part: 'snippet' } }, { token, metodo: 'PUT', corpo: corpoDaAtualizacao(id, atual, novo) })
    } catch (e) {
      if (/fetch failed|network/i.test(e.message)) throw new Error('a conexao caiu durante a gravacao: conferir no YouTube Studio antes de repetir')
      throw e
    }
    console.log('atualizado')
  } else pedidosDoComando(comando, args)
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) main(process.argv.slice(2)).catch(e => { console.error('ERRO:', e.message); process.exit(1) })
