#!/usr/bin/env node
// Placar de paridade: quanto o seu app ja faz das funcoes do app de referencia, o que falta
// e em que ordem construir. Le a lista de funcoes que a /app-estudar montou e que voce vai
// marcando enquanto constroi.
// Uso, da raiz do projeto:
//   node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv
//   node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --visual app/comparacoes
//   node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --markdown
//   node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --minimo 80
//   node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --exigir-obrigatorias
// Colunas (as outras sao ignoradas; vale o nome em portugues ou em ingles):
//   funcao      o que faz, em palavras simples ("remarcar um horario")
//   area        a tela ou o caminho onde ela fica ("agendamento")
//   prioridade  obrigatoria | importante | desejavel   (P0 | P1 | P2 tambem)
//   original    sim | nao     a referencia tem essa funcao
//   minha       sim | parcial | nao | pular
//   notas       qualquer coisa; no pular, diga o motivo
// Peso: obrigatoria 3, importante 2, desejavel 1. sim vale 1, parcial 0,5, nao 0.
// pular e funcao que a referencia nao tem (original nao) ficam fora da nota e aparecem
// numa lista a parte, entao o numero so mede paridade. A funcao so sua ainda conta nas
// obrigatorias prontas e no que falta, e "Melhor que a referencia" so sai com as suas
// obrigatorias e importantes feitas.
// --visual recebe os .json da comparar-telas.mjs (arquivo por arquivo ou a pasta inteira,
// porque o PowerShell nao expande *.json); a nota geral vira 80% funcoes e 20% telas.
// Saida: 0 ok; 1 nota geral abaixo do --minimo, ou alguma obrigatoria sem estar feita (sim)
// quando vem --exigir-obrigatorias; 2 arquivo ruim ou coluna faltando.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerArgs, numero } from '../../app-estudar/scripts/lib/args.mjs'
import { lerArquivoCsv } from '../../app-estudar/scripts/lib/csv.mjs'
import { dobrar } from '../../app-estudar/scripts/lib/texto.mjs'

const PESO = { obrigatoria: 3, importante: 2, desejavel: 1, must: 3, should: 2, could: 1, p0: 3, p1: 2, p2: 1 }
const CREDITO = { sim: 1, feito: 1, feita: 1, yes: 1, done: 1, parcial: 0.5, partial: 0.5, nao: 0, no: 0, todo: 0, '': 0 }
const PULAR = ['pular', 'skip']
const NAO_TEM = ['nao', 'no', 'n', 'false']
const NOME_PESO = { 3: 'obrigatoria', 2: 'importante', 1: 'desejavel' }
const COLUNA = { feature: 'funcao', priority: 'prioridade', clone: 'minha', notes: 'notas' }
const PRECISA = { funcao: 'feature', prioridade: 'priority', minha: 'clone' }

const um = n => Math.round(n * 10) / 10
const virgula = n => n.toFixed(1).replace('.', ',')

export function carregar(caminho) {
  const { colunas, linhas } = lerArquivoCsv(caminho)
  const nomes = colunas.map(c => { const d = dobrar(c); return COLUNA[d] ?? d })
  for (const [pt, en] of Object.entries(PRECISA)) {
    if (!nomes.includes(pt)) throw new Error(`${caminho} nao tem a coluna "${pt}" (ou "${en}"). Colunas que precisa: funcao, area, prioridade, original, minha, notas`)
  }
  const out = []
  linhas.forEach((bruta, i) => {
    const linha = { linha: i + 2 }
    colunas.forEach((c, j) => { linha[nomes[j]] = bruta[c] ?? '' })
    if (linha.funcao) out.push(linha)
  })
  return out
}

function pesoDe(r) {
  return r.peso ?? PESO[dobrar(r.prioridade)] ?? 1
}

function resumo(r) {
  return {
    funcao: r.funcao,
    area: r.area ?? '',
    prioridade: NOME_PESO[pesoDe(r)],
    minha: r.minha || 'nao',
    notas: r.notas ?? '',
    ...(r.so_sua ? { so_sua: true } : {})
  }
}

