// Prova o Gemini no cru sem rede e sem chave: a trava do gasto, o ver-video e o registro de custo sao scripts de
// mentira que anotam com que argumentos foram chamados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { estimarUsd, MODELO, pergunta } from './gemini-cru.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'gemini-cru.mjs')
const BORDAS = '# Bordas do cru\n\n| n | trecho | corte sugerido | inicio | fim | whisper |\n|---|---|---|---|---|---|\n'
  + '| 1 | 1.00:2.00 | 0.80:2.15 | ok | ok | Esse produto vende muito |\n| 2 | 3.00:4.00 | 2.80:4.15 | ok | virado em 4.15 | Esse produto vende muito |\n'

function cenario(d, { trava = '{"codigo":0,"reserva":"r9"}', verVideo = 0, verCusto = '', custoAviso = '' } = {}) {
  const bruto = join(d, 'bruto.mp4')
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-shortest', bruto])
  assert.equal(r.status, 0)
  writeFileSync(join(d, 'bordas.md'), BORDAS)
  const falso = (nome, corpo) => { writeFileSync(join(d, nome), corpo); return join(d, nome) }
  const anota = (arq) => `require('fs').appendFileSync(${JSON.stringify(join(d, arq))}, JSON.stringify(process.argv.slice(2)) + '\\n')`
  return {
    bruto,
    args: ['--liberar-gasto', falso('trava.cjs', `${anota('trava.log')}; console.log(${JSON.stringify(trava)}); process.exitCode = ${JSON.parse(trava).codigo}`),
      '--ver-video', falso('ver.cjs', `${anota('ver.log')}; require('fs').writeFileSync(${JSON.stringify(join(d, 'leve.log'))}, require('child_process').spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height:format=duration', '-of', 'csv=p=0', process.argv[2]], { encoding: 'utf8' }).stdout); console.log('TRECHO | 2 | problema | tropeca no fim'); console.error(${JSON.stringify(verCusto)}); process.exitCode = ${verVideo}`),
      '--registrar-custo', falso('custo.cjs', `${anota('custo.log')}; console.error(${JSON.stringify(custoAviso)})`)],
  }
}
const rodar = (args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' })
async function comTemp(fn) {
  const d = mkdtempSync(join(tmpdir(), 'gemini-cru-'))
  try { await fn(d) } finally { rmSync(d, { recursive: true, force: true }) }
}

test('5.48: gemini-cru estima pelo preco da tabela e dobra no fim da promocao', () => {
  // 300 s: (300*100 + 3000) tokens de entrada a 0,75 mais 4000 de saida a 3,75 por milhao
  assert.equal(estimarUsd(300, '2026-11-03'), Math.ceil(((33000 * 0.75 + 4000 * 3.75) / 1e6) * 1000) / 1000)
  assert.ok(estimarUsd(300, '2027-01-02') > estimarUsd(300, '2026-12-31'))
  assert.equal(MODELO, 'gemini-3.8-flash')
})

test('5.48: a pergunta leva um trecho por linha do bordas.md, com o texto do whisper', () => {
  const p = pergunta(BORDAS)
  assert.match(p, /^1 \| 1[.]00:2[.]00 \| Esse produto vende muito$/m)
  assert.match(p, /^2 \| 3[.]00:4[.]00 \| Esse produto vende muito$/m)
  assert.doesNotMatch(p, /\| n \| trecho/)
})

test('5.48: sem --autorizado so estima, sai 3 e nao chama trava, Gemini nem registro', () => comTemp((d) => {
  const c = cenario(d)
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), ...c.args])
  assert.equal(r.status, 3, r.stderr)
  assert.match(r.stdout, /parou: .*US\$ 0[.]0\d+ \(gemini-3[.]8-flash, 2 s/)
  for (const f of ['trava.log', 'ver.log', 'custo.log', 'gemini.md']) assert.equal(existsSync(join(d, f)), false, f)
}))

test('5.48: com a trava barrando, o ver-video nao e chamado', () => comTemp((d) => {
  const c = cenario(d, { trava: '{"codigo":3,"parou":"orcamento do mes acabou"}' })
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), '--preco-usd', '0.02', '--autorizado', ...c.args])
  assert.equal(r.status, 3, r.stderr)
  assert.match(r.stdout, /orcamento do mes acabou/)
  assert.ok(existsSync(join(d, 'trava.log')), 'canario: a trava foi chamada')
  assert.equal(existsSync(join(d, 'ver.log')), false)
}))

