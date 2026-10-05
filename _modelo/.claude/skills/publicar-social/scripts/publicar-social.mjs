// /publicar-social: agenda o post pronto de producao/<pasta>/ no Instagram, TikTok e YouTube pelo Buffer.
// Sem --confirmar so mostra o plano. Com --confirmar, nesta ordem: confere no Buffer o que ficou incerto da
// ultima vez, barra repeticao sem --substituir, confere a fila, sobe toda a midia, e so entao apaga os antigos
// (com --substituir) e cria um post por rede. O publicacao.md se grava depois de cada post apagado ou criado,
// pra o registro nunca ficar atras do que esta no Buffer. Para na primeira falha, dizendo o que ficou.
// Uso:
//   node .claude/skills/publicar-social/scripts/publicar-social.mjs <pasta> --quando "AAAA-MM-DD HH:MM" [--capa s] [--redes instagram,tiktok]
//   node ... <pasta> --quando ... --confirmar [--substituir]
//   node ... --apagar <id>[,<id>...]
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join, basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../midia-social/scripts/lib/raiz.mjs'
import { lerConfig, exigir } from '../../midia-social/scripts/lib/config.mjs'
import { criarPost, apagarPost, consultarPost, pendentesPorCanal, acharPost, ErroIncerto } from '../../midia-social/scripts/lib/agendador-buffer.mjs'
import { subir } from '../../midia-social/scripts/lib/deposito.mjs'
import { montarPlano, brasiliaParaUTC, utcDeBrasilia, linhasValidas, gravarPublicacao, tirarIds } from './plano.mjs'

const FILA_GRATIS = 10
const SCRIPT = 'node .claude/skills/publicar-social/scripts/publicar-social.mjs'

export function argumentos(v) {
  const a = { pasta: null, quando: null, capa: null, redes: null, confirmar: false, substituir: false, apagar: null }
  const valor = (i, nome) => { if (v[i] === undefined || v[i].startsWith('--')) throw new Error(`${nome} precisa de um valor`); return v[i] }
  const lista = s => s.split(',').map(r => r.trim()).filter(Boolean)
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '--quando') a.quando = valor(++i, '--quando')
    else if (v[i] === '--capa') a.capa = valor(++i, '--capa')
    else if (v[i] === '--redes') a.redes = lista(valor(++i, '--redes'))
    else if (v[i] === '--apagar') a.apagar = lista(valor(++i, '--apagar'))
    else if (v[i] === '--confirmar') a.confirmar = true
    else if (v[i] === '--substituir') a.substituir = true
    else a.pasta = v[i]
  }
  return a
}

export function conferirFila({ pendentes, posts, saem }) {
  for (const p of posts) {
    const n = (pendentes[p.channelId] || 0) - (saem[p.channelId] || 0)
    if (n >= FILA_GRATIS) throw new Error(`fila cheia no ${p.rede}: ${n} posts esperando, o plano gratis do Buffer guarda ${FILA_GRATIS}. Esperar sair algum ou apagar um`)
  }
}

async function subirMidia(plano, subirFn, slug) {
  const pasta = `sabinos/${slug}`
  if (plano.tipo === 'video') return { video: await subirFn(plano.arquivos[0], `${pasta}/${basename(plano.arquivos[0])}`) }
  const urls = { slides: [], slides916: [] }
  for (const s of plano.slides) urls.slides.push(await subirFn(s, `${pasta}/${basename(s)}`))
  for (const s of plano.slides916 || []) urls.slides916.push(await subirFn(s, `${pasta}/916/${basename(s)}`))
  return urls
}

const naoExiste = e => /not.?found|nao encontrad|não encontrad/i.test(e?.message || '')

