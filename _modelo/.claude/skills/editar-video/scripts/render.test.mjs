import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gerarIndiceVideos, idDaComposicao, render } from './render.mjs'
import { hashPasta } from '../../configurar-video/scripts/lib/pasta-video.mjs'

test('id da composicao so com letras, numeros e hifen', () => {
  assert.equal(idDaComposicao('2026-10-04-como_escolher fornecedor'), 'Camadas-2026-10-04-comoescolherfornecedor')
})

test('indice importa cada video e exporta a lista', () => {
  const t = gerarIndiceVideos(['b-video', 'a-video'])
  assert.match(t, /import \* as v0 from '\.\/a-video'/)
  assert.match(t, /import \* as v1 from '\.\/b-video'/)
  assert.match(t, /id: 'Camadas-a-video'/)
  assert.equal(gerarIndiceVideos([]).includes('export const lista'), true)
})

// Monta raiz, _video e um "motor do kit" de mentira, com pronto.json batendo.
function cenario({ pronto = true } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'render-'))
  const raiz = join(d, 'raiz')
  const base = join(d, 'video')
  const motorKit = join(d, 'kit-motor')
  mkdirSync(join(motorKit, 'scripts'), { recursive: true })
  writeFileSync(join(motorKit, 'scripts', 'mix-final.py'), '# falso\n')
  mkdirSync(join(base, 'motor', 'src', 'videos'), { recursive: true })
  mkdirSync(join(base, 'midia', 'biblioteca', 'musica'), { recursive: true })
  writeFileSync(join(base, 'midia', 'biblioteca', 'musica', 'faixa.mp3'), 'musica')
  if (pronto) writeFileSync(join(base, 'pronto.json'), JSON.stringify({ versaoMotor: hashPasta(motorKit) }))
  const peca = join(raiz, 'producao', 'peca-teste')
  mkdirSync(peca, { recursive: true })
  return { d, raiz, base, motorKit, peca, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

const ehMix = (args) => args.some((a) => String(a).endsWith('mix-final.py'))

// executar falso: registra chamadas; o "render" cria a saida pedida (a menos que criar=false).
// No mix, a saida e o argumento 3 depois do script.
function falso({ criar = true, passado = false } = {}) {
  const chamadas = []
  const executar = (cmd, args, op = {}) => {
    chamadas.push({ cmd, args, op })
    if (ehMix(args)) {
      const i = args.findIndex((a) => String(a).endsWith('mix-final.py'))
      writeFileSync(args[i + 3], 'mixado')
      return { status: 0, stdout: '', stderr: '' }
    }
    const saida = args.find((a) => String(a).endsWith('.mp4'))
    if (criar && saida) {
      writeFileSync(saida, 'video')
      if (passado) { const t = new Date(Date.now() - 3600 * 1000); utimesSync(saida, t, t) }
    }
    return { status: 0, stdout: '', stderr: '' }
  }
  return { executar, chamadas }
}

const base = (c, extra = {}) => ({ slug: 'peca-teste', tipo: 'videov2', raiz: c.raiz, base: c.base, motorKit: c.motorKit, ...extra })

test('pronto.json de motor diferente sai 3 mandando rodar configurar-video', () => {
  const c = cenario({ pronto: false })
  try {
    writeFileSync(join(c.base, 'pronto.json'), JSON.stringify({ versaoMotor: 'outro' }))
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso()
    assert.throws(
      () => render(base(c, { executar: f.executar })),
      (e) => e.codigo === 3 && /configurar-video/.test(e.message),
    )
    assert.equal(f.chamadas.length, 0)
  } finally { c.limpar() }
})

test('executar falso que nao cria a saida: erro "render falhou" e nada mixado', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso({ criar: false })
    assert.throws(
      () => render(base(c, { musica: 'biblioteca/musica/faixa.mp3', executar: f.executar })),
      (e) => e.codigo === 1 && /render falhou/.test(e.message),
    )
    assert.equal(f.chamadas.some((x) => ehMix(x.args)), false)
    assert.equal(existsSync(join(c.peca, 'final', 'peca-teste.mp4')), false)
  } finally { c.limpar() }
})

test('saida velha de outra rodada (mtime no passado) tambem e render falho, sem mix', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    mkdirSync(join(c.base, 'motor', 'out'), { recursive: true })
    const velha = join(c.base, 'motor', 'out', 'peca-teste.mp4')
    writeFileSync(velha, 'velho')
    const t = new Date(Date.now() - 3600 * 1000)
    utimesSync(velha, t, t)
    const f = falso({ criar: false })
    assert.throws(
      () => render(base(c, { musica: 'biblioteca/musica/faixa.mp3', executar: f.executar })),
      (e) => /render falhou/.test(e.message),
    )
    assert.equal(f.chamadas.some((x) => ehMix(x.args)), false)
  } finally { c.limpar() }
})

test('executar que grava a saida com data do passado: render falho', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso({ passado: true })
    assert.throws(
      () => render(base(c, { executar: f.executar })),
      (e) => /render falhou/.test(e.message),
    )
  } finally { c.limpar() }
})

