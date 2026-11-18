// Lista de lacunas do conselheiro (5.57). Quando ele deduz porque o material da pessoa nao cobre
// o tema, anota o tema no projeto aberto, sem pesquisar nada no meio da resposta. O "atualiza o
// <apelido>" (Passo 2 da /clonar-especialista) junta as anotacoes de todos os projetos na
// copia-mestra, pesquisa so esses temas e, no fim, marca cada um como coberta ou sem-fonte.
// Anotacao e marcacao levam data e hora com segundos: tema fechado que volta depois, mesmo no
// mesmo dia, reabre (achado da comum no plano da 5.69).
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/lacunas.mjs anotar <apelido> "<tema>"
//   node .claude/skills/clonar-especialista/scripts/lacunas.mjs juntar <pasta-do-conselheiro>
//   node .claude/skills/clonar-especialista/scripts/lacunas.mjs marcar <pasta-do-conselheiro> "<tema>" coberta|sem-fonte [fichas]
// anotar grava em inteligencia/conselheiros/<apelido>/lacunas.md do projeto aberto, uma linha por
// deducao. juntar le esse arquivo do projeto aberto e de
// cada projeto da pasta-mae (copia-mestra em <pasta-mae>/agentes/<apelido>) e acrescenta na
// tabela lacunas.md da copia-mestra o tema que nao esta aberta, ou que voltou depois de fechado;
// nada se apaga nos projetos. Sai 0 com o resumo e uma linha "aberta: <tema>" por tema aberto.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ehMestra } from './lib/pasta-mae.mjs'

const FORMATO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STATUS = ['coberta', 'sem-fonte']
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const pastas = dir => {
  try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() } catch { return [] }
}
const ehPasta = p => { try { return statSync(p).isDirectory() } catch { return false } }
const doisDig = n => String(n).padStart(2, '0')
// hora local do computador, como o aluno le
export const agora = (d = new Date()) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())} ${doisDig(d.getHours())}:${doisDig(d.getMinutes())}:${doisDig(d.getSeconds())}`
export const chave = tema => String(tema ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
// tema numa linha so, sem a barra vertical da tabela, ate 120 caracteres
const limpar = tema => String(tema ?? '').replace(/[|]/g, '/').replace(/\s+/g, ' ').trim()
const eolDe = texto => (texto.includes(CR + LF) ? CR + LF : LF)
const DATA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export const arquivoDoProjeto = (projeto, apelido) => join(projeto, 'inteligencia', 'conselheiros', apelido, 'lacunas.md')

// linhas "- <data> | <tema>" do arquivo do projeto; o resto (titulo, texto) se ignora
export function lerAnotacoes(texto) {
  const out = []
  for (const l of String(texto ?? '').split(/\r?\n/)) {
    const m = /^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \| (.+?)\s*$/.exec(l)
    if (m) out.push({ data: m[1], tema: m[2] })
  }
  return out
}

export function anotar(projeto, apelido, tema, { quando = agora() } = {}) {
  if (typeof apelido !== 'string' || !FORMATO.test(apelido)) return { codigo: 1, linhas: [`apelido fora do formato: "${apelido ?? ''}"`] }
  const t = limpar(tema)
  if (!t) return { codigo: 1, linhas: ['tema vazio: diga em poucas palavras o assunto que o material nao cobre'] }
  if (t.length > 120) return { codigo: 1, linhas: [`tema com ${t.length} caracteres (teto 120): resuma o assunto`] }
  const f = arquivoDoProjeto(projeto, apelido)
  const texto = ler(f)
  // sem deduplicar aqui: o projeto nao ve a copia-mestra, e pular o tema repetido engolia a
  // recorrencia de depois do fechamento (comum e interna do B1 da 5.69); o juntar nao repete
  // so acrescenta no fim, nunca regrava: regravar perdia a anotacao de outra conversa que gravou
  // entre a leitura e a escrita (final da 5.69, duas voltas). Arquivo novo leva o cabecalho na
  // mesma escrita da linha; duas conversas criando juntas deixam no maximo um cabecalho repetido
  mkdirSync(dirname(f), { recursive: true })
  const eol = texto ? eolDe(texto) : LF
  const cab = texto ? '' : [`# Lacunas do ${apelido}`, '', 'Temas em que o conselheiro deduziu porque o material da pessoa nao cobre. O "atualiza o ' + apelido + '" pesquisa estes temas.', ''].join(LF) + LF
  appendFileSync(f, cab + (texto && !texto.endsWith(LF) ? eol : '') + `- ${quando} | ${t}` + eol)
  return { codigo: 0, linhas: [`anotada: ${t}`] }
}

