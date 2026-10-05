// Teste da preparação de imagem 9:16. Gera as imagens com ffmpeg (lavfi, sem
// depender de foto real nem de rede) e confere o resultado com ffprobe e com a
// própria medição de margem. Roda com:
// node --test .claude/skills/gerar-video/lib/preparar-imagem.test.mjs
//
// As fixtures têm um "produto" (bloco vermelho) sobre fundo branco, e não cor
// chapada como antes: desde 2026-09-04 a preparação pode CORTAR a lateral, e a
// garantia que precisa ficar testada é "corta o fundo, nunca o produto". Com
// imagem de cor sólida essa distinção não existe e o teste não provaria nada.
//
// Tudo é gerado em rgb24 de propósito, pra que a borda entre o branco e o
// vermelho seja exata e a asserção possa cobrar pixel certo. Na foto real essa
// borda vaza, e é por isso que a medição tem tolerância.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dimensaoDaImagem, prepararImagem9x16, margensLateraisChapadas, repartirCorte } from './preparar-imagem.mjs';

const run = promisify(execFile);

let dir;
let vertical, comMargem, semMargem, quadrada, paisagem, chapada;

// fundo branco com um bloco vermelho centralizado, tudo em rgb24.
//
// Duas armadilhas do ffmpeg medidas aqui em 2026-09-04, as duas capazes de
// deslocar o bloco em 1 px e estragar a asserção sem quebrar nada visível:
//
//   1. a posição vai como NÚMERO, não como a expressão `(W-w)/2`;
//   2. o número tem que ser PAR. Pedindo x=75 o bloco nasce na coluna 74;
//      pedindo 70, 76 ou 80 ele nasce exatamente onde foi pedido.
//
// Por isso as fixtures são dimensionadas pra que o centro caia em número par, e
// o assert abaixo trava isso: fixture com offset ímpar falha na hora, em vez de
// virar um "74 !== 75" misterioso lá na frente.
async function comProduto(arquivo, [lf, af], [lp, ap]) {
  const x = (lf - lp) / 2;
  const y = (af - ap) / 2;
  assert.ok(Number.isInteger(x) && x % 2 === 0, `fixture com offset x ímpar (${x}): o ffmpeg desloca 1 px`);
  assert.ok(Number.isInteger(y) && y % 2 === 0, `fixture com offset y ímpar (${y}): o ffmpeg desloca 1 px`);
  await run('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=white:s=${lf}x${af}`,
    '-f', 'lavfi', '-i', `color=c=red:s=${lp}x${ap}`,
    '-filter_complex', `[0]format=rgb24[a];[1]format=rgb24[b];[a][b]overlay=${x}:${y}`,
    '-frames:v', '1', '-pix_fmt', 'rgb24', arquivo]);
}

// largura que o produto ocupa: o que sobra depois de tirar as duas margens de
// fundo chapado
async function larguraDoProduto(arquivo) {
  const m = await margensLateraisChapadas(arquivo);
  return m.largura - m.esquerda - m.direita;
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preparar-imagem-'));
  vertical = path.join(dir, 'vertical.png');
  comMargem = path.join(dir, 'com-margem.png');
  semMargem = path.join(dir, 'sem-margem.png');
  quadrada = path.join(dir, 'quadrada.png');
  paisagem = path.join(dir, 'paisagem.png');
  chapada = path.join(dir, 'chapada.png');

  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=720x1280',
    '-frames:v', '1', '-pix_fmt', 'rgb24', vertical]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=300x400',
    '-frames:v', '1', '-pix_fmt', 'rgb24', chapada]);

  // 3:4 com folga dos dois lados. É o caso de um pote: pra virar 9:16
  // (225x400) precisa tirar 75 px de largura e tem 160 de margem sobrando.
  await comProduto(comMargem, [300, 400], [140, 300]);
  // mesma proporção, produto encostado nas duas laterais: não dá pra cortar
  await comProduto(semMargem, [300, 400], [300, 300]);
  await comProduto(quadrada, [500, 500], [200, 300]);
  await comProduto(paisagem, [1280, 720], [200, 400]);
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('já vertical 9:16 (720x1280) não é alterada à toa', async () => {
  const original = await dimensaoDaImagem(vertical);
  const arquivoSaida = await prepararImagem9x16(vertical);

  assert.equal(arquivoSaida, vertical, 'já era 9:16, tem que devolver o caminho original, sem criar arquivo novo');
  const saida = await dimensaoDaImagem(arquivoSaida);
  assert.equal(saida.largura, original.largura);
  assert.equal(saida.altura, original.altura);
});

