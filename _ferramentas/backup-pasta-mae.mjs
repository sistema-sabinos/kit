#!/usr/bin/env node
// Backup automatico da pasta-mae no GitHub ao fim de cada resposta (hook Stop da pasta-mae).
// Sobe a pasta-mae e, depois, cada projeto dela pelo mesmo autoSync do _modelo: quem trabalha
// pela pasta-mae (o /atualizar-kit, o /novo-projeto) deixa o projeto sujo, e o Stop do projeto
// so roda com o projeto aberto (5.54, achado 25). Projeto e subpasta direta com _contexto/ e .git
// proprio; _modelo/ e _kit-anterior-* ficam fora pelo nome. Projeto ao lado da pasta-mae fica
// fora de proposito: sobe quando ele mesmo esta aberto. Sai sempre 0 e nao imprime nada.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoSync } from '../_modelo/.claude/hooks/auto-sync.mjs'

// No Mac sem as ferramentas da Apple, qualquer git abre a janela de instalacao a cada resposta:
// so segue quando o xcode-select responde e a pasta dele tem o usr/bin/git. Plataforma e chamada
// entram por parametro pro teste, que roda no Windows.
function xcodeSelectReal() {
  const r = spawnSync('xcode-select', ['-p'], { encoding: 'utf8', timeout: 10000, windowsHide: true })
  return r.status === 0 ? (r.stdout || '').trim() : ''
}
export function guardaMac({ plataforma = process.platform, xcodeSelect = xcodeSelectReal, existe = existsSync } = {}) {
  if (plataforma !== 'darwin') return true
  const dev = xcodeSelect()
  return !!dev && existe(join(dev, 'usr', 'bin', 'git'))
}

const FORA_PELO_NOME = /^(?:_modelo|_kit-anterior-.*)$/
// quem recusou o auto-sync no /setup ganha o settings.json sem o Stop e faz backup so pelo
// /syncar: o projeto so sobe daqui se o Stop dele chama o auto-sync.mjs. Settings ausente ou
// JSON quebrado contam como recusa (5.54, A, achado da comum)
// disableAllHooks no settings ou no settings.local do projeto desliga o Stop dele; a pasta-mae
// respeita igual (5.54, achado da comum)
function hooksDesligados(dir) {
  for (const nome of ['settings.json', 'settings.local.json']) {
    try {
      if (JSON.parse(readFileSync(join(dir, '.claude', nome), 'utf8'))?.disableAllHooks === true) return true
    } catch {}
  }
  return false
}
function aceitouAutoSync(dir) {
  try {
    const s = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'))
    if (hooksDesligados(dir)) return false
    return (s?.hooks?.Stop || []).some(b => (b?.hooks || []).some(h => String(h?.command || '').includes('auto-sync.mjs')))
  } catch { return false }
}
export function projetosDa(mae) {
  let itens = []
  try { itens = readdirSync(mae, { withFileTypes: true }) } catch { return [] }
  return itens
    .filter(d => d.isDirectory() && !FORA_PELO_NOME.test(d.name) && existsSync(join(mae, d.name, '_contexto')) && existsSync(join(mae, d.name, '.git')) && aceitouAutoSync(join(mae, d.name)))
    .map(d => d.name)
    .sort()
}

// Arquivo segurado (cara de chave, grande) na pasta-mae: o autoSync avisa em _memoria/recados/,
// que a pasta-mae ignora e nao le. O aviso vira .backup-falhou, que o AGENTS.md da pasta-mae
// le no comeco da conversa, e a _memoria/ solta sai. Rodada seguinte sem nada segurado: o
// autoSync nao grava recado e o envio que deu certo apaga o .backup-falhou (5.54, A1).
const SEGUROU = /-auto-sync-segurou\.md$/
function seguradoViraFalha(mae) {
  const pasta = join(mae, '_memoria', 'recados')
  let nomes = []
  try { nomes = readdirSync(pasta).filter(n => SEGUROU.test(n)) } catch { return }
  if (!nomes.length) return
  const aviso = nomes.map(n => readFileSync(join(pasta, n), 'utf8')).join('\n')
  const falhou = join(mae, '.backup-falhou')
  const antes = existsSync(falhou) ? readFileSync(falhou, 'utf8') : ''
  if (!antes.includes(aviso)) writeFileSync(falhou, (antes ? antes + '\n' : '') + 'Arquivos da pasta-mae ficaram fora do backup.\n' + aviso)
  for (const n of nomes) rmSync(join(pasta, n), { force: true })
  for (const p of [pasta, join(mae, '_memoria')]) { try { rmdirSync(p) } catch {} }
}

// Devolve [pasta, resultado do autoSync], a pasta-mae como '.', na ordem em que subiu
export function backupPastaMae(mae, { agora = new Date(), mac = {}, sync = autoSync } = {}) {
  if (!guardaMac(mac)) return []
  const feitos = []
  for (const rel of ['.', ...projetosDa(mae)]) {
    let resultado
    try { resultado = sync(rel === '.' ? mae : join(mae, rel), agora) } catch { resultado = 'falhou' }
    if (rel === '.') { try { seguradoViraFalha(mae) } catch {} }
    feitos.push([rel, resultado])
  }
  return feitos
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

// 5.54 (A2): na sessao na nuvem (CLAUDE_CODE_REMOTE=true) o Stop sai 0 sem backup, como o auto-sync
if (chamadoDireto() && process.env.CLAUDE_CODE_REMOTE !== 'true') {
  try { backupPastaMae(process.env.CLAUDE_PROJECT_DIR || process.cwd()) } catch {}
  process.exitCode = 0
}
