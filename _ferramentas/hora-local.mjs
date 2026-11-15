#!/usr/bin/env node
// Hook da pasta-mae, chamado pelo .claude/settings.json no UserPromptSubmit (mensagem da pessoa) e no PostToolUse da
// AskUserQuestion (clique de botao, que nao passa pelo UserPromptSubmit). Poe a hora do computador no contexto da IA
// pra o /setup carimbar cada resposta do RESPONDA-AQUI.txt na linha do rotulo (rodada 5.66, ata do Conselho de
// 2026-11-15): a IA nao tem a hora sozinha, e um comando por resposta abriria caixa de permissao a cada uma.
// So fala enquanto a pasta-mae ainda nao tem projeto (pasta com _contexto/) e tem o RESPONDA-AQUI.txt; depois do
// primeiro projeto fica calado pra sempre. Qualquer erro: calado e saida 0, nunca segura a conversa.
// No UserPromptSubmit o texto simples vira contexto; no PostToolUse so o additionalContext do JSON vira (doc de hooks,
// conferida em 2026-11-15). Sem process.exit depois do write: no Windows ele corta o stdout.
// Uso: chamado pelo Claude Code, com o JSON do evento pela entrada padrao. Sem dependencia.
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { horaLocal } from './respostas.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

// projeto e pasta com _contexto/ dentro; as que comecam com _ ou . e a docs/ nunca sao (AGENTS.md da pasta-mae)
export function temProjeto(raiz) {
  return readdirSync(raiz).some(n => !n.startsWith('_') && !n.startsWith('.') && n !== 'docs'
    && statSync(join(raiz, n)).isDirectory() && existsSync(join(raiz, n, '_contexto')))
}

// fala enquanto o setup ainda roda, ate com as 17 preenchidas: repergunta da vaga e correcao do Passo 1 tambem gravam
// hora (comum e interna da 5.66). O arquivo tem que se ler, senao calado.
export function deveFalar(raiz) {
  const arq = join(raiz, 'RESPONDA-AQUI.txt')
  if (!existsSync(arq) || temProjeto(raiz)) return false
  readFileSync(arq, 'utf8')
  return true
}

export function saida(evento, hora) {
  const texto = `Hora local: ${hora} (o /setup usa no carimbo do RESPONDA-AQUI.txt)`
  if (evento === 'PostToolUse') return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: texto } })
  return texto
}

function main() {
  let evento = 'UserPromptSubmit'
  try { evento = JSON.parse(readFileSync(0, 'utf8')).hook_event_name || evento } catch { /* sem entrada legivel: trata como mensagem */ }
  if (deveFalar(RAIZ)) process.stdout.write(saida(evento, horaLocal()) + String.fromCharCode(10))
}

function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}
if (chamadoDireto()) { try { main() } catch { /* calado: a hora e ajuda, nunca trava */ } }
