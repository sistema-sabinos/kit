// Pixel da capa: fundo, respiro (margem vazia em volta do produto) e densidade de borda
// (quanto a imagem e "poluida"). A conta e pura, sobre os bytes RGBA, e roda no Node; o
// Chrome do computador so decodifica a foto e reduz pra no maximo 400 px de lado (a mesma
// reducao pra todas as capas da rodada, que e o que importa num corte pela mediana).
// Nenhum navegador baixado e nenhuma dependencia nova: e o mesmo Playwright da /gerar-imagens.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { abrirNavegador } from '../../../gerar-imagens/scripts/lib/render.mjs'

export const LADO_MAX = 400
const MIMES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

// dados: RGBA, 4 bytes por pixel, linha a linha.
export function medidasDePixels({ largura: L, altura: A, dados: d }) {
  const quant = v => Math.min(255, Math.round(v / 16) * 16)
  // fundo: a cor mais comum na moldura de 2% da borda
  const margem = Math.max(1, Math.round(Math.min(L, A) * 0.02))
  const borda = new Map()
  const somar = (x, y) => {
    const i = (y * L + x) * 4
    const k = `${quant(d[i])},${quant(d[i + 1])},${quant(d[i + 2])}`
    borda.set(k, (borda.get(k) || 0) + 1)
  }
  for (let x = 0; x < L; x++) for (let y = 0; y < margem; y++) { somar(x, y); somar(x, A - 1 - y) }
  for (let y = 0; y < A; y++) for (let x = 0; x < margem; x++) { somar(x, y); somar(L - 1 - x, y) }
  const [fr, fg, fb] = [...borda].sort((x, y) => y[1] - x[1])[0][0].split(',').map(Number)
  const hex = n => n.toString(16).padStart(2, '0')
  const difere = (x, y) => {
    const i = (y * L + x) * 4
    return Math.abs(d[i] - fr) + Math.abs(d[i + 1] - fg) + Math.abs(d[i + 2] - fb) > 40
  }
  const linhaDifere = y => { for (let x = 0; x < L; x++) if (difere(x, y)) return true; return false }
  const colunaDifere = x => { for (let y = 0; y < A; y++) if (difere(x, y)) return true; return false }
  const varre = (limite, testar) => { for (let k = 0; k < limite; k++) if (testar(k)) return k; return limite }
  const topo = varre(A, y => linhaDifere(y)) / A
  const base = varre(A, y => linhaDifere(A - 1 - y)) / A
  const esq = varre(L, x => colunaDifere(x)) / L
  const dir = varre(L, x => colunaDifere(L - 1 - x)) / L
  let naoFundo = 0
  let bordas = 0
  let comparados = 0
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      if (difere(x, y)) naoFundo++
      if (x === 0) continue
      const i = (y * L + x) * 4
      const j = i - 4
      comparados++
      if (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 60) bordas++
    }
  }
  return {
    largura: L,
    altura: A,
    fundo: { hex: `#${hex(fr)}${hex(fg)}${hex(fb)}`, branco_puro: fr >= 250 && fg >= 250 && fb >= 250 },
    // media das quatro margens, cada uma como fracao do lado
    respiro: (topo + base + esq + dir) / 4,
    ocupacao: naoFundo / (L * A),
    densidade_borda: bordas / (comparados || 1),
  }
}

// Roda dentro da pagina: decodifica, reduz e devolve os bytes em base64.
async function bytesDaImagem({ dataUrl, ladoMax }) {
  const img = new Image()
  await new Promise((ok, falha) => { img.onload = ok; img.onerror = () => falha(new Error('a imagem nao abriu')); img.src = dataUrl })
  const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight))
  const L = Math.max(1, Math.round(img.naturalWidth * escala))
  const A = Math.max(1, Math.round(img.naturalHeight * escala))
  const cv = document.createElement('canvas')
  cv.width = L
  cv.height = A
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, L, A)
  ctx.drawImage(img, 0, 0, L, A)
  const d = ctx.getImageData(0, 0, L, A).data
  let s = ''
  for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768))
  return { largura: L, altura: A, b64: btoa(s) }
}

// Um navegador pra rodada inteira. medir(caminho) nunca lanca: falha volta com `erro`.
export async function abrirMedidor({ raiz, carregar, abrir = abrirNavegador } = {}) {
  const navegador = await abrir({ raiz, carregar })
  const pagina = await navegador.newPage()
  return {
    async medir(caminho) {
      try {
        const mime = MIMES[extname(caminho).toLowerCase()] || 'image/jpeg'
        const dataUrl = `data:${mime};base64,${readFileSync(caminho).toString('base64')}`
        const r = await pagina.evaluate(bytesDaImagem, { dataUrl, ladoMax: LADO_MAX })
        return medidasDePixels({ largura: r.largura, altura: r.altura, dados: Buffer.from(r.b64, 'base64') })
      } catch (e) {
        return { erro: String(e.message).slice(0, 160) }
      }
    },
    async fechar() { await navegador.close().catch(() => {}) },
  }
}
