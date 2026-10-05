import { test } from 'node:test'
import assert from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoSync, lerOrigem, carimbo } from './auto-sync.mjs'

const SCRIPT = fileURLToPath(new URL('./auto-sync.mjs', import.meta.url))
const AGORA = new Date(2026, 9, 5, 22, 7)   // 22h no Brasil: em UTC ja seria dia 6

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function configurar(dir) {
  git(dir, 'config', 'user.name', 'Teste')
  git(dir, 'config', 'user.email', 'teste@exemplo.com')
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'config', 'core.autocrlf', 'false')
}

// remoto local (git init --bare) com dois clones, A e B, nunca GitHub
function montar() {
  const raiz = mkdtempSync(join(tmpdir(), 'auto-sync-'))
  const remoto = join(raiz, 'remoto.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remoto])
  const a = join(raiz, 'a')
  mkdirSync(a)
  git(a, 'init', '-q', '-b', 'main')
  configurar(a)
  git(a, 'remote', 'add', 'origin', remoto)
  writeFileSync(join(a, 'notas.md'), 'linha 1\n')
  // o que o .gitignore do molde bloqueia de proposito e o hook escreve
  writeFileSync(join(a, '.gitignore'), '.origem\n.backup-falhou\n')
  git(a, 'add', '-A')
  git(a, 'commit', '-q', '-m', 'inicio')
  git(a, 'push', '-q', '-u', 'origin', 'main')
  const b = join(raiz, 'b')
  execFileSync('git', ['clone', '-q', remoto, b])
  configurar(b)
  writeFileSync(join(b, '.origem'), 'notebook\n')
  return { raiz, remoto, a, b }
}

const doRemoto = (r, arq) => execFileSync('git', ['--git-dir', r.remoto, 'show', `main:${arq}`], { encoding: 'utf8' })

test('pasta sem git e repositorio sem remoto saem quietos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auto-sync-'))
  try {
    assert.equal(autoSync(dir), 'sem-repo')
    git(dir, 'init', '-q')
    writeFileSync(join(dir, 'x.md'), 'x\n')
    assert.equal(autoSync(dir), 'sem-remoto')
    assert.equal(git(dir, 'status', '--porcelain'), '?? x.md', 'sem remoto nao commita nada')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('sozinho: manda direto, assina com a origem e a data local, limpa o .backup-falhou', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'notas.md'), 'linha 1\nlinha 2\n')
    writeFileSync(join(r.a, '.backup-falhou'), 'antigo\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    assert.equal(git(r.a, 'log', '-1', '--format=%s'), 'auto-sync dono: 2026-10-05 22:07')
    assert.match(doRemoto(r, 'notas.md'), /linha 2/)
    assert.ok(!existsSync(join(r.a, '.backup-falhou')))
    assert.equal(autoSync(r.a, AGORA), 'nada', 'sem mudanca nova nao faz commit vazio')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('commit que ficou pra tras numa falha anterior sobe mesmo sem mudanca nova', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'notas.md'), 'linha 1\npendente\n')
    git(r.a, 'commit', '-q', '-am', 'feito com a rede fora')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    assert.match(doRemoto(r, 'notas.md'), /pendente/)
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('dois computadores em arquivos diferentes: o segundo puxa e manda, sem recado', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'a.md'), 'do dono\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    writeFileSync(join(r.b, 'b.md'), 'do notebook\n')
    assert.equal(autoSync(r.b, AGORA), 'puxado-e-enviado')
    assert.equal(doRemoto(r, 'a.md'), 'do dono\n')
    assert.equal(doRemoto(r, 'b.md'), 'do notebook\n')
    assert.ok(!existsSync(join(r.b, '_memoria')), 'sem conflito nao tem recado')
    assert.match(git(r.b, 'log', '-1', '--format=%s'), /^auto-sync notebook: /)
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('conflito: para, desfaz o rebase, deixa recado e nao perde nada dos dois lados', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'notas.md'), 'versao do dono\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    writeFileSync(join(r.b, 'notas.md'), 'versao do notebook\n')
    assert.equal(autoSync(r.b, AGORA), 'parado')
    // nada perdido: o lado de la continua no remoto, o lado de ca no arquivo e num commit local
    assert.equal(doRemoto(r, 'notas.md'), 'versao do dono\n')
    assert.equal(readFileSync(join(r.b, 'notas.md'), 'utf8'), 'versao do notebook\n')
    assert.match(git(r.b, 'log', '-1', '--format=%s'), /^auto-sync notebook: /)
    assert.equal(git(r.b, 'status', '--porcelain', '--untracked-files=no'), '', 'arvore limpa, sem rebase pela metade')
    const gd = git(r.b, 'rev-parse', '--absolute-git-dir')
    assert.ok(!existsSync(join(gd, 'rebase-merge')) && !existsSync(join(gd, 'rebase-apply')))
    // recado no formato do contrato, e o aviso de sempre
    const pasta = join(r.b, '_memoria', 'recados')
    assert.deepEqual(readdirSync(pasta), ['2026-10-05-notebook-auto-sync-parado.md'])
    const recado = readFileSync(join(pasta, '2026-10-05-notebook-auto-sync-parado.md'), 'utf8')
    assert.match(recado, /^de: notebook\nquando: 2026-10-05 22:07\nprecisa de ação: sim\n/)
    assert.match(recado, /notas\.md/)
    assert.match(readFileSync(join(r.b, '.backup-falhou'), 'utf8'), /NAO subiu/)
    // a proxima resposta tenta de novo, para de novo e nao duplica o recado
    writeFileSync(join(r.b, 'outra.md'), 'mais trabalho\n')
    assert.equal(autoSync(r.b, new Date(2026, 9, 6, 9, 0)), 'parado')
    assert.deepEqual(readdirSync(pasta), ['2026-10-05-notebook-auto-sync-parado.md'])
    assert.equal(readFileSync(join(r.b, 'outra.md'), 'utf8'), 'mais trabalho\n')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('recado de envio parado fica neste computador: o .gitignore do molde barra e o hook ainda le do disco', () => {
  const molde = readFileSync(fileURLToPath(new URL('../../.gitignore', import.meta.url)), 'utf8')
  const linha = molde.split(/\r?\n/).find(l => l.trim() === '_memoria/recados/*-auto-sync-parado.md')
  assert.ok(linha, 'o .gitignore do molde tem a linha')
  const conflito = (gitignore) => {
    const r = montar()
    try {
      writeFileSync(join(r.b, '.gitignore'), gitignore)
      writeFileSync(join(r.a, 'notas.md'), 'versao do dono\n')
      assert.equal(autoSync(r.a, AGORA), 'enviado')
      writeFileSync(join(r.b, 'notas.md'), 'versao do notebook\n')
      assert.equal(autoSync(r.b, AGORA), 'parado')
      writeFileSync(join(r.b, 'outra.md'), 'mais\n')
      assert.equal(autoSync(r.b, new Date(2026, 9, 6, 9, 0)), 'parado')
      assert.deepEqual(readdirSync(join(r.b, '_memoria', 'recados')), ['2026-10-05-notebook-auto-sync-parado.md'], 'um recado so, lido do disco')
      return git(r.b, 'log', '--all', '--format=', '--name-only')
    } finally { rmSync(r.raiz, { recursive: true, force: true }) }
  }
  assert.match(conflito('.origem\n.backup-falhou\n'), /auto-sync-parado/, 'canario: sem a linha, o recado entra no commit')
  assert.doesNotMatch(conflito(`.origem\n.backup-falhou\n${linha}\n`), /auto-sync-parado/)
})

