// Aviso de sessao sem fechar (5.54, C1): no comeco da conversa, diz quais dias do diario
// tiveram trabalho que o /atualizar nao fechou. Node puro: sem git, rede, .env ou transcript.
// SessionStart startup, resume ou fork: ate 3 linhas com os dias e a oferta de fechar ou dispensar.
// SessionStart compact ou clear: uma linha de que o /atualizar parte do disco.
// PreCompact: instrucao pro resumo guardar os dias sem fechar. Sai 0 sempre (2 barra a
// compactacao) e nao imprime nada no erro.
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MARCA = 'sessão fechada pelo /atualizar'
// vai na linha que a /atualizar-sabinos grava no diario; linha com ele nao conta como trabalho
export const ROTULO_ATUALIZACAO = '[atualização do SabinOS]'
export const MAX_DIARIOS = 31
export const TETO_PRECOMPACT = 600

// linha do diario que comeca pelo /atualizar ("- HH:MM, /atualizar: ..."); mencao solta no meio
// ("falta rodar /atualizar") nao fecha, e /atualizar-sabinos e /atualizar-kit nao contam
const RE_ATUALIZAR = /^- \d{1,2}:\d{2}, \/atualizar(?:$|[\s:,])/
const RE_DIA = /^(\d{4}-\d{2}-\d{2})(?:-([a-z0-9-]+))?\.md$/

export function diaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function somarDias(dia, n) {
  const [a, m, d] = dia.split('-').map(Number)
  return diaLocal(new Date(a, m - 1, d + n))
}

// a mesma regra do lerOrigem do auto-sync: uma palavra, sem acento; sem arquivo, "dono"
export function lerOrigem(dir) {
  let bruto = ''
  try { bruto = readFileSync(join(dir, '.origem'), 'utf8') } catch { return 'dono' }
  const palavra = bruto.trim().split(/\s+/)[0] || ''
  const limpa = palavra.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  return limpa || 'dono'
}

// JSON tirando o BOM que o Bloco de Notas antigo e o PowerShell 5 gravam no comeco
function lerJson(caminho) {
  const t = readFileSync(caminho, 'utf8')
  return JSON.parse(t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t)
}

function lerCorte(dir) {
  try {
    const v = lerJson(join(dir, '.sabinos', 'instalado.json')).avisoFechamentoDesde
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  } catch { return null }
}

// 5.56 (G): o programa pela mesma regra do conectar/scripts/lib/programa.mjs, e o teste prova que
// as duas concordam. Copiada de proposito: import quebrado aqui viraria erro em toda conversa nova
export function programaDoHook(env = process.env) {
  const e = String(env.CLAUDE_CODE_ENTRYPOINT ?? '')
  return e === 'claude-vscode' ? 'vscode' : e.startsWith('claude-desktop') ? 'app' : 'desconhecido'
}

const prazo = n => (Number.isInteger(n) && n > 0 ? n : null)

// dias ate a primeira conversa do projeto poder sair deste computador. A conversa do VS Code sai pelo
// cleanupPeriodDays (padrao 30) e a do app so depois dos dois prazos, e o diario nao diz de qual
// programa veio a conversa que ficou sem fechar: vale o prazo mais curto que pode valer pra alguma,
// o cleanupPeriodDays, nos dois programas (final do Codex da 5.56: o maior dos dois dava margem
// falsa pra conversa velha do VS Code aberta de novo no app). No app sem a chave do app (0, guarda
// pra sempre) a frase fica fora, e o furo fica nomeado: quem usa os dois programas no mesmo projeto
// com a chave padrao fica sem a data. Desconhecido: so a chave do app, como antes da 5.56. O
// cleanupPeriodDays vale em qualquer settings e o mais perto ganha (local, projeto, usuario); a
// chave do app so no usuario
export function lerDiasDeGuarda(prog = programaDoHook(), dir = '') {
  const ler = c => { try { return lerJson(c) || {} } catch { return {} } }
  const usuario = ler(join(homedir(), '.claude', 'settings.json'))
  const camadas = dir ? [ler(join(dir, '.claude', 'settings.local.json')), ler(join(dir, '.claude', 'settings.json')), usuario] : [usuario]
  const geral = camadas.map(s => prazo(s.cleanupPeriodDays)).find(Boolean) ?? 30
  const app = prazo(usuario.desktopSessionCleanupPeriodDays)
  if (prog === 'vscode') return geral
  if (prog === 'app') return app ? geral : null
  return app
}

