import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { conferirDensidade, eventos, LIMITES } from './densidade.mjs'
import { render } from './render.mjs'

// fala de mentira: uma palavra a cada 0,5 s, "p0", "p1"... ate a duracao
const fala = (dur) => Array.from({ length: Math.floor(dur * 2) }, (_, i) => ({ text: `p${i}`, startMs: i * 500, endMs: i * 500 + 400 }))

// 30 s com troca de plano a cada 2,5 s, chave a cada 5 s e efeito em cada chave: passa com folga
function propsBom() {
  const cortes = Array.from({ length: 11 }, (_, i) => 2.5 * (i + 1))
  const chaves = Array.from({ length: 6 }, (_, i) => ({ chave: 'X', deSeg: 5 * i + 1, ateSeg: 5 * i + 3.5, topo: 400 }))
  return {
    pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', duracaoSeg: 30,
    cortesSeg: cortes, chaves, sfx: chaves.map((c) => ({ arquivo: 'sfx-mix/a.wav', seg: c.deSeg })),
  }
}

test('P3: canario, o edicao bom passa e as medidas nao vem vazias', () => {
  const r = conferirDensidade(propsBom(), fala(30))
  assert.equal(r.ok, true, r.falhas.join(' | '))
  assert.ok(r.medidas.eventos > 10, 'contou eventos de verdade')
  assert.ok(r.medidas.vaoSeg > 0 && r.medidas.vaoSeg <= LIMITES.vaoMaxSeg)
})

test('P3: vao longo reprova com o segundo e o trecho falado', () => {
  const p = propsBom()
  // tira tudo que acontece entre 12 e 20 s
  p.cortesSeg = p.cortesSeg.filter((c) => c < 12 || c > 20)
  p.chaves = p.chaves.filter((c) => c.deSeg < 12 || c.deSeg > 20)
  p.sfx = p.sfx.filter((s) => s.seg < 12 || s.seg > 20)
  const r = conferirDensidade(p, fala(30))
  assert.equal(r.ok, false)
  const msg = r.falhas.join(' ')
  assert.ok(msg.length > 0, 'a falha nao veio vazia')
  assert.match(msg, /de 11,0 a 21,0 s/)
  assert.match(msg, /p22 p23/) // o que se fala em 11 a 11,5 s
})

test('P3: corte sem troca de escala nao conta como novidade', () => {
  const p = { duracaoSeg: 10, abertura: null, cortesSeg: [2, 4, 6], escalasSeg: [1, 1, 1.25, 1.25] }
  assert.deepEqual(eventos(p).map((e) => [e.seg, e.tipo]), [[4, 'zoom']])
})

test('P3: efeito sonoro sozinho nao quebra o trecho parado, flash no mesmo segundo quebra', () => {
  const lim = { vaoMaxSeg: 5, porDezSegMin: 0, coberturaMin: 0 }
  const tempos = [2, 4, 6, 8, 10, 12, 14, 16, 18]
  // canario: o mesmo ritmo em flash passa, entao a conta enxerga evento nesses segundos
  const visual = { duracaoSeg: 20, abertura: null, flashes: tempos.map((seg) => ({ seg })) }
  const rv = conferirDensidade(visual, fala(20), lim)
  assert.equal(rv.ok, true, rv.falhas.join(' | '))
  assert.equal(rv.medidas.eventos, 9)
  const som = { duracaoSeg: 20, abertura: null, sfx: tempos.map((seg) => ({ arquivo: 'sfx-mix/a.wav', seg })) }
  assert.deepEqual(eventos(som), [])
  const r = conferirDensidade(som, fala(20), lim)
  assert.equal(r.ok, false)
  assert.ok(r.falhas.length > 0, 'a falha nao veio vazia')
  assert.match(r.falhas[0], /de 0,0 a 20,0 s/)
  assert.match(r.falhas[0], /efeito sonoro sozinho nao conta/)
})

