#!/usr/bin/env node
// Fatos datados da trilha: todo numero que envelhece (preco, taxa, regra) mora em
// referencias/fatos.md, com fonte e data. Este script diz quais passaram do prazo pra
// que a conversa confira na web antes de repassar ao aluno.
// Uso: node fatos.mjs vencidos [--hoje AAAA-MM-DD] [--arquivo <caminho>]
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PADRAO = join(AQUI, '..', 'referencias', 'fatos.md')
const DIA_MS = 24 * 60 * 60 * 1000

function dataValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function lerFatos(texto) {
  const linhas = String(texto).split(/\r?\n/)
  const ini = linhas.findIndex(l => /^\|\s*id\s*\|\s*fato\s*\|\s*fonte\s*\|\s*conferido_em\s*\|/.test(l))
  if (ini < 0) return { fatos: [], erros: ['nao achei a tabela com o cabecalho | id | fato | fonte | conferido_em |'] }
  const fatos = []
  const erros = []
  for (const l of linhas.slice(ini + 2)) {
    if (!l.trim().startsWith('|')) break
    const cel = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
    const [id, fato, fonte, conferido_em] = cel
    if (!id) continue
    const problemas = []
    if (cel.length !== 4) problemas.push(`tem ${cel.length} colunas, eram 4`)
    if (!/https:\/\//.test(fonte || '')) problemas.push('fonte sem link https')
    if (!dataValida(conferido_em || '')) problemas.push(`data "${conferido_em}" fora do formato AAAA-MM-DD ou impossivel`)
    if (problemas.length) erros.push(`${id}: ${problemas.join('; ')}`)
    else fatos.push({ id, fato, fonte, conferido_em })
  }
  return { fatos, erros }
}

export function vencidos(fatos, hoje, dias = 60) {
  const h = new Date(hoje + 'T00:00:00Z').getTime()
  return fatos.filter(f => (h - new Date(f.conferido_em + 'T00:00:00Z').getTime()) / DIA_MS > dias)
}

function hojeLocal() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2)
  if (a[0] !== 'vencidos') {
    console.error('uso: node fatos.mjs vencidos [--hoje AAAA-MM-DD] [--arquivo <caminho>]')
    process.exit(1)
  }
  const valor = nome => { const i = a.indexOf(nome); return i >= 0 ? a[i + 1] : undefined }
  const hoje = valor('--hoje') || hojeLocal()
  const { fatos, erros } = lerFatos(readFileSync(valor('--arquivo') || PADRAO, 'utf8'))
  if (erros.length) {
    console.log('o fatos.md tem linha com problema, arrumar antes de usar:')
    for (const e of erros) console.log('- ' + e)
    process.exit(1)
  }
  const v = vencidos(fatos, hoje)
  if (!v.length) console.log('nenhum fato vencido')
  for (const f of v) console.log(`${f.id}: ${f.fato} (conferido em ${f.conferido_em})`)
}
