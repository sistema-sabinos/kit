// Testes do limpador de legenda. Sem rede: trecho real de legenda automatica do YouTube.
// Rodar: node --test legenda.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limparVtt, tempo } from './legenda.mjs'

const VTT = `WEBVTT
Kind: captions
Language: pt

00:00:00.160 --> 00:00:02.030 align:start position:0%

Fala<00:00:00.520><c> pessoal,</c><00:00:01.000><c> sejam</c><00:00:01.319><c> muito</c>

00:00:02.030 --> 00:00:02.040 align:start position:0%
Fala pessoal, sejam muito


00:00:02.040 --> 00:00:03.869 align:start position:0%
Fala pessoal, sejam muito
meu<00:00:02.200><c> canal.</c>

00:00:03.869 --> 00:00:03.879 align:start position:0%
meu canal.


00:01:05.600 --> 00:01:07.389 align:start position:0%
meu canal.
de<00:01:05.720><c> hoje</c>
`

test('legenda automatica sai sem repeticao e sem marca de tempo interna, uma linha por frase', () => {
  assert.deepEqual(limparVtt(VTT), ['[0:00] Fala pessoal, sejam muito', '[0:02] meu canal.', '[1:05] de hoje'])
})

test('final de linha do Windows nao muda nada', () => {
  assert.deepEqual(limparVtt(VTT.replace(/\n/g, '\r\n')), limparVtt(VTT))
})

test('frase repetida bem mais tarde volta, porque foi dita de novo', () => {
  const v = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nok\n\n00:00:03.000 --> 00:00:04.000\noutra\n\n00:00:05.000 --> 00:00:06.000\nmais uma\n\n00:00:07.000 --> 00:00:08.000\nainda outra\n\n00:00:09.000 --> 00:00:10.000\nok\n'
  assert.deepEqual(limparVtt(v).map(l => l.replace(/^\[[^\]]+\] /, '')), ['ok', 'outra', 'mais uma', 'ainda outra', 'ok'])
})

test('tempo acima de uma hora leva a hora', () => {
  assert.equal(tempo('01:02:03.500'), '1:02:03')
  assert.equal(tempo('00:09:07.000'), '9:07')
})

test('arquivo sem bloco de tempo devolve lista vazia', () => {
  assert.deepEqual(limparVtt('WEBVTT\n\n'), [])
})
