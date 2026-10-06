#!/usr/bin/env node
// Trava do atendimento: preco e prazo de resposta pra cliente so saem do catalogo.
// O rascunho (uma resposta por bloco, blocos separados por linha em branco) passa por aqui
// antes de ir pra pessoa: valor em R$ que nao e o preco do produto citado (ou, sem produto
// citado, que nao esta no catalogo), valor ilegivel e prazo menor que o do produto viram
// aviso. A pessoa decide o aviso; o script nao corrige nada.
// Uso: node atendimento.mjs validar [--catalogo dados/catalogo.csv]
//      node atendimento.mjs conferir <rascunho.md> [--catalogo dados/catalogo.csv] [--hoje AAAA-MM-DD]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerCsv } from '../../caixa/scripts/lib/csv.mjs'
import { centavos, reais, trechosEmReais } from '../../caixa/scripts/lib/dinheiro.mjs'
import { hojeLocal } from '../../caixa/scripts/lib/fatos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const COLUNAS = ['produto', 'tamanho', 'preco', 'prazo_dias', 'observacao']
const SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

const normal = s => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()
const compacto = s => normal(s).replace(/\s/g, '')
const escaparRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function validarCatalogo(texto) {
  const { colunas, linhas } = lerCsv(texto)
  const erros = []
  const faltam = COLUNAS.filter(c => !colunas.includes(c))
  if (faltam.length) return { itens: [], erros: [`faltam as colunas ${faltam.join(', ')}`] }
  if (!linhas.length) erros.push('catalogo sem nenhum produto')
  const vistos = new Set()
  const itens = []
  linhas.forEach((l, i) => {
    const n = i + 2
    const preco = centavos(l.preco)
    const prazo = /^\d+$/.test(l.prazo_dias) ? Number(l.prazo_dias) : null
    if (!l.produto) erros.push(`linha ${n}: produto vazio`)
    if (preco === null || preco <= 0) erros.push(`linha ${n}: preco "${l.preco}" ilegivel`)
    if (prazo === null) erros.push(`linha ${n}: prazo_dias "${l.prazo_dias}" tem que ser numero inteiro de dias`)
    const chave = normal(l.produto) + '|' + normal(l.tamanho)
    if (vistos.has(chave)) erros.push(`linha ${n}: ${l.produto} ${l.tamanho} repetido`)
    vistos.add(chave)
    if (l.produto && preco !== null && prazo !== null) itens.push({ produto: l.produto, tamanho: l.tamanho, preco, prazo })
  })
  return { itens, erros }
}

// "N dias", "amanha", "hoje" e dia da semana (contado a partir de hoje; o proprio dia conta 0,
// que e o caso mais apertado e por isso o que avisa)
function prazosDoBloco(bloco, hoje) {
  const t = normal(bloco)
  const out = []
  for (const m of t.matchAll(/\b(\d{1,3})\s*dias?\b/g)) out.push({ dias: Number(m[1]), texto: m[0] })
  for (const m of t.matchAll(/\bamanha\b/g)) out.push({ dias: 1, texto: m[0] })
  for (const m of t.matchAll(/\b(?:pra|para|ate|ainda) hoje\b|\bhoje mesmo\b/g)) out.push({ dias: 0, texto: m[0] })
  const dow = new Date(hoje + 'T00:00:00Z').getUTCDay()
  const DIA = '(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?'
  // horario de funcionamento ("de segunda a sabado") nao e prazo
  const semFaixa = t.replace(new RegExp(`\\b(?:de |da )?${DIA} (?:a|ate|e) ${DIA}\\b`, 'g'), ' ')
  for (const m of semFaixa.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/g)) {
    out.push({ dias: (SEMANA.indexOf(m[1]) - dow + 7) % 7, texto: m[0] })
  }
  return out
}

// tamanho so casa inteiro ("12 kg" nao e "2 kg"), com ou sem espaco ("2kg" e "2 kg")
function citaTamanho(t, tamanho) {
  const alvo = [...compacto(tamanho)].map(escaparRe).join(' ?')
  return alvo !== '' && new RegExp('(^|[^0-9a-z])' + alvo + '($|[^0-9a-z])').test(t)
}

