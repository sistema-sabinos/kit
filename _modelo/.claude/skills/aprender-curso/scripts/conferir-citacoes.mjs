// Confere cada citacao do texto contra os arquivos numerados da pasta: o numero precisa existir
// num arquivo so e o arquivo precisa ter a marca entre colchetes. Checagem que nao achou nenhuma
// citacao sai 1: vazio nunca conta como verde.
// Curso (/aprender-curso): (aula N, marca) do mentor.md contra aulas/.
// Persona (/clonar-especialista, --persona): (fonte N, marca) do SKILL.md contra fichas/.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome>
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs <pasta-do-conselheiro> --persona
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { citacoesDe } from './lib/citacoes.mjs'

const MODOS = {
  curso: { arquivo: 'mentor.md', pasta: 'aulas', rotulo: 'aula' },
  persona: { arquivo: 'SKILL.md', pasta: 'fichas', rotulo: 'fonte' },
}

export function conferirPasta(dir, { persona = false } = {}) {
  const modo = MODOS[persona ? 'persona' : 'curso']
  const { acharCitacoes, acharForaDoFormato, conferir } = citacoesDe(modo.rotulo, modo.pasta)
  const alvo = join(dir, modo.arquivo)
  if (!existsSync(alvo)) return { codigo: 1, linhas: [`AVISO: sem ${modo.arquivo} em ${dir}`] }
  const texto = readFileSync(alvo, 'utf8')
  const citacoes = acharCitacoes(texto)
  const fora = acharForaDoFormato(texto).map(f => `citacao fora do formato: ${f.trecho}`)
  if (!citacoes.length && !fora.length) return { codigo: 1, linhas: [`AVISO: nenhuma citacao no formato (${modo.rotulo} N, marca) achada no ${modo.arquivo}`] }
  const dirArquivos = join(dir, modo.pasta)
  const nomes = existsSync(dirArquivos) ? readdirSync(dirArquivos).filter(n => n.endsWith('.md')) : []
  const arquivos = nomes.map(nome => ({ nome, texto: readFileSync(join(dirArquivos, nome), 'utf8') }))
  const problemas = [...fora, ...conferir(citacoes, arquivos).problemas]
  if (!problemas.length) return { codigo: 0, linhas: [`conferidas: ${citacoes.length}`] }
  return { codigo: 1, linhas: [...problemas, `problemas: ${problemas.length}`] }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const args = process.argv.slice(2)
  const dir = args.find(a => !a.startsWith('--'))
  if (!dir) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs <pasta> [--persona]')
    process.exit(1)
  }
  const r = conferirPasta(dir, { persona: args.includes('--persona') })
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
