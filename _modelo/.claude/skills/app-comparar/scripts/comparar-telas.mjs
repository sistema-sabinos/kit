#!/usr/bin/env node
// Compara o print de uma tela do app de referencia com a mesma tela do seu app e diz o quanto
// a disposicao bate e onde muda.
// Uso, da raiz do projeto:
//   node .claude/skills/app-comparar/scripts/comparar-telas.mjs app/prints/T07.png app/telas-minhas/T07.png
//   node .claude/skills/app-comparar/scripts/comparar-telas.mjs app/prints/T07.png app/telas-minhas/T07.png --saida app/diferencas/T07.png
//   node .claude/skills/app-comparar/scripts/comparar-telas.mjs app/prints/T07.png app/telas-minhas/T07.png --saida app/diferencas/T07.png --json-saida app/comparacoes/T07.json
//   node .claude/skills/app-comparar/scripts/comparar-telas.mjs ontem.png hoje.png --modo pixel --minimo 95
// Flags (sempre depois dos dois arquivos): --modo layout|pixel, --largura 480, --colunas 12,
// --tolerancia 24, --saida diferenca.png, --json, --json-saida resultado.json, --minimo 95.
// --json-saida grava o JSON direto no arquivo, em UTF-8 sem BOM, que e o que o paridade.mjs
// --visual le. Melhor que o > do terminal: o PowerShell 5.1 grava o > em outra codificacao.
// Dois modos:
//   layout (padrao)  compara a estrutura e ignora a cor. As duas telas viram mapa de bordas,
//                    cortado numa grade, e cada celula compara quanto de borda tem. A marca
//                    nova muda toda cor de proposito, entao cor nao conta aqui. So entram na
//                    nota as celulas com alguma coisa (em uma das duas), pra margem vazia nao
//                    inflar o numero. Esta e a nota que vai pro placar.
//   pixel            compara pixel a pixel com tolerancia. Serve pra conferir o seu app contra
//                    ele mesmo (hoje contra ontem), nunca pra perseguir os pixels da referencia.
// As duas imagens vao pra mesma largura (--largura, padrao 480) e se comparam na altura que as
// duas tem. Diferenca de altura aparece no relatorio.
// Saida: 0 ok; 1 nota abaixo do --minimo; 2 arquivo que nao existe, nao e PNG, e entrelacado
// ou esta corrompido, ou flag com valor ruim.
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerArgs, numero } from '../../app-estudar/scripts/lib/args.mjs'
import { lerPng, gravarPng } from './lib/png.mjs'

// Muda o tamanho pegando o pixel mais perto. Basta pra estrutura e e rapido.
export function redimensionar(img, novaL, novaA) {
  const { largura: l, altura: a, rgb } = img
  const xs = Array.from({ length: novaL }, (_, x) => Math.min(l - 1, Math.floor((x * l) / novaL)))
  const out = new Uint8Array(novaL * novaA * 3)
  for (let y = 0; y < novaA; y++) {
    const yo = Math.min(a - 1, Math.floor((y * a) / novaA))
    for (let x = 0; x < novaL; x++) {
      const o = (yo * l + xs[x]) * 3
      out.set(rgb.subarray(o, o + 3), (y * novaL + x) * 3)
    }
  }
  return { largura: novaL, altura: novaA, rgb: out }
}

export function naLargura(img, alvo) {
  if (img.largura === alvo) return img
  return redimensionar(img, alvo, Math.max(1, Math.round((img.altura * alvo) / img.largura)))
}

function cinza(img, altura) {
  const n = img.largura * altura
  const g = new Uint8Array(n)
  for (let i = 0; i < n; i++) g[i] = Math.floor((299 * img.rgb[3 * i] + 587 * img.rgb[3 * i + 1] + 114 * img.rgb[3 * i + 2]) / 1000)
  return g
}

function bordas(g, l, a, limiar) {
  const out = new Uint8Array(l * a)
  for (let y = 0; y < a; y++) {
    const baixo = y + 1 < a ? y + 1 : y
    for (let x = 0; x < l; x++) {
      const v = g[y * l + x]
      const dir = x + 1 < l ? g[y * l + x + 1] : v
      out[y * l + x] = Math.abs(dir - v) + Math.abs(g[baixo * l + x] - v) > limiar ? 1 : 0
    }
  }
  return out
}

// Junta as celulas marcadas em retangulos (vizinho de cima, baixo, lado), maior primeiro.
function regioes(marcas, nLin, nCol) {
  const visto = new Set()
  const out = []
  for (let r = 0; r < nLin; r++) {
    for (let c = 0; c < nCol; c++) {
      if (!marcas[r][c] || visto.has(r * nCol + c)) continue
      const pilha = [[r, c]]
      visto.add(r * nCol + c)
      const celulas = []
      while (pilha.length) {
        const [cr, cc] = pilha.pop()
        celulas.push([cr, cc])
        for (const [nr, nc] of [[cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]]) {
          if (nr >= 0 && nr < nLin && nc >= 0 && nc < nCol && marcas[nr][nc] && !visto.has(nr * nCol + nc)) {
            visto.add(nr * nCol + nc)
            pilha.push([nr, nc])
          }
        }
      }
      const rs = celulas.map((x) => x[0])
      const cs = celulas.map((x) => x[1])
      out.push([Math.min(...rs), Math.min(...cs), Math.max(...rs), Math.max(...cs), celulas.length])
    }
  }
  return out.sort((p, q) => q[4] - p[4])
}

