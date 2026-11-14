// Prova a cadeia Python do motor rodando cada script de verdade, com midia gerada pelo ffmpeg
// numa pasta temporaria. O que depende do whisper ou do modelo de profundidade pula com o motivo
// escrito (o caminho real se prova no ensaio). A ultima prova varre os .py atras de caminho fixo
// e de termo que nao pode ir no kit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { rodarPython } from '../../../configurar-video/scripts/lib/plataforma.mjs'
import { hashPasta } from '../../../configurar-video/scripts/lib/pasta-video.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const script = (nome) => join(AQUI, nome)
const ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' }

function ff(...args) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, 'ffmpeg falhou: ' + r.stderr)
}
function sonda(arquivo, entrada, extra = []) {
  const r = spawnSync('ffprobe', ['-v', 'error', ...extra, '-select_streams', entrada.sel, '-show_entries', `stream=${entrada.campo}`, '-of', 'csv=p=0', arquivo], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim().split(/\r?\n/)[0].replace(/,$/, '')
}
function py(nome, args, op = {}) {
  return rodarPython(script(nome), args, { env: ENV, ...op })
}
async function comTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cadeia-'))
  try { await fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}
const semTraco = (s) => String(s || '')

// ajudantes da camera lenta (P6): contagem de quadros, duracao, amostras de audio e tom dominante
const quadros = (arq) => Number(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', arq], { encoding: 'utf8' }).stdout.trim())
const duracao = (arq) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq], { encoding: 'utf8' }).stdout.trim())
function amostras(arq, de, ate, sr = 16000) {
  const b = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(de), '-to', String(ate), '-i', arq, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 26 }).stdout
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4)
}
// frequencia dominante por Goertzel de 100 a 1200 Hz, passo 2 Hz
function dominante(x, sr = 16000) {
  let melhor = 0, fMelhor = 0
  for (let f = 100; f <= 1200; f += 2) {
    const w = 2 * Math.cos(2 * Math.PI * f / sr)
    let s1 = 0, s2 = 0
    for (const v of x) { const s0 = v + w * s1 - s2; s2 = s1; s1 = s0 }
    const p = s1 * s1 + s2 * s2 - w * s1 * s2
    if (p > melhor) { melhor = p; fMelhor = f }
  }
  return fMelhor
}
const quadroCinza = (arq, t) => spawnSync('ffmpeg', ['-v', 'error', '-ss', t.toFixed(4), '-i', arq, '-frames:v', '1', '-vf', 'scale=32:32,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout
const difer = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length
// fala sintetica: "um" e um tom de 440 Hz de 1,0 a 1,5 s, "dois" um de 660 Hz de 2,5 a 3,0 s, 4 s ao todo
function fala(d) {
  const tom = 'if(between(t,1,1.5),0.5*sin(2*PI*440*t),0)+if(between(t,2.5,3),0.5*sin(2*PI*660*t),0)'
  ff('-f', 'lavfi', '-i', `aevalsrc='${tom}':s=48000:d=4`, '-c:a', 'pcm_s24le', join(d, 'voz.wav'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=4', '-i', join(d, 'voz.wav'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(d, 'pessoa.mp4'))
  writeFileSync(join(d, 'voz.alinhado.json'), JSON.stringify([{ text: ' um', startMs: 1000, endMs: 1490 }, { text: ' ja', startMs: 1490, endMs: 1700 }, { text: ' dois', startMs: 2500, endMs: 3000 }]))
}

test('tratar-voz gera wav de 48 kHz sem o DeepFilterNet', () => comTemp((d) => {
  const ent = join(d, 'seno.wav'), sai = join(d, 'voz.wav')
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=2:r=44100', ent)
  const r = py('tratar-voz.py', [ent, sai, '--sem-dfn'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.equal(sonda(sai, { sel: 'a:0', campo: 'sample_rate' }), '48000')
}))

test('alinhar troca o texto do whisper pelo do roteiro e devolve a pontuacao', () => comTemp((d) => {
  const leg = join(d, 'leg.json'), fala = join(d, 'fala.txt'), sai = join(d, 'alinhado.json')
  writeFileSync(leg, JSON.stringify([{ text: 'ola', startMs: 0, endMs: 300 }, { text: 'mundo', startMs: 300, endMs: 700 }]))
  writeFileSync(fala, 'Olá, mundo.', 'utf8')
  const r = py('alinhar.py', [leg, fala, sai])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const j = JSON.parse(readFileSync(sai, 'utf8'))
  assert.equal(j.length, 2)
  assert.deepEqual(j.map((p) => p.text.trim()), ['Olá,', 'mundo.'])
}))

// roda o alinhar.py com legendas fake do whisper e devolve [texto, startMs, endMs] de cada palavra
function alinhar(d, caps, roteiro) {
  const leg = join(d, 'leg.json'), fala = join(d, 'fala.txt'), sai = join(d, 'alinhado.json')
  writeFileSync(leg, JSON.stringify(caps.map(([text, startMs, endMs]) => ({ text: ' ' + text, startMs, endMs }))))
  writeFileSync(fala, roteiro, 'utf8')
  const r = py('alinhar.py', [leg, fala, sai])
  assert.equal(r.status, 0, semTraco(r.stderr))
  return JSON.parse(readFileSync(sai, 'utf8')).map((c) => [c.text.trim(), c.startMs, c.endMs])
}

test('alinhar: preco falado ("oitenta e nove reais" contra "R$ 89") acende no comeco do numero e sem "reais" sobrando', () => comTemp((d) => {
  // whisper por extenso: R$ e 89 acendem juntos no startMs de "oitenta", e o "reais" fica com o numero
  const ext = alinhar(d, [['por', 0, 300], ['oitenta', 300, 700], ['e', 700, 800], ['nove', 800, 1100], ['reais', 1100, 1500]], 'por R$ 89')
  assert.deepEqual(ext, [['por', 0, 300], ['R$', 300, 1500], ['89', 300, 1500]])
  // whisper em algarismo ("89 reais"): o "reais" nao sobra e o tempo dele vai pro 89
  const alg = alinhar(d, [['por', 0, 300], ['89', 300, 1100], ['reais', 1100, 1500]], 'por R$ 89')
  assert.deepEqual(alg.map((p) => p[0]), ['por', 'R$', '89'])
  assert.deepEqual(alg, [['por', 0, 300], ['R$', 300, 1500], ['89', 300, 1500]])
  const com = alinhar(d, [['por', 0, 300], ['R$', 300, 500], ['89', 500, 1100], ['reais', 1100, 1500]], 'por R$ 89')
  assert.deepEqual(com, [['por', 0, 300], ['R$', 300, 1500], ['89', 300, 1500]])
  // whisper ja escreveu "R$ 89" (caso do render de demonstracao da 5.17): o 89 acende junto com o R$
  const demo = alinhar(d, [['Comprei', 180, 770], ['por', 770, 1130], ['R$', 1130, 1320], ['89', 1320, 1980], ['no', 1980, 2200]], 'Comprei por R$ 89 no')
  assert.deepEqual(demo.slice(2, 4), [['R$', 1130, 1980], ['89', 1130, 1980]])
  // whisper errou tambem a palavra vizinha (mesmo bloco de troca): o preco ancora no "oitenta", sem dividir igual
  const viz = alinhar(d, [['custa', 0, 300], ['so', 300, 500], ['oitenta', 500, 900], ['e', 900, 1000], ['nove', 1000, 1300], ['reais', 1300, 1700]], 'custa apenas R$ 89')
  assert.deepEqual(viz, [['custa', 0, 300], ['apenas', 300, 500], ['R$', 500, 1700], ['89', 500, 1700]])
  const pro = alinhar(d, [['pro', 0, 300], ['oitenta', 300, 700], ['e', 700, 800], ['nove', 800, 1100], ['reais', 1100, 1500]], 'por R$ 89')
  assert.deepEqual(pro, [['por', 0, 300], ['R$', 300, 1500], ['89', 300, 1500]])
  // quantidade falada antes do preco ("dois itens"): a ancora e o valor seguido de "reais", nao o primeiro numero
  const qtd = alinhar(d, [['leve', 0, 400], ['dois', 400, 800], ['itens', 800, 1200], ['custando', 1200, 1600], ['oitenta', 1600, 2000], ['e', 2000, 2400], ['nove', 2400, 2800], ['reais', 2800, 3200]], 'compre duas unidades por R$ 89')
  assert.deepEqual(qtd.slice(4), [['R$', 1600, 3200], ['89', 1600, 3200]])
  assert.deepEqual(qtd[0], ['compre', 0, 400])
  // whisper nao ouviu o preco (insert): R$ e 89 dividem a mesma metade do tempo da vizinha
  const ins = alinhar(d, [['comprei', 0, 400], ['no', 400, 800], ['mercado', 800, 1200]], 'comprei por R$ 89 no mercado')
  assert.deepEqual(ins.slice(0, 4), [['comprei', 0, 200], ['por', 200, 300], ['R$', 300, 400], ['89', 300, 400]])
  // dois precos por extenso na mesma frase
  const dois = alinhar(d, [['de', 0, 200], ['oitenta', 200, 600], ['e', 600, 700], ['nove', 700, 1000], ['por', 1000, 1200], ['cinquenta', 1200, 1700], ['e', 1700, 1800], ['nove', 1800, 2100]], 'de R$ 89 por R$ 59')
  assert.deepEqual(dois.filter((p) => p[0] === '89' || p[0] === '59'), [['89', 200, 1000], ['59', 1200, 2100]])
}))

test('alinhar mantem como antes os casos sem R$ no roteiro', () => comTemp((d) => {
  const W = (s) => s.split(' ').map((t, i) => [t, i * 400, i * 400 + 400])
  assert.deepEqual(alinhar(d, W('oi Claudio tudo bem'), 'oi Claude tudo bem'), [['oi', 0, 400], ['Claude', 400, 800], ['tudo', 800, 1200], ['bem', 1200, 1600]])
  // "reais" sem R$ no roteiro segue mantido (ele pode ter falado mesmo)
  assert.deepEqual(alinhar(d, W('custa 10 reais hoje'), 'custa 10 hoje'), [['custa', 0, 400], ['10', 400, 800], ['reais', 800, 1200], ['hoje', 1200, 1600]])
  assert.deepEqual(alinhar(d, W('eu a vi o mundo lindo'), 'eu vi o mundo'), [['eu', 0, 800], ['vi', 800, 1200], ['o', 1200, 1600], ['mundo', 1600, 2000], ['lindo', 2000, 2400]])
  assert.deepEqual(alinhar(d, W('comprei no mercado'), 'comprei hoje no mercado'), [['comprei', 0, 200], ['hoje', 200, 400], ['no', 400, 800], ['mercado', 800, 1200]])
}))

test('paginas-legenda gera JSON com no maximo 3 palavras por pagina', () => comTemp((d) => {
  const leg = join(d, 'leg.json'), sai = join(d, 'paginas.json')
  const palavras = 'um dois tres quatro cinco seis sete'.split(' ')
  writeFileSync(leg, JSON.stringify(palavras.map((t, i) => ({ text: ' ' + t, startMs: i * 400, endMs: i * 400 + 380 }))))
  const r = py('paginas-legenda.py', [leg, sai])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const p = JSON.parse(readFileSync(sai, 'utf8'))
  assert.ok(p.length >= 3, 'esperava varias paginas')
  assert.ok(p.every((x) => x.palavras.length >= 1 && x.palavras.length <= 3))
  assert.equal(p.flatMap((x) => x.palavras).join(' '), palavras.join(' '))
  assert.ok(p.every((x) => typeof x.ini === 'number' && typeof x.fim === 'number' && x.fim > x.ini))
}))

test('paginas-camadas grava paginas, palavras e duracao da voz em um JSON', () => comTemp((d) => {
  const ali = join(d, 'voz.alinhado.json'), voz = join(d, 'voz.wav'), sai = join(d, 'camadas.json')
  const palavras = 'um dois tres quatro'.split(' ')
  writeFileSync(ali, JSON.stringify(palavras.map((t, i) => ({ text: ' ' + t, startMs: i * 400, endMs: i * 400 + 380 }))))
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=2:r=48000', voz)
  const r = py('paginas-camadas.py', ['--alinhado', ali, '--voz', voz, '--saida', sai])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const j = JSON.parse(readFileSync(sai, 'utf8'))
  assert.ok(Math.abs(j.duracaoSeg - 2) < 0.01)
  assert.ok(j.paginas.length >= 2 && j.paginas.every((p) => p.palavras.length <= 2))
  assert.equal(j.palavras.length, 4)
}))

// decupagem do passo 3.2b (5.47): as tres secoes e uma linha "sim" com motivo por trecho
function decupagem(d, trechos, { secoes = ['Assunto', 'Gancho', 'Arco'], motivo = 'fala inteira e de frente', extra = [] } = {}) {
  const arq = join(d, 'decupagem.md')
  writeFileSync(arq, ['# Decupagem', '', ...secoes.flatMap((s) => [`## ${s}`, 'texto da secao', '']), '## Cortes', '',
    '| trecho | fica | motivo |', '|---|---|---|', ...trechos.map((t) => `| ${t} | sim | ${motivo} |`), ...extra, ''].join('\n'))
  return ['--decupagem', arq]
}

test('montar-blocos junta os trechos e imprime os cortes medidos', () => comTemp((d) => {
  const bruto = join(d, 'bruto.mp4'), sai = join(d, 'montado.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  const r = py('montar-blocos.py', [bruto, sai, '0.5:1.5', '2.5:3.5', ...decupagem(d, ['0.5:1.5', '2.5:3.5'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /2 blocos/)
  assert.ok(existsSync(sai))
  assert.ok(Math.abs(Number(sonda(sai, { sel: 'v:0', campo: 'width' })) - 1080) < 1)
  // o corte da decupagem e o final, sem folga somada: 1 s + 1 s
  assert.ok(Math.abs(duracao(sai) - 2) < 0.1, String(duracao(sai)))
}))

test('5.47: montar-blocos recusa sem decupagem, com trecho fora dela, sem motivo, sem secao e com sobreposicao', () => comTemp((d) => {
  const bruto = join(d, 'bruto.mp4'), sai = join(d, 'montado.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  const recusa = (args, padrao) => {
    const r = py('montar-blocos.py', [bruto, sai, ...args])
    assert.notEqual(r.status, 0, 'devia recusar: ' + args.join(' '))
    assert.match(semTraco(r.stderr), padrao)
    assert.equal(existsSync(sai), false)
  }
  recusa(['0.5:1.5'], /--decupagem/)
  recusa(['0.5:1.5', '--decupagem', join(d, 'nao-existe.md')], /assista o cru/)
  recusa(['0.5:1.5', '2.5:3.5', ...decupagem(d, ['0.5:1.5'])], /2[.]5:3[.]5 nao esta na tabela/)
  recusa(['0.5:1.5', ...decupagem(d, ['0.5:1.5', '2.5:3.5'])], /marca 2[.]5:3[.]5 como 'sim', mas ele nao foi passado/)
  recusa(['0.5:1.5', ...decupagem(d, ['0.5:1.5'], { motivo: '' })], /sem motivo/)
  recusa(['0.5:1.5', ...decupagem(d, ['0.5:1.5'], { secoes: ['Assunto', 'Arco'] })], /Gancho/)
  recusa(['0.5:1.6', '1.5:2.5', ...decupagem(d, ['0.5:1.6', '1.5:2.5'])], /se sobrepoem/)
  // canario: a mesma tabela com a linha "nao" a mais e trechos encostados monta
  const r = py('montar-blocos.py', [bruto, sai, '0.5:1.5', '1.5:2.5', ...decupagem(d, ['0.5:1.5', '1.5:2.5'], { extra: ['| 2.6:3.5 | nao | tropeco, repetiu depois |'] })])
  assert.equal(r.status, 0, semTraco(r.stderr))
}))

test('5.48: montar-blocos poe rampa na emenda: a voz nao salta do zero ao pico no primeiro milissegundo', () => comTemp((d) => {
  // 250 Hz (periodo de 4 ms): o bloco 1 acaba em fase zero (1,500 s) e o bloco 2 comeca no pico (2,501 s)
  const bruto = join(d, 'bruto.mp4'), sai = join(d, 'montado.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=250:d=4:sample_rate=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', join(d, 'bruto.mov'))
  ff('-i', join(d, 'bruto.mov'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', bruto)
  const r = py('montar-blocos.py', [bruto, sai, '0.500:1.500', '2.501:3.500', ...decupagem(d, ['0.500:1.500', '2.501:3.500'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const x = amostras(sai, 0, 2, 48000)
  const pico = Math.max(...x.slice(48000 * 0.3, 48000 * 0.7).map(Math.abs))
  const junta = Math.max(...x.slice(48000, 48000 + 48).map(Math.abs))   // o primeiro 1 ms do bloco 2
  assert.ok(pico > 0.1, `canario: o tom chegou ao montado (pico ${pico})`)
  assert.ok(junta < 0.35 * pico, `degrau na emenda: ${junta} contra pico ${pico}`)
}))

test('5.48: montar-blocos grava o emendas.md e marca voz cortada na borda', () => comTemp((d) => {
  // fala de 0,5 a 1,5 s e de 2,5 a 3,5 s, silencio no resto
  const bruto = join(d, 'bruto.mp4'), sai = join(d, 'trab', 'montado.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=4', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,0.5,1.5)+between(t,2.5,3.5),0.5*sin(2*PI*300*t),0)':s=48000:d=4",
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', bruto)
  const tabela = () => readFileSync(join(d, 'trab', 'emendas.md'), 'utf8')
  // canario: cortes na pausa, emenda limpa
  let r = py('montar-blocos.py', [bruto, sai, '0.30:1.70', '2.30:3.70', ...decupagem(d, ['0.30:1.70', '2.30:3.70'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /emendas: 1 conferidas, 0 com aviso/)
  assert.match(tabela(), /^\| 1 \| 1[.]40 \| 1[.]70 > 2[.]30 \| sem rosto \| [0-9.]+ \| ok \|$/m)
  // o bloco 1 acaba no meio da fala: voz no fim; o 2 comeca na pausa
  r = py('montar-blocos.py', [bruto, sai, '0.30:1.20', '2.30:3.70', ...decupagem(d, ['0.30:1.20', '2.30:3.70'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /1 com aviso/)
  assert.match(tabela(), /\| sem rosto \| - \| voz no fim do bloco \|$/m)
  assert.doesNotMatch(tabela(), /voz no comeco/)
}))

test('5.48: pulo do rosto em larguras de rosto, None sem rosto num dos lados', () => comTemp((d) => {
  const r = funcaoDoPy('emendas.py', 'pulo', [
    'assert f((100, 100, 50), (100, 100, 50)) == 0',
    'assert abs(f((100, 100, 50), (130, 140, 50)) - 1.0) < 1e-9  # 50 px de deslocamento numa largura de 50',
    'assert abs(f((100, 100, 40), (100, 100, 60)) - 0.4) < 1e-9  # so a largura muda: 20 sobre a media 50',
    'assert f(None, (1, 1, 1)) is None and f((1, 1, 1), None) is None',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(r.stdout, /ok/)
}))

test('5.47: achar_trechos divide o corrido nas pausas curtas e deixa a gravacao com silencio como era', () => comTemp((d) => {
  const r = funcaoDoPy('blocos.py', 'achar_trechos', [
    'J = 20  # janelas por segundo (passo 0,05 s)',
    '# com silencio: 3 frases de 2 s com 2 s de silencio (-60 dB) entre elas',
    'db = np.full(14 * J, -60.0)',
    'for ini in (1, 5, 9): db[ini * J:(ini + 2) * J] = -10',
    'piso, t = f(db)',
    'assert [(round(i, 2), round(fim, 2)) for i, fim in t] == [(1.0, 3.0), (5.0, 7.0), (9.0, 11.0)], t',
    '# corrido: 20 s de fala sem silencio, com uma pausa de 0,2 s (-25 dB) a cada 1,5 s: o percentil 10 cai na fala',
    'db = np.full(20 * J, -10.0)',
    'for k in range(1, 13): db[int(k * 1.5 * J):int(k * 1.5 * J) + 4] = -25',
    'piso, t = f(db, max_frase=7.0)',
    'assert len(t) >= 3 and max(fim - i for i, fim in t) <= 7.0, t',
    'assert all(t[k][1] <= t[k + 1][0] for k in range(len(t) - 1)), t',
    'piso, t1 = f(db, max_frase=1e9)',
    'assert len(t1) == 1, t1  # canario: sem o limite, o corrido vira um trecho so',
    '# ruido de fundo alto entre frases (-20 dB) passa no limiar global; o local separa as frases',
    'db = np.full(30 * J, -60.0); db[4 * J:26 * J] = -20',
    'for ini in (5, 12, 19): db[ini * J:(ini + 3) * J] = -7',
    'piso, t1 = f(db, max_frase=1e9)',
    'assert len(t1) == 1, t1  # canario: no limiar global o ruido e fala e vira um trecho so de 22 s',
    'piso, t = f(db, max_frase=7.0)',
    'assert [(round(i, 2), round(fim, 2)) for i, fim in t] == [(5.0, 8.0), (12.0, 15.0), (19.0, 22.0)], t',
    '# pausa curta a 0,4 s do comeco: partir ali deixaria um pedaco menor que o minimo, que sumiria (achado da comum)',
    'db = np.full(160, -10.0); db[8:12] = -30',
    'piso, t = f(db, max_frase=7.0)',
    'assert round(t[0][0], 2) == 0.0 and round(t[-1][1], 2) == 8.0, t',
    '# fala de 0,4 s separada por 0,6 s no limiar local: gruda no vizinho em vez de sumir (achado da final)',
    'db = np.full(240, -60.0); db[20:220] = -10; db[28:40] = -30',
    'piso, t = f(db, max_frase=7.0)',
    'assert round(t[0][0], 2) == 1.0 and round(t[-1][1], 2) == 11.0, t',
    '# fala mais baixa nas bordas sem frase a separar: o trecho fica inteiro (segunda volta da final)',
    'db = np.full(260, -60.0); db[20:240] = -10; db[20:60] = -25; db[200:240] = -25',
    'piso, t = f(db, max_frase=7.0)',
    'assert round(t[0][0], 2) == 1.0 and round(t[-1][1], 2) == 12.0, t',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(r.stdout, /ok/)
}))

test('5.47: assistir-cru a 25 fps pega quadro em tempo entre dois quadros, sem borda preta (achado da comum)', () => comTemp((d) => {
  const bruto = join(d, 'bruto.mp4'), blocos = join(d, 'blocos.md'), cru = join(d, 'cru')
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x568:r=25:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  // inicio 1,02: o corte sugerido cai em 0,82, entre os quadros de 0,80 e 0,84
  writeFileSync(blocos, ['| n | inicio (s) | fim (s) | dur (s) | whisper |', '|---|---|---|---|---|', '| 1 | 1.02 | 2.02 | 1.00 | frase |', ''].join('\n'))
  const r = py('assistir-cru.py', [bruto, blocos, cru])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(readFileSync(join(cru, 'bordas.md'), 'utf8'), /0[.]82:2[.]17/, 'canario: o corte sugerido cai entre dois quadros')
  // 6 quadros de 216 de largura; o miolo de cada um (fora do rotulo de baixo) tem de ser branco
  const px = spawnSync('ffmpeg', ['-v', 'error', '-i', join(cru, 'tira-01.jpg'), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 24 }).stdout
  for (let k = 0; k < 6; k++) {
    let soma = 0
    for (let y = 50; y < 300; y++) for (let x = k * 216 + 20; x < k * 216 + 196; x++) soma += px[y * 1296 + x]
    assert.ok(soma / (250 * 176) > 200, `quadro ${k + 1} da tira saiu escuro: ${soma / (250 * 176)}`)
  }
}))

test('5.47: assistir-cru grava folhas, uma tira por trecho e o bordas.md com o corte sugerido sem invadir o vizinho', () => comTemp((d) => {
  const bruto = join(d, 'bruto.mp4'), blocos = join(d, 'blocos.md'), cru = join(d, 'cru')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=300:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  writeFileSync(blocos, ['| n | inicio (s) | fim (s) | dur (s) | whisper |', '|---|---|---|---|---|',
    '| 1 | 1.00 | 2.00 | 1.00 | primeira frase |', '| 2 | 2.10 | 3.00 | 0.90 | segunda frase |', ''].join('\n'))
  const r = py('assistir-cru.py', [bruto, blocos, cru])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.ok(existsSync(join(cru, 'folha-01.jpg')))
  assert.ok(existsSync(join(cru, 'tira-01.jpg')) && existsSync(join(cru, 'tira-02.jpg')))
  const md = readFileSync(join(cru, 'bordas.md'), 'utf8')
  // folga de 0,15 s e 0,20 s cortada no meio da pausa de 0,10 s: 2,05 dos dois lados
  assert.match(md, /[|] 1 [|] 1[.]00:2[.]00 [|] 0[.]80:2[.]05 [|]/)
  assert.match(md, /[|] 2 [|] 2[.]10:3[.]00 [|] 2[.]05:3[.]15 [|]/)
  // a imagem de teste nao tem rosto: a borda sai marcada
  assert.match(md, /sem rosto em 0[.]80/)
  // de novo na mesma pasta com um trecho so: a tira 2 da rodada anterior sai (achado da final)
  writeFileSync(blocos, ['| n | inicio (s) | fim (s) | dur (s) | whisper |', '|---|---|---|---|---|', '| 1 | 1.00 | 2.00 | 1.00 | primeira frase |', ''].join('\n'))
  const r2 = py('assistir-cru.py', [bruto, blocos, cru])
  assert.equal(r2.status, 0, semTraco(r2.stderr))
  assert.ok(existsSync(join(cru, 'tira-01.jpg')), 'canario: a tira 1 foi gravada de novo')
  assert.equal(existsSync(join(cru, 'tira-02.jpg')), false, 'a tira 2 da rodada anterior ficou na pasta')
  const m = funcaoDoPy('assistir-cru.py', 'marca_rosto', [
    'frente = np.array([[0, 0, 100, 100, 40, 40, 60, 40, 50, 55, 0, 0, 0, 0, 0.9]])',
    'virado = np.array([[0, 0, 100, 100, 40, 40, 60, 40, 58, 55, 0, 0, 0, 0, 0.9]])',
    'assert f(frente) == "", f(frente)',
    'assert f(virado) == "virado", f(virado)',
    'assert f(None) == "sem rosto"',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(m.status, 0, semTraco(m.stderr) + semTraco(m.stdout))
  assert.match(m.stdout, /ok/)
}))

// P1: caixa branca (largura x altura) do quadrado no primeiro quadro, em cinza
function caixaBranca(arq) {
  const q = spawnSync('ffmpeg', ['-v', 'error', '-ss', '0.3', '-i', arq, '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 25 })
  assert.equal(q.stdout.length, 1080 * 1920, 'quadro de saida fora de 1080x1920')
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let y = 0; y < 1920; y++) for (let x = 0; x < 1080; x++) if (q.stdout[y * 1080 + x] > 200) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  assert.ok(x1 > 0, 'nao achei o quadrado branco na saida')
  return { l: x1 - x0 + 1, a: y1 - y0 + 1 }
}
// bruto preto com um quadrado branco de 60x60 no centro
function brutoQuadrado(d, nome, s) {
  const v = join(d, nome)
  const [w, h] = s.split('x').map(Number)
  ff('-f', 'lavfi', '-i', `color=c=black:s=${s}:r=30:d=2`, '-f', 'lavfi', '-i', 'sine=f=300:d=2',
    '-vf', `drawbox=x=${w / 2 - 30}:y=${h / 2 - 30}:w=60:h=60:color=white:t=fill`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', v)
  return v
}
function girar(d, ent, nome) {
  const v = join(d, nome)
  ff('-display_rotation', '90', '-i', ent, '-c', 'copy', v)
  return v
}
const quadrado = (c) => Math.abs(c.l / c.a - 1) < 0.05

test('P1: canario, o bruto vertical de controle sai com o quadrado quadrado e sem aviso', () => comTemp((d) => {
  const b = brutoQuadrado(d, 'vert.mp4', '360x640'), s = join(d, 's.mp4')
  const r = py('montar-blocos.py', [b, s, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.doesNotMatch(r.stdout, /aviso/)
  const c = caixaBranca(s)
  assert.ok(quadrado(c), JSON.stringify(c))
}))

test('P1: corte central, bruto deitado sai cortado no centro, sem esticar, e avisa', () => comTemp((d) => {
  const b = brutoQuadrado(d, 'deitado.mp4', '640x360'), s = join(d, 's.mp4')
  const r = py('montar-blocos.py', [b, s, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /fora de 9:16/)
  assert.equal(sonda(s, { sel: 'v:0', campo: 'sample_aspect_ratio' }), '1:1')
  const c = caixaBranca(s)
  assert.ok(quadrado(c), 'quadrado esticado: ' + JSON.stringify(c))
}))

test('P1: corte central, bruto quadrado sai cortado no centro, sem esticar', () => comTemp((d) => {
  const b = brutoQuadrado(d, 'q.mp4', '480x480'), s = join(d, 's.mp4')
  const r = py('montar-blocos.py', [b, s, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /fora de 9:16/)
  const c = caixaBranca(s)
  assert.ok(quadrado(c), 'quadrado esticado: ' + JSON.stringify(c))
}))

test('P1: corte central com rotacao do celular, em pe gravado com rotacao nao avisa e deitado com rotacao corta', () => comTemp((d) => {
  const deit = brutoQuadrado(d, 'deitado.mp4', '640x360'), vert = brutoQuadrado(d, 'vert.mp4', '360x640')
  const emPe = girar(d, deit, 'empe-rot.mp4'), deitRot = girar(d, vert, 'deitado-rot.mp4')
  assert.match(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_side_data=rotation', '-of', 'csv=p=0', emPe], { encoding: 'utf8' }).stdout, /90/, 'canario: a rotacao nao foi gravada')
  const s1 = join(d, 's1.mp4'), s2 = join(d, 's2.mp4')
  const r1 = py('montar-blocos.py', [emPe, s1, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])]), r2 = py('montar-blocos.py', [deitRot, s2, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])])
  assert.equal(r1.status, 0, semTraco(r1.stderr)); assert.equal(r2.status, 0, semTraco(r2.stderr))
  assert.doesNotMatch(r1.stdout, /fora de 9:16/)
  assert.match(r2.stdout, /fora de 9:16/)
  const c1 = caixaBranca(s1), c2 = caixaBranca(s2)
  assert.ok(quadrado(c1) && quadrado(c2), JSON.stringify({ c1, c2 }))
}))

// R menos B de um pixel do meio: cor do bt2020 lida como bt709 sai desbotada
// (medido no prototipo: 164,100,60 so remarcado; 177,69,42 com tonemap)
function espalhamento(arq) {
  const q = spawnSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', arq, '-frames:v', '1', '-vf', 'crop=2:2:500:900,format=rgb24', '-f', 'rawvideo', '-'])
  assert.equal(q.stdout.length, 12)
  return q.stdout[0] - q.stdout[2]
}
function brutoHdr(d, trc) {
  const v = join(d, `hdr-${trc}.mp4`)
  ff('-f', 'lavfi', '-i', 'color=c=0xA06040:s=360x640:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-vf', 'format=yuv420p10le',
    '-c:v', 'libx265', '-x265-params', `log-level=none:colorprim=bt2020:transfer=${trc}:colormatrix=bt2020nc`, '-c:a', 'aac', v)
  assert.equal(sonda(v, { sel: 'v:0', campo: 'color_transfer' }), trc, 'canario: o bruto sintetico nao saiu marcado HDR')
  return v
}

for (const trc of ['arib-std-b67', 'smpte2084']) {
  test(`P1: HDR ${trc} sai em bt709, com a cor convertida, e avisa`, () => comTemp((d) => {
    // canario de ambiente: sem zscale o teste reprovaria pelo motivo errado
    const filtros = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout
    assert.ok(/\szscale\s/.test(filtros) && /\stonemap\s/.test(filtros), 'este ffmpeg nao tem zscale; rode /configurar-video')
    const s = join(d, 's.mp4')
    const r = py('montar-blocos.py', [brutoHdr(d, trc), s, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])])
    assert.equal(r.status, 0, semTraco(r.stderr))
    assert.match(r.stdout, /HDR .*convertido/)
    assert.equal(sonda(s, { sel: 'v:0', campo: 'color_transfer' }), 'bt709')
    assert.equal(sonda(s, { sel: 'v:0', campo: 'color_primaries' }), 'bt709')
    const e = espalhamento(s)
    assert.ok(e > 120, 'cor desbotada: ' + e)
  }))
}

test('P1: HDR sem zscale sai remarcado em bt709 com aviso de cor lavada', () => comTemp((d) => {
  const s = join(d, 's.mp4')
  const r = py('montar-blocos.py', [brutoHdr(d, 'arib-std-b67'), s, '0.3:1.5', ...decupagem(d, ['0.3:1.5'])], { env: { ...ENV, EDITAR_VIDEO_SEM_ZSCALE: '1' } })
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /nao tem o filtro zscale/)
  assert.equal(sonda(s, { sel: 'v:0', campo: 'color_transfer' }), 'bt709')
  const e = espalhamento(s)
  assert.ok(e < 120, 'canario da medida de cor: sem tonemap devia sair desbotado, deu ' + e)
}))

test('mix-final e loudness: o master sai e o gate passa', () => comTemp((d) => {
  const render = join(d, 'render.mp4'), musica = join(d, 'musica.wav'), sai = join(d, 'final.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=160x284:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3:r=48000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', render)
  ff('-f', 'lavfi', '-i', 'sine=f=220:d=3:r=48000', musica)
  const m = py('mix-final.py', [render, musica, sai])
  assert.equal(m.status, 0, semTraco(m.stderr) + semTraco(m.stdout))
  assert.ok(existsSync(sai))
  const l = py('loudness.py', [sai])
  assert.equal(l.status, 0, semTraco(l.stdout) + semTraco(l.stderr))
  assert.match(l.stdout, /PASSOU/)
}))

test('zona-segura passa num video preto', () => comTemp((d) => {
  const v = join(d, 'preto.mp4')
  ff('-f', 'lavfi', '-i', 'color=c=black:s=270x480:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', v)
  const r = py('zona-segura.py', [v])
  assert.equal(r.status, 0, semTraco(r.stdout) + semTraco(r.stderr))
}))

function verdeComQuadrado(d, comAudio = true) {
  const v = join(d, 'verde.mp4')
  const entradas = ['-f', 'lavfi', '-i', 'color=c=0x00ff00:s=160x288:r=30:d=1', ...(comAudio ? ['-f', 'lavfi', '-i', 'sine=f=300:d=1'] : [])]
  ff(...entradas, '-vf', 'drawbox=x=60:y=100:w=40:h=60:color=red:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(comAudio ? ['-c:a', 'aac'] : []), v)
  return v
}

test('recortar-verde gera pessoa.webm com canal alfa, voz e bruto-pad', () => comTemp((d) => {
  const v = verdeComQuadrado(d), saida = join(d, 'saida')
  const r = py('recortar-verde.py', ['--bruto', v, '--saida-dir', saida, '--lo', '0.10', '--hi', '0.30'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const webm = join(saida, 'pessoa.webm')
  assert.ok(existsSync(webm))
  assert.equal(sonda(webm, { sel: 'v:0', campo: 'pix_fmt' }, ['-c:v', 'libvpx-vp9']), 'yuva420p')
  assert.ok(existsSync(join(saida, 'voz.wav')))
  assert.ok(existsSync(join(saida, 'bruto-pad.mp4')))
  // o recorte tem que ter tirado o verde e mantido o quadrado vermelho (canal alfa lido de verdade)
  const q = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', webm, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 })
  assert.equal(q.stdout.length, 160 * 288 * 4)
  const px = (x, y) => [...q.stdout.subarray((y * 160 + x) * 4, (y * 160 + x) * 4 + 4)]
  assert.equal(px(5, 5)[3], 0, 'o fundo verde devia ficar transparente')
  const dentro = px(80, 130)
  assert.ok(dentro[3] > 250 && dentro[0] > 200 && dentro[1] < 60, 'o quadrado vermelho devia ficar opaco: ' + dentro)
}))

test('recortar-verde com --filtro-pessoa roda o filtro e --preview grava um quadro', () => comTemp((d) => {
  const v = verdeComQuadrado(d), saida = join(d, 'saida')
  const a = py('recortar-verde.py', ['--bruto', v, '--saida-dir', saida, '--filtro-pessoa'])
  assert.equal(a.status, 0, semTraco(a.stderr) + semTraco(a.stdout))
  assert.ok(existsSync(join(saida, 'pessoa.webm')))
  const b = py('recortar-verde.py', ['--bruto', v, '--saida-dir', saida, '--preview', '0.2'])
  assert.equal(b.status, 0, semTraco(b.stderr))
  assert.ok(existsSync(join(saida, 'recorte.jpg')))
}))

test('chroma grava o quadro de previa com o fundo trocado', () => comTemp((d) => {
  const v = verdeComQuadrado(d), fundo = join(d, 'fundo.jpg'), sai = join(d, 'previa.jpg')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=160x288:d=1', '-frames:v', '1', fundo)
  const r = py('chroma.py', [v, fundo, sai, '--preview', '0'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.ok(existsSync(sai))
}))

test('sincronizar-bruto calcula o atempo de um audio 1 s mais longo que o video', () => comTemp((d) => {
  const ent = join(d, 'celular.mp4'), sai = join(d, 'sinc.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=160x284:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=300:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', ent)
  const r = py('sincronizar-bruto.py', [ent, sai])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const m = /atempo ([0-9.]+)/.exec(r.stdout)
  assert.ok(m, 'sem atempo na saida: ' + r.stdout)
  const esperado = Number(sonda(ent, { sel: 'a:0', campo: 'duration' })) / Number(sonda(ent, { sel: 'v:0', campo: 'duration' }))
  assert.ok(Math.abs(Number(m[1]) - esperado) < 0.01, `${m[1]} contra ${esperado}`)
  assert.ok(Math.abs(Number(m[1]) - 4 / 3) < 0.05)
  assert.ok(existsSync(sai))
}))

test('preparar-props gera props que o schemaVideoV2 aceitaria', () => comTemp((d) => {
  const pub = join(d, 'public')
  mkdirSync(join(pub, 'sfx'), { recursive: true })
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=3:r=48000', join(pub, 'voz.wav'))
  ff('-f', 'lavfi', '-i', 'sine=f=900:d=0.5:r=48000', join(pub, 'sfx', 'pop.wav'))
  const palavras = ['o', 'prazo', 'acaba', 'logo']
  writeFileSync(join(pub, 'voz.alinhado.json'), JSON.stringify(palavras.map((t, i) => ({ text: ' ' + t, startMs: 500 + i * 500, endMs: 500 + i * 500 + 450 }))))
  const edicao = join(d, 'edicao.json'), sai = join(d, 'props.json')
  writeFileSync(edicao, JSON.stringify({
    pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', duracaoSeg: 3, cortesSeg: [1.5], segmentos: [],
    chaves: [{ apoio: 'o primeiro criterio', chave: 'PRAZO', deSeg: { palavra: 'prazo', mais: -0.1 }, ateSeg: 2.5, topo: 400 }],
    sfx: [{ arquivo: 'sfx/pop.wav', seg: { palavra: 'prazo' }, duracaoSeg: 0.3, dbVoz: -7 }],
  }))
  const r = py('preparar-props.py', [edicao, sai, '--public-dir', pub])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const p = JSON.parse(readFileSync(sai, 'utf8'))
  // campos sem valor padrao no schemaVideoV2 (herdados do VideoV1): tem que vir todos
  for (const campo of ['pessoa', 'voz', 'legendas', 'duracaoSeg', 'cortesSeg', 'segmentos']) assert.ok(campo in p, `faltou ${campo}`)
  assert.equal(p.alturaTela, 0)
  assert.equal(p.recorteTopoPessoa, 0)
  assert.equal(p.duracaoSeg, 3)
  assert.ok(Math.abs(p.chaves[0].deSeg - 0.9) < 0.01, 'palavra "prazo" comeca em 1,0 s e a chave entra 0,1 s antes')
  assert.equal(typeof p.sfx[0].seg, 'number')
  assert.equal(p.sfx[0].volume, 1)
  assert.ok(existsSync(join(pub, p.sfx[0].arquivo)), 'o som tratado tem que estar no public')
  assert.ok(Number(sonda(join(pub, p.sfx[0].arquivo), { sel: 'a:0', campo: 'sample_rate' })) > 0)
}))

// O render passa as props por --props e o Remotion as mistura com o defaultProps do Root.tsx, que e o exemplo:
// campo que o exemplo preenche e o edicao.json omite vinha do exemplo (a chave PRAZO de 0,5 a 2,5 s)
test('C1: preparar-props grava todo campo que o exemplo do Studio preenche, sem herdar nada dele', () => comTemp((d) => {
  const exemplo = JSON.parse(readFileSync(join(AQUI, '..', 'exemplos', 'videov2-exemplo.json'), 'utf8'))
  assert.ok(exemplo.chaves.length > 0 && 'sfx' in exemplo, 'canario: o exemplo preenche chaves e sfx')
  assert.ok(readFileSync(join(AQUI, '..', 'src', 'Root.tsx'), 'utf8').includes('defaultProps={schemaVideoV2.parse(exemplo)}'), 'canario: o Root usa o exemplo como defaultProps')
  const pub = join(d, 'public')
  mkdirSync(pub, { recursive: true })
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=3:r=48000', join(pub, 'voz.wav'))
  writeFileSync(join(pub, 'voz.alinhado.json'), JSON.stringify([{ text: ' oi', startMs: 100, endMs: 600 }]))
  const edicao = join(d, 'edicao.json'), sai = join(d, 'props.json')
  writeFileSync(edicao, JSON.stringify({ pessoa: 'p.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json' }))
  const r = py('preparar-props.py', [edicao, sai, '--public-dir', pub])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const p = JSON.parse(readFileSync(sai, 'utf8'))
  const campos = Object.keys(exemplo)
  assert.ok(campos.length >= 10, 'canario: campos do exemplo lidos')
  for (const c of campos) assert.ok(c in p, `o exemplo preenche "${c}" e as props nao: o video herdaria o do exemplo`)
  assert.deepEqual(p.chaves, [])
  assert.deepEqual(p.sfx, [])
}))

test('preparar-props recusa palavra que nao esta na legenda', () => comTemp((d) => {
  const pub = join(d, 'public')
  mkdirSync(pub, { recursive: true })
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=3:r=48000', join(pub, 'voz.wav'))
  writeFileSync(join(pub, 'voz.alinhado.json'), JSON.stringify([{ text: ' oi', startMs: 0, endMs: 300 }]))
  const edicao = join(d, 'edicao.json')
  writeFileSync(edicao, JSON.stringify({
    pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', duracaoSeg: 3, cortesSeg: [], segmentos: [],
    chaves: [{ chave: 'X', deSeg: { palavra: 'inexistente' }, ateSeg: 2, topo: 400 }],
  }))
  const r = py('preparar-props.py', [edicao, join(d, 'props.json'), '--public-dir', pub])
  assert.notEqual(r.status, 0)
  assert.match(semTraco(r.stderr), /inexistente/)
}))

test('P6: camera lenta repete a palavra na metade da velocidade, imagem e voz do mesmo tamanho e o tom igual', () => comTemp((d) => {
  fala(d)
  assert.ok(Math.abs(dominante(amostras(join(d, 'voz.wav'), 1.1, 1.4)) - 440) <= 4, 'canario: o tom original devia dar 440 Hz')
  const sv = join(d, 'l', 'pessoa.mp4'), sa = join(d, 'l', 'voz.wav'), sl = join(d, 'l', 'leg.json')
  const r = py('camera_lenta.py', [join(d, 'pessoa.mp4'), join(d, 'voz.wav'), join(d, 'voz.alinhado.json'), sv, sa, sl, '--trecho', '1.0:1.5:0.5'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.equal(quadros(sv), 150, 'video: 4 s mais 1 s de lenta = 150 quadros')
  assert.ok(Math.abs(duracao(sa) - 5) < 0.01, `voz com ${duracao(sa)} s`)
  const fLenta = dominante(amostras(sa, 1.6, 2.4))
  assert.ok(Math.abs(fLenta - 440) <= 4, `o trecho lento devia ficar em 440 Hz e deu ${fLenta}`)
  assert.ok(Math.abs(dominante(amostras(sa, 3.6, 3.9)) - 660) <= 4, '"dois" andou 1 s e segue em 660 Hz')
  // imagem: o quadro 2k do trecho lento e o quadro k da palavra
  for (const k of [3, 7]) {
    const lento = quadroCinza(sv, 1.5 + (2 * k + 0.5) / 30), orig = quadroCinza(join(d, 'pessoa.mp4'), 1.0 + (k + 0.5) / 30)
    assert.ok(difer(lento, orig) < 6, `quadro ${k} da lenta difere do original em ${difer(lento, orig)}`)
  }
  const leg = JSON.parse(readFileSync(sl, 'utf8'))
  assert.deepEqual(leg.map((c) => [c.text.trim(), c.startMs, c.endMs]), [['um', 1000, 1490], ['um', 1500, 2480], ['ja', 2490, 2700], ['dois', 3500, 4000]], '"ja" comeca no meio do quadro do corte e vai pra depois da repeticao')
  assert.equal(leg[0].pageBreakAfter, true)
  assert.equal(leg[1].pageBreakAfter, true)
  // rodar de novo em cima da saida esticaria duas vezes: recusa
  const r2 = py('camera_lenta.py', [sv, sa, sl, join(d, 'm', 'p.mp4'), join(d, 'm', 'v.wav'), join(d, 'm', 'l.json'), '--trecho', '1.0:1.5:0.5'])
  assert.notEqual(r2.status, 0)
  assert.match(semTraco(r2.stderr), /ja passou pela camera lenta/)
}))

test('P6: fora do grid de meio segundo a imagem sai com o mesmo tamanho da voz e sem buraco', () => comTemp((d) => {
  fala(d)
  const sv = join(d, 'l', 'pessoa.mp4')
  const r = py('camera_lenta.py', [join(d, 'pessoa.mp4'), join(d, 'voz.wav'), join(d, 'voz.alinhado.json'), sv, join(d, 'l', 'voz.wav'), join(d, 'l', 'leg.json'), '--trecho', '0.8667:1.9:0.4'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const pts = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', sv], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/).map(Number)
  assert.ok(pts.length > 100, 'canario: leu os quadros')
  assert.equal(pts.length, Math.round(duracao(join(d, 'l', 'voz.wav')) * 30), 'quadros da imagem contra o tamanho da voz')
  const buracos = pts.slice(1).filter((t, i) => t - pts[i] > 1.5 / 30)
  assert.deepEqual(buracos, [])
}))

test('P6: preparar-props com cameraLenta anda cortes, escalas, chave e som e aponta pra lenta/', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  fala(pub)
  const edicao = join(d, 'edicao.json'), sai = join(d, 'props.json')
  writeFileSync(edicao, JSON.stringify({
    pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', cortesSeg: [2.0], escalasSeg: [1.0, 1.25],
    chaves: [{ chave: 'UM', deSeg: { palavra: 'um' }, ateSeg: { palavra: 'um', fim: true, mais: 0.2 }, topo: 400 }],
    cartoes: [{ deSeg: 3.1, ateSeg: 3.6, linhas: [{ texto: 'X', aSeg: 0.3 }] }],
    sfx: [{ arquivo: 'sfx/pop.wav', seg: { palavra: 'dois' } }],
    cameraLenta: [{ deSeg: { palavra: 'um' }, ateSeg: { palavra: 'um', fim: true }, fator: 0.5 }],
  }))
  const r = py('preparar-props.py', [edicao, sai, '--public-dir', pub])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const p = JSON.parse(readFileSync(sai, 'utf8'))
  assert.deepEqual(p.cortesSeg, [1.5, 2.5, 3.0])
  assert.deepEqual(p.escalasSeg, [1.0, 1.25, 1.0, 1.25])
  assert.deepEqual([p.chaves[0].deSeg, p.chaves[0].ateSeg], [1.0, 2.69], 'a chave do "um" atravessa a lenta')
  assert.deepEqual([p.cartoes[0].deSeg, p.cartoes[0].ateSeg, p.cartoes[0].linhas[0].aSeg], [4.1, 4.6, 0.3])
  assert.equal(p.sfx[0].seg, 3.5)
  assert.equal(p.duracaoSeg, 5)
  assert.deepEqual(p.lentas, [{ deSeg: 1.5, ateSeg: 2.5 }])
  assert.deepEqual([p.pessoa, p.voz, p.legendas], ['lenta/pessoa.mp4', 'lenta/voz.wav', 'lenta/legendas.json'])
  for (const a of [p.pessoa, p.voz, p.legendas]) assert.ok(existsSync(join(pub, a)), a)
}))

test('P6: preparar-props com corte colado no fim da palavra lenta nao duplica o corte e avisa da escala igual', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  fala(pub)
  const edicao = join(d, 'edicao.json'), sai = join(d, 'props.json')
  const base = { pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', cameraLenta: [{ deSeg: { palavra: 'um' }, ateSeg: { palavra: 'um', fim: true }, fator: 0.5 }] }
  // canario: corte longe da palavra continua virando 2 cortes novos mais o andado
  writeFileSync(edicao, JSON.stringify({ ...base, cortesSeg: [2.0] }))
  let r = py('preparar-props.py', [edicao, sai, '--public-dir', pub])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.deepEqual(JSON.parse(readFileSync(sai, 'utf8')).cortesSeg, [1.5, 2.5, 3], 'canario')
  // corte da montagem logo depois do "um" (1,5 s): anda pra 2,5 s, que ja e o fim da repeticao
  writeFileSync(edicao, JSON.stringify({ ...base, cortesSeg: [1.5], escalasSeg: [1.0, 1.25] }))
  r = py('preparar-props.py', [edicao, sai, '--public-dir', pub])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const p = JSON.parse(readFileSync(sai, 'utf8'))
  assert.deepEqual(p.cortesSeg, [1.5, 2.5])
  assert.deepEqual(p.escalasSeg, [1.0, 1.25, 1.25])
  assert.match(semTraco(r.stdout), /corte sai sem zoom/)
}))

// onda de voz (P7): voz de 2,5 s com 1 s de seno a 0,5, 1 s a 0,125 e 0,5 s de silencio
function vozDaOnda(d) {
  const pub = join(d, 'public')
  mkdirSync(pub, { recursive: true })
  ff('-f', 'lavfi', '-i', "aevalsrc='if(lt(t,1),0.5,if(lt(t,2),0.125,0))*sin(2*PI*300*t)':s=48000:d=2.5", '-c:a', 'pcm_f32le', join(pub, 'voz.wav'))
  writeFileSync(join(pub, 'voz.alinhado.json'), JSON.stringify([{ text: ' oi', startMs: 100, endMs: 600 }]))
  return (extra) => {
    const edicao = join(d, 'edicao.json'), sai = join(d, 'props.json')
    writeFileSync(edicao, JSON.stringify({ pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', duracaoSeg: 2.5, ...extra }))
    const r = py('preparar-props.py', [edicao, sai, '--public-dir', pub])
    return { r, props: () => JSON.parse(readFileSync(sai, 'utf8')) }
  }
}

test('P7: preparar-props mede a onda de um seno com volume conhecido, 30 valores por segundo', () => comTemp((d) => {
  const { r, props } = vozDaOnda(d)({ ondas: [{ deSeg: 0, ateSeg: 2.5 }] })
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const v = props().ondas[0].valores
  assert.equal(v.length, 75, '2,5 s a 30 por segundo')
  const media = (a) => a.reduce((s, x) => s + x, 0) / a.length
  // canario: o trecho alto tem de dar perto de 1, senao a medida nao rodou
  assert.ok(Math.abs(media(v.slice(2, 28)) - 1) < 0.02, 'trecho a 0,5 vale 1: ' + media(v.slice(2, 28)))
  assert.ok(Math.abs(media(v.slice(32, 58)) - 0.25) < 0.02, 'trecho a 0,125 vale 0,25: ' + media(v.slice(32, 58)))
  assert.ok(v.slice(62).every((x) => x === 0), 'silencio vale 0')
}))

test('P7: preparar-props mede a onda so no trecho da palavra', () => comTemp((d) => {
  const { r, props } = vozDaOnda(d)({ ondas: [{ deSeg: { palavra: 'oi', fim: true, mais: 0.9 }, ateSeg: 2.0 }] })
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const o = props().ondas[0]
  assert.equal(o.deSeg, 1.5)
  assert.equal(o.valores.length, 15)
  assert.ok(o.valores.every((x) => Math.abs(x - 0.25) < 0.03), JSON.stringify(o.valores))
}))

test('P7: preparar-props recusa onda curta, fora da zona segura ou em cima da legenda', () => comTemp((d) => {
  const rodar = vozDaOnda(d)
  // canarios: as bordas exatas passam (a legenda descida pra 1440 deixa a base util ser a borda)
  for (const extra of [{ topoLegenda: 1440, ondas: [{ deSeg: 0, ateSeg: 1, topo: 1286 }] }, { ondas: [{ deSeg: 0, ateSeg: 0.5 }] }, { topoLegenda: 1210, ondas: [{ deSeg: 0, ateSeg: 1 }] }]) {
    const { r } = rodar(extra)
    assert.equal(r.status, 0, JSON.stringify(extra) + ' ' + semTraco(r.stderr))
  }
  const casos = [
    [{ topoLegenda: 1440, ondas: [{ deSeg: 0, ateSeg: 1, topo: 1287 }] }, /zona segura/],
    [{ ondas: [{ deSeg: 0, ateSeg: 1, topo: 249 }] }, /zona segura/],
    [{ ondas: [{ deSeg: 0, ateSeg: 1, largura: 801 }] }, /zona segura/],
    [{ ondas: [{ deSeg: 0, ateSeg: 0.3 }] }, /curta demais/],
    [{ ondas: [{ deSeg: 1.5, ateSeg: 1.0 }] }, /curta demais/],
    [{ topoLegenda: 1200, ondas: [{ deSeg: 0, ateSeg: 1 }] }, /legenda/],
  ]
  for (const [extra, msg] of casos) {
    const { r } = rodar(extra)
    assert.notEqual(r.status, 0, JSON.stringify(extra))
    assert.match(semTraco(r.stderr), msg, JSON.stringify(extra))
  }
}))

test('P7: onda sem topoLegenda nas props respeita a legenda padrao', () => comTemp((d) => {
  const rodar = vozDaOnda(d)
  // canario: encostada na legenda padrao (1090 + 150 = 1240) passa
  const ok = rodar({ ondas: [{ deSeg: 0, ateSeg: 2, topo: 1090, altura: 150 }] })
  assert.equal(ok.r.status, 0, semTraco(ok.r.stderr))
  const { r } = rodar({ ondas: [{ deSeg: 0, ateSeg: 2, topo: 1200, altura: 150 }] })
  assert.notEqual(r.status, 0, 'onda de 1200 a 1350 cobre a legenda padrao em 1240')
  assert.match(semTraco(r.stderr), /legenda/)
}))

test('P7: o topoLegenda padrao do preparar-props bate com o do tema.ts', () => {
  const pyTxt = readFileSync(script('preparar-props.py'), 'utf8')
  const tema = readFileSync(join(AQUI, '..', 'src', 'tema.ts'), 'utf8')
  const doPy = [...pyTxt.matchAll(/props\.get\("topoLegenda", (\d+)\)/g)].map((m) => Number(m[1]))
  const doTema = [...tema.matchAll(/topoLegendaPadrao: (\d+)/g)].map((m) => Number(m[1]))
  assert.equal(doPy.length, 1, 'canario: o preparar-props le o topoLegenda com padrao uma vez so')
  assert.equal(doTema.length, 1, 'canario: o tema.ts tem um topoLegendaPadrao so')
  assert.equal(doPy[0], doTema[0], 'o padrao do preparar-props tem de ser o do tema.ts')
})

test('verificar-video le props em JSON, usa --public-dir e reprova pessoa sem rosto', () => comTemp((d) => {
  const pub = join(d, 'public')
  mkdirSync(pub, { recursive: true })
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=320x568:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(pub, 'pessoa.mp4'))
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=3:r=48000', join(pub, 'voz.wav'))
  const final = join(d, 'final.mp4')
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=320x568:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=300:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', final)
  const props = join(d, 'props.json')
  writeFileSync(props, JSON.stringify({ pessoa: 'pessoa.mp4', voz: 'voz.wav', duracaoSeg: 3, segmentos: [], sfx: [] }))
  const r = py('verificar-video.py', [props, final, '--bruto', final, '--public-dir', pub])
  const saida = semTraco(r.stdout) + semTraco(r.stderr)
  assert.equal(r.status, 1, saida)
  assert.match(saida, /FALHOU/)
  assert.match(saida, /nao achei rosto/)
  assert.doesNotMatch(saida, /Traceback/)
}))

test('fiscal lista as flags que o orquestrador precisa passar', () => {
  const r = py('fiscal.py', ['--help'])
  assert.equal(r.status, 0, semTraco(r.stderr))
  for (const f of ['--remotion', '--public-dir', '--props-base', '--ver-video', '--preco-usd', '--registrar-custo', '--transcrever', '--modelo', '--midia', '--acima-do-teto']) assert.ok(r.stdout.includes(f), `sem ${f}`)
})

// A transcricao do final so roda depois do render do Remotion, entao nao da pra isolar o ramo aqui: confere-se o codigo.
test('fiscal passa o modelo do whisper ao transcrever (e nao ha mais medium fixo)', () => {
  const src = readFileSync(join(AQUI, 'fiscal.py'), 'utf8')
  assert.ok(src.includes('str(leg), ARGS.modelo])'))
  assert.ok(!src.includes('"medium"])'))
  assert.match(src, /"--modelo", default="small"/)
})

// Portao pago do fiscal: o olho final (Gemini) so roda com roteiro, preco e autorizacao; o custo vira UMA linha.
const CLI_CUSTO = join(AQUI, '..', '..', '..', 'configurar-video', 'scripts', 'lib', 'registrar-custo-cli.mjs')
const linhasDe = (p) => readFileSync(p, 'utf8').split(String.fromCharCode(10)).filter((l) => l.trim())
// 5.52 (chat 3): projeto com orcamento do mes e, se pedido, a permissao de gasto escrita
function contexto(raiz, { orcamento = 10, permissao = null } = {}) {
  mkdirSync(join(raiz, '_contexto'), { recursive: true })
  writeFileSync(join(raiz, '_contexto', 'orcamento.md'), '```orcamento\norcamento_mes_usd: ' + orcamento + '\n```\n')
  if (permissao) writeFileSync(join(raiz, '_contexto', 'autonomia.md'), '```autonomia\narea: gasto-ia\npode: gastar\nteto: ' + permissao + '\n```\n')
}
function olho(d, { preco, autorizado, codigo, acima, projeto, verVideo, env }) {
  const marca = join(d, 'chamadas.txt'), raiz = join(d, 'raiz'), stub = verVideo || join(d, 'ver-video-falso.mjs')
  if (projeto) contexto(raiz, projeto)
  if (!verVideo) writeFileSync(stub, `import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(marca)}, 'chamado' + String.fromCharCode(10))
if (${codigo} === 0) console.log('VEREDITO: APROVADO')
process.exit(${codigo})
`)
  const final = join(d, 'final.mp4'), roteiro = join(d, 'roteiro.md')
  writeFileSync(final, 'x'); writeFileSync(roteiro, 'Fala: ola')
  const args = ['x', final, 'x', join(d, 'saida'), '--so-olho-final', '--roteiro', roteiro, '--ver-video', stub, '--registrar-custo', CLI_CUSTO, '--raiz-custo', raiz]
  if (preco !== undefined) args.push('--preco-usd', String(preco))
  if (autorizado) args.push('--autorizado')
  if (acima !== undefined) args.push('--acima-do-teto', String(acima))
  const r = py('fiscal.py', args, env ? { env: { ...ENV, ...env } } : {})
  const custos = join(raiz, 'dados', 'custos.jsonl')
  const ler = (rel) => existsSync(join(raiz, rel)) ? readFileSync(join(raiz, rel), 'utf8') : ''
  return {
    r, saida: semTraco(r.stdout) + semTraco(r.stderr),
    chamadas: existsSync(marca) ? linhasDe(marca).length : 0,
    linhas: existsSync(custos) ? linhasDe(custos).map((l) => JSON.parse(l)) : [],
    reservas: ler('dados/orcamento-reservas.json'), permissao: ler('dados/permissao-gastos.jsonl'),
  }
}

test('fiscal sem --preco-usd nao chama o olho final nem grava custo', () => comTemp((d) => {
  const o = olho(d, { autorizado: true, codigo: 0 })
  assert.equal(o.r.status, 0, o.saida)
  assert.equal(o.chamadas, 0)
  assert.equal(o.linhas.length, 0)
  assert.match(o.saida, /pulado/)
  assert.match(o.saida, /preco-usd/)
}))

// 5.52 (chat 3): sem permissao, igual a antes; com a permissao de gasto escrita, o olho final roda sem o sim
test('fiscal com preco e sem --autorizado: sem permissao nao chama o olho final; com permissao chama e avisa', () => comTemp((d) => {
  for (const [nome, projeto] of [['sem orcamento', undefined], ['sem permissao', {}]]) {
    const sub = join(d, nome)
    mkdirSync(sub)
    const o = olho(sub, { preco: 0.5, codigo: 0, projeto })
    assert.equal(o.chamadas, 0, nome)
    assert.equal(o.linhas.length, 0, nome)
    assert.match(o.saida, /olho final pulado \(e pago\): falta --autorizado \(o sim da pessoa\)/, nome)
  }
  const sub = join(d, 'com permissao')
  mkdirSync(sub)
  const o = olho(sub, { preco: 0.5, codigo: 0, projeto: { permissao: '2 USD semana' } })
  assert.equal(o.r.status, 0, o.saida)
  assert.equal(o.chamadas, 1)
  assert.equal(o.linhas.length, 1)
  assert.ok(o.linhas[0].reserva, 'a linha leva a reserva da liberacao')
  assert.match(o.saida, /foi pela permissao do _contexto\/autonomia\.md, resta US\$ 1\.50 de US\$ 2\.00 na semana/)
  assert.equal(o.permissao.trim().split(String.fromCharCode(10)).length, 1)
}))

// 5.52 (chat 3): o ver-video de verdade (so a rede e falsa, pelo NODE_OPTIONS), com o orcamento do mes igual ao preco:
// o fiscal reserva uma vez e o ver-video com a --reserva dele (conferida, conserto da interna) nao reserva de novo
const REDE_FALSA = `
import https from 'node:https'
import { EventEmitter } from 'node:events'
const resposta = (corpo, cab = {}) => ({ status: 200, ok: true, headers: new Headers(cab), json: async () => corpo, text: async () => JSON.stringify(corpo) })
globalThis.fetch = async (url, op = {}) => {
  const u = String(url)
  if (op.method === 'DELETE') return resposta({})
  if (u.includes('/upload/')) return resposta({}, { 'x-goog-upload-url': 'https://falso.invalido/subir' })
  if (u.startsWith('https://falso.invalido/subir')) return resposta({ file: { name: 'files/abc' } })
  return resposta({ state: 'ACTIVE', uri: 'https://falso.invalido/files/abc', name: 'files/abc', mimeType: 'video/mp4', models: [] })
}
https.request = (url, op, responder) => {
  const req = new EventEmitter()
  req.setTimeout = () => req
  req.end = () => setImmediate(() => {
    const res = new EventEmitter()
    res.statusCode = 200
    res.setEncoding = () => {}
    responder(res)
    res.emit('data', JSON.stringify({ candidates: [{ content: { parts: [{ text: 'VEREDITO: APROVADO' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }))
    res.emit('end')
  })
  return req
}
`
test('fiscal com o ver-video de verdade e saldo igual ao preco: uma reserva so, uma linha de custo', () => comTemp((d) => {
  const falsa = join(d, 'rede-falsa.mjs')
  writeFileSync(falsa, REDE_FALSA)
  const VER = join(AQUI, '..', '..', '..', 'assistir-video', 'ver-video.mjs')
  for (const [nome, autorizado, permissao] of [['permissao', false, '1 USD mes'], ['sim', true, null]]) {
    const sub = join(d, nome)
    mkdirSync(sub)
    const o = olho(sub, { preco: 0.5, autorizado, codigo: 0, projeto: { orcamento: 0.5, permissao }, verVideo: VER, env: { GEMINI_API_KEY: 'falsa', NODE_OPTIONS: `--import ${pathToFileURL(falsa).href}` } })
    assert.equal(o.r.status, 0, `${nome}: ${o.saida}`)
    assert.doesNotMatch(o.saida, /ver-video falhou|pulado/, nome)
    assert.equal(o.linhas.length, 1, `${nome}: ${o.saida}`)
    assert.equal(o.linhas[0].servico, 'gemini-fiscal-olho-final', nome)
    assert.deepEqual(JSON.parse(o.reservas), [], `${nome}: a reserva fechou`)
    assert.equal(o.permissao !== '', nome === 'permissao', `${nome}: so o gasto pela permissao entra na conta dela`)
  }
  // 5.52 (conserto da interna): no teto por lote, sem reserva, o ver-video passa pela trava com o mesmo sim e o
  // --sem-registro so tira a linha dele: uma linha de custo, a do fiscal
  const sub = join(d, 'lote')
  mkdirSync(sub)
  const o = olho(sub, { preco: 0.5, autorizado: true, codigo: 0, verVideo: VER, env: { GEMINI_API_KEY: 'falsa', NODE_OPTIONS: `--import ${pathToFileURL(falsa).href}` } })
  assert.equal(o.r.status, 0, `lote: ${o.saida}`)
  assert.doesNotMatch(o.saida, /ver-video falhou|pulado/, 'lote')
  assert.deepEqual(o.linhas.map((l) => l.servico), ['gemini-fiscal-olho-final'], `lote: ${o.saida}`)
}))

test('fiscal com preco e autorizacao chama o olho final uma vez e grava uma linha de custo', () => comTemp((d) => {
  const o = olho(d, { preco: 0.5, autorizado: true, codigo: 0 })
  assert.equal(o.r.status, 0, o.saida)
  assert.equal(o.chamadas, 1)
  assert.equal(o.linhas.length, 1)
  assert.equal(o.linhas[0].servico, 'gemini-fiscal-olho-final')
  assert.equal(o.linhas[0].usd, 0.5)
}))

// 5.49 (bloco C, 2026-11-03): sem orcamento do mes, a raiz de teste nao tem _contexto e vale o teto padrao de
// US$ 4 por lote; o olho final de US$ 5 so passa com o --acima-do-teto que cobre o preco (o ver-video e falso)
test('fiscal acima do teto por lote: sem --acima-do-teto ou com valor menor pula; com o valor citado chama uma vez', () => comTemp((d) => {
  // 5.49 (bloco C, 2026-11-03): sem a opcao, cobra a mensagem "este gasto ... passa", nao so o comoPassar comum
  // as duas; senao um fiscal que manda "--acima-do-teto None" passa calado com a mensagem de valor menor
  const casos = [[undefined, 0, /Barrada pela trava gasto, regra teto-do-lote: este gasto .* passa do limite_gasto_usd .* por lote: .*--acima-do-teto 5 --autorizado/], ['4', 0, /e menor que a estimativa/], ['5', 1, null]]
  for (const [acima, chamadas, motivo] of casos) {
    const sub = join(d, `caso-${acima ?? 'sem'}`)
    mkdirSync(sub)
    const o = olho(sub, { preco: 5, autorizado: true, codigo: 0, acima })
    assert.ok(o.saida.length > 0, 'canario: o fiscal escreveu alguma coisa')
    assert.equal(o.r.status, 0, o.saida)
    assert.equal(o.chamadas, chamadas, `--acima-do-teto ${acima}: ${o.saida}`)
    assert.equal(o.linhas.length, chamadas)
    if (motivo) assert.match(o.saida, motivo)
  }
}))

// 5.49 (bloco C, 2026-11-03): o sim do passo 2 ja cita o valor; o passo 3 leva o --acima-do-teto na mesma chamada,
// senao a trava so barra depois do fiscal inteiro e o aluno ouve a mesma pergunta duas vezes
test('SKILL: o passo 3 do olho final ja leva o --acima-do-teto acima do teto por vez', () => {
  const skill = readFileSync(join(AQUI, '..', '..', 'SKILL.md'), 'utf8')
  const ini = skill.indexOf('3. Só com o sim, rode o fiscal de novo')
  const fim = skill.indexOf('4. O custo vira uma linha', ini)
  assert.ok(ini > 0 && fim > ini, 'canario: a SKILL.md tem os passos 3 e 4 do olho final')
  const passo3 = skill.slice(ini, fim)
  assert.ok(passo3.includes('--liberar-gasto'), 'canario: o trecho e o do comando do olho final')
  assert.match(passo3, /--acima-do-teto <o valor do passo 2>/, 'o passo 3 nao junta o --acima-do-teto')
})

test('fiscal: ver-video que falha nao grava custo e avisa que pode ter sido cobrado', () => comTemp((d) => {
  const o = olho(d, { preco: 0.5, autorizado: true, codigo: 1 })
  assert.equal(o.chamadas, 1)
  assert.equal(o.linhas.length, 0)
  assert.match(o.saida, /pode ter sido cobrado/)
  assert.match(o.saida, /painel/)
}))

test('blocos: sem WHISPER_DIR recusa dizendo o que falta', () => comTemp((d) => {
  const env = { ...ENV }
  delete env.WHISPER_DIR
  const r = py('blocos.py', [join(d, 'x.mp4'), join(d, 'saida.md')], { env })
  assert.notEqual(r.status, 0)
  assert.match(semTraco(r.stderr), /WHISPER_DIR/)
}))

test('blocos acha os blocos de fala com o whisper', { skip: process.env.WHISPER_DIR ? false : 'precisa do whisper instalado; prova no ensaio' }, (t) => comTemp((d) => {
  // dois trechos de som de 1 s com 2 s de silencio no meio: o envelope tem de achar 2 blocos
  const bruto = join(d, 'bruto.wav'), sai = join(d, 'cortes.md')
  ff('-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=16000', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=16000', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', '-ac', '1', bruto)
  // lista ordenada: o disco nao garante ordem, e com mais de um modelo o escolhido fica escrito no log
  const modelos = readdirSync(process.env.WHISPER_DIR).map((n) => n.match(/^ggml-(.+)[.]bin$/)).filter(Boolean).map((m) => m[1]).sort()
  assert.ok(modelos.length, 'nenhum ggml-*.bin na WHISPER_DIR')
  if (modelos.length > 1) t.diagnostic(`${modelos.length} modelos na WHISPER_DIR (${modelos.join(', ')}); usando ${modelos[0]}`)
  const r = py('blocos.py', [bruto, sai, '--modelo', modelos[0]])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const linhas = readFileSync(sai, 'utf8').split(/\r?\n/).filter((l) => /^[|] [0-9]+ [|]/.test(l))
  assert.equal(linhas.length, 2)
  // a 5a coluna e o texto que o whisper devolveu: vazia quer dizer que o whisper nao rodou ou a saida dele se perdeu
  for (const l of linhas) assert.match(l.split('|')[5], /[^ ]/, 'o whisper nao devolveu texto no trecho: ' + l)
  // 5.58 B: com a lista de nomes no --prompt, o tom e o silencio nao viram nome (eco do prompt) nem voltam vazios
  const lista = join(d, 'nomes.md'), comNomes = join(d, 'cortes-nomes.md')
  writeFileSync(lista, ['## Nomes', '', '- Lumora', '- Casa Vexto', ''].join('\n'))
  const r2 = py('blocos.py', [bruto, comNomes, '--modelo', modelos[0], '--nomes', lista])
  assert.equal(r2.status, 0, semTraco(r2.stderr))
  const linhas2 = readFileSync(comNomes, 'utf8').split(/\r?\n/).filter((l) => /^[|] [0-9]+ [|]/.test(l))
  assert.equal(linhas2.length, 2)
  for (const l of linhas2) {
    assert.match(l.split('|')[5], /[^ ]/, 'com a lista o trecho voltou vazio: ' + l)
    assert.doesNotMatch(l, /lumora|vexto/i, 'nome da lista no trecho sem fala (eco do prompt): ' + l)
  }
}))

test('profundidade: sem o modelo recusa dizendo o que falta', () => comTemp((d) => {
  const env = { ...ENV }
  delete env.DEPTH_MODELO
  const r = py('profundidade.py', [join(d, 'x.png'), join(d, 'y.png')], { env })
  assert.notEqual(r.status, 0)
  assert.match(semTraco(r.stderr), /DEPTH_MODELO/)
}))

test('profundidade gera o mapa com o modelo', { skip: process.env.DEPTH_MODELO ? false : 'precisa do modelo de profundidade (3D opcional); prova no ensaio' }, () => comTemp((d) => {
  const img = join(d, 'cena.png'), sai = join(d, 'mapa.png')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1', '-frames:v', '1', img)
  const r = py('profundidade.py', [img, sai, '--largura', '160'])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.equal(sonda(sai, { sel: 'v:0', campo: 'width,height' }), '160,90')
  // mapa de verdade tem perto e longe: imagem de um tom so quer dizer que o modelo nao entrou
  const st = spawnSync('ffprobe', ['-v', 'error', '-f', 'lavfi', '-i', 'movie=mapa.png,signalstats', '-show_entries', 'frame_tags=lavfi.signalstats.YMIN,lavfi.signalstats.YMAX', '-of', 'csv=p=0'], { cwd: d, encoding: 'utf8' })
  assert.equal(st.status, 0, st.stderr)
  const [ymin, ymax] = st.stdout.trim().split(',').map(Number)
  assert.ok(ymax - ymin > 50, `mapa sem relevo (YMIN ${ymin}, YMAX ${ymax})`)
}))

test('o modelo YuNet e a licenca vieram junto', () => {
  assert.ok(existsSync(join(AQUI, 'modelos', 'face_detection_yunet_2023mar.onnx')))
  assert.match(readFileSync(join(AQUI, 'modelos', 'LICENSE-yunet.txt'), 'utf8'), /MIT/)
})

test('nenhum .py tem caminho fixo, comando de sistema escrito ou termo que nao vai no kit', () => {
  const arquivos = readdirSync(AQUI).filter((n) => n.endsWith('.py'))
  assert.ok(arquivos.length >= 17, 'esperava os 17 .py, achei ' + arquivos.length)
  const aspas = String.fromCharCode(34)
  const exeComAspas = '.exe' + aspas
  const proibidos = ['py -3.12', 'python3', exeComAspas, "main.exe", 'deep-filter.exe']
  // termos do dono montados de tras pra frente pra o proprio teste nao carregar o que proibe
  const dono = ['onibas', 'onnibaz', 'onibasarob', 'agob', 'steb', 'enohpi', 'negyeh', 'lanoican lanroj', 'sifrep'].map((s) => s.split('').reverse().join(''))
  const palavraInteira = (l) => new RegExp(String.raw`\b(${l.join('|')})\b`, 'i')
  const letraDeUnidade = /\b[A-Za-z]:[\\/]/
  const travessao = new RegExp('[' + String.fromCharCode(0x2014) + String.fromCharCode(0x2013) + ']')
  // canario: a busca tem que casar em texto que sabidamente contem o que procura
  assert.ok(letraDeUnidade.test('C:' + String.fromCharCode(92) + 'x'))
  assert.ok(travessao.test('a' + String.fromCharCode(0x2014) + 'b'))
  assert.ok(palavraInteira(dono).test('texto com ' + dono[0]))
  for (const nome of arquivos) {
    const t = readFileSync(join(AQUI, nome), 'utf8')
    assert.ok(t.length > 100, nome + ' vazio')
    for (const p of proibidos) assert.ok(!t.includes(p), `${nome} contem ${p}`)
    assert.ok(!letraDeUnidade.test(t), `${nome} tem letra de unidade com barra`)
    assert.ok(!travessao.test(t), `${nome} tem travessao`)
    const m = palavraInteira(dono).exec(t)
    assert.ok(!m, `${nome} cita termo que nao vai no kit: ${m && m[0]}`)
    assert.ok(!t.includes('\r'), `${nome} com CR`)
  }
})

// Trecho de .py que roda sem o resto do script: pega so a funcao pelo nome (ast) e a executa.
// outras: funcoes do mesmo arquivo que a testada chama (vao junto no exec)
function funcaoDoPy(nomeArquivo, nomeFuncao, corpoTeste, d, outras = []) {
  const harness = join(d, 'harness.py')
  const nomes = JSON.stringify([nomeFuncao, ...outras])
  writeFileSync(harness, [
    'import ast, sys',
    'import numpy as np',
    'from pathlib import Path',
    'src = open(sys.argv[1], encoding="utf-8").read()',
    `fn = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name in ${nomes}]`,
    `assert len(fn) == ${1 + outras.length}, "sem a funcao ${nomeFuncao} ou uma das outras"`,
    'ns = {"np": np, "Path": Path}',
    'exec(compile(ast.Module(fn, []), "trecho", "exec"), ns)',
    `f = ns["${nomeFuncao}"]`,
    corpoTeste,
  ].join('\n') + '\n')
  return rodarPython(harness, [script(nomeArquivo)], { env: ENV })
}

test('verificar-video alinha os vetores quando a pessoa tem 1 quadro a mais ou a menos que a voz', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'alinhar_quadros', [
    'for dif in (1, -1, 0, 2):',
    '    mov = np.zeros(409 + dif); vis = np.ones(409, dtype=bool)',
    '    m, v = f(mov, vis)',
    '    assert len(m) == len(v) == min(len(mov), len(vis)), (dif, len(m), len(v))',
    '    assert ((m < 0.01) & v).shape == m.shape',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('alinhar_quadros(mov, visivel)'), 'a funcao nao esta ligada ao calculo da pessoa parada')
}))

test('P6: o verificar-video pula a sincronia so nas janelas que encostam na camera lenta', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'janela_na_lenta', [
    'L = [{"deSeg": 2.2667, "ateSeg": 3.4}]',
    'assert f(2.0, L) and f(1.5, L) and f(3.0, L), "canario: janela que encosta na repeticao tem de pular"',
    'assert not f(1.0, L) and not f(3.5, L) and not f(4.0, L), "janela fora da repeticao segue conferida"',
    'assert not f(2.0, []), "sem camera lenta nada pula"',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('if janela_na_lenta(t0, P.get("lentas", [])): continue'), 'a funcao nao esta ligada ao laco da sincronia')
}))

test('fiscal resolve pra absoluto o caminho do transcritor e mostra o erro dele no relatorio', () => comTemp((d) => {
  const r = funcaoDoPy('fiscal.py', 'caminho_abs', [
    'rel = "../_video/motor/scripts/transcrever.mjs"',
    'assert Path(f(rel)).is_absolute()',
    'assert f(None) is None',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const src = readFileSync(script('fiscal.py'), 'utf8')
  assert.ok(!src.includes('["node", ARGS.transcrever'), 'o transcritor ainda vai cru pro subprocess')
  assert.ok(!src.includes('["node", ARGS.ver_video'), 'o ver-video ainda vai cru pro subprocess')
  assert.match(src, /whisper não gerou a transcrição do final[^\n]*out\b/, 'o relatorio nao traz a saida do transcritor')
}))

test('profundidade sem o modelo diz que o 3D com relevo fica de fora, sem prometer passo do kit', () => comTemp((d) => {
  const env = { ...ENV }
  delete env.DEPTH_MODELO
  const r = py('profundidade.py', [join(d, 'x.png'), join(d, 'y.png')], { env })
  assert.notEqual(r.status, 0)
  assert.doesNotMatch(semTraco(r.stderr), /passo opcional/)
  assert.match(semTraco(r.stderr), /3D[^\n]*fica de fora/)
}))

test('zona-segura reprovada na lateral ensina o conserto da legenda (encurtar a palavra no alinhado)', () => comTemp((d) => {
  const v = join(d, 'legenda-larga.mp4')
  const faixas = Array.from({ length: 8 }, (_, i) => `drawbox=x=${950 + i * 12}:y=1000:w=6:h=60:color=white:t=fill`).join(',')
  ff('-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=30:d=2', '-vf', faixas, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', v)
  const r = py('zona-segura.py', [v])
  const saida = semTraco(r.stdout) + semTraco(r.stderr)
  assert.equal(r.status, 1, saida)
  assert.match(saida, /REPROVOU/)
  assert.match(saida, /DIR/)
  assert.match(saida, /encurte a palavra/)
  assert.match(saida, /alinhado/)
}))

test('scripts que gravam arquivo criam a pasta de saida que ainda nao existe (alinhar e tratar-voz)', () => comTemp((d) => {
  const leg = join(d, 'leg.json'), fala = join(d, 'fala.txt')
  writeFileSync(leg, JSON.stringify([{ text: 'ola', startMs: 0, endMs: 300 }]))
  writeFileSync(fala, 'Olá.', 'utf8')
  const sai1 = join(d, 'trab', 'novo', 'alinhado.json')
  const r1 = py('alinhar.py', [leg, fala, sai1])
  assert.equal(r1.status, 0, semTraco(r1.stderr))
  assert.ok(existsSync(sai1))
  const ent = join(d, 'seno.wav'), sai2 = join(d, 'public', 'voz.wav')
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=1:r=44100', ent)
  const r2 = py('tratar-voz.py', [ent, sai2, '--sem-dfn'])
  assert.equal(r2.status, 0, semTraco(r2.stderr) + semTraco(r2.stdout))
  assert.ok(existsSync(sai2))
}))

test('todo .py que grava arquivo pela linha de comando cria a pasta antes', () => {
  const gravam = ['alinhar.py', 'assistir-cru.py', 'blocos.py', 'camera_lenta.py', 'chroma.py', 'mix-final.py', 'montar-blocos.py', 'paginas-camadas.py', 'paginas-legenda.py', 'preparar-props.py', 'profundidade.py', 'sincronizar-bruto.py', 'tratar-voz.py', 'guias-olhada.py']
  for (const nome of gravam) assert.match(readFileSync(script(nome), 'utf8'), /os\.makedirs\(/, nome)
})

const ENT = 'ent = [(30, 1.0, "frente"), (120, 4.0, "interface"), (240, 8.0, "frente")]'

test('P4: fiscal com a biblioteca de efeitos sem som avisa uma vez e nao reprova grafico sem efeito', () => comTemp((d) => {
  const sfx = join(d, 'midia', 'biblioteca', 'sfx')
  const r1 = funcaoDoPy('fiscal.py', 'graficos_sem_som', [
    ENT,
    'f_, a_ = f(ent, [], False, None)',
    'assert len(f_) == 3 and a_ is None, (f_, a_)            # canario: com som na biblioteca e sem pedido, cobra',
    'f_, a_ = f(ent, [31], False, None)',
    'assert [s for s, _ in f_] == [4.0, 8.0] and a_ is None, (f_, a_)',
    'f_, a_ = f(ent, [], True, None)',
    'assert f_ == [] and a_.startswith("3 gr") and "biblioteca" in a_, (f_, a_)',
    'assert f([], [], True, None) == ([], None)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r1.status, 0, semTraco(r1.stderr) + semTraco(r1.stdout))
  assert.match(r1.stdout, /ok/)
  const r2 = funcaoDoPy('fiscal.py', 'biblioteca_sem_som', [
    `sfx = Path(${JSON.stringify(sfx)}); midia = sfx.parent.parent`,
    'assert f(None) is False',
    'assert f(str(midia)) is True                 # sem a pasta',
    'sfx.mkdir(parents=True); (sfx / "registro.md").write_text("x", encoding="utf-8")',
    'assert f(str(midia)) is True                 # so o registro',
    '(sfx / "pop.wav").write_bytes(b"x")',
    'assert f(str(midia)) is False',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r2.status, 0, semTraco(r2.stderr) + semTraco(r2.stdout))
  assert.match(r2.stdout, /ok/)
  // o fiscal inteiro pede o render do Remotion: a ligacao das funcoes se confere no codigo
  const src = readFileSync(script('fiscal.py'), 'utf8')
  assert.ok(src.includes('ARGS.midia'), 'canario: o fiscal tem a flag --midia')
  assert.ok(src.includes('graficos_sem_som(ent, onsets, biblioteca_sem_som(ARGS.midia),'), 'o fiscal nao liga a biblioteca ao gate')
  const skill = readFileSync(join(AQUI, '..', '..', 'SKILL.md'), 'utf8')
  const cmd = skill.split(/\r?\n/).filter((l) => l.includes('fiscal.py <Composicao>'))
  assert.equal(cmd.length, 1, 'canario: uma linha de comando do fiscal na SKILL.md')
  assert.ok(cmd[0].includes('--midia <_video>/midia'), 'o comando do fiscal na SKILL.md sem --midia')
}))

test('P4: fiscal com o pedido sem efeito anotado e zero efeito so avisa; sem o pedido ou com algum efeito reprova', () => comTemp((d) => {
  const r1 = funcaoDoPy('fiscal.py', 'pedido_sem_efeito', [
    'assert f({"pedidoSemEfeito": "  quero sem efeito nenhum "}) == "quero sem efeito nenhum"',
    'assert f({}) is None                          # esquecimento: campo ausente',
    'assert f({"pedidoSemEfeito": "   "}) is None   # vazio nao e pedido',
    'assert f({"pedidoSemEfeito": True}) is None    # so vale a frase do aluno',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r1.status, 0, semTraco(r1.stderr) + semTraco(r1.stdout))
  assert.match(r1.stdout, /ok/)
  const r2 = funcaoDoPy('fiscal.py', 'graficos_sem_som', [
    ENT,
    'p = "quero sem efeito nenhum"',
    'f_, a_ = f(ent, [], False, None)',
    'assert len(f_) == 3 and a_ is None, (f_, a_)   # canario: zero efeito sem o pedido segue reprovando',
    'f_, a_ = f(ent, [], False, p)',
    'assert f_ == [] and a_.startswith("3 gr") and p in a_, (f_, a_)',
    'f_, a_ = f(ent, [31], False, p)',
    'assert [s for s, _ in f_] == [4.0, 8.0] and a_ is None, (f_, a_)   # tem efeito: o pedido nao vale',
    'assert f([], [], False, p) == ([], None)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r2.status, 0, semTraco(r2.stderr) + semTraco(r2.stdout))
  assert.match(r2.stdout, /ok/)
  const src = readFileSync(script('fiscal.py'), 'utf8')
  assert.ok(src.includes('PROPS_BASE.read_text'), 'canario: o fiscal le as --props-base')
  assert.ok(src.includes('pedido_sem_efeito(json.loads(PROPS_BASE.read_text(encoding="utf-8"))))'), 'o fiscal nao liga o pedido anotado ao gate')
  const skill = readFileSync(join(AQUI, '..', '..', 'SKILL.md'), 'utf8')
  assert.ok(skill.includes('producao/<slug>/verificar-props.json'), 'canario: a SKILL.md cita o verificar-props.json')
  assert.ok(skill.includes('"pedidoSemEfeito": "<a frase dele, como ele disse>"'), 'a SKILL.md nao diz onde anotar o pedido sem efeito')
}))

// cor de um pixel do png pelo ffmpeg (recorte 1x1 em rgb24): [r, g, b]
function pixel(png, x, y) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 })
  assert.equal(r.status, 0, semTraco(r.stderr))
  return [...r.stdout.subarray(0, 3)]
}

test('P3: guias-olhada desenha zona segura e legenda e avisa rosto ausente e chave na legenda', () => comTemp((d) => {
  const ent = join(d, 'cinza.png'), sai = join(d, 'nova', 'olhada.png')
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=1080x1920', '-frames:v', '1', ent)
  const r = py('guias-olhada.py', [ent, sai, '--modelo', join(AQUI, 'modelos', 'face_detection_yunet_2023mar.onnx'),
    '--zona-segura', script('zona-segura.py'), '--topo-legenda', '1240', '--chave', '1100,200'])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.ok(String(r.stdout).trim().length > 0, 'canario: a saida nao veio vazia')
  assert.match(r.stdout, /rosto nao achado/)
  assert.match(r.stdout, /encosta na legenda/)
  assert.ok(existsSync(sai))
  // canario dos pixels: faixa de cima puxa pro vermelho, linha da legenda e amarela, meio continua cinza
  const topo = pixel(sai, 540, 100), legenda = pixel(sai, 540, 1240), meio = pixel(sai, 540, 900)
  assert.ok(topo[0] > topo[2] + 30, `topo ${topo}`)
  assert.ok(legenda[0] > 200 && legenda[1] > 180 && legenda[2] < 60, `legenda ${legenda}`)
  assert.ok(Math.abs(meio[0] - meio[2]) < 5, `meio ${meio}`)
}))

test('P3: guias-olhada nao deixa __pycache__ no motor', () => comTemp((d) => {
  // copia do motor so com o que a olhada usa: o hash dela tem de sair igual depois de rodar
  const motor = join(d, 'motor'), s = join(motor, 'scripts')
  mkdirSync(join(s, 'modelos'), { recursive: true })
  for (const n of ['guias-olhada.py', 'zona-segura.py']) copyFileSync(script(n), join(s, n))
  copyFileSync(join(AQUI, 'modelos', 'face_detection_yunet_2023mar.onnx'), join(s, 'modelos', 'face_detection_yunet_2023mar.onnx'))
  const ent = join(d, 'cinza.png'), sai = join(d, 'fora', 'olhada.png')
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=1080x1920', '-frames:v', '1', ent)
  const antes = hashPasta(motor)
  // o aluno roda sem PYTHONDONTWRITEBYTECODE: o env do teste nao pode esconder o defeito
  const env = { ...ENV }
  delete env.PYTHONDONTWRITEBYTECODE
  assert.equal('PYTHONDONTWRITEBYTECODE' in env, false, 'canario: o env usado nao tem PYTHONDONTWRITEBYTECODE')
  const r = rodarPython(join(s, 'guias-olhada.py'), [ent, sai, '--modelo', join(s, 'modelos', 'face_detection_yunet_2023mar.onnx'),
    '--zona-segura', join(s, 'zona-segura.py'), '--topo-legenda', '1240'], { env })
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.ok(String(r.stdout).trim().length > 0, 'canario: a saida nao veio vazia')
  assert.equal(existsSync(join(s, '__pycache__')), false, 'o importlib gravou __pycache__ no motor')
  assert.equal(hashPasta(motor), antes)
}))

// 5.58: cru de celular com taxa variavel (o video comeca fora do zero e perde quadro, o carimbo de cada quadro fica).
// Quadro preto, com um quadro branco em cada n de "brancos" e um clique no audio no instante real de cada um.
function cruVariavel(d, { quedas = [45, 120], brancos = [60, 140], inicio = 0.06, dur = 6 } = {}) {
  const arq = join(d, 'cru.mp4')
  const branco = brancos.map((n) => `eq(n,${n})`).join('+')
  const fica = quedas.map((n) => `not(eq(n,${n}))`).join('*')
  const clique = brancos.map((n) => `between(t,${(n / 30 + inicio).toFixed(4)},${(n / 30 + inicio + 0.005).toFixed(4)})`).join('+')
  ff('-f', 'lavfi', '-i', `color=c=black:s=320x568:r=30:d=${dur}`, '-f', 'lavfi', '-i', `aevalsrc='0.8*sin(2*PI*1000*t)*(${clique})':s=48000:d=${dur}`,
    '-vf', `drawbox=c=white:t=fill:enable='${branco}',select='${fica}',settb=1/90000,setpts=PTS+${inicio}/TB`,
    '-fps_mode', 'passthrough', '-enc_time_base:v', '1/90000', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', arq)
  return arq
}
const carimbosDe = (arq) => spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', arq], { encoding: 'utf8' })
  .stdout.split(/[\s,]+/).filter(Boolean).map(Number).sort((a, b) => a - b)
const buracos = (ts) => ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 1.5 / 30)

test('5.58: montar-blocos corta na grade de quadro: cru de taxa variavel sai com os quadros certos, taxa fixa e o quadro branco no quadro do clique', () => comTemp((d) => {
  const bruto = cruVariavel(d), sai = join(d, 'montado.mp4')
  const tb = carimbosDe(bruto)
  assert.ok(Math.abs(tb[0] - 0.06) < 0.003, `canario: o cru devia comecar em 0,06 s e comeca em ${tb[0]}`)
  assert.equal(buracos(tb).length, 2, 'canario: o cru tem os dois buracos')
  // fora da grade de proposito: 1,015 vai pro quadro 30 (1,000 s) e 3,515 pro 105 (3,500 s), 15 ms de diferenca
  const trechos = ['1.015:3.015', '3.515:5.515']
  const r = py('montar-blocos.py', [bruto, sai, ...trechos, ...decupagem(d, trechos)])
  assert.equal(r.status, 0, semTraco(r.stderr))
  const tm = carimbosDe(sai)
  assert.equal(tm.length, 120, 'quadros da montagem contra a soma dos trechos (4 s a 30)')
  assert.deepEqual(tm.slice(1).map((t, i) => Math.round((t - tm[i]) * 3000)).filter((x) => x !== 100), [], 'taxa fixa de 30')
  const px = spawnSync('ffmpeg', ['-v', 'error', '-i', sai, '-vf', 'scale=8:8,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 }).stdout
  const brancos = []
  for (let k = 0; k * 64 < px.length; k++) if (px.subarray(k * 64, k * 64 + 64).reduce((s, v) => s + v, 0) / 64 > 128) brancos.push(k)
  const x = amostras(sai, 0, 4, 48000), cliques = []
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.3 && (cliques.length === 0 || i / 48000 - cliques.at(-1) > 0.2)) cliques.push(i / 48000)
  assert.equal(brancos.length, 2, 'canario: os dois quadros brancos chegaram a montagem')
  assert.equal(cliques.length, 2, 'canario: os dois cliques chegaram a montagem')
  assert.deepEqual(brancos, cliques.map((t) => Math.round(t * 30)), `quadro branco fora do quadro do clique (cliques em ${cliques.map((t) => t.toFixed(4))})`)
  // a voz corta no mesmo quadro da imagem: o clique do cru (n/30 + 0,06) cai a cru - 1,000 e 2 + cru - 3,500
  const esperado = [60 / 30 + 0.06 - 1.0, 2 + 140 / 30 + 0.06 - 3.5]
  cliques.forEach((t, k) => assert.ok(Math.abs(t - esperado[k]) < 0.003, `clique ${k + 1} em ${t.toFixed(4)} s, devia cair em ${esperado[k].toFixed(4)} s (audio fora da grade)`))
}))

test('5.58: carimbos do verificar-video devolve o comeco fora do zero, o buraco e o comeco do audio', () => comTemp((d) => {
  const cru = cruVariavel(d), aud = join(d, 'audio-depois.mov')
  ff('-f', 'lavfi', '-i', 'color=c=black:s=320x568:r=30:d=2', '-itsoffset', '0.1', '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', aud)
  const r = funcaoDoPy('verificar-video.py', 'carimbos', [
    `TB, ia = f(${JSON.stringify(cru)})`,
    'assert len(TB) == 178, len(TB)',
    'assert abs(TB[0] - 0.06) < 0.003, TB[0]',
    'g = np.diff(TB)',
    'assert (g > 1.5 / 30).sum() == 2 and abs(g.max() - 2 / 30) < 0.003, g.max()',
    'assert ia == 0.0, ia',
    `TB2, ia2 = f(${JSON.stringify(aud)})`,
    'assert abs(TB2[0]) < 0.001 and abs(ia2 - 0.1) < 0.001, (TB2[0], ia2)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('TP, _ = carimbos(pub / P["pessoa"])'), 'a pessoa nao usa o carimbo')
  assert.ok(src.includes('ts, ia = carimbos(p)') && src.includes('Bp, TB, ia = patches(BRUTO, box)'), 'o bruto nao usa o carimbo')
}))

test('5.58: a busca da imagem do verificar-video casa pelo carimbo onde a conta por indice erra mais de 1,5 quadro', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'casar_imagem', [
    'TB = 0.06 + np.delete(np.arange(300), [50, 51, 120]) / 30',
    'T0 = TB[150]; tk = T0 + np.arange(0, 30, 3) / 30',
    'C = np.exp(-((TB[None, :] - tk[:, None]) * 30) ** 2)',
    'sv, nota = f(C, tk, TB, T0)',
    'assert abs(sv - T0) < 0.5 / 30 and nota > 0.9, (sv, T0, nota)',
    '# a janela comeca em t0 e o primeiro quadro dela 40 ms depois: devolve o instante do bruto que vale t0',
    'sv2, _ = f(C, tk, TB, T0 - 0.04)',
    'assert abs(sv2 - (T0 - 0.04)) < 0.5 / 30, (sv2, T0)',
    '# canario: a conta velha (indice dividido pela taxa media) erra neste cru',
    'fb = len(TB) / (TB[-1] - TB[0] + 1 / 30); ks = np.arange(0, 30, 3)',
    'offs = np.arange(0, len(TB) - int(fb) - 1)',
    'idx = offs[None, :] + np.round(ks[:, None] / 30 * fb).astype(int)',
    'velho = offs[int(np.argmax(C[np.arange(len(ks))[:, None], idx].mean(axis=0)))] / fb',
    'assert abs(velho - T0) > 1.5 / 30, (velho, T0)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('casar_imagem(C, TP[ks], TB, t0)'), 'a funcao nao esta ligada a sincronia')
}))

test('5.58: a janela de 1 s da pessoa no verificar-video sai do carimbo, com o comeco fora do zero e o buraco', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'janela_quadros', [
    'tp = 0.06 + np.delete(np.arange(90), [40, 41]) / 30',
    'q0, q1 = f(tp, 1.0)',
    'assert (q0, q1) == (29, 57), (q0, q1)',
    'assert tp[q0] >= 1.0 > tp[q0 - 1] and tp[q1 - 1] < 2.0 <= tp[q1], (tp[q0], tp[q1])',
    '# canario: a conta velha pelo indice erra neste carimbo',
    'assert (int(1.0 * 30), int(1.0 * 30) + 30) != (q0, q1)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('q0, q1 = janela_quadros(TP, t0)'), 'a funcao nao esta ligada a sincronia')
}))

test('5.58: carimbos do verificar-video tira o pacote descartado do video cortado por copia', () => comTemp((d) => {
  const x = join(d, 'x.mp4'), cut = join(d, 'cortado.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc=s=320x240:r=30:d=6', '-g', '60', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', x)
  ff('-ss', '1.5', '-i', x, '-c', 'copy', cut)
  const pacotes = carimbosDe(cut), nq = quadros(cut)
  assert.ok(pacotes.length > nq && pacotes[0] < -1, `canario: o corte por copia leva pacote antes do ponto de corte (${pacotes.length} pacotes, ${nq} quadros, ${pacotes[0]})`)
  const r = funcaoDoPy('verificar-video.py', 'carimbos', [
    `TB, ia = f(${JSON.stringify(cut)})`,
    `assert len(TB) == ${nq}, len(TB)`,
    'assert abs(TB[0]) < 0.001, TB[0]',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
}))

test('5.58: a voz do verificar-video soma o comeco do audio do bruto', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'casar_voz', [
    'rng = np.random.default_rng(7); eb = rng.random(2000)',
    'sa, nota = f(eb[700:800] * 2 + 1, eb, 0.25)',
    'assert abs(sa - 7.25) < 1e-9 and nota > 0.99, (sa, nota)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
}))

// 5.62: a busca no bruto inteiro casava a voz num lugar errado com nota alta (frase que se repete) e reprovava video
// bom; agora o empate com o lugar da imagem pula a janela, e voz descolada de verdade continua reprovando
const FALA_PY = [
  'def fala(n, seed):',
  '    r = np.random.default_rng(seed); e = np.zeros(n); i = 0',
  '    while i < n:',
  '        d = int(r.integers(8, 30)); e[i:i + d] = r.random() * 2 + 0.5; i += d + int(r.integers(3, 25))',
  '    return e + 0.05 * r.random(n)',
]

test('5.62: voz_da_janela do verificar-video pula a frase repetida no bruto em vez de reprovar', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'voz_da_janela', [
    ...FALA_PY,
    'cv = ns["casar_voz"]',
    'eb = fala(3000, 5); eb[300:400] = eb[2000:2100]',
    'jan = eb[2000:2100]',
    'sa, nota = cv(jan, eb, 0)',
    'assert abs(sa - 3.0) < 1e-9 and nota > 0.99, ("canario: a busca global casa na copia", sa, nota)',
    'assert f(jan, eb, 0, 20.0, 30)[0] == "ambigua", f(jan, eb, 0, 20.0, 30)',
    'print("ok")',
  ].join('\n'), d, ['casar_voz'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
}))

test('5.62: voz_da_janela do verificar-video da ambigua no envelope que se repete', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'voz_da_janela', [
    'rng = np.random.default_rng(42)',
    'eb = 2 + np.tile(rng.random(150), 12) + 0.05 * rng.random(1800)',
    'ev = eb[150:1150]',
    'est = [f(ev[int(t * 100):int(t * 100) + 100], eb, 0, t, 30)[0] for t in np.arange(0, 9, 0.5)]',
    'assert len(est) == 18 and all(e == "ambigua" for e in est), est',
    'eb2 = np.tile(np.random.default_rng(42).uniform(0.2, 1, 50), 8)',
    'assert f(eb2[50:150], eb2, 0, 0.5, 30)[0] == "ambigua", f(eb2[50:150], eb2, 0, 0.5, 30)',
    // ritmo de 0,2 s com a voz certa: o pico da global cai 0,2 s antes, perto (achado da 2a volta da final)
    'eb3 = np.tile(np.random.default_rng(42).uniform(0.2, 1, 20), 20)',
    'assert f(eb3[20:120], eb3, 0, 0.2, 30)[0] == "ambigua", f(eb3[20:120], eb3, 0, 0.2, 30)',
    'print("ok")',
  ].join('\n'), d, ['casar_voz'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
}))

test('5.62: voz_da_janela do verificar-video segue pegando voz descolada de 0,2 s, 1,5 s e 8 s', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'voz_da_janela', [
    ...FALA_PY,
    'eb = fala(3000, 1)',
    'for k, esp in ((0, "ok"), (20, "descolada"), (150, "descolada"), (800, "descolada")):',
    '    est = [f(eb[i + k:i + k + 100], eb, 0, i / 100, 30)[0] for i in range(500, 2000, 100)]',
    '    assert len(est) == 15 and all(e == esp for e in est), (k, est)',
    // descolamento logo acima da tolerancia (70 ms a 24 fps, 54 ms a 30 fps): a busca no lugar da imagem nao pode
    // reencontrar o proprio casamento descolado (achado da comum)
    'eu = np.random.default_rng(42).uniform(0.2, 1, 3000)',
    'assert f(eu[507:607], eu, 0, 5.0, 24)[0] == "descolada", f(eu[507:607], eu, 0, 5.0, 24)',
    'assert f(eu[506:606], eu, 0, 5.006, 30)[0] == "descolada", f(eu[506:606], eu, 0, 5.006, 30)',
    'assert f(eu[506:606], eu, 0, 5.0, 24)[0] == "ok", ("canario: 60 ms cabe em 1,5 quadro a 24 fps", f(eu[506:606], eu, 0, 5.0, 24))',
    // envelope suave (como a voz de verdade): o vizinho do mesmo pico tira nota alta e nao pode virar ambigua
    // (achado da final)
    'w = np.hanning(21)',
    'es = np.convolve(np.random.default_rng(42).uniform(0.2, 1, 3020), w / w.sum(), mode="valid")',
    'sa, nota = ns["casar_voz"](es[506:606], es, 0, 505, 506)',
    'assert nota > 0.95, ("canario: o vizinho do pico casa alto no envelope suave", nota)',
    'assert f(es[506:606], es, 0, 5.0, 30)[0] == "descolada", f(es[506:606], es, 0, 5.0, 30)',
    'assert f(es[520:620], es, 0, 5.0, 30)[0] == "descolada", f(es[520:620], es, 0, 5.0, 30)',
    'print("ok")',
  ].join('\n'), d, ['casar_voz'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('voz_da_janela(ev[int(t0 * 100):int(t0 * 100) + 100], eb, ia, sv, FPS)'), 'a funcao nao esta ligada a sincronia')
}))

test('5.58: a duracao da pessoa no verificar-video sai do ultimo carimbo, sem perder o buraco', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'duracao_pessoa', [
    'tp = 0.06 + np.delete(np.arange(90), [40, 41]) / 30',
    'assert abs(f(tp, 30) - 3.06) < 1e-9, f(tp, 30)',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('dp = duracao_pessoa(TP, FPS)'), 'a funcao nao esta ligada a duracao')
}))

test('5.58: camera lenta recusa pessoa a 30 com quadro faltando', () => comTemp((d) => {
  fala(d)
  const furada = join(d, 'furada.mp4')
  ff('-i', join(d, 'pessoa.mp4'), '-vf', "select='not(eq(n,40))*not(eq(n,41))*not(eq(n,80))'", '-fps_mode', 'passthrough', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', furada)
  assert.equal(sonda(furada, { sel: 'v:0', campo: 'r_frame_rate' }), '30/1', 'canario: a taxa nominal segue 30')
  assert.equal(quadros(furada), 117, 'canario: perdeu 3 quadros')
  const r = py('camera_lenta.py', [furada, join(d, 'voz.wav'), join(d, 'voz.alinhado.json'), join(d, 'l', 'p.mp4'), join(d, 'l', 'v.wav'), join(d, 'l', 'l.json'), '--trecho', '1.0:1.5:0.5'])
  assert.notEqual(r.status, 0, 'devia recusar')
  assert.match(semTraco(r.stderr), /precisa estar a 30 quadros/)
}))

test('5.58: assistir-cru nao sai preto num alvo no meio de um buraco de 84 ms', () => comTemp((d) => {
  const bruto = join(d, 'bruto.mp4'), blocos = join(d, 'blocos.md'), cru = join(d, 'cru')
  // quadros 0 a 29 em k/30; do 30 em diante, 0,0507 s depois: buraco de 0,9667 a 1,0507
  ff('-f', 'lavfi', '-i', 'color=c=white:s=320x568:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4',
    '-vf', "settb=1/90000,setpts='(N/30+gte(N,30)*0.0507)/TB'", '-fps_mode', 'passthrough', '-enc_time_base:v', '1/90000',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  const ts = carimbosDe(bruto), antes = ts.filter((t) => t < 1.01).at(-1), depois = ts.find((t) => t > 1.01)
  assert.ok(depois - antes > 0.08 && Math.min(1.01 - antes, depois - 1.01) > 0.034, `canario: o alvo 1,01 cai num buraco de mais de 80 ms, longe dos dois quadros (${antes} e ${depois})`)
  writeFileSync(blocos, ['| n | inicio (s) | fim (s) | dur (s) | whisper |', '|---|---|---|---|---|', '| 1 | 1.21 | 2.21 | 1.00 | frase |', ''].join('\n'))
  const r = py('assistir-cru.py', [bruto, blocos, cru])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(readFileSync(join(cru, 'bordas.md'), 'utf8'), /1[.]01:2[.]36/, 'canario: o corte sugerido cai no buraco')
  const px = spawnSync('ffmpeg', ['-v', 'error', '-i', join(cru, 'tira-01.jpg'), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 24 }).stdout
  for (let k = 0; k < 6; k++) {
    let soma = 0
    for (let y = 50; y < 300; y++) for (let x = k * 216 + 20; x < k * 216 + 196; x++) soma += px[y * 1296 + x]
    assert.ok(soma / (250 * 176) > 200, `quadro ${k + 1} da tira saiu escuro: ${soma / (250 * 176)}`)
  }
}))

test('5.58: a pessoa do verificar-video conta do comeco do arquivo e o bruto segue absoluto', () => comTemp((d) => {
  const pub = join(d, 'public'), base = join(d, 'base.mp4'), pessoa = join(pub, 'pessoa.mp4'), final = join(d, 'final.mp4')
  mkdirSync(pub, { recursive: true })
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=320x568:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', base)
  ff('-i', base, '-c', 'copy', '-output_ts_offset', '10', pessoa)
  assert.ok(carimbosDe(pessoa)[0] > 9.9, `canario: a pessoa devia comecar em 10 s e comeca em ${carimbosDe(pessoa)[0]}`)
  const cru = cruVariavel(d)
  const r = funcaoDoPy('verificar-video.py', 'comeco_arquivo', [
    `o = f(${JSON.stringify(pessoa)})`,
    'assert 9.9 < o <= 10.0, o',
    '# o cru de celular: formato em 0 e video em 0,06; o 0,06 fica no primeiro carimbo',
    `assert f(${JSON.stringify(cru)}) == 0.0, f(${JSON.stringify(cru)})`,
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('ORIG = comeco_arquivo(pub / P["pessoa"])') && !src.includes('TB = TB - ORIG') && !src.includes('comeco_arquivo(BRUTO)'), 'a pessoa nao conta do comeco ou o bruto deixou de ser absoluto')
  assert.equal(src.split('TP = TP - ORIG').length - 1, 2, 'os dois carimbos da pessoa (duracao e janelas) contam do comeco')
  // ponta a ponta: 2 s de pessoa com o carimbo em 10 s e props de 3 s; a conta absoluta via 12 s e nao reprovava
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=3:r=48000', join(pub, 'voz.wav'))
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=320x568:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=300:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', final)
  const props = join(d, 'props.json')
  writeFileSync(props, JSON.stringify({ pessoa: 'pessoa.mp4', voz: 'voz.wav', duracaoSeg: 3, segmentos: [], sfx: [] }))
  const v = py('verificar-video.py', [props, final, '--public-dir', pub])
  const saida = semTraco(v.stdout) + semTraco(v.stderr)
  assert.equal(v.status, 1, saida)
  assert.match(saida, /pessoa tem 2[.][0-9][0-9] s e o video 3[.]00 s/)
  assert.doesNotMatch(saida, /Traceback/)
}))

test('5.58: camera lenta recusa pessoa a 30 com carimbo fora da grade do indice', () => comTemp((d) => {
  fala(d)
  const torta = join(d, 'torta.mp4')
  // do quadro 30 em diante 0,1 s depois, e os 30 seguintes encolhem de volta: taxa nominal 30, 120 quadros, mas o
  // quadro 30 cai em 1,1 s e o corte por indice descola 100 ms da voz cortada em segundos
  ff('-i', join(d, 'pessoa.mp4'), '-vf', "settb=1/90000,setpts='(N/30+gte(N,30)*0.1-min(max(N-60,0),30)*0.1/30)/TB'",
    '-fps_mode', 'passthrough', '-enc_time_base:v', '1/90000', '-c:v', 'libx264', '-bf', '0', '-pix_fmt', 'yuv420p', '-c:a', 'copy', torta)
  assert.equal(sonda(torta, { sel: 'v:0', campo: 'r_frame_rate' }), '30/1', 'canario: a taxa nominal segue 30')
  assert.equal(quadros(torta), 120, 'canario: 120 quadros, a contagem bate com a duracao')
  assert.ok(Math.abs(carimbosDe(torta)[30] - 1.1) < 0.002, `canario: o quadro 30 cai em 1,1 s (${carimbosDe(torta)[30]})`)
  const args = (v) => [v, join(d, 'voz.wav'), join(d, 'voz.alinhado.json'), join(d, 'l', 'p.mp4'), join(d, 'l', 'v.wav'), join(d, 'l', 'l.json'), '--trecho', '1.0:1.5:0.5']
  const r = py('camera_lenta.py', args(torta))
  assert.notEqual(r.status, 0, 'devia recusar')
  assert.match(semTraco(r.stderr), /precisa estar a 30 quadros/)
  const ok = py('camera_lenta.py', args(join(d, 'pessoa.mp4')))
  assert.equal(ok.status, 0, 'a pessoa na grade passa: ' + semTraco(ok.stderr))
  // a grade conta do primeiro quadro, nao do zero: montagem que comeca 1 quadro depois do zero segue na grade
  const tarde = join(d, 'tarde.mp4')
  ff('-i', join(d, 'pessoa.mp4'), '-c', 'copy', '-output_ts_offset', String(1 / 30), tarde)
  assert.ok(Math.abs(carimbosDe(tarde)[0] - 1 / 30) < 0.002, `canario: a pessoa comeca 1 quadro depois do zero (${carimbosDe(tarde)[0]})`)
  const ok2 = py('camera_lenta.py', args(tarde))
  assert.equal(ok2.status, 0, 'a pessoa na grade que comeca fora do zero passa: ' + semTraco(ok2.stderr))
}))

test('5.58: o verificar-video pula a janela que cruza corte da montagem e segue pegando a boca descolada', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'janela_cruza_corte', [
    'casar_imagem = ns["casar_imagem"]',
    'TB = 0.06 + np.delete(np.arange(6000), [500, 501, 1200]) / 30',
    't0 = 7.5; tk = t0 + np.arange(0, 30, 3) / 30',
    'def C_de(fonte): return np.exp(-((TB[None, :] - fonte[:, None]) * 30) ** 2)',
    '# janela que cruza o corte: a primeira metade saiu de 24,5 s do bruto e a segunda de 151 s',
    'fonte = np.where(np.arange(10) < 5, 24.5 + (tk - t0), 151.0 + (tk - t0))',
    'assert f(C_de(fonte), tk, TB, t0, 30) is True',
    '# canario: a janela inteira casa num lugar so e erra uma das metades',
    'sv, _ = casar_imagem(C_de(fonte), tk, TB, t0)',
    'assert min(abs(sv - 24.5), abs(sv - 151.0)) < 0.05 and max(abs(sv - 24.5), abs(sv - 151.0)) > 100, sv',
    '# sem corte, com a imagem 200 ms fora da voz: as duas metades andam juntas, a janela nao pula',
    'fonte2 = 24.7 + (tk - t0)',
    'assert f(C_de(fonte2), tk, TB, t0, 30) is False',
    'sv2, n2 = casar_imagem(C_de(fonte2), tk, TB, t0)',
    'assert abs(sv2 - 24.7) < 0.5 / 30 and n2 > 0.9, (sv2, n2)',
    '# dois quadros de folga ainda e a mesma tomada; quatro ja e corte',
    'assert f(C_de(np.where(np.arange(10) < 5, 24.5 + (tk - t0), 24.5 + 2 / 30 + (tk - t0))), tk, TB, t0, 30) is False',
    'assert f(C_de(np.where(np.arange(10) < 5, 24.5 + (tk - t0), 24.5 + 4 / 30 + (tk - t0))), tk, TB, t0, 30) is True',
    '# metade sem certeza (imagem que nao casa com nada) nao decide corte',
    'C3 = C_de(fonte); C3[5:] = 0.1',
    'assert f(C3, tk, TB, t0, 30) is False',
    'print("ok")',
  ].join('\n'), d, ['casar_imagem'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  const laco = src.slice(src.indexOf('for t0 in np.arange(0, DUR - 1, 0.5):'), src.indexOf('if ruins: falhas.append'))
  assert.ok(laco.includes('if janela_cruza_corte(C, TP[ks], TB, t0, FPS): pulou += 1; continue'), 'a funcao nao esta ligada a sincronia')
  assert.ok(laco.indexOf('janela_cruza_corte') < laco.indexOf('ruins.append'), 'o pulo tem de vir antes da comparacao')
  assert.ok(src.includes('avisos.append(f"{pulou} janelas puladas por cruzar corte da montagem")'), 'o pulo nao vira aviso')
}))

test('5.58: o verificar-video inteiro com a pessoa fora do zero passa sincronizada e reprova a voz 200 ms atrasada', () => comTemp((d) => {
  // rosto de mentira (o YuNet nao acha rosto em imagem sintetica) e imagem de ruido por quadro, pra cada quadro casar
  // num instante so do bruto; a voz tem envelope que nao se repete
  const pub = join(d, 'public'), bruto = join(d, 'bruto.mp4'), base = join(d, 'base.mp4'), final = join(d, 'final.mp4')
  mkdirSync(pub, { recursive: true })
  const env = '(0.65+0.25*sin(2*PI*1.7*t)+0.2*sin(2*PI*2.9*t+1)+0.15*sin(2*PI*0.53*t))*sin(2*PI*220*t)'
  ff('-f', 'lavfi', '-i', 'color=c=gray:s=32x58:r=30:d=10,noise=alls=100:allf=t+u,scale=320:568:flags=neighbor',
    '-f', 'lavfi', '-i', `aevalsrc='${env}':s=48000:d=10`, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  ff('-ss', '2', '-i', bruto, '-t', '5', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', base)
  ff('-i', base, '-c', 'copy', '-output_ts_offset', '10', join(pub, 'pessoa.mp4'))
  ff('-i', base, '-c', 'copy', final)
  assert.ok(carimbosDe(join(pub, 'pessoa.mp4'))[0] > 9.9, 'canario: a pessoa comeca em 10 s')
  writeFileSync(join(pub, 'props.json'), JSON.stringify({ pessoa: 'pessoa.mp4', voz: 'voz.wav', duracaoSeg: 5, segmentos: [], sfx: [] }))
  const harness = join(d, 'rosto.py')
  writeFileSync(harness, [
    'import runpy, sys, numpy as np',
    'ns = runpy.run_path(sys.argv[1], run_name="verificar")',
    'real = ns["main"].__globals__["cv2"]',
    'class Det:',
    '    def detect(self, f): return 1, np.array([[60, 100, 200, 200]], dtype=np.float32)',
    'class Yn:',
    '    @staticmethod',
    '    def create(*a, **k): return Det()',
    'class Cv:',
    '    FaceDetectorYN = Yn',
    '    def __getattr__(self, n): return getattr(real, n)',
    'ns["main"].__globals__["cv2"] = Cv()',
    'sys.argv = sys.argv[1:]',
    'ns["main"]()',
  ].join('\n') + '\n')
  const rodar = (inicioVoz) => {
    ff('-ss', String(inicioVoz), '-i', bruto, '-t', '5', '-vn', '-ar', '48000', '-c:a', 'pcm_s24le', join(pub, 'voz.wav'))
    const r = rodarPython(harness, [script('verificar-video.py'), join(pub, 'props.json'), final, '--bruto', bruto, '--public-dir', pub], { env: ENV })
    return { r, saida: semTraco(r.stdout) + semTraco(r.stderr) }
  }
  const ok = rodar(2)
  assert.doesNotMatch(ok.saida, /Traceback|nao achei rosto/, ok.saida)
  assert.equal(ok.r.status, 0, ok.saida)
  assert.match(ok.saida, /PASSOU/)
  const torto = rodar(1.8)
  assert.equal(torto.r.status, 1, torto.saida)
  // a pessoa copiada comeca o formato no audio (priming do aac), 22 ms antes do video: a imagem sai 22 ms antes
  assert.match(torto.saida, /boca fora da voz em: 0[.]0 s \(imagem de 1[.]9[0-9] s do bruto, voz de 1[.]80 s/)
  const ms = [...torto.saida.matchAll(/: ([+-][0-9]+) ms\)/g)].map((m) => Number(m[1]))
  assert.ok(ms.length >= 6 && ms.every((x) => x > 150 && x < 250), `toda janela falando acusa os 200 ms: ${ms}`)
  assert.doesNotMatch(torto.saida, /janelas puladas/)
}))

// 5.58 B: glossario na legenda. Marca inventada (Lumora, Vexto, Lumetro); o conferir-nomes.py roda de verdade sobre
// um fala.txt e uma lista no formato do marca/nomes.md (linha de citacao e outra secao nao contam)
const LISTA = (...nomes) => ['# Nomes da marca', '', '> - Citado (fora da lista)', '', '## Nomes', '', ...nomes.map((n) => '- ' + n), ''].join('\n')
function conferir(d, fala, nomes, { saida = true } = {}) {
  const arq = join(d, 'fala.txt'), lista = join(d, 'nomes.md'), sai = join(d, 'fala.conferida.txt')
  writeFileSync(arq, fala, 'utf8')
  if (nomes === null) rmSync(lista, { force: true })
  else writeFileSync(lista, nomes, 'utf8')
  rmSync(sai, { force: true })
  const r = py('conferir-nomes.py', [arq, '--nomes', lista, ...(saida ? ['--saida', sai] : [])])
  const alvo = saida ? sai : arq
  return { r, out: semTraco(r.stdout) + semTraco(r.stderr), texto: existsSync(alvo) ? readFileSync(alvo, 'utf8') : null }
}

test('5.58 B: conferir-nomes acerta a caixa do nome da lista e diz o que trocou', () => comTemp((d) => {
  const c = conferir(d, 'a lumora chegou\nde novo a LUMORA\n', LISTA('Lumora'))
  assert.equal(c.r.status, 0, c.out)
  assert.equal(c.texto, 'a Lumora chegou\nde novo a Lumora\n')
  assert.match(c.out, /corrigi: linha 1 "lumora" -> "Lumora"/)
  assert.match(c.out, /corrigi: linha 2 "LUMORA" -> "Lumora"/)
}))

test('5.58 B: conferir-nomes acerta o acento, nos dois sentidos', () => comTemp((d) => {
  const c = conferir(d, 'comprei na lume e na véxto\n', LISTA('Lumé', 'Vexto'))
  assert.equal(c.r.status, 0, c.out)
  assert.equal(c.texto, 'comprei na Lumé e na Vexto\n')
}))

test('5.58 B: conferir-nomes mantem a pontuacao colada, tambem em nome de duas palavras', () => comTemp((d) => {
  const c = conferir(d, '(lumora), casa vexto! e "casa VEXTO."\n', LISTA('Lumora', 'Casa Vexto'))
  assert.equal(c.r.status, 0, c.out)
  assert.equal(c.texto, '(Lumora), Casa Vexto! e "Casa Vexto."\n')
}))

test('5.58 B: conferir-nomes avisa o nome parecido e nao troca', () => comTemp((d) => {
  const fala = 'a lumara chegou\nsem nome aqui\n'
  const c = conferir(d, fala, LISTA('Lumora'))
  assert.equal(c.r.status, 4, c.out)
  assert.match(c.out, /confira: linha 1 "lumara" parece "Lumora"/)
  assert.equal(c.texto, fala)
}))

test('5.58 B: conferir-nomes acha "1 metro" contra um nome de 7 letras pela janela de uma palavra a mais', () => comTemp((d) => {
  const c = conferir(d, 'fui no 1 metro, hoje\n', LISTA('Lumetro'))
  assert.equal(c.r.status, 4, c.out)
  assert.match(c.out, /confira: linha 1 "1 metro" parece "Lumetro"/)
  assert.equal((c.out.match(/confira:/g) || []).length, 1, 'um aviso so pelo trecho: ' + c.out)
}))

test('5.58 B: conferir-nomes nao avisa palavra comum longe do nome (canario: a parecida avisa)', () => comTemp((d) => {
  const comum = conferir(d, 'a memória da loja abre cedo e o dia passa\n', LISTA('Lumora', 'Vexto'))
  assert.equal(comum.r.status, 0, comum.out)
  assert.doesNotMatch(comum.out, /confira:/)
  const canario = conferir(d, 'a lumoria da loja abre cedo e o dia passa\n', LISTA('Lumora', 'Vexto'))
  assert.equal(canario.r.status, 4, canario.out)
  assert.match(canario.out, /confira: linha 1 "lumoria" parece "Lumora"/)
}))

test('5.58 B: conferir-nomes com nome de ate 3 letras so acerta o exato; com 4 letras avisa a distancia 1 e nao a 2', () => comTemp((d) => {
  const curto = conferir(d, 'o iko chegou e o ika saiu\n', LISTA('Iko'))
  assert.equal(curto.r.status, 0, curto.out)
  assert.equal(curto.texto, 'o Iko chegou e o ika saiu\n')
  const quatro = conferir(d, 'a zuna e a zana\n', LISTA('Zuno'))
  assert.equal(quatro.r.status, 4, quatro.out)
  assert.match(quatro.out, /confira: linha 1 "zuna" parece "Zuno"/)
  assert.doesNotMatch(quatro.out, /"zana"/)
}))

test('5.58 B: conferir-nomes com nome de 5 letras avisa a distancia 1 e nao a 2, que passa de 34% do tamanho', () => comTemp((d) => {
  const um = conferir(d, 'a vexta chegou\n', LISTA('Vexto'))
  assert.equal(um.r.status, 4, um.out)
  assert.match(um.out, /confira: linha 1 "vexta" parece "Vexto"/)
  const dois = conferir(d, 'a vesta chegou\n', LISTA('Vexto'))
  assert.equal(dois.r.status, 0, dois.out)
  assert.doesNotMatch(dois.out, /confira:/)
}))

test('5.58 B: conferir-nomes com (avisa) so avisa, mesmo com a grafia igual tirando a caixa', () => comTemp((d) => {
  const fala = 'a lume acendeu\n'
  const c = conferir(d, fala, LISTA('Lume (avisa)'))
  assert.equal(c.r.status, 4, c.out)
  assert.match(c.out, /confira: linha 1 "lume" parece "Lume"/)
  assert.equal(c.texto, fala)
  const certo = conferir(d, 'a Lume acendeu\n', LISTA('Lume (avisa)'))
  assert.equal(certo.r.status, 0, certo.out)
  assert.doesNotMatch(certo.out, /confira:/)
}))

test('5.58 B: conferir-nomes sem a lista e com a lista vazia sai 0 com a fala igual; fala que nao abre sai 1', () => comTemp((d) => {
  const fala = 'a lumora chegou\n'
  const sem = conferir(d, fala, null)
  assert.equal(sem.r.status, 0, sem.out)
  assert.match(sem.out, /nomes[.]md/)
  assert.equal(sem.texto, fala, 'sem a lista, o --saida sai igual a fala')
  const vazia = conferir(d, fala, LISTA())
  assert.equal(vazia.r.status, 0, vazia.out)
  assert.equal(vazia.texto, fala)
  const r = py('conferir-nomes.py', [join(d, 'nao-existe.txt'), '--nomes', join(d, 'nomes.md')])
  assert.equal(r.status, 1, semTraco(r.stderr))
  assert.match(semTraco(r.stderr), /nao-existe[.]txt/)
}))

test('5.58 B: conferir-nomes sem --saida corrige no lugar, e rodar de novo nao muda nada', () => comTemp((d) => {
  const um = conferir(d, 'a lumora e a casa vexto\n', LISTA('Lumora', 'Casa Vexto'), { saida: false })
  assert.equal(um.r.status, 0, um.out)
  assert.equal(um.texto, 'a Lumora e a Casa Vexto\n')
  const r = py('conferir-nomes.py', [join(d, 'fala.txt'), '--nomes', join(d, 'nomes.md')])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.doesNotMatch(semTraco(r.stdout), /corrigi/)
  assert.equal(readFileSync(join(d, 'fala.txt'), 'utf8'), 'a Lumora e a Casa Vexto\n')
}))

test('5.58 B: conferir-nomes preserva o CRLF e a ultima linha sem quebra', () => comTemp((d) => {
  const c = conferir(d, 'a lumora\r\nsem nome\r\na lumora', LISTA('Lumora').replace(/\n/g, '\r\n'))
  assert.equal(c.r.status, 0, c.out)
  assert.equal(c.texto, 'a Lumora\r\nsem nome\r\na Lumora')
  assert.match(c.out, /corrigi: linha 3 /)
}))

test('5.58 B: conferir-nomes com nome que tem palavra so de simbolo acerta a caixa e nao avisa o nome certo', () => comTemp((d) => {
  const c = conferir(d, 'na lumora & vexto\n', LISTA('Lumora & Vexto'))
  assert.equal(c.r.status, 0, c.out)
  assert.equal(c.texto, 'na Lumora & Vexto\n')
  const certo = conferir(d, 'na Lumora & Vexto\n', LISTA('Lumora & Vexto'))
  assert.equal(certo.r.status, 0, certo.out)
  assert.doesNotMatch(certo.out, /confira:|corrigi:/)
  const parecido = conferir(d, 'na lumara & vexto\n', LISTA('Lumora & Vexto'))
  assert.equal(parecido.r.status, 4, parecido.out)
  assert.match(parecido.out, /confira: linha 1 "lumara & vexto" parece "Lumora & Vexto"/)
}))

test('5.58 B: conferir-nomes nao dobra o simbolo colado do nome e o exato curto nao esconde o parecido maior', () => comTemp((d) => {
  const mais = conferir(d, 'uso lumo++ hoje\n', LISTA('Lumo++'))
  assert.equal(mais.r.status, 0, mais.out)
  assert.equal(mais.texto, 'uso Lumo++ hoje\n')
  const ponto = conferir(d, 'uso .vexto hoje\n', LISTA('.Vexto'))
  assert.equal(ponto.texto, 'uso .Vexto hoje\n')
  const maior = conferir(d, 'a lumora prox chegou\n', LISTA('Lumora', 'Lumora Pro'))
  assert.equal(maior.r.status, 4, maior.out)
  assert.match(maior.out, /confira: linha 1 "lumora prox" parece "Lumora Pro"/)
  const canario = conferir(d, 'a lumora prox chegou\n', LISTA('Lumora Pro'))
  assert.match(canario.out, /confira: linha 1 "lumora prox" parece "Lumora Pro"/)
}))

test('5.58 B: conferir-nomes avisa, sem trocar, o nome com simbolo que a fala trouxe sem o simbolo', () => comTemp((d) => {
  const certo = conferir(d, 'uso C++, hoje\n', LISTA('C++'))
  assert.equal(certo.r.status, 0, 'canario: o nome com o simbolo e a virgula passa calado ' + certo.out)
  assert.doesNotMatch(certo.out, /confira:|corrigi:/)
  // dois nomes que so o simbolo separa: o que a fala trouxe certo nao avisa o outro
  for (const fala of ['uso C++ hoje\n', 'uso C# hoje\n']) {
    const dois = conferir(d, fala, LISTA('C++', 'C#'))
    assert.equal(dois.r.status, 0, dois.out)
    assert.doesNotMatch(dois.out, /confira:|corrigi:/)
  }
  for (const [fala, nome, trecho] of [['uso c hoje\n', 'C++', 'c'], ['uso C hoje\n', 'C++', 'C'], ['comprei na casa vexto\n', 'Casa & Vexto', 'casa vexto']]) {
    const c = conferir(d, fala, LISTA(nome))
    assert.equal(c.r.status, 4, c.out)
    assert.equal(c.texto, fala, 'a fala sem o simbolo nao se troca')
    assert.doesNotMatch(c.out, /corrigi:/)
    assert.match(c.out, new RegExp(`confira: linha 1 "${trecho}" parece "${nome.replace(/[+&]/g, (x) => '[' + x + ']')}"`))
  }
}))

test('5.58 B: conferir-nomes le so a secao Nomes da lista', () => comTemp((d) => {
  const fala = 'a vexto chegou\n'
  const fora = conferir(d, fala, LISTA('Lumora') + '\n## Outra\n\n- Vexto\n')
  assert.equal(fora.r.status, 0, fora.out)
  assert.equal(fora.texto, fala, 'nome de outra secao nao troca: ' + fora.out)
  const canario = conferir(d, fala, LISTA('Lumora', 'Vexto'))
  assert.equal(canario.texto, 'a Vexto chegou\n')
}))

test('5.58 B: conferir-nomes com a lista que nao abre sai 1 e nao mexe na fala', () => comTemp((d) => {
  const fala = 'a lumora chegou\n'
  const arq = join(d, 'fala.txt'), lista = join(d, 'nomes.md')
  writeFileSync(arq, fala, 'utf8')
  writeFileSync(lista, Buffer.from([0x2d, 0x20, 0xff, 0xfe, 0x0a]))
  const r = py('conferir-nomes.py', [arq, '--nomes', lista])
  assert.equal(r.status, 1, semTraco(r.stdout) + semTraco(r.stderr))
  assert.match(semTraco(r.stderr), /nomes[.]md/)
  assert.equal(readFileSync(arq, 'utf8'), fala)
}))

test('5.58 B: prompt_dos_nomes monta a frase sem acento, sem o (avisa), so da secao Nomes, e corta no teto com aviso', () => comTemp((d) => {
  const r = funcaoDoPy('blocos.py', 'prompt_dos_nomes', [
    'linhas = ["# Nomes da marca", "> - Citado (fora da lista)", "## Nomes", "- Lumé", "- Casa Vexto", "- Copa (avisa)", "[um por linha]", "- Lumé", "## Outra", "- Fora"]',
    'assert f(linhas) == ("Nomes: Lume, Casa Vexto, Copa.", None), f(linhas)',
    'assert f([]) == ("", None) and f(["## Nomes", ""]) == ("", None)',
    'muitos = ["## Nomes"] + ["- Nome%03d" % i for i in range(200)]',
    'frase, aviso = f(muitos)',
    'assert len(frase) <= 600 and frase.startswith("Nomes: Nome000, Nome001") and frase.endswith("."), frase',
    'assert len(frase) > 580, len(frase)',
    'assert aviso and "600" in aviso and "200" in aviso, aviso',
    'print("ok")',
  ].join('\n'), d)
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(r.stdout, /ok/)
}))

test('5.58 B: blocos passa a lista ao whisper pelo --prompt antes do -f, e sem lista roda como antes', () => comTemp((d) => {
  // whisper de mentira: devolve como texto os argumentos que recebeu
  const wdir = join(d, 'whisper')
  mkdirSync(wdir)
  writeFileSync(join(wdir, 'ggml-falso.bin'), '')
  if (process.platform === 'win32') writeFileSync(join(wdir, 'eco.cmd'), '@echo off\r\necho %*\r\n')
  else { writeFileSync(join(wdir, 'eco'), '#!/bin/sh\necho "$@"\n'); chmodSync(join(wdir, 'eco'), 0o755) }
  const bruto = join(d, 'bruto.wav')
  ff('-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=16000', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=1:sample_rate=16000', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', '-ac', '1', bruto)
  writeFileSync(join(d, 'nomes.md'), LISTA('Lumé', 'Casa Vexto', 'Copa (avisa)'))
  writeFileSync(join(d, 'vazia.md'), LISTA())
  const rodar = (extra) => {
    const sai = join(d, 'blocos.md')
    const r = py('blocos.py', [bruto, sai, '--modelo', 'falso', '--whisper-bin', 'eco', ...extra], { env: { ...ENV, WHISPER_DIR: wdir } })
    assert.equal(r.status, 0, semTraco(r.stderr))
    const linhas = readFileSync(sai, 'utf8').split(/\r?\n/).filter((l) => /^[|] [0-9]+ [|]/.test(l))
    assert.equal(linhas.length, 2, 'canario: o envelope achou os 2 trechos')
    return { stderr: semTraco(r.stderr), textos: linhas.map((l) => l.split('|')[5]) }
  }
  const com = rodar(['--nomes', join(d, 'nomes.md')])
  for (const t of com.textos) {
    assert.ok(t.includes('Nomes: Lume, Casa Vexto, Copa.'), t)
    assert.ok(t.includes('--prompt') && t.indexOf('--prompt') < t.indexOf(' -f '), t)
  }
  const sem = rodar([])
  for (const t of sem.textos) assert.ok(!t.includes('--prompt') && t.includes(' -f '), t)
  const falta = rodar(['--nomes', join(d, 'nao-tem.md')])
  assert.match(falta.stderr, /nao-tem[.]md/)
  for (const t of falta.textos) assert.ok(!t.includes('--prompt') && t.includes(' -f '), t)
  const vazia = rodar(['--nomes', join(d, 'vazia.md')])
  assert.match(vazia.stderr, /vazia[.]md/)
  for (const t of vazia.textos) assert.ok(!t.includes('--prompt') && t.includes(' -f '), t)
}))

test('5.58 B: alinhar aguenta a troca de duas palavras do whisper por um nome so', () => comTemp((d) => {
  assert.deepEqual(alinhar(d, [['fui', 0, 400], ['no', 400, 800], ['1', 800, 1000], ['metro', 1000, 1400], ['hoje', 1400, 1800]], 'fui no Lumetro hoje'),
    [['fui', 0, 400], ['no', 400, 800], ['Lumetro', 800, 1400], ['hoje', 1400, 1800]])
}))

// 5.58 D: buraco na fala (clipe com o som original no meio). Pessoa de 4 s com o numero do quadro no cinza (o quadro
// k vale 2k), voz com "um" (440 Hz, 1,0 a 1,5 s) e "dois" (660 Hz, 2,5 a 3,0 s), clipe de 3,5 s com som a -30 dB
function falaBuraco(pub) {
  const tom = 'if(between(t,1,1.5),0.5*sin(2*PI*440*t),0)+if(between(t,2.5,3),0.5*sin(2*PI*660*t),0)'
  ff('-f', 'lavfi', '-i', `aevalsrc='${tom}':s=48000:d=4`, '-c:a', 'pcm_s24le', join(pub, 'voz.wav'))
  ff('-f', 'lavfi', '-i', "color=c=black:s=64x64:r=30:d=4,format=yuv420p,geq=lum='2*N':cb=128:cr=128", '-i', join(pub, 'voz.wav'),
    '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(pub, 'pessoa.mp4'))
  writeFileSync(join(pub, 'voz.alinhado.json'), JSON.stringify([{ text: ' um', startMs: 1000, endMs: 1490 }, { text: ' ja', startMs: 1490, endMs: 1700 }, { text: ' dois', startMs: 2500, endMs: 3000 }]))
  mkdirSync(join(pub, 'clipes'), { recursive: true })
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=3.5', '-f', 'lavfi', '-i', "aevalsrc='0.0316*sin(2*PI*1000*t)':s=48000:d=3.5",
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(pub, 'clipes', 'c.mp4'))
}
// o ponto em 1,9667 s cai no quadro 59 (59/30 escrito com 4 casas passa do carimbo: o corte por segundo levaria o quadro 59)
const BURACO = { seg: 1.9667, arquivo: 'clipes/c.mp4', tam: { w: 320, h: 180 }, entradaSeg: 0.25, saidaSeg: 3.25, selo: 'LUMORA, 2026', legenda: [{ ini: 0.2, fim: 1.4, palavras: ['ola', 'mundo'] }], direito: { tipo: 'licenca', fonte: 'contrato com a Lumora' } }
const edicaoBuraco = (extra = {}, buraco = {}) => ({ pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', buracos: [{ ...BURACO, ...buraco }], ...extra })
function prepararBuraco(d, edicao) {
  const arq = join(d, 'edicao.json'), sai = join(d, 'props.json')
  writeFileSync(arq, JSON.stringify(edicao))
  const r = py('preparar-props.py', [arq, sai, '--public-dir', join(d, 'public')])
  return { r, props: () => JSON.parse(readFileSync(sai, 'utf8')) }
}
// numero de cada quadro lido do cinza (plano Y cru do 64x64, sem scale: o scale mexe na faixa e erra o numero)
function numerosDosQuadros(arq) {
  const b = spawnSync('ffmpeg', ['-v', 'error', '-i', arq, '-vf', 'format=yuv420p,extractplanes=y', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 }).stdout
  const out = []
  for (let i = 0; i + 4096 <= b.length; i += 4096) { let s = 0; for (let j = 0; j < 4096; j++) s += b[i + j]; out.push(Math.round(s / 4096 / 2)) }
  return out
}
const rmsDe = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length))
function lufsDe(arq) {
  const o = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', arq, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  // espaco literal depois do "I:" (letra, dois-pontos e barra invertida o Gate 6 le como caminho de Windows)
  const m = [...o.matchAll(/I: +(-?[0-9.]+) LUFS/g)]
  assert.ok(m.length > 0, 'canario: o ebur128 mediu ' + arq)
  return Number(m[m.length - 1][1])
}

test('5.58 D: deslocar do buraco por ponta, com encaixe no quadro e soma de dois buracos', () => comTemp((d) => {
  const r = funcaoDoPy('buraco.py', 'deslocar', [
    'ns.update(FPS=30, MEIO=0.5 / 30)',
    'q = ns["q"]',
    'assert q(1.98) == 59 / 30 and q(2.0) == 2.0, "encaixe no quadro"',
    'pl = [{"P": 10.0, "D": 3.0}]',
    'assert f(9.9, pl) == 9.9 and f(10.1, pl, fim=True) == 13.1, "canario: longe do ponto"',
    'assert f(8.0, pl) == 8.0 and f(10.0, pl, fim=True) == 10.0, "item de 8 a 10 com o ponto em 10 fica"',
    'assert f(10.0, pl) == 13.0 and f(12.0, pl, fim=True) == 15.0, "item de 10 a 12 vira 13 a 15"',
    'assert f(10.0 - 0.5 / 30, pl) == round(13.0 - 0.5 / 30, 4), "comeco meio quadro antes do ponto ja anda"',
    'assert f(10.0 + 0.5 / 30, pl, fim=True) == round(10.0 + 0.5 / 30, 4), "fim meio quadro depois do ponto fica"',
    'dois = [{"P": 2.0, "D": 1.5}, {"P": 5.0, "D": 2.0}]',
    'assert f(1.0, dois) == 1.0 and f(3.0, dois) == 4.5 and f(6.0, dois) == 9.5, "soma de dois buracos"',
    'print("ok")',
  ].join('\n'), d, ['anda', 'q'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
}))

test('5.58 D: preparar-props com buraco anda o que vem depois, congela a pessoa no quadro de antes e abre silencio na voz', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  falaBuraco(pub)
  assert.deepEqual(numerosDosQuadros(join(pub, 'pessoa.mp4')), Array.from({ length: 120 }, (_, k) => k), 'canario: o cinza da o numero do quadro')
  const { r, props } = prepararBuraco(d, edicaoBuraco({
    cortesSeg: [1.5, 2.5],
    chaves: [{ chave: 'UM', deSeg: 1.0, ateSeg: 1.9667, topo: 400 }, { chave: 'DOIS', deSeg: { palavra: 'dois' }, ateSeg: 3.0, topo: 400 }],
    cartoes: [{ deSeg: 3.1, ateSeg: 3.6, linhas: [{ texto: 'X', aSeg: 0.3 }] }],
    sfx: [{ arquivo: 'sfx/pop.wav', seg: { palavra: 'dois' } }],
    ondas: [{ deSeg: 2.5, ateSeg: 3.2 }],
  }))
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ganho [+-][0-9]/, 'o ganho do som do clipe sai impresso')
  const p = props()
  assert.deepEqual(p.cortesSeg, [1.5, 5.5])
  assert.deepEqual(p.chaves.map((c) => [c.deSeg, c.ateSeg]), [[1.0, 1.9667], [5.5, 6.0]], 'a chave que acaba no ponto fica; a de depois anda 3 s')
  assert.deepEqual([p.cartoes[0].deSeg, p.cartoes[0].ateSeg, p.cartoes[0].linhas[0].aSeg], [6.1, 6.6, 0.3])
  assert.equal(p.sfx[0].seg, 5.5)
  assert.deepEqual([p.ondas[0].deSeg, p.ondas[0].ateSeg], [5.5, 6.2])
  assert.ok(Math.max(...p.ondas[0].valores) > 0.5, 'a onda le a voz nova, com o "dois" ja andado')
  assert.equal(p.duracaoSeg, 7)
  assert.deepEqual([p.pessoa, p.voz, p.legendas], ['buraco/pessoa.mp4', 'buraco/voz.wav', 'buraco/legendas.json'])
  for (const a of [p.pessoa, p.voz, p.legendas, p.buracos[0].audio]) assert.ok(existsSync(join(pub, a)), a)
  assert.deepEqual(p.buracos, [{ deSeg: 1.9667, ateSeg: 4.9667, arquivo: 'clipes/c.mp4', entradaSeg: 0.25, tam: { w: 320, h: 180 }, selo: 'LUMORA, 2026', legenda: BURACO.legenda, audio: 'buraco/clipe-00.wav' }])
  // imagem: 59 quadros de antes, 90 do quadro 58 parado e o resto a partir do quadro 59
  const esperado = [...Array.from({ length: 59 }, (_, k) => k), ...Array(90).fill(58), ...Array.from({ length: 61 }, (_, k) => 59 + k)]
  assert.deepEqual(numerosDosQuadros(join(pub, p.pessoa)), esperado)
  // voz: silencio no buraco e o "dois" 3 s depois, no mesmo tom
  const v = join(pub, p.voz)
  assert.ok(Math.abs(duracao(v) - 7) < 0.002, `voz com ${duracao(v)} s`)
  assert.equal(sonda(v, { sel: 'a:0', campo: 'sample_rate' }), '48000')
  assert.ok(Math.abs(dominante(amostras(v, 1.1, 1.4)) - 440) <= 4, 'canario: o "um" ficou no lugar')
  assert.ok(rmsDe(amostras(v, 2.0, 4.95)) < 1e-4, 'silencio no buraco')
  assert.ok(Math.abs(dominante(amostras(v, 5.6, 5.9)) - 660) <= 4, 'o "dois" andou 3 s')
  assert.ok(Math.abs(duracao(join(pub, p.buracos[0].audio)) - 3) < 0.01, 'o som do clipe tem o tamanho do buraco')
  const leg = JSON.parse(readFileSync(join(pub, p.legendas), 'utf8'))
  assert.deepEqual(leg.map((c) => [c.text.trim(), c.startMs, c.endMs]), [['um', 1000, 1490], ['ja', 1490, 1700], ['dois', 5500, 6000]])
  assert.equal(leg[1].pageBreakAfter, true, 'a palavra de antes do buraco fecha a pagina')
}))

test('5.58 D: preparar-props recusa buraco que atravessa item, cai no meio de palavra, vem sem direito ou selo, com pagina fora do clipe, clipe curto e segunda passada', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  falaBuraco(pub)
  const recusa = (edicao, re, nome) => {
    const { r } = prepararBuraco(d, edicao)
    const err = semTraco(r.stderr)
    assert.ok(err.trim().length > 0, `${nome}: o stderr veio vazio`)
    assert.notEqual(r.status, 0, nome)
    assert.match(err, re, nome)
  }
  recusa(edicaoBuraco({ chaves: [{ chave: 'X', deSeg: 1.5, ateSeg: 2.5, topo: 400 }] }), /atravessa/, 'chave que atravessa o ponto')
  recusa(edicaoBuraco({}, { seg: 1.25 }), /meio da palavra 'um'/, 'meio de palavra')
  recusa(edicaoBuraco({}, { direito: undefined }), /direito/, 'sem direito')
  recusa(edicaoBuraco({}, { selo: ' ' }), /selo/, 'selo vazio')
  recusa(edicaoBuraco({}, { legenda: [{ ini: 2.5, fim: 3.5, palavras: ['fim'] }] }), /pagina/, 'pagina fora do clipe')
  recusa(edicaoBuraco({}, { legenda: [{ ini: 0, fim: 1, palavras: ['a', 'b', 'c', 'd', 'e'] }] }), /pagina/, 'pagina com 5 palavras')
  recusa(edicaoBuraco({}, { saidaSeg: 4.0 }), /curto/, 'clipe curto')
  recusa(edicaoBuraco({}, { saidaSeg: 0.45, legenda: [] }), /pelo menos 0,5 s/, 'trecho curto demais pra medir o volume')
  const { r } = prepararBuraco(d, edicaoBuraco())
  assert.equal(r.status, 0, 'canario: o buraco certo passa ' + semTraco(r.stderr))
  recusa(edicaoBuraco({ pessoa: 'buraco/pessoa.mp4', voz: 'buraco/voz.wav', legendas: 'buraco/legendas.json' }), /ja passou/, 'segunda passada')
}))

test('5.58 D: preparar-props recusa dois buracos no mesmo quadro e ponto no fim ou depois do video', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  falaBuraco(pub)
  const roda = (buracos) => {
    const { r } = prepararBuraco(d, { pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', buracos: buracos.map((b) => ({ ...BURACO, ...b })) })
    return { r, err: semTraco(r.stderr) }
  }
  const ok = roda([{ seg: 1.0 }, { seg: 3.5 }])
  assert.equal(ok.r.status, 0, 'canario: dois buracos em quadros diferentes e dentro do video passam ' + ok.err)
  for (const [buracos, re, nome] of [
    [[{ seg: 1.0 }, { seg: 1.0 }], /mesmo quadro/, 'mesmo ponto'],
    [[{ seg: 1.0 }, { seg: 1.01 }], /mesmo quadro/, 'pontos que caem no mesmo quadro'],
    [[{ seg: 5 }], /depois do video/, 'ponto depois do fim'],
    [[{ seg: 4 }], /depois do video/, 'ponto no fim'],
  ]) {
    const { r, err } = roda(buracos)
    assert.ok(err.trim().length > 0, `${nome}: o stderr veio vazio`)
    assert.notEqual(r.status, 0, nome)
    assert.match(err, re, nome)
  }
}))

test('5.58 D: camera lenta e buraco juntos, o ponto anda pela lenta e a lenta anda pelo buraco', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  falaBuraco(pub)
  const um = { saidaSeg: 1.25, entradaSeg: 0.25, legenda: [] }
  const { r, props } = prepararBuraco(d, {
    pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json',
    cameraLenta: [{ deSeg: { palavra: 'um' }, ateSeg: { palavra: 'um', fim: true }, fator: 0.5 }],
    buracos: [{ ...BURACO, ...um, seg: 0.5 }, { ...BURACO, ...um, seg: { palavra: 'dois' } }],
  })
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const p = props()
  assert.deepEqual(p.lentas, [{ deSeg: 2.5, ateSeg: 3.5 }], 'a lenta anda pelo buraco de 0,5 s')
  assert.deepEqual(p.buracos.map((b) => [b.deSeg, b.ateSeg]), [[0.5, 1.5], [4.5, 5.5]], 'o "dois" anda 1 s pela lenta e 1 s pelo primeiro buraco')
  assert.equal(p.duracaoSeg, 7)
  assert.equal(quadros(join(pub, p.pessoa)), 210)
}))

test('5.58 D: o som do clipe sai no volume medido da voz', () => comTemp((d) => {
  const pub = join(d, 'public'); mkdirSync(pub)
  falaBuraco(pub)
  ff('-f', 'lavfi', '-i', "aevalsrc='0.25*sin(2*PI*300*t)':s=48000:d=4", '-c:a', 'pcm_s24le', join(pub, 'voz.wav'))
  const voz = lufsDe(join(pub, 'voz.wav'))
  assert.ok(Math.abs(lufsDe(join(pub, 'clipes', 'c.mp4')) - voz) > 5, 'canario: o clipe cru fica longe da voz')
  const { r, props } = prepararBuraco(d, edicaoBuraco())
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  const som = join(pub, props().buracos[0].audio)
  const lu = lufsDe(som)
  assert.ok(Math.abs(lu - voz) <= 1, `som do clipe a ${lu} LUFS e a voz a ${voz}`)
  assert.ok(Math.max(...amostras(som, 0, 3).map(Math.abs)) < 0.9, 'pico limitado')
}))

test('5.58 D: o verificar-video conta o buraco como trecho coberto e como clipe que se mexe sozinho', () => comTemp((d) => {
  const r = funcaoDoPy('verificar-video.py', 'trechos_cobertos', [
    'P = {"segmentos": [{"deSeg": 0.5, "ateSeg": 1.0, "tipo": "video", "cheia": True}, {"deSeg": 6, "ateSeg": 7, "tipo": "imagem", "cheia": False}],',
    '     "cartoes": [{"deSeg": 2, "ateSeg": 2.5}], "buracos": [{"deSeg": 3, "ateSeg": 5}]}',
    't = f(P)',
    'assert (0.5, 1.0) in t and (2, 2.5) in t, "canario: insercao cheia e cartao cobrem"',
    'assert (6, 7) not in t, "insercao fora da tela cheia nao cobre"',
    'assert (3, 5) in t, "o buraco cobre a pessoa parada"',
    'sem = {"segmentos": [{"deSeg": 3.2, "ateSeg": 4.0, "tipo": "video"}], "buracos": [{"deSeg": 3, "ateSeg": 5}]}',
    'assert (3, 5) in f(sem), "segmento sem cheia nao esconde o buraco"',
    'assert f({"segmentos": []}) == [], "sem nada, nada coberto"',
    'c = ns["clipes_vivos"](P)',
    'assert (0.5, 1.0) in c and (3, 5) in c and (6, 7) not in c, "o clipe do buraco se mexe sozinho"',
    'print("ok")',
  ].join('\n'), d, ['clipes_vivos'])
  assert.equal(r.status, 0, semTraco(r.stderr) + semTraco(r.stdout))
  assert.match(semTraco(r.stdout), /ok/)
  const src = readFileSync(script('verificar-video.py'), 'utf8')
  assert.ok(src.includes('cobre = trechos_cobertos(P)'), 'a funcao nao esta ligada ao calculo de onde a pessoa aparece')
  assert.ok(src.includes('clipes = clipes_vivos(P)'), 'a funcao nao esta ligada ao freezedetect')
  assert.ok(src.includes('for b in P.get("buracos", []):'), 'a duracao do clipe do buraco nao se confere')
}))

test('5.58 D: o VideoV2 tem buracos com padrao vazio e desenha o clipe por cima do VideoV1, dentro da camada com escala', () => {
  const src = readFileSync(join(AQUI, '..', 'src', 'VideoV2.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const i = src.indexOf('  buracos: z')
  assert.ok(i > 0, 'buracos no schema')
  const bloco = src.slice(i, src.indexOf('\n});', i))
  assert.ok(bloco.trimEnd().endsWith('.default([]),'), 'buracos com padrao vazio: o exemplo do Studio segue sem buraco')
  for (const k of ['deSeg', 'ateSeg', 'arquivo', 'entradaSeg', 'tam', 'selo', 'legenda', 'audio']) assert.ok(bloco.includes(k + ':'), `o schema dos buracos tem ${k}`)
  const v1 = src.indexOf('<VideoV1'), bu = src.indexOf('<Buraco'), flash = src.indexOf('{flashAgora')
  assert.ok(v1 > 0 && flash > 0, 'canario: VideoV1 e flash achados')
  assert.ok(bu > v1 && bu < flash, 'o clipe vem depois do VideoV1 (cobre a pessoa parada) e antes do flash (pega a escala)')
  assert.ok(src.includes('from "./camadas/kit"') && src.includes('<LegendaPeito'), 'a legenda do clipe e a do kit')
  assert.ok(/<Video[^>]*muted/.test(src) && src.includes('objectFit: "contain"'), 'o clipe aparece inteiro e mudo (o som vem do audio medido)')
  assert.ok(src.includes('top: tema.zonaTopo'), 'o selo fica dentro da zona segura')
})
