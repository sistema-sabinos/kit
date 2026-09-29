// O navegador que vira imagem. HTML e canvas rodam no Playwright que o pacote
// mercado-livre ja instala, abrindo o Chrome do computador: nenhum navegador
// baixado, nenhuma dependencia nova, nada de Python.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAIZ } from '../../../mercado-livre/scripts/lib/raiz.mjs'

export const INSTALAR = 'npm install --prefix .claude/skills/mercado-livre'

export function acharPlaywright(raiz = RAIZ) {
  const pacote = join(raiz, '.claude', 'skills', 'mercado-livre', 'package.json')
  const erro = new Error(`nao achei o Playwright, que desenha as imagens.\nRode uma vez, na pasta do projeto: ${INSTALAR}`)
  if (!existsSync(pacote)) throw erro
  try { return createRequire(pathToFileURL(pacote)).resolve('playwright') } catch { throw erro }
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

export async function fotografar(fonte, { saida, largura, altura, raiz, carregar }) {
  const opcoes = opcoesDaFoto(saida)
  mkdirSync(dirname(saida), { recursive: true })
  await comPagina(async pagina => {
    if (fonte.startsWith('file:')) await pagina.goto(fonte, { waitUntil: 'networkidle' })
    else await pagina.setContent(fonte, { waitUntil: 'networkidle' })
    await pagina.evaluate(() => document.fonts.ready)
    await pagina.screenshot({ path: saida, ...opcoes })
  }, { viewport: { width: largura, height: altura }, raiz, carregar })
}
