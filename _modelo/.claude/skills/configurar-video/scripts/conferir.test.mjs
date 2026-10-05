import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
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
