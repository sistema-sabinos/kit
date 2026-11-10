// Testes do ligar-mcp.mjs (5.54, B1): o script do kit no lugar do comando de adicionar MCP do Claude Code.
// Cada projeto e uma pasta temporaria com a copia dos scripts do /conectar, e a home e outra, com HOME e
// USERPROFILE falsos juntos, porque no Windows o os.homedir() le o USERPROFILE.
// Rodar: node --test ligar-mcp.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const PACOTE = '@playwright/' + 'mcp@'

function base() { return realpathSync.native(mkdtempSync(join(tmpdir(), 'ligar-mcp-'))) }

function projeto(raiz, nome) {
  const dir = join(raiz, nome)
  cpSync(SCRIPTS, join(dir, '.claude/skills/conectar/scripts'), {
    recursive: true,
    filter: src => !/\.test\.mjs$/.test(src) && !/(^|[\\/])fixtures([\\/]|$)/.test(src),
  })
  return dir
}

function rodar(dir, home, ...args) {
  const r = spawnSync(process.execPath, [join(dir, '.claude/skills/conectar/scripts/ligar-mcp.mjs'), ...args], {
    env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8',
  })
  return { codigo: r.status, saida: r.stdout + r.stderr }
}

const lerJson = arq => JSON.parse(readFileSync(arq, 'utf8'))
const mcpDe = dir => join(dir, '.mcp.json')
const settingsDe = home => join(home, '.claude', 'settings.json')

function cenario(fn) {
  const raiz = base()
  const home = join(raiz, 'home')
  mkdirSync(home)
  try { fn({ raiz, home, a: projeto(raiz, 'a'), b: projeto(raiz, 'b') }) } finally { rmSync(raiz, { recursive: true, force: true }) }
}

test('liga num projeto sem .mcp.json e cria, com a versao fixa e o settings do usuario na home falsa', () => cenario(({ raiz, home, a }) => {
  const r = rodar(a, home, 'ligar', 'playwright')
  assert.equal(r.codigo, 0, r.saida)
  // canario: o caminho do settings impresso comeca no mkdtemp, entao a home falsa valeu
  const linha = r.saida.split(/\r?\n/).find(l => l.includes('settings.json'))
  assert.ok(linha && linha.slice(linha.indexOf(':') + 1).trim().startsWith(raiz), r.saida)
  const def = lerJson(mcpDe(a)).mcpServers.playwright
  assert.equal(def.command, 'npx')
  assert.ok(def.args.includes(PACOTE + '0.0.83') && def.args.includes('--isolated'), JSON.stringify(def))
  assert.deepEqual(lerJson(settingsDe(home)).enabledMcpjsonServers, ['playwright'])
}))

test('navegador liga na porta do projeto, sem --isolated', () => cenario(({ home, a }) => {
  const p = spawnSync(process.execPath, [join(a, '.claude/skills/conectar/scripts/porta.mjs')], { encoding: 'utf8' }).stdout.trim()
  assert.match(p, /^\d+$/, 'canario: o porta.mjs imprime a porta')
  assert.equal(rodar(a, home, 'ligar', 'navegador').codigo, 0)
  const args = lerJson(mcpDe(a)).mcpServers.navegador.args
  assert.ok(args.includes(`http://127.0.0.1:${p}`), args.join(' '))
  assert.ok(!args.includes('--isolated'))
}))

test('liga num .mcp.json com outro servidor e preserva', () => cenario(({ home, a }) => {
  writeFileSync(mcpDe(a), JSON.stringify({ mcpServers: { meu: { command: 'x', args: ['y'] } }, outro: 1 }, null, 2))
  assert.equal(rodar(a, home, 'ligar', 'context7').codigo, 0)
  const j = lerJson(mcpDe(a))
  assert.deepEqual(j.mcpServers.meu, { command: 'x', args: ['y'] })
  assert.equal(j.outro, 1)
  assert.ok(j.mcpServers.context7)
}))

test('liga duas vezes e nao duplica, nem no .mcp.json nem no enabledMcpjsonServers', () => cenario(({ home, a }) => {
  assert.equal(rodar(a, home, 'ligar', 'playwright').codigo, 0)
  assert.equal(rodar(a, home, 'ligar', 'playwright').codigo, 0)
  assert.equal(Object.keys(lerJson(mcpDe(a)).mcpServers).length, 1)
  assert.deepEqual(lerJson(settingsDe(home)).enabledMcpjsonServers, ['playwright'])
}))

