// Testes do backup de .env.
// Rodar: node --test _ferramentas/lib/backup-env.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupEnv } from './backup-env.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(AQUI, 'backup-env.mjs');

function envComNChaves(n) {
  return Array.from({ length: n }, (_, i) => `CHAVE_${i}=valor${i}`).join('\n') + '\n';
}

test('recusa fazer backup de .env truncado (menos que o mínimo de chaves)', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-'));
  const envPath = join(dirProjeto, '.env');
  writeFileSync(envPath, envComNChaves(3)); // bem abaixo do padrão de 20

  const dirBackup = join(dirProjeto, '..', 'backup-nao-deve-existir-' + Date.now());
  const resultado = backupEnv({ envPath, backupDir: dirBackup });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.chaves, 3);
  assert.match(resultado.motivo, /truncado/);
  assert.equal(existsSync(dirBackup), false, 'não deveria ter criado a pasta de backup');
});

test('faz o backup quando o .env tem chaves suficientes, com escrita atômica e cópia latest', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-'));
  const envPath = join(dirProjeto, '.env');
  const conteudo = envComNChaves(25);
  writeFileSync(envPath, conteudo);

  const dirBackup = mkdtempSync(join(tmpdir(), 'backup-'));
  const resultado = backupEnv({ envPath, backupDir: dirBackup });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.chaves, 25);
  assert.equal(existsSync(resultado.destino), true);
  assert.equal(readFileSync(resultado.destino, 'utf8'), conteudo);
  assert.equal(readFileSync(join(dirBackup, 'latest.env'), 'utf8'), conteudo);
  // não deve sobrar arquivo temporário da escrita atômica
  assert.ok(!readdirSync(dirBackup).some((f) => f.includes('.tmp-')));
});

test('mantém só as últimas N cópias datadas e apaga de verdade as mais antigas (rotação)', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-'));
  const envPath = join(dirProjeto, '.env');
  writeFileSync(envPath, envComNChaves(21));

  const dirBackup = mkdtempSync(join(tmpdir(), 'backup-'));

  // Gera 5 rodadas reais de backup, uma por vez, guardando só as últimas 2. O nome do
  // arquivo leva um sufixo de alta resolução (ver backup-env.mjs) justamente pra garantir
  // que cada rodada produza um arquivo DISTINTO mesmo rodando várias vezes no mesmo
  // segundo, senão esse teste não provaria rotação nenhuma (a 2a chamada sobrescreveria a
  // 1a e a pasta nunca teria mais que 1 arquivo pra rotacionar).
  const destinos = [];
  for (let i = 0; i < 5; i++) {
    const r = backupEnv({ envPath, backupDir: dirBackup, manter: 2 });
    assert.equal(r.ok, true, `rodada ${i} falhou`);
    destinos.push(r.destino);
  }

  // pré-condição do teste: se duas rodadas geraram o mesmo nome, o teste abaixo não
  // significa nada, então falha alto e cedo em vez de dar um falso positivo.
  assert.equal(new Set(destinos).size, 5, 'cada rodada deveria ter gerado um arquivo com nome distinto');

  const copiasRestantes = readdirSync(dirBackup).filter((f) => f.startsWith('env-') && f.endsWith('.bak')).sort();
  assert.equal(copiasRestantes.length, 2, `esperava exatamente 2 cópias depois da rotação, achou ${copiasRestantes.length}`);

  // as duas ÚLTIMAS geradas (as mais novas) são exatamente as que têm que sobrar
  const nomesEsperados = destinos.slice(-2).map((d) => basename(d)).sort();
  assert.deepEqual(copiasRestantes, nomesEsperados, 'deveriam sobrar exatamente as 2 cópias mais recentes');

  // as 3 primeiras (as mais antigas) têm que ter sido apagadas de verdade do disco
  for (const antigo of destinos.slice(0, 3)) {
    assert.equal(existsSync(antigo), false, `cópia antiga ${antigo} deveria ter sido apagada pela rotação`);
  }
});

test('sem backupDir explícito, deriva a pasta do nome da pasta-mãe do .env', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'meu-projeto-'));
  const envPath = join(dirProjeto, '.env');
  writeFileSync(envPath, envComNChaves(22));

  const homeFalso = mkdtempSync(join(tmpdir(), 'home-'));
  const envAntigo = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = homeFalso;
  process.env.USERPROFILE = homeFalso;
  try {
    const resultado = backupEnv({ envPath });
    assert.equal(resultado.ok, true);
    const nomeEsperado = `${basename(dirProjeto)}-env`;
    assert.ok(resultado.backupDir.includes(nomeEsperado), `backupDir devia conter ${nomeEsperado}, veio ${resultado.backupDir}`);
    assert.ok(resultado.backupDir.startsWith(join(homeFalso, '.claude', 'backups')));
  } finally {
    process.env.HOME = envAntigo.HOME;
    process.env.USERPROFILE = envAntigo.USERPROFILE;
  }
});

test('CLI sem argumento usa o ./.env do diretório onde roda (cwd)', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-cli-'));
  writeFileSync(join(dirProjeto, '.env'), envComNChaves(23));
  const homeFalso = mkdtempSync(join(tmpdir(), 'home-cli-'));

  const r = spawnSync(process.execPath, [CLI], {
    cwd: dirProjeto,
    env: { ...process.env, HOME: homeFalso, USERPROFILE: homeFalso },
    encoding: 'utf8',
  });

  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.match(r.stdout, /\[OK\]/);
  const nomeEsperado = `${basename(dirProjeto)}-env`;
  const destinoBackup = join(homeFalso, '.claude', 'backups', nomeEsperado);
  assert.equal(existsSync(destinoBackup), true, `esperava pasta de backup em ${destinoBackup}`);
  assert.equal(existsSync(join(destinoBackup, 'latest.env')), true);
});

test('CLI recusa e sai com código 2 quando o .env do cwd está truncado', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-cli-trunc-'));
  writeFileSync(join(dirProjeto, '.env'), envComNChaves(2));
  const homeFalso = mkdtempSync(join(tmpdir(), 'home-cli-trunc-'));

  const r = spawnSync(process.execPath, [CLI], {
    cwd: dirProjeto,
    env: { ...process.env, HOME: homeFalso, USERPROFILE: homeFalso },
    encoding: 'utf8',
  });

  assert.equal(r.status, 2);
  assert.match(r.stderr, /ABORTADO/);
});
