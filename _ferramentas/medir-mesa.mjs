#!/usr/bin/env node
// Mede o que entra na "mesa" do Claude automaticamente, antes da primeira palavra do usuario:
// o CLAUDE.md global (~/.claude/CLAUDE.md), a cadeia de CLAUDE.md / AGENTS.md da pasta
// aberta ate a raiz do disco, e os arquivos do _contexto/ que o AGENTS.md manda ler em
// toda conversa. Mostra bytes e tokens estimados por arquivo e o total.
// Sem dependencia. A estimativa usa 3,8 caracteres por token, medido em portugues (tiktoken, 2026-09-09).
// Uso: node _ferramentas/medir-mesa.mjs [pasta]   (padrao: pasta atual)
// Limiares de arquivo de regra: amarelo acima de 2.000 tokens, vermelho acima de 6.000.
// Limiares do _contexto/: mais apertados (amarelo 800, vermelho 1.500), porque os quatro
// carregam juntos em toda conversa e crescem pra sempre se ninguem consolidar.
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

const CHARS_POR_TOKEN = 3.8
const AMARELO = 2000
const VERMELHO = 6000
// Os quatro do _contexto/ que o AGENTS.md manda ler sempre. Ordem de leitura.
const CONTEXTO_SEMPRE = ['empresa.md', 'preferencias.md', 'estrategia.md', 'agora.md']
const CONTEXTO_AMARELO = 800
const CONTEXTO_VERMELHO = 1500

const inicio = resolve(process.argv[2] || process.cwd())
const arquivos = []

const global = join(homedir(), '.claude', 'CLAUDE.md')
if (existsSync(global)) arquivos.push({ camada: 'global', caminho: global })

// Da raiz ate a pasta aberta, na ordem em que o Claude Code carrega.
const cadeia = []
for (let d = inicio; ; d = dirname(d)) {
  cadeia.unshift(d)
  if (dirname(d) === d) break
}
for (const d of cadeia) {
  for (const nome of ['CLAUDE.md', 'AGENTS.md']) {
    const p = join(d, nome)
    if (!existsSync(p)) continue
    const txt = readFileSync(p, 'utf8')
    // CLAUDE.md que e so o ponteiro @AGENTS.md nao conta duas vezes
    if (nome === 'CLAUDE.md' && /^\s*@AGENTS\.md\s*$/.test(txt)) continue
    arquivos.push({ camada: d === inicio ? 'projeto' : 'pasta acima', caminho: p })
  }
}

// O Claude Code nao carrega o _contexto/ sozinho: quem manda ler e a regra do AGENTS.md.
// Na pratica o peso e o mesmo, entao entra na conta com limiar proprio.
for (const nome of CONTEXTO_SEMPRE) {
  const p = join(inicio, '_contexto', nome)
  if (!existsSync(p)) continue
  arquivos.push({ camada: 'contexto', caminho: p, amarelo: CONTEXTO_AMARELO, vermelho: CONTEXTO_VERMELHO })
}

let totalTokens = 0
let pior = 'verde'
let estourouContexto = false
let estourouRegra = false
console.log('O que entra na mesa em toda conversa desta pasta:\n')
for (const a of arquivos) {
  const txt = readFileSync(a.caminho, 'utf8')
  const tokens = Math.round(txt.length / CHARS_POR_TOKEN)
  const limiteAmarelo = a.amarelo ?? AMARELO
  const limiteVermelho = a.vermelho ?? VERMELHO
  totalTokens += tokens
  const cor = tokens > limiteVermelho ? 'VERMELHO' : tokens > limiteAmarelo ? 'amarelo' : 'verde'
  if (cor !== 'verde') { if (a.camada === 'contexto') estourouContexto = true; else estourouRegra = true }
  if (cor === 'VERMELHO' || (cor === 'amarelo' && pior === 'verde')) pior = cor
  console.log(`${cor.padEnd(8)} ${String(tokens).padStart(6)} tokens  ${String(txt.length).padStart(7)} chars  [${a.camada}] ${a.caminho}`)
}
console.log(`\nTotal estimado: ${totalTokens} tokens antes da sua primeira palavra (3,8 chars/token).`)
if (estourouRegra) {
  console.log(`\nConserto em arquivo de regra (CLAUDE.md / AGENTS.md): manter so regra; historia, lista de skills e notas de ferramenta vao pro _contexto/ (ou ~/.claude/contexto/ no global) e entram so quando a tarefa pede.`)
}
if (estourouContexto) {
  console.log(`
Conserto no _contexto/: rodar /atualizar, que consolida. Fato velho que virou historia sai pro _contexto/arquivo/; no arquivo fica so o que muda decisao hoje.`)
}
process.exit(pior === 'VERMELHO' ? 1 : 0)