test('o settings do usuario preserva as outras chaves quando existe', () => cenario(({ home, a }) => {
  mkdirSync(join(home, '.claude'))
  writeFileSync(settingsDe(home), JSON.stringify({ model: 'x', enabledMcpjsonServers: ['meu'], permissions: { allow: ['Read'] } }))
  assert.equal(rodar(a, home, 'ligar', 'playwright').codigo, 0)
  const s = lerJson(settingsDe(home))
  assert.equal(s.model, 'x')
  assert.deepEqual(s.permissions, { allow: ['Read'] })
  assert.deepEqual(s.enabledMcpjsonServers, ['meu', 'playwright'])
}))

test('desliga e tira so do .mcp.json do projeto; liga em A e B, desliga em A, B segue aprovado', () => cenario(({ home, a, b }) => {
  assert.equal(rodar(a, home, 'ligar', 'playwright').codigo, 0)
  assert.equal(rodar(b, home, 'ligar', 'playwright').codigo, 0)
  const r = rodar(a, home, 'desligar', 'playwright')
  assert.equal(r.codigo, 0, r.saida)
  assert.equal(lerJson(mcpDe(a)).mcpServers.playwright, undefined)
  assert.ok(lerJson(mcpDe(b)).mcpServers.playwright)
  assert.deepEqual(lerJson(settingsDe(home)).enabledMcpjsonServers, ['playwright'])
}))

test('nome fora da lista sai 1, notion e n8n incluidos, sem gravar', () => cenario(({ home, a }) => {
  for (const nome of ['notion', 'n8n', 'qualquer']) {
    const r = rodar(a, home, 'ligar', nome)
    assert.equal(r.codigo, 1, nome + ': ' + r.saida)
    assert.ok(r.saida.length > 0, 'canario: a recusa diz alguma coisa')
  }
  assert.ok(!existsSync(mcpDe(a)) && !existsSync(settingsDe(home)))
}))

test('JSON quebrado sai 2 sem gravar, no .mcp.json e no settings do usuario', () => cenario(({ home, a, b }) => {
  writeFileSync(mcpDe(a), '{ quebrado')
  assert.equal(rodar(a, home, 'ligar', 'playwright').codigo, 2)
  assert.equal(readFileSync(mcpDe(a), 'utf8'), '{ quebrado')
  assert.ok(!existsSync(settingsDe(home)), 'o settings nasceu com o .mcp.json quebrado')
  mkdirSync(join(home, '.claude'))
  writeFileSync(settingsDe(home), '[nao fecha')
  assert.equal(rodar(b, home, 'ligar', 'playwright').codigo, 2)
  assert.ok(!existsSync(mcpDe(b)), 'o .mcp.json nasceu com o settings quebrado')
  assert.equal(readFileSync(settingsDe(home), 'utf8'), '[nao fecha')
}))

test('nenhum valor do .env entra no .mcp.json nem no settings', () => cenario(({ home, a }) => {
  const isca = 'isca' + '123'
  writeFileSync(join(a, '.env'), `NOTION_TOKEN=${isca}\n`)
  for (const nome of ['playwright', 'navegador', 'context7']) assert.equal(rodar(a, home, 'ligar', nome).codigo, 0)
  for (const arq of [mcpDe(a), settingsDe(home)]) {
    const t = readFileSync(arq, 'utf8')
    assert.ok(t.length > 0, 'canario: o arquivo nao veio vazio')
    assert.ok(readFileSync(join(a, '.env'), 'utf8').includes(isca), 'canario: a busca morde no .env')
    assert.ok(!t.includes(isca), arq)
  }
}))

