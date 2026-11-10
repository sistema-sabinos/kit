#!/usr/bin/env node
// Liga, desliga e lista os servidores MCP do kit neste projeto (5.54, B1). Grava a definicao no .mcp.json
// da raiz do projeto e a aprovacao (o nome em enabledMcpjsonServers) no ~/.claude/settings.json do usuario,
// que vale tambem em pasta ainda nao confiada. Preserva o que ja existe nos dois arquivos e nunca grava
// valor de chave. Lista fechada: so servidor que nao pede segredo. O ~/.claude.json so se le: o escopo
// local e o do usuario de la vencem o .mcp.json pelo nome, e o script avisa quando o mesmo nome esta la.
// Uso, da raiz do projeto:
//   node .claude/skills/conectar/scripts/ligar-mcp.mjs ligar <nome>
//   node .claude/skills/conectar/scripts/ligar-mcp.mjs desligar <nome>
//   node .claude/skills/conectar/scripts/ligar-mcp.mjs listar
// Saida: 0 feito, 1 nome fora da lista ou uso errado, 2 arquivo JSON quebrado (nada gravado).
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'
import { portaDoProjeto } from './lib/navegador.mjs'

// a versao do Playwright MCP e a sondada na bancada (Gate 16): cada linha com o pacote diz qual navegador usa
export const SERVIDORES = {
  playwright: () => ['@playwright/mcp@0.0.83', '--isolated', '--output-dir', 'dados/navegador-saida', '--no-webmcp'],
  navegador: raiz => ['@playwright/mcp@0.0.83', '--cdp-endpoint', `http://127.0.0.1:${portaDoProjeto(raiz)}`, '--output-dir', 'dados/navegador-saida', '--no-webmcp'],
  context7: () => ['-y', '@upstash/context7-mcp'],
}

export const definicao = (nome, raiz) => ({ type: 'stdio', command: 'npx', args: SERVIDORES[nome](raiz) })

class Quebrado extends Error {}

// o Bloco de Notas antigo e o PowerShell 5 gravam o BOM no comeco: JSON valido, so sem ele
const semBom = s => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s

function lerJson(arq) {
  if (!existsSync(arq)) return {}
  let j
  try { j = JSON.parse(semBom(readFileSync(arq, 'utf8'))) } catch { throw new Quebrado(arq) }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Quebrado(arq)
  return j
}

// arquivo que ja existia mantem o final de linha dele (CRLF ou LF); arquivo novo nasce em LF
function gravarJson(arq, j) {
  mkdirSync(join(arq, '..'), { recursive: true })
  const fim = existsSync(arq) && readFileSync(arq, 'utf8').includes('\r\n') ? '\r\n' : '\n'
  writeFileSync(arq, JSON.stringify(j, null, 2).split('\n').join(fim) + fim)
}

const barras = s => s.split(String.fromCharCode(92)).join('/')
function mesmaPasta(a, b) {
  const norm = p => { let r = p; try { r = realpathSync.native(p) } catch {} r = barras(r).replace(/\/+$/, ''); return process.platform === 'win32' ? r.toLowerCase() : r }
  return norm(a) === norm(b)
}

// nomes do ~/.claude.json, so lendo: local (deste projeto, em projects) e usuario (mcpServers de topo, vale em
// todo projeto); os dois vencem o .mcp.json pelo nome. Arquivo ausente ou ilegivel nao tem nada
function noClaudeJson(raiz, home) {
  let j
  try { j = JSON.parse(semBom(readFileSync(join(home, '.claude.json'), 'utf8'))) } catch { return { local: [], usuario: [] } }
  const local = []
  for (const [pasta, p] of Object.entries(j?.projects || {}))
    if (mesmaPasta(pasta, raiz) && p?.mcpServers && typeof p.mcpServers === 'object') local.push(...Object.keys(p.mcpServers))
  const usuario = j?.mcpServers && typeof j.mcpServers === 'object' ? Object.keys(j.mcpServers) : []
  return { local, usuario }
}

const avisoLocal = nome => `aviso: o ${nome} tambem esta no escopo local deste projeto (no .claude.json da pasta do usuario), que vence o .mcp.json pelo nome. Com o sim da pessoa, tirar a definicao velha de la (passo na entrada mcp-pelo-script do _ferramentas/mudancas.md da pasta-mae); sem isso, segue valendo a velha.`
const avisoUsuario = nome => `aviso: o ${nome} tambem esta no escopo do usuario (no .claude.json da pasta do usuario, vale em todo projeto), que vence o .mcp.json pelo nome. Com o sim da pessoa, tirar a definicao velha de la (passo na entrada mcp-pelo-script do _ferramentas/mudancas.md da pasta-mae); sem isso, segue valendo a velha.`
const avisoSegue = (nome, onde, tinha) => `aviso: o ${nome} ${tinha ? 'saiu do .mcp.json' : 'nao esta no .mcp.json deste projeto'}, mas segue carregando pela definicao ${onde.map(o => o === 'local' ? 'do escopo local' : 'do escopo do usuario').join(' e ')} (no .claude.json da pasta do usuario). Pra parar de vez, com o sim da pessoa, tirar a definicao de la (passo na entrada mcp-pelo-script do _ferramentas/mudancas.md da pasta-mae, sem religar depois).`

// disabledMcpjsonServers em qualquer settings recusa o servidor do .mcp.json, mesmo aprovado: devolve os
// arquivos que recusam o nome, so lendo (o settings de gestao da empresa fica de fora)
function recusadoEm(nome, raiz, home) {
  const arqs = [join(home, '.claude', 'settings.json'), join(raiz, '.claude', 'settings.json'), join(raiz, '.claude', 'settings.local.json')]
  return arqs.filter(arq => { const d = lerJson(arq).disabledMcpjsonServers; return Array.isArray(d) && d.includes(nome) })
}

