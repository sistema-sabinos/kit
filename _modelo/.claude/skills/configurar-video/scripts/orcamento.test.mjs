// Testes da etapa do orcamento do /configurar-video. Rodar: node --test orcamento.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rodar, calcularMedias, consumoPorVideo, gravarBloco } from './orcamento.mjs'
import { lerOrcamento, liberarGasto, MINIMO_VIDEOS_HISTORICO } from '../../conectar/scripts/lib/orcamento.mjs'

const NL = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)
const DEFINIR = ['--definir', '--orcamento-usd', '10', '--preco-segundo-usd', '0,002', '--preco-cena-usd', '0.04', '--fonte', 'https://ai.google.dev/gemini-api/docs/pricing', '--segundos', '60', '--cenas', '3']

function comRaiz(fazer) {
  const raiz = mkdtempSync(join(tmpdir(), 'orcamento-cfg-'))
  try { mkdirSync(join(raiz, '_contexto')); mkdirSync(join(raiz, 'dados')); return fazer(raiz) } finally { rmSync(raiz, { recursive: true, force: true }) }
}

test('definir grava o bloco, faz a media e o "da em media X videos" arredondado pra baixo', () => comRaiz((raiz) => {
  const r = rodar(DEFINIR, { raiz, agora: new Date(2026, 9, 31, 10) })
  assert.equal(r.codigo, 0, JSON.stringify(r.saida))
  // 60 s x 0,002 + 3 x 0,04 = 0,24 por video; 10 / 0,24 = 41,6
  assert.equal(r.saida.media_video_usd, 0.24)
  assert.equal(r.saida.da_em_media_videos, 41)
  assert.equal(r.saida.historico, null)
  const o = lerOrcamento({ raiz })
  assert.equal(o.tipo, 'mes')
  assert.equal(o.usd, 10)
  assert.equal(o.bloco.fonte, 'https://ai.google.dev/gemini-api/docs/pricing')
  assert.equal(o.bloco.conferido_em, '2026-10-31')
  assert.equal(o.bloco.media_video_usd, 0.24)
}))

test('com --cambio, o orcamento vem em reais e a saida traz os reais, sem a IA fazer conta', () => comRaiz((raiz) => {
  const args = DEFINIR.map((x) => (x === '--orcamento-usd' ? '--orcamento-brl' : x === '10' ? '100' : x))
  const r = rodar([...args, '--cambio', '5,5'], { raiz })
  assert.equal(r.codigo, 0, JSON.stringify(r.saida))
  // R$ 100 / 5,5 = US$ 18,18 (pra baixo no centavo); 0,24 x 5,5 = R$ 1,32
  assert.equal(r.saida.orcamento_mes_usd, 18.18)
  assert.equal(r.saida.media_video_brl, 1.32)
  assert.equal(r.saida.da_em_media_videos, 75)
  assert.equal(lerOrcamento({ raiz }).usd, 18.18)
}))

test('definir troca so o bloco, guarda o texto da pessoa e o final de linha do arquivo', () => comRaiz((raiz) => {
  const caminho = join(raiz, '_contexto', 'orcamento.md')
  writeFileSync(caminho, ['# Meu orcamento', 'texto meu', '```orcamento', 'orcamento_mes_usd:', '```', 'depois'].join(CRLF))
  assert.equal(rodar(DEFINIR, { raiz }).codigo, 0)
  const t = readFileSync(caminho, 'utf8')
  assert.ok(t.startsWith('# Meu orcamento' + CRLF + 'texto meu' + CRLF))
  assert.ok(t.endsWith('```' + CRLF + 'depois'))
  assert.equal(t.split(NL).length - 1, t.split(CRLF).length - 1, 'toda quebra continua CRLF')
}))

test('falta preco, fonte ou valor errado: sai 2 sem gravar nada', () => comRaiz((raiz) => {
  for (const tirar of ['--fonte', '--preco-cena-usd', '--segundos']) {
    const i = DEFINIR.indexOf(tirar)
    const args = [...DEFINIR.slice(0, i), ...DEFINIR.slice(i + 2)]
    assert.equal(rodar(args, { raiz }).codigo, 2, tirar)
  }
  assert.equal(rodar([...DEFINIR.slice(0, 2), '-5', ...DEFINIR.slice(3)], { raiz }).codigo, 2)
  assert.equal(lerOrcamento({ raiz }).tipo, 'lote')
}))

