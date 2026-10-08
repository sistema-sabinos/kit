import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { razao, cores, paresPadrao, checar, principal } from './contraste.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'contraste.mjs')
const TEMPLATE = join(AQUI, '..', 'tokens.json')

function rodar(argv) {
  const saida = []
  const avisos = []
  const codigo = principal(argv, s => saida.push(s), s => avisos.push(s))
  return { codigo, saida: saida.join('\n'), avisos: avisos.join('\n') }
}

test('razoes conhecidas', () => {
  assert.ok(Math.abs(razao('#000', '#fff') - 21) < 0.005)
  assert.ok(Math.abs(razao('#ffffff', '#ffffff') - 1) < 0.005)
  // #767676 sobre branco e o cinza classico que passa no AA por pouco
  assert.ok(razao('#767676', '#ffffff') >= 4.5)
  assert.ok(razao('#777777', '#ffffff') < 4.5)
})

test('tokens aninhados viram nome com hifen', () => {
  const cols = cores({ color: { text: { default: '#111', muted: { value: '#999' } }, bg: '#fff', $type: 'color' } })
  assert.deepEqual(cols, { 'text-default': '#111', 'text-muted': '#999', bg: '#fff' })
})

test('pares padrao e texto grande', () => {
  const cols = { text: '#111111', 'text-muted': '#949494', bg: '#ffffff', accent: '#2563eb' }
  const pares = paresPadrao(cols)
  assert.ok(pares.some(p => p[0] === 'text' && p[1] === 'bg'))
  assert.ok(!pares.some(p => p[0] === 'accent' && p[1] === 'bg'))
  const linhas = checar(cols, [['text-muted', 'bg'], ['text-muted', 'bg', 'large']])
  assert.equal(linhas[0].aa, false)
  assert.equal(linhas[1].aa, true)
})

test('template do kit passa com saida 0', () => {
  const r = rodar([TEMPLATE])
  assert.match(r.saida, /9 pares, 0 reprovando no AA/)
  assert.equal(r.codigo, 0)
})

test('par pela linha de comando sai 1 quando reprova e 0 quando passa', () => {
  const ruim = rodar(['#aaaaaa', '#ffffff'])
  assert.match(ruim.saida, /REPROVA/)
  assert.equal(ruim.codigo, 1)
  assert.equal(rodar(['#222222', '#ffffff']).codigo, 0)
})

test('nomes em portugues com e sem acento entram nos pares padrao', () => {
  const cols = { texto: '#111111', 'sobre-destaque': '#ffffff', fundo: '#ffffff', 'superfície': '#f6f7f9', superficie2: '#000000', destaque: '#2f5bea' }
  const pares = paresPadrao(cols).map(p => p.join(' sobre '))
  assert.deepEqual(pares.sort(), [
    'sobre-destaque sobre fundo',
    'sobre-destaque sobre superfície',
    'texto sobre fundo',
    'texto sobre superfície',
  ])
})

test('tamanho grande em portugues vale igual a large', () => {
  const cols = { texto: '#949494', fundo: '#ffffff' }
  const [normal, grande] = checar(cols, [['texto', 'fundo'], ['texto', 'fundo', 'grande']])
  assert.equal(normal.aa, false)
  assert.equal(grande.tamanho, 'large')
  assert.equal(grande.aa, true)
})

test('cor que nao existe no arquivo reprova com saida 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contraste-'))
  try {
    const p = join(dir, 'tokens.json')
    writeFileSync(p, JSON.stringify({ color: { texto: '#111111', fundo: '#ffffff' }, pairs: [['texto', 'fundo'], ['texto', 'cartao']] }))
    const r = rodar([p])
    assert.ok(r.saida.length > 0)
    assert.match(r.saida, /cartao/)
    assert.match(r.saida, /2 pares, 1 reprovando no AA/)
    assert.equal(r.codigo, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sem par, arquivo que falta e JSON quebrado saem 2 com aviso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contraste-'))
  try {
    const semPar = join(dir, 'sem-par.json')
    writeFileSync(semPar, JSON.stringify({ color: { destaque: '#2f5bea' } }))
    const quebrado = join(dir, 'quebrado.json')
    writeFileSync(quebrado, '{"color": {"texto": "#111",}')
    for (const argv of [[semPar], [join(dir, 'nao-existe.json')], [quebrado], []]) {
      const r = rodar(argv)
      assert.ok(r.avisos.length > 0, `sem aviso pra ${argv}`)
      assert.equal(r.codigo, 2, `codigo errado pra ${argv}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('par malformado na lista pairs sai 2 com o formato certo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contraste-'))
  try {
    const color = { texto: '#fff', fundo: '#fff' }
    const casos = [
      { pairs: ['texto,fundo'] },
      { pairs: [{ text: 'texto', bg: 'fundo' }] },
      { pairs: [['texto']] },
      { pairs: [['texto', 'fundo'], 'texto,fundo'] },
      { pairs: 'texto,fundo' },
    ]
    for (const [i, extra] of casos.entries()) {
      const p = join(dir, `malformado-${i}.json`)
      writeFileSync(p, JSON.stringify({ color, ...extra }))
      const r = rodar([p])
      assert.ok(r.avisos.length > 0, `sem aviso no caso ${i}`)
      assert.match(r.avisos, /\["texto", "fundo"\]/, `aviso sem o formato certo no caso ${i}`)
      assert.doesNotMatch(r.saida, /0 pares, 0 reprovando/, `contou zero pares calado no caso ${i}`)
      assert.equal(r.codigo, 2, `codigo errado no caso ${i}`)
    }
    const bom = join(dir, 'bom.json')
    writeFileSync(bom, JSON.stringify({ color: { texto: '#111111', fundo: '#ffffff' }, pairs: [['texto', 'fundo'], ['texto', 'fundo', 'grande']] }))
    const r = rodar([bom])
    assert.ok(r.saida.length > 0)
    assert.match(r.saida, /2 pares, 0 reprovando no AA/)
    assert.equal(r.codigo, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sem --json sai texto e com --json sai a lista', () => {
  const texto = rodar(['#222222', '#ffffff'])
  assert.match(texto.saida, /AAA/)
  assert.throws(() => JSON.parse(texto.saida))
  const json = JSON.parse(rodar(['#222222', '#ffffff', '--json']).saida)
  assert.equal(json.length, 1)
  assert.equal(json[0].aa, true)
  assert.equal(json[0].texto_hex, '#222222')
})

test('chamado pelo node, devolve o codigo de saida certo', () => {
  const passa = spawnSync(process.execPath, [SCRIPT, TEMPLATE], { encoding: 'utf8' })
  assert.match(passa.stdout, /9 pares/)
  assert.equal(passa.status, 0)
  const reprova = spawnSync(process.execPath, [SCRIPT, '#aaaaaa', '#ffffff'], { encoding: 'utf8' })
  assert.match(reprova.stdout, /REPROVA/)
  assert.equal(reprova.status, 1)
})
