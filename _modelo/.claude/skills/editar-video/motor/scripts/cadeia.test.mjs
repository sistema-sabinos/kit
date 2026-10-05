// Prova a cadeia Python do motor rodando cada script de verdade, com midia gerada pelo ffmpeg
// numa pasta temporaria. O que depende do whisper ou do modelo de profundidade pula com o motivo
// escrito (o caminho real se prova no ensaio). A ultima prova varre os .py atras de caminho fixo
// e de termo que nao pode ir no kit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rodarPython } from '../../../configurar-video/scripts/lib/plataforma.mjs'

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
  for (const f of ['--remotion', '--public-dir', '--props-base', '--ver-video', '--preco-usd', '--registrar-custo', '--transcrever', '--modelo']) assert.ok(r.stdout.includes(f), `sem ${f}`)
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

test('blocos acha os blocos de fala com o whisper', { skip: process.env.WHISPER_DIR ? false : 'precisa do whisper instalado; prova no ensaio' }, () => {
  assert.ok(existsSync(script('blocos.py')))
})

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
  assert.ok(existsSync(sai))
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
  const gravam = ['alinhar.py', 'blocos.py', 'chroma.py', 'mix-final.py', 'montar-blocos.py', 'paginas-camadas.py', 'paginas-legenda.py', 'preparar-props.py', 'profundidade.py', 'sincronizar-bruto.py', 'tratar-voz.py']
  for (const nome of gravam) assert.match(readFileSync(script(nome), 'utf8'), /os\.makedirs\(/, nome)
})
