// Testes do checar-apelido.mjs com projeto, pasta-mae e casa temporarios.
// Rodar: node --test checar-apelido.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checarApelido } from './checar-apelido.mjs'

const SCRIPT = fileURLToPath(new URL('./checar-apelido.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)

// mae/ (com _modelo e VERSAO), mae/loja/ (projeto) e casa/ (o ~ falso)
function cenario({ dentroDaMae = true } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'checar-apelido-'))
  const mae = join(raiz, 'mae')
  mkdirSync(join(mae, '_modelo', '.claude', 'skills', 'pauta'), { recursive: true })
  mkdirSync(join(mae, '.claude', 'skills', 'setup'), { recursive: true })
  writeFileSync(join(mae, 'VERSAO'), '5.10')
  const projeto = dentroDaMae ? join(mae, 'loja') : join(raiz, 'solta')
  mkdirSync(join(projeto, '.claude', 'skills', 'caixa'), { recursive: true })
  const casa = join(raiz, 'casa')
  mkdirSync(join(casa, '.claude', 'skills'), { recursive: true })
  mkdirSync(join(casa, '.claude', 'agents'), { recursive: true })
  return { raiz, mae, projeto, casa }
}

test('apelido livre sai 0', () => {
  const c = cenario()
  try {
    const r = checarApelido('mentor-persuasao', { projeto: c.projeto, casa: c.casa })
    assert.deepEqual(r, { codigo: 0, linha: 'livre: mentor-persuasao' })
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('formato errado sai 1', () => {
  for (const a of ['Mentor', 'mentor persuasao', 'mentor_x', '-x', 'x-', '', undefined, 'a'.repeat(65)]) {
    const r = checarApelido(a, { projeto: '.', casa: '.' })
    assert.equal(r.codigo, 1, String(a))
    assert.match(r.linha, /^formato/)
  }
})

test('nome de skill do projeto, do molde ou da pasta-mae sai 1', () => {
  const c = cenario()
  try {
    for (const a of ['caixa', 'pauta', 'setup']) {
      const r = checarApelido(a, { projeto: c.projeto, casa: c.casa })
      assert.equal(r.codigo, 1, a)
      assert.match(r.linha, /ja e nome de skill do sistema/)
    }
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('projeto fora da pasta-mae: confere projeto e casa, sem quebrar', () => {
  const c = cenario({ dentroDaMae: false })
  try {
    assert.equal(checarApelido('pauta', { projeto: c.projeto, casa: c.casa }).codigo, 0, 'sem pasta-mae, a skill do molde nao e vista')
    assert.equal(checarApelido('caixa', { projeto: c.projeto, casa: c.casa }).codigo, 1)
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('pasta feita a mao em ~/.claude/skills sai 1 mesmo com --atualizar', () => {
  const c = cenario()
  try {
    mkdirSync(join(c.casa, '.claude', 'skills', 'mentor-x'))
    writeFileSync(join(c.casa, '.claude', 'skills', 'mentor-x', 'SKILL.md'), ['---', 'name: mentor-x', '---'].join(CRLF))
    const r = checarApelido('mentor-x', { projeto: c.projeto, casa: c.casa, atualizar: true })
    assert.equal(r.codigo, 1)
    assert.match(r.linha, /nao foi feito por esta skill/)
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('conselheiro desta skill: sem --atualizar pergunta, com --atualizar libera', () => {
  const c = cenario()
  try {
    mkdirSync(join(c.casa, '.claude', 'skills', 'mentor-x'))
    const nosso = ['---', 'name: mentor-x', 'origem: clonar-especialista', '---'].join(CRLF)
    writeFileSync(join(c.casa, '.claude', 'skills', 'mentor-x', 'SKILL.md'), nosso)
    writeFileSync(join(c.casa, '.claude', 'agents', 'mentor-x.md'), nosso)
    assert.match(checarApelido('mentor-x', { projeto: c.projeto, casa: c.casa }).linha, /--atualizar/)
    assert.deepEqual(checarApelido('mentor-x', { projeto: c.projeto, casa: c.casa, atualizar: true }), { codigo: 0, linha: 'atualizar: mentor-x' })
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('copia-mestra na pasta-mae conta como existente', () => {
  const c = cenario()
  try {
    mkdirSync(join(c.mae, 'agentes', 'mentor-y'), { recursive: true })
    assert.equal(checarApelido('mentor-y', { projeto: c.projeto, casa: c.casa }).codigo, 1)
    assert.equal(checarApelido('mentor-y', { projeto: c.projeto, casa: c.casa, atualizar: true }).codigo, 0)
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('copia-mestra com SKILL.md feito a mao sai 1 mesmo com --atualizar; com origem libera', () => {
  const c = cenario()
  try {
    const mestra = join(c.mae, 'agentes', 'mentor-v')
    mkdirSync(mestra, { recursive: true })
    writeFileSync(join(mestra, 'SKILL.md'), ['---', 'name: mentor-v', '---'].join(CRLF))
    const r = checarApelido('mentor-v', { projeto: c.projeto, casa: c.casa, atualizar: true })
    assert.equal(r.codigo, 1, r.linha)
    assert.match(r.linha, /ja existe uma copia-mestra com esse apelido que nao foi feita por esta skill/)
    writeFileSync(join(mestra, 'SKILL.md'), ['---', 'name: mentor-v', 'origem: clonar-especialista', '---'].join(CRLF))
    assert.deepEqual(checarApelido('mentor-v', { projeto: c.projeto, casa: c.casa, atualizar: true }), { codigo: 0, linha: 'atualizar: mentor-v' })
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('fora da pasta-mae, a pasta de trabalho no ~/.claude/conselheiros conta como existente', () => {
  const c = cenario({ dentroDaMae: false })
  try {
    mkdirSync(join(c.casa, '.claude', 'conselheiros', 'mentor-w'), { recursive: true })
    assert.match(checarApelido('mentor-w', { projeto: c.projeto, casa: c.casa }).linha, /--atualizar/)
    assert.equal(checarApelido('mentor-w', { projeto: c.projeto, casa: c.casa, atualizar: true }).codigo, 0)
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('CLI usa o HOME e o USERPROFILE como casa e barra pasta feita a mao', () => {
  const c = cenario()
  try {
    mkdirSync(join(c.casa, '.claude', 'skills', 'mentor-z'))
    writeFileSync(join(c.casa, '.claude', 'skills', 'mentor-z', 'SKILL.md'), 'feito a mao')
    const r = spawnSync(process.execPath, [SCRIPT, 'mentor-z'], { cwd: c.projeto, encoding: 'utf8', env: { ...process.env, HOME: c.casa, USERPROFILE: c.casa } })
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /nao foi feito por esta skill/)
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})
