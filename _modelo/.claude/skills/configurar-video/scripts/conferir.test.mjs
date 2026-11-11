import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { instalarMotor } from './instalar-motor.mjs'
import { conferir, ITENS } from './conferir.mjs'

const tudoOk = (cmd, args) => {
  if (cmd === 'node') return { status: 0, stdout: 'v22.1.0' }
  if (cmd === 'ffmpeg' && args.includes('-filters')) return { status: 0, stdout: ' .. subtitles V->V Render text subtitles' }
  return { status: 0, stdout: 'Python 3.12.10' }
}

test('itens tem comando de Windows e de Mac pra tudo que nao e script do kit', () => {
  for (const i of ITENS) assert.ok(i.cmd || (i.mac && (i.win || i.soMac)), i.id)
})

test('ffmpeg sem libass conta como faltando', () => {
  const base = join(tmpdir(), 'semespaco')
  const r = conferir({ plat: 'win32', base, executar: (c, a) => c === 'ffmpeg' ? { status: 0, stdout: 'sem o filtro' } : tudoOk(c, a), existe: () => true })
  assert.equal(r.itens.find(i => i.id === 'ffmpeg').ok, false)
  // 5.54 (B2): o programa responde, so que sem o filtro; reabrir o app nao conserta
  assert.equal(r.itens.find(i => i.id === 'ffmpeg').estado, 'falta')
})

// piso do Node 22 (5.12), igual ao /setup: o video-produto quebra no comeco do 20
test('node abaixo de 22 conta como faltando, 22.0.0 passa', () => {
  const base = join(tmpdir(), 'v')
  const com = (v) => conferir({ plat: 'win32', base, executar: (c, a) => c === 'node' ? { status: 0, stdout: v } : tudoOk(c, a), existe: () => true })
  assert.equal(com('v20.20.2').itens.find(i => i.id === 'node').ok, false)
  // 5.54 (B2): Node velho respondendo continua falta, mesmo com o programa no lugar conhecido
  assert.equal(com('v20.20.2').itens.find(i => i.id === 'node').estado, 'falta')
  assert.equal(com('v22.0.0').itens.find(i => i.id === 'node').ok, true)
  assert.equal(com('v22.0.0').itens.find(i => i.id === 'node').estado, 'ok')
})

