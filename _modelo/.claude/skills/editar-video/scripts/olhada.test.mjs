import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chavesNaTela, instantesOlhada, olhada } from './olhada.mjs'
import { hashPasta } from '../../configurar-video/scripts/lib/pasta-video.mjs'

const props = () => ({
  duracaoSeg: 30, cortesSeg: [5, 10, 15], escalasSeg: [1, 1.25, 1, 1.4],
  chaves: [{ chave: 'A', deSeg: 2, ateSeg: 4, topo: 400 }, { chave: 'B', deSeg: 11, ateSeg: 13, topo: 1060, apoio: 'x' }],
  cartoes: [{ deSeg: 20, ateSeg: 23, linhas: [{ texto: 'R$ 52' }, { texto: 'por unidade', aSeg: 0.4 }] }],
  segmentos: [],
})

test('P3: olhada escolhe plano fechado, chave, chave no peito e cartao (canario: lista nao vazia)', () => {
  const q = instantesOlhada(props())
  assert.ok(q.length > 0)
  assert.deepEqual(q.map((x) => x.seg), [2.45, 11.45, 20.85, 22.5])
  assert.deepEqual(q.map((x) => x.quadro), [74, 344, 626, 675])
  assert.match(q[3].motivo, /1\.4/)
})

test('P3: olhada nao pega quadro coberto por insercao em tela cheia', () => {
  const p = props()
  p.segmentos = [{ tipo: 'video', deSeg: 15, ateSeg: 30, cheia: true }]
  const q = instantesOlhada(p)
  assert.ok(q.every((x) => x.seg < 15 || /cartao/.test(x.motivo)))
  assert.ok(!q.some((x) => /1\.4/.test(x.motivo)))
})

test('P3: olhada manda a caixa da chave que esta na tela', () => {
  assert.deepEqual(chavesNaTela(props(), 11.45), ['1060,259'])
  assert.deepEqual(chavesNaTela(props(), 8), [])
})

