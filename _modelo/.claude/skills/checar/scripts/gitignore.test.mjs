import { test } from 'node:test'
import assert from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conferirGitignore, FICA_FORA, SOBE } from './gitignore.mjs'

const SCRIPT = fileURLToPath(new URL('./gitignore.mjs', import.meta.url))
const MOLDE_GI = fileURLToPath(new URL('../../../../.gitignore', import.meta.url))
const SKILL = fileURLToPath(new URL('../SKILL.md', import.meta.url))

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

function repo(gitignore) {
  const dir = mkdtempSync(join(tmpdir(), 'checar-gi-'))
  git(dir, 'init', '-q')
  if (gitignore !== null) writeFileSync(join(dir, '.gitignore'), gitignore)
  return dir
}

test('molde real: ok, saida 0', () => {
  const dir = repo(null)
  try {
    copyFileSync(MOLDE_GI, join(dir, '.gitignore'))
    assert.deepEqual(conferirGitignore(dir), { furos: [] })
    const s = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' })
    assert.equal(s.status, 0, s.stderr)
    assert.equal(s.stdout.trim(), 'ok')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('!.env no fim do molde vaza so o .env, saida 1 com o caminho', () => {
  const dir = repo(readFileSync(MOLDE_GI, 'utf8') + '\n!.env\n')
  try {
    assert.deepEqual(conferirGitignore(dir).furos, ['.env: sobe pro backup e devia ficar fora'])
    const s = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' })
    assert.equal(s.status, 1)
    assert.equal(s.stdout.trim(), '.env: sobe pro backup e devia ficar fora')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('sem .gitignore vaza a lista inteira de fora; so * deixa a memoria fora', () => {
  const sem = repo(null)
  const tudo = repo('*\n')
  try {
    assert.deepEqual(conferirGitignore(sem).furos, FICA_FORA.map(c => `${c}: sobe pro backup e devia ficar fora`))
    assert.deepEqual(conferirGitignore(tudo).furos, SOBE.map(c => `${c}: fica fora do backup e devia subir`))
  } finally {
    rmSync(sem, { recursive: true, force: true })
    rmSync(tudo, { recursive: true, force: true })
  }
})

test('.env ja rastreado responde pela regra do .gitignore (molde sem furo)', () => {
  const dir = repo(null)
  try {
    copyFileSync(MOLDE_GI, join(dir, '.gitignore'))
    writeFileSync(join(dir, '.env'), 'A=1\n')
    git(dir, 'add', '-f', '.env')
    assert.equal(git(dir, 'ls-files', '.env'), '.env', 'canario: o .env esta rastreado')
    assert.deepEqual(conferirGitignore(dir), { furos: [] })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('.gitignore global que barra o .env nao esconde o furo do projeto', () => {
  const dir = repo('*.mp4\n')
  const antes = process.env.GIT_CONFIG_GLOBAL
  try {
    const ignore = join(dir, 'global-ignore')
    writeFileSync(ignore, '.env\n')
    const config = join(dir, 'global-config')
    writeFileSync(config, '[core]\n\texcludesFile = ' + ignore.split(String.fromCharCode(92)).join('/') + '\n')
    process.env.GIT_CONFIG_GLOBAL = config
    assert.equal(spawnSync('git', ['-C', dir, 'check-ignore', '-q', '.env']).status, 0, 'canario: sem o neutro o global barra')
    assert.ok(conferirGitignore(dir).furos.includes('.env: sobe pro backup e devia ficar fora'))
  } finally {
    if (antes === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = antes
    rmSync(dir, { recursive: true, force: true })
  }
})

test('.git/info/exclude que barra o .env nao esconde o furo do projeto', () => {
  const dir = repo('*.mp4\n')
  try {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.env*\n')
    assert.equal(spawnSync('git', ['-C', dir, '-c', 'core.excludesFile=', 'check-ignore', '-q', '.env']).status, 0, 'canario: o info/exclude barra o .env')
    assert.ok(conferirGitignore(dir).furos.includes('.env: sobe pro backup e devia ficar fora'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('as listas do que fica fora e do que sobe sao as do plano da 5.59 (gemeo contra lista fixa)', () => {
  assert.deepEqual(FICA_FORA, ['.env', '.env.local', 'app/codigo/.env.local', '.origem', '.backup-falhou',
    '.claude/settings.local.json', 'dados/chrome-perfil/x', 'dados/sessao/x', 'storage-state.json', '.secrets/x',
    'video.mp4', 'x.zip', 'node_modules/x.js'])
  assert.deepEqual(SOBE, ['_memoria/diario/2026-01-01.md', '_memoria/decisoes.md', '_contexto/agora.md',
    '.claude/skills/x/SKILL.md', '.sabinos/instalado.json', '.env.example'])
})

test('fora de repositorio sai 2 com o erro, nunca ok', () => {
  const dir = mkdtempSync(join(tmpdir(), 'checar-gi-sem-git-'))
  try {
    const s = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } })
    assert.equal(s.status, 2, s.stdout)
    assert.match(s.stderr, /^erro: /)
    assert.equal(s.stdout, '')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('o item 3 do /checar chama o script e da o conserto das duas linhas', () => {
  const texto = readFileSync(SKILL, 'utf8').replace(/\r\n/g, '\n')
  const item3 = texto.slice(texto.indexOf('### 3. Chaves e segredos'), texto.indexOf('### 4.'))
  assert.ok(item3.length > 0, 'canario: o item 3 existe')
  assert.ok(item3.includes('`node .claude/skills/checar/scripts/gitignore.mjs`'))
  assert.ok(item3.includes('`sobe pro backup e devia ficar fora`'))
  assert.ok(item3.includes('`fica fora do backup e devia subir`'))
  assert.ok(!item3.includes('Vale `.env*` numa linha só'), 'a leitura do texto do .gitignore saiu')
})
