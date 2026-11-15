// Testes do hora-local.mjs (rodada 5.66). Rodar: node --test _ferramentas/hora-local.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MOLDE = readFileSync(join(AQUI, '..', 'RESPONDA-AQUI.txt'), 'utf8')
const RE_HORA = /^Hora local: \d{4}-\d{2}-\d{2} \d{2}:\d{2} /

// pasta-mae de mentira com o hook, o respostas.mjs e o RESPONDA-AQUI.txt; limpa no finally de quem chama
function montar() {
  const mae = mkdtempSync(join(tmpdir(), 'hora-local-'))
  mkdirSync(join(mae, '_ferramentas'))
  for (const f of ['hora-local.mjs', 'respostas.mjs']) copyFileSync(join(AQUI, f), join(mae, '_ferramentas', f))
  writeFileSync(join(mae, 'RESPONDA-AQUI.txt'), MOLDE)
  mkdirSync(join(mae, '_modelo', '_contexto'), { recursive: true })
  mkdirSync(join(mae, 'docs'))
  return mae
}
const rodar = (mae, evento, env = {}) => spawnSync(process.execPath, [join(mae, '_ferramentas', 'hora-local.mjs')],
  { input: evento === null ? 'isto nao e json' : JSON.stringify({ hook_event_name: evento, cwd: mae }), encoding: 'utf8', env: { ...process.env, ...env } })

test('sem projeto e com pergunta em branco: a hora vai em texto na mensagem e em JSON no clique de botao', () => {
  const mae = montar()
  try {
    const msg = rodar(mae, 'UserPromptSubmit')
    assert.equal(msg.status, 0, msg.stderr)
    assert.match(msg.stdout, RE_HORA, 'canario: o hook falou com a pasta-mae sem projeto (o _modelo e a docs nao contam)')
    const clique = rodar(mae, 'PostToolUse')
    assert.equal(clique.status, 0, clique.stderr)
    const j = JSON.parse(clique.stdout)
    assert.equal(j.hookSpecificOutput.hookEventName, 'PostToolUse')
    assert.match(j.hookSpecificOutput.additionalContext, RE_HORA)
    assert.match(rodar(mae, null).stdout, RE_HORA, 'entrada ilegivel tem que seguir como mensagem')
  } finally { rmSync(mae, { recursive: true, force: true }) }
})

test('com projeto na pasta-mae o hook fica calado', () => {
  const mae = montar()
  try {
    assert.match(rodar(mae, 'UserPromptSubmit').stdout, RE_HORA, 'canario: antes do projeto ele fala')
    mkdirSync(join(mae, 'loja-da-ana', '_contexto'), { recursive: true })
    const r = rodar(mae, 'UserPromptSubmit')
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  } finally { rmSync(mae, { recursive: true, force: true }) }
})

// comum e interna da 5.66: com as 17 preenchidas (mesmo vagas) o setup ainda repergunta e corrige, e grava hora
test('com as 17 preenchidas e sem projeto o hook segue falando, porque repergunta e correcao tambem gravam hora', () => {
  const mae = montar()
  try {
    const NL = String.fromCharCode(13, 10)
    const cheio = MOLDE.split('Sua resposta:' + NL).join('Sua resposta: [2026-11-15 09:00]' + NL + 'normal' + NL)
    writeFileSync(join(mae, 'RESPONDA-AQUI.txt'), cheio)
    assert.ok(cheio.split('normal').length - 1 === 17, 'canario: as 17 ficaram preenchidas')
    const r = rodar(mae, 'UserPromptSubmit')
    assert.equal(r.status, 0)
    assert.match(r.stdout, RE_HORA)
  } finally { rmSync(mae, { recursive: true, force: true }) }
})

test('com o RESPONDA-AQUI.txt ilegivel o hook fica calado e sai 0', () => {
  const mae = montar()
  try {
    rmSync(join(mae, 'RESPONDA-AQUI.txt'))
    mkdirSync(join(mae, 'RESPONDA-AQUI.txt'))
    const r = rodar(mae, 'UserPromptSubmit')
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
    assert.equal(r.stderr, '')
  } finally { rmSync(mae, { recursive: true, force: true }) }
})

test('a hora do hook sai no fuso do computador (fuso trocado pelo env do processo filho)', () => {
  const mae = montar()
  try {
    const em = tz => rodar(mae, 'UserPromptSubmit', { TZ: tz }).stdout
    const utc = em('UTC'), toquio = em('Asia/Tokyo')
    assert.match(utc, RE_HORA, 'canario: o hook falou com o fuso trocado')
    assert.match(toquio, RE_HORA)
    assert.notEqual(utc.slice(0, 28), toquio.slice(0, 28), 'o fuso nao mudou a hora: o hook pode estar em UTC')
  } finally { rmSync(mae, { recursive: true, force: true }) }
})
