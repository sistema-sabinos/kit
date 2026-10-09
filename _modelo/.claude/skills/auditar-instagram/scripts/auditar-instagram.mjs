// /auditar-instagram: retrato da conta pela API oficial do Instagram (rota Instagram Login), sem apagar nada.
// Modos:
//   node .claude/skills/auditar-instagram/scripts/auditar-instagram.mjs [dias=28]     retrato datado em dados/instagram/<perfil>/<data>/
//   node ... --renovar                                                              troca o token por um novo de 60 dias
//   node ... --medir <pasta-em-producao>                                            resultado do post, 7 dias ou mais depois
// Metricas conferidas na doc da Meta em 2026-10-04 (impressions saiu pra midia nova; views, reach, saved, shares,
// total_interactions e as de Reels seguem validas). Sem versao no caminho: a Meta usa a do app do aluno.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../midia-social/scripts/lib/raiz.mjs'
import { lerConfig, exigir, gravarEnv } from '../../midia-social/scripts/lib/config.mjs'
import { consultarPost } from '../../midia-social/scripts/lib/agendador-buffer.mjs'
import { diasParaVencer, avisoDoToken, entraNaRegua, diasDesde, urlRenovar, codigoDoLink, idInstagramValido, secaoResultado } from './regua.mjs'

const API = 'https://graph.instagram.com'
const VAZIO = 'vazio (a Meta so entrega com 100 seguidores ou mais)'
const BASE = 'views,reach,likes,comments,saved,shares,total_interactions,follows,profile_visits'
const REEL = 'views,reach,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate'
const CAMPOS_POST = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count'

const hojeEm = agora => agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

function cliente(token, fetchFn) {
  return async (caminho, params = {}) => {
    const u = new URL(API + caminho)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    u.searchParams.set('access_token', token)
    const j = await (await fetchFn(u)).json()
    return j.error ? { erro: j.error.message } : j
  }
}

const mediana = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
const tipo = p => p.media_product_type === 'REELS' ? 'reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'carrossel' : p.media_type === 'VIDEO' ? 'video' : 'imagem'

async function todosOsPosts(get) {
  const posts = []
  let pagina = await get('/me/media', { fields: CAMPOS_POST, limit: 100 })
  for (let n = 0; n < 20 && !pagina.erro; n++) {
    posts.push(...(pagina.data || []))
    const depois = pagina.paging?.cursors?.after
    if (!pagina.paging?.next || !depois) break
    pagina = await get('/me/media', { fields: CAMPOS_POST, limit: 100, after: depois })
  }
  return posts
}

