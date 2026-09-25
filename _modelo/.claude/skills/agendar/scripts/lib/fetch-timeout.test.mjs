// Testes do fetch com timeout (rede local de verdade, servidor que trava de propósito).
// Rodar: node --test _ferramentas/lib/fetch-timeout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchComTimeout, ehTimeout, alvo } from './fetch-timeout.mjs';

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

// A mensagem de erro vai pro terminal e pro livro de execuções: a query, onde viaja
// token e chave, sai fora.
test('timeout não vaza o token que vai na query', async () => {
  const s = await servidor(() => { /* nunca responde */ });
  try {
    await assert.rejects(
      () => fetchComTimeout(`${s.url}dados?token=exemplo-SEGREDO`, {}, { timeoutMs: 200 }),
      (e) => {
        assert.ok(e.message.length > 0, 'mensagem veio vazia');
        assert.ok(e.message.endsWith(`em ${s.url}dados`), e.message);
        assert.ok(!e.message.includes('SEGREDO'), `token vazou: ${e.message}`);
        return true;
      },
    );
  } finally { await s.fechar(); }
});

// Token do Telegram viaja no CAMINHO (/bot<token>/), não na query. A máscara vale só no
// host do Telegram: outro endereço que começa com "bot" sai intacto no log.
test('máscara do /bot<token>/ só no host do Telegram', () => {
  const tg = alvo('https://api.telegram.org/botexemplo-123:SEGREDO/sendMessage?chat_id=1');
  assert.ok(tg.length > 0, 'saída veio vazia');
  assert.equal(tg, 'https://api.telegram.org/bot***/sendMessage');
  assert.ok(!tg.includes('SEGREDO'), `token vazou: ${tg}`);
  assert.equal(alvo('https://botsite.com/a'), 'https://botsite.com/a');
  assert.equal(alvo('https://exemplo.com/bots/list'), 'https://exemplo.com/bots/list');
});

test('ehTimeout não confunde erro comum com timeout', () => {
  assert.equal(ehTimeout(new Error('qualquer coisa')), false);
  assert.equal(ehTimeout(null), false);
});
