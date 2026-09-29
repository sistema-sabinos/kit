// Composicao: o produto recortado da foto real entra sobre um cenario (gerado
// pela IA, sempre vazio) ou sobre uma cor lisa da paleta, com sombra de contato
// pra nao parecer flutuando. A capa e esta mesma composicao sobre #ffffff.
// Uso: node .claude/skills/gerar-imagens/scripts/compor-cena.mjs (--cena <cenario.png> | --fundo "#ffffff")
//        --produto <recorte.png> --out <saida.jpg> [--escala 0.6] [--linha 0.88] [--x 0.5] [--sem-sombra] [--largura 1200] [--altura 1200]
//   --escala  altura do produto como fracao da altura da imagem
//   --linha   altura (0 a 1) onde a base do produto encosta
//   --x       centro do produto na horizontal (0 a 1)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fotografar } from './lib/render.mjs'
import { lerArgs, numero } from './lib/args.mjs'

export function validarCena(o) {
  if (!o.cena && !o.fundo) throw new Error('falta um dos dois: --cena ou --fundo')
  if (o.cena && o.fundo) throw new Error('passe so um fundo: --cena ou --fundo, nunca os dois')
  if (o.fundo && !/^#[0-9a-f]{6}$/i.test(o.fundo)) throw new Error(`--fundo e uma cor tipo "#ffffff", e veio "${o.fundo}"`)
  if (!o.produto || !/\.png$/i.test(o.produto)) throw new Error('o produto entra recortado em .png: rode o recortar-fundo.mjs antes')
  if (!(o.escala > 0.05 && o.escala <= 1)) throw new Error('--escala vai de 0.05 a 1')
  if (!(o.linha > 0.1 && o.linha <= 1)) throw new Error('--linha vai de 0.1 a 1')
  if (!(o.x >= 0 && o.x <= 1)) throw new Error('--x vai de 0 a 1')
  return o
}

export function htmlDaCena({ largura, altura, fundo, cena, produto, escala, linha, x, sombra }) {
  const alt = Math.round(altura * escala)
  const cx = Math.round(largura * x)
  const base = Math.round(altura * linha)
  const sw = Math.round(alt * 0.7)
  const sh = Math.max(6, Math.round(alt * 0.06))
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;overflow:hidden}
#palco{position:relative;width:${largura}px;height:${altura}px;background:${fundo || '#ffffff'};overflow:hidden}
#cena{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}
#sombra{position:absolute;left:${cx - Math.round(sw / 2)}px;top:${base - Math.round(sh / 2)}px;width:${sw}px;height:${sh}px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.30),rgba(0,0,0,0) 70%);filter:blur(${Math.max(2, Math.round(sh / 3))}px)}
#produto{position:absolute;left:${cx}px;top:${base}px;height:${alt}px;transform:translate(-50%,-100%);display:flex;align-items:flex-end}
#produto img{height:100%;width:auto;max-width:${Math.round(largura * 0.95)}px;object-fit:contain;object-position:bottom;display:block}
</style></head><body><div id="palco">${cena ? `<img id="cena" src="${cena}">` : ''}${sombra ? '<div id="sombra"></div>' : ''}<div id="produto"><img src="${produto}"></div></div></body></html>`
}

const dataUrl = (arquivo) => {
  if (!existsSync(arquivo)) throw new Error(`nao achei ${arquivo}`)
  const mime = /\.png$/i.test(arquivo) ? 'image/png' : /\.webp$/i.test(arquivo) ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(arquivo).toString('base64')}`
}

export async function comporCena({ cena, fundo, produto, out, largura = 1200, altura = largura, escala = 0.6, linha = 0.88, x = 0.5, sombra = true, foto = fotografar }) {
  if (!out) throw new Error('faltou --out')
  validarCena({ cena, fundo, produto, escala, linha, x })
  const html = htmlDaCena({ largura, altura, fundo, cena: cena && dataUrl(cena), produto: dataUrl(produto), escala, linha, x, sombra })
  await foto(html, { saida: resolve(out), largura, altura })
  return { ok: true, out, custo_usd: 0 }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = lerArgs(process.argv.slice(2))
    const largura = numero(a, 'largura', 1200, { min: 500, max: 4000 })
    console.log(JSON.stringify(await comporCena({
      cena: a.cena, fundo: a.fundo, produto: a.produto, out: a.out, largura,
      altura: numero(a, 'altura', largura, { min: 500, max: 4000 }),
      escala: numero(a, 'escala', 0.6), linha: numero(a, 'linha', 0.88), x: numero(a, 'x', 0.5),
      sombra: !a['sem-sombra'],
    })))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
