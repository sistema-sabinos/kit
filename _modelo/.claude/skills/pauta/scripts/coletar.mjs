// Coleta de Reels e carrosseis de um perfil publico do Instagram, sem login, pelo Chrome dedicado.
// Grava em inteligencia/base-ideias/<perfil>/: posts.json, videos/<codigo>.mp4 (H.264, com audio) e
// slides/<codigo>/slide-NN.jpg. Retoma: o que ja tem arquivo no disco nao baixa de novo, so atualiza os numeros.
// Uso: node .claude/skills/pauta/scripts/coletar.mjs --perfil <perfil> --reels <c1,c2> --posts <c3,c4>
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, renameSync, unlinkSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirPagina, opcoes, lista, exigirFfmpeg } from './lib/pagina.mjs'
import { dataDoCodigo, parseOg, alertaDosPosts } from './lib/instagram-publico.mjs'
import { limpar, suspeitos } from '../../ler-avaliacoes/scripts/lib/texto.mjs'
import { PASTA } from './garimpo.mjs'

const USO = 'uso: node .claude/skills/pauta/scripts/coletar.mjs --perfil <perfil> [--reels c1,c2] [--posts c3,c4]'
const dormir = ms => new Promise(r => setTimeout(r, ms))

export function tagDeEncode(u) {
  try {
    const efg = decodeURIComponent(new URL(u).searchParams.get('efg') || '')
    return efg ? JSON.parse(Buffer.from(efg, 'base64').toString('utf8')).vencode_tag || '' : ''
  } catch { return '' }
}

export function escolherFaixas(urls) {
  const audio = urls.find(u => /audio/i.test(tagDeEncode(u)))
  const videos = urls.filter(u => u !== audio)
  const melhor = ['1080p', '720p', '540p', '360p'].map(q => videos.find(u => tagDeEncode(u).includes(q))).find(Boolean) || videos[0]
  return { video: melhor || null, audio: audio || null }
}

// Post ja baixado numa coleta anterior: atualiza os numeros e limpa a legenda guardada, que
// pode ser de antes da limpeza de caractere invisivel (achado do Codex: a retomada mantinha
// a legenda antiga e perdia o alerta).
export function atualizarPronto(r, meta, hoje) {
  if (meta.curtidas != null) r.curtidas = meta.curtidas
  if (meta.comentarios != null) r.comentarios = meta.comentarios
  if (meta.curtidas != null || meta.comentarios != null) r.atualizado = hoje
  const achou = suspeitos(r.legenda)
  if (r.legenda != null) r.legenda = limpar(r.legenda)
  const alertas = achou.tag || achou.bidi ? achou : meta.alertas
  if (alertas) r.alertas = alertas
  return r
}

// Carrossel guarda a legenda tambem no legenda.txt, que o analista le: limpa o arquivo sempre
// que a limpeza muda algo, com ou sem alerta, porque largura zero sai calada (achado do Codex).
export function limparLegendaTxt(caminho) {
  if (!existsSync(caminho)) return false
  const atual = readFileSync(caminho, 'utf8')
  const limpo = limpar(atual)
  if (limpo === atual) return false
  writeFileSync(caminho, limpo)
  return true
}

