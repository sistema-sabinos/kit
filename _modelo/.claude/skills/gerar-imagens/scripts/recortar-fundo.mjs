// Recorte da foto real do produto: todo pixel quase branco LIGADO A BORDA vira
// transparente (preenchimento a partir das bordas). O branco do proprio produto
// fica, porque esta cercado pelo contorno. O recorte e o que deixa o produto
// real entrar na capa e nos cenarios sem a IA redesenhar o rotulo.
// Uso: node .claude/skills/gerar-imagens/scripts/recortar-fundo.mjs --in <foto.jpg> --out <recorte.png> [--limiar 242] [--feather 2]
// Embalagem branca pede limiar alto (ex.: 248): limiar baixo come tampa e rotulo.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { comPagina } from './lib/render.mjs'
import { lerArgs, numero } from './lib/args.mjs'

// Roda no Node (teste) e dentro da pagina (recorte de verdade): sem nada de fora.
export function recortar(d, W, H, { limiar = 242, feather = 2 } = {}) {
  const claro = (i) => d[i] >= limiar && d[i + 1] >= limiar && d[i + 2] >= limiar
  const visto = new Uint8Array(W * H)
  const fila = []
  for (let x = 0; x < W; x++) { fila.push(x); fila.push((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { fila.push(y * W); fila.push(y * W + W - 1) }
  let transparentes = 0
  while (fila.length) {
    const p = fila.pop()
    if (visto[p]) continue
    visto[p] = 1
    const i = p * 4
    if (!claro(i)) continue
    d[i + 3] = 0
    transparentes++
    const x = p % W, y = (p / W) | 0
    if (x > 0) fila.push(p - 1)
    if (x < W - 1) fila.push(p + 1)
    if (y > 0) fila.push(p - W)
    if (y < H - 1) fila.push(p + W)
  }
  for (let passo = 0; passo < feather; passo++) {
    const a = d.slice()
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4
      if (a[i + 3] === 0) continue
      if (a[i - 1] === 0 || a[i + 7] === 0 || a[i - W * 4 + 3] === 0 || a[i + W * 4 + 3] === 0) d[i + 3] = Math.min(d[i + 3], 150)
    }
  }
  return transparentes
}

export function avisoDoRecorte(pct) {
  if (pct < 5) return 'quase nada do fundo saiu: a foto nao parece ter fundo branco. Peca uma foto do produto em fundo branco ou bem claro.'
  if (pct > 95) return 'quase a imagem inteira saiu: o recorte pode ter comido o produto. Tente de novo com --limiar mais alto (ex.: 250).'
  return null
}

async function naPagina({ href, fonte, limiar, feather }) {
  const recortar = (0, eval)('(' + fonte + ')')
  const img = new Image()
  img.src = href
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, c.width, c.height)
  const transparentes = recortar(id.data, c.width, c.height, { limiar, feather })
  ctx.putImageData(id, 0, 0)
  return { png: c.toDataURL('image/png'), transparentes, total: c.width * c.height }
}

export async function recortarArquivo({ entrada, saida, limiar = 242, feather = 2, pagina = comPagina }) {
  if (!entrada || !saida) throw new Error('faltou --in ou --out')
  if (!/\.png$/i.test(saida)) throw new Error('o recorte sai em .png, que e o formato que guarda o fundo transparente')
  if (!existsSync(entrada)) throw new Error(`nao achei a foto ${entrada}`)
  const mime = /\.png$/i.test(entrada) ? 'image/png' : /\.webp$/i.test(entrada) ? 'image/webp' : 'image/jpeg'
  const href = `data:${mime};base64,${readFileSync(entrada).toString('base64')}`
  const r = await pagina(p => p.evaluate(naPagina, { href, fonte: recortar.toString(), limiar, feather }))
  mkdirSync(dirname(saida), { recursive: true })
  writeFileSync(saida, Buffer.from(r.png.split(',')[1], 'base64'))
  const pct = Math.round((r.transparentes / r.total) * 1000) / 10
  return { ok: true, out: saida, limiar, transparente_pct: pct, aviso: avisoDoRecorte(pct), custo_usd: 0 }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = lerArgs(process.argv.slice(2))
    console.log(JSON.stringify(await recortarArquivo({
      entrada: a.in, saida: a.out,
      limiar: numero(a, 'limiar', 242, { min: 150, max: 254 }),
      feather: numero(a, 'feather', 2, { min: 0, max: 6 }),
    })))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
