// Leitura e escrita do .env do projeto. A escrita e atomica (temporario e rename) e nunca
// perde chave: o patch so acrescenta ou troca valor. Um .env lido truncado e gravado por
// cima apagaria todas as chaves boas de uma vez, e e isso que a checagem final barra.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from './raiz.mjs'

export const CAMINHO_ENV = join(RAIZ, '.env')

export function parseEnv(texto) {
  const out = {}
  for (const linhaCrua of String(texto).split(/\r?\n/)) {
    const linha = linhaCrua.trim()
    if (!linha || linha.startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i === -1) continue
    const chave = linha.slice(0, i).trim()
    let valor = linha.slice(i + 1).trim()
    const aspas = (valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))
    if (aspas && valor.length >= 2) valor = valor.slice(1, -1)
    out[chave] = valor
  }
  return out
}

export function lerEnv(caminho = CAMINHO_ENV) {
  return existsSync(caminho) ? parseEnv(readFileSync(caminho, 'utf8')) : {}
}

export function gravarEnv(patch, caminho = CAMINHO_ENV) {
  const antes = lerEnv(caminho)
  const linhas = existsSync(caminho) ? readFileSync(caminho, 'utf8').split(/\r?\n/) : []
  const vistas = new Set()
  const saida = linhas.map(l => {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (m && Object.prototype.hasOwnProperty.call(patch, m[1])) { vistas.add(m[1]); return `${m[1]}=${patch[m[1]]}` }
    return l
  })
  while (saida.length && saida[saida.length - 1] === '') saida.pop()
  for (const [k, v] of Object.entries(patch)) if (!vistas.has(k)) saida.push(`${k}=${v}`)
  const texto = saida.join('\n') + '\n'
  const depois = parseEnv(texto)
  const perdidas = Object.keys(antes).filter(k => !(k in depois))
  if (perdidas.length) throw new Error(`gravarEnv recusou gravar: o resultado perderia ${perdidas.join(', ')}`)
  const tmp = `${caminho}.tmp.${process.pid}`
  writeFileSync(tmp, texto)
  renameSync(tmp, caminho)
}