// tabela da copia-mestra: | tema | anotada | status | marcada | fichas |
const CABECALHO = ['# Lacunas', '', '| tema | anotada | status | marcada | fichas |', '|---|---|---|---|---|']
export function lerTabela(texto) {
  const linhas = []
  for (const l of String(texto ?? '').split(/\r?\n/)) {
    // cabecalho pela linha inteira: lacuna chamada "tema" e lacuna, nao cabecalho (final da 5.69)
    if (!/^\|/.test(l) || /^\|\s*tema\s*\|\s*anotada\s*\|\s*status\s*\|\s*marcada\s*\|\s*fichas\s*\|$/.test(l) || /^\|[-\s|]+\|$/.test(l)) continue
    const c = l.split('|').slice(1, -1).map(s => s.trim())
    if (c.length !== 5) continue
    linhas.push({ tema: c[0], anotada: c[1], status: c[2], marcada: c[3], fichas: c[4] })
  }
  return linhas
}
const linhaDaTabela = r => `| ${r.tema} | ${r.anotada} | ${r.status} | ${r.marcada} | ${r.fichas} |`
const gravarTabela = (f, textoVelho, linhas) => {
  const eol = textoVelho ? eolDe(textoVelho) : LF
  writeFileSync(f, [...CABECALHO, ...linhas.map(linhaDaTabela)].join(eol) + eol)
}

// de onde vem: o projeto aberto e, com a copia-mestra na pasta-mae, cada projeto dela
export function fontesDasAnotacoes(pasta, { projeto = '.' } = {}) {
  const apelido = basename(resolve(pasta))
  const arquivos = [arquivoDoProjeto(resolve(projeto), apelido)]
  const pai = dirname(resolve(pasta))
  if (basename(pai).toLowerCase() === 'agentes') {
    const mae = dirname(pai)
    for (const p of pastas(mae)) arquivos.push(arquivoDoProjeto(join(mae, p), apelido))
  }
  const vistos = new Set()
  return arquivos.filter(f => {
    if (!existsSync(f)) return false
    const k = realpathSync(f).toLowerCase()
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

export function juntar(pasta, { projeto = '.', casa = homedir() } = {}) {
  if (!ehMestra(pasta, casa)) return { codigo: 1, linhas: [`nao juntei: ${resolve(pasta)} nao e a copia-mestra (<pasta-mae>/agentes/<apelido> ou ~/.claude/conselheiros/<apelido>)`] }
  if (!ehPasta(pasta)) return { codigo: 1, linhas: [`nao juntei: ${resolve(pasta)} nao existe: confira o apelido`] }
  const f = join(pasta, 'lacunas.md')
  const velho = ler(f)
  const tabela = lerTabela(velho)
  const fontes = fontesDasAnotacoes(pasta, { projeto })
  const anotacoes = fontes.flatMap(a => lerAnotacoes(ler(a))).sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  let novos = 0
  for (const a of anotacoes) {
    const k = chave(a.tema)
    const mesmas = tabela.filter(r => chave(r.tema) === k)
    if (mesmas.some(r => r.status === 'aberta')) continue
    // fechada depois (ou no mesmo segundo) desta anotacao: ja foi tratada
    if (mesmas.some(r => STATUS.includes(r.status) && DATA.test(r.marcada) && r.marcada >= a.data)) continue
    tabela.push({ tema: limpar(a.tema), anotada: a.data, status: 'aberta', marcada: '', fichas: '' })
    novos++
  }
  if (novos) gravarTabela(f, velho, tabela)
  const abertas = tabela.filter(r => r.status === 'aberta')
  return { codigo: 0, linhas: [`juntei: ${novos} temas novos de ${fontes.length} projetos; abertas: ${abertas.length}`, ...abertas.map(r => `aberta: ${r.tema}`)] }
}

export function marcar(pasta, tema, status, fichas = '', { casa = homedir(), quando = agora() } = {}) {
  if (!ehMestra(pasta, casa)) return { codigo: 1, linhas: [`nao marquei: ${resolve(pasta)} nao e a copia-mestra`] }
  if (!ehPasta(pasta)) return { codigo: 1, linhas: [`nao marquei: ${resolve(pasta)} nao existe: confira o apelido`] }
  if (!STATUS.includes(status)) return { codigo: 1, linhas: [`status "${status ?? ''}": use coberta ou sem-fonte`] }
  if (fichas && !/^\d+(?:, ?\d+)*$/.test(fichas)) return { codigo: 1, linhas: [`fichas "${fichas}": use os numeros do inventario, tipo "24, 25"`] }
  if (status === 'coberta' && !fichas) return { codigo: 1, linhas: ['coberta pede as fichas que cobriram o tema, tipo "24, 25"'] }
  const f = join(pasta, 'lacunas.md')
  const velho = ler(f)
  const tabela = lerTabela(velho)
  const r = tabela.find(x => x.status === 'aberta' && chave(x.tema) === chave(tema))
  if (!r) return { codigo: 1, linhas: [`nao achei lacuna aberta com o tema "${limpar(tema)}": rode o juntar e copie o tema da linha aberta`] }
  Object.assign(r, { status, marcada: quando, fichas })
  gravarTabela(f, velho, tabela)
  return { codigo: 0, linhas: [`marcada: ${r.tema} ${status}`] }
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
  const [cmd, a, b, c, d] = process.argv.slice(2)
  let r
  if (cmd === 'anotar' && a && b) r = anotar('.', a, b)
  else if (cmd === 'juntar' && a) r = juntar(a)
  else if (cmd === 'marcar' && a && b && c) r = marcar(a, b, c, d ?? '')
  else {
    console.log('Uso: node .claude/skills/clonar-especialista/scripts/lacunas.mjs anotar <apelido> "<tema>" | juntar <pasta-do-conselheiro> | marcar <pasta-do-conselheiro> "<tema>" coberta|sem-fonte [fichas]')
    process.exit(1)
  }
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
