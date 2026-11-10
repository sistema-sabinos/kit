// Testes do abrir-pasta.mjs (5.54, B4): video e foto entram pela pasta que o script abre, nunca pelo chat.
// O abridor e injetado (nenhum Explorer ou Finder abre de verdade, nem com a checagem desligada num
// mutante); o CLI de verdade roda so no uso errado, numa copia dos scripts do /conectar.
// Rodar: node --test abrir-pasta.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, cpSync, existsSync, readFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirPasta, cli } from './abrir-pasta.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const SKILLS = join(SCRIPTS, '..', '..')

function cenario(fn) {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'abrir-pasta-')))
  const raiz = join(base, 'projeto')
  mkdirSync(raiz)
  try { fn({ base, raiz }) } finally { rmSync(base, { recursive: true, force: true }) }
}

function abridorFalso() {
  const chamadas = []
  return { chamadas, abrir: (programa, caminho) => chamadas.push({ programa, caminho }) }
}

function rodarCli(raiz, ...args) {
  cpSync(SCRIPTS, join(raiz, '.claude/skills/conectar/scripts'), {
    recursive: true,
    filter: src => !/\.test\.mjs$/.test(src) && !/(^|[\\/])fixtures([\\/]|$)/.test(src),
  })
  const r = spawnSync(process.execPath, [join(raiz, '.claude/skills/conectar/scripts/abrir-pasta.mjs'), ...args], { encoding: 'utf8' })
  return { codigo: r.status, saida: r.stdout + r.stderr }
}

test('cria a pasta e chama o explorer.exe no Windows com o caminho absoluto', () => cenario(({ raiz }) => {
  const f = abridorFalso()
  const r = abrirPasta('producao/2026-11-07-teste/bruto', { raiz, plataforma: 'win32', abrir: f.abrir })
  const alvo = join(raiz, 'producao', '2026-11-07-teste', 'bruto')
  assert.equal(r.ok, true)
  assert.ok(existsSync(alvo), 'a pasta nasceu')
  assert.deepEqual(f.chamadas, [{ programa: 'explorer.exe', caminho: alvo }])
  assert.ok(isAbsolute(f.chamadas[0].caminho))
}))

test('no Mac chama o open com o caminho absoluto', () => cenario(({ raiz }) => {
  const f = abridorFalso()
  const r = abrirPasta('marca', { raiz, plataforma: 'darwin', abrir: f.abrir })
  assert.equal(r.ok, true)
  assert.ok(existsSync(join(raiz, 'marca')))
  assert.deepEqual(f.chamadas, [{ programa: 'open', caminho: join(raiz, 'marca') }])
}))

test('pasta que ja existe abre sem erro', () => cenario(({ raiz }) => {
  mkdirSync(join(raiz, 'producao', 'x', 'imagens'), { recursive: true })
  const f = abridorFalso()
  const r = abrirPasta('producao/x/imagens', { raiz, plataforma: 'win32', abrir: f.abrir })
  assert.equal(r.ok, true)
  assert.equal(f.chamadas.length, 1)
}))

test('../fora sai 1 sem criar nada', () => cenario(({ base, raiz }) => {
  // canario: o caso bom cria a pasta de dentro, entao a recusa abaixo nao e pasta que nunca nasce
  const f = abridorFalso()
  assert.equal(cli(['producao/dentro'], { raiz, plataforma: 'win32', abrir: f.abrir }).codigo, 0)
  assert.ok(existsSync(join(raiz, 'producao', 'dentro')), 'canario: a pasta de dentro nasceu')
  const r = cli(['../fora'], { raiz, plataforma: 'win32', abrir: f.abrir })
  assert.ok(r.texto.trim(), 'a saida nao veio vazia')
  assert.equal(r.codigo, 1, r.texto)
  assert.match(r.texto, /fora do projeto/)
  assert.equal(existsSync(join(base, 'fora')), false, 'nada nasceu fora do projeto')
  assert.equal(f.chamadas.length, 1, 'so o caso bom abriu')
}))

test('caminho absoluto fora do projeto sai 1 sem criar nada', () => cenario(({ base, raiz }) => {
  const f = abridorFalso()
  const r = cli([join(base, 'outra', 'pasta')], { raiz, plataforma: 'win32', abrir: f.abrir })
  assert.ok(r.texto.trim(), 'a saida nao veio vazia')
  assert.equal(r.codigo, 1, r.texto)
  assert.equal(existsSync(join(base, 'outra')), false)
  assert.equal(f.chamadas.length, 0)
}))

// a juncao (no Mac, atalho simbolico) dentro do projeto leva pra fora: so o caminho real pega
test('juncao dentro do projeto que leva pra fora sai 1 sem criar nada', () => cenario(({ base, raiz }) => {
  const externo = join(base, 'externo')
  mkdirSync(externo)
  symlinkSync(externo, join(raiz, 'link'), 'junction')
  // canario: o atalho leva mesmo pra fora, entao a recusa abaixo nao e pasta que nunca existiria
  assert.equal(realpathSync.native(join(raiz, 'link')), externo, 'canario: o link cai no externo')
  const f = abridorFalso()
  const r = cli(['link/sub'], { raiz, plataforma: 'win32', abrir: f.abrir })
  assert.ok(r.texto.trim(), 'a saida nao veio vazia')
  assert.equal(r.codigo, 1, r.texto)
  assert.match(r.texto, /fora do projeto/)
  assert.equal(existsSync(join(externo, 'sub')), false, 'nada nasceu fora do projeto')
  assert.equal(f.chamadas.length, 0)
}))

// o CLI de verdade so roda no caso que para antes de abrir qualquer coisa
test('sem pasta sai 1 com o uso', () => cenario(({ raiz }) => {
  const r = rodarCli(raiz)
  assert.equal(r.codigo, 1)
  assert.match(r.saida, /uso:/)
}))

test('texto: editar-video, receita de gravacao e carrossel mandam pela pasta aberta, nunca pelo chat', () => {
  const arquivos = ['editar-video/SKILL.md', 'editar-video/referencias/receita-gravacao.md', 'carrossel/SKILL.md']
  for (const a of arquivos) {
    const t = readFileSync(join(SKILLS, a), 'utf8')
    assert.ok(t.length > 0, `canario: ${a} foi lido`)
    assert.ok(t.includes('conectar/scripts/abrir-pasta.mjs'), `${a} cita o script`)
    assert.ok(t.includes('não arrasta'), `${a} diz "não arrasta"`)
  }
  // a foto colada no chat a IA copia na hora pra imagens/ e confere que o arquivo existe
  const c = readFileSync(join(SKILLS, 'carrossel/SKILL.md'), 'utf8')
  assert.match(c, /colad[ao] no chat[^\n]*imagens\/[^\n]*confer/)
  assert.ok(c.includes('abrir-pasta.mjs marca'), 'a foto de perfil entra pela pasta marca/ aberta pelo script')
  // no video, a foto de perfil da chamada "Seguir" entra pela public/ aberta pelo script
  const v = readFileSync(join(SKILLS, 'editar-video/SKILL.md'), 'utf8')
  const perfil = v.slice(v.indexOf('foto de perfil'), v.indexOf('**Arquivo para o fiscal**'))
  assert.ok(perfil.includes('perfil.jpg'), 'canario: o trecho da foto de perfil foi achado')
  assert.ok(perfil.includes('abrir-pasta.mjs producao/<slug>/public'), 'a foto de perfil entra pela public/ aberta pelo script')
  assert.ok(perfil.includes('não arrasta'), 'o trecho da foto de perfil diz "não arrasta"')
})
