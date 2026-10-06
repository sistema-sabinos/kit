// Fatos datados (valor, prazo, regra que muda) moram em referencias/fatos.md de cada skill,
// com fonte e data. Mesmo formato do fatos.md da trilha de venda: | id | fato | fonte | conferido_em |
import { readFileSync } from 'node:fs'

const DIA_MS = 24 * 60 * 60 * 1000

export function dataValida(s) {
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

export function lerArquivoFatos(caminho) {
  const r = lerFatos(readFileSync(caminho, 'utf8'))
  if (r.erros.length) throw new Error(`${caminho} tem linha com problema: ${r.erros.join(' | ')}`)
  return r.fatos
}

export function vencidos(fatos, hoje, dias = 60) {
  const h = new Date(hoje + 'T00:00:00Z').getTime()
  return fatos.filter(f => (h - new Date(f.conferido_em + 'T00:00:00Z').getTime()) / DIA_MS > dias)
}

export function fato(fatos, id) {
  const f = fatos.find(x => x.id === id)
  if (!f) throw new Error(`fato "${id}" sumiu do fatos.md`)
  return f
}

export function hojeLocal() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function diasEntre(de, ate) {
  return Math.round((new Date(ate + 'T00:00:00Z') - new Date(de + 'T00:00:00Z')) / DIA_MS)
}