function cenario(pr = props()) {
  const d = mkdtempSync(join(tmpdir(), 'olhada-'))
  const raiz = join(d, 'raiz'), base = join(d, 'video'), motorKit = join(d, 'kit-motor'), peca = join(raiz, 'producao', 'peca')
  mkdirSync(join(motorKit, 'scripts'), { recursive: true })
  writeFileSync(join(motorKit, 'scripts', 'guias-olhada.py'), '# falso\n')
  mkdirSync(join(base, 'motor'), { recursive: true })
  mkdirSync(join(base, 'midia'), { recursive: true })
  writeFileSync(join(base, 'pronto.json'), JSON.stringify({ versaoMotor: hashPasta(motorKit) }))
  mkdirSync(join(peca, 'public'), { recursive: true })
  writeFileSync(join(peca, 'props.json'), JSON.stringify(pr))
  return { d, raiz, base, motorKit, peca, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

// executar falso do Remotion e do Python: bundle cria o pacote, still grava o png (menos no quadro de falha)
function falso({ falhaNoQuadro = null, aoEmpacotar = () => {}, python = null } = {}) {
  const chamadas = []
  const box = { pacote: null }
  const executar = (cmd, args) => {
    chamadas.push(args)
    if (args[1] === 'bundle') { aoEmpacotar(args); box.pacote = args[3].slice('--out-dir='.length); mkdirSync(box.pacote, { recursive: true }); return { status: 0 } }
    if (args[1] === 'still') {
      if (args[5] === `--frame=${falhaNoQuadro}`) return { status: 1, stderr: 'navegador caiu' }
      writeFileSync(args[4], 'png'); return { status: 0 }
    }
    if (python) return python(args)
    return { status: 0, stdout: `${args.at(-1)}: sem aviso` }
  }
  return { executar, chamadas, box }
}

test('P3: olhada empacota uma vez, tira um still por instante e apaga o pacote mesmo com still falhando', () => {
  const c = cenario()
  try {
    const f = falso({ falhaNoQuadro: 344 })
    assert.throws(
      () => olhada({ slug: 'peca', raiz: c.raiz, base: c.base, motorKit: c.motorKit, executar: f.executar }),
      (e) => {
        assert.equal(e.codigo, 1)
        assert.match(e.message, /1 quadro\(s\) de olhada nao sairam/)
        assert.equal(e.linhas.length, 4)
        assert.match(e.linhas.find((l) => l.startsWith('11.45')), /nao saiu.*navegador caiu/)
        return true
      },
    )
    assert.equal(f.chamadas.filter((a) => a[1] === 'bundle').length, 1)
    assert.equal(f.chamadas.filter((a) => a[1] === 'still').length, 4)
    assert.equal(f.chamadas.filter((a) => a.some((x) => String(x).endsWith('guias-olhada.py'))).length, 3)
    assert.ok(f.box.pacote && !existsSync(f.box.pacote), 'pacote apagado')
    // com todos os quadros saindo, a olhada devolve as 4 linhas sem erro
    const ok = falso()
    const r = olhada({ slug: 'peca', raiz: c.raiz, base: c.base, motorKit: c.motorKit, executar: ok.executar })
    assert.equal(r.linhas.length, 4)
  } finally { c.limpar() }
})

test('P3: olhada falha alto quando as guias nao saem (Python caiu ou nem abriu)', () => {
  const c = cenario()
  try {
    // canario: com o Python bom, a mesma cena sai sem erro e com as 4 guias
    const ok = falso()
    assert.equal(olhada({ slug: 'peca', raiz: c.raiz, base: c.base, motorKit: c.motorKit, executar: ok.executar }).linhas.length, 4)
    const casos = [
      { python: () => ({ status: 1, stderr: "cv2.error: Can't read ONNX file" }), detalhe: /ONNX/ },
      { python: () => ({ status: null, error: new Error('spawnSync py ENOENT') }), detalhe: /ENOENT/ },
    ]
    for (const caso of casos) {
      const f = falso({ python: caso.python })
      assert.throws(
        () => olhada({ slug: 'peca', raiz: c.raiz, base: c.base, motorKit: c.motorKit, executar: f.executar }),
        (e) => {
          assert.equal(e.codigo, 1)
          assert.match(e.message, /4 quadro\(s\) de olhada/)
          assert.equal(e.linhas.length, 4)
          assert.ok(e.linhas.every((l) => /as guias nao sairam/.test(l) && caso.detalhe.test(l)), e.linhas.join('\n'))
          return true
        },
      )
      assert.equal(f.chamadas.filter((a) => a.some((x) => String(x).endsWith('guias-olhada.py'))).length, 4)
      assert.ok(f.box.pacote && !existsSync(f.box.pacote), 'pacote apagado')
    }
  } finally { c.limpar() }
})

test('P3: olhada leva a imagem da biblioteca e falha alto sem ela', () => {
  const pr = props()
  pr.segmentos = [{ tipo: 'imagem', arquivo: 'biblioteca/prints/tela.png', deSeg: 25, ateSeg: 28, cheia: true }]
  const c = cenario(pr)
  try {
    const img = join(c.base, 'midia', 'biblioteca', 'prints', 'tela.png')
    mkdirSync(join(c.base, 'midia', 'biblioteca', 'prints'), { recursive: true })
    writeFileSync(img, 'imagem')
    const destino = join(c.peca, 'public', 'biblioteca', 'prints', 'tela.png')
    let noPacote = null
    const f = falso({ aoEmpacotar: () => { noPacote = existsSync(destino) } })
    olhada({ slug: 'peca', raiz: c.raiz, base: c.base, motorKit: c.motorKit, executar: f.executar })
    assert.equal(noPacote, true, 'a imagem estava no public quando o motor empacotou')
    // sem a imagem na midia: para antes de empacotar, com o nome do que falta
    rmSync(img); rmSync(destino)
    const f2 = falso()
    assert.throws(
      () => olhada({ slug: 'peca', raiz: c.raiz, base: c.base, motorKit: c.motorKit, executar: f2.executar }),
      (e) => e.codigo === 1 && /faltam na midia: biblioteca\/prints\/tela\.png/.test(e.message),
    )
    assert.equal(f2.chamadas.length, 0)
  } finally { c.limpar() }
})
