// Qual motor gera o cenario das fotos, do melhor pro mais simples:
//   codex    Codex logado pela conta ChatGPT (Plus ou Pro): sem cobranca por imagem dentro da
//            cota do plano; quem comprou creditos avulsos do Codex gasta esses creditos ao passar dela
//   gemini   chave do Gemini no .env: pago por imagem, com estimativa e "pode ir" antes
//   zero-ia  nenhum dos dois: fundo liso da paleta, foto real e texto em HTML
// Codex logado por chave de API fica de fora: ali cada imagem e cobrada.
// Uso: node .claude/skills/gerar-imagens/scripts/motor.mjs
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerEnv } from '../../mercado-livre/scripts/lib/env.mjs'

export function escolherDegrau({ codex, env }) {
  if (codex.logado) return { degrau: 'codex', motivo: 'Codex logado com a conta do ChatGPT: gera o cenario sem cobranca por imagem dentro da cota do plano; se voce comprou creditos avulsos do Codex, passar do limite do plano gasta esses creditos' }
  if (env.GEMINI_API_KEY) return { degrau: 'gemini', motivo: 'chave do Gemini no .env: gera o cenario pago por imagem, com estimativa antes' }
  return { degrau: 'zero-ia', motivo: 'sem Codex e sem Gemini: fundo liso da paleta, foto real e texto em HTML, custo zero' }
}

export function lerStatusCodex(r) {
  const saida = `${r.stdout || ''}\n${r.stderr || ''}`
  if (r.error || /not recognized|command not found|reconhecido como/i.test(saida)) return { instalado: false, logado: false }
  return { instalado: true, logado: r.status === 0 && /logged in using chatgpt/i.test(saida) }
}

export function detectarCodex(executar = spawnSync) {
  return lerStatusCodex(executar('codex', ['login', 'status'], { encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32' }))
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const codex = detectarCodex()
  const env = lerEnv()
  console.log(JSON.stringify({ ...escolherDegrau({ codex, env }), codex, gemini: Boolean(env.GEMINI_API_KEY) }))
}
