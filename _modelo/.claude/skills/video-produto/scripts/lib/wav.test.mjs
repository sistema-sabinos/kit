// .claude/skills/gerar-video/lib/wav.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcmParaWav, extrairPcm, silencio } from './wav.mjs';

test('monta cabecalho RIFF/WAVE valido', () => {
  const pcm = Buffer.alloc(2400 * 2); // 0,1s a 24kHz 16 bit
  const w = pcmParaWav(pcm);
  assert.equal(w.subarray(0, 4).toString(), 'RIFF');
  assert.equal(w.subarray(8, 12).toString(), 'WAVE');
  assert.equal(w.readUInt32LE(4), 36 + pcm.length);
  assert.equal(w.readUInt32LE(24), 24000);
  assert.equal(w.readUInt16LE(22), 1);
});

test('silencio gera a duracao pedida em PCM zerado', () => {
  const s = silencio(0.4);
  assert.equal(s.length, Math.round(24000 * 0.4) * 2);
  assert.ok(s.every((b) => b === 0));
});

test('extrairPcm tira o PCM de um WAV pronto, lendo a taxa do cabecalho, e pula chunk extra', () => {
  const pcm = Buffer.alloc(1600 * 2, 7);
  const w = pcmParaWav(pcm, 16000);
  const lista = Buffer.alloc(8 + 4); lista.write('LIST', 0); lista.writeUInt32LE(4, 4); lista.write('INFO', 8);
  const comExtra = Buffer.concat([w.subarray(0, 36), lista, w.subarray(36)]);
  for (const bytes of [w, comExtra]) {
    const r = extrairPcm(bytes);
    assert.equal(r.rate, 16000);
    assert.ok(r.pcm.equals(pcm));
  }
});

test('extrairPcm devolve PCM cru como veio, a 24 kHz', () => {
  const pcm = Buffer.alloc(100, 3);
  const r = extrairPcm(pcm);
  assert.equal(r.rate, 24000);
  assert.equal(r.pcm, pcm);
});

test('extrairPcm recusa WAV estereo, que deixaria a duracao errada', () => {
  const w = pcmParaWav(Buffer.alloc(40));
  w.writeUInt16LE(2, 22);
  assert.throws(() => extrairPcm(w), /mono de 16 bits/);
});
