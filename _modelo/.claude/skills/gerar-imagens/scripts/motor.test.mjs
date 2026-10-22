// Testes do motor. Rodar: node --test motor.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { escolherDegrau, lerStatusCodex, detectarCodex, rodarComPrazo } from './motor.mjs'

test('Codex logado pela conta ChatGPT ganha, mesmo com chave do Gemini', () => {
  assert.equal(escolherDegrau({ codex: { logado: true }, env: { GEMINI_API_KEY: 'x' } }).degrau, 'codex')
})

test('o motivo do Codex avisa que credito avulso comprado pode ser gasto', () => {
  const r = escolherDegrau({ codex: { logado: true }, env: {} })
  assert.match(r.motivo, /cota do plano/)
  assert.match(r.motivo, /creditos avulsos/)
})

test('sem Codex e com chave do Gemini, Gemini', () => {
  assert.equal(escolherDegrau({ codex: { logado: false }, env: { GEMINI_API_KEY: 'x' } }).degrau, 'gemini')
})

test('sem nada, zero IA, e o motivo diz que custa zero', () => {
  const r = escolherDegrau({ codex: { logado: false }, env: {} })
  assert.equal(r.degrau, 'zero-ia')
  assert.match(r.motivo, /custo zero/)
})

test('lerStatusCodex: so conta o login pela conta ChatGPT', () => {
  assert.deepEqual(lerStatusCodex({ status: 0, stdout: '', stderr: 'Logged in using ChatGPT\n' }), { instalado: true, logado: true })
  assert.deepEqual(lerStatusCodex({ status: 0, stdout: 'Logged in using an API key - sk-...\n', stderr: '' }), { instalado: true, logado: false })
  assert.deepEqual(lerStatusCodex({ status: 1, stdout: 'Not logged in\n', stderr: '' }), { instalado: true, logado: false })
})

test('lerStatusCodex: comando que nao existe', () => {
  assert.deepEqual(lerStatusCodex({ error: new Error('ENOENT') }), { instalado: false, logado: false })
  assert.deepEqual(lerStatusCodex({ status: 1, stdout: '', stderr: "'codex' is not recognized as an internal or external command" }), { instalado: false, logado: false })
  assert.deepEqual(lerStatusCodex({ status: 1, stdout: '', stderr: "'codex' n" + String.fromCharCode(0xe3) + "o " + String.fromCharCode(0xe9) + " reconhecido como um comando interno" }), { instalado: false, logado: false })
})

// 5.25, tarefa 3b: no Windows o codex sobe pelo spawn com shell e cronometro proprio (o prazo do
// spawnSync mataria so o cmd.exe e deixava o codex orfao); fora dele, o spawnSync de sempre.
// O filho falso imita o spawn assincrono: fecha sozinho com a saida dada, ou so quando morto.
function filhoFalso({ saida = null } = {}) {
  const f = new EventEmitter()
  f.pid = 4242
  f.stdout = new EventEmitter()
  f.stderr = new EventEmitter()
  f.stdin = { on() {}, end: (t) => { f.entrada = t; if (saida != null) setImmediate(() => { f.stdout.emit('data', saida); f.emit('close', 0) }) } }
  f.kill = () => { setImmediate(() => f.emit('close', null)) }
  return f
}

test('detectarCodex chama "codex login status"; no Windows sobe pelo spawn com shell, fora dele pelo spawnSync sem shell', async () => {
  const subidos = []
  const subir = (cmd, args, op) => { subidos.push([cmd, args, op.shell]); return filhoFalso({ saida: 'Logged in using ChatGPT' }) }
  const nunca = () => { throw new Error('nao devia chamar o spawnSync no Windows') }
  const win = await detectarCodex((c, a, op) => rodarComPrazo(c, a, op, { plataforma: 'win32', subir, executarSync: nunca }))
  assert.deepEqual(subidos, [['codex', ['login', 'status'], true]])
  assert.deepEqual(win, { instalado: true, logado: true })
  const vistos = []
  const executarSync = (cmd, args, op) => { vistos.push([cmd, args, op.shell, op.timeout]); return { status: 0, stdout: 'Logged in using ChatGPT', stderr: '' } }
  const fora = await detectarCodex((c, a, op) => rodarComPrazo(c, a, op, { plataforma: 'linux', executarSync, subir: () => { throw new Error('nao devia subir pelo spawn fora do Windows') } }))
  assert.deepEqual(vistos, [['codex', ['login', 'status'], undefined, 20000]])
  assert.deepEqual(fora, { instalado: true, logado: true })
})

test('estouro do prazo no Windows derruba a arvore do processo e o erro chega com recado', async () => {
  const derrubados = []
  const filho = filhoFalso()
  const r = await rodarComPrazo('codex', ['exec', '-'], { input: 'prompt', timeout: 30 }, { plataforma: 'win32', subir: () => filho, encerrar: pid => derrubados.push(pid) })
  assert.equal(filho.entrada, 'prompt', 'canario: o prompt foi pro stdin')
  assert.deepEqual(derrubados, [4242])
  assert.equal(r.error?.code, 'ETIMEDOUT')
  assert.match(r.error.message, /^o codex passou de 0 s sem terminar e foi encerrado, junto com tudo que ele tinha aberto$/)
  assert.equal(r.status, null)
})

