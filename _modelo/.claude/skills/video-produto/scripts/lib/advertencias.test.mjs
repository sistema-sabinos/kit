// Teste da legenda de ADVERTÊNCIA obrigatória de categoria.
//
// Contexto, pra ninguém achar que é firula: o Mercado Livre recusa Clips com o
// motivo "Não informa as regras de publicidade e marketing aplicáveis à
// categoria do produto". A regra oficial manda "cumpra as regras de publicidade
// e marketing aplicadas ao produto" e dá o formato no exemplo dela: em bebida
// alcoólica, a legenda "Venda proibida a menores de 18 anos" na tela.
// Suplemento tem as advertências do art. 14 da RDC 243/2018.
//
// Roda com: node --test .claude/skills/video-produto/scripts/lib/advertencias.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerSrt } from './legenda.mjs';
import {
  ADVERTENCIA_MAXIMA_PCT,
  gerarSrtAdvertencias,
  estiloAdvertencia,
  ajustarAdvertenciasAteCaber,
  NIVEIS_ADVERTENCIA,
  ALINHAMENTO_TOPO_CENTRO,
} from './advertencias.mjs';

// as 4 de um rótulo de suplemento de exemplo, texto literal
const QUATRO = [
  'Este produto não é um medicamento',
  'Não exceder a recomendação diária de consumo indicada na embalagem',
  'Mantenha fora do alcance de crianças',
  'Este produto não deve ser consumido por gestantes, lactantes e crianças',
];

test('sem advertência declarada não gera faixa nenhuma', () => {
  assert.equal(gerarSrtAdvertencias([], 48), null);
  assert.equal(gerarSrtAdvertencias(undefined, 48), null);
});

test('reparte o vídeo inteiro entre as advertências, sem buraco e sem sobra', () => {
  const cues = lerSrt(gerarSrtAdvertencias(QUATRO, 48));
  assert.equal(cues.length, 4);
  assert.equal(cues[0].inicio, 0, 'a primeira começa no segundo zero');
  assert.equal(cues.at(-1).fim, 48, 'a última termina no fim do vídeo');
  for (let i = 1; i < cues.length; i++) {
    assert.equal(cues[i].inicio, cues[i - 1].fim, `cue ${i} tem que colar na anterior, sem buraco`);
  }
});

test('o texto da advertência sai LITERAL, porque é texto de lei', () => {
  const cues = lerSrt(gerarSrtAdvertencias(QUATRO, 48));
  // o SRT pode quebrar linha, então compara com a quebra desfeita
  const textos = cues.map((c) => c.texto.replace(/\s+/g, ' ').trim());
  assert.deepEqual(textos, QUATRO);
});

test('uma advertência só ocupa o vídeo inteiro', () => {
  const cues = lerSrt(gerarSrtAdvertencias([QUATRO[0]], 32));
  assert.equal(cues.length, 1);
  assert.equal(cues[0].inicio, 0);
  assert.equal(cues[0].fim, 32);
});

test('o estilo ancora no TOPO, porque o rodapé é zona segura do ML', () => {
  const e = estiloAdvertencia(720, 1280, NIVEIS_ADVERTENCIA[0]);
  // 6 e não 8: este libass usa a numeração antiga do SSA (medido em 2026-09-04,
  // com 8 o texto cai no MEIO do quadro). Quem prova de verdade é o teste de
  // render mais abaixo, este aqui só tranca a constante.
  assert.equal(ALINHAMENTO_TOPO_CENTRO, 6);
  assert.match(e, new RegExp(`Alignment=${ALINHAMENTO_TOPO_CENTRO}`));
  assert.match(e, /PlayResX=720/, 'sem PlayRes o ffmpeg escala tudo pelo 384x288 antigo');
  assert.match(e, /PlayResY=1280/);
  assert.doesNotMatch(e, /Alignment=2/, 'Alignment=2 é rodapé, que é onde a narração já mora');
});

test('a advertência usa a mesma Montserrat embutida da legenda, nunca fonte do sistema', () => {
  const e = estiloAdvertencia(720, 1280, NIVEIS_ADVERTENCIA[0]);
  assert.match(e, /FontName=Montserrat(,|$)/);
  assert.match(e, /Bold=1/);
  assert.doesNotMatch(e, /Arial/);
});

test('a advertência não usa o amarelo da narração, pra não virar a mesma coisa', () => {
  const narracaoAmarela = 'PrimaryColour=&H0000FFFF';
  const e = estiloAdvertencia(720, 1280, NIVEIS_ADVERTENCIA[0]);
  assert.doesNotMatch(e, new RegExp(narracaoAmarela.replace(/[&]/g, '\\&')));
});

test('as 4 advertências reais cabem no topo de um 720x1280 sem invadir o quadro', () => {
  const trabalho = fs.mkdtempSync(path.join(os.tmpdir(), 'advertencia-'));
  try {
    const r = ajustarAdvertenciasAteCaber({
      advertencias: QUATRO, duracaoTotal: 48, largura: 720, altura: 1280, trabalho,
    });
    assert.ok(r, 'tinha que caber');
    assert.ok(fs.existsSync(r.caminhoSrt), 'queima tem que usar o arquivo que foi medido');
    // desce no máximo até o limite combinado, senão come o produto no meio do quadro
    const descidaPct = 100 - r.pior.margens.baixoPct;
    assert.ok(descidaPct <= ADVERTENCIA_MAXIMA_PCT,
      `advertência desceu até ${descidaPct.toFixed(1)}%, o teto é ${ADVERTENCIA_MAXIMA_PCT}%`);
    assert.ok(r.pior.margens.esquerdaPct >= 15, 'margem lateral da zona segura');
    assert.ok(r.pior.margens.direitaPct >= 15, 'margem lateral da zona segura');
    assert.ok(r.pior.caixa.minY > 0, 'encostou no topo = texto cortado');
  } finally {
    fs.rmSync(trabalho, { recursive: true, force: true });
  }
});

test('sem advertência, o ajuste devolve null em vez de explodir', () => {
  const trabalho = fs.mkdtempSync(path.join(os.tmpdir(), 'advertencia-'));
  try {
    assert.equal(ajustarAdvertenciasAteCaber({
      advertencias: [], duracaoTotal: 48, largura: 720, altura: 1280, trabalho,
    }), null);
  } finally {
    fs.rmSync(trabalho, { recursive: true, force: true });
  }
});
