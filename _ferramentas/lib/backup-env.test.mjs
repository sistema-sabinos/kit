// Testes do backup de .env.
// Rodar: node --test _ferramentas/lib/backup-env.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupEnv } from './backup-env.mjs';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const CLI = join(AQUI, 'backup-env.mjs');

function envComNChaves(n) {
  return Array.from({ length: n }, (_, i) => `CHAVE_${i}=valor${i}`).join('\n') + '\n';
}

// atribuir undefined a process.env grava a string 'undefined': variavel que nao existia se apaga
function devolverEnv(antigo) {
  for (const [k, v] of Object.entries(antigo)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test('recusa fazer backup de .env truncado (menos que o mínimo de chaves)', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-'));
  try {
    const envPath = join(dirProjeto, '.env');
    writeFileSync(envPath, '# só comentário, nenhuma chave\n'); // abaixo do mínimo de 1

    const dirBackup = join(dirProjeto, 'backup-nao-deve-existir-' + Date.now());
    const resultado = backupEnv({ envPath, backupDir: dirBackup });

    assert.equal(resultado.ok, false);
    assert.equal(resultado.chaves, 0);
    assert.match(resultado.motivo, /truncado/);
    assert.equal(existsSync(dirBackup), false, 'não deveria ter criado a pasta de backup');
  } finally {
    rmSync(dirProjeto, { recursive: true, force: true });
  }
});

test('faz o backup quando o .env tem chaves suficientes, com escrita atômica e cópia latest', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-'));
  const dirBackup = mkdtempSync(join(tmpdir(), 'backup-'));
  try {
    const envPath = join(dirProjeto, '.env');
    const conteudo = envComNChaves(25);
    writeFileSync(envPath, conteudo);

    const resultado = backupEnv({ envPath, backupDir: dirBackup });

    assert.equal(resultado.ok, true);
    assert.equal(resultado.chaves, 25);
    assert.equal(existsSync(resultado.destino), true);
    assert.equal(readFileSync(resultado.destino, 'utf8'), conteudo);
    assert.equal(readFileSync(join(dirBackup, 'latest.env'), 'utf8'), conteudo);
    // não deve sobrar arquivo temporário da escrita atômica
    assert.ok(!readdirSync(dirBackup).some((f) => f.includes('.tmp-')));
  } finally {
    rmSync(dirProjeto, { recursive: true, force: true });
    rmSync(dirBackup, { recursive: true, force: true });
  }
});

test('mantém só as últimas N cópias datadas e apaga de verdade as mais antigas (rotação)', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-'));
  const dirBackup = mkdtempSync(join(tmpdir(), 'backup-'));
  try {
    const envPath = join(dirProjeto, '.env');
    writeFileSync(envPath, envComNChaves(21));

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
  } finally {
    rmSync(dirProjeto, { recursive: true, force: true });
    rmSync(dirBackup, { recursive: true, force: true });
  }
});

test('sem backupDir explícito, deriva a pasta do nome da pasta-mãe do .env', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'meu-projeto-'));
  const homeFalso = mkdtempSync(join(tmpdir(), 'home-'));
  const envAntigo = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  try {
    const envPath = join(dirProjeto, '.env');
    writeFileSync(envPath, envComNChaves(22));
    process.env.HOME = homeFalso;
    process.env.USERPROFILE = homeFalso;
    const resultado = backupEnv({ envPath });
    assert.equal(resultado.ok, true);
    const nome = basename(resultado.backupDir);
    assert.ok(nome.startsWith(`${basename(dirProjeto)}-`) && /-[0-9a-f]{8}-env$/.test(nome), `backupDir devia ser nome + 8 letras + -env, veio ${nome}`);
    assert.ok(resultado.backupDir.startsWith(join(homeFalso, '.claude', 'backups')));
  } finally {
    devolverEnv(envAntigo);
    rmSync(dirProjeto, { recursive: true, force: true });
    rmSync(homeFalso, { recursive: true, force: true });
  }
});

test('CLI sem argumento usa o ./.env do diretório onde roda (cwd)', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-cli-'));
  const homeFalso = mkdtempSync(join(tmpdir(), 'home-cli-'));
  try {
    writeFileSync(join(dirProjeto, '.env'), envComNChaves(23));

    const r = spawnSync(process.execPath, [CLI], {
      cwd: dirProjeto,
      env: { ...process.env, HOME: homeFalso, USERPROFILE: homeFalso },
      encoding: 'utf8',
    });

    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /\[OK\]/);
    const backups = join(homeFalso, '.claude', 'backups');
    const pastas = existsSync(backups) ? readdirSync(backups) : [];
    assert.equal(pastas.length, 1, `esperava uma pasta de backup em ${backups}, achou ${pastas.join(', ')}`);
    assert.ok(pastas[0].startsWith(`${basename(dirProjeto)}-`), `a pasta comeca pelo nome do projeto, veio ${pastas[0]}`);
    assert.equal(existsSync(join(backups, pastas[0], 'latest.env')), true);
  } finally {
    rmSync(dirProjeto, { recursive: true, force: true });
    rmSync(homeFalso, { recursive: true, force: true });
  }
});

