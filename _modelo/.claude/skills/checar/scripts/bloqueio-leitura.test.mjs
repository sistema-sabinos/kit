import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('./bloqueio-leitura.mjs', import.meta.url))
const CHAVE = 'blockReadsOutsideWorkingDirectories'

// HOME e USERPROFILE falsos juntos: no Windows o os.homedir() le o USERPROFILE, e so com o HOME
// falso o tirar reescreveria o ~/.claude/settings.json de verdade
function montar() {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'bloqueio-leitura-')))
  const casa = join(base, 'casa'), projeto = join(base, 'projeto')
  mkdirSync(join(casa, '.claude'), { recursive: true })
  mkdirSync(join(projeto, '.claude'), { recursive: true })
  return { base, casa, projeto }
}

const rodar = (m, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: m.projeto,
  env: { ...process.env, HOME: m.casa, USERPROFILE: m.casa },
  encoding: 'utf8',
})

const linhas = s => s.split(/\r?\n/).filter(Boolean)

test('ler: chave no settings do usuario e achada, com o caminho que comeca no mkdtemp', () => {
  const m = montar()
  try {
    const arq = join(m.casa, '.claude', 'settings.json')
    writeFileSync(arq, JSON.stringify({ permissions: { [CHAVE]: true } }, null, 2))
    const r = rodar(m, 'ler')
    assert.equal(r.status, 0, r.stderr)
    assert.ok(r.stdout.trim().length > 0, 'saida vazia')
    assert.deepEqual(linhas(r.stdout), [arq])
    assert.ok(linhas(r.stdout)[0].startsWith(m.base), `o caminho devia comecar no mkdtemp, veio ${r.stdout}`)
  } finally {
    rmSync(m.base, { recursive: true, force: true })
  }
})

test('ler: chave no settings e no settings.local do projeto e achada', () => {
  const m = montar()
  try {
    const a = join(m.projeto, '.claude', 'settings.json'), b = join(m.projeto, '.claude', 'settings.local.json')
    writeFileSync(a, JSON.stringify({ permissions: { [CHAVE]: true } }))
    writeFileSync(b, JSON.stringify({ permissions: { [CHAVE]: true } }))
    const r = rodar(m, 'ler')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(linhas(r.stdout), [a, b])
    for (const l of linhas(r.stdout)) assert.ok(l.startsWith(m.base), `fora do mkdtemp: ${l}`)
  } finally {
    rmSync(m.base, { recursive: true, force: true })
  }
})

// com false a leitura de fora fica liberada: acusar daria vermelho falso e o tirar regravaria o arquivo a toa.
// O true no settings do projeto e o canario: prova que o ler rodou e acha o que trava.
test('ler e tirar: chave com false nao trava nada e nao e achada, o arquivo fica intacto', () => {
  const m = montar()
  try {
    const comTrue = join(m.projeto, '.claude', 'settings.json'), comFalse = join(m.projeto, '.claude', 'settings.local.json')
    writeFileSync(comTrue, JSON.stringify({ permissions: { [CHAVE]: true } }))
    const textoFalse = JSON.stringify({ permissions: { [CHAVE]: false } })
    writeFileSync(comFalse, textoFalse)
    const r = rodar(m, 'ler')
    assert.equal(r.status, 0, r.stderr)
    assert.ok(r.stdout.trim().length > 0, 'saida vazia')
    assert.deepEqual(linhas(r.stdout), [comTrue])
    const r2 = rodar(m, 'tirar')
    assert.equal(r2.status, 0, r2.stderr)
    assert.deepEqual(linhas(r2.stdout), [comTrue])
    assert.equal(readFileSync(comFalse, 'utf8'), textoFalse, 'o arquivo com false nao se regrava')
  } finally {
    rmSync(m.base, { recursive: true, force: true })
  }
})

test('tirar: tira a chave e preserva as outras chaves, e o arquivo continua JSON', () => {
  const m = montar()
  try {
    const arq = join(m.casa, '.claude', 'settings.json')
    const antes = { model: 'isca-modelo', permissions: { deny: ['Read(./isca-deny)'], [CHAVE]: true }, hooks: { Stop: [] } }
    writeFileSync(arq, JSON.stringify(antes, null, 2) + '\n')
    const r = rodar(m, 'tirar')
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(linhas(r.stdout), [arq])
    const depois = JSON.parse(readFileSync(arq, 'utf8'))
    assert.deepEqual(depois, { model: 'isca-modelo', permissions: { deny: ['Read(./isca-deny)'] }, hooks: { Stop: [] } })
    const r2 = rodar(m, 'ler')
    assert.equal(r2.status, 0, r2.stderr)
    assert.equal(r2.stdout.trim(), 'nada')
  } finally {
    rmSync(m.base, { recursive: true, force: true })
  }
})

test('sem a chave em lugar nenhum: ler e tirar saem 0 e "nada"', () => {
  const m = montar()
  try {
    const arq = join(m.projeto, '.claude', 'settings.json')
    const texto = JSON.stringify({ permissions: { deny: ['Read(./x)'] } }, null, 2)
    writeFileSync(arq, texto)
    for (const cmd of ['ler', 'tirar']) {
      const r = rodar(m, cmd)
      assert.equal(r.status, 0, r.stderr)
      assert.equal(r.stdout.trim(), 'nada')
    }
    assert.equal(readFileSync(arq, 'utf8'), texto, 'sem a chave o arquivo nao se regrava')
  } finally {
    rmSync(m.base, { recursive: true, force: true })
  }
})

test('JSON quebrado: tirar sai 2 e nao grava nada, nem nos outros arquivos', () => {
  const m = montar()
  try {
    const bom = join(m.casa, '.claude', 'settings.json'), quebrado = join(m.projeto, '.claude', 'settings.local.json')
    const textoBom = JSON.stringify({ permissions: { [CHAVE]: true } })
    writeFileSync(bom, textoBom)
    writeFileSync(quebrado, '{ "permissions": { ')
    const r = rodar(m, 'tirar')
    assert.equal(r.status, 2, r.stdout + r.stderr)
    assert.ok(r.stderr.includes(quebrado), `o recado cita o arquivo quebrado: ${r.stderr}`)
    assert.equal(readFileSync(bom, 'utf8'), textoBom)
    assert.equal(readFileSync(quebrado, 'utf8'), '{ "permissions": { ')
  } finally {
    rmSync(m.base, { recursive: true, force: true })
  }
})
