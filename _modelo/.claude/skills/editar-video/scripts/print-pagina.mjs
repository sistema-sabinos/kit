// Print de pagina real pra inserção por cima da fala (passo 4A, referencias/insercoes.md): abre a pagina no Chrome
// em tela de celular (390 px com escala 2,77, o print sai 1080 por 1920), marca a frase dita em marca-texto e grava o
// print com a frase no meio da tela. A frase marcada e a prova: o espectador le o que a pessoa acabou de dizer.
// Usa o Playwright do /gerar-imagens (ou o do Mercado Livre e o da midia social), sem baixar navegador.
//
// uso: node print-pagina.mjs <url ou arquivo.html> <saida.png> [--marcar "frase da pagina"]
// Saida: 0 gravou, 1 nao abriu a pagina ou nao achou a frase (o print nao sai).
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { abrirNavegador, opcoesDaFoto } from '../../gerar-imagens/scripts/lib/render.mjs'

export const TELA = { width: 390, height: 693 }, ESCALA = 2.77

// Acha a frase no texto da pagina (sem diferenca de maiuscula e de espaco), mesmo atravessando negrito ou link,
// embrulha cada pedaco num <mark> e centraliza. Roda dentro da pagina: so pode usar o que o navegador tem.
function marcarNaPagina(frase) {
  const minusculo = (s) => {
    let limpo = ''
    for (const c of s) { if (/\s/.test(c)) { if (!limpo.endsWith(' ')) limpo += ' ' } else limpo += c.toLowerCase() }
    return limpo
  }
  const alvo = minusculo(frase.trim())
  if (!alvo) return null
  // o texto da pagina todo, limpo (espaco repetido vira um, tudo minusculo), com o no e a posicao de cada letra
  let limpo = ''
  const onde = []
  // so texto que aparece: o escondido (hidden, display none, visibility hidden) daria marca fora do print
  const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode.nodeName)
      || !n.parentElement.checkVisibility({ visibilityProperty: true }) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  for (let no = andar.nextNode(); no; no = andar.nextNode()) {
    const s = no.nodeValue
    for (let i = 0; i < s.length; i++) {
      if (/\s/.test(s[i])) { if (limpo.endsWith(' ')) continue; limpo += ' ' } else limpo += s[i].toLowerCase()
      onde.push([no, i])
    }
  }
  const k = limpo.indexOf(alvo)
  if (k < 0) return null
  // um pedaco por no de texto, do ultimo pro primeiro, pra marcar um nao mexer na posicao do outro
  const pedacos = []
  for (let j = k; j < k + alvo.length; j++) {
    const [no, i] = onde[j]
    const p = pedacos[pedacos.length - 1]
    if (p && p.no === no) p.fim = i + 1; else pedacos.push({ no, ini: i, fim: i + 1 })
  }
  const marcas = []
  for (const p of pedacos.reverse()) {
    const r = document.createRange()
    r.setStart(p.no, p.ini); r.setEnd(p.no, p.fim)
    const mark = document.createElement('mark')
    mark.style.cssText = 'background:#ffe600;color:inherit;padding:0 2px'
    r.surroundContents(mark)
    marcas.unshift(mark)
  }
  marcas[0].scrollIntoView({ block: 'center' })
  const topo = marcas[0].getBoundingClientRect().top, pe = marcas[marcas.length - 1].getBoundingClientRect().bottom
  return (topo + pe) / 2 / window.innerHeight
}

// Esconde o aviso de cookie e de consentimento: caixa fixa na tela que fala de cookie cobre metade do print.
// Devolve quantos escondeu. Roda dentro da pagina.
function esconderAvisos() {
  let n = 0
  for (const el of document.querySelectorAll('body *')) {
    const pos = getComputedStyle(el).position
    if ((pos === 'fixed' || pos === 'sticky') && /cookie|consent|privacidade|lgpd/i.test(el.textContent || '')
      && el.getBoundingClientRect().height < window.innerHeight * 0.9) { el.style.setProperty('display', 'none', 'important'); n++ }
  }
  return n
}

export async function printar({ fonte, saida, marcar, raiz, carregar }) {
  const opcoes = opcoesDaFoto(saida)
  const url = /^https?:|^file:/.test(fonte) ? fonte : pathToFileURL(resolve(fonte)).href
  mkdirSync(dirname(resolve(saida)), { recursive: true })
  const navegador = await abrirNavegador({ raiz, carregar })
  try {
    const pagina = await navegador.newPage({ viewport: TELA, deviceScaleFactor: ESCALA, isMobile: true })
    await pagina.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    const avisos = await pagina.evaluate(esconderAvisos)
    // altura do meio da frase na tela, de 0 (topo) a 1 (pe)
    const centro = marcar ? await pagina.evaluate(marcarNaPagina, marcar) : null
    if (marcar && centro === null) {
      throw new Error(`nao achei a frase "${marcar}" na pagina. Copie a frase exatamente como esta escrita la (sem resumir).`)
    }
    await pagina.screenshot({ path: saida, ...opcoes })
    return { saida, centro, avisos }
  } finally {
    await navegador.close()
  }
}

async function main() {
  const { values: o, positionals: [fonte, saida] } = parseArgs({ allowPositionals: true, options: { marcar: { type: 'string' } } })
  if (!fonte || !saida) { console.error('uso: node print-pagina.mjs <url ou arquivo.html> <saida.png> [--marcar "frase"]'); return 1 }
  if (!/^https?:|^file:/.test(fonte) && !existsSync(fonte)) { console.error(`nao achei ${fonte}`); return 1 }
  try {
    await printar({ fonte, saida, marcar: o.marcar })
    console.log(`print-pagina: ${saida} (1080 por 1920${o.marcar ? ', frase marcada no meio' : ''})`)
    return 0
  } catch (e) {
    console.error(String(e.message || e))
    return 1
  }
}

const principal = () => {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}
if (principal()) process.exitCode = await main()