test('render bom sem musica: copia pro final e chama o CLI do Remotion pelo node, com TEMP e public', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{"duracaoSeg":1}')
    const f = falso()
    const r = render(base(c, { executar: f.executar }))
    assert.equal(readFileSync(join(c.peca, 'final', 'peca-teste.mp4'), 'utf8'), 'video')
    assert.equal(r.saida, join(c.peca, 'final', 'peca-teste.mp4'))
    const ch = f.chamadas[0]
    assert.equal(ch.cmd, process.execPath)
    assert.match(ch.args[0], /remotion-cli\.js$/)
    assert.equal(ch.args[1], 'render')
    assert.equal(ch.args[3], 'VideoV2')
    assert.ok(ch.args.includes('--gl=angle'))
    assert.ok(ch.args.includes(`--props=${join(c.peca, 'props.json')}`))
    assert.ok(ch.args.includes(`--public-dir=${join(c.peca, 'public')}`))
    assert.equal(ch.op.cwd, join(c.base, 'motor'))
    assert.equal(ch.op.env.TEMP, join(c.base, 'tmp'))
    assert.equal(ch.op.env.TMP, join(c.base, 'tmp'))
  } finally { c.limpar() }
})

test('render bom com musica: chama o mix com ganho e ducking', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso()
    render(base(c, { musica: 'biblioteca/musica/faixa.mp3', musicaDb: -4, duckRatio: 3, executar: f.executar }))
    const mix = f.chamadas.find((x) => ehMix(x.args))
    assert.ok(mix)
    assert.ok(mix.args.includes(join(c.base, 'midia', 'biblioteca', 'musica', 'faixa.mp3')))
    assert.equal(mix.args[mix.args.indexOf('--musica-db') + 1], '-4')
    assert.equal(mix.args[mix.args.indexOf('--duck-ratio') + 1], '3')
    assert.equal(readFileSync(join(c.peca, 'final', 'peca-teste.mp4'), 'utf8'), 'mixado')
  } finally { c.limpar() }
})

test('musica que nao existe na midia: erro antes de renderizar', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso()
    assert.throws(
      () => render(base(c, { musica: 'biblioteca/musica/nao-tem.mp3', executar: f.executar })),
      (e) => e.codigo === 1 && /musica/.test(e.message),
    )
    assert.equal(f.chamadas.length, 0)
  } finally { c.limpar() }
})

test('faltando midia citada no props: sai 1 listando o que falta, sem renderizar', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{"sfx":[{"arquivo":"biblioteca/sfx/nao-tem.wav"}]}')
    const f = falso()
    assert.throws(
      () => render(base(c, { executar: f.executar })),
      (e) => e.codigo === 1 && /nao-tem\.wav/.test(e.message),
    )
    assert.equal(f.chamadas.length, 0)
  } finally { c.limpar() }
})

test('camadas: copia composicao e dados pra src/videos e regrava o indice so com a peca deste render', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'composicao.tsx'), 'export const DURACAO_SEG = 3\n')
    writeFileSync(join(c.peca, 'dados.json'), '{"duracaoSeg":3}')
    writeFileSync(join(c.base, 'motor', 'src', 'videos', 'outra-peca.tsx'), 'export const DURACAO_SEG = 2\n')
    const f = falso()
    render(base(c, { tipo: 'camadas', executar: f.executar }))
    const vd = join(c.base, 'motor', 'src', 'videos')
    assert.equal(readFileSync(join(vd, 'peca-teste.tsx'), 'utf8'), 'export const DURACAO_SEG = 3\n')
    assert.equal(readFileSync(join(vd, 'peca-teste.dados.json'), 'utf8'), '{"duracaoSeg":3}')
    const indice = readFileSync(join(vd, 'index.ts'), 'utf8')
    assert.equal(/outra-peca/.test(indice), false)
    assert.match(indice, /from '\.\/peca-teste'/)
    assert.equal(/dados/.test(indice), false)
    assert.ok(f.chamadas[0].args.includes('Camadas-peca-teste'))
    assert.deepEqual(readdirSync(vd).filter((n) => n.endsWith('.dados.json')), ['peca-teste.dados.json'])
  } finally { c.limpar() }
})

test('CLI que cria o mp4 novo mas sai com status 1: render falhou, nada mixado', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const chamadas = []
    const executar = (cmd, args) => {
      chamadas.push(args)
      const saida = args.find((a) => String(a).endsWith('.mp4'))
      if (saida) writeFileSync(saida, 'parcial')
      return { status: 1, stdout: '', stderr: 'inicio\nERRO-FINAL-DO-STDERR' }
    }
    assert.throws(
      () => render(base(c, { musica: 'biblioteca/musica/faixa.mp3', executar })),
      (e) => e.codigo === 1 && /render falhou/.test(e.message) && /ERRO-FINAL-DO-STDERR/.test(e.message),
    )
    assert.equal(chamadas.some((a) => ehMix(a)), false)
    assert.equal(existsSync(join(c.peca, 'final', 'peca-teste.mp4')), false)
  } finally { c.limpar() }
})

test('pularPronto deixa renderizar sem pronto.json (so o teste-rapido usa)', () => {
  const c = cenario({ pronto: false })
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso()
    render(base(c, { pularPronto: true, executar: f.executar }))
    assert.ok(existsSync(join(c.peca, 'final', 'peca-teste.mp4')))
  } finally { c.limpar() }
})

test('mix sai 1 depois de gravar arquivo: o final pela metade e apagado', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.peca, 'props.json'), '{}')
    const f = falso()
    const executar = (cmd, args, op) => {
      if (ehMix(args)) {
        const i = args.findIndex((x) => String(x).endsWith('mix-final.py'))
        writeFileSync(args[i + 3], 'pela-metade')
        return { status: 1, stdout: '', stderr: 'mix caiu' }
      }
      return f.executar(cmd, args, op)
    }
    assert.throws(
      () => render(base(c, { musica: 'biblioteca/musica/faixa.mp3', executar })),
      (e) => e.codigo === 1 && /mix da musica falhou/.test(e.message),
    )
    assert.equal(existsSync(join(c.peca, 'final', 'peca-teste.mp4')), false)
  } finally { c.limpar() }
})