// linhas que contam no dia: sem o titulo, sem linha vazia e sem a linha rotulada da atualizacao
function linhasDoDia(texto) {
  return texto.split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.includes(ROTULO_ATUALIZACAO))
}

const fecha = linha => linha.includes(MARCA) || RE_ATUALIZAR.test(linha) || linha.includes('/atualizar rodado')

// dias sem fechar, do mais antigo pro mais recente. Cada dia se julga sozinho: o /atualizar fecha
// so os dias da conversa dele, entao dia fechado nao diz nada do dia de antes. Sem corte (setup
// parado antes do registro) nao da pra saber onde o kit comecou, e o hook fica quieto.
export function diasSemFechar(dir, hoje = diaLocal()) {
  const origem = lerOrigem(dir)
  const corte = lerCorte(dir)
  if (!corte) return []
  const pasta = join(dir, '_memoria', 'diario')
  let nomes = []
  try { nomes = readdirSync(pasta) } catch { return [] }
  const dias = nomes.map(n => RE_DIA.exec(n)).filter(Boolean)
    .filter(m => (m[2] || 'dono') === origem)
    .map(m => ({ dia: m[1], arquivo: m[0] }))
    .filter(d => d.dia < hoje && d.dia >= corte)
    .sort((a, b) => (a.dia < b.dia ? 1 : -1))
    .slice(0, MAX_DIARIOS)
  const sem = []
  for (const d of dias) {
    let linhas
    try { linhas = linhasDoDia(readFileSync(join(pasta, d.arquivo), 'utf8')) } catch { continue }
    if (linhas.length && !fecha(linhas[linhas.length - 1])) sem.push(d.dia)
  }
  return sem.reverse()
}

function juntar(dias) {
  return dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}`
}

export function textoDoAviso(dias, diasDeGuarda) {
  if (!dias.length) return ''
  const linhas = [`Ficou sem fechar: o diário tem trabalho sem a marca do /atualizar em ${juntar(dias)}.`]
  if (diasDeGuarda) linhas.push(`Essas conversas saem deste computador a partir de cerca de ${somarDias(dias[0], diasDeGuarda)}.`)
  linhas.push(`Na primeira resposta, ofereça ao usuário: fechar agora (\`/atualizar\`) ou dispensar; dispensar grava a linha \`- HH:MM, ${MARCA} (dispensada)\` no fim do diário de cada um desses dias.`)
  return linhas.join('\n') + '\n'
}

export const TEXTO_RESUMO = 'Esta conversa virou resumo ou foi limpa: na hora de fechar, o /atualizar relê do disco o diário, o agora.md e o git antes de gravar.\n'

export function textoPreCompact(dias) {
  let t = `No resumo, guarde quais dias do diário ainda não têm a linha "${MARCA}" e lembre que o /atualizar relê do disco o diário, o agora.md e o git antes de gravar.`
  if (dias.length) t += ` Dias sem fechar: ${juntar(dias)}.`
  return t.length > TETO_PRECOMPACT ? t.slice(0, TETO_PRECOMPACT - 3) + '...' : t
}

export function responder(entrada, env = process.env) {
  const dir = env.CLAUDE_PROJECT_DIR || entrada.cwd
  if (!dir) return ''
  if (entrada.hook_event_name === 'PreCompact') return textoPreCompact(diasSemFechar(dir)) + '\n'
  if (entrada.hook_event_name !== 'SessionStart') return ''
  if (['compact', 'clear'].includes(entrada.source)) return TEXTO_RESUMO
  if (['startup', 'resume', 'fork'].includes(entrada.source)) return textoDoAviso(diasSemFechar(dir), lerDiasDeGuarda(programaDoHook(env), dir))
  return ''
}

function chamadoDireto() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (chamadoDireto()) {
  try {
    const entrada = JSON.parse(readFileSync(0, 'utf8'))
    const saida = entrada && typeof entrada === 'object' ? responder(entrada) : ''
    if (saida) process.stdout.write(saida)
  } catch { /* calado: o aviso nunca atrapalha o comeco da conversa nem a compactacao */ }
  process.exitCode = 0
}