export function onde(r0, c0, r1, c1, nLin, nCol) {
  const meioL = nLin > 1 ? (r0 + r1) / 2 / Math.max(1, nLin - 1) : 0.5
  const meioC = nCol > 1 ? (c0 + c1) / 2 / Math.max(1, nCol - 1) : 0.5
  const v = meioL < 0.34 ? 'topo' : meioL > 0.66 ? 'baixo' : 'meio'
  const h = meioC < 0.34 ? 'esquerda' : meioC > 0.66 ? 'direita' : 'centro'
  return `${v} ${h}`
}

export function veredito(nota) {
  if (nota >= 90) return 'bate'
  if (nota >= 75) return 'perto'
  if (nota >= 50) return 'em parte'
  return 'diferente'
}

const umaCasa = (x) => Math.round(x * 10) / 10

// Compara duas imagens ja lidas. Devolve o relatorio e a imagem de diferenca (a original
// clareada, com o que muda em vermelho).
export function comparar(imgA, imgB, { modo = 'layout', largura = 480, colunas = 12, tolerancia = 24, limiarBorda = 40 } = {}) {
  const alvo = Math.min(largura, imgA.largura, imgB.largura)
  const a = naLargura(imgA, alvo)
  const b = naLargura(imgB, alvo)
  const l = alvo
  const h = Math.min(a.altura, b.altura)
  const difAltura = a.altura ? ((b.altura - a.altura) / a.altura) * 100 : 0
  const praOriginal = imgA.largura / l

  const ga = cinza(a, h)
  const diff = new Uint8Array(l * h * 3)
  for (let i = 0; i < l * h; i++) diff.fill(200 + Math.floor(ga[i] / 5), 3 * i, 3 * i + 3)
  const pinta = (i, r, g, bz) => {
    diff[3 * i] = r
    diff[3 * i + 1] = g
    diff[3 * i + 2] = bz
  }
  const relatorio = {
    modo,
    original: { largura: imgA.largura, altura: imgA.altura },
    minha: { largura: imgB.largura, altura: imgB.altura },
    comparado_em: { largura: l, altura: h },
    diferenca_altura_pct: umaCasa(difAltura),
  }

  const celula = Math.max(1, Math.floor(l / colunas))
  // A sobra da largura vira uma coluna parcial no fim, do mesmo jeito que a sobra da altura vira
  // a ultima linha: sem ela a faixa da direita fica fora da grade, e jogar a sobra inteira na
  // ultima coluna dilui a borda dela abaixo do limiar quando ha muitas colunas (achado do Codex).
  const nCol = Math.ceil(l / celula)
  const fimX = (c) => Math.min(l, (c + 1) * celula)
  const nLin = Math.ceil(h / celula)
  const marcas = Array.from({ length: nLin }, () => new Array(nCol).fill(false))
  let nota
  if (modo === 'pixel') {
    let mudou = 0
    const marcaPx = new Uint8Array(l * h)
    for (let i = 0; i < l * h; i++) {
      const d = Math.max(Math.abs(a.rgb[3 * i] - b.rgb[3 * i]), Math.abs(a.rgb[3 * i + 1] - b.rgb[3 * i + 1]), Math.abs(a.rgb[3 * i + 2] - b.rgb[3 * i + 2]))
      if (d > tolerancia) {
        marcaPx[i] = 1
        mudou++
        pinta(i, 220, 30, 30)
      }
    }
    nota = 100 * (1 - mudou / (l * h || 1))
    relatorio.pixels_diferentes = mudou
    // Resume os pixels em regioes da grade, pra o relatorio continuar legivel.
    for (let r = 0; r < nLin; r++) {
      for (let c = 0; c < nCol; c++) {
        let acertos = 0
        let area = 0
        for (let y = r * celula; y < Math.min(h, (r + 1) * celula); y++) {
          for (let x = c * celula; x < Math.min(l, fimX(c)); x++) {
            area++
            acertos += marcaPx[y * l + x]
          }
        }
        marcas[r][c] = area > 0 && acertos / area > 0.02
      }
    }
  } else {
    const ea = bordas(ga, l, h, limiarBorda)
    const eb = bordas(cinza(b, h), l, h, limiarBorda)
    const sims = []
    for (let r = 0; r < nLin; r++) {
      for (let c = 0; c < nCol; c++) {
        const y0 = r * celula
        const y1 = Math.min(h, (r + 1) * celula)
        const x0 = c * celula
        const x1 = Math.min(l, fimX(c))
        const area = (y1 - y0) * (x1 - x0)
        if (area <= 0) continue
        let sa = 0
        let sb = 0
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sa += ea[y * l + x]
            sb += eb[y * l + x]
          }
        }
        const da = sa / area
        const db = sb / area
        const topo = Math.max(da, db)
        if (topo < 0.01) continue // vazia nas duas: nao diz nada da disposicao
        const sim = 1 - Math.abs(da - db) / topo
        sims.push(sim)
        if (sim < 0.6) {
          marcas[r][c] = true
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const g0 = diff[3 * (y * l + x)]
              pinta(y * l + x, Math.min(255, g0 + 30), Math.floor(g0 / 3), Math.floor(g0 / 3))
            }
          }
        }
      }
    }
    nota = sims.length ? (100 * sims.reduce((s, x) => s + x, 0)) / sims.length : 100
  }

  relatorio.nota = umaCasa(nota)
  relatorio.veredito = veredito(nota)
  relatorio.regioes = regioes(marcas, nLin, nCol).map(([r0, c0, r1, c1, n]) => {
    const x = Math.floor(c0 * celula * praOriginal)
    const y = Math.floor(r0 * celula * praOriginal)
    return {
      x,
      y,
      largura: Math.min(imgA.largura - x, Math.floor((Math.min(l, fimX(c1)) - c0 * celula) * praOriginal)),
      altura: Math.min(imgA.altura - y, Math.floor((r1 - r0 + 1) * celula * praOriginal)),
      celulas: n,
      onde: onde(r0, c0, r1, c1, nLin, nCol),
    }
  })
  return { relatorio, diff: { largura: l, altura: h, rgb: diff } }
}

