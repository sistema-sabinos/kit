// Testes do cão de guarda de tempo total.
// Rodar: node --test _ferramentas/lib/watchdog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarCaoDeGuarda } from './watchdog.mjs';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

test('desarmado antes do prazo, não morde', async () => {
  let mordeu = false, saiuCom = null;
  const cao = armarCaoDeGuarda({
    ms: 200, nome: 'teste',
    aoEstourar: async () => { mordeu = true; },
    sair: (c) => { saiuCom = c; },
  });
  await espera(50);
  cao.desarmar();
  await espera(300);
  assert.equal(mordeu, false);
  assert.equal(saiuCom, null);
});

test('estourou o prazo: avisa e mata o processo com código 1', async () => {
  let aviso = null, saiuCom = null;
  armarCaoDeGuarda({
    ms: 60, nome: 'sync-noturno',
    aoEstourar: async (info) => { aviso = info; },
    sair: (c) => { saiuCom = c; },
  });
  await espera(300);
  assert.equal(aviso?.nome, 'sync-noturno');
  assert.equal(aviso?.ms, 60);
  assert.match(aviso?.motivo, /passou de/);
  assert.equal(saiuCom, 1);
});

// O aviso é rede (ex: um bot de Telegram). Se ele também travar, o cão não pode ficar
// preso junto, senão o remédio tem a mesma doença que a gente está curando.
test('aviso que trava não impede a morte do processo', async () => {
  let saiuCom = null;
  armarCaoDeGuarda({
    ms: 50, nome: 'teste', prazoAvisoMs: 80,
    aoEstourar: () => new Promise(() => {}), // nunca resolve
    sair: (c) => { saiuCom = c; },
  });
  await espera(400);
  assert.equal(saiuCom, 1);
});

test('aviso que quebra não impede a morte do processo', async () => {
  let saiuCom = null;
  armarCaoDeGuarda({
    ms: 50, nome: 'teste',
    aoEstourar: async () => { throw new Error('canal de aviso fora do ar'); },
    sair: (c) => { saiuCom = c; },
  });
  await espera(300);
  assert.equal(saiuCom, 1);
});

test('exige um prazo positivo', () => {
  assert.throws(() => armarCaoDeGuarda({ ms: 0, nome: 'x', aoEstourar: async () => {} }), /prazo/i);
});