test('P3: a entrada da onda conta e a onda parada nao segura o vao', () => {
  const lim = { vaoMaxSeg: 5, porDezSegMin: 0, coberturaMin: 0 }
  // canario: so a onda entrando aos 4 s ja aparece como evento
  const p = { duracaoSeg: 20, abertura: null, flashes: [{ seg: 8 }, { seg: 12 }, { seg: 16 }], ondas: [{ deSeg: 4, ateSeg: 7, valores: [0.5] }] }
  assert.deepEqual(eventos(p).map((e) => [e.seg, e.tipo]), [[4, 'onda'], [8, 'flash'], [12, 'flash'], [16, 'flash']])
  const ok = conferirDensidade(p, fala(20), lim)
  assert.equal(ok.ok, true, ok.falhas.join(' | '))
  // sem a entrada da onda, o vao de 0 a 8 s passa do limite: a entrada e que segurou
  const sem = conferirDensidade({ ...p, ondas: [] }, fala(20), lim)
  assert.equal(sem.ok, false)
  assert.match(sem.falhas[0], /de 0,0 a 8,0 s/)
  // onda ligada de 2 a 18 s num video sem mais nada: entra aos 2 s e o resto e trecho parado
  const parada = { duracaoSeg: 20, abertura: null, ondas: [{ deSeg: 2, ateSeg: 18, valores: [0.5] }] }
  const r = conferirDensidade(parada, fala(20), lim)
  assert.equal(r.ok, false)
  assert.ok(r.falhas.length > 0, 'a falha nao veio vazia')
  assert.match(r.falhas[0], /de 2,0 a 20,0 s/)
})

test('P3: clipe de video por cima nao e vao, imagem parada e', () => {
  const p = { duracaoSeg: 20, abertura: null, cortesSeg: [], chaves: [], sfx: [], segmentos: [{ tipo: 'video', deSeg: 2, ateSeg: 18, cheia: true }] }
  const lim = { vaoMaxSeg: 5, porDezSegMin: 0, coberturaMin: 0 }
  assert.equal(conferirDensidade(p, fala(20), lim).ok, true)
  p.segmentos[0].tipo = 'imagem'
  const r = conferirDensidade(p, fala(20), lim)
  assert.equal(r.ok, false)
  assert.match(r.falhas[0], /de 2,0 a 18,0 s/)
})

test('P3: poucas novidades e pouca cobertura reprovam com o numero', () => {
  const p = { duracaoSeg: 30, cortesSeg: Array.from({ length: 9 }, (_, i) => 3 * (i + 1)) }
  const r = conferirDensidade(p, fala(30))
  assert.equal(r.ok, false)
  assert.ok(r.falhas.some((f) => /a cada 10 s/.test(f)))
  assert.ok(r.falhas.some((f) => /0% do video/.test(f)))
})

// render de verdade com executar falso: a conferencia vem antes de qualquer chamada
function cenario(props) {
  const d = mkdtempSync(join(tmpdir(), 'densidade-'))
  const raiz = join(d, 'raiz'), base = join(d, 'video'), peca = join(raiz, 'producao', 'peca')
  mkdirSync(join(base, 'midia'), { recursive: true })
  mkdirSync(join(base, 'motor'), { recursive: true })
  mkdirSync(join(peca, 'public'), { recursive: true })
  writeFileSync(join(peca, 'props.json'), JSON.stringify(props))
  writeFileSync(join(peca, 'public', 'voz.alinhado.json'), JSON.stringify(fala(props.duracaoSeg ?? 30)))
  const chamadas = []
  const executar = (cmd, args) => {
    chamadas.push(args)
    const saida = args.find((a) => String(a).endsWith('.mp4'))
    if (saida) writeFileSync(saida, 'video')
    return { status: 0, stdout: '', stderr: '' }
  }
  const op = (extra = {}) => ({ slug: 'peca', tipo: 'videov2', raiz, base, pularPronto: true, executar, ...extra })
  return { op, chamadas, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

test('P3: render para antes de renderizar quando a densidade reprova', () => {
  const p = propsBom(); p.cortesSeg = []; p.chaves = []; p.sfx = []
  const c = cenario(p)
  try {
    assert.throws(() => render(c.op()), (e) => e.codigo === 1 && /parada demais/.test(e.message) && /nada novo/.test(e.message))
    assert.equal(c.chamadas.length, 0)
  } finally { c.limpar() }
})

test('P3: render segue com a densidade boa, e com --sem-densidade mesmo parado', () => {
  const c = cenario(propsBom())
  try {
    render(c.op())
    assert.equal(c.chamadas.length, 1)
  } finally { c.limpar() }
  const p = propsBom(); p.cortesSeg = []; p.chaves = []; p.sfx = []
  const c2 = cenario(p)
  try {
    render(c2.op({ semDensidade: true }))
    assert.equal(c2.chamadas.length, 1)
  } finally { c2.limpar() }
})