// 5.54 (B2, achado 18): o winget instala, mas a sessao aberta antes nao ve o programa no PATH.
// Programa que nao foi achado (erro de spawn) e esta no lugar de instalacao conhecido sai
// "instalado, falta reabrir o app", e a skill pede pra sair de vez do app em vez de instalar de novo.
const naoAchou = () => ({ status: null, stdout: '', error: Object.assign(new Error('spawnSync ENOENT'), { code: 'ENOENT' }) })
const semNoPath = (...ids) => (c, a) => {
  if (ids.includes('node') && c === 'node') return naoAchou()
  if (ids.includes('python') && c === 'py') return naoAchou()
  if (ids.includes('ffmpeg') && c === 'ffmpeg') return naoAchou()
  return tudoOk(c, a)
}
// caminho montado pelo win32.join a partir da letra solta: o Gate 6 barra letra de drive com barra
// chumbada dentro do _modelo, e o dado de teste nao precisa dela
const DRIVE = 'C:'
const LOCAL = win32.join(DRIVE, 'Users', 'Aluno', 'AppData', 'Local')
const NO_DISCO_WIN = {
  node: win32.join(DRIVE, 'Program Files', 'nodejs', 'node.exe'),
  python: win32.join(LOCAL, 'Programs', 'Python', 'Python312', 'python.exe'),
  ffmpeg: win32.join(LOCAL, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
}

test('Windows: programa fora do PATH mas no lugar do winget sai instalado, falta reabrir o app', () => {
  const base = join(tmpdir(), 'v')
  const env = { LOCALAPPDATA: LOCAL }
  for (const id of ['node', 'python', 'ffmpeg']) {
    const noDisco = conferir({ plat: 'win32', base, env, executar: semNoPath(id), existe: p => p === NO_DISCO_WIN[id] }).itens.find(i => i.id === id)
    assert.equal(noDisco.ok, false, id)
    assert.equal(noDisco.estado, 'reabrir', id)
    // 5.56 (A): neutro, vale no VS Code e no app
    assert.match(noDisco.detalhe, /instalado, falta reabrir o programa/, id)
    // canario do outro lado: sem o arquivo no disco o mesmo erro e falta
    const fora = conferir({ plat: 'win32', base, env, executar: semNoPath(id), existe: () => false }).itens.find(i => i.id === id)
    assert.equal(fora.ok, false, id)
    assert.equal(fora.estado, 'falta', id)
  }
})

test('Mac: programa fora do PATH mas no /opt/homebrew/bin ou no /usr/local/bin sai falta reabrir', () => {
  const base = join(tmpdir(), 'v')
  // nome de cada programa no PATH do Mac (o python e o python3.12 que o brew instala)
  const NOME_MAC = { node: 'node', python: 'python3.12', ffmpeg: 'ffmpeg' }
  for (const id of ['node', 'python', 'ffmpeg']) {
    const semEle = (c, a) => c === NOME_MAC[id] ? naoAchou() : tudoOk(c, a)
    for (const pasta of ['/opt/homebrew/bin', '/usr/local/bin']) {
      const r = conferir({ plat: 'darwin', base, executar: semEle, existe: p => p === pasta + '/' + NOME_MAC[id] })
      assert.equal(r.itens.find(i => i.id === id).estado, 'reabrir', id + ' em ' + pasta)
    }
    // canario do outro lado: sem o arquivo no disco o mesmo erro e falta
    assert.equal(conferir({ plat: 'darwin', base, executar: semEle, existe: () => false }).itens.find(i => i.id === id).estado, 'falta', id)
  }
})

test('programa que roda e sai diferente de 0 continua falta, mesmo no lugar conhecido', () => {
  const base = join(tmpdir(), 'v')
  const env = { LOCALAPPDATA: LOCAL }
  // o lancador py existe, mas sem o 3.12 sai 1: reabrir nao instala o Python
  const semPy312 = (c, a) => c === 'py' ? { status: 1, stdout: '', stderr: 'No suitable Python runtime found' } : tudoOk(c, a)
  const r = conferir({ plat: 'win32', base, env, executar: semPy312, existe: () => true })
  assert.equal(r.itens.find(i => i.id === 'python').estado, 'falta')
})

test('python-libs nunca vira falta reabrir: Python 3.12 no lugar conhecido sem as bibliotecas e falta', () => {
  const base = join(tmpdir(), 'v')
  const env = { LOCALAPPDATA: LOCAL }
  const semLibs = (c, a) => c === 'py' && a.includes('-c') ? { status: 1, stdout: '', stderr: "ModuleNotFoundError: No module named 'numpy'" } : tudoOk(c, a)
  const r = conferir({ plat: 'win32', base, env, executar: semLibs, existe: () => true })
  const libs = r.itens.find(i => i.id === 'python-libs')
  assert.equal(libs.ok, false)
  assert.equal(libs.estado, 'falta')
  // nem com o import dando erro de spawn: o lugar conhecido e do programa, nao das bibliotecas
  const semPy = conferir({ plat: 'win32', base, env, executar: semNoPath('python'), existe: () => true }).itens.find(i => i.id === 'python-libs')
  assert.equal(semPy.estado, 'falta')
})

test('todo item sai com estado ok, falta ou reabrir, e ok bate com o estado', () => {
  const base = join(tmpdir(), 'v')
  const r = conferir({ plat: 'win32', base, executar: tudoOk, existe: () => true })
  assert.ok(r.itens.length > 0)
  for (const i of r.itens) {
    assert.ok(['ok', 'falta', 'reabrir'].includes(i.estado), i.id + ': ' + i.estado)
    assert.equal(i.ok, i.estado === 'ok', i.id)
  }
})

test('pasta com espaco e sinalizada com sugestao sem espaco', () => {
  const base = join(tmpdir(), 'Joao Silva', '_video')
  const r = conferir({ plat: 'win32', base, executar: tudoOk, existe: () => true, env: { SystemDrive: 'X:' } })
  assert.equal(r.pastaComEspaco, true)
  assert.ok(!/\s/.test(r.sugestaoPasta))
})

test('modelo do whisper com 0 bytes conta como faltando', () => {
  const base = join(tmpdir(), 'v')
  const r = conferir({ plat: 'darwin', base, executar: tudoOk, existe: () => true, tamanho: (p) => p.endsWith('.bin') ? 0 : 10 })
  assert.equal(r.itens.find(i => i.id === 'whisper').ok, false)
})

test('instrucao sai na lingua do sistema', () => {
  const base = join(tmpdir(), 'v')
  const r = conferir({ plat: 'darwin', base, executar: () => ({ status: 1, stdout: '' }), existe: () => false })
  assert.match(r.itens.find(i => i.id === 'ffmpeg').instalar, /brew/)
})

test('instalar monta caminho com path.join, sem barra mista', () => {
  const base = join(tmpdir(), 'v')
  const r = conferir({ plat: 'win32', base, executar: tudoOk, existe: () => false, modeloWhisper: 'small' })
  assert.equal(r.itens.find(i => i.id === 'whisper').instalar, 'node ' + join(base, 'motor', 'scripts', 'instalar-whisper.mjs') + ' --modelo small')
})

test('whisper: o comando completo leva o --modelo do maquina.json', () => {
  const base = join(tmpdir(), 'v')
  const r = conferir({ plat: 'win32', base, executar: tudoOk, existe: () => false, modeloWhisper: 'medium' })
  const w = r.itens.find(i => i.id === 'whisper')
  assert.match(w.instalar, /instalar-whisper\.mjs --modelo medium$/)
  assert.match(w.detalhe, /medium/)
})

test('whisper sem maquina.json manda rodar o medir-maquina antes, em vez de assumir small', () => {
  const base = join(tmpdir(), 'v-sem-maquina-' + process.pid)
  const r = conferir({ plat: 'win32', base, executar: tudoOk, existe: () => true })
  const w = r.itens.find(i => i.id === 'whisper')
  assert.equal(w.ok, false)
  assert.match(w.detalhe, /rode o medir-maquina antes/)
  assert.match(w.instalar, /medir-maquina\.mjs/)
  assert.doesNotMatch(w.instalar, /small/)
})

test('Mac: python-libs cria o ambiente com python3.12 e a versao e conferida pelo python3.12', () => {
  const base = join(tmpdir(), 'v')
  const chamadas = []
  const r = conferir({ plat: 'darwin', base, executar: (cmd, args) => { chamadas.push([cmd, ...args].join(' ')); return tudoOk(cmd, args) }, existe: () => false })
  const libs = r.itens.find(i => i.id === 'python-libs').instalar
  assert.ok(libs.startsWith('python3.12 -m venv ' + join(base, 'py') + ' && ' + join(base, 'py', 'bin', 'pip') + ' install '), libs)
  assert.ok(chamadas.includes('python3.12 --version'), chamadas.join(' | '))
})

test('motor: remotion no node_modules so conta com a marca de npm ci completo do lock atual', () => {
  const base = mkdtempSync(join(tmpdir(), 'conf-motor-'))
  try {
    const motor = join(base, 'motor')
    mkdirSync(join(motor, 'node_modules', 'remotion'), { recursive: true })
    writeFileSync(join(motor, 'package-lock.json'), 'lock1')
    const item = () => conferir({ plat: 'win32', base, executar: tudoOk }).itens.find(i => i.id === 'motor')
    assert.equal(item().ok, false)
    instalarMotor({ motor, plat: 'darwin', executar: () => ({ status: 0 }) })
    assert.equal(item().ok, true)
    writeFileSync(join(motor, 'package-lock.json'), 'lock2')
    assert.equal(item().ok, false)
    assert.match(item().instalar, /instalar-motor\.mjs/)
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('Mac: o Homebrew vem primeiro, conferido por command -v brew, com o comando oficial', () => {
  const base = join(tmpdir(), 'v')
  const semBrew = (cmd, args) => cmd === '/bin/sh' && args.join(' ').includes('command -v brew') ? { status: 1, stdout: '' } : tudoOk(cmd, args)
  const r = conferir({ plat: 'darwin', base, executar: semBrew, existe: () => false })
  const b = r.itens[0]
  assert.equal(b.id, 'brew')
  assert.equal(b.ok, false)
  assert.equal(b.instalar, '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')
  assert.match(b.detalhe, /senha do Mac/)
  assert.match(b.detalhe, /whisper/)
  const comBrew = conferir({ plat: 'darwin', base, executar: (cmd, args) => cmd === '/bin/sh' ? { status: 0, stdout: '/opt/homebrew/bin/brew' } : tudoOk(cmd, args), existe: () => false })
  assert.equal(comBrew.itens[0].ok, true)
  const win = conferir({ plat: 'win32', base, executar: tudoOk, existe: () => false })
  assert.ok(!win.itens.some(i => i.id === 'brew'))
})

test('a biblioteca de midia nao e item da instalacao: musica e efeito sao do aluno', () => {
  const r = conferir({ plat: 'win32', base: join(tmpdir(), 'v'), executar: tudoOk, existe: () => false })
  assert.ok(r.itens.length > 0)
  assert.ok(!r.itens.some(i => i.id === 'midia'))
  assert.ok(!r.itens.some(i => /baixar-midia/.test(i.instalar)))
})

test('whisper: modelo baixado pela metade (tamanho diferente do esperado) nao conta e diz pra apagar', () => {
  const base = join(tmpdir(), 'v')
  const com = (bytes, modelo) => conferir({ plat: 'win32', base, executar: tudoOk, existe: () => true, modeloWhisper: modelo, tamanho: (p) => p.endsWith('.bin') ? bytes : 10 }).itens.find(i => i.id === 'whisper')
  const truncado = com(487601966, 'small')
  assert.equal(truncado.ok, false)
  assert.match(truncado.detalhe, /apague o ggml-small\.bin e rode de novo/)
  assert.equal(com(487601967, 'small').ok, true)
  assert.equal(com(1533763059, 'medium').ok, true)
  assert.equal(com(487601967, 'medium').ok, false)
})

// F.5 (5.7): o winget sem as flags do setup para perguntando do acordo da fonte num shell sem entrada.
test('todo comando winget dos itens leva as 4 flags do setup', () => {
  const flags = ['--source winget', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity']
  const comWinget = ITENS.filter(i => (i.win ?? '').startsWith('winget'))
  assert.ok(comWinget.length >= 3, `so ${comWinget.length} itens com winget`)
  for (const i of comWinget) for (const f of flags) assert.ok(i.win.includes(f), `${i.id} sem ${f}`)
})

// 5.14 item 4: Windows ARM e Linux nao tem o limpador pronto, e o item barrava o video pra sempre.
test('deep-filter: computador sem versao pronta (Windows ARM) conta como ok e fala do afftdn', () => {
  const base = join(tmpdir(), 'v')
  const item = (arch) => conferir({ plat: 'win32', arch, base, executar: tudoOk, existe: p => !p.includes('deep-filter') }).itens.find(i => i.id === 'deep-filter')
  // canario: onde ha versao pronta, o programa ausente ainda conta como faltando
  assert.equal(item('x64').ok, false)
  const arm = item('arm64')
  assert.equal(arm.ok, true)
  assert.match(arm.detalhe, /afftdn/)
})
