// Passo 8 da /clonar-especialista: a persona cabe e tem o que o conselheiro precisa.
// Na pasta do conselheiro (o nome da pasta e o apelido): SKILL.md com ate 500 linhas, frontmatter
// com name igual ao apelido, description de 1 a 1536 caracteres (teto da doc de skills do Claude
// Code, conferido em 2026-10-12) e origem: clonar-especialista; as 8 secoes obrigatorias e o
// rodape; agente.md com o mesmo name, description, skills com o apelido, a origem e sem linha
// model nenhuma, nem "inherit" (regra 9 do AGENTS.md: herda o da conversa).
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/medir-persona.mjs <pasta-do-conselheiro>
import { readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerFrontmatter, ORIGEM } from './lib/frontmatter.mjs'

export const SECOES = ['## Papel', '## Como respondo', '## Modelos mentais', '## Regras de decisão', '## Voz', '## Limites', '## Regras de saída', '## Mapa das fichas']
export const RODAPE = 'Inspirado no material público de um especialista. Não fala pela pessoa e não tem endosso dela.'
const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }

export function medirPersona(pasta) {
  const apelido = basename(resolve(pasta))
  const skill = ler(join(pasta, 'SKILL.md'))
  if (!skill) return { codigo: 1, linhas: [`AVISO: sem SKILL.md em ${pasta}`] }
  const agente = ler(join(pasta, 'agente.md'))
  const problemas = []
  const linhas = skill.split(/\r?\n/)
  if (linhas.length > 500) problemas.push(`SKILL.md com ${linhas.length} linhas (teto 500): mande o detalhe pras fichas`)
  const fm = lerFrontmatter(skill)
  if (!fm) problemas.push('SKILL.md sem frontmatter')
  else {
    if (fm.name !== apelido) problemas.push(`name "${fm.name ?? ''}" diferente do apelido "${apelido}"`)
    const d = fm.description ?? ''
    if (!d) problemas.push('description vazia no SKILL.md')
    else if (d.length > 1536) problemas.push(`description com ${d.length} caracteres (teto 1536)`)
    if (fm.origem !== ORIGEM) problemas.push(`falta "origem: ${ORIGEM}" no frontmatter do SKILL.md`)
  }
  for (const s of SECOES) if (!linhas.some(l => l.trim() === s)) problemas.push(`falta a secao "${s}"`)
  if (!skill.includes(RODAPE)) problemas.push('falta o rodape de inspiracao no fim do SKILL.md')
  if (!agente) problemas.push('falta agente.md')
  else {
    const fa = lerFrontmatter(agente)
    if (!fa) problemas.push('agente.md sem frontmatter')
    else {
      if (fa.name !== apelido) problemas.push(`agente.md com name "${fa.name ?? ''}" diferente do apelido "${apelido}"`)
      if (!fa.description) problemas.push('description vazia no agente.md')
      const skills = Array.isArray(fa.skills) ? fa.skills : [fa.skills].filter(Boolean)
      if (!skills.includes(apelido)) problemas.push(`agente.md sem "skills: [${apelido}]"`)
      if (fa.model) problemas.push(`agente.md com model "${fa.model}": tire a linha (regra 9)`)
      if (fa.origem !== ORIGEM) problemas.push(`falta "origem: ${ORIGEM}" no frontmatter do agente.md`)
    }
  }
  if (!problemas.length) return { codigo: 0, linhas: [`persona ok: ${linhas.length} linhas, ${SECOES.length} secoes`] }
  return { codigo: 1, linhas: [...problemas, `problemas: ${problemas.length}`] }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const pasta = process.argv[2]
  if (!pasta) {
    console.error('Uso: node .claude/skills/clonar-especialista/scripts/medir-persona.mjs <pasta-do-conselheiro>')
    process.exit(1)
  }
  const r = medirPersona(pasta)
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
