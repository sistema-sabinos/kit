import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { conferirFinal, escolherBruto } from './conferir-final.mjs'

function brutoComLixo(nomes, props = '{}') {
  const d = mkdtempSync(join(tmpdir(), 'bruto-'))
  const dir = join(d, 'bruto')
  mkdirSync(dir)
  for (const n of nomes) writeFileSync(join(dir, n), 'x')
  mkdirSync(join(dir, 'pasta.mp4'))
  writeFileSync(join(d, 'props.json'), props)
  return { d, dir, props: join(d, 'props.json'), limpar: () => rmSync(d, { recursive: true, force: true }) }
}

test('escolherBruto ignora .DS_Store, Thumbs.db, dotfile e pasta; um video so, sem aviso', () => {
  const m = brutoComLixo(['.DS_Store', 'Thumbs.db', '._lixo.mp4', 'A.MOV'])
  try {
    assert.deepEqual(escolherBruto(m.dir, m.props), { escolhido: 'A.MOV' })
  } finally { m.limpar() }
})

test('escolherBruto com dois videos prefere o que o props cita', () => {
  const m = brutoComLixo(['a.mp4', 'b.mp4', '.DS_Store'], '{"bruto":"b.mp4"}')
  try {
    assert.deepEqual(escolherBruto(m.dir, m.props), { escolhido: 'b.mp4' })
  } finally { m.limpar() }
})

test('escolherBruto com dois videos e props mudo: o primeiro, com aviso citando o escolhido', () => {
  const m = brutoComLixo(['b.mp4', 'a.webm'])
  try {
    const r = escolherBruto(m.dir, m.props)
    assert.equal(r.escolhido, 'a.webm')
    assert.match(r.aviso, /a\.webm/)
  } finally { m.limpar() }
})

test('escolherBruto sem video nenhum: nada escolhido', () => {
  const m = brutoComLixo(['Thumbs.db', 'nota.txt'])
  try {
    assert.equal(escolherBruto(m.dir, m.props).escolhido, null)
  } finally { m.limpar() }
})

function montar() {
  const d = mkdtempSync(join(tmpdir(), 'conf-'))
  const peca = join(d, 'producao', 'p')
  mkdirSync(join(peca, 'final'), { recursive: true })
  mkdirSync(join(peca, 'public'), { recursive: true })
  writeFileSync(join(peca, 'final', 'p.mp4'), 'x')
  writeFileSync(join(peca, 'props.json'), '{}')
  return { d, peca, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

// resposta por nome de script
function falso(resp) {
  const chamadas = []
  const executar = (cmd, args) => {
    chamadas.push(args)
    const script = args.find((a) => String(a).endsWith('.py'))
    const nome = String(script).split(/[/\\]/).pop()
    return resp[nome] ?? { status: 0, stdout: 'ok\n', stderr: '' }
  }
  return { executar, chamadas }
}

test('os tres gates passam no VideoV2: ok e roda os tres', () => {
  const m = montar()
  try {
    const f = falso({})
    const r = conferirFinal({ slug: 'p', tipo: 'videov2', raiz: m.d, base: join(m.d, 'v'), executar: f.executar })
    assert.equal(r.ok, true)
    assert.equal(f.chamadas.length, 3)
    const ver = f.chamadas.find((a) => a.some((x) => String(x).endsWith('verificar-video.py')))
    assert.ok(ver.includes('--public-dir'))
  } finally { m.limpar() }
})

test('camadas nao roda o verificar-video', () => {
  const m = montar()
  try {
    const f = falso({})
    const r = conferirFinal({ slug: 'p', tipo: 'camadas', raiz: m.d, base: join(m.d, 'v'), executar: f.executar })
    assert.equal(r.ok, true)
    assert.equal(f.chamadas.length, 2)
  } finally { m.limpar() }
})

test('um gate que reprova derruba tudo e traz o nome e o conserto', () => {
  const m = montar()
  try {
    const f = falso({ 'loudness.py': { status: 1, stdout: 'FALHOU: volume baixo\n  conserto em 1 passe: rode X\n', stderr: '' } })
    const r = conferirFinal({ slug: 'p', tipo: 'camadas', raiz: m.d, base: join(m.d, 'v'), executar: f.executar })
    assert.equal(r.ok, false)
    assert.match(r.texto, /loudness/)
    assert.match(r.texto, /conserto em 1 passe/)
  } finally { m.limpar() }
})

test('sem final: erro dizendo pra renderizar', () => {
  const m = montar()
  try {
    rmSync(join(m.peca, 'final', 'p.mp4'))
    assert.throws(() => conferirFinal({ slug: 'p', tipo: 'camadas', raiz: m.d, base: join(m.d, 'v'), executar: falso({}).executar }), /render/)
  } finally { m.limpar() }
})

test('escolherBruto casa pelo nome exato do arquivo citado no props, nunca por pedaco do nome', () => {
  const m = brutoComLixo(['a.mp4', 'ba.mp4'], '{"bruto":"producao/x/bruto/ba.mp4"}')
  try {
    assert.deepEqual(escolherBruto(m.dir, m.props), { escolhido: 'ba.mp4' })
    writeFileSync(m.props, '{"camadas":[{"video":"a.mp4"}]}')
    assert.deepEqual(escolherBruto(m.dir, m.props), { escolhido: 'a.mp4' })
  } finally { m.limpar() }
})
