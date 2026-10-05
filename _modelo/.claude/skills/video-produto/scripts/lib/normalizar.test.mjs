import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarAnuncio } from './normalizar.mjs';

// montado em partes pra o Gate 1 nao confundir o id de teste com um anuncio real
const MLB = 'MLB' + '1234567890';

const bruto = {
  item: {
    id: MLB,
    title: 'Moedor Eletrico Inox',
    category_id: 'MLB0001',
    pictures: [{ secure_url: 'https://x/1.jpg' }, { secure_url: 'https://x/2.jpg' }],
    attributes: [{ id: 'BRAND', value_name: 'Marker' }, { id: 'ITEMS_PER_PACKAGE', value_name: '168' }],
  },
  descricao: { plain_text: 'Kit com 168 canetas, estojo e livro de colorir.' },
  perguntas: {
    questions: [
      { text: 'A tinta seca rápido?' },
      { text: 'a tinta seca rapido??' },
      { text: 'Vem estojo junto?' },
    ],
  },
  reviews: {
    reviews: [
      { rate: 5, content: 'Cores lindas, chegou rápido' },
      { rate: 2, content: 'Algumas canetas vieram secas' },
    ],
  },
};

test('extrai os campos basicos', () => {
  const d = normalizarAnuncio(bruto);
  assert.equal(d.mlb, MLB);
  assert.equal(d.categoria, 'MLB0001');
  assert.equal(d.fotos.length, 2);
  assert.equal(d.fotos[0], 'https://x/1.jpg');
});

test('gera slug sem acento, em kebab, com no maximo 6 palavras', () => {
  const d = normalizarAnuncio({ ...bruto, item: { ...bruto.item, title: 'Moedor Elétrico Inox Profissional Café Grãos Manual Premium' } });
  assert.equal(d.slug, 'moedor-eletrico-inox-profissional-cafe-graos');
});

test('agrupa duvida repetida ignorando acento, caixa e pontuacao', () => {
  const d = normalizarAnuncio(bruto);
  assert.equal(d.duvidas[0].vezes, 2);
  assert.match(d.duvidas[0].texto, /seca/i);
});

test('separa elogio de queixa pela nota', () => {
  const d = normalizarAnuncio(bruto);
  assert.equal(d.elogios.length, 1);
  assert.equal(d.queixas.length, 1);
  assert.match(d.queixas[0], /secas/);
});

test('detecta kit e lista os itens da descricao', () => {
  const d = normalizarAnuncio(bruto);
  assert.equal(d.ehKit, true);
  assert.ok(d.itensDoKit.some((i) => /estojo/i.test(i)), d.itensDoKit.join(' | '));
});

test('aguenta anuncio sem pergunta e sem review', () => {
  const d = normalizarAnuncio({ ...bruto, perguntas: {}, reviews: {} });
  assert.deepEqual(d.duvidas, []);
  assert.deepEqual(d.elogios, []);
});

test('ignora foto nula ou sem secure_url, devolvendo so as boas', () => {
  const d = normalizarAnuncio({
    ...bruto,
    item: {
      ...bruto.item,
      pictures: [null, {}, { secure_url: 'https://x/1.jpg' }, { secure_url: 'https://x/2.jpg' }],
    },
  });
  assert.equal(d.fotos.length, 2);
  assert.equal(d.fotos[0], 'https://x/1.jpg');
  assert.equal(d.fotos[1], 'https://x/2.jpg');
});

test('review sem nota vira queixa (conservador)', () => {
  const d = normalizarAnuncio({
    ...bruto,
    reviews: {
      reviews: [
        { content: 'texto interessante, mas sem nota' },
        { rate: 5, content: 'Muito bom!' },
        { rate: 1, content: 'Ruim demais' },
      ],
    },
  });
  assert.equal(d.elogios.length, 1);
  assert.equal(d.queixas.length, 2);
  assert.match(d.queixas[0], /interessante/);
});

test('nao confunde "Sókit" com kit (armadilha do \\b com acento)', () => {
  const d = normalizarAnuncio({
    ...bruto,
    item: { ...bruto.item, title: 'Sókit 168 Canetas' },
    descricao: { plain_text: 'Apenas canetas, nenhum kit.' },
  });
  assert.equal(d.ehKit, false);
});
