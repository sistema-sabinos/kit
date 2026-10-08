// Perguntas reais dos compradores, lidas dos briefings da /espionar-concorrente (pacote Mercado Livre).
// No modo loja, a /pauta cruza esses assuntos com o formato que funcionou nos perfis. Sem o pacote ou sem
// briefing, devolve lista vazia e a pauta segue so com os perfis.
// Uso: node .claude/skills/pauta/scripts/perguntas.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../midia-social/scripts/lib/raiz.mjs'

// A pergunta do comprador e texto de terceiro e vai em citacao no briefing ("- > texto");
// aceita tambem "> - texto", "> texto" e o item simples dos briefings antigos, e tira o ">".
// Um "## " dentro da citacao ("> ## ...") nao fecha a secao, porque nao comeca a linha.
const ITEM = /^\s*(?:>\s*[-*]\s+|[-*]\s+>\s*|[-*]\s+|>\s*)(.+?)\s*$/

export function perguntasDoBriefing(texto) {
  const m = /^##\s+Perguntas reais\s*$([\s\S]*?)(?=^##\s|^---\s*$|(?![\s\S]))/m.exec(String(texto).replace(/\r\n/g, '\n'))
  if (!m) return []
  return m[1].split('\n').map(l => ITEM.exec(l)).filter(Boolean).map(x => x[1])
}

const pastas = d => { try { return readdirSync(d).filter(n => statSync(join(d, n)).isDirectory()) } catch { return [] } }

export function juntarPerguntas(raiz = RAIZ) {
  const base = join(raiz, 'fornecedores')
  if (!existsSync(base)) return []
  const out = []
  for (const f of pastas(base)) {
    const conc = join(base, f, 'concorrentes')
    for (const cat of pastas(conc)) {
      for (const arq of readdirSync(join(conc, cat)).filter(n => n.endsWith('.md')).sort()) {
        const rel = ['fornecedores', f, 'concorrentes', cat, arq].join('/')
        for (const pergunta of perguntasDoBriefing(readFileSync(join(conc, cat, arq), 'utf8'))) out.push({ produto: arq.replace(/\.md$/, ''), pergunta, arquivo: rel })
      }
    }
  }
  return out
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const todas = juntarPerguntas()
  if (!todas.length) console.log('nenhuma pergunta coletada: rodar /espionar-concorrente num produto, ou seguir so com os perfis')
  else {
    const por = new Map()
    for (const p of todas) por.set(p.produto, [...(por.get(p.produto) || []), p])
    for (const [produto, lista] of por) console.log(`## ${produto} (${lista[0].arquivo})\n${lista.map(p => `- ${p.pergunta}`).join('\n')}\n`)
  }
}
