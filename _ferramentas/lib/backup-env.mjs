// Backup automático de um arquivo .env.
//
// Por que existe: um .env perdido (zerado por acidente, sobrescrito por um processo que
// deu problema no meio da escrita) derruba todas as chaves da operação de uma vez. Isso
// já aconteceu de verdade num projeto real, sem cópia de segurança, e custou reconstruir
// tudo na mão.
//
// Guarda cópias datadas FORA do projeto (nunca vai pro controle de versão), mantém as
// últimas MANTER cópias, e tem um GUARDA: se o .env estiver truncado (sem nenhuma chave, ou
// com menos da metade das chaves da última cópia), NÃO faz backup, pra um arquivo
// corrompido não sobrescrever as cópias boas que já existem.
//
// Uso como lib:
//   import { backupEnv } from './backup-env.mjs'
//   backupEnv({ envPath: '/caminho/para/.env' })
//
// Uso via linha de comando:
//   node backup-env.mjs [caminho-do-.env]   (default: ./.env, a partir de onde você rodar)
//
// O nome da pasta de backup é derivado automaticamente da pasta que contém o .env: o nome
// dela mais 8 letras tiradas do caminho inteiro (um .env em .../meu-projeto/.env vira backup
// em ~/.claude/backups/meu-projeto-1a2b3c4d-env/), com o caminho em minúsculas no Windows.
// Assim cada projeto ganha sua própria pasta sem configurar nada, inclusive dois projetos de
// mesmo nome em lugares diferentes. Pra agendar isso rodando sozinho todo dia, ver o README desta
// pasta.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, renameSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { createHash } from 'node:crypto';

const MIN_CHAVES_PADRAO = 1;  // .env de verdade pode ter 2 ou 3 chaves; zero é arquivo zerado
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

// Nome + 8 letras do caminho inteiro: dois projetos "loja" em pastas diferentes nao dividem a
// mesma pasta de backup (a conta do truncado compararia o .env de um com a copia do outro).
// No Windows o caminho vai em minusculas, pra letra de unidade maiuscula ou minuscula cair na
// mesma pasta. A pasta antiga, so com o nome, fica onde esta e nao recebe mais copia.
function pastaDoProjeto(envPath) {
  const dir = dirname(resolve(envPath));
  const chave = process.platform === 'win32' ? dir.toLowerCase() : dir;
  return `${basename(dir)}-${createHash('sha256').update(chave).digest('hex').slice(0, 8)}-env`;
}

/**
 * Faz o backup do .env em `envPath`.
 *
 * Devolve `{ ok: true, destino, chaves, total, backupDir }` quando copiou, ou
 * `{ ok: false, motivo, chaves }` quando recusou por o arquivo parecer truncado.
 */
export function backupEnv({ envPath, backupDir, minChaves = MIN_CHAVES_PADRAO, manter = MANTER_PADRAO, agora = new Date() } = {}) {
  if (!envPath) throw new Error('backupEnv: informe envPath');

  const destinoBase = backupDir || join(os.homedir(), '.claude', 'backups', pastaDoProjeto(envPath));

  const raw = readFileSync(envPath, 'utf8');
  const chaves = contarChaves(raw);

  // truncado se mede contra a última cópia boa, e não por um número fixo: quem tem 3 chaves
  // de verdade faz backup, e um .env que caiu pra menos da metade das chaves de antes, não
  const ultima = join(destinoBase, 'latest.env');
  const antes = existsSync(ultima) ? contarChaves(readFileSync(ultima, 'utf8')) : 0;
  if (chaves < minChaves || chaves * 2 < antes) {
    const comparado = antes ? `, a última cópia tinha ${antes}` : '';
    return { ok: false, motivo: `arquivo com só ${chaves} chaves${comparado}, parece truncado`, chaves };
  }

  mkdirSync(destinoBase, { recursive: true });

  // Carimbo de data por segundo, mais um sufixo de alta resolução (hrtime, em nanossegundos)
  // pra garantir nome único mesmo quando dois backups caem dentro do mesmo segundo: sem
  // isso, duas chamadas rápidas em sequência gerariam o MESMO nome de arquivo e a segunda
  // sobrescreveria a primeira em silêncio, quebrando a rotação (cada rodada tem que virar
  // um arquivo distinto pra "mantém só as últimas N" fazer sentido).
  // A hora vai no relógio local, que é o que a pessoa procura ao abrir a pasta: em UTC, a cópia
  // das 22h no Brasil sairia com a data de amanhã.
  const z = (n) => String(n).padStart(2, '0');
  const stamp = `${agora.getFullYear()}-${z(agora.getMonth() + 1)}-${z(agora.getDate())}_${z(agora.getHours())}-${z(agora.getMinutes())}-${z(agora.getSeconds())}`;
  const sufixo = process.hrtime.bigint().toString(36);
  const destino = join(destinoBase, `env-${stamp}-${sufixo}.bak`);
  escreverAtomico(destino, raw);
  escreverAtomico(join(destinoBase, 'latest.env'), raw); // cópia sempre atualizada, fácil de achar

  // rotação: mantém só as últimas `manter` cópias datadas. A ordem vem da hora em que cada cópia
  // foi gravada, com o nome só de desempate: pelo nome, as cópias antigas em UTC (até a 5.17)
  // ficariam "depois" das novas em hora local, e a cópia recém-feita seria a primeira apagada.
  const gravadaEm = (f) => statSync(join(destinoBase, f)).mtimeMs;
  const copias = readdirSync(destinoBase)
    .filter((f) => f.startsWith('env-') && f.endsWith('.bak'))
    .map((f) => ({ f, t: gravadaEm(f) }))
    .sort((a, b) => a.t - b.t || (a.f < b.f ? -1 : a.f > b.f ? 1 : 0))
    .map((c) => c.f);
  for (const f of copias.slice(0, Math.max(0, copias.length - manter))) {
    unlinkSync(join(destinoBase, f));
  }

  return { ok: true, destino, chaves, total: Math.min(copias.length, manter), backupDir: destinoBase };
}

// Uso direto via linha de comando: node backup-env.mjs [caminho-do-.env]
// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  const envPath = process.argv[2] || join(process.cwd(), '.env');
  const resultado = backupEnv({ envPath });

  if (!resultado.ok) {
    console.error(`[ABORTADO] .env ${resultado.motivo}. Não vou fazer backup pra não estragar as cópias boas.`);
    process.exit(2);
  }
  console.log(`[OK] backup do .env (${resultado.chaves} chaves) -> ${resultado.destino}`);
  console.log(`     total de cópias guardadas: ${resultado.total} em ${resultado.backupDir}`);
}
