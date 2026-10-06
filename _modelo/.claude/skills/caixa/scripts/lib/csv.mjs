// CSV do jeito que o Excel em portugues abre: separador ponto e virgula, BOM no comeco
// (senao acento vira lixo) e CRLF. Le tambem virgula como separador, sem BOM e com LF,
// porque a pessoa pode ter salvo pelo Google Planilhas.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const BOM = String.fromCharCode(0xfeff)

function separadorDe(cabecalho) {
  const pv = (cabecalho.match(/;/g) || []).length
  const v = (cabecalho.match(/,/g) || []).length
  return v > pv ? ',' : ';'
}

function quebrarLinhas(texto) {
  // respeita quebra de linha dentro de aspas
  const linhas = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (c === '"') aspas = !aspas
    if (!aspas && (c === '\n' || c === '\r')) {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linhas.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  if (atual !== '') linhas.push(atual)
  return linhas
}

function celulas(linha, sep) {
  const out = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++ }
      else if (c === '"') aspas = false
      else atual += c
    } else if (c === '"') aspas = true
    else if (c === sep) { out.push(atual); atual = '' }
    else atual += c
  }
  out.push(atual)
  return out.map(s => s.trim())
}

export function lerCsv(texto) {
  const t = String(texto).replace(new RegExp('^' + BOM), '')
  const linhas = quebrarLinhas(t).filter(l => l.trim() !== '')
  if (!linhas.length) return { colunas: [], linhas: [] }
  const sep = separadorDe(linhas[0])
  const colunas = celulas(linhas[0], sep).map(c => c.toLowerCase())
  const out = []
  for (const l of linhas.slice(1)) {
    const cel = celulas(l, sep)
    const obj = {}
    colunas.forEach((c, i) => { obj[c] = cel[i] ?? '' })
    out.push(obj)
  }
  return { colunas, linhas: out }
}

function escapar(v) {
  const s = String(v ?? '')
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function montarCsv(colunas, linhas) {
  const corpo = [colunas.join(';'), ...linhas.map(o => colunas.map(c => escapar(o[c])).join(';'))]
  return BOM + corpo.join('\r\n') + '\r\n'
}

export function lerArquivoCsv(caminho, colunas) {
  if (!existsSync(caminho)) return { colunas, linhas: [] }
  const texto = readFileSync(caminho, 'utf8')
  // salvo pelo Excel como "CSV (separado por virgulas)", sai sem UTF-8 e o acento vira lixo
  if (texto.includes(String.fromCharCode(0xfffd))) throw new Error(`${caminho} foi salvo num formato que estraga acento; no Excel, salve de novo como "CSV UTF-8 (delimitado por virgulas)"`)
  const r = lerCsv(texto)
  const faltam = colunas.filter(c => !r.colunas.includes(c))
  if (faltam.length) throw new Error(`${caminho}: faltam as colunas ${faltam.join(', ')}`)
  return r
}

export function gravarArquivoCsv(caminho, colunas, linhas) {
  mkdirSync(dirname(caminho), { recursive: true })
  writeFileSync(caminho, montarCsv(colunas, linhas))
}
