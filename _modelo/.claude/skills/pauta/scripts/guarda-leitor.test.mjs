// Testes da trava de gravacao do pauta-leitor. Roda o hook de verdade com JSON na entrada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { podeGravar } from './guarda-leitor.mjs'

const SCRIPT = fileURLToPath(new URL('./guarda-leitor.mjs', import.meta.url))
const RAIZ = join(tmpdir(), 'projeto-teste')
const BARRA = String.fromCharCode(92)
const rodar = (entrada, env = {}) => spawnSync(process.execPath, [SCRIPT], { input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: RAIZ, ...env } })

const LIVRES = ['inteligencia/base-ideias/lojateste.md', join(RAIZ, 'producao', '_pauta', '2026-10-08-radar.md'), 'inteligencia' + BARRA + 'base-ideias' + BARRA + 'x.md']
const BARRADOS = [
  '.claude/skills/pauta/scripts/radar.mjs', join(RAIZ, '.claude', 'settings.json'), 'inteligencia/base-ideias/../../.claude/hooks/x.mjs',
  '../fora.md', join(tmpdir(), 'outro', 'inteligencia', 'base-ideias', 'x.md'), 'inteligencia/base-ideias/', 'producao/_pautax/a.md', '', null,
]

test('so deixa gravar dentro das duas pastas de saida', () => {
  for (const c of LIVRES) assert.equal(podeGravar(RAIZ, c), true, `devia deixar: ${c}`)
  for (const c of BARRADOS) assert.equal(podeGravar(RAIZ, c), false, `devia barrar: ${c}`)
})

test('atalho de pasta dentro da pasta de saida apontando pra .claude barra', () => {
  const proj = mkdtempSync(join(tmpdir(), 'guarda-atalho-'))
  try {
    mkdirSync(join(proj, 'inteligencia', 'base-ideias'), { recursive: true })
    mkdirSync(join(proj, '.claude', 'skills', 'pauta', 'scripts'), { recursive: true })
    // juncao no Windows nao pede administrador; fora dele o tipo e ignorado e vira link de pasta
    symlinkSync(join(proj, '.claude'), join(proj, 'inteligencia', 'base-ideias', 'atalho'), 'junction')
    assert.ok(existsSync(join(proj, 'inteligencia', 'base-ideias', 'atalho', 'skills', 'pauta')), 'canario: o atalho leva ao .claude')
    assert.equal(podeGravar(proj, 'inteligencia/base-ideias/lojateste.md'), true)
    assert.equal(podeGravar(proj, 'inteligencia/base-ideias/atalho/skills/pauta/scripts/radar.mjs'), false)
  } finally { rmSync(proj, { recursive: true, force: true }) }
})

test('o hook de verdade sai 0 na pasta de saida e 2 no resto, com motivo', () => {
  const ok = rodar({ tool_name: 'Write', tool_input: { file_path: LIVRES[0] } })
  assert.equal(ok.status, 0, ok.stderr)
  const barra = rodar({ tool_name: 'Edit', tool_input: { file_path: '.claude/skills/pauta/scripts/radar.mjs' } })
  assert.equal(barra.status, 2)
  assert.match(barra.stderr, /Gravacao barrada/)
  assert.equal(rodar('isso nao e json').status, 2, 'entrada ilegivel barra')
  assert.equal(rodar({ tool_input: {} }).status, 2, 'sem caminho barra')
})

test('mutante: sem a checagem de pasta, o script deixa passar o radar.mjs', async () => {
  const fonte = readFileSync(SCRIPT, 'utf8')
  const trecho = 'return PASTAS.some(p => rel.startsWith(p) && rel.length > p.length)'
  assert.ok(fonte.includes(trecho), 'canario: trecho existe')
  const pasta = mkdtempSync(join(tmpdir(), 'guarda-mutante-'))
  try {
    const arq = join(pasta, 'guarda-leitor.mjs')
    writeFileSync(arq, fonte.replace(trecho, 'return true'))
    const { podeGravar: mutado } = await import(pathToFileURL(arq).href)
    assert.equal(mutado(RAIZ, '.claude/skills/pauta/scripts/radar.mjs'), true)
    assert.equal(podeGravar(RAIZ, '.claude/skills/pauta/scripts/radar.mjs'), false)
  } finally { rmSync(pasta, { recursive: true, force: true }) }
})