// deps: subir(arquivo, chave), criarPost(post), apagarPost(id), consultarPost(id), pendentes(channelIds),
// acharPost(channelId, dueAt), gravar(texto). Devolve { texto, feitos, falha }.
export async function publicar({ plano, textoPub, quando, substituir, slug, config, agora = () => new Date(), deps }) {
  let texto = textoPub
  let linhas = linhasValidas(texto)
  const canal = rede => config[`canal_${rede}`]
  const registrar = evento => { texto = gravarPublicacao(texto, { linhas, evento, agora: agora() }); deps.gravar(texto) }

  // 1. o que ficou incerto da ultima vez se confere no Buffer antes de qualquer coisa
  const incertas = linhas.filter(l => l.status === 'incerto')
  if (incertas.length) {
    for (const l of incertas) {
      let id
      try { id = await deps.acharPost(canal(l.rede), utcDeBrasilia(l.quando)) } catch (e) { throw new Error(`nao deu pra conferir no Buffer o post incerto do ${l.rede} (${e.message}): tentar de novo daqui a pouco`) }
      if (id) Object.assign(l, { id, status: 'scheduled' })
    }
    const achados = incertas.filter(l => l.status === 'scheduled').map(l => `${l.rede} ${l.id}`)
    linhas = linhas.filter(l => l.status !== 'incerto')
    registrar(`conferido no Buffer: ${achados.length ? `entraram ${achados.join(', ')}` : 'os incertos nao entraram'}`)
  }

  // 2. repeticao e fila, antes de subir nada
  const redesDoPlano = new Set(plano.posts.map(p => p.rede))
  const alvos = linhas.filter(l => redesDoPlano.has(l.rede))
  if (alvos.length && !substituir) throw new Error(`esta pasta ja tem post agendado em ${alvos.map(l => `${l.rede} (${l.id})`).join(', ')}. Pra trocar: repetir com --substituir, que apaga esses antes de criar os novos`)
  const saem = {}
  for (const l of alvos) saem[canal(l.rede)] = (saem[canal(l.rede)] || 0) + 1
  conferirFila({ pendentes: await deps.pendentes(plano.posts.map(p => p.channelId)), posts: plano.posts, saem })

  // 3. toda a midia sobe antes de apagar qualquer coisa
  let urls
  try { urls = await subirMidia(plano, deps.subir, slug) } catch (e) { throw new Error(`o envio da midia falhou (${e.message}). Nada foi apagado nem criado`) }
  brasiliaParaUTC(quando, agora())

  // 4. com --substituir, os antigos das redes pedidas saem um por um
  for (const l of alvos) {
    try {
      await deps.apagarPost(l.id)
    } catch (e) {
      let sumiu = false, estado = null
      if (!(e instanceof ErroIncerto)) {
        try { estado = (await deps.consultarPost(l.id))?.status } catch (e2) { sumiu = naoExiste(e2) }
      }
      if (!sumiu) {
        const motivo = estado === 'sent' ? `o post antigo do ${l.rede} (${l.id}) ja foi publicado e nao da pra substituir` : `nao deu pra apagar o post antigo do ${l.rede} (${l.id}): ${e.message}`
        return { texto, feitos: [], falha: { etapa: 'apagar', rede: l.rede, erro: motivo, incerto: e instanceof ErroIncerto } }
      }
    }
    linhas = linhas.filter(x => x !== l)
    registrar(`apagado ${l.rede} ${l.id} (substituir)`)
  }

  // 5. um post por rede, gravando depois de cada um
  const feitos = []
  for (const p of plano.posts) {
    const midia = plano.tipo === 'video' ? { videoUrl: urls.video, capaMs: plano.capaMs } : { imagensUrls: urls[p.midia] }
    let id = null
    try {
      id = (await deps.criarPost({ channelId: p.channelId, text: p.text, dueAt: plano.dueAt, metadata: p.metadata, ...midia })).id
    } catch (e) {
      if (!(e instanceof ErroIncerto)) return { texto, feitos, falha: { etapa: 'criar', rede: p.rede, erro: e.message, incerto: false } }
      try { id = await deps.acharPost(p.channelId, plano.dueAt) } catch {
        linhas.push({ rede: p.rede, id: '?', quando, status: 'incerto' })
        registrar(`${p.rede} incerto: ${e.message}`)
        return { texto, feitos, falha: { etapa: 'criar', rede: p.rede, erro: e.message, incerto: true } }
      }
      if (!id) return { texto, feitos, falha: { etapa: 'criar', rede: p.rede, erro: `${e.message}. Conferido no Buffer: nao entrou`, incerto: false } }
    }
    feitos.push({ rede: p.rede, id })
    linhas.push({ rede: p.rede, id, quando, status: 'scheduled' })
    registrar(`agendado ${p.rede} ${id}`)
  }
  return { texto, feitos, falha: null }
}

function mostrar(plano, quando) {
  for (const arq of plano.arquivos) console.log(`Arquivo: ${relative(RAIZ, arq)} (${(statSync(arq).size / 1e6).toFixed(1)} MB)`)
  console.log(`Quando:  ${quando} Brasilia (${plano.dueAt} UTC)`)
  if (plano.tipo === 'video') console.log(`Capa:    ${plano.capaMs == null ? 'primeiro quadro' : `quadro em ${plano.capaMs / 1000} s`}`)
  for (const p of plano.posts) {
    const m = Object.values(p.metadata)[0]
    console.log(`\n[${p.rede}]${m.title ? ` titulo: ${m.title}` : ''}`)
    console.log(p.text.split('\n').map(l => '  ' + l).join('\n'))
    if ('isAiGenerated' in m) console.log('  rotulo de IA: ' + (m.isAiGenerated ? 'sim' : 'nao'))
  }
  for (const a of plano.avisos) console.log(`\nAVISO: ${a}`)
}

