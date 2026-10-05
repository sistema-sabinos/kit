// Abre uma aba no Chrome dedicado do pacote, na frente (aba atras e freada pelo Chrome e o script da pagina
// nao roda), e le o og:description. Tambem confere o ffmpeg e le as opcoes --nome valor da linha de comando.
import { spawnSync } from 'node:child_process'
import { conectar } from '../../../midia-social/scripts/lib/chrome.mjs'

export async function abrirPagina() {
  const browser = await conectar()
  const ctx = browser.contexts()[0] || (await browser.newContext())
  const page = await ctx.newPage()
  await page.bringToFront().catch(() => {})
  return { page, fechar: async () => { await page.close().catch(() => {}); await browser.close().catch(() => {}) } }
}

export async function ogDaPagina(page, url, espera = 5500) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(espera)
  return page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content || '')
}

export function exigirFfmpeg(spawn = spawnSync) {
  for (const bin of ['ffmpeg', 'ffprobe']) {
    const r = spawn(bin, ['-version'], { encoding: 'utf8' })
    if (r.error || r.status !== 0) throw new Error(`${bin} nao encontrado: instalar o ffmpeg (o /conectar ou o Claude ajudam) e abrir o terminal de novo`)
  }
}

export function opcoes(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const nome = argv[i].slice(2)
      const prox = argv[i + 1]
      if (nome === 'help' || prox === undefined || prox.startsWith('--')) out[nome] = true
      else { out[nome] = prox; i++ }
    } else out._.push(argv[i])
  }
  return out
}

export const lista = v => (typeof v === 'string' ? v.split(',') : []).map(s => s.trim().replace(/^@/, '')).filter(Boolean)