test('CLI recusa e sai com código 2 quando o .env do cwd está truncado', () => {
  const dirProjeto = mkdtempSync(join(tmpdir(), 'projeto-cli-trunc-'));
  const homeFalso = mkdtempSync(join(tmpdir(), 'home-cli-trunc-'));
  try {
    writeFileSync(join(dirProjeto, '.env'), '# só comentário, nenhuma chave\n');

    const r = spawnSync(process.execPath, [CLI], {
      cwd: dirProjeto,
      env: { ...process.env, HOME: homeFalso, USERPROFILE: homeFalso },
      encoding: 'utf8',
    });

    assert.equal(r.status, 2);
    assert.match(r.stderr, /ABORTADO/);
  } finally {
    rmSync(dirProjeto, { recursive: true, force: true });
    rmSync(homeFalso, { recursive: true, force: true });
  }
});

// Rodada 5.15, item 21: o aluno comum tem poucas chaves; truncado se mede contra a última cópia.
test('item 21: .env com 3 chaves de verdade faz backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'item21-'));
  try {
    const envPath = join(dir, '.env');
    writeFileSync(envPath, envComNChaves(3));
    const r = backupEnv({ envPath, backupDir: join(dir, 'backup') });
    assert.equal(r.chaves, 3, 'canario: a contagem leu as 3 chaves');
    assert.equal(r.ok, true, r.motivo);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('item 21: .env que caiu pra menos da metade das chaves da ultima copia recusa e guarda a copia boa', () => {
  const dir = mkdtempSync(join(tmpdir(), 'item21-'));
  try {
    const envPath = join(dir, '.env');
    const backupDir = join(dir, 'backup');
    writeFileSync(envPath, envComNChaves(10));
    assert.equal(backupEnv({ envPath, backupDir }).ok, true, 'a primeira copia, com 10 chaves, tem de sair');
    writeFileSync(envPath, envComNChaves(4));
    const r = backupEnv({ envPath, backupDir });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /truncado/);
    assert.equal(readFileSync(join(backupDir, 'latest.env'), 'utf8'), envComNChaves(10));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Rodada 5.17, item D2b: dois projetos com o mesmo nome de pasta nao dividem o backup.
test('D2b: dois projetos de mesmo nome guardam o backup em pastas separadas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'd2b-'));
  const envAntigo = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  try {
    const home = join(dir, 'home');
    mkdirSync(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const envA = join(dir, 'cliente1', 'loja', '.env');
    const envB = join(dir, 'cliente2', 'loja', '.env');
    for (const e of [envA, envB]) mkdirSync(join(e, '..'), { recursive: true });
    writeFileSync(envA, envComNChaves(10));
    writeFileSync(envB, envComNChaves(3));
    const a = backupEnv({ envPath: envA });
    const b = backupEnv({ envPath: envB });
    assert.equal(a.ok, true, 'canario: o primeiro backup saiu');
    assert.equal(b.chaves, 3, 'canario: o segundo .env foi lido');
    assert.equal(b.ok, true, 'o .env do outro projeto de mesmo nome foi recusado: ' + b.motivo);
    assert.notEqual(a.backupDir, b.backupDir);
    assert.ok(basename(a.backupDir).startsWith('loja-'), 'o nome da pasta ainda comeca pelo nome do projeto');
    assert.equal(readFileSync(join(a.backupDir, 'latest.env'), 'utf8'), envComNChaves(10), 'a copia do primeiro ficou intacta');
    // o mesmo projeto volta sempre pra mesma pasta, inclusive com a letra de unidade trocada de caixa
    const trocado = envA.replace(/^[a-z]:/i, (l) => (l === l.toLowerCase() ? l.toUpperCase() : l.toLowerCase()));
    const de = backupEnv({ envPath: trocado });
    assert.equal(de.backupDir, a.backupDir);
    assert.ok(!existsSync(join(home, '.claude', 'backups', 'loja-env')), 'nao grava mais na pasta so com o nome');
  } finally {
    devolverEnv(envAntigo);
    rmSync(dir, { recursive: true, force: true });
  }
});