test('rebase pela metade (o /syncar resolvendo) nao e tocado', () => {
  const r = montar()
  try {
    mkdirSync(join(git(r.a, 'rev-parse', '--absolute-git-dir'), 'rebase-merge'))
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, AGORA), 'em-andamento')
    assert.equal(git(r.a, 'status', '--porcelain', 'x.md'), '?? x.md', 'nao commitou no meio da resolucao')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('em-andamento escreve .backup-falhou so quando nao existe e nao commita', () => {
  const r = montar()
  try {
    mkdirSync(join(git(r.a, 'rev-parse', '--absolute-git-dir'), 'rebase-merge'))
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, AGORA), 'em-andamento')
    assert.match(readFileSync(join(r.a, '.backup-falhou'), 'utf8'), /2026-10-05 22:07[\s\S]*em andamento[\s\S]*\/syncar/)
    writeFileSync(join(r.a, '.backup-falhou'), 'do syncar\n')
    assert.equal(autoSync(r.a, AGORA), 'em-andamento')
    assert.equal(readFileSync(join(r.a, '.backup-falhou'), 'utf8'), 'do syncar\n', 'aviso existente fica como esta')
    assert.equal(git(r.a, 'status', '--porcelain', 'x.md'), '?? x.md')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('conflito em arquivo com acento: o recado lista o nome literal', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'relatório.md'), 'base\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    git(r.b, 'pull', '-q')
    writeFileSync(join(r.a, 'relatório.md'), 'do dono\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    writeFileSync(join(r.b, 'relatório.md'), 'do notebook\n')
    assert.equal(autoSync(r.b, AGORA), 'parado')
    const recado = readFileSync(join(r.b, '_memoria', 'recados', '2026-10-05-notebook-auto-sync-parado.md'), 'utf8')
    assert.ok(recado.includes('relatório.md'))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('aviso velho some quando tudo ja esta no GitHub', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'notas.md'), 'linha 1\nnova\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    writeFileSync(join(r.a, '.backup-falhou'), 'velho\n')
    assert.equal(autoSync(r.a, AGORA), 'nada')
    assert.ok(!existsSync(join(r.a, '.backup-falhou')))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('remoto inalcancavel: marca .backup-falhou e nao inventa conflito', () => {
  const r = montar()
  try {
    git(r.a, 'remote', 'set-url', 'origin', join(r.raiz, 'sumiu.git'))
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, AGORA), 'falhou')
    assert.match(readFileSync(join(r.a, '.backup-falhou'), 'utf8'), /2026-10-05 22:07[\s\S]*NAO subiu/)
    assert.ok(!existsSync(join(r.a, '_memoria')))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('lerOrigem: uma palavra, sem acento, minuscula; sem arquivo ou vazio vira dono', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auto-sync-'))
  try {
    assert.equal(lerOrigem(dir), 'dono')
    writeFileSync(join(dir, '.origem'), 'Escritório Centro\r\n')
    assert.equal(lerOrigem(dir), 'escritorio')
    writeFileSync(join(dir, '.origem'), '  \n')
    assert.equal(lerOrigem(dir), 'dono')
    writeFileSync(join(dir, '.origem'), '../../x')
    assert.equal(lerOrigem(dir), 'x', 'nunca vira caminho')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('carimbo usa o fuso local', () => {
  assert.deepEqual(carimbo(AGORA), { dia: '2026-10-05', hora: '22:07' })
})

test('rodado como hook: sai com codigo 0 mesmo fora de repositorio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'auto-sync-'))
  try {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, input: '{}', encoding: 'utf8' })
    assert.equal(r.status, 0)
    assert.equal(r.stderr, '')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