test('dimensaoDaImagem lê largura e altura certas de uma imagem conhecida', async () => {
  const d = await dimensaoDaImagem(paisagem);
  assert.equal(d.largura, 1280);
  assert.equal(d.altura, 720);
});

test('margensLateraisChapadas mede o fundo chapado dos dois lados', async () => {
  const m = await margensLateraisChapadas(comMargem);
  assert.equal(m.esquerda, 80);
  assert.equal(m.direita, 80);
  assert.equal(m.homogenea, false);
});

test('margensLateraisChapadas devolve zero quando o produto encosta na lateral', async () => {
  const m = await margensLateraisChapadas(semMargem);
  assert.equal(m.esquerda, 0);
  assert.equal(m.direita, 0);
});

test('margensLateraisChapadas reparte no meio quando a imagem inteira é chapada', async () => {
  const m = await margensLateraisChapadas(chapada);
  assert.equal(m.homogenea, true, 'imagem de cor sólida não tem produto pra proteger');
  assert.equal(m.esquerda, 150);
  assert.equal(m.direita, 150);
});

test('repartirCorte devolve null quando o corte invadiria o produto', () => {
  assert.equal(repartirCorte(100, 30, 30), null, '60 de margem não comporta 100 de corte');
});

test('repartirCorte tira mais do lado que tem mais margem, e nunca invade o produto', () => {
  const c = repartirCorte(100, 10, 200);
  assert.equal(c.esquerda + c.direita, 100, 'a soma tem que dar o corte pedido');
  assert.ok(c.esquerda <= 10, 'não pode passar da margem da esquerda');
  assert.ok(c.direita <= 200, 'não pode passar da margem da direita');
  assert.ok(c.direita > c.esquerda, 'o lado com mais folga entra com a maior parte');
});

test('repartirCorte reparte igual quando as duas margens são iguais', () => {
  assert.deepEqual(repartirCorte(80, 100, 100), { esquerda: 40, direita: 40 });
});

test('foto 3:4 COM margem sobrando é CORTADA, e o produto sai inteiro', async () => {
  const arquivoSaida = await prepararImagem9x16(comMargem);
  const saida = await dimensaoDaImagem(arquivoSaida);

  assert.equal(saida.altura * 9, saida.largura * 16, 'proporção de saída precisa ser 9:16 exata');
  assert.equal(saida.altura, 400, 'cortar mexe na largura, a altura fica inteira');
  assert.equal(saida.largura, 225, '400 de altura em 9:16 dá 225 de largura');
  assert.equal(await larguraDoProduto(arquivoSaida), 140, 'o produto tem que sair inteiro');
});

test('foto 3:4 SEM margem cai no pad antigo, sem cortar o produto', async () => {
  const original = await dimensaoDaImagem(semMargem);
  const arquivoSaida = await prepararImagem9x16(semMargem);
  const saida = await dimensaoDaImagem(arquivoSaida);

  assert.equal(saida.altura * 9, saida.largura * 16, 'proporção de saída precisa ser 9:16 exata');
  assert.ok(saida.largura >= original.largura, 'não pode cortar largura quando o produto encosta na borda');
  assert.ok(saida.altura >= original.altura, 'não pode cortar altura');
});

test('quadrada 500x500 vira 9:16 exato com o produto inteiro', async () => {
  const arquivoSaida = await prepararImagem9x16(quadrada);
  const saida = await dimensaoDaImagem(arquivoSaida);

  assert.equal(saida.altura * 9, saida.largura * 16, 'proporção de saída precisa ser 9:16 exata');
  assert.equal(await larguraDoProduto(arquivoSaida), 200, 'o produto tem que sair inteiro');
});

test('paisagem 16:9 vira 9:16 exato com o produto inteiro', async () => {
  const arquivoSaida = await prepararImagem9x16(paisagem);
  const saida = await dimensaoDaImagem(arquivoSaida);

  assert.equal(saida.altura * 9, saida.largura * 16, 'proporção de saída precisa ser 9:16 exata');
  assert.equal(await larguraDoProduto(arquivoSaida), 200, 'o produto tem que sair inteiro');
});