function garantirH264(arq) {
  const c = (spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', arq], { encoding: 'utf8' }).stdout || '').trim()
  if (c === 'h264') return c
  const tmp = arq.replace(/\.mp4$/, '-h264.mp4')
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', arq, '-c:v', 'libx264', '-crf', '20', '-c:a', 'aac', tmp], { encoding: 'utf8', timeout: 600000 })
  if (existsSync(tmp) && statSync(tmp).size > 20000) { renameSync(tmp, arq); return `${c}->h264` }
  throw new Error(`reconversao falhou: ${(r.stderr || '').slice(0, 200)}`)
}

async function main(argv) {
  const o = opcoes(argv)
  if (o.help) { console.log(USO); return }
  const perfil = typeof o.perfil === 'string' ? o.perfil.replace(/^@/, '') : ''
  if (!perfil) throw new Error('faltou --perfil. ' + USO)
  const itens = [
    ...lista(o.reels).map(codigo => ({ codigo, tipo: 'reel', url: `https://www.instagram.com/reel/${codigo}/` })),
    ...lista(o.posts).map(codigo => ({ codigo, tipo: 'post', url: `https://www.instagram.com/p/${codigo}/` })),
  ]
  if (!itens.length) throw new Error('faltou --reels ou --posts com os codigos (a /pauta tira da frequencia.mjs). ' + USO)
  exigirFfmpeg()
  const raiz = join(PASTA, perfil)
  mkdirSync(join(raiz, 'videos'), { recursive: true })
  mkdirSync(join(raiz, 'slides'), { recursive: true })
  const arqJson = join(raiz, 'posts.json')
  const log = (...a) => console.error(`[${perfil}]`, ...a)
  const prontos = {}
  try { for (const r of JSON.parse(readFileSync(arqJson, 'utf8'))) if (r.arquivo && existsSync(join(raiz, r.arquivo))) prontos[r.codigo] = r } catch {}
  const resultado = []
  const salvar = () => writeFileSync(arqJson, JSON.stringify(resultado, null, 2))

  const { page, fechar } = await abrirPagina()
  const esperarSeBloqueado = async () => {
    const txt = await page.evaluate(() => document.body?.innerText || '').catch(() => '')
    if (!/aguarde alguns minutos|wait a few minutes/i.test(txt)) return false
    log('o Instagram pediu pra aguardar, esperando 3 min...')
    await dormir(180000)
    return true
  }
  const baixa = async (link, arquivo) => {
    const resp = await page.request.get(link, { timeout: 120000 })
    if (!resp.ok()) throw new Error(`HTTP ${resp.status()}`)
    const buf = await resp.body()
    if (buf.length < 20000) throw new Error(`arquivo pequeno demais (${buf.length} bytes)`)
    writeFileSync(arquivo, buf)
  }
  const coletarMp4 = async url => {
    const achados = []
    const onResp = r => {
      const u = r.url(), ct = r.headers()['content-type'] || ''
      if (!u.includes('.mp4') && !ct.startsWith('video/')) return
      const base = u.split('&bytestart=')[0].split('&byteend=')[0]
      if (!achados.includes(base)) achados.push(base)
    }
    page.on('response', onResp)
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(5000)
      if (await esperarSeBloqueado()) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(5000) }
      if (!(await page.evaluate(() => !!document.querySelector('video')).catch(() => false))) return { temVideo: false, todos: [] }
      await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.play() } }).catch(() => {})
      await page.waitForTimeout(9000)
      const noHtml = await page.evaluate(() => {
        const re = /"(?:video_url|playable_url|contentUrl)":"([^"]+\.mp4[^"]*)"/g
        const out = []; let m
        while ((m = re.exec(document.documentElement.innerHTML))) out.push(m[1].split('\\/').join('/').split('\\u0026').join('&'))
        return out
      }).catch(() => [])
      return { temVideo: true, todos: [...new Set([...achados, ...noHtml])] }
    } finally { page.off('response', onResp) }
  }
  const baixarReel = async (codigo, todos) => {
    if (!todos.length) throw new Error('nenhum mp4 apareceu na pagina')
    const { video, audio } = escolherFaixas(todos)
    if (!video) throw new Error('so achei faixa de audio')
    const alvo = join(raiz, 'videos', `${codigo}.mp4`)
    if (!audio) { await baixa(video, alvo); return alvo }
    const sv = join(raiz, 'videos', `${codigo}-v.mp4`), sa = join(raiz, 'videos', `${codigo}-a.mp4`)
    await baixa(video, sv); await baixa(audio, sa)
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sv, '-i', sa, '-c', 'copy', '-shortest', alvo], { encoding: 'utf8', timeout: 180000 })
    if (!existsSync(alvo) || statSync(alvo).size < 20000) throw new Error(`ffmpeg falhou: ${(r.stderr || '').slice(0, 200)}`)
    unlinkSync(sv); unlinkSync(sa)
    return alvo
  }
  const baixarCarrossel = async (codigo, url) => {
    const out = join(raiz, 'slides', codigo)
    mkdirSync(out, { recursive: true })
    const vistos = new Set()
    let n = 0
    for (let i = 1; i <= 20; i++) {
      await page.goto(`${url}?img_index=${i}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(5000)
      const srcs = await page.evaluate(() => [...document.querySelectorAll('img')].filter(im => im.naturalWidth > 700 && im.getBoundingClientRect().width > 200).map(im => im.currentSrc || im.src)).catch(() => [])
      let novo = 0
      for (const s of srcs) {
        try {
          const r = await page.request.get(s, { timeout: 60000 })
          if (!r.ok()) continue
          const b = await r.body()
          const h = createHash('md5').update(b).digest('hex')
          if (vistos.has(h)) continue
          vistos.add(h); n++; novo++
          writeFileSync(join(out, `slide-${String(n).padStart(2, '0')}.jpg`), b)
        } catch {}
      }
      if (i > 1 && novo === 0) break
    }
    if (!n) throw new Error('nenhuma imagem grande na pagina')
    return { pasta: out, imagens: n }
  }

  try {
    await page.goto(`https://www.instagram.com/${perfil}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)
    // og de todos em lote, de dentro da pagina do perfil (inclusive os ja baixados: o ranking precisa do numero de hoje)
    const ogs = await page.evaluate(async urls => {
      const out = {}
      for (const u of urls) {
        try {
          const r = await fetch(u, { credentials: 'include' })
          const h = await r.text()
          const g = p => (h.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1] || ''
          out[u] = { status: r.status, desc: g('og:description'), login: /accounts\/login/.test(r.url) }
        } catch (e) { out[u] = { erro: e.message } }
        await new Promise(r => setTimeout(r, 1200))
      }
      return out
    }, itens.map(i => i.url))
    log('og coletado:', Object.values(ogs).filter(x => x.desc).length, 'de', itens.length)

    for (const it of itens) {
      const og = ogs[it.url] || {}
      const meta = parseOg(og.desc)
      if (prontos[it.codigo]) {
        const r = atualizarPronto(prontos[it.codigo], meta, new Date().toLocaleDateString('sv-SE'))
        limparLegendaTxt(join(raiz, r.arquivo, 'legenda.txt'))
        resultado.push(r); salvar(); log(`${it.codigo} ja baixado, numeros atualizados`); continue
      }
      const reg = { codigo: it.codigo, tipo: it.tipo, url: it.url, data: dataDoCodigo(it.codigo).toISOString(), curtidas: meta.curtidas, comentarios: meta.comentarios, legenda: meta.legenda, arquivo: null, erro: null }
      if (meta.alertas) reg.alertas = meta.alertas
      if (!og.desc) reg.erro = og.login ? 'og vazio, a pagina pede login' : `og vazio (status ${og.status ?? og.erro})`
      resultado.push(reg); salvar()
      log(`${it.tipo} ${it.codigo}: ${reg.curtidas} curtidas, ${reg.comentarios} comentarios`)
      for (let tent = 1; tent <= 2; tent++) {
        try {
          const { temVideo, todos } = await coletarMp4(it.url)
          if (temVideo) {
            const arq = await baixarReel(it.codigo, todos)
            reg.tipo = 'reel'; reg.arquivo = relative(raiz, arq).split('\\').join('/')
            log(`  mp4 ok (${(statSync(arq).size / 1e6).toFixed(1)} MB, ${garantirH264(arq)})`)
          } else {
            if (it.tipo === 'reel') throw new Error('pagina do reel sem video (pede login?)')
            const r = await baixarCarrossel(it.codigo, it.url)
            reg.arquivo = relative(raiz, r.pasta).split('\\').join('/')
            writeFileSync(join(r.pasta, 'legenda.txt'), reg.legenda || '')
            log(`  carrossel ok (${r.imagens} imagens)`)
          }
          reg.erro = null
          break
        } catch (e) {
          reg.erro = `download: ${e.message}`
          log(`  tentativa ${tent} falhou: ${e.message}`)
          if (tent === 1) await dormir(8000)
        }
      }
      salvar()
      await dormir(3000 + Math.random() * 2000)
    }
  } finally { await fechar() }
  const ok = resultado.filter(r => r.arquivo).length
  const alerta = alertaDosPosts(resultado)
  console.log(JSON.stringify({ perfil, total: resultado.length, ok, falhas: resultado.filter(r => !r.arquivo).map(r => `${r.codigo}: ${r.erro}`), ...(alerta ? { alerta } : {}) }))
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) main(process.argv.slice(2)).catch(e => { console.error('ERRO:', e.message); process.exit(1) })
