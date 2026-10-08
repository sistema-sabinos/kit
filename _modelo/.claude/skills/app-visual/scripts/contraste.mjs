#!/usr/bin/env node
// Contraste das cores do app: cada cor de texto contra o fundo onde ela fica, pela conta da
// WCAG 2.2 (a regra internacional de acessibilidade pra tela). Rode depois de toda troca de
// paleta, inclusive na marca nova, porque e na paleta nova que o contraste quebra.
// Uso, da raiz do projeto:
//   node .claude/skills/app-visual/scripts/contraste.mjs app/visual/tokens.json
//   node .claude/skills/app-visual/scripts/contraste.mjs app/visual/tokens.json --json
//   node .claude/skills/app-visual/scripts/contraste.mjs "#6b7280" "#ffffff"      (um par)
// Os pares vem da lista "pairs" do arquivo: [["texto", "fundo"], ...], ou
// [["texto-mudo", "superficie", "grande"], ...] pra texto de 24px pra cima (ou 18,66px em
// negrito), que so precisa de 3:1; "ui" no terceiro item vale pra borda de campo, botao e
// anel de foco, que tambem precisam de 3:1. Sem a lista, toda cor com text, fg, on, texto ou
// sobre no nome e checada contra toda cor com bg, background, surface, fundo ou superficie.
// Limiares (WCAG 2.2): texto normal AA 4,5 e AAA 7; texto grande AA 3 e AAA 4,5; ui 3.
// Saida: 0 todos os pares passam no AA; 1 algum par reprova ou cita cor que nao existe;
// 2 arquivo ruim, par que nao da pra ler na lista "pairs" ou nada pra checar.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerArgs } from '../../app-estudar/scripts/lib/args.mjs'
import { dobrar } from '../../app-estudar/scripts/lib/texto.mjs'

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const PRECISA = { normal: [4.5, 7], large: [3, 4.5], ui: [3, 3] }
const TAMANHO = { normal: 'normal', large: 'large', grande: 'large', ui: 'ui' }
const NOME_TEXTO = /(^|-)(text|fg|on|texto|sobre)(-|$)/
const NOME_FUNDO = /(^|-)(bg|background|surface|fundo|superficie)(-|$)/

export function lerHex(valor) {
  const m = HEX.exec(String(valor).trim())
  if (!m) throw new Error(`"${valor}" nao e cor em hexadecimal: escreva assim, #1a2b3c ou #abc`)
  let h = m[1]
  if (h.length === 3) h = [...h].map(c => c + c).join('')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
}

export function luminancia(rgb) {
  const canal = c => {
    c = c / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb.map(canal)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function razao(texto, fundo) {
  const la = luminancia(lerHex(texto))
  const lb = luminancia(lerHex(fundo))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// {"color": {"texto": {"mudo": "#..."}}} vira {"texto-mudo": "#..."}
export function achatar(obj, prefixo = '') {
  const out = {}
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const chave of ['value', '$value']) {
      if (typeof obj[chave] === 'string') {
        out[prefixo] = obj[chave]
        return out
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$') || k.startsWith('_')) continue
      Object.assign(out, achatar(v, prefixo ? `${prefixo}-${k}` : k))
    }
  } else if (typeof obj === 'string' && HEX.test(obj.trim())) {
    out[prefixo] = obj.trim()
  }
  return out
}

export function cores(tokens) {
  const fonte = tokens.color ?? tokens.colors ?? tokens.colour ?? {}
  return Object.fromEntries(Object.entries(achatar(fonte)).filter(([, v]) => HEX.test(v)))
}

// nome com acento ("superfície") casa igual ao sem acento, pela dobra
export function paresPadrao(cols) {
  const nomes = Object.keys(cols)
  const textos = nomes.filter(k => NOME_TEXTO.test(dobrar(k)))
  const fundos = nomes.filter(k => NOME_FUNDO.test(dobrar(k)))
  return textos.flatMap(t => fundos.map(f => [t, f]))
}

const FORMATO = 'cada par e uma lista com o nome da cor do texto e o da cor do fundo, tipo ["texto", "fundo"], ou ["texto", "fundo", "grande"]'

// par que nao da pra ler e erro (sai 2), nunca par pulado calado
export function checar(cols, pares) {
  const linhas = []
  for (const p of pares) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') {
      throw new Error(`par que nao da pra ler na lista "pairs": ${JSON.stringify(p)}. ${FORMATO}`)
    }
    const [texto, fundo] = p
    const tamanho = TAMANHO[dobrar(p[2] ?? 'normal')] ?? 'normal'
    if (!Object.hasOwn(cols, texto) || !Object.hasOwn(cols, fundo)) {
      linhas.push({ texto, fundo, tamanho, erro: 'cor que nao existe no arquivo' })
      continue
    }
    const r = razao(cols[texto], cols[fundo])
    const [aa, aaa] = PRECISA[tamanho]
    linhas.push({ texto, fundo, tamanho, razao: Math.round(r * 100) / 100, aa: r >= aa, aaa: r >= aaa, texto_hex: cols[texto], fundo_hex: cols[fundo] })
  }
  return linhas
}