// --apagar: apaga no Buffer e tira os ids do VALIDO AGORA de qualquer pasta de producao/ que os tenha.
async function apagarIds(chave, ids) {
  const apagados = []
  for (const id of ids) {
    try { await apagarPost(chave, id); apagados.push(id); console.log('apagado ' + id) } catch (e) { console.error(`FALHOU ao apagar ${id}: ${e.message}`); process.exitCode = 1 }
  }
  const prod = join(RAIZ, 'producao')
  for (const p of existsSync(prod) ? readdirSync(prod) : []) {
    const arq = join(prod, p, 'publicacao.md')
    if (!apagados.length || !existsSync(arq)) continue
    const r = tirarIds(readFileSync(arq, 'utf8'), apagados)
    if (r.tirados.length) { writeFileSync(arq, r.texto); console.log(`registro atualizado: producao/${p}/publicacao.md`) }
  }
}

async function main(v) {
  const a = argumentos(v)
  const { config, env } = lerConfig()
  const chave = env.BUFFER_API_KEY
  // a simulacao nao fala com o Buffer, entao so o --apagar e o --confirmar cobram a chave
  if (a.apagar || a.confirmar) exigir({ config, env }, ['BUFFER_API_KEY'])
  if (a.apagar) return apagarIds(chave, a.apagar)
  if (!a.pasta) throw new Error(`uso: ${SCRIPT} <pasta-em-producao> --quando "AAAA-MM-DD HH:MM" [--capa s] [--redes instagram,tiktok,youtube] [--confirmar]`)
  const dir = resolve(RAIZ, 'producao', a.pasta)
  if (!existsSync(dir)) throw new Error(`nao achei producao/${a.pasta}`)
  const plano = montarPlano({ dir, quando: a.quando, capa: a.capa, redes: a.redes, config })
  mostrar(plano, a.quando)
  if (!a.confirmar) { console.log('\nSimulacao. Nada subiu nem agendou. Pra valer: repetir com --confirmar, depois do "pode ir".'); return }
  exigir({ config, env }, ['organizacao_buffer'])
  const arqPub = join(dir, 'publicacao.md')
  const org = config.organizacao_buffer
  const r = await publicar({
    plano, quando: a.quando, substituir: a.substituir, slug: basename(dir), config,
    textoPub: existsSync(arqPub) ? readFileSync(arqPub, 'utf8') : '',
    deps: {
      subir: (arq, k) => subir({ config, env }, arq, k),
      criarPost: p => criarPost(chave, p),
      apagarPost: id => apagarPost(chave, id),
      consultarPost: id => consultarPost(chave, id),
      pendentes: ids => pendentesPorCanal(chave, org, ids),
      acharPost: (canal, due) => acharPost(chave, org, canal, due),
      gravar: texto => writeFileSync(arqPub, texto),
    },
  })
  for (const f of r.feitos) console.log(`${f.rede}: agendado, id ${f.id}`)
  console.log(`Registro em producao/${a.pasta}/publicacao.md`)
  if (r.falha) {
    console.error(`\n${r.falha.rede}: FALHOU ${r.falha.etapa === 'apagar' ? 'ao apagar o antigo' : 'ao agendar'}, ${r.falha.erro}`)
    if (r.falha.incerto) console.error(`O ${r.falha.rede} pode ter ${r.falha.etapa === 'apagar' ? 'sido apagado' : 'entrado'}: o registro marcou "incerto", e o proximo --confirmar confere no Buffer sozinho.`)
    if (r.falha.etapa === 'apagar') console.error('Nenhum post novo foi criado. O que ja saiu esta no Historico do publicacao.md.')
    if (r.feitos.length) console.error(`Pra nao deixar post sozinho numa rede: corrigir a causa e rodar de novo so com as redes que faltam (--redes), ou desfazer: ${SCRIPT} --apagar ${r.feitos.map(f => f.id).join(',')}`)
    process.exitCode = 1
  }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) main(process.argv.slice(2)).catch(e => { console.error('ERRO:', e.message); process.exit(1) })
