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
  let saida = '', codigo = 0;
  try {
    const quebra = crlf ? '\r\n' : '\n';
    writeFileSync(join(pasta, 'AGENTS.md'), 'a'.repeat(agentsChars) + quebra);
    if (Object.keys(contexto).length) mkdirSync(join(pasta, '_contexto'));
    for (const [nome, chars] of Object.entries(contexto)) {
      writeFileSync(join(pasta, '_contexto', nome), 'a'.repeat(chars) + quebra);
    }
    try {
      saida = execFileSync(process.execPath, [MEDIDOR, pasta], { encoding: 'utf8' });
    } catch (e) {
      saida = (e.stdout || '') + (e.stderr || '');
      codigo = e.status;
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
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

// Merge do main na 5.54: a 5.52 pos o autonomia.md na leitura do comeco de conversa do AGENTS.md,
// e o medidor seguia com os quatro antigos, deixando fora do total um arquivo de toda conversa.
test('conta o autonomia.md no total, junto dos outros do começo de conversa', () => {
  const so = medir({ contexto: { 'empresa.md': 100 } });
  const com = medir({ contexto: { 'empresa.md': 100, 'autonomia.md': 380 } });
  const total = (s) => Number((s.match(/Total estimado: (\d+) tokens/) || [])[1]);
  assert.ok(total(so.saida) > 0, 'canario: o total veio');
  assert.match(com.saida, /\[contexto\].*autonomia\.md/);
  assert.equal(total(com.saida), total(so.saida) + 100, 'os 380 caracteres do autonomia.md (100 tokens) entram no total');
});

test('ignora arquivo do _contexto/ que não é lido em toda conversa', () => {
  const { saida } = medir({ contexto: { 'empresa.md': 100, 'ferramentas.md': 100 } });
  assert.match(saida, /empresa\.md/, 'canario: o _contexto/ foi medido');
  assert.doesNotMatch(saida, /ferramentas\.md/);
});

// 5.54 (C3): o /atualizar le o licoes.md inteiro (desde a 5.57, em todo fechamento), e ninguem media
// (o do Projeto-02 chegou a 24042 bytes, por wc -c). Entra como [contexto], fora do total.
test('mede o licoes.md como [contexto]: com 24042 bytes sai vermelho, fora do total', () => {
  const so = medir({ contexto: { 'empresa.md': 100 } });
  const com = medir({ contexto: { 'empresa.md': 100, 'licoes.md': 24042 } });
  const linha = com.saida.split('\n').find((l) => l.includes('licoes.md')) || '';
  assert.match(linha, /^VERMELHO.*\[contexto\]/);
  assert.equal(com.codigo, 1);
  const total = (s) => Number((s.match(/Total estimado: (\d+) tokens/) || [])[1]);
  assert.ok(total(so.saida) > 0, 'canario: o total veio');
  assert.equal(total(com.saida), total(so.saida), 'o licoes.md fica fora do total de antes da primeira palavra');
  // Revisao interna da C3: debaixo do cabecalho de "toda conversa" a saida afirmava o falso.
  // A linha sai depois do total, num bloco proprio que diz quando ele entra.
  const linhas = com.saida.split('\n');
  const iTotal = linhas.findIndex((l) => l.startsWith('Total estimado'));
  const iLicoes = linhas.findIndex((l) => l.includes('licoes.md'));
  const iFora = linhas.findIndex((l) => l.startsWith('Fora do total'));
  assert.ok(iTotal > 0 && linhas.findIndex((l) => l.includes('empresa.md')) < iTotal, 'canario: o empresa.md vem antes do total');
  assert.ok(iTotal < iFora && iFora < iLicoes, 'o licoes.md sai depois do total, debaixo do "Fora do total"');
  assert.match(linhas[iFora], /\/atualizar/);
  // 5.57 G: a frase segue o Passo 3.5 do /atualizar e o item 8 do /checar
  assert.match(linhas[iFora], /entra inteiro em todo fechamento do \/atualizar/);
  assert.doesNotMatch(linhas[iFora], /licao nova/);
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
