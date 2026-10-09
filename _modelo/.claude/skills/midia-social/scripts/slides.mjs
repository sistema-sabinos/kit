// Gerador de slides do carrossel: abre cada html/slide-NN.html no Chrome do computador e grava
// final/slide-NN.png. Usa o Playwright do proprio pacote (package.json desta skill) e o Chrome ja
// instalado, o mesmo jeito do render do gerar-imagens: nenhum navegador baixado, nada pago.
// Uso (da raiz do projeto):
//   node .claude/skills/midia-social/scripts/slides.mjs --pasta producao/<slug> [--so 01] [--916]
import { existsSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'

export const INSTALAR = 'npm install --prefix .claude/skills/midia-social'
export const TETO = 10
const USO = 'uso: node .claude/skills/midia-social/scripts/slides.mjs --pasta producao/<slug> [--so 01] [--916]'
const NOME = /^slide-(\d{2})\.html$/

export function lerArgs(argv) {
  const valor = nome => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : undefined }
  const so = valor('--so')
  return { pasta: valor('--pasta'), so: so === undefined ? undefined : String(so).padStart(2, '0'), vertical: argv.includes('--916') }
}

export function medidas(vertical) {
  return vertical
    ? { html: 'html-916', final: 'final-916', viewport: { width: 1080, height: 1920 } }
    : { html: 'html', final: 'final', viewport: { width: 1080, height: 1350 } }
}

// devolve o codigo de saida: 0 gravou, 1 nada gravado (o motivo vai pelo log)
export async function gerarSlides({ pasta, so, vertical = false, raiz = RAIZ, carregar = () => import('playwright'), log = console.log } = {}) {
  if (!pasta) { log(USO); return 1 }
  const { html, final, viewport } = medidas(vertical)
  const dirHtml = resolve(raiz, pasta, html)
  const todos = existsSync(dirHtml) ? readdirSync(dirHtml).filter(n => NOME.test(n)).sort() : []
  if (!todos.length) { log(`nenhum slide-NN.html em ${dirHtml}: criar os HTMLs antes`); return 1 }
  if (todos.length > TETO) { log(`${todos.length} slides em ${html}/: o agendador aceita no maximo ${TETO} slides. Nada gravado`); return 1 }
  const lista = so ? todos.filter(n => NOME.exec(n)[1] === so) : todos
  if (!lista.length) { log(`nao achei ${html}/slide-${so}.html`); return 1 }

  let pw
  try { pw = await carregar() } catch { log(`nao achei o Playwright, que desenha os slides.\nRode uma vez, na pasta do projeto: ${INSTALAR}`); return 1 }
  const chromium = pw.chromium || pw.default?.chromium
  let navegador
  try { navegador = await chromium.launch({ channel: 'chrome' }) } catch (e) {
    log(`nao consegui abrir o Google Chrome pra desenhar os slides (${String(e.message).split('\n')[0]}).\nConfira se o Chrome esta instalado.`)
    return 1
  }
  const dirFinal = resolve(raiz, pasta, final)
  try {
    mkdirSync(dirFinal, { recursive: true })
    const pagina = await navegador.newPage({ viewport, deviceScaleFactor: 1 })
    for (const nome of lista) {
      await pagina.goto(pathToFileURL(join(dirHtml, nome)).href, { waitUntil: 'networkidle' })
      await pagina.evaluate(() => document.fonts.ready)
      const saida = join(dirFinal, nome.replace(/\.html$/, '.png'))
      await pagina.screenshot({ path: saida, type: 'png' })
      log(`ok: ${final}/${nome.replace(/\.html$/, '.png')}`)
    }
    // rodada inteira: PNG de slide cujo HTML saiu da pasta sai tambem, senao a /publicar-social leva junto
    if (!so) {
      const vivos = new Set(todos.map(n => n.replace(/\.html$/, '.png')))
      for (const png of readdirSync(dirFinal).filter(n => /^slide-\d{2}\.png$/.test(n) && !vivos.has(n))) {
        unlinkSync(join(dirFinal, png))
        log(`removido: ${final}/${png} (o HTML dele nao existe mais)`)
      }
    }
  } finally {
    await navegador.close()
  }
  return 0
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  gerarSlides(lerArgs(process.argv.slice(2)))
    .then(codigo => { process.exitCode = codigo })
    .catch(e => { console.error('ERRO:', e.message); process.exitCode = 1 })
}
