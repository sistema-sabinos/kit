// Prova a cadeia Python do motor rodando cada script de verdade, com midia gerada pelo ffmpeg
// numa pasta temporaria. O que depende do whisper ou do modelo de profundidade pula com o motivo
// escrito (o caminho real se prova no ensaio). A ultima prova varre os .py atras de caminho fixo
// e de termo que nao pode ir no kit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
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

test('montar-blocos junta os trechos e imprime os cortes medidos', () => comTemp((d) => {
  const bruto = join(d, 'bruto.mp4'), sai = join(d, 'montado.mp4')
  ff('-f', 'lavfi', '-i', 'testsrc2=s=320x568:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto)
  const r = py('montar-blocos.py', [bruto, sai, '0.5:1.5', '2.5:3.5'])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /2 blocos/)
  assert.ok(existsSync(sai))
  assert.ok(Math.abs(Number(sonda(sai, { sel: 'v:0', campo: 'width' })) - 1080) < 1)
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
  const r = py('montar-blocos.py', [b, s, '0.3:1.5'])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.doesNotMatch(r.stdout, /aviso/)
  const c = caixaBranca(s)
  assert.ok(quadrado(c), JSON.stringify(c))
}))

test('P1: corte central, bruto deitado sai cortado no centro, sem esticar, e avisa', () => comTemp((d) => {
  const b = brutoQuadrado(d, 'deitado.mp4', '640x360'), s = join(d, 's.mp4')
  const r = py('montar-blocos.py', [b, s, '0.3:1.5'])
  assert.equal(r.status, 0, semTraco(r.stderr))
  assert.match(r.stdout, /fora de 9:16/)
  assert.equal(sonda(s, { sel: 'v:0', campo: 'sample_aspect_ratio' }), '1:1')
  const c = caixaBranca(s)
  assert.ok(quadrado(c), 'quadrado esticado: ' + JSON.stringify(c))
}))

test('P1: corte central, bruto quadrado sai cortado no centro, sem esticar', () => comTemp((d) => {
  const b = brutoQuadrado(d, 'q.mp4', '480x480'), s = join(d, 's.mp4')
  const r = py('montar-blocos.py', [b, s, '0.3:1.5'])
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
  const r1 = py('montar-blocos.py', [emPe, s1, '0.3:1.5']), r2 = py('montar-blocos.py', [deitRot, s2, '0.3:1.5'])
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
    const r = py('montar-blocos.py', [brutoHdr(d, trc), s, '0.3:1.5'])
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
  const r = py('montar-blocos.py', [brutoHdr(d, 'arib-std-b67'), s, '0.3:1.5'], { env: { ...ENV, EDITAR_VIDEO_SEM_ZSCALE: '1' } })
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
  for (const f of ['--remotion', '--public-dir', '--props-base', '--ver-video', '--preco-usd', '--registrar-custo', '--transcrever', '--modelo', '--midia']) assert.ok(r.stdout.includes(f), `sem ${f}`)
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
function olho(d, { preco, autorizado, codigo }) {
  const marca = join(d, 'chamadas.txt'), raiz = join(d, 'raiz'), stub = join(d, 'ver-video-falso.mjs')
  writeFileSync(stub, `import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(marca)}, 'chamado' + String.fromCharCode(10))
if (${codigo} === 0) console.log('VEREDITO: APROVADO')
process.exit(${codigo})
`)
  const final = join(d, 'final.mp4'), roteiro = join(d, 'roteiro.md')
  writeFileSync(final, 'x'); writeFileSync(roteiro, 'Fala: ola')
  const args = ['x', final, 'x', join(d, 'saida'), '--so-olho-final', '--roteiro', roteiro, '--ver-video', stub, '--registrar-custo', CLI_CUSTO, '--raiz-custo', raiz]
  if (preco !== undefined) args.push('--preco-usd', String(preco))
  if (autorizado) args.push('--autorizado')
  const r = py('fiscal.py', args)
  const custos = join(raiz, 'dados', 'custos.jsonl')
  return {
    r, saida: semTraco(r.stdout) + semTraco(r.stderr),
    chamadas: existsSync(marca) ? linhasDe(marca).length : 0,
    linhas: existsSync(custos) ? linhasDe(custos).map((l) => JSON.parse(l)) : [],
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

test('fiscal com preco e sem --autorizado nao chama o olho final nem grava custo', () => comTemp((d) => {
  const o = olho(d, { preco: 0.5, codigo: 0 })
  assert.equal(o.chamadas, 0)
  assert.equal(o.linhas.length, 0)
  assert.match(o.saida, /pulado/)
  assert.match(o.saida, /autorizado/)
}))

test('fiscal com preco e autorizacao chama o olho final uma vez e grava uma linha de custo', () => comTemp((d) => {
  const o = olho(d, { preco: 0.5, autorizado: true, codigo: 0 })
  assert.equal(o.r.status, 0, o.saida)
  assert.equal(o.chamadas, 1)
  assert.equal(o.linhas.length, 1)
  assert.equal(o.linhas[0].servico, 'gemini-fiscal-olho-final')
  assert.equal(o.linhas[0].usd, 0.5)
}))

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
function funcaoDoPy(nomeArquivo, nomeFuncao, corpoTeste, d) {
  const harness = join(d, 'harness.py')
  writeFileSync(harness, [
    'import ast, sys',
    'import numpy as np',
    'from pathlib import Path',
    'src = open(sys.argv[1], encoding="utf-8").read()',
    `fn = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "${nomeFuncao}"]`,
    `assert fn, "sem a funcao ${nomeFuncao}"`,
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
  const gravam = ['alinhar.py', 'blocos.py', 'camera_lenta.py', 'chroma.py', 'mix-final.py', 'montar-blocos.py', 'paginas-camadas.py', 'paginas-legenda.py', 'preparar-props.py', 'profundidade.py', 'sincronizar-bruto.py', 'tratar-voz.py', 'guias-olhada.py']
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
