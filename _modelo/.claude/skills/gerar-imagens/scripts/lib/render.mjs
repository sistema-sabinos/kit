// O navegador que vira imagem. HTML e canvas rodam no Playwright, abrindo o Chrome
// do computador: nenhum navegador baixado, nada de Python. A skill tem o package.json
// dela; quem ja instalou o do Mercado Livre ou o da midia social usa esse, sem
// instalar de novo.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAIZ } from '../../../conectar/scripts/lib/raiz.mjs'

export const INSTALAR = 'npm install --prefix .claude/skills/gerar-imagens'
// onde procurar, nesta ordem: o da propria skill primeiro
export const PACOTES = ['gerar-imagens', 'mercado-livre', 'midia-social']

export function acharPlaywright(raiz = RAIZ) {
  for (const skill of PACOTES) {
    const pacote = join(raiz, '.claude', 'skills', skill, 'package.json')
    if (!existsSync(pacote)) continue
    try { return createRequire(pathToFileURL(pacote)).resolve('playwright') } catch {}
  }
  throw new Error(`nao achei o Playwright, que desenha as imagens.\nQuem le esta mensagem e a IA: peca o sim da pessoa e rode uma vez, na pasta do projeto: ${INSTALAR}`)
}

export async function abrirNavegador({ raiz = RAIZ, carregar } = {}) {
  const pw = carregar ? await carregar() : await import(pathToFileURL(acharPlaywright(raiz)).href)
  const chromium = pw.chromium || pw.default?.chromium
  try {
    return await chromium.launch({ channel: 'chrome' })
  } catch (e) {
    throw new Error(`nao consegui abrir o Google Chrome pra desenhar a imagem (${String(e.message).split('\n')[0]}).\nConfira se o Chrome esta instalado.`)
  }
}

export function opcoesDaFoto(saida) {
  const ext = String(saida).toLowerCase().split('.').pop()
  if (ext === 'png') return { type: 'png' }
  if (ext === 'jpg' || ext === 'jpeg') return { type: 'jpeg', quality: 92 }
  throw new Error(`a saida precisa terminar em .jpg ou .png, e veio "${saida}"`)
}

export async function comPagina(fazer, { viewport, raiz, carregar } = {}) {
  const navegador = await abrirNavegador({ raiz, carregar })
  try {
    const pagina = await navegador.newPage(viewport ? { viewport, deviceScaleFactor: 1 } : {})
    return await fazer(pagina)
  } finally {
    await navegador.close()
  }
}

// css: estilo extra (as fontes embutidas) colado depois de abrir a pagina.
// conferir(pagina): roda antes da foto; se lancar, a foto nao sai.
export async function fotografar(fonte, { saida, largura, altura, raiz, carregar, css, conferir }) {
  const opcoes = opcoesDaFoto(saida)
  mkdirSync(dirname(saida), { recursive: true })
  await comPagina(async pagina => {
    if (fonte.startsWith('file:')) await pagina.goto(fonte, { waitUntil: 'networkidle' })
    else await pagina.setContent(fonte, { waitUntil: 'networkidle' })
    if (css) await pagina.addStyleTag({ content: css })
    await pagina.evaluate(() => document.fonts.ready)
    if (conferir) await conferir(pagina)
    await pagina.screenshot({ path: saida, ...opcoes })
  }, { viewport: { width: largura, height: altura }, raiz, carregar })
}