function antes(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function pontuar(linhas) {
  const contadas = []
  const fora = []
  const extras = []
  const problemas = []
  for (const r of linhas) {
    const original = dobrar(r.original) || 'sim'
    const minha = dobrar(r.minha)
    const prio = dobrar(r.prioridade)
    if (PULAR.includes(minha)) { fora.push(r); continue }
    if (!(prio in PESO)) problemas.push(`linha ${r.linha}: prioridade "${r.prioridade ?? ''}" nao e obrigatoria, importante ou desejavel; contei como desejavel`)
    if (!(minha in CREDITO)) problemas.push(`linha ${r.linha}: minha "${r.minha ?? ''}" nao e sim, parcial, nao ou pular; contei como nao`)
    const linha = { ...r, peso: PESO[prio] ?? 1, credito: CREDITO[minha] ?? 0 }
    if (NAO_TEM.includes(original)) extras.push({ ...linha, so_sua: true })
    else contadas.push(linha)
  }

  const total = contadas.reduce((s, r) => s + r.peso, 0)
  const ganho = contadas.reduce((s, r) => s + r.peso * r.credito, 0)
  const nota = total ? 100 * ganho / total : 0

  const areas = new Map()
  for (const r of contadas) {
    const a = r.area || '(sem area)'
    const t = areas.get(a) ?? { ganho: 0, total: 0, funcoes: 0 }
    t.ganho += r.peso * r.credito
    t.total += r.peso
    t.funcoes += 1
    areas.set(a, t)
  }
  const porArea = [...areas].map(([area, t]) => ({ area, nota: t.total ? um(100 * t.ganho / t.total) : 0, funcoes: t.funcoes }))
  porArea.sort((a, b) => a.nota - b.nota)

  const todas = [...contadas, ...extras]
  const faltando = todas.filter(r => r.credito < 1)
  faltando.sort((a, b) => b.peso - a.peso || a.credito - b.credito || antes(a.area ?? '', b.area ?? '') || antes(a.funcao, b.funcao))

  const obrigatorias = todas.filter(r => r.peso === 3)
  return {
    nota_funcoes: um(nota),
    contadas: contadas.length,
    obrigatorias_feitas: obrigatorias.filter(r => r.credito === 1).length,
    obrigatorias_total: obrigatorias.length,
    extras_prontas: extras.filter(r => r.credito === 1).length,
    extras_importantes_faltando: extras.filter(r => r.peso >= 2 && r.credito < 1).length,
    por_area: porArea,
    faltando: faltando.map(resumo),
    fora: fora.map(resumo),
    extras: extras.map(resumo),
    problemas
  }
}

function jsonsDe(caminho) {
  if (!existsSync(caminho)) throw new Error(`nao achei ${caminho}; confira o nome e a pasta`)
  if (!statSync(caminho).isDirectory()) return [caminho]
  const achados = readdirSync(caminho).filter(n => n.toLowerCase().endsWith('.json')).sort().map(n => join(caminho, n))
  if (!achados.length) throw new Error(`a pasta ${caminho} nao tem nenhum .json; gere com a comparar-telas.mjs --json-saida`)
  return achados
}

export function notasVisuais(caminhos) {
  const out = []
  for (const p of caminhos.flatMap(jsonsDe)) {
    let dado
    try {
      dado = JSON.parse(readFileSync(p, 'utf8'))
    } catch (e) {
      throw new Error(`${p} nao e JSON valido (${e.message})`)
    }
    const nota = dado?.nota ?? dado?.score
    if (typeof nota !== 'number') throw new Error(`${p} nao e saida da comparar-telas.mjs --json (falta a nota)`)
    const arquivo = dado.arquivos?.minha ?? dado.files?.clone ?? p
    out.push({ arquivo, nota, modo: dado.modo ?? dado.mode ?? 'layout' })
  }
  return out
}

export function veredito(r) {
  const faltam = r.obrigatorias_total - r.obrigatorias_feitas
  if (faltam > 0) return `Ainda nao da pra lancar: ${faltam} obrigatorias nao estao prontas.`
  if (r.nota_funcoes < 80) return `Ainda nao da pra lancar: as obrigatorias estao prontas e a nota das funcoes esta em ${virgula(r.nota_funcoes)}, abaixo de 80.`
  if (r.extras_prontas && !r.extras_importantes_faltando) return `Melhor que a referencia, pelas funcoes: todas as obrigatorias prontas, nota ${virgula(r.nota_funcoes)} e ${r.extras_prontas} funcoes suas prontas que a referencia nao tem. Confira os defeitos graves no relatorio da /app-testar antes de publicar.`
  return `Da pra lancar, pelas funcoes: todas as obrigatorias prontas e nota ${virgula(r.nota_funcoes)}. Confira os defeitos graves no relatorio da /app-testar antes de publicar.`
}

export function juntar(r, visuais) {
  if (visuais.length) {
    const layout = visuais.reduce((s, v) => s + v.nota, 0) / visuais.length
    r.visual = visuais
    r.nota_telas = um(layout)
    r.nota_geral = um(0.8 * r.nota_funcoes + 0.2 * layout)
  } else {
    r.nota_geral = r.nota_funcoes
  }
  r.veredito = veredito(r)
  return r
}

export function mostrar(r, markdown = false) {
  const h = markdown ? '## ' : ''
  const out = []
  out.push(`${h}Paridade: ${virgula(r.nota_geral)} / 100`, '')
  out.push(`funcoes ${virgula(r.nota_funcoes)}  (${r.contadas} contadas, obrigatorias ${r.obrigatorias_feitas} de ${r.obrigatorias_total} prontas)`)
  if (r.nota_telas !== undefined) out.push(`telas   ${virgula(r.nota_telas)}  (${r.visual.length} telas comparadas)`)
  out.push('', r.veredito, '', `${h}Por area, a mais fraca primeiro`)
  for (const a of r.por_area) out.push(`- ${a.area.padEnd(28)} ${virgula(a.nota).padStart(5)}  (${a.funcoes} funcoes)`)
  out.push('', `${h}Faltando, na ordem de construir`)
  if (!r.faltando.length) out.push('- nada. Toda funcao contada esta pronta.')
  for (const m of r.faltando) out.push(`- [${m.prioridade}] ${m.area || '-'}: ${m.funcao}, ${m.minha}${m.so_sua ? ', so sua' : ''}${m.notas ? `  (${m.notas})` : ''}`)
  if (r.fora.length) {
    out.push('', `${h}Deixadas de fora de proposito (sem nota)`)
    for (const m of r.fora) out.push(`- ${m.funcao}: ${m.notas || 'sem motivo escrito, ponha um na coluna notas'}`)
  }
  if (r.extras.length) {
    out.push('', `${h}Suas, que a referencia nao tem (sem nota)`)
    for (const m of r.extras) out.push(`- ${m.funcao}, ${m.minha}`)
  }
  if (r.visual?.length) {
    out.push('', `${h}Telas`)
    for (const v of [...r.visual].sort((a, b) => a.nota - b.nota)) out.push(`- ${String(v.arquivo).padEnd(40)} ${virgula(v.nota).padStart(5)}`)
  }
  if (r.problemas.length) {
    out.push('', `${h}Corrija na lista de funcoes`)
    for (const p of r.problemas) out.push(`- ${p}`)
  }
  return out.join('\n')
}

export function principal(argv, escrever = console.log, avisar = console.error) {
  let r, minimo, exigir
  try {
    const a = lerArgs(argv, ['visual'])
    if (!a._[0]) throw new Error('diga qual lista de funcoes ler, tipo: app/funcoes.csv')
    if (typeof a['exigir-obrigatorias'] === 'string') throw new Error('--exigir-obrigatorias nao leva valor; ponha depois da lista de funcoes')
    exigir = a['exigir-obrigatorias'] === true
    minimo = numero(a, 'minimo', undefined, { min: 0, max: 100 })
    r = juntar(pontuar(carregar(a._[0])), notasVisuais(a.visual ?? []))
    escrever(a.json ? JSON.stringify(r, null, 2) : mostrar(r, a.markdown === true))
  } catch (e) {
    avisar(`paridade: ${e.message}`)
    return 2
  }
  if (exigir && r.obrigatorias_feitas < r.obrigatorias_total) return 1
  return minimo !== undefined && r.nota_geral < minimo ? 1 : 0
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