test('5.48: liberado, chama o ver-video com o modelo fixo e baixa resolucao, grava a resposta e uma linha de custo', () => comTemp((d) => {
  const c = cenario(d)
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), '--preco-usd', '0.02', '--autorizado', '--video', 'teste', ...c.args])
  assert.equal(r.status, 0, r.stderr)
  const ver = JSON.parse(readFileSync(join(d, 'ver.log'), 'utf8'))
  assert.deepEqual(ver.slice(1, 5), ['--model', 'gemini-3.8-flash', '--lowres', '--sem-registro'])
  assert.equal(ver.includes('--barato'), false)
  // vai a copia leve (480 de altura, o mesmo tempo), nunca o cru do celular, e ela some depois
  assert.notEqual(ver[0], c.bruto)
  assert.equal(existsSync(ver[0]), false)
  const [altura, dur] = readFileSync(join(d, 'leve.log'), 'utf8').trim().split(/\s+/).map(Number)
  assert.equal(altura, 480)
  assert.ok(Math.abs(dur - 2) < 0.2, String(dur))
  assert.match(readFileSync(join(d, 'gemini.md'), 'utf8'), /tropeca no fim/)
  const custo = readFileSync(join(d, 'custo.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(custo.length, 1)
  assert.deepEqual([custo[0][custo[0].indexOf('--usd') + 1], custo[0][custo[0].indexOf('--reserva') + 1], custo[0][custo[0].indexOf('--video') + 1]], ['0.02', 'r9', 'teste'])
}))

test('5.48: anota o custo que o ver-video mediu pelos tokens, nao a estimativa', () => comTemp((d) => {
  const c = cenario(d, { verCusto: '(modelo: gemini-3.8-flash | tokens entrada: 222 | saída com raciocínio: 181 | custo: US$ 0.031)' })
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), '--preco-usd', '0.02', '--autorizado', ...c.args])
  assert.equal(r.status, 0, r.stderr)
  const custo = JSON.parse(readFileSync(join(d, 'custo.log'), 'utf8').trim())
  assert.equal(custo[custo.indexOf('--usd') + 1], '0.031')
  assert.match(r.stdout, /US\$ 0[.]031 anotado \(medido/)
}))

test('5.48: registro de custo que falha calado vira aviso e saida 1, com a resposta gravada', () => comTemp((d) => {
  const c = cenario(d, { custoAviso: '[custo] faltou --servico ou --usd valido; a cobranca nao foi registrada, anote a mao' })
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), '--preco-usd', '0.02', '--autorizado', ...c.args])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /NAO foi anotado: \[custo\] faltou/)
  assert.doesNotMatch(r.stdout, /anotado/)
  assert.ok(existsSync(join(d, 'gemini.md')), 'a resposta paga fica gravada')
}))

test('5.48: cru que o ffmpeg nao le para antes da trava, sem reservar orcamento', () => comTemp((d) => {
  const c = cenario(d)
  writeFileSync(c.bruto, 'nao e video')
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), '--preco-usd', '0.02', '--autorizado', ...c.args])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /nada foi cobrado nem reservado/)
  for (const f of ['trava.log', 'ver.log', 'custo.log']) assert.equal(existsSync(join(d, f)), false, f)
}))

test('5.48: resposta que nao grava sai na tela e o custo ja ficou anotado', () => comTemp((d) => {
  const c = cenario(d)
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'pasta-que-nao-existe', 'gemini.md'), '--preco-usd', '0.02', '--autorizado', ...c.args])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /nao consegui gravar[\s\S]*tropeca no fim/)
  assert.ok(existsSync(join(d, 'custo.log')), 'o custo foi anotado antes de gravar')
}))

test('5.48: ver-video falhando nao grava resposta nem custo e avisa que pode ter cobrado', () => comTemp((d) => {
  const c = cenario(d, { verVideo: 1 })
  const r = rodar([c.bruto, join(d, 'bordas.md'), join(d, 'gemini.md'), '--preco-usd', '0.02', '--autorizado', ...c.args])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /pode ter sido cobrado/)
  assert.match(r.stderr, /reserva r9/)
  assert.equal(existsSync(join(d, 'gemini.md')), false)
  assert.equal(existsSync(join(d, 'custo.log')), false)
}))