test('~/.claude.json com navegador no escopo local do projeto da o aviso e nao e regravado', () => cenario(({ home, a }) => {
  const claudeJson = join(home, '.claude.json')
  const texto = JSON.stringify({ projects: { [a.split(String.fromCharCode(92)).join('/')]: { mcpServers: { navegador: { command: 'npx', args: ['velho'] } } } } }, null, 2)
  writeFileSync(claudeJson, texto)
  for (const args of [['ligar', 'navegador'], ['listar']]) {
    const r = rodar(a, home, ...args)
    assert.equal(r.codigo, 0, r.saida)
    assert.ok(/escopo local/.test(r.saida), args.join(' ') + ': sem o aviso: ' + r.saida)
  }
  assert.equal(readFileSync(claudeJson, 'utf8'), texto)
  // sem o nome no escopo local, nada de aviso
  const r = rodar(a, home, 'ligar', 'playwright')
  assert.equal(r.codigo, 0, r.saida)
  assert.ok(r.saida.includes('ligado: playwright'), 'canario: o comando rodou: ' + r.saida)
  assert.ok(!/escopo local/.test(r.saida), r.saida)
}))

test('o aviso do escopo local aponta a entrada pelo id do mudancas.md', () => cenario(({ home, a }) => {
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ projects: { [a.split(String.fromCharCode(92)).join('/')]: { mcpServers: { navegador: {} } } } }))
  const r = rodar(a, home, 'listar')
  assert.ok(/escopo local/.test(r.saida), 'canario: o aviso saiu: ' + r.saida)
  assert.ok(r.saida.includes('mcp-pelo-script'), r.saida)
}))

test('settings.json, .mcp.json e .claude.json salvos com BOM leem normal', () => cenario(({ home, a }) => {
  const bom = String.fromCharCode(0xFEFF)
  mkdirSync(join(home, '.claude'))
  writeFileSync(settingsDe(home), bom + JSON.stringify({ model: 'x' }))
  writeFileSync(mcpDe(a), bom + JSON.stringify({ mcpServers: { meu: { command: 'x' } } }))
  writeFileSync(join(home, '.claude.json'), bom + JSON.stringify({ projects: { [a.split(String.fromCharCode(92)).join('/')]: { mcpServers: { context7: {} } } } }))
  const r = rodar(a, home, 'ligar', 'context7')
  assert.equal(r.codigo, 0, r.saida)
  assert.equal(lerJson(settingsDe(home)).model, 'x')
  assert.ok(lerJson(mcpDe(a)).mcpServers.meu)
  assert.ok(/escopo local/.test(r.saida), 'o BOM do .claude.json engoliu o aviso: ' + r.saida)
}))

test('nome no disabledMcpjsonServers de qualquer settings sai como recusado no ligar e no listar', () => {
  for (const onde of ['usuario', 'settings.json', 'settings.local.json']) cenario(({ home, a }) => {
    const arq = onde === 'usuario' ? settingsDe(home) : join(a, '.claude', onde)
    mkdirSync(dirname(arq), { recursive: true })
    writeFileSync(arq, JSON.stringify({ disabledMcpjsonServers: ['context7'] }))
    const r = rodar(a, home, 'ligar', 'context7')
    assert.equal(r.codigo, 0, r.saida)
    assert.ok(r.saida.includes('ligado: context7'), 'canario: ' + r.saida)
    assert.ok(/recusado/.test(r.saida) && r.saida.includes('disabledMcpjsonServers'), onde + ': ' + r.saida)
    const l = rodar(a, home, 'listar')
    assert.match(l.saida, /context7: ligado, recusado/, onde + ': ' + l.saida)
    assert.ok(!/context7: ligado, aprovado/.test(l.saida), l.saida)
  })
  // sem a recusa, nada de recusado
  cenario(({ home, a }) => {
    const r = rodar(a, home, 'ligar', 'context7')
    assert.ok(r.saida.includes('ligado: context7') && !/recusado/.test(r.saida), r.saida)
  })
})

