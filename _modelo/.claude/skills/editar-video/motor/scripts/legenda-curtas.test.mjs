// P2 (5.17): palavra curta (artigo, preposicao, conjuncao, pronome curto, numero solto, R$) nunca fecha pagina de
// legenda nos 3 caminhos do editar-video: paginas-legenda.py (clipe), paginas-camadas.py (fundo verde) e
// Legendas.tsx (cenario proprio, pelo src/curtas.ts). Fala sintetica: passo ms por palavra (50 ms de folga),
// "|" e pausa de 0,5 s.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rodarPython } from '../../../configurar-video/scripts/lib/plataforma.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' }
const TS = await import(pathToFileURL(join(AQUI, '../src/curtas.ts')).href)

function fala(texto, passo = 300) {
  if (typeof texto !== 'string') return texto
  let t = 0
  const out = []
  for (const w of texto.split(' ')) {
    if (w === '|') { t += 500; continue }
    out.push({ text: ' ' + w, startMs: t, endMs: t + passo - 50, timestampMs: t + Math.round(passo / 2), confidence: 1 })
    t += passo
  }
  return out
}
function wav(arq, seg) {
  const n = Math.round(seg * 16000), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24)
  b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  writeFileSync(arq, b)
}
function comTemp(fn) {
  const d = mkdtempSync(join(tmpdir(), 'curtas-'))
  try { return fn(d) } finally { rmSync(d, { recursive: true, force: true }) }
}
function py(nome, args) {
  const r = rodarPython(join(AQUI, nome), args, { env: ENV })
  assert.equal(r.status, 0, String(r.stderr || '') + String(r.stdout || ''))
  return r.stdout
}
// frase (texto) ou legenda pronta (lista de palavras, pra pageBreakAfter)
const clipe = frase => comTemp(d => {
  const ali = join(d, 'a.json'), sai = join(d, 's.json')
  writeFileSync(ali, JSON.stringify(fala(frase)))
  py('paginas-legenda.py', [ali, sai])
  return JSON.parse(readFileSync(sai, 'utf8')).map(p => p.palavras.join(' '))
})
const verde = frase => comTemp(d => {
  const ali = join(d, 'a.json'), voz = join(d, 'v.wav'), sai = join(d, 's.json')
  const caps = fala(frase)
  writeFileSync(ali, JSON.stringify(caps))
  wav(voz, caps.at(-1).endMs / 1000 + 1)
  py('paginas-camadas.py', ['--alinhado', ali, '--voz', voz, '--saida', sai])
  return JSON.parse(readFileSync(sai, 'utf8')).paginas.map(p => p.palavras.join(' '))
})
const tela = (frase, passo) => TS.paginas(fala(frase, passo), 3, 900)

// 3 palavras por pagina (clipe e cenario proprio): T08 e item 8
const ESPERADO_3 = {
  'um dois': ['um dois'],
  'isso trava a mandibula toda': ['isso trava', 'a mandibula toda'],
  'sinto dor no o joelho direito': ['sinto dor', 'no o joelho', 'direito'],
  'fui a um mercado': ['fui', 'a um mercado'],
  'com responsabilidade': ['com responsabilidade'],
  'isso com responsabilidade': ['isso', 'com responsabilidade'],
  'eu vi o que e bom': ['eu vi', 'o que e bom'],
  'o que é um teste': ['o que', 'é um teste'],
  'fui a um mercado de pulgas e vi o que e bom': ['fui', 'a um mercado', 'de pulgas', 'e vi', 'o que e bom'],
  'eu vou no | mercado hoje': ['eu vou no', 'mercado hoje'],
  'e a de que o': ['e a', 'de que o'],
  // revisao do plano: pagina so de curtas nao atravessa pausa; curta do fim so volta se a pagina de antes
  // ficar com no maximo uma a mais; nunca volta por cima de fim de frase
  'e a de | mercado hoje': ['e a de', 'mercado hoje'],
  'o que e bom a': ['o que e bom', 'a'],
  'eu vi tudo a': ['eu vi tudo a'],
  'isso foi bom. e': ['isso foi bom.', 'e'],
}
// 2 palavras e 12 letras por pagina (fundo verde, coluna estreita): o [no o] de hoje some
const ESPERADO_2 = {
  'um dois': ['um dois'],
  'sinto dor no o joelho direito': ['sinto dor', 'no o joelho', 'direito'],
  'isso trava a mandibula toda': ['isso trava', 'a mandibula', 'toda'],
  'fui a um mercado': ['fui', 'a um mercado'],
  'eu vi o que e bom': ['eu vi', 'o que', 'e bom'],
  'vou no | mercado hoje': ['vou no', 'mercado hoje'],
  'e a de que o': ['e a', 'de que o'],
  'no o | joelho': ['no o', 'joelho'],
}
const PROPRIEDADE = ['fui a um mercado e o dia foi bom', 'comprei de um amigo que mora no centro', 'e a de que o', 'sinto dor no o joelho direito', 'eu vi o que e bom', 'o que é um teste']

