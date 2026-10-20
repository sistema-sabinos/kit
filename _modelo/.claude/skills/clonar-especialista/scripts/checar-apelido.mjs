// Passo 1 da /clonar-especialista: confere o apelido do conselheiro antes de qualquer pesquisa.
// Formato: minusculas, numero e hifen, ate 64 caracteres. Recusa apelido que ja e nome de skill
// do projeto, do molde ou da pasta-mae (skill pessoal com nome de skill do projeto roda no lugar
// dela: doc de skills do Claude Code, "personal over project"). Recusa tambem o que ja existe em
// ~/.claude/skills, ~/.claude/agents ou na copia-mestra, a menos que seja conselheiro desta skill
// (origem: clonar-especialista, tambem no SKILL.md da copia-mestra quando ele ja existe) e o
// pedido seja de atualizar (--atualizar).
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/checar-apelido.mjs <apelido> [--atualizar]
// Sai 0 com "livre: <apelido>" ou "atualizar: <apelido>"; sai 1 com o motivo.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { acharPastaMae, pastaMestra } from './lib/pasta-mae.mjs'
import { ehNossa } from './lib/frontmatter.mjs'

const FORMATO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const pastas = dir => {
  try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch { return [] }
}
const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }

export function checarApelido(apelido, { projeto = '.', casa = homedir(), atualizar = false } = {}) {
  if (typeof apelido !== 'string' || !FORMATO.test(apelido) || apelido.length > 64) {
    return { codigo: 1, linha: `formato: use minusculas, numero e hifen, ate 64 caracteres (ex.: mentor-persuasao), veio "${apelido ?? ''}"` }
  }
  const mae = acharPastaMae(projeto)
  const doSistema = [join(projeto, '.claude', 'skills')]
  if (mae) doSistema.push(join(mae, '_modelo', '.claude', 'skills'), join(mae, '.claude', 'skills'))
  for (const l of doSistema) if (pastas(l).includes(apelido)) return { codigo: 1, linha: `ja e nome de skill do sistema (${l}): escolha outro apelido` }

  const pastaSkill = join(casa, '.claude', 'skills', apelido)
  const agente = join(casa, '.claude', 'agents', `${apelido}.md`)
  // pasta de trabalho: na pasta-mae (com backup) ou, fora dela, no ~/.claude/conselheiros/
  const mestra = pastaMestra(apelido, { projeto, casa })
  const temSkill = existsSync(pastaSkill)
  const temAgente = existsSync(agente)
  const temMestra = existsSync(mestra)
  if (!temSkill && !temAgente && !temMestra) return { codigo: 0, linha: `livre: ${apelido}` }
  const nosso = (!temSkill || ehNossa(ler(join(pastaSkill, 'SKILL.md')))) && (!temAgente || ehNossa(ler(agente)))
  if (!nosso) return { codigo: 1, linha: 'ja existe em ~/.claude e nao foi feito por esta skill: escolha outro apelido' }
  // copia-mestra sem SKILL.md e coleta no meio: conta como nossa
  const skillMestra = join(mestra, 'SKILL.md')
  if (existsSync(skillMestra) && !ehNossa(ler(skillMestra))) {
    return { codigo: 1, linha: 'ja existe uma copia-mestra com esse apelido que nao foi feita por esta skill: escolha outro apelido' }
  }
  if (!atualizar) return { codigo: 1, linha: 'ja existe um conselheiro com esse apelido: e pra atualizar? rode de novo com --atualizar' }
  return { codigo: 0, linha: `atualizar: ${apelido}` }
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
  const args = process.argv.slice(2)
  const r = checarApelido(args.find(a => !a.startsWith('--')), { atualizar: args.includes('--atualizar') })
  console.log(r.linha)
  process.exit(r.codigo)
}