const reprova = l => 'erro' in l || !l.aa

export function mostrar(linhas) {
  const out = []
  for (const l of linhas) {
    if ('erro' in l) {
      out.push(`  ??       ${l.texto.padEnd(24)} sobre ${l.fundo.padEnd(20)} ${l.erro}`)
      continue
    }
    const nota = l.tamanho === 'ui' ? (l.aa ? 'PASSA' : 'REPROVA') : l.aaa ? 'AAA' : l.aa ? 'AA' : 'REPROVA'
    const tam = { normal: '', large: 'grande', ui: 'ui' }[l.tamanho]
    out.push(`  ${nota.padEnd(7)} ${l.razao.toFixed(2).padStart(5)}:1  ${l.texto.padEnd(24)} sobre ${l.fundo.padEnd(20)} ${tam}`.trimEnd())
  }
  out.push('', `  ${linhas.length} pares, ${linhas.filter(reprova).length} reprovando no AA`)
  return out.join('\n')
}

export function principal(argv, escrever = console.log, avisar = console.error) {
  const a = lerArgs(argv)
  let cols, pares
  try {
    if (a._.length === 0) throw new Error('uso: contraste.mjs tokens.json [--json], ou contraste.mjs "#texto" "#fundo"')
    if (a._.length === 2 && a._.every(x => HEX.test(x))) {
      cols = { texto: a._[0], fundo: a._[1] }
      pares = [['texto', 'fundo']]
    } else {
      let bruto
      try {
        bruto = readFileSync(a._[0], 'utf8')
      } catch {
        throw new Error(`nao achei o arquivo ${a._[0]}: confira o caminho a partir da raiz do projeto`)
      }
      let tokens
      try {
        tokens = JSON.parse(bruto)
      } catch (e) {
        throw new Error(`${a._[0]} nao e JSON valido (${e.message}): confira virgula e aspas`)
      }
      cols = cores(tokens)
      if (tokens.pairs !== undefined && !Array.isArray(tokens.pairs)) {
        throw new Error(`"pairs" tem que ser uma lista de pares, tipo [["texto", "fundo"]], e veio ${JSON.stringify(tokens.pairs)}`)
      }
      pares = tokens.pairs?.length ? tokens.pairs : paresPadrao(cols)
    }
  } catch (e) {
    avisar(`contraste: ${e.message}`)
    return 2
  }
  if (!pares.length) {
    avisar('contraste: nenhum par pra checar. Ponha uma lista "pairs" no arquivo, tipo [["texto", "fundo"]].')
    return 2
  }
  let linhas
  try {
    linhas = checar(cols, pares)
  } catch (e) {
    avisar(`contraste: ${e.message}`)
    return 2
  }
  if (!linhas.length) {
    avisar('contraste: nenhum par conferido. Confira a lista "pairs", tipo [["texto", "fundo"]].')
    return 2
  }
  escrever(a.json ? JSON.stringify(linhas, null, 2) : mostrar(linhas))
  return linhas.some(reprova) ? 1 : 0
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    process.exitCode = principal(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
