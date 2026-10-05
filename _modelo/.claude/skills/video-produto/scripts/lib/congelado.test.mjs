import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acharCongelamentos } from './congelado.mjs';

const saidaComFreeze = `
[freezedetect @ 000001] lavfi.freezedetect.freeze_start: 8.04
[freezedetect @ 000001] lavfi.freezedetect.freeze_duration: 3.2
[freezedetect @ 000001] lavfi.freezedetect.freeze_end: 11.24
`;

test('acha o trecho congelado com inicio e duracao', () => {
  const r = acharCongelamentos(saidaComFreeze);
  assert.equal(r.length, 1);
  assert.equal(r[0].inicio, 8.04);
  assert.equal(r[0].duracao, 3.2);
});

test('video com movimento nao acusa nada', () => {
  assert.deepEqual(acharCongelamentos('frame= 240 fps=30 q=-1.0 Lsize=N/A'), []);
});

test('aguenta saida vazia ou indefinida', () => {
  assert.deepEqual(acharCongelamentos(''), []);
  assert.deepEqual(acharCongelamentos(undefined), []);
});
