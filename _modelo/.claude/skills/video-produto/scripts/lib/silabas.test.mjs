import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarSilabas, validarBloco } from './silabas.mjs';

test('conta sílabas de palavras simples', () => {
  assert.equal(contarSilabas('casa'), 2);
  assert.equal(contarSilabas('cafezinho'), 4);
  assert.equal(contarSilabas('produto'), 3);
});

test('trata ditongo como uma sílaba só', () => {
  assert.equal(contarSilabas('cai'), 1);
  assert.equal(contarSilabas('mãe'), 1);
});

test('ignora pontuação e acentos na contagem', () => {
  assert.equal(contarSilabas('Ó, sabe?'), 3);
});

test('validarBloco aprova fala dentro da faixa', () => {
  // esta frase gerou 8,2s de áudio no TTS em 08/08, é a referência de tamanho
  const fala = 'Sabe quando você compra cafezinho barata e ela seca na segunda semana? Eu passei por isso três vezes.';
  const r = validarBloco(fala);
  assert.equal(r.ok, true, `reprovou com ${r.silabas} sílabas: ${r.motivo}`);
  assert.ok(r.silabas >= 30 && r.silabas <= 38, `sílabas fora da faixa: ${r.silabas}`);
});

test('validarBloco reprova fala curta demais e diz o porquê', () => {
  const r = validarBloco('Compra aí.');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /curta/i);
});

test('validarBloco reprova fala longa demais', () => {
  const r = validarBloco('palavra '.repeat(40));
  assert.equal(r.ok, false);
  assert.match(r.motivo, /longa/i);
});
