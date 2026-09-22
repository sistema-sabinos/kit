// Testes do medidor de mesa (o que entra em toda conversa antes da primeira palavra).
// Rodar: node --test _ferramentas/medir-mesa.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath, e nao URL.pathname: no Windows o pathname vem com barra sobrando ("/E:/...").
const MEDIDOR = fileURLToPath(new URL('./medir-mesa.mjs', import.meta.url));

// Monta uma pasta de projeto de mentira e roda o medidor nela.
// chars: quantos caracteres em cada arquivo do _contexto/.
function medir({ agentsChars = 10, contexto = {}, crlf = false } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'mesa-'));
  const quebra = crlf ? '\r\n' : '\n';
  writeFileSync(join(pasta, 'AGENTS.md'), 'a'.repeat(agentsChars) + quebra);
  if (Object.keys(contexto).length) mkdirSync(join(pasta, '_contexto'));
  for (const [nome, chars] of Object.entries(contexto)) {
    writeFileSync(join(pasta, '_contexto', nome), 'a'.repeat(chars) + quebra);
  }
  let saida = '', codigo = 0;
  try {
    saida = execFileSync(process.execPath, [MEDIDOR, pasta], { encoding: 'utf8' });
  } catch (e) {
    saida = (e.stdout || '') + (e.stderr || '');
    codigo = e.status;
  }
  rmSync(pasta, { recursive: true, force: true });
  // 0 e 1 sao as saidas previstas. Qualquer outra e o medidor quebrando, e o teste
  // precisa acusar em vez de deixar um "doesNotMatch" passar com saida vazia.
  if (codigo !== 0 && codigo !== 1) throw new Error(`medidor quebrou (codigo ${codigo}): ${saida}`);
  assert.ok(saida.includes('O que entra na mesa'), `saida inesperada: ${saida}`);
  return { saida, codigo };
}

test('conta os arquivos do _contexto/ que entram em toda conversa', () => {
  const { saida } = medir({ contexto: { 'empresa.md': 100, 'agora.md': 100 } });
  assert.match(saida, /\[contexto\].*empresa\.md/);
  assert.match(saida, /\[contexto\].*agora\.md/);
});

test('ignora arquivo do _contexto/ que não é lido em toda conversa', () => {
  const { saida } = medir({ contexto: { 'licoes.md': 100, 'ferramentas.md': 100 } });
  assert.doesNotMatch(saida, /licoes\.md/);
  assert.doesNotMatch(saida, /ferramentas\.md/);
});

test('_contexto/ tem limiar próprio, mais apertado que o de arquivo de regra', () => {
  // 3.500 chars = ~921 tokens: verde num AGENTS.md (limiar 2.000), amarelo no _contexto/ (limiar 800)
  const { saida } = medir({ agentsChars: 3500, contexto: { 'empresa.md': 3500 } });
  const linhaRegra = saida.split('\n').find((l) => l.includes('AGENTS.md'));
  const linhaContexto = saida.split('\n').find((l) => l.includes('empresa.md'));
  assert.match(linhaRegra, /^verde/);
  assert.match(linhaContexto, /^amarelo/);
});

test('arquivo do _contexto/ acima de 1.500 tokens sai vermelho e o processo sai com código 1', () => {
  const { saida, codigo } = medir({ contexto: { 'agora.md': 6500 } });
  assert.match(saida.split('\n').find((l) => l.includes('agora.md')), /^VERMELHO/);
  assert.equal(codigo, 1);
});

test('só o _contexto/ estourado não sugere conserto de arquivo de regra', () => {
  const { saida } = medir({ contexto: { 'agora.md': 6500 } });
  assert.match(saida, /Conserto no _contexto/);
  assert.doesNotMatch(saida, /Conserto em arquivo de regra/);
});

test('tudo dentro do teto não sugere conserto nenhum', () => {
  const { saida, codigo } = medir({ contexto: { 'empresa.md': 100 } });
  assert.doesNotMatch(saida, /Conserto/);
  assert.equal(codigo, 0);
});

test('mede igual com final de linha do Windows (CRLF), que é o do kit', () => {
  const lf = medir({ contexto: { 'empresa.md': 3500 } });
  const crlf = medir({ contexto: { 'empresa.md': 3500 }, crlf: true });
  assert.match(lf.saida.split('\n').find((l) => l.includes('empresa.md')), /^amarelo/);
  assert.match(crlf.saida.split('\n').find((l) => l.includes('empresa.md')), /^amarelo/);
});