// 5.54, comum do Codex: o escopo do usuario (mcpServers de topo no ~/.claude.json) vence o .mcp.json no app
test('~/.claude.json com o nome no escopo do usuario da o aviso no ligar e no listar, sem regravar', () => cenario(({ home, a }) => {
  const claudeJson = join(home, '.claude.json')
  const texto = JSON.stringify({ mcpServers: { navegador: { command: 'npx', args: ['velho'] } } }, null, 2)
  writeFileSync(claudeJson, texto)
  for (const args of [['ligar', 'navegador'], ['listar']]) {
    const r = rodar(a, home, ...args)
    assert.equal(r.codigo, 0, r.saida)
    assert.ok(/escopo do usuario/.test(r.saida) && r.saida.includes('mcp-pelo-script'), args.join(' ') + ': sem o aviso: ' + r.saida)
  }
  assert.equal(readFileSync(claudeJson, 'utf8'), texto)
  const r = rodar(a, home, 'ligar', 'playwright')
  assert.ok(r.saida.includes('ligado: playwright'), 'canario: o comando rodou: ' + r.saida)
  assert.ok(!/escopo do usuario/.test(r.saida), r.saida)
}))

test('desligar com definicao local ou do usuario do mesmo nome avisa que segue carregando', () => {
  for (const onde of ['local', 'usuario']) cenario(({ home, a }) => {
    assert.equal(rodar(a, home, 'ligar', 'context7').codigo, 0)
    const def = { mcpServers: { context7: { command: 'npx' } } }
    writeFileSync(join(home, '.claude.json'), JSON.stringify(onde === 'local' ? { projects: { [a.split(String.fromCharCode(92)).join('/')]: def } } : def))
    const r = rodar(a, home, 'desligar', 'context7')
    assert.equal(r.codigo, 0, r.saida)
    assert.equal(lerJson(mcpDe(a)).mcpServers.context7, undefined)
    assert.ok(/segue carregando/.test(r.saida) && r.saida.includes('mcp-pelo-script'), onde + ': ' + r.saida)
    assert.ok(r.saida.includes(onde === 'local' ? 'do escopo local' : 'do escopo do usuario'), onde + ': ' + r.saida)
  })
  cenario(({ home, a }) => {
    writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { context7: { command: 'npx' } } }))
    const r = rodar(a, home, 'desligar', 'context7')
    assert.equal(r.codigo, 0, r.saida)
    assert.ok(/segue carregando/.test(r.saida), 'canario: o aviso saiu: ' + r.saida)
    assert.ok(!r.saida.includes('saiu do .mcp.json') && !r.saida.includes('nao estava ligado'), 'sem .mcp.json, nada saiu dele: ' + r.saida)
  })
  cenario(({ home, a }) => {
    assert.equal(rodar(a, home, 'ligar', 'context7').codigo, 0)
    const r = rodar(a, home, 'desligar', 'context7')
    assert.ok(r.saida.includes('desligado: context7'), 'canario: ' + r.saida)
    assert.ok(!/segue carregando/.test(r.saida), r.saida)
  })
})

test('arquivo existente em CRLF segue em CRLF; existente em LF e novo seguem em LF', () => cenario(({ home, a }) => {
  const CR = String.fromCharCode(13)
  mkdirSync(join(home, '.claude'))
  writeFileSync(settingsDe(home), JSON.stringify({ model: 'x' }, null, 2).split('\n').join(CR + '\n') + CR + '\n')
  writeFileSync(mcpDe(a), JSON.stringify({ mcpServers: {} }, null, 2) + '\n')
  assert.ok(readFileSync(settingsDe(home), 'utf8').includes(CR), 'canario: o settings nasceu com CR')
  assert.equal(rodar(a, home, 'ligar', 'context7').codigo, 0)
  const s = readFileSync(settingsDe(home), 'utf8')
  assert.ok(s.includes('context7'), 'canario: o settings foi regravado: ' + s)
  assert.equal(s.split('\n').length - 1, s.split(CR + '\n').length - 1, 'o settings perdeu o CRLF')
  assert.ok(!readFileSync(mcpDe(a), 'utf8').includes(CR), 'o .mcp.json em LF ganhou CR')
  assert.equal(rodar(a, home, 'ligar', 'playwright').codigo, 0)
}))

test('listar mostra o que esta ligado e o que esta aprovado', () => cenario(({ home, a }) => {
  assert.equal(rodar(a, home, 'ligar', 'context7').codigo, 0)
  const r = rodar(a, home, 'listar')
  assert.equal(r.codigo, 0, r.saida)
  assert.ok(r.saida.includes('context7'), r.saida)
  assert.ok(r.saida.includes('playwright'), 'canario: a lista fechada aparece: ' + r.saida)
}))