// decisao 4 da 5.17: R$ e curta e gruda no numero (preco nunca quebra entre paginas)
const RS_3 = {
  'comprei por R$ 89': ['comprei', 'por R$ 89'],
  'comprei por R$ 89 no mercado': ['comprei', 'por R$ 89', 'no mercado'],
}
const RS_2 = {
  'comprei por R$ 89': ['comprei', 'por R$ 89'],
  'eu R$ 89 reais': ['eu R$ 89', 'reais'],
}
const RS = ['comprei por R$ 89', 'comprei por R$ 89 no mercado', 'paguei R$ 89 reais', 'eu R$ 89 reais', 'de R$ 89 por R$ 59 hoje', 'eu vi R$ 1.299,90 de desconto', 'o que R$ 10 compra']

// pageBreakAfter (camera lenta da P6): a pagina fecha ali, e nada volta por cima da quebra
// (entre "ja" e "dois" ha 800 ms de pausa, entao a regra 3 tambem separa os dois)
const cap = (text, startMs, endMs, quebra) => ({ text: ' ' + text, startMs, endMs, timestampMs: startMs, confidence: 1, ...(quebra ? { pageBreakAfter: true } : {}) })
const QUEBRA = [
  [[cap('um', 1000, 1490, true), cap('um', 1500, 2480, true), cap('ja', 2490, 2700), cap('dois', 3500, 4000)], ['um', 'um', 'ja', 'dois']],
  [[cap('vi', 0, 250), cap('tudo', 300, 550, true), cap('e', 600, 850)], ['vi tudo', 'e']],
]

// nenhuma palavra perdida; ate max (max + 1 so quando as anteriores sao curtas); pagina que nao e a ultima nao
// termina em curta (salvo pagina so de curtas); nenhuma pagina e uma curta sozinha
function conferir(frase, telas, max) {
  assert.equal(telas.join(' '), frase.replace(' | ', ' '), `palavra perdida ou fora de ordem em "${frase}"`)
  for (const [k, s] of telas.entries()) {
    const ws = s.split(' ')
    assert.ok(ws.length <= max || (ws.length === max + 1 && ws.slice(0, max).every(w => TS.curta(w))), `pagina com ${ws.length} palavras em "${frase}": ${s}`)
    if (k < telas.length - 1 && !ws.every(w => TS.curta(w))) assert.ok(!TS.curta(ws.at(-1)), `pagina fecha em "${ws.at(-1)}" em "${frase}"`)
    assert.ok(!(ws.length === 1 && TS.curta(ws[0]) && frase.includes(' ')), `curta sozinha em "${frase}": [${telas.join('] [')}]`)
  }
}
// R$ nunca fecha pagina: o numero vem junto
function semPrecoPartido(frase, telas) {
  assert.ok(frase.includes('R$'), 'canario: a frase tem R$')
  for (const s of telas.slice(0, -1)) assert.notEqual(s.split(' ').at(-1), 'R$', `preco partido em "${frase}": [${telas.join('] [')}]`)
}

