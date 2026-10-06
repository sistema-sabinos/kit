// As letras das pecas com texto. Vem tres fontes do Google com a skill (licenca OFL,
// cada uma com o seu OFL-<familia>.txt do lado), entao a peca sai igual em Windows e
// Mac. A peca escreve so o nome e o peso; o caminho do arquivo entra por aqui.
// Fonte fora das tres, ou que nao carregou do disco, para a peca com aviso: o Chrome
// trocaria por uma letra reserva sem dizer nada.
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DIR_FONTES = fileURLToPath(new URL('../fontes', import.meta.url))

// Arquivos variaveis: cada um traz todos os pesos da faixa. A Fredoka sem a faixa
// abriria sempre no Light.
export const FONTES = [
  { familia: 'Manrope', arquivo: 'Manrope.ttf', pesos: '200 800' },
  { familia: 'Fredoka', arquivo: 'Fredoka.ttf', pesos: '300 700' },
  { familia: 'Lora', arquivo: 'Lora.ttf', pesos: '400 700' },
]

const NOMES = FONTES.map(f => f.familia).join(', ').replace(/, ([^,]*)$/, ' ou $1')

export function acharFonte(familia) {
  const k = String(familia || '').toLowerCase()
  return FONTES.find(f => f.familia.toLowerCase() === k) || null
}

// o pathToFileURL deixa o apostrofo cru, e ele fecharia o url('...') no meio do caminho
export function cssFontes(dir = DIR_FONTES) {
  return FONTES.map(f =>
    `@font-face { font-family: '${f.familia}'; src: url('${pathToFileURL(join(dir, f.arquivo)).href.replaceAll("'", '%27')}') format('truetype'); font-weight: ${f.pesos}; font-style: normal; }`
  ).join('\n')
}

// usadas: [{ familia, peso }] lidas da peca; carregadas: [{ familia, peso, faces }].
// Devolve a lista de problemas (vazia quando tudo certo).
export function avaliarFontes({ usadas, carregadas }) {
  const problemas = []
  for (const u of usadas) {
    const f = acharFonte(u.familia)
    if (!f) {
      const msg = `a letra "${u.familia}" nao esta embutida; use ${NOMES}`
      if (!problemas.includes(msg)) problemas.push(msg)
      continue
    }
    const c = carregadas.find(x => x.familia.toLowerCase() === u.familia.toLowerCase() && String(x.peso) === String(u.peso))
    if (!c || !(c.faces > 0)) problemas.push(`a letra "${f.familia}" (peso ${u.peso}) nao carregou do arquivo scripts/fontes/${f.arquivo}`)
  }
  return problemas
}

// Le a primeira familia e o peso de cada texto visivel da peca, pede cada fonte
// embutida ao navegador e lanca com a lista do que nao pode sair.
export async function conferirFontes(pagina) {
  const usadas = await pagina.evaluate(() => {
    const ignorar = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE'])
    const vistos = new Map()
    const anotar = cs => {
      const familia = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
      vistos.set(familia + '|' + cs.fontWeight, { familia, peso: cs.fontWeight })
    }
    const raiz = document.body || document.documentElement
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.textContent.trim() === '') continue
      const el = n.parentElement
      if (!el || ignorar.has(el.tagName)) continue
      // texto que nao aparece na imagem (display:none, visibility:hidden) nao conta
      if (!el.checkVisibility({ visibilityProperty: true })) continue
      anotar(getComputedStyle(el))
    }
    // texto que vem do CSS (content do ::before e do ::after) tambem sai na imagem;
    // content vazio ou so imagem (url) e enfeite; conta texto entre aspas, counter e attr
    for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
      if (ignorar.has(el.tagName) || !el.checkVisibility({ visibilityProperty: true })) continue
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(el, pseudo)
        const semImagem = String(cs.content).replace(/url\([^)]*\)/g, '')
        if (!/"[^"]+"|'[^']+'|counters?\(|attr\(/.test(semImagem)) continue
        anotar(cs)
      }
    }
    return [...vistos.values()]
  })
  const carregadas = []
  for (const u of usadas) {
    if (!acharFonte(u.familia)) continue
    let faces = 0
    try {
      faces = await pagina.evaluate(async ([familia, peso]) => {
        try {
          const lista = await document.fonts.load(`${peso} 40px "${familia}"`)
          return lista.filter(f => f.status === 'loaded').length
        } catch { return 0 }
      }, [u.familia, u.peso])
    } catch { faces = 0 }
    carregadas.push({ ...u, faces })
  }
  const problemas = avaliarFontes({ usadas, carregadas })
  if (problemas.length) throw new Error(`a peca nao saiu, por causa da letra:\n- ${problemas.join('\n- ')}`)
  return usadas
}
