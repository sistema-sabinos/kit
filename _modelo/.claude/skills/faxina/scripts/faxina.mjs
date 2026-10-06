#!/usr/bin/env node
// Checagens mecanicas da /faxina. So le e relata; o unico comando que mexe em arquivo e o
// `arquivar --sim`, que a skill so roda depois do sim da pessoa.
// Uso (da raiz do projeto):
//   node .claude/skills/faxina/scripts/faxina.mjs [relatorio] [--hoje AAAA-MM-DD]
//   node .claude/skills/faxina/scripts/faxina.mjs arquivar --sim [--hoje AAAA-MM-DD]
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, renameSync, appendFileSync, openSync, readSync, closeSync, realpathSync } from 'node:fs'
import { join, relative, sep, basename, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

const DIA = 24 * 60 * 60 * 1000
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})/

// data de calendario sai pelo fuso local, nunca por toISOString (que e UTC)
export function dataLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function diasEntre(a, b) {
  const t = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(b) - t(a)) / DIA)
}

const rel = (raiz, p) => relative(raiz, p).split(sep).join('/')
const eol = txt => ((txt.match(/\r\n/g) || []).length * 2 > (txt.match(/\n/g) || []).length ? '\r\n' : '\n')

// ---------- decisoes ----------
// Entrada comeca numa linha cuja primeira coisa (depois de #, - ou *) e uma data.
const RE_ENTRADA = /^\s*(?:#{1,6}\s+|[-*]\s+)?\**\s*(\d{4}-\d{2}-\d{2})\b/

export function lerDecisoes(texto) {
  const linhas = texto.split(/\r?\n/)
  const entradas = []
  let atual = null
  linhas.forEach((l, i) => {
    const m = RE_ENTRADA.exec(l)
    if (m) {
      atual = { data: m[1], inicio: i, fim: i, substitui: [], tags: [] }
      entradas.push(atual)
    } else if (atual) atual.fim = i
  })
  for (const e of entradas) {
    // linhas em branco no fim pertencem ao espaco entre entradas, nao a entrada
    while (e.fim > e.inicio && !linhas[e.fim].trim()) e.fim--
    const corpo = linhas.slice(e.inicio, e.fim + 1).join('\n')
    e.texto = corpo
    e.substitui = [...corpo.matchAll(/substitui:\s*(\d{4}-\d{2}-\d{2})/gi)].map(m => m[1])
    e.tags = [...corpo.matchAll(/\[([a-z0-9][a-z0-9-]*)\]/gi)].map(m => m[1].toLowerCase())
  }
  return entradas
}

// ---------- arquivar ----------
export function planoArquivo(raiz, hoje) {
  const plano = { diarios: [], decisoes: [], ambiguas: [], recadosVelhos: [] }
  const dDiario = join(raiz, '_memoria', 'diario')
  if (existsSync(dDiario)) {
    for (const f of readdirSync(dDiario).sort()) {
      const m = RE_DATA.exec(f)
      if (!m || !f.endsWith('.md')) continue
      if (diasEntre(m[0], hoje) > 90) plano.diarios.push({ de: `_memoria/diario/${f}`, para: `_memoria/arquivo/${m[1]}/${f}` })
    }
  }
  const arqDec = join(raiz, '_memoria', 'decisoes.md')
  if (existsSync(arqDec)) {
    const entradas = lerDecisoes(readFileSync(arqDec, 'utf8'))
    const substituidas = new Set(entradas.flatMap(e => e.substitui))
    for (const data of [...substituidas].sort()) {
      if (diasEntre(data, hoje) <= 90) continue
      const daData = entradas.filter(e => e.data === data && !e.substitui.includes(data))
      if (daData.length === 1) plano.decisoes.push({ data, para: `_memoria/arquivo/${data.slice(0, 4)}/decisoes-substituidas.md` })
      else if (daData.length > 1) plano.ambiguas.push({ data, quantas: daData.length })
    }
  }
  const dRecados = join(raiz, '_memoria', 'recados')
  if (existsSync(dRecados)) {
    for (const f of readdirSync(dRecados).sort()) {
      const m = RE_DATA.exec(f)
      if (m && diasEntre(m[0], hoje) > 30) plano.recadosVelhos.push(`_memoria/recados/${f}`)
    }
  }
  return plano
}

export function aplicarArquivo(raiz, hoje) {
  const plano = planoArquivo(raiz, hoje)
  const feito = { movidos: [], pulados: [], decisoes: [] }
  for (const { de, para } of plano.diarios) {
    const destino = join(raiz, para)
    if (existsSync(destino)) { feito.pulados.push(de); continue }   // nunca sobrescreve
    mkdirSync(join(destino, '..'), { recursive: true })
    renameSync(join(raiz, de), destino)
    feito.movidos.push(para)
  }
  if (plano.decisoes.length) {
    const arqDec = join(raiz, '_memoria', 'decisoes.md')
    const texto = readFileSync(arqDec, 'utf8')
    const nl = eol(texto)
    const linhas = texto.split(/\r?\n/)
    const entradas = lerDecisoes(texto)
    const tirar = new Set()
    for (const { data, para } of plano.decisoes) {
      const e = entradas.find(x => x.data === data && !x.substitui.includes(data))
      const destino = join(raiz, para)
      mkdirSync(join(destino, '..'), { recursive: true })
      const jaTem = existsSync(destino) && readFileSync(destino, 'utf8').replace(/\r\n/g, '\n').includes(e.texto)
      const cabeca = existsSync(destino) ? '' : `# Decisões substituídas${nl}${nl}Arquivadas pela /faxina: cada uma tem uma entrada mais nova em \`_memoria/decisoes.md\` que diz \`substitui:\` com a data dela.${nl}${nl}`
      // rodada que parou no meio ja tinha copiado: so tira do decisoes.md
      if (!jaTem) appendFileSync(destino, cabeca + linhas.slice(e.inicio, e.fim + 1).join(nl) + nl + nl)
      // tira a entrada e a linha em branco que a separava da seguinte
      let fim = e.fim
      while (fim + 1 < linhas.length && !linhas[fim + 1].trim() && fim + 1 < linhas.length - 1) fim++
      for (let i = e.inicio; i <= fim; i++) tirar.add(i)
      feito.decisoes.push(data)
    }
    writeFileSync(arqDec, linhas.filter((_, i) => !tirar.has(i)).join(nl))
  }
  return feito
}

// ---------- segredos ----------
const PULAR_PASTAS = new Set(['.git', 'node_modules', '.venv', '__pycache__', '.agents', 'chrome-perfil'])
const PADROES = [
  ['chave de API (sk-)', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['token do GitHub', /\b(?:ghp|gho|ghs)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['chave da AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['chave privada', new RegExp('-----BEGIN [A-Z ]*PRIVATE ' + 'KEY-----')],
  // valor de chave parece chave: 16+ caracteres sem ponto (ponto e acesso a campo no codigo), com letra e digito
  ['token ou chave escrita', /\b[a-z0-9_]*(?:key|token|secret)\s*[:=]\s*['"]?([A-Za-z0-9_\-/+=]{16,})/i, v => /\d/.test(v) && /[a-z]/i.test(v)],
  ['senha escrita', /\b(?:password|senha|passwd)\s*[:=]\s*['"]?([^\s'"`,;()[\]{}.]{6,})/i, v => !/^(env|process|args|config|opcoes)$/i.test(v)],
]
const PLACEHOLDER = /xxx|aqui|exemplo|example|placeholder|sua.?chave|seu.?token|sua.?senha/i

export function cpfValido(txt) {
  const d = txt.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

function ehBinario(caminho) {
  const fd = openSync(caminho, 'r')
  try { const b = Buffer.alloc(8000); const n = readSync(fd, b, 0, 8000, 0); return b.subarray(0, n).includes(0) } finally { closeSync(fd) }
}

function* andar(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) { if (!PULAR_PASTAS.has(nome)) yield* andar(p) }
    else yield { p, st }
  }
}

export function varrerSegredos(raiz, ilegiveis = [], pulados = []) {
  const achados = []
  for (const { p, st } of andar(raiz)) {
    const nome = basename(p)
    if (nome.startsWith('.env') || nome.endsWith('.test.mjs')) continue
    if (st.size > 2 * 1024 * 1024) { pulados.push(rel(raiz, p)); continue }
    try {
      if (ehBinario(p)) { pulados.push(rel(raiz, p)); continue }
      readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
        for (const [tipo, re, parece] of PADROES) {
          const m = re.exec(l)
          if (m && !(m[1] && (PLACEHOLDER.test(m[1]) || (parece && !parece(m[1]))))) achados.push({ arquivo: rel(raiz, p), linha: i + 1, tipo })
        }
        for (const m of l.matchAll(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g)) {
          if (cpfValido(m[0])) achados.push({ arquivo: rel(raiz, p), linha: i + 1, tipo: 'CPF' })
        }
      })
    } catch {
      ilegiveis.push(rel(raiz, p))
    }
  }
  return achados
}

// ---------- orfaos ----------
const SEMPRE_CONHECIDOS = new Set(['AGENTS.md', 'CLAUDE.md', 'tarefas.md', '.gitkeep', 'robos', 'bem-vindo.html'])

function extrairSecoes(texto) {
  const secoes = new Set(['## Mapa', '## Tabela de destinos', '## Estrutura de pastas'])
  const linhas = texto.split(/\r?\n/)
  let resultado = ''
  let emSecao = false
  let achouSecao = false
  for (const l of linhas) {
    const trimmed = l.trim()
    if (secoes.has(trimmed)) {
      achouSecao = true
      emSecao = true
      resultado += l + '\n'
    } else if (emSecao && trimmed.startsWith('## ')) {
      emSecao = false
    } else if (emSecao) {
      resultado += l + '\n'
    }
  }
  return achouSecao ? resultado : texto
}

// texto dos SKILL.md das skills instaladas (menos o da propria faxina, que cita caminho de exemplo):
// contexto e pasta de trabalho que uma skill de pacote cita entre crases sao conhecidos, nunca orfaos.
// Script, exemplo e comentario de codigo ficam de fora: citariam pasta que nao e do aluno.
function textoDasSkills(raiz) {
  const d = join(raiz, '.claude', 'skills')
  if (!existsSync(d)) return ''
  let texto = ''
  for (const nome of readdirSync(d)) {
    if (nome === 'faxina') continue
    const p = join(d, nome, 'SKILL.md')
    try { if (existsSync(p)) texto += readFileSync(p, 'utf8') + '\n' } catch {}
  }
  return texto
}

export function orfaos(raiz) {
  const agents = join(raiz, 'AGENTS.md')
  if (!existsSync(agents)) return []
  const texto = readFileSync(agents, 'utf8')
  const textoBuscado = extrairSecoes(texto)
  const skills = textoDasSkills(raiz)
  // a crase logo antes do caminho impede que `videos/` tire `meus-videos/` da lista
  const citadoPorSkill = caminho => skills.includes('`' + caminho)
  const citado = (nome, caminho = nome) => textoBuscado.includes(nome) || citadoPorSkill(caminho)
  const fora = []
  for (const nome of readdirSync(raiz)) {
    if (nome.startsWith('.') || SEMPRE_CONHECIDOS.has(nome)) continue
    try {
      const dir = statSync(join(raiz, nome)).isDirectory()
      if (!citado(dir ? `${nome}/` : nome)) fora.push(dir ? `${nome}/` : nome)
    } catch {
      // ignora arquivos ilegíveis
    }
  }
  for (const pasta of ['_contexto', '_memoria']) {
    const d = join(raiz, pasta)
    if (!existsSync(d)) continue
    for (const nome of readdirSync(d)) {
      if (SEMPRE_CONHECIDOS.has(nome)) continue
      try {
        if (statSync(join(d, nome)).isDirectory()) continue
        if (!citado(nome, `${pasta}/${nome}`)) fora.push(`${pasta}/${nome}`)
      } catch {
        // ignora arquivos ilegíveis
      }
    }
  }
  return fora.sort()
}

// ---------- automacoes ----------
function lerTabela(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim().startsWith('|'))
  if (linhas.length < 2) return []
  const cel = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/`/g, ''))
  const cab = cel(linhas[0]).map(c => c.toLowerCase())
  const iNome = cab.findIndex(c => /nome|rotina/.test(c))
  const iOrigem = cab.findIndex(c => /origem/.test(c))
  return linhas.slice(1).filter(l => !/^\|\s*:?-{2,}/.test(l.trim())).map(cel)
    .map(c => ({ nome: (c[iNome < 0 ? 0 : iNome] || '').toLowerCase(), origem: iOrigem < 0 ? '' : (c[iOrigem] || '').toLowerCase() }))
    .filter(r => r.nome)
}

export function automacoes(raiz, hoje) {
  const arq = join(raiz, '_contexto', 'automacoes.md')
  const registradas = existsSync(arq) ? lerTabela(readFileSync(arq, 'utf8')) : []
  const recente = data => diasEntre(data, hoje) <= 30
  const origens = new Set()
  const robos = new Set()
  const dDiario = join(raiz, '_memoria', 'diario')
  if (existsSync(dDiario)) for (const f of readdirSync(dDiario)) {
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(f)
    if (m && recente(m[1])) origens.add(m[2].toLowerCase())
  }
  const livro = join(raiz, 'robos', 'execucoes.jsonl')
  if (existsSync(livro)) for (const l of readFileSync(livro, 'utf8').split(/\r?\n/)) {
    try { const j = JSON.parse(l); if (j.robo && j.inicio && recente(dataLocal(new Date(j.inicio)))) robos.add(String(j.robo).toLowerCase()) } catch {}
  }
  const minha = existsSync(join(raiz, '.origem')) ? readFileSync(join(raiz, '.origem'), 'utf8').trim().toLowerCase() : 'dono'
  const nomes = new Set(registradas.map(r => r.nome))
  const origensReg = new Set(registradas.map(r => r.origem).filter(Boolean))
  const diario = new Set(origens)
  // computadores da equipe: | Equipe e máquinas | dono (este computador), notebook | ... | no ferramentas.md
  const maquinas = new Set()
  const arqFerr = join(raiz, '_contexto', 'ferramentas.md')
  if (existsSync(arqFerr)) for (const l of readFileSync(arqFerr, 'utf8').split(/\r?\n/)) {
    const c = l.split('|').map(x => x.trim())
    if (c.length > 2 && /^equipe e m[aá]quinas$/i.test(c[1])) {
      for (const n of c[2].replace(/\([^)]*\)/g, '').split(',')) if (n.trim()) maquinas.add(n.trim().toLowerCase())
    }
  }
  const daCasa = o => o === 'dono' || o === minha || maquinas.has(o)
  // recado AAAA-MM-DD-<origem>-<resto>.md: a origem tem hifen (robo-estoque), entao vale a mais longa que casar
  const conhecidas = [...new Set([...origensReg, 'dono', minha, ...maquinas])].sort((a, b) => b.length - a.length)
  const recadosSemRegistro = []
  const dRecados = join(raiz, '_memoria', 'recados')
  if (existsSync(dRecados)) for (const f of readdirSync(dRecados).sort()) {
    const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(f)
    if (!m || !recente(m[1])) continue
    const resto = m[2].toLowerCase()
    const o = conhecidas.find(o => resto === o || resto.startsWith(o + '-'))
    if (o) origens.add(o)
    else recadosSemRegistro.push(f)
  }
  return {
    registradas: registradas.length,
    semSinal: registradas.filter(r => !robos.has(r.nome) && !(r.origem && origens.has(r.origem))).map(r => r.nome),
    robosSemRegistro: [...robos].filter(n => !nomes.has(n)).sort(),
    origensSemRegistro: [...diario].filter(o => !daCasa(o) && !origensReg.has(o)).sort(),
    recadosSemRegistro,
  }
}

// ---------- backup ----------
const BLOQUEIO_DE_PROPOSITO = [
  /(^|\/)\.env(?!\.example$)[^/]*$/, /^\.origem$/, /^\.backup-falhou$/, /^\.claude\/settings\.local\.json$/,
  /(^|\/)(node_modules|__pycache__|\.venv|dist|build|\.agents)\//, /^dados\/chrome-perfil\//,
  /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)desktop\.ini$/, /(^|\/)\~\$[^/]*$/,
  // copia de seguranca do atualizador e recado de envio parado: valem so neste computador
  /^\.sabinos\//, /^_memoria\/recados\/[^/]*-auto-sync-parado\.md$/,
]

export function foraDoBackup(raiz) {
  let saida
  let topo
  try {
    topo = execFileSync('git', ['-C', raiz, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { return { semGit: true, arquivos: [], pastas: [] } }
  try {
    const canon = p => realpathSync.native(p).split(sep).join('/').toLowerCase()
    if (canon(topo) !== canon(raiz)) return { semGit: true, arquivos: [], pastas: [] }
  } catch { return { semGit: true, arquivos: [], pastas: [] } }
  try {
    // matching: pasta ignorada aparece com o proprio nome, nunca dobrada na mae (clientes/acme/, nao clientes/)
    saida = execFileSync('git', ['-C', raiz, 'status', '--ignored=matching', '--porcelain=v1', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch { return { semGit: true, arquivos: [], pastas: [] } }
  // pasta com .git proprio (compartilhada pela /compartilhar) tem backup no repositorio dela
  const repoProprio = p => p.endsWith('/') && existsSync(join(raiz, p, '.git'))
  const arquivos = saida.split('\0').filter(l => l.startsWith('!! ')).map(l => l.slice(3))
    .filter(p => !p.startsWith('.claude/') && !BLOQUEIO_DE_PROPOSITO.some(re => re.test(p)) && !repoProprio(p))
  // pasta de primeiro nivel com mais de 3 itens vira uma linha com a contagem (300 fotos nao viram 300 linhas)
  const porPasta = new Map()
  for (const p of arquivos) {
    const i = p.indexOf('/')
    if (i === -1) continue
    const pasta = p.slice(0, i + 1)
    porPasta.set(pasta, (porPasta.get(pasta) || 0) + 1)
  }
  const grandes = new Set([...porPasta].filter(([, n]) => n > 3).map(([pasta]) => pasta))
  const pastas = [...grandes].sort().map(pasta => ({ pasta, arquivos: porPasta.get(pasta) }))
  const soltos = arquivos.filter(p => { const i = p.indexOf('/'); return i === -1 || !grandes.has(p.slice(0, i + 1)) })
  return { semGit: false, arquivos: soltos.sort(), pastas }
}

// ---------- memoria do agente ----------
export function memoriaDoAgente(raiz, home = homedir()) {
  const base = join(home, '.claude', 'projects')
  if (!existsSync(base)) return null
  const alvo = raiz.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
  const pasta = readdirSync(base).find(n => n.toLowerCase() === alvo)
  if (!pasta) return null
  const dMem = join(base, pasta, 'memory')
  if (!existsSync(dMem)) return null
  const arquivos = readdirSync(dMem).filter(f => f.endsWith('.md') && f !== 'MEMORY.md').sort()
  return arquivos.length ? { pasta: dMem, arquivos } : null
}

// ---------- o diario rende? frescor, ferramenta sem registro ----------
// O diario rende: nos ultimos 30 dias, 10 entradas ou mais e mais de 10 entradas por mudanca
// destilada (commit em _contexto/*.md, _memoria/decisoes.md ou andamento.md) viram aviso de /atualizar.
const RENDE_JANELA = 30
const RENDE_MIN_ENTRADAS = 10
const RENDE_ENTRADAS_POR_MUDANCA = 10
// Frescor: regra ou contexto sem commit ha mais de 60 dias enquanto o diario teve entrada nos ultimos 14.
const FRESCOR_PARADO = 60
const FRESCOR_DIARIO_VIVO = 14
const FRESCOR_ARQUIVOS = ['AGENTS.md', '_contexto/empresa.md', '_contexto/estrategia.md', '_contexto/preferencias.md']
const RE_LINHA_DIARIO = /^\s*-\s+\d{1,2}:\d{2},/

const git = (raiz, args) => execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

// so conta o git que e do proprio projeto, nunca o de uma pasta mae
function gitDaRaiz(raiz) {
  try {
    const canon = p => realpathSync.native(p).split(sep).join('/').toLowerCase()
    return canon(git(raiz, ['rev-parse', '--show-toplevel']).trim()) === canon(raiz)
  } catch { return false }
}

// data de cada entrada do diario (linha "- HH:MM, ..."), pela data do nome do arquivo
function entradasDoDiario(raiz) {
  const d = join(raiz, '_memoria', 'diario')
  if (!existsSync(d)) return []
  const datas = []
  for (const f of readdirSync(d)) {
    const m = RE_DATA.exec(f)
    if (!m || !f.endsWith('.md')) continue
    try { for (const l of readFileSync(join(d, f), 'utf8').split(/\r?\n/)) if (RE_LINHA_DIARIO.test(l)) datas.push(m[0]) } catch {}
  }
  return datas
}

const naJanela = (data, hoje, dias) => { const n = diasEntre(data, hoje); return n >= 0 && n <= dias }

export function diarioRende(raiz, hoje) {
  if (!gitDaRaiz(raiz)) return { semGit: true }
  // repositorio sem nenhum commit: o log falharia calado e toda entrada pareceria sem destilado
  try { git(raiz, ['rev-parse', '--verify', '-q', 'HEAD']) } catch { return { semGit: true } }
  const entradas = entradasDoDiario(raiz).filter(d => naJanela(d, hoje, RENDE_JANELA)).length
  let log = ''
  try { log = git(raiz, ['log', '--format=%cd', '--date=short', '--', ':(glob)_contexto/*.md', '_memoria/decisoes.md', ':(glob)**/andamento.md']) } catch {}
  const mudancas = log.split(/\r?\n/).filter(d => RE_DATA.test(d) && naJanela(d, hoje, RENDE_JANELA)).length
  return { semGit: false, entradas, mudancas, alerta: entradas >= RENDE_MIN_ENTRADAS && entradas > RENDE_ENTRADAS_POR_MUDANCA * mudancas }
}

export function frescor(raiz, hoje) {
  if (!gitDaRaiz(raiz)) return { semGit: true, parados: [] }
  const parados = []
  if (entradasDoDiario(raiz).some(d => naJanela(d, hoje, FRESCOR_DIARIO_VIVO))) for (const arq of FRESCOR_ARQUIVOS) {
    if (!existsSync(join(raiz, arq))) continue
    let ultimo = ''
    try { ultimo = git(raiz, ['log', '-1', '--format=%cd', '--date=short', '--', arq]).trim() } catch {}
    if (RE_DATA.test(ultimo) && diasEntre(ultimo, hoje) > FRESCOR_PARADO) parados.push({ arquivo: arq, dias: diasEntre(ultimo, hoje) })
  }
  return { semGit: false, parados }
}

// servidor do .mcp.json e variavel do .env que o ferramentas.md nao cita. Do .env sai so o NOME:
// o valor nunca entra no relatorio.
export function ferramentasSemRegistro(raiz) {
  let texto
  try { texto = readFileSync(join(raiz, '_contexto', 'ferramentas.md'), 'utf8').toLowerCase() } catch { return { mcp: [], env: [] } }
  const tem = n => texto.includes(n.toLowerCase())
  let mcp = []
  try { mcp = Object.keys(JSON.parse(readFileSync(join(raiz, '.mcp.json'), 'utf8').replace(/^﻿/, '')).mcpServers || {}) } catch {}
  let env = []
  try { env = nomesDoEnv(readFileSync(join(raiz, '.env'), 'utf8')) } catch {}
  // prefixo vale como palavra inteira e com 3 letras ou mais: "ig" casaria com "liga"
  const temPrefixo = n => {
    const p = n.split('_')[0].toLowerCase()
    return p.length >= 3 && new RegExp('(^|[^a-z0-9])' + p + '([^a-z0-9]|$)').test(texto)
  }
  return {
    mcp: [...new Set(mcp)].filter(n => !tem(n)).sort(),
    env: [...new Set(env)].filter(n => !tem(n) && !temPrefixo(n)).sort(),
  }
}

// Nome de variavel em MAIUSCULA no comeco da linha. Valor entre aspas que continua nas linhas
// seguintes (chave privada PEM) e pulado ate fechar: a ultima linha dele termina em "=" e
// viraria "nome", com pedaco da chave dentro.
export function nomesDoEnv(txt) {
  const nomes = []
  let aberta = ''
  for (const l of txt.split(/\r?\n/)) {
    if (aberta) { if (l.includes(aberta)) aberta = ''; continue }
    const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(["']?)(.*)$/.exec(l)
    if (!m) continue
    nomes.push(m[1])
    if (m[2] && !m[3].includes(m[2])) aberta = m[2]
  }
  return nomes
}

export function relatorio(raiz, hoje = dataLocal(), home) {
  const dDiario = join(raiz, '_memoria', 'diario')
  const ultimos = existsSync(dDiario) ? readdirSync(dDiario).filter(f => RE_DATA.test(f)).sort().slice(-3).map(f => `_memoria/diario/${f}`) : []
  const ilegiveis = []
  return {
    hoje,
    arquivar: planoArquivo(raiz, hoje),
    segredos: varrerSegredos(raiz, ilegiveis),
    orfaos: orfaos(raiz),
    automacoes: automacoes(raiz, hoje),
    backup: foraDoBackup(raiz),
    memoriaDoAgente: memoriaDoAgente(raiz, home),
    diarioRende: diarioRende(raiz, hoje),
    frescor: frescor(raiz, hoje),
    ferramentasSemRegistro: ferramentasSemRegistro(raiz),
    ilegiveis,
    ultimosDiarios: ultimos,
  }
}

if (process.argv[1]) {
  let estouNoScript = false
  try {
    estouNoScript = realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
  } catch {
    estouNoScript = false
  }
  if (estouNoScript) {
    const args = process.argv.slice(2)
    const iHoje = args.indexOf('--hoje')
    let hoje = iHoje >= 0 ? args[iHoje + 1] : dataLocal()
    if (iHoje >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(hoje)) {
      console.error('--hoje deve estar no formato AAAA-MM-DD')
      process.exitCode = 2
      process.exit(2)
    }
    const raiz = process.cwd()
    if (args[0] === 'arquivar') {
      if (!args.includes('--sim')) { console.error('arquivar so roda com --sim, depois do sim da pessoa'); process.exitCode = 2 }
      else console.log(JSON.stringify(aplicarArquivo(raiz, hoje), null, 1))
    } else console.log(JSON.stringify(relatorio(raiz, hoje), null, 1))
  }
}
