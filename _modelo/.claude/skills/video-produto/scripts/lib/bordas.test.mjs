import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medirFaixasNoQuadro, planoDeCorte, pareceBorda, MINIMO_PRA_VALER_PCT } from './bordas.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

// Nasceu do primeiro vídeo real (2026-08-14): o Veo preserva a proporção da
// imagem de referência dentro do canvas 9:16, então a foto quadrada do produto
// voltou com 21,9% de branco chapado em cima e embaixo em 3 dos 7 clipes. O ML
// recusa vídeo com borda, e o gate técnico não pegou porque ele confere a
// RESOLUÇÃO do arquivo (que estava certa) e a borda estava DENTRO da imagem.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bordas-'));

// desenha um PNG com faixa chapada em cima e embaixo, igual ao que o Veo devolveu
function pngComFaixa(nome, { largura = 90, altura = 160, faixa = 35 } = {}) {
  const arquivo = path.join(dir, nome);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=white:s=${largura}x${altura}`,
    '-f', 'lavfi', '-i', `testsrc=s=${largura}x${altura - 2 * faixa}`,
    '-filter_complex', `[0:v][1:v]overlay=0:${faixa}`,
    '-frames:v', '1', '-pix_fmt', 'rgb24', arquivo], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg nao montou o png de teste: ${r.stderr}`);
  return arquivo;
}

test('mede a faixa chapada de cima e de baixo em porcentagem', () => {
  const png = pngComFaixa('com-faixa.png', { altura: 160, faixa: 35 });
  const m = medirFaixasNoQuadro(png);
  assert.ok(Math.abs(m.topoPct - 21.9) < 2, `topo veio ${m.topoPct}`);
  assert.ok(Math.abs(m.basePct - 21.9) < 2, `base veio ${m.basePct}`);
});

test('quadro que ocupa a tela toda não acusa faixa nenhuma', () => {
  const arquivo = path.join(dir, 'cheio.png');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=90x160',
    '-frames:v', '1', '-pix_fmt', 'rgb24', arquivo], { encoding: 'utf8' });
  const m = medirFaixasNoQuadro(arquivo);
  assert.equal(m.topoPct, 0);
  assert.equal(m.basePct, 0);
});

test('o corte tira a faixa e devolve um recorte na mesma proporção do vídeo', () => {
  const corte = planoDeCorte({ largura: 720, altura: 1280, topo: 280, base: 280 });
  assert.ok(corte, 'esperava plano de corte');
  const razaoOriginal = 720 / 1280;
  assert.ok(Math.abs(corte.largura / corte.altura - razaoOriginal) < 0.01, `proporcao veio ${corte.largura}/${corte.altura}`);
  // o recorte tem que caber INTEIRO dentro do miolo sem faixa
  assert.ok(corte.y >= 280, `o corte comeca em ${corte.y}, dentro da faixa de cima`);
  assert.ok(corte.y + corte.altura <= 1000, `o corte termina em ${corte.y + corte.altura}, dentro da faixa de baixo`);
  // dimensão ímpar quebra encoder yuv420p
  assert.equal(corte.largura % 2, 0);
  assert.equal(corte.altura % 2, 0);
});

test('não mexe em clipe pago por causa de faixa insignificante', () => {
  assert.equal(planoDeCorte({ largura: 720, altura: 1280, topo: 4, base: 4 }), null);
  assert.equal(planoDeCorte({ largura: 720, altura: 1280, topo: 0, base: 0 }), null);
  // logo acima do limiar já vale a pena
  const grande = Math.ceil((MINIMO_PRA_VALER_PCT / 100) * 1280);
  assert.ok(planoDeCorte({ largura: 720, altura: 1280, topo: grande, base: grande }));
});

// O detector achava "faixa" em qualquer coisa uniforme: um clipe legitimamente
// PRETO virava 96% de borda e derrubava a montagem. Quem pegou foi a própria
// suíte, no fixture de vídeo preto que existe pra medir legenda.
test('cena chapada de ponta a ponta não é borda, é cena', () => {
  assert.equal(pareceBorda({ topoPct: 75, basePct: 21.9 }), false);
  assert.equal(pareceBorda({ topoPct: 50, basePct: 50 }), false);
});

test('faixa de pad de verdade (quadrada dentro do 9:16) é reconhecida', () => {
  assert.equal(pareceBorda({ topoPct: 21.9, basePct: 21.9 }), true);
  assert.equal(pareceBorda({ topoPct: 21.9, basePct: 21.7 }), true);
});

test('faixa só de um lado não é pad, porque o preenchimento é centralizado', () => {
  assert.equal(pareceBorda({ topoPct: 30, basePct: 0 }), false);
  assert.equal(pareceBorda({ topoPct: 22, basePct: 5 }), false);
});

test('ruído de compressão não vira borda', () => {
  assert.equal(pareceBorda({ topoPct: 0.5, basePct: 0.5 }), false);
});
