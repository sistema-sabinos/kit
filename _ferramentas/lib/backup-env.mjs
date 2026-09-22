// Backup automático de um arquivo .env.
//
// Por que existe: um .env perdido (zerado por acidente, sobrescrito por um processo que
// deu problema no meio da escrita) derruba todas as chaves da operação de uma vez. Isso
// já aconteceu de verdade num projeto real, sem cópia de segurança, e custou reconstruir
// tudo na mão.
//
// Guarda cópias datadas FORA do projeto (nunca vai pro controle de versão), mantém as
// últimas MANTER cópias, e tem um GUARDA: se o .env estiver truncado (menos chaves que o
// mínimo esperado), NÃO faz backup, pra um arquivo corrompido não sobrescrever as cópias
// boas que já existem.
//
// Uso como lib:
//   import { backupEnv } from './backup-env.mjs'
//   backupEnv({ envPath: '/caminho/para/.env' })
//
// Uso via linha de comando:
//   node backup-env.mjs [caminho-do-.env]   (default: ./.env, a partir de onde você rodar)
//
// O nome da pasta de backup é derivado automaticamente do nome da pasta que contém o
// .env (um .env em .../meu-projeto/.env vira backup em
// ~/.claude/backups/meu-projeto-env/), então cada projeto ganha sua própria pasta sem
// precisar configurar nada. Pra agendar isso rodando sozinho todo dia, ver o README desta
// pasta.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const MIN_CHAVES_PADRAO = 20; // um .env saudável costuma ter bem mais que isso; abaixo é sinal de arquivo corrompido
const MANTER_PADRAO = 30;     // quantas cópias datadas guardar

function contarChaves(txt) {
  return txt.split('\n').filter((l) => /^[A-Za-z0-9_]+=/.test(l)).length;
}

// Escreve em arquivo temporário e renomeia por cima do destino final, pra nunca deixar um
// backup pela metade se o processo morrer no meio da cópia.
function escreverAtomico(caminho, conteudo) {
  const tmp = `${caminho}.tmp-${process.pid}`;
  writeFileSync(tmp, conteudo);
  renameSync(tmp, caminho);
}

/**
 * Faz o backup do .env em `envPath`.
 *
 * Devolve `{ ok: true, destino, chaves, total, backupDir }` quando copiou, ou
 * `{ ok: false, motivo, chaves }` quando recusou por o arquivo parecer truncado.
 */
export function backupEnv({ envPath, backupDir, minChaves = MIN_CHAVES_PADRAO, manter = MANTER_PADRAO } = {}) {
  if (!envPath) throw new Error('backupEnv: informe envPath');

  const destinoBase = backupDir || join(os.homedir(), '.claude', 'backups', `${basename(dirname(resolve(envPath)))}-env`);

  const raw = readFileSync(envPath, 'utf8');
  const chaves = contarChaves(raw);

  if (chaves < minChaves) {
    return { ok: false, motivo: `arquivo com só ${chaves} chaves (mínimo ${minChaves}), parece truncado`, chaves };
  }

  mkdirSync(destinoBase, { recursive: true });

  // Carimbo de data por segundo, mais um sufixo de alta resolução (hrtime, em nanossegundos)
  // pra garantir nome único mesmo quando dois backups caem dentro do mesmo segundo: sem
  // isso, duas chamadas rápidas em sequência gerariam o MESMO nome de arquivo e a segunda
  // sobrescreveria a primeira em silêncio, quebrando a rotação (cada rodada tem que virar
  // um arquivo distinto pra "mantém só as últimas N" fazer sentido).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const sufixo = process.hrtime.bigint().toString(36);
  const destino = join(destinoBase, `env-${stamp}-${sufixo}.bak`);
  escreverAtomico(destino, raw);
  escreverAtomico(join(destinoBase, 'latest.env'), raw); // cópia sempre atualizada, fácil de achar

  // rotação: mantém só as últimas `manter` cópias datadas
  const copias = readdirSync(destinoBase)
    .filter((f) => f.startsWith('env-') && f.endsWith('.bak'))
    .sort();
  for (const f of copias.slice(0, Math.max(0, copias.length - manter))) {
    unlinkSync(join(destinoBase, f));
  }

  return { ok: true, destino, chaves, total: Math.min(copias.length, manter), backupDir: destinoBase };
}

// Uso direto via linha de comando: node backup-env.mjs [caminho-do-.env]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envPath = process.argv[2] || join(process.cwd(), '.env');
  const resultado = backupEnv({ envPath });

  if (!resultado.ok) {
    console.error(`[ABORTADO] .env ${resultado.motivo}. Não vou fazer backup pra não estragar as cópias boas.`);
    process.exit(2);
  }
  console.log(`[OK] backup do .env (${resultado.chaves} chaves) -> ${resultado.destino}`);
  console.log(`     total de cópias guardadas: ${resultado.total} em ${resultado.backupDir}`);
}