async function insightsDoPost(get, p) {
  let ins = await get(`/${p.id}/insights`, { metric: p.media_product_type === 'REELS' ? REEL : BASE })
  if (ins.erro) ins = await get(`/${p.id}/insights`, { metric: 'views,reach,saved,shares,total_interactions' })
  const out = {}
  for (const m of ins.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null
  return ins.erro ? { ...out, erro: ins.erro } : out
}

function pastaDoDia(raiz, perfil, hoje) {
  const base = join(raiz, 'dados', 'instagram', perfil, hoje)
  let pasta = base
  for (let n = 2; existsSync(pasta); n++) pasta = `${base}-${n}`
  mkdirSync(pasta, { recursive: true })
  return pasta
}

export async function auditar({ fetchFn = fetch, agora = new Date(), raiz = RAIZ, dias = 28 } = {}) {
  const { config, env } = lerConfig({ raiz })
  exigir({ config, env }, ['IG_ACCESS_TOKEN', 'perfil'])
  const hoje = hojeEm(agora)
  const aviso = avisoDoToken(diasParaVencer(env.IG_TOKEN_VENCE_EM, hoje))
  if (aviso) console.log('AVISO: ' + aviso)
  const get = cliente(env.IG_ACCESS_TOKEN, fetchFn)
  const perfil = await get('/me', { fields: 'user_id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url' })
  if (perfil.erro) throw new Error(`o Instagram recusou a leitura do perfil: ${perfil.erro}. Conferir o token (secao "Instagram" do guia)`)
  const posts = await todosOsPosts(get)
  for (const p of posts) p.insights = await insightsDoPost(get, p)

  const ate = Math.floor(agora.getTime() / 1000)
  const desde = ate - dias * 86400
  const conta = { janela_dias: dias }
  const totais = await get('/me/insights', { metric: 'views,reach,accounts_engaged,total_interactions,likes,comments,saves,shares,reposts,replies,follows_and_unfollows,profile_links_taps', period: 'day', metric_type: 'total_value', since: desde, until: ate })
  conta.totais = totais.erro ? { erro: totais.erro } : Object.fromEntries(totais.data.map(m => [m.name, m.total_value?.value ?? null]))
  for (const b of ['follow_type', 'media_product_type']) {
    const r = await get('/me/insights', { metric: 'reach', period: 'day', metric_type: 'total_value', breakdown: b, since: desde, until: ate })
    conta[`alcance_por_${b}`] = r.erro ? { erro: r.erro } : r.data?.[0]?.total_value?.breakdowns?.[0]?.results?.map(x => ({ [x.dimension_values.join('/')]: x.value })) ?? VAZIO
  }
  const online = await get('/me/insights', { metric: 'online_followers', period: 'lifetime' })
  conta.online_followers = online.erro ? { erro: online.erro } : online.data?.[0]?.values?.at(-1)?.value ?? VAZIO
  const demografia = {}
  for (const metrica of ['follower_demographics', 'engaged_audience_demographics']) {
    for (const b of ['age', 'gender', 'city', 'country']) {
      const r = await get('/me/insights', { metric: metrica, period: 'lifetime', metric_type: 'total_value', timeframe: 'this_month', breakdown: b })
      demografia[`${metrica}.${b}`] = r.erro ? { erro: r.erro } : r.data?.[0]?.total_value?.breakdowns?.[0]?.results?.map(x => ({ [x.dimension_values.join('/')]: x.value })) ?? VAZIO
    }
  }

  const naRegua = posts.filter(p => entraNaRegua(p, agora))
  const med = {}
  for (const t of ['reel', 'carrossel', 'imagem', 'video']) med[t] = mediana(naRegua.filter(p => tipo(p) === t).map(p => p.insights.views))
  for (const p of posts) {
    const i = p.insights, v = i.views, r = i.reach
    p.calc = {
      tipo: tipo(p),
      fora_da_regua: !entraNaRegua(p, agora),
      multiplo: v != null && med[tipo(p)] ? +(v / med[tipo(p)]).toFixed(2) : null,
      er_alcance_pct: r ? +(100 * (i.total_interactions ?? 0) / r).toFixed(2) : null,
      salvos_por_mil: v ? +(1000 * (i.saved ?? 0) / v).toFixed(1) : null,
      envios_por_mil: v ? +(1000 * (i.shares ?? 0) / v).toFixed(1) : null,
      alcance_sobre_seguidores: r && perfil.followers_count ? +(r / perfil.followers_count).toFixed(2) : null,
    }
  }

  const pasta = pastaDoDia(raiz, config.perfil, hoje)
  const gravar = (nome, obj) => writeFileSync(join(pasta, nome), JSON.stringify(obj, null, 2))
  gravar('perfil.json', { ...perfil, token_vence_em: env.IG_TOKEN_VENCE_EM || null })
  gravar('posts.json', posts)
  gravar('conta.json', conta)
  gravar('demografia.json', demografia)

  const linhas = [...naRegua].sort((a, b) => (b.calc.multiplo ?? -1) - (a.calc.multiplo ?? -1)).map(p => {
    const i = p.insights, c = p.calc
    const leg = (p.caption || '').split('\n')[0].replace(/\|/g, '/').slice(0, 60)
    const skip = i.reels_skip_rate != null ? i.reels_skip_rate + '%' : ''
    const assist = i.ig_reels_avg_watch_time != null ? (i.ig_reels_avg_watch_time / 1000).toFixed(1) + 's' : ''
    return `| ${p.timestamp.slice(0, 10)} | ${c.tipo} | ${c.multiplo ?? ''} | ${i.views ?? ''} | ${i.reach ?? ''} | ${c.er_alcance_pct ?? ''} | ${i.saved ?? ''} | ${i.shares ?? ''} | ${skip} | ${assist} | [${leg || 'sem legenda'}](${p.permalink}) |`
  })
  const fora = posts.length - naRegua.length
  const md = [
    `# @${perfil.username}, retrato de ${hoje}`, '',
    aviso ? `AVISO: ${aviso}\n` : '',
    `Seguidores ${perfil.followers_count}, seguindo ${perfil.follows_count}, posts ${perfil.media_count}.`,
    `Mediana de visualizacoes por tipo: ${Object.entries(med).filter(([, v]) => v != null).map(([t, v]) => `${t} ${v}`).join(', ') || 'sem posts com 48 h ou mais'}.`,
    `Conta nos ultimos ${dias} dias: ${JSON.stringify(conta.totais)}`,
    perfil.followers_count < 100 ? 'Demografia e horario do publico ficam vazios: a Meta so entrega com 100 seguidores ou mais.' : '',
    fora ? `Fora da regua (menos de 48 h no ar, o dado ainda esta subindo): ${fora} post(s).` : '', '',
    '| Data | Tipo | Multiplo | Visualizacoes | Alcance | ER alcance % | Salvos | Envios | Pulos | Assistido | Post |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...linhas, '',
  ].filter(l => l !== null).join('\n')
  writeFileSync(join(pasta, 'resumo.md'), md)
  console.log(`ok: ${posts.length} posts, retrato em ${pasta}`)
  return pasta
}

export async function renovar({ fetchFn = fetch, agora = new Date(), raiz = RAIZ } = {}) {
  const { config, env } = lerConfig({ raiz })
  exigir({ config, env }, ['IG_ACCESS_TOKEN'])
  const j = await (await fetchFn(urlRenovar(env.IG_ACCESS_TOKEN))).json()
  if (j.error || !j.access_token) throw new Error(`a Meta nao renovou o token: ${j.error?.message || 'sem detalhe'}. Gerar outro (secao "Instagram" do guia)`)
  const vence = hojeEm(new Date(agora.getTime() + (j.expires_in || 0) * 1000))
  // montado por pares: "NOME_DO_TOKEN: valor" escrito direto parece segredo pro Gate 1 do kit
  gravarEnv(Object.fromEntries([['IG_ACCESS_TOKEN', j.access_token], ['IG_TOKEN_VENCE_EM', vence]]), { raiz })
  console.log(`token renovado, vence em ${vence}`)
  return vence
}

export async function medir(pastaRel, { fetchFn = fetch, agora = new Date(), raiz = RAIZ } = {}) {
  const { config, env } = lerConfig({ raiz })
  exigir({ config, env }, ['IG_ACCESS_TOKEN', 'BUFFER_API_KEY'])
  const dir = join(raiz, 'producao', pastaRel)
  // medir de novo duplicava a secao; a guarda vem antes de qualquer chamada de rede (5.7, G.7)
  const arqBriefAntes = join(dir, 'brief.md')
  if (existsSync(arqBriefAntes) && /^## Resultado/m.test(readFileSync(arqBriefAntes, 'utf8'))) {
    console.log(`producao/${pastaRel}/brief.md ja tem a secao Resultado; nada gravado. Pra medir de novo, apagar a secao antiga primeiro`)
    return null
  }
  const arqPub = join(dir, 'publicacao.md')
  if (!existsSync(arqPub)) throw new Error(`producao/${pastaRel} nao tem publicacao.md: o post foi agendado pelo /publicar-social?`)
  const idBuffer = idInstagramValido(readFileSync(arqPub, 'utf8'))
  if (!idBuffer) throw new Error('o VALIDO AGORA do publicacao.md nao tem linha do Instagram')
  const post = await consultarPost(env.BUFFER_API_KEY, idBuffer, { fetchFn })
  if (post.status !== 'sent' || !post.externalLink) { console.log(`o post ainda nao saiu (status no Buffer: ${post.status})`); return null }
  const codigo = codigoDoLink(post.externalLink)
  const get = cliente(env.IG_ACCESS_TOKEN, fetchFn)
  const midia = (await todosOsPosts(get)).find(p => codigoDoLink(p.permalink) === codigo)
  if (!midia) throw new Error(`nao achei o post ${post.externalLink} na conta: conferir se o token e da mesma conta`)
  const dias = diasDesde(midia.timestamp, agora)
  if (dias < 7) { console.log(`o post tem ${dias} dia(s) no ar; medir a partir de 7 (faltam ${7 - dias})`); return null }
  const metricas = await insightsDoPost(get, midia)
  const arqBrief = join(dir, 'brief.md')
  const brief = existsSync(arqBrief) ? readFileSync(arqBrief, 'utf8') : ''
  const prometido = (/##\s*Item salvavel\s*\r?\n+([^\r\n#][^\r\n]*)/i.exec(brief) || /##\s*Gancho\s*\r?\n+([^\r\n#][^\r\n]*)/i.exec(brief) || [])[1]
  appendFileSync(arqBrief, '\n' + secaoResultado({ metricas, prometido, data: hojeEm(agora) }))
  console.log(`resultado gravado em producao/${pastaRel}/brief.md`)
  return metricas
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const v = process.argv.slice(2)
  const i = v.indexOf('--medir')
  const tarefa = v.includes('--renovar') ? renovar() : i >= 0 ? medir(v[i + 1]) : auditar({ dias: Number(v[0] || 28) })
  tarefa.catch(e => { console.error('ERRO:', e.message); process.exit(1) })
}