test('P2: lista de curtas (com R$) igual no legenda_curtas.py e no curtas.ts', () => {
  const codigo = `import sys, json; sys.path.insert(0, ${JSON.stringify(AQUI)}); from legenda_curtas import CURTAS, curta; ` +
    `print(json.dumps([sorted(CURTAS), [curta(w) for w in sys.argv[1:]]]))`
  const AMOSTRA = ['no', 'No', 'de', 'é', '60', 'R$89', '10%', '2,5', 'mil', 'mandibula', 'o.', 'que,', 'eu', 'R$', '1.2.3', '2a']
  const p = rodarPython('-c', [codigo, ...AMOSTRA], { env: ENV })
  assert.equal(p.status, 0, String(p.stderr))
  const [lista, marcas] = JSON.parse(p.stdout)
  assert.ok(lista.includes('no') && lista.includes('de'), 'canario: a lista do Python veio')
  assert.deepEqual(lista, [...TS.CURTAS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
  assert.deepEqual(marcas, AMOSTRA.map(w => TS.curta(w)))
  assert.deepEqual(marcas, [true, true, true, true, true, true, true, true, false, false, false, false, true, true, true, false])
})

test('P2: python clipe: paginas-legenda.py nao fecha pagina em curta', () => {
  for (const [frase, esperado] of Object.entries(ESPERADO_3)) assert.deepEqual(clipe(frase), esperado, frase)
  for (const frase of PROPRIEDADE) conferir(frase, clipe(frase), 3)
})

test('P2: python fundo verde: paginas-camadas.py nao fecha pagina em curta nem deixa so curtas', () => {
  for (const [frase, esperado] of Object.entries(ESPERADO_2)) assert.deepEqual(verde(frase), esperado, frase)
  for (const frase of PROPRIEDADE) conferir(frase, verde(frase), 2)
})

test('P2: Legendas.tsx: cenario proprio nao fecha pagina em curta', () => {
  // sem teto de letras: "isso com responsabilidade" cabe numa pagina so (o clipe tem 16 letras)
  const esperado3 = { ...ESPERADO_3, 'isso com responsabilidade': ['isso com responsabilidade'] }
  for (const [frase, esperado] of Object.entries(esperado3)) assert.deepEqual(tela(frase).map(p => p.text), esperado, frase)
  for (const frase of PROPRIEDADE) {
    const ps = tela(frase)
    conferir(frase, ps.map(p => p.text), 3)
    for (const p of ps) {
      assert.equal(p.startMs, p.tokens[0].fromMs)
      assert.ok(p.tokens.every((t, i) => (i === 0 ? !t.text.startsWith(' ') : t.text.startsWith(' '))), `espaco errado em "${p.text}"`)
    }
  }
  // a legenda usa as paginas novas, nao as do createTikTokStyleCaptions
  const src = readFileSync(join(AQUI, '../src/Legendas.tsx'), 'utf8')
  assert.match(src, /paginas\(captions, MAX_PALAVRAS, TROCA_A_CADA_MS\)/)
  assert.doesNotMatch(src, /createTikTokStyleCaptions\(/)
})

test('P2: Legendas.tsx: pagina fica na tela ate a ultima palavra dela', () => {
  // fala lenta: "no o joelho" passa da janela de 900 ms e o teto antigo (inicio + 1,2 s) cortava o "joelho"
  let conferidas = 0
  for (const passo of [300, 500]) {
    for (const frase of [...Object.keys(ESPERADO_3), ...PROPRIEDADE, ...RS]) {
      const ps = tela(frase, passo)
      ps.forEach((p, i) => {
        const fim = TS.fimDaPaginaMs(p, ps[i + 1] ?? null, 900)
        for (const t of p.tokens) {
          conferidas++
          const visto = Math.min(t.toMs, fim) - Math.max(t.fromMs, p.startMs)
          assert.ok(visto >= 0.6 * (t.toMs - t.fromMs), `"${t.text.trim()}" fica ${visto} de ${t.toMs - t.fromMs} ms na tela em "${frase}" (${passo} ms)`)
        }
      })
    }
  }
  assert.ok(conferidas > 100, 'canario: palavras conferidas: ' + conferidas)
  const src = readFileSync(join(AQUI, '../src/Legendas.tsx'), 'utf8')
  assert.match(src, /fimDaPaginaMs\(page, prox, TROCA_A_CADA_MS\)/)
})

test('P2: python clipe R$: preco nao quebra entre paginas', () => {
  for (const [frase, esperado] of Object.entries(RS_3)) assert.deepEqual(clipe(frase), esperado, frase)
  for (const frase of RS) { const t = clipe(frase); conferir(frase, t, 3); semPrecoPartido(frase, t) }
})

test('P2: python fundo verde R$: preco nao quebra entre paginas', () => {
  for (const [frase, esperado] of Object.entries(RS_2)) assert.deepEqual(verde(frase), esperado, frase)
  for (const frase of RS) { const t = verde(frase); conferir(frase, t, 2); semPrecoPartido(frase, t) }
})

test('P2: Legendas.tsx R$: preco nao quebra entre paginas', () => {
  // a 500 ms por palavra a janela de 900 ms fecha a pagina com 2, como no fundo verde
  for (const [frase, esperado] of Object.entries(RS_3)) assert.deepEqual(tela(frase).map(p => p.text), esperado, frase)
  assert.deepEqual(tela('eu R$ 89 reais', 500).map(p => p.text), ['eu R$ 89 reais'])
  for (const passo of [300, 500]) for (const frase of RS) {
    const t = tela(frase, passo).map(p => p.text)
    conferir(frase, t, 3); semPrecoPartido(frase, t)
  }
})

test('P2: python clipe pageBreakAfter: fecha a pagina mesmo com curta depois', () => {
  for (const [legenda, esperado] of QUEBRA) assert.deepEqual(clipe(legenda), esperado)
})

test('P2: python fundo verde pageBreakAfter: fecha a pagina mesmo com curta depois', () => {
  for (const [legenda, esperado] of QUEBRA) assert.deepEqual(verde(legenda), esperado)
})

test('P2: Legendas.tsx pageBreakAfter: fecha a pagina mesmo com curta depois', () => {
  for (const [legenda, esperado] of QUEBRA) assert.deepEqual(tela(legenda).map(p => p.text), esperado)
})

// revisao do bloco (achado A1): pausa de mais de 0,35 s fecha a pagina mesmo quando ela ainda nao esta cheia,
// senao a palavra depois da pausa aparece na tela antes de ser dita
const VOLTA = [{ text: ' oi', startMs: 0, endMs: 250 }, { text: ' voltou', startMs: 5000, endMs: 5250 }]
const PAUSA_3 = [[VOLTA, ['oi', 'voltou']], ['oi | voltou agora', ['oi', 'voltou agora']], ['o que | bom', ['o que', 'bom']]]
const PAUSA_2 = [[VOLTA, ['oi', 'voltou']], ['oi | voltou agora', ['oi', 'voltou agora']], ['o | bom dia', ['o', 'bom dia']]]

test('P2: python clipe pausa: fecha a pagina que ainda nao esta cheia', () => {
  for (const [legenda, esperado] of PAUSA_3) assert.deepEqual(clipe(legenda), esperado, JSON.stringify(legenda))
})

test('P2: python fundo verde pausa: fecha a pagina que ainda nao esta cheia', () => {
  for (const [legenda, esperado] of PAUSA_2) assert.deepEqual(verde(legenda), esperado, JSON.stringify(legenda))
})

test('P2: Legendas.tsx pausa: fecha a pagina que ainda nao esta cheia', () => {
  for (const [legenda, esperado] of PAUSA_3) assert.deepEqual(tela(legenda).map(p => p.text), esperado, JSON.stringify(legenda))
  const [oi, voltou] = tela(VOLTA)
  assert.equal(voltou.startMs, 5000)
  assert.ok(TS.fimDaPaginaMs(oi, voltou, 900) <= 5000)
})
