// Testes do medir-persona.mjs numa pasta temporaria com o nome do apelido.
// Rodar: node --test medir-persona.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { medirPersona, SECOES, RODAPE, CONFERENCIA } from './medir-persona.mjs'

const CRLF = String.fromCharCode(13, 10)
const conferencia = apelido => `7. Rodo node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs ~/.claude/skills/${apelido} ${CONFERENCIA} r.md`
const skillBoa = (apelido, extra = []) => ['---', `name: ${apelido}`, 'description: Conselheiro de persuasao.', 'origem: clonar-especialista', '---',
  ...SECOES.flatMap(s => [s, 'texto']), conferencia(apelido), ...extra, RODAPE].join(CRLF)
const agenteBom = apelido => ['---', `name: ${apelido}`, 'description: Delega pro conselheiro.', 'tools: Read, Glob, Grep, Bash, Write', `skills: [${apelido}]`, 'origem: clonar-especialista', '---', 'corpo'].join(CRLF)

function pasta(apelido, { skill = skillBoa(apelido), agente = agenteBom(apelido) } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'medir-persona-'))
  const dir = join(raiz, apelido)
  mkdirSync(dir)
  if (skill != null) writeFileSync(join(dir, 'SKILL.md'), skill)
  if (agente != null) writeFileSync(join(dir, 'agente.md'), agente)
  return { raiz, dir }
}

test('persona completa passa', () => {
  const p = pasta('mentor-x')
  try {
    const r = medirPersona(p.dir)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    assert.match(r.linhas[0], /^persona ok: \d+ linhas/)
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

test('cada defeito vira uma linha', () => {
  const skill = skillBoa('mentor-x').replace('name: mentor-x', 'name: outro').replace('origem: clonar-especialista', '')
    .replace(`${CRLF}## Voz${CRLF}`, CRLF).replace(RODAPE, '')
  const agente = agenteBom('mentor-x').replace('skills: [mentor-x]', 'skills: [outro]').replace('tools:', 'model: algum-modelo\ntools:')
  const p = pasta('mentor-x', { skill, agente })
  try {
    const r = medirPersona(p.dir)
    assert.equal(r.codigo, 1)
    for (const re of [/name "outro" diferente/, /falta "origem: clonar-especialista" no frontmatter do SKILL/, /falta a secao "## Voz"/, /rodape/, /sem "skills: \[mentor-x\]"/, /model "algum-modelo"/]) {
      assert.ok(r.linhas.some(l => re.test(l)), `faltou ${re}: ${r.linhas.join(' | ')}`)
    }
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

// P1 da 5.20: persona sem o passo de conferir a resposta, ou subagente sem as ferramentas pra
// rodar o script, sai do Passo 8 sem rede nenhuma no dia a dia.
test('persona sem a conferencia da resposta e subagente sem Bash e Write reprovam', () => {
  const skill = skillBoa('mentor-x').replace(conferencia('mentor-x'), 'item sem a conferencia')
  const agente = agenteBom('mentor-x').replace('tools: Read, Glob, Grep, Bash, Write', 'tools: Read, Glob, Grep')
  const p = pasta('mentor-x', { skill, agente })
  try {
    assert.ok(!skill.includes(CONFERENCIA), 'canario: o passo saiu do SKILL.md')
    const r = medirPersona(p.dir)
    assert.equal(r.codigo, 1, r.linhas.join(' | '))
    for (const re of [/falta no Como respondo a conferencia de cada resposta \(conferir-citacoes\.mjs ~\/\.claude\/skills\/mentor-x --persona --resposta\)/, /agente\.md sem Bash em tools/, /agente\.md sem Write em tools/]) {
      assert.ok(r.linhas.some(l => re.test(l)), `faltou ${re}: ${r.linhas.join(' | ')}`)
    }
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

// O esqueleto e o molde sao o que a skill copia: com o apelido trocado, tem de passar aqui.
test('esqueleto da persona e molde do agente, com o apelido trocado, passam no medir-persona', () => {
  const bloco = nome => {
    const t = readFileSync(fileURLToPath(new URL(`../referencias/${nome}`, import.meta.url)), 'utf8')
    const m = /^```\r?\n([\s\S]*?)\r?\n```/m.exec(t)
    assert.ok(m, `sem bloco de codigo em ${nome}`)
    return m[1].replaceAll('<apelido>', 'mentor-x')
  }
  const p = pasta('mentor-x', { skill: bloco('esqueleto-persona.md'), agente: bloco('agente-molde.md') })
  try {
    const r = medirPersona(p.dir)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0, r.linhas.join(' | '))
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

test('model: inherit tambem reprova: sem linha model nenhuma (regra global)', () => {
  const agente = agenteBom('mentor-x').replace('tools:', `model: inherit${CRLF}tools:`)
  const p = pasta('mentor-x', { agente })
  try {
    assert.ok(agente.includes(`${CRLF}model: inherit${CRLF}`), 'canario: linha model no frontmatter')
    const r = medirPersona(p.dir)
    assert.equal(r.codigo, 1, r.linhas.join(' | '))
    assert.ok(r.linhas.some(l => /model "inherit"/.test(l)), r.linhas.join(' | '))
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

test('mais de 500 linhas e description acima de 1536 reprovam', () => {
  const longa = skillBoa('mentor-x', Array.from({ length: 500 }, () => 'linha'))
    .replace('description: Conselheiro de persuasao.', `description: ${'x'.repeat(1537)}`)
  const p = pasta('mentor-x', { skill: longa })
  try {
    const r = medirPersona(p.dir)
    assert.equal(r.codigo, 1)
    assert.ok(r.linhas.some(l => /linhas \(teto 500\)/.test(l)), r.linhas.join(' | '))
    assert.ok(r.linhas.some(l => /1537 caracteres \(teto 1536\)/.test(l)), r.linhas.join(' | '))
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

test('sem SKILL.md ou sem agente.md reprova', () => {
  const a = pasta('mentor-x', { skill: null })
  const b = pasta('mentor-x', { agente: null })
  try {
    assert.match(medirPersona(a.dir).linhas[0], /sem SKILL\.md/)
    assert.ok(medirPersona(b.dir).linhas.includes('falta agente.md'))
  } finally {
    rmSync(a.raiz, { recursive: true, force: true })
    rmSync(b.raiz, { recursive: true, force: true })
  }
})