// revisao final do Codex na 5.25: taskkill que falha e neto segurando o cano nao penduram a promessa
test('estouro com taskkill falhando: o exit do shell basta pra voltar com o recado', async () => {
  const filho = filhoFalso()
  filho.kill = () => { setImmediate(() => filho.emit('exit', null)) }
  const soltos = []
  filho.stdout.destroy = () => soltos.push('stdout')
  filho.stderr.destroy = () => soltos.push('stderr')
  const r = await Promise.race([
    rodarComPrazo('codex', ['exec', '-'], { timeout: 10 }, { plataforma: 'win32', subir: () => filho, encerrar: () => { throw new Error('taskkill falhou') } }),
    new Promise(ok => setTimeout(() => ok('pendurou'), 500)),
  ])
  assert.notEqual(r, 'pendurou')
  assert.equal(r.error?.code, 'ETIMEDOUT')
  assert.deepEqual(soltos, ['stdout', 'stderr'])
})

test('maxBuffer vale no Windows: saida maior que o teto encerra com ENOBUFS', async () => {
  const derrubados = []
  const filho = filhoFalso()
  filho.stdin.end = () => setImmediate(() => filho.stdout.emit('data', 'x'.repeat(100)))
  const r = await rodarComPrazo('codex', ['exec', '-'], { timeout: 5000, maxBuffer: 4 }, { plataforma: 'win32', subir: () => filho, encerrar: pid => derrubados.push(pid) })
  assert.equal(r.error?.code, 'ENOBUFS')
  assert.deepEqual(derrubados, [4242])
  assert.ok(r.stdout.length <= 4, `stdout com ${r.stdout.length}`)
})

// segunda volta da comum do Codex: o teto conta bytes (acento vale 2) e, depois do exit, nada de taskkill
test('maxBuffer conta bytes e nao derruba filho que ja saiu', async () => {
  const derrubados = []
  const acento = String.fromCharCode(0xe9).repeat(4)
  const um = filhoFalso()
  um.stdin.end = () => setImmediate(() => { um.stdout.emit('data', acento); um.emit('close', 0) })
  const r1 = await rodarComPrazo('codex', ['exec', '-'], { timeout: 5000, maxBuffer: 4 }, { plataforma: 'win32', subir: () => um, encerrar: pid => derrubados.push(pid) })
  assert.equal(r1.error?.code, 'ENOBUFS', 'quatro letras com acento sao 8 bytes')
  const dois = filhoFalso()
  dois.kill = () => { throw new Error('nao devia matar o filho que ja saiu') }
  dois.stdin.end = () => setImmediate(() => { dois.emit('exit', 0); dois.stdout.emit('data', '12345') })
  derrubados.length = 0
  const r2 = await rodarComPrazo('codex', ['exec', '-'], { timeout: 5000, maxBuffer: 4 }, { plataforma: 'win32', subir: () => dois, encerrar: pid => derrubados.push(pid) })
  assert.equal(r2.error?.code, 'ENOBUFS')
  assert.deepEqual(derrubados, [])
})

// revisao interna do fechamento da 5.25: o filho que ja saiu (exit) com o cano ainda aberto por
// um neto nao pode levar taskkill no pid, que o Windows pode ter dado a outro processo
test('prazo estoura depois do exit: nada e derrubado e volta a saida do filho', async () => {
  const derrubados = []
  const filho = filhoFalso()
  filho.kill = () => { throw new Error('nao devia matar o filho que ja saiu') }
  // revisao comum do Codex: o cano que o neto segura prende o node; o prazo solta os dois
  const soltos = []
  filho.stdout.destroy = () => soltos.push('stdout')
  filho.stderr.destroy = () => soltos.push('stderr')
  const r = await rodarComPrazo('codex', ['exec', '-'], { input: 'prompt', timeout: 30 }, { plataforma: 'win32', subir: () => { setImmediate(() => filho.emit('exit', 0)); return filho }, encerrar: pid => derrubados.push(pid) })
  assert.equal(filho.entrada, 'prompt', 'canario: o filho subiu e recebeu o prompt')
  assert.deepEqual(derrubados, [])
  assert.deepEqual(soltos, ['stdout', 'stderr'])
  assert.equal(r.status, 0)
  assert.equal(r.error, undefined)
})

test('motor.mjs como CLI acha o codex logado e escolhe o degrau codex', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motor-cli-'))
  try {
    if (process.platform === 'win32') writeFileSync(join(dir, 'codex.cmd'), '@echo Logged in using ChatGPT\r\n')
    else { writeFileSync(join(dir, 'codex'), '#!/bin/sh\necho Logged in using ChatGPT\n'); chmodSync(join(dir, 'codex'), 0o755) }
    const caminho = `${dir}${delimiter}${process.env.PATH ?? process.env.Path ?? ''}`
    const env = { ...process.env, PATH: caminho, Path: caminho }
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('./motor.mjs', import.meta.url))], { encoding: 'utf8', env, timeout: 60000 })
    assert.ok(r.stdout.length > 0, `saida veio vazia: ${r.stderr}`)
    const j = JSON.parse(r.stdout)
    assert.deepEqual(j.codex, { instalado: true, logado: true }, r.stdout)
    assert.equal(j.degrau, 'codex')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
