// Confere cada citacao do texto contra os arquivos numerados da pasta: o numero precisa existir
// num arquivo so e o arquivo precisa ter a marca entre colchetes. Checagem que nao achou nenhuma
// citacao sai 1: vazio nunca conta como verde.
// Curso (/aprender-curso): (aula N, marca) do mentor.md contra aulas/.
// Persona (/clonar-especialista, --persona): (fonte N, marca) do SKILL.md contra fichas/.
// Modo --resposta: o mentor grava o rascunho da resposta num arquivo, o script confere todas as
// citacoes dele como acima e sorteia N (padrao 3) pra imprimir, de cada uma, a linha do mentor e
// o trecho da aula em volta da marca. Quem compara o sentido e a IA, sem custo; o script so
// sorteia e entrega. --semente fixa o sorteio (teste).
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome>
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs <pasta-do-conselheiro> --persona
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome> --resposta <arquivo> [--amostra N]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { citacoesDe } from './lib/citacoes.mjs'

const MODOS = {
  curso: { arquivo: 'mentor.md', pasta: 'aulas', rotulo: 'aula' },
  persona: { arquivo: 'SKILL.md', pasta: 'fichas', rotulo: 'fonte' },
}
const JANELA = 2

function lerArquivos(dir, modo) {
  const dirArquivos = join(dir, modo.pasta)
  const nomes = existsSync(dirArquivos) ? readdirSync(dirArquivos).filter(n => n.endsWith('.md')) : []
  return nomes.map(nome => ({ nome, texto: readFileSync(join(dirArquivos, nome), 'utf8') }))
}

// Confere o texto inteiro; devolve as citacoes achadas e os problemas (fora do formato e conferir).
function checarTexto(texto, onde, modo, arquivos) {
  const { acharCitacoes, acharForaDoFormato, conferir } = citacoesDe(modo.rotulo, modo.pasta)
  const citacoes = acharCitacoes(texto)
  const fora = acharForaDoFormato(texto).map(f => `citacao fora do formato: ${f.trecho}`)
  if (!citacoes.length && !fora.length) return { aviso: `AVISO: nenhuma citacao no formato (${modo.rotulo} N, marca) achada no ${onde}` }
  return { citacoes, problemas: [...fora, ...conferir(citacoes, arquivos).problemas] }
}

export function conferirPasta(dir, { persona = false } = {}) {
  const modo = MODOS[persona ? 'persona' : 'curso']
  const alvo = join(dir, modo.arquivo)
  if (!existsSync(alvo)) return { codigo: 1, linhas: [`AVISO: sem ${modo.arquivo} em ${dir}`] }
  const r = checarTexto(readFileSync(alvo, 'utf8'), modo.arquivo, modo, lerArquivos(dir, modo))
  if (r.aviso) return { codigo: 1, linhas: [r.aviso] }
  if (!r.problemas.length) return { codigo: 0, linhas: [`conferidas: ${r.citacoes.length}`] }
  return { codigo: 1, linhas: [...r.problemas, `problemas: ${r.problemas.length}`] }
}

// Sorteio com semente (mulberry32); sem semente, Math.random.
function gerador(semente) {
  if (semente == null) return Math.random
  let a = Number(semente) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Linhas em volta de cada ocorrencia da marca no texto da aula.
export function trechoDaMarca(texto, marca, janela = JANELA) {
  const linhas = texto.split(/\r?\n/)
  const blocos = []
  linhas.forEach((l, i) => {
    if (l.includes(`[${marca}]`)) blocos.push(linhas.slice(Math.max(0, i - janela), i + janela + 1))
  })
  return blocos
}

export function sortearResposta(dir, arquivo, { persona = false, amostra = 3, semente } = {}) {
  const modo = MODOS[persona ? 'persona' : 'curso']
  if (!(amostra >= 1)) return { codigo: 1, linhas: ['AVISO: --amostra precisa ser um numero de 1 pra cima'] }
  if (!existsSync(arquivo)) return { codigo: 1, linhas: [`AVISO: sem o arquivo da resposta ${arquivo}`] }
  const texto = readFileSync(arquivo, 'utf8')
  const arquivos = lerArquivos(dir, modo)
  const r = checarTexto(texto, 'texto da resposta', modo, arquivos)
  if (r.aviso) return { codigo: 1, linhas: [r.aviso] }
  if (r.problemas.length) return { codigo: 1, linhas: [...r.problemas, `problemas: ${r.problemas.length}`] }
  const sorteio = gerador(semente)
  const indices = r.citacoes.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const escolhidas = indices.slice(0, Math.floor(amostra)).sort((x, y) => x - y).map(i => r.citacoes[i])
  const linhasResposta = texto.split(/\r?\n/)
  const saida = []
  escolhidas.forEach((c, k) => {
    const n = c[modo.rotulo]
    const fonte = arquivos.find(a => Number(a.nome.match(/^(\d+)-/)?.[1]) === n)
    saida.push(`--- ${k + 1} de ${escolhidas.length}: (${modo.rotulo} ${n}, ${c.marca})`)
    saida.push(`resposta: ${linhasResposta[c.linha - 1].trim()}`)
    saida.push(`${modo.pasta}/${fonte.nome}:`)
    for (const bloco of trechoDaMarca(fonte.texto, c.marca)) {
      for (const l of bloco) saida.push(`  ${l}`)
      saida.push('  ...')
    }
  })
  saida.push(`sorteadas: ${escolhidas.length} de ${r.citacoes.length}`)
  return { codigo: 0, linhas: saida }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const args = process.argv.slice(2)
  const valor = nome => (args.includes(nome) ? args[args.indexOf(nome) + 1] : undefined)
  const comValor = new Set(['--resposta', '--amostra', '--semente'].map(valor))
  const dir = args.find(a => !a.startsWith('--') && !comValor.has(a))
  if (!dir) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs <pasta> [--persona] [--resposta <arquivo> [--amostra N]]')
    process.exit(1)
  }
  const persona = args.includes('--persona')
  const resposta = valor('--resposta')
  // --resposta sem caminho nao pode cair no modo normal e sair verde como se tivesse conferido o rascunho
  if (args.includes('--resposta') && (!resposta || resposta.startsWith('--'))) {
    console.log('AVISO: --resposta precisa do caminho do arquivo do rascunho')
    process.exit(1)
  }
  const r = resposta
    ? sortearResposta(dir, resposta, { persona, amostra: Number(valor('--amostra') ?? 3), semente: valor('--semente') })
    : conferirPasta(dir, { persona })
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