test('com o minimo de videos no historico, mostra ao lado o consumo historico vezes o preco do dia', () => {
  const linhas = []
  for (let i = 0; i < MINIMO_VIDEOS_HISTORICO; i++) {
    linhas.push(JSON.stringify({ servico: 'gemini-imagem', usd: 0.04, cenas: 1, video: `v${i}` }))
    linhas.push(JSON.stringify({ servico: 'gemini-fiscal-olho-final', usd: 0.1, segundos: 30, video: `v${i}` }))
    linhas.push(JSON.stringify({ servico: 'gemini-fiscal-olho-final', usd: 0.1, segundos: 30, video: `v${i}`, tentativa: 2 }))
  }
  linhas.push(JSON.stringify({ servico: 'dominio', usd: 0, brl: 40, video: 'v0', cenas: 99 }))
  const h = consumoPorVideo(linhas.join(NL))
  assert.deepEqual(h, Array.from({ length: MINIMO_VIDEOS_HISTORICO }, () => ({ segundos: 60, cenas: 1 })))
  const m = calcularMedias({ orcamentoUsd: 10, precoSegundoUsd: 0.002, precoCenaUsd: 0.04, segundos: 60, cenas: 3, historico: h })
  assert.deepEqual(m.historico, { videos: MINIMO_VIDEOS_HISTORICO, media_video_usd: 0.16, da_em_media_videos: 62 })
  // abaixo do minimo, nada de historico
  assert.equal(calcularMedias({ orcamentoUsd: 10, precoSegundoUsd: 0.002, precoCenaUsd: 0.04, segundos: 60, cenas: 3, historico: h.slice(1) }).historico, null)
})

test('--saldo so quando pedem: orcamento, gasto, reservas abertas; e --fechar-reserva fecha a de processo que caiu', () => comRaiz((raiz) => {
  rodar(DEFINIR, { raiz })
  const lib = liberarGasto({ estimativaUsd: 2, autorizado: true }, { raiz, pid: 2147483646, contexto: 'olho final' })
  const s = rodar(['--saldo'], { raiz }).saida
  assert.equal(s.orcamento_usd, 10)
  assert.equal(s.saldo_usd, 8)
  assert.equal(s.reservas[0].id, lib.reserva)
  assert.equal(s.reservas[0].vivo, false)
  assert.deepEqual(rodar(['--fechar-reserva', lib.reserva], { raiz }).saida, { fechou: true })
  assert.equal(rodar(['--saldo'], { raiz }).saida.saldo_usd, 10)
}))

test('--saldo sem orcamento diz o teto por lote e manda definir', () => comRaiz((raiz) => {
  const s = rodar(['--saldo'], { raiz }).saida
  assert.equal(s.tipo, 'lote')
  assert.match(s.aviso, /configurar-video/)
}))

test('definir com o bloco quebrado guarda o texto antigo da pessoa numa copia ao lado', () => comRaiz((raiz) => {
  const caminho = join(raiz, '_contexto', 'orcamento.md')
  const antigo = ['# Orçamento', '', 'minha anotacao: cortar no natal', '', '```orcamento', 'orcamento_mes_usd: 5', ''].join(CRLF)
  writeFileSync(caminho, antigo)
  const r = rodar(DEFINIR, { raiz })
  assert.equal(r.codigo, 0, JSON.stringify(r.saida))
  assert.ok(r.saida.copia_do_texto_antigo, JSON.stringify(r.saida))
  assert.equal(readFileSync(r.saida.copia_do_texto_antigo, 'utf8'), antigo)
  assert.equal(lerOrcamento({ raiz }).usd, 10)
}))

test('definir com o bloco bom troca so o bloco e nao faz copia', () => comRaiz((raiz) => {
  const caminho = join(raiz, '_contexto', 'orcamento.md')
  writeFileSync(caminho, ['minha anotacao', '```orcamento', 'orcamento_mes_usd: 5', '```', ''].join(CRLF))
  const r = rodar(DEFINIR, { raiz })
  assert.equal(r.codigo, 0, JSON.stringify(r.saida))
  assert.equal(r.saida.copia_do_texto_antigo, undefined)
  assert.match(readFileSync(caminho, 'utf8'), /minha anotacao/)
}))

test('gravarBloco cria o arquivo em CRLF quando ele nao existe', () => comRaiz((raiz) => {
  const caminho = join(raiz, '_contexto', 'orcamento.md')
  gravarBloco(caminho, { orcamento_mes_usd: 5 })
  const t = readFileSync(caminho, 'utf8')
  assert.equal(t.split(NL).length - 1, t.split(CRLF).length - 1)
  assert.equal(lerOrcamento({ raiz }).usd, 5)
}))