const avisoRecusado = (nome, arqs) => `aviso: o ${nome} esta recusado no disabledMcpjsonServers de ${arqs.join(' e ')}; o Claude Code nao sobe servidor recusado, mesmo aprovado. Com o sim da pessoa, tirar o nome dessa lista; sem isso, ele fica parado.`

export function ligar(nome, { raiz = RAIZ, home = homedir() } = {}) {
  const arqMcp = join(raiz, '.mcp.json'), arqSettings = join(home, '.claude', 'settings.json')
  const mcp = lerJson(arqMcp), settings = lerJson(arqSettings)
  mcp.mcpServers = { ...(mcp.mcpServers || {}), [nome]: definicao(nome, raiz) }
  const aprovados = Array.isArray(settings.enabledMcpjsonServers) ? settings.enabledMcpjsonServers : []
  settings.enabledMcpjsonServers = aprovados.includes(nome) ? aprovados : [...aprovados, nome]
  const recusado = recusadoEm(nome, raiz, home)
  gravarJson(arqMcp, mcp)
  gravarJson(arqSettings, settings)
  const { local, usuario } = noClaudeJson(raiz, home)
  return { arqMcp, arqSettings, local: local.includes(nome), usuario: usuario.includes(nome), recusado }
}

// tira so do .mcp.json: a aprovacao do usuario vale pra todo projeto, e sem a definicao ela nao sobe nada;
// a definicao do escopo local ou do usuario do mesmo nome segue carregando, e volta em `segue`
export function desligar(nome, { raiz = RAIZ, home = homedir() } = {}) {
  const arqMcp = join(raiz, '.mcp.json')
  const mcp = lerJson(arqMcp)
  const { local, usuario } = noClaudeJson(raiz, home)
  const segue = [...(local.includes(nome) ? ['local'] : []), ...(usuario.includes(nome) ? ['usuario'] : [])]
  if (!mcp.mcpServers?.[nome]) return { arqMcp, tinha: false, segue }
  delete mcp.mcpServers[nome]
  gravarJson(arqMcp, mcp)
  return { arqMcp, tinha: true, segue }
}

export function listar({ raiz = RAIZ, home = homedir() } = {}) {
  const mcp = lerJson(join(raiz, '.mcp.json')), settings = lerJson(join(home, '.claude', 'settings.json'))
  const aprovados = Array.isArray(settings.enabledMcpjsonServers) ? settings.enabledMcpjsonServers : []
  const { local, usuario } = noClaudeJson(raiz, home), doKit = n => Object.hasOwn(SERVIDORES, n)
  return { ligados: Object.keys(mcp.mcpServers || {}).map(n => ({ nome: n, aprovado: aprovados.includes(n), recusado: recusadoEm(n, raiz, home) })), local: local.filter(doKit), usuario: usuario.filter(doKit) }
}

function direto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (direto()) {
  const [comando, nome] = process.argv.slice(2)
  const lista = Object.keys(SERVIDORES).join(', ')
  try {
    if (comando === 'listar') {
      const { ligados, local, usuario } = listar()
      console.log(ligados.length ? ligados.map(l => `${l.nome}: ligado${l.recusado.length ? ', recusado' : l.aprovado ? ', aprovado' : ', sem aprovacao'}`).join('\n') : 'nenhum servidor ligado neste projeto')
      console.log(`servidores do kit: ${lista}`)
      for (const l of ligados) if (l.recusado.length) console.log(avisoRecusado(l.nome, l.recusado))
      for (const n of local) console.log(avisoLocal(n))
      for (const n of usuario) console.log(avisoUsuario(n))
    } else if ((comando === 'ligar' || comando === 'desligar') && nome && Object.hasOwn(SERVIDORES, nome)) {
      if (comando === 'ligar') {
        const r = ligar(nome)
        console.log(`ligado: ${nome}`)
        console.log(`projeto: ${r.arqMcp}`)
        console.log(`aprovacao no settings.json do usuario: ${r.arqSettings}`)
        console.log('o servidor sobe numa sessao nova: sai de vez do app do Claude (Windows: icone perto do relogio, botao direito, Sair; Mac: Cmd+Q) e abre de novo, depois de esperar terminar o que roda nas outras conversas; Gerenciador de Tarefas so se o Sair nao fechar')
        if (r.recusado.length) console.log(avisoRecusado(nome, r.recusado))
        if (r.local) console.log(avisoLocal(nome))
        if (r.usuario) console.log(avisoUsuario(nome))
      } else {
        const r = desligar(nome)
        if (r.tinha) console.log(`desligado: ${nome} (${r.arqMcp})`)
        else if (!r.segue.length) console.log(`${nome} nao estava ligado neste projeto`)
        if (r.segue.length) console.log(avisoSegue(nome, r.segue, r.tinha))
      }
    } else {
      console.error(`uso: ligar-mcp.mjs ligar|desligar <nome>, ou listar. Servidores do kit: ${lista}. Servidor que pede chave (notion, n8n) ainda nao liga por aqui.`)
      process.exit(1)
    }
  } catch (e) {
    if (!(e instanceof Quebrado)) throw e
    console.error(`o arquivo ${e.message} nao e um JSON valido; nada foi gravado. Conserte o arquivo (ou peca ajuda) e rode de novo.`)
    process.exit(2)
  }
}