function produtosDoBloco(bloco, itens) {
  const t = normal(bloco)
  const citados = itens.filter(i => t.includes(normal(i.produto)))
  // com tamanho escrito, fica so a linha daquele tamanho
  const comTamanho = citados.filter(i => i.tamanho && citaTamanho(t, i.tamanho))
  const nomes = new Set(comTamanho.map(i => normal(i.produto)))
  return [...comTamanho, ...citados.filter(i => !nomes.has(normal(i.produto)))]
}

const nomeItem = p => p.produto + (p.tamanho ? ' ' + p.tamanho : '')

export function conferir(rascunho, itens, hoje = hojeLocal()) {
  const todos = new Set(itens.map(i => i.preco))
  const blocos = String(rascunho).replace(/\r\n/g, '\n').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const avisos = []
  blocos.forEach((b, i) => {
    const onde = `resposta ${i + 1} ("${b.split('\n')[0].slice(0, 60)}")`
    const produtos = produtosDoBloco(b, itens)
    const daqui = new Set(produtos.map(p => p.preco))
    for (const v of trechosEmReais(b)) {
      if (v.centavos === null) avisos.push(`${onde}: "${v.trecho}" nao da pra ler como valor; escreva como R$ 170,00`)
      else if (produtos.length && !daqui.has(v.centavos)) avisos.push(`${onde}: ${reais(v.centavos)} nao e o preco de ${produtos.map(p => `${nomeItem(p)} (${reais(p.preco)})`).join(', ')}; se for soma, sinal ou desconto, confirme a conta`)
      else if (!produtos.length && !todos.has(v.centavos)) avisos.push(`${onde}: ${reais(v.centavos)} nao esta no catalogo; se for soma, sinal ou desconto, confirme a conta`)
    }
    const prazos = prazosDoBloco(b, hoje)
    if (!prazos.length) return
    if (!produtos.length) {
      avisos.push(`${onde}: promete prazo ("${prazos[0].texto}") sem citar produto do catalogo; confira o prazo`)
      return
    }
    const maior = produtos.reduce((a, p) => (p.prazo > a.prazo ? p : a))
    for (const p of prazos) {
      if (p.dias < maior.prazo) avisos.push(`${onde}: promete "${p.texto}" (${p.dias} dia(s) a partir de hoje), mas ${nomeItem(maior)} pede ${maior.prazo} dia(s) de antecedencia`)
    }
  })
  return avisos
}

function lerCatalogo(caminho) {
  if (!existsSync(caminho)) throw new Error(`nao achei o catalogo em ${caminho}; monte ele antes de responder preco`)
  return validarCatalogo(readFileSync(caminho, 'utf8'))
}

export function executar(argv, log = console.log) {
  const [cmd, ...resto] = argv
  const flags = {}
  const pos = []
  for (let k = 0; k < resto.length; k++) {
    if (resto[k].startsWith('--')) { flags[resto[k].slice(2)] = resto[k + 1]; k++ }
    else pos.push(resto[k])
  }
  const raiz = join(AQUI, '..', '..', '..', '..')
  const { itens, erros } = lerCatalogo(flags.catalogo || join(raiz, 'dados', 'catalogo.csv'))
  if (erros.length) {
    log('o catalogo tem problema, arrumar antes de responder preco:')
    for (const e of erros) log('- ' + e)
    return 1
  }
  if (cmd === 'validar') {
    log(`catalogo ok: ${itens.length} item(ns)`)
    return 0
  }
  if (cmd === 'conferir') {
    if (!pos[0] || !existsSync(pos[0])) throw new Error('conferir precisa do caminho do rascunho')
    const avisos = conferir(readFileSync(pos[0], 'utf8'), itens, flags.hoje || hojeLocal())
    if (!avisos.length) {
      log('tudo bate com o catalogo')
      return 0
    }
    log(`${avisos.length} ponto(s) pra pessoa decidir antes de mandar:`)
    for (const a of avisos) log('- ' + a)
    return 1
  }
  throw new Error('comando desconhecido; use validar ou conferir')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exitCode = executar(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(2) }
}
