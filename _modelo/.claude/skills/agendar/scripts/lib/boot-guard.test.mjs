// Testes do guardião de boot.
// Rodar: node --test _ferramentas/lib/boot-guard.test.mjs
//
// Nota sobre cobertura: `minutosQueFaltam` (interna) usa `os.uptime()`, que é o tempo real
// desde que a máquina ligou e não dá pra mockar sem um framework de mock de módulo nativo.
// Em vez disso, os testes abaixo exploram os dois jeitos de contornar isso sem precisar
// mockar nada: (1) os atalhos de bypass (--force/--agora/--agendado) retornam ANTES de
// olhar o uptime, então são 100% determinísticos; (2) um limite de minutos absurdamente
// grande GARANTE que o uptime real da máquina de teste fica abaixo dele, então "vai pular"
// também fica determinístico sem mockar nada. O que fica de fora, e não tem como testar
// sem mockar `os.uptime`, é o valor exato de "quantos minutos faltam" numa rodada real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pularSeBootRecente, esperarSeBootRecente } from './boot-guard.mjs';

const MODULO = new URL('./boot-guard.mjs', import.meta.url).href;
const MINUTOS_ABSURDO = 999_999_999; // nenhuma maquina de teste fica ligada tanto tempo assim

test('pularSeBootRecente com limite 0 nunca considera boot recente (nao sai do processo)', () => {
  const resultado = pularSeBootRecente(0, 'teste', { argv: [] });
  assert.equal(resultado, false);
});

test('esperarSeBootRecente com limite 0 resolve sem esperar', async () => {
  const t0 = Date.now();
  const esperou = await esperarSeBootRecente(0, 'teste', { argv: [] });
  assert.equal(esperou, false);
  assert.ok(Date.now() - t0 < 100, 'nao deveria ter esperado nada');
});

test('--force ignora o guardiao mesmo com limite gigante', () => {
  const resultado = pularSeBootRecente(MINUTOS_ABSURDO, 'teste', { argv: ['--force'] });
  assert.equal(resultado, false);
});

test('--agora ignora o guardiao mesmo com limite gigante', () => {
  const resultado = pularSeBootRecente(MINUTOS_ABSURDO, 'teste', { argv: ['--agora'] });
  assert.equal(resultado, false);
});

test('soAgendado:true so age quando o argv traz --agendado; rodada manual nunca pula', () => {
  const resultado = pularSeBootRecente(MINUTOS_ABSURDO, 'teste', { argv: [], soAgendado: true });
  assert.equal(resultado, false);
});

test('esperarSeBootRecente respeita os mesmos bypasses (nao espera)', async () => {
  const esperou = await esperarSeBootRecente(MINUTOS_ABSURDO, 'teste', { argv: ['--force'] });
  assert.equal(esperou, false);
});

// pularSeBootRecente chama process.exit(0) quando decide pular, o que mataria o processo
// de teste se rodasse in-process. Por isso essa ponta (a rodada de verdade sendo pulada)
// e testada num processo filho, isolado, com um limite gigante pra garantir que o
// verdadeiro uptime da maquina fica abaixo dele.
test('rodada agendada com boot "recente" (limite gigante) pula e sai com codigo 0', () => {
  const script = `
    import { pularSeBootRecente } from ${JSON.stringify(MODULO)};
    pularSeBootRecente(${MINUTOS_ABSURDO}, 'robo-teste', { argv: ['--agendado'], soAgendado: true });
    console.log('NAO DEVERIA CHEGAR AQUI');
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[boot-guard\] robo-teste/);
  assert.doesNotMatch(r.stdout, /NAO DEVERIA CHEGAR AQUI/);
});
