// Testes do fetch com timeout (rede local de verdade, servidor que trava de propósito).
// Rodar: node --test _ferramentas/lib/fetch-timeout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchComTimeout, ehTimeout } from './fetch-timeout.mjs';

// Sobe um servidor local com o comportamento pedido e devolve a URL + o desligar.
async function servidor(handler) {
  const srv = http.createServer(handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    fechar: () => new Promise((r) => srv.close(r)),
  };
}

test('resposta normal passa direto', async () => {
  const s = await servidor((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); });
  try {
    const resp = await fetchComTimeout(s.url, {}, { timeoutMs: 2000 });
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), { ok: true });
  } finally { await s.fechar(); }
});

test('servidor que nunca responde estoura o timeout em vez de pendurar pra sempre', async () => {
  const s = await servidor(() => { /* silêncio proposital: nunca responde */ });
  try {
    const t0 = Date.now();
    await assert.rejects(
      () => fetchComTimeout(s.url, {}, { timeoutMs: 300 }),
      (e) => {
        assert.equal(e.code, 'TIMEOUT');
        assert.equal(ehTimeout(e), true);
        assert.match(e.message, /300ms/);
        return true;
      },
    );
    const gasto = Date.now() - t0;
    assert.ok(gasto < 3000, `devia desistir rápido, gastou ${gasto}ms`);
  } finally { await s.fechar(); }
});

// O caso traiçoeiro: o cabeçalho chega, o fetch resolve, e quem trava é a LEITURA do corpo.
// Sem o timeout cobrindo o corpo, o processo pendura no resp.text() e nada acusa.
test('corpo que trava no meio também estoura o timeout', async () => {
  const s = await servidor((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"come');
    // nunca termina o corpo
  });
  try {
    const resp = await fetchComTimeout(s.url, {}, { timeoutMs: 300 });
    assert.equal(resp.status, 200);
    await assert.rejects(() => resp.text(), (e) => ehTimeout(e) || e.name === 'AbortError' || e.name === 'TimeoutError');
  } finally { await s.fechar(); }
});

test('sinal do chamador continua valendo junto com o timeout', async () => {
  const s = await servidor(() => { /* nunca responde */ });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error('cancelado pelo chamador')), 100);
  try {
    await assert.rejects(
      () => fetchComTimeout(s.url, { signal: ctrl.signal }, { timeoutMs: 5000 }),
      (e) => { assert.notEqual(e.code, 'TIMEOUT'); return true; },
    );
  } finally { await s.fechar(); }
});

test('ehTimeout não confunde erro comum com timeout', () => {
  assert.equal(ehTimeout(new Error('qualquer coisa')), false);
  assert.equal(ehTimeout(null), false);
});
