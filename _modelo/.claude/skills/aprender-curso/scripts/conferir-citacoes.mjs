// Confere cada citacao (aula N, marca) do mentor.md contra os arquivos de aulas/: a aula precisa
// existir num arquivo so e o arquivo precisa ter a marca entre colchetes. Checagem que nao achou
// nenhuma citacao sai 1: vazio nunca conta como verde.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome>
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acharCitacoes, acharForaDoFormato, conferir } from './lib/citacoes.mjs'

export function conferirPasta(pasta) {
  const mentor = join(pasta, 'mentor.md')
  if (!existsSync(mentor)) return { codigo: 1, linhas: [`AVISO: sem mentor.md em ${pasta}`] }
  const texto = readFileSync(mentor, 'utf8')
  const citacoes = acharCitacoes(texto)
  const fora = acharForaDoFormato(texto).map(f => `citacao fora do formato: ${f.trecho}`)
  if (!citacoes.length && !fora.length) return { codigo: 1, linhas: ['AVISO: nenhuma citacao no formato (aula N, marca) achada no mentor.md'] }
  const dirAulas = join(pasta, 'aulas')
  const nomes = existsSync(dirAulas) ? readdirSync(dirAulas).filter(n => n.endsWith('.md')) : []
  const aulas = nomes.map(nome => ({ nome, texto: readFileSync(join(dirAulas, nome), 'utf8') }))
  const problemas = [...fora, ...conferir(citacoes, aulas).problemas]
  if (!problemas.length) return { codigo: 0, linhas: [`conferidas: ${citacoes.length}`] }
  return { codigo: 1, linhas: [...problemas, `problemas: ${problemas.length}`] }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const pasta = process.argv[2]
  if (!pasta || pasta.startsWith('--')) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome>')
    process.exit(1)
  }
  const r = conferirPasta(pasta)
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