export function mostrar(rel, nomeA, nomeB) {
  const barra = Math.round((rel.nota / 100) * 24)
  const linhas = [
    `  ${nomeA} contra ${nomeB}`,
    `  ${rel.modo.toUpperCase().padEnd(6)} ${'#'.repeat(barra)}${'.'.repeat(24 - barra)}  ${rel.nota.toFixed(1).padStart(5)}  ${rel.veredito.toUpperCase()}`,
  ]
  const dh = rel.diferenca_altura_pct
  if (Math.abs(dh) >= 5) linhas.push(`  altura: a sua tela e ${Math.round(Math.abs(dh))}% mais ${dh > 0 ? 'alta' : 'baixa'} que a original`)
  if (rel.regioes.length) {
    linhas.push('  onde muda (em pixel da original, maior primeiro):')
    for (const r of rel.regioes.slice(0, 8)) linhas.push(`    ${r.onde.padEnd(15)} x=${r.x} y=${r.y} largura=${r.largura} altura=${r.altura}`)
  } else {
    linhas.push('  nenhuma regiao diferente')
  }
  return linhas.join('\n')
}

export function principal(argv, escrever = console.log, avisar = console.error) {
  const a = lerArgs(argv)
  let opcoes
  let imgA
  let imgB
  try {
    if (a._.length !== 2) throw new Error('passe dois PNG: o print da referencia e o da sua tela, nessa ordem, e as flags depois')
    const modo = a.modo === undefined ? 'layout' : a.modo
    if (modo !== 'layout' && modo !== 'pixel') throw new Error(`--modo aceita layout ou pixel, e veio "${modo}"`)
    if (a.saida === true) throw new Error('--saida precisa do caminho do PNG de diferenca')
    if (a['json-saida'] === true) throw new Error('--json-saida precisa do caminho do .json, tipo app/comparacoes/T07.json')
    opcoes = {
      modo,
      largura: Math.floor(numero(a, 'largura', 480, { min: 1, max: 10000 })),
      colunas: Math.floor(numero(a, 'colunas', 12, { min: 1, max: 200 })),
      tolerancia: numero(a, 'tolerancia', 24, { min: 0, max: 255 }),
      minimo: numero(a, 'minimo', undefined, { min: 0, max: 100 }),
    }
    imgA = lerPng(a._[0])
    imgB = lerPng(a._[1])
  } catch (e) {
    avisar(`comparar-telas: ${e.message}`)
    return 2
  }
  const { relatorio, diff } = comparar(imgA, imgB, opcoes)
  relatorio.arquivos = { original: a._[0], minha: a._[1] }
  if (a.saida) {
    try {
      gravarPng(a.saida, diff)
    } catch (e) {
      avisar(`comparar-telas: nao consegui gravar ${a.saida} (${e.message}): confira se a pasta existe`)
      return 2
    }
    relatorio.imagem_diff = a.saida
  }
  const destinoJson = a['json-saida']
  if (destinoJson) {
    try {
      writeFileSync(destinoJson, JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
    } catch (e) {
      avisar(`comparar-telas: nao consegui gravar ${destinoJson} (${e.message}): confira se a pasta existe`)
      return 2
    }
  }
  if (a.json) {
    escrever(JSON.stringify(relatorio, null, 2))
  } else {
    escrever(mostrar(relatorio, a._[0], a._[1]))
    if (a.saida) escrever(`  imagem da diferenca: ${a.saida}`)
    if (destinoJson) escrever(`  resultado pro placar: ${destinoJson}`)
  }
  return opcoes.minimo !== undefined && relatorio.nota < opcoes.minimo ? 1 : 0
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
