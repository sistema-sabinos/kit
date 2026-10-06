import { test } from 'node:test'
import assert from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoSync, lerOrigem, carimbo, semInternet, semLogin } from './auto-sync.mjs'

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

test('revert pela metade (REVERT_HEAD) nao e tocado', () => {
  const r = montar()
  try {
    const gd = git(r.a, 'rev-parse', '--absolute-git-dir')
    writeFileSync(join(gd, 'REVERT_HEAD'), git(r.a, 'rev-parse', 'HEAD') + '\n')
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, AGORA), 'em-andamento')
    assert.equal(git(r.a, 'status', '--porcelain', 'x.md'), '?? x.md', 'nao commitou os marcadores do revert')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('revert ou cherry-pick de varios commits pela metade (sequencer) nao e tocado', () => {
  const r = montar()
  try {
    mkdirSync(join(git(r.a, 'rev-parse', '--absolute-git-dir'), 'sequencer'))
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, AGORA), 'em-andamento')
    assert.equal(git(r.a, 'status', '--porcelain', 'x.md'), '?? x.md', 'nao commitou no meio da sequencia')
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

// chave falsa montada por partes: escrita inteira, este arquivo teria cara de chave
const CHAVE_FALSA = 'sk-' + 'Ab1'.repeat(10)
const temNoRemoto = (r, arq) => spawnSync('git', ['--git-dir', r.remoto, 'cat-file', '-e', `main:${arq}`]).status === 0

test('cara de chave fica fora do backup, o resto sobe, e o recado some quando resolve', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'config.md'), `chave = ${CHAVE_FALSA}\n`)
    writeFileSync(join(r.a, 'outro.md'), 'normal\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    assert.ok(temNoRemoto(r, 'outro.md'), 'canario: o resto subiu')
    assert.ok(!temNoRemoto(r, 'config.md'), 'a chave nao subiu')
    assert.ok(!git(r.a, 'log', '--all', '--format=', '--name-only').includes('config.md'), 'nem em commit local')
    assert.match(readFileSync(join(r.a, 'config.md'), 'utf8'), /chave = sk-/, 'o arquivo continua no disco')
    const recado = join(r.a, '_memoria', 'recados', '2026-10-05-dono-auto-sync-segurou.md')
    const texto = readFileSync(recado, 'utf8')
    // o mesmo cabecalho de todo recado (de, quando, precisa de acao), que o /iniciar le
    assert.match(texto, /^de: dono\nquando: 2026-10-05\nprecisa de ação: sim\n/)
    assert.match(texto, /- config\.md: tem cara de chave de API/)
    assert.ok(!texto.includes(CHAVE_FALSA), 'o recado nunca repete a chave')
    // a resposta seguinte, sem nada novo, nao reescreve o recado nem faz commit
    assert.equal(autoSync(r.a, new Date(2026, 9, 6, 9, 0)), 'nada')
    writeFileSync(join(r.a, 'config.md'), 'chave = no .env\n')
    assert.equal(autoSync(r.a, new Date(2026, 9, 6, 9, 5)), 'enviado')
    assert.ok(temNoRemoto(r, 'config.md'))
    assert.ok(!existsSync(recado), 'resolvido, o recado sai')
    assert.ok(!temNoRemoto(r, '_memoria/recados/2026-10-05-dono-auto-sync-segurou.md'))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('token do Instagram, chave no .env.example e chave em texto grande ficam fora; hash e exemplo sobem', () => {
  const r = montar()
  // montados por partes: maiuscula, minuscula e digito, nunca um token inteiro escrito
  const corpo = n => 'Ab1Cd2Ef3G'.repeat(Math.ceil(n / 10)).slice(0, n)
  try {
    writeFileSync(join(r.a, 'notas-instagram.md'), 'Token de acesso do Instagram: ' + 'IGQV' + corpo(120) + '\n')
    writeFileSync(join(r.a, '.env.example'), 'OPENAI_API_KEY=' + CHAVE_FALSA + '\n')
    writeFileSync(join(r.a, 'export.csv'), 'a,b\n'.repeat(700000) + 'segredo,' + CHAVE_FALSA + '\n')
    writeFileSync(join(r.a, 'hash.md'), 'key sha256 ' + 'a3f9'.repeat(16) + '\n')
    writeFileSync(join(r.a, 'doc.md'), 'Authorization: Bearer ' + 'APP_' + 'USR-12345678-031820-X-12345678\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    assert.ok(temNoRemoto(r, 'hash.md') && temNoRemoto(r, 'doc.md'), 'canario: o que nao e chave subiu')
    for (const arq of ['notas-instagram.md', '.env.example', 'export.csv']) assert.ok(!temNoRemoto(r, arq), `${arq} nao subiu`)
    const texto = readFileSync(join(r.a, '_memoria', 'recados', '2026-10-05-dono-auto-sync-segurou.md'), 'utf8')
    assert.match(texto, /- notas-instagram\.md: tem cara de token do Instagram/)
    assert.match(texto, /- \.env\.example: tem cara de chave de API/)
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('--conferir lista o preparado com cara de chave, sai 1, e nao commita nem tira do stage', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'config.md'), `chave = ${CHAVE_FALSA}\n`)
    writeFileSync(join(r.a, 'ok.md'), 'normal\n')
    git(r.a, 'add', '-A')
    const s = spawnSync(process.execPath, [SCRIPT, '--conferir'], { cwd: r.a, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: r.a } })
    assert.equal(s.status, 1)
    assert.deepEqual(JSON.parse(s.stdout), [{ rel: 'config.md', motivo: 'tem cara de chave de API' }])
    assert.match(git(r.a, 'diff', '--cached', '--name-only'), /config\.md/, 'continua preparado: quem decide e a skill')
    assert.equal(git(r.a, 'log', '--format=%s', '-1'), 'inicio', 'nada commitado')
    git(r.a, 'reset', '-q', '--', 'config.md')
    const limpo = spawnSync(process.execPath, [SCRIPT, '--conferir'], { cwd: r.a, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: r.a } })
    assert.equal(limpo.status, 0)
    assert.deepEqual(JSON.parse(limpo.stdout), [])
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('--conferir sem git sai 2 (nunca verde sem conferir) e opcao errada nunca faz backup', () => {
  const solta = mkdtempSync(join(tmpdir(), 'auto-sync-'))
  const r = montar()
  try {
    writeFileSync(join(solta, 'x.md'), 'chave = ' + CHAVE_FALSA + '\n')
    const s = spawnSync(process.execPath, [SCRIPT, '--conferir'], { cwd: solta, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: solta } })
    assert.equal(s.status, 2)
    assert.match(s.stderr, /nao consegui listar/)
    writeFileSync(join(r.a, 'novo.md'), 'algo\n')
    const e = spawnSync(process.execPath, [SCRIPT, '--conferi'], { cwd: r.a, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: r.a } })
    assert.equal(e.status, 3)
    assert.equal(git(r.a, 'log', '--format=%s', '-1'), 'inicio', 'nada commitado')
    assert.ok(!temNoRemoto(r, 'novo.md'), 'nada enviado')
  } finally { rmSync(solta, { recursive: true, force: true }); rmSync(r.raiz, { recursive: true, force: true }) }
})

test('arquivo acima do limite fica fora do backup e o recado diz o tamanho', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'video-cru.pdf'), 'x'.repeat(2048))
    writeFileSync(join(r.a, 'leve.md'), 'ok\n')
    assert.equal(autoSync(r.a, AGORA, { limiteBytes: 1024 }), 'enviado')
    assert.ok(temNoRemoto(r, 'leve.md'))
    assert.ok(!temNoRemoto(r, 'video-cru.pdf'))
    assert.match(readFileSync(join(r.a, '_memoria', 'recados', '2026-10-05-dono-auto-sync-segurou.md'), 'utf8'), /- video-cru\.pdf: passa de /)
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('segunda rodada ao mesmo tempo sai quieta; trava esquecida ha mais de 10 minutos e liberada', () => {
  const r = montar()
  try {
    const trava = join(git(r.a, 'rev-parse', '--absolute-git-dir'), 'sabinos-auto-sync.trava')
    mkdirSync(trava)
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, new Date()), 'ocupado')
    assert.equal(git(r.a, 'status', '--porcelain', 'x.md'), '?? x.md', 'nao mexeu em nada')
    assert.equal(autoSync(r.a, new Date(Date.now() + 11 * 60 * 1000)), 'enviado')
    assert.ok(!existsSync(trava), 'a rodada solta a trava no fim')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('sem internet: quieto no primeiro dia, aviso depois de 24h, e tudo sobe quando a rede volta', () => {
  const r = montar()
  try {
    const url = git(r.a, 'remote', 'get-url', 'origin')
    git(r.a, 'remote', 'set-url', 'origin', 'http://127.0.0.1:9/nada.git')
    writeFileSync(join(r.a, 'x.md'), 'x\n')
    assert.equal(autoSync(r.a, AGORA), 'sem-internet')
    assert.ok(!existsSync(join(r.a, '.backup-falhou')), 'queda curta nao alarma')
    assert.equal(autoSync(r.a, new Date(2026, 9, 6, 23, 0)), 'falhou')
    assert.match(readFileSync(join(r.a, '.backup-falhou'), 'utf8'), /mais de um dia[\s\S]*sobe sozinho/)
    git(r.a, 'remote', 'set-url', 'origin', url)
    assert.equal(autoSync(r.a, new Date(2026, 9, 6, 23, 5)), 'enviado')
    assert.ok(temNoRemoto(r, 'x.md'))
    assert.ok(!existsSync(join(r.a, '.backup-falhou')))
    assert.ok(!existsSync(join(git(r.a, 'rev-parse', '--absolute-git-dir'), 'sabinos-sem-internet-desde')))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('arquivo ja rastreado segurado nao trava o puxar quando o outro lado mandou antes', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, 'cfg.md'), 'ok\n')
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    writeFileSync(join(r.b, 'b.md'), 'do notebook\n')
    assert.match(autoSync(r.b, AGORA), /enviado$/)
    writeFileSync(join(r.a, 'cfg.md'), `ok\nchave = ${CHAVE_FALSA}\n`)
    writeFileSync(join(r.a, 'a.md'), 'do dono\n')
    assert.equal(autoSync(r.a, AGORA), 'puxado-e-enviado')
    assert.equal(doRemoto(r, 'a.md'), 'do dono\n')
    assert.equal(doRemoto(r, 'b.md'), 'do notebook\n')
    assert.doesNotMatch(doRemoto(r, 'cfg.md'), /sk-/, 'a chave nao subiu')
    assert.match(readFileSync(join(r.a, 'cfg.md'), 'utf8'), /chave = sk-/, 'e continua no disco')
    assert.equal(git(r.a, 'stash', 'list'), '', 'nada esquecido no stash')
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('arquivo segurado que o outro lado tambem mudou: para como conflito, sem marca dentro do arquivo', () => {
  const r = montar()
  try {
    writeFileSync(join(r.b, 'notas.md'), 'linha 1 do notebook\n')
    assert.equal(autoSync(r.b, AGORA), 'enviado')
    writeFileSync(join(r.a, 'notas.md'), `linha 1 chave = ${CHAVE_FALSA}\n`)
    writeFileSync(join(r.a, 'a.md'), 'do dono\n')
    assert.equal(autoSync(r.a, AGORA), 'parado')
    assert.equal(readFileSync(join(r.a, 'notas.md'), 'utf8'), `linha 1 chave = ${CHAVE_FALSA}\n`, 'arquivo intacto, sem <<<<<<<')
    assert.equal(git(r.a, 'stash', 'list'), '')
    assert.equal(doRemoto(r, 'notas.md'), 'linha 1 do notebook\n')
    assert.deepEqual(readdirSync(join(r.a, '_memoria', 'recados')).sort(),
      ['2026-10-05-dono-auto-sync-parado.md', '2026-10-05-dono-auto-sync-segurou.md'])
    assert.match(readFileSync(join(r.a, '.backup-falhou'), 'utf8'), /notas\.md, que está segurado/)
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('chave dentro de _memoria/recados tambem fica fora', () => {
  const r = montar()
  try {
    mkdirSync(join(r.a, '_memoria', 'recados'), { recursive: true })
    writeFileSync(join(r.a, '_memoria', 'recados', 'nota.md'), `${CHAVE_FALSA}\n`)
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    assert.ok(temNoRemoto(r, '_memoria/recados/2026-10-05-dono-auto-sync-segurou.md'), 'canario: o recado subiu')
    assert.ok(!temNoRemoto(r, '_memoria/recados/nota.md'))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('nome que comeca com espaco nao escapa da varredura', () => {
  const r = montar()
  try {
    writeFileSync(join(r.a, ' chave.txt'), `${CHAVE_FALSA}\n`)
    assert.equal(autoSync(r.a, AGORA), 'enviado')
    assert.ok(!temNoRemoto(r, ' chave.txt'))
  } finally { rmSync(r.raiz, { recursive: true, force: true }) }
})

test('mensagem do git escolhe o texto: rede, login ou outro', () => {
  assert.ok(semInternet('error: RPC failed; curl 56 Recv failure: Connection was reset'))
  assert.ok(!semInternet('spawnSync git ETIMEDOUT'), 'push lento que estoura o tempo nao e falta de rede')
  assert.ok(semLogin('remote: Repository not found.\nfatal: repository \'https://github.com/a/b.git/\' not found'))
  assert.ok(semInternet('fatal: unable to access \'https://github.com/a/b.git/\': Could not resolve host: github.com'))
  assert.ok(semInternet('fatal: unable to access \'http://127.0.0.1:9/\': Failed to connect to 127.0.0.1 port 9 after 2 ms'))
  assert.ok(semLogin('remote: Invalid username or password.\nfatal: Authentication failed for \'https://github.com/a/b.git/\''))
  assert.ok(semLogin('fatal: could not read Username for \'https://github.com\': terminal prompts disabled'))
  assert.ok(!semInternet('fatal: Authentication failed'), 'login nao vira rede')
  assert.ok(!semLogin('fatal: \'/x/sumiu.git\' does not appear to be a git repository') && !semInternet('fatal: \'/x/sumiu.git\' does not appear to be a git repository'))
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
