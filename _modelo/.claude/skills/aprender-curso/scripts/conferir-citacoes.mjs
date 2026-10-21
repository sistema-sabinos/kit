// Confere cada citacao do texto contra os arquivos numerados da pasta: o numero precisa existir
// num arquivo so e o arquivo precisa ter a marca entre colchetes. Checagem que nao achou nenhuma
// citacao sai 1: vazio nunca conta como verde.
// Curso (/aprender-curso): (aula N, marca) do mentor.md contra aulas/.
// Persona (/clonar-especialista, --persona): (fonte N, marca) do SKILL.md contra fichas/.
// Modo --resposta: o mentor grava o rascunho da resposta num arquivo, o script confere todas as
// citacoes dele como acima e sorteia N (padrao 3) pra imprimir, de cada uma, a linha do mentor e
// o trecho da aula em volta da marca. Quem compara o sentido e a IA, sem custo; o script so
// sorteia e entrega. --semente fixa o sorteio (teste). Citacao que nao casa com a pasta de um curso
// sai 1 com AVISO de outro curso.
// Mais de um curso (--cursos): a pasta e inteligencia/cursos e toda citacao leva o curso no fim,
// (aula N, marca, <curso>), conferida contra <curso>/aulas/. --tema confere o arquivo do cruzamento
// (inteligencia/temas/<tema>.md) e as regras das secoes: item de Consenso e de Divergencias cita
// cursos de pelo menos 2 autores (linha "Autor:" do curso.md), item de Fonte unica cita 1 curso.
// --resposta sorteia como acima, com o trecho tirado do curso citado.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome>
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs <pasta-do-conselheiro> --persona
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos/<nome> --resposta <arquivo> [--amostra N]
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs ~/.claude/skills/<apelido> --persona --resposta <arquivo>
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos --cursos --tema inteligencia/temas/<tema>.md
//   node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs inteligencia/cursos --cursos --resposta <arquivo> [--amostra N]
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { citacoesDe, citacoesComCurso } from './lib/citacoes.mjs'

const MODOS = {
  curso: { arquivo: 'mentor.md', pasta: 'aulas', rotulo: 'aula' },
  persona: { arquivo: 'SKILL.md', pasta: 'fichas', rotulo: 'fonte' },
}
const JANELA = 2
// A citacao de um curso so nao diz de qual curso e: uma certa do curso B, no rascunho do A, falha
// aqui e seria "corrigida" (apagada). O aviso manda botar o curso na citacao e rodar com --cursos.
const OUTRO_CURSO = 'AVISO: citacao que nao casa com esta pasta pode ser de outro curso. Resposta com mais de um curso: cada citacao leva o curso no fim, (aula N, marca, <curso>), e o script roda uma vez so, com a pasta inteligencia/cursos e --cursos; citacao certa de outro curso ganha o curso, nunca se apaga.'

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

// --cursos: so os cursos citados se leem, cada um do proprio aulas/
const aulasDoCurso = (dir, curso) => lerArquivos(join(dir, curso), MODOS.curso)
function lerCursos(dir, citacoes) {
  const cursos = new Map()
  for (const curso of new Set(citacoes.map(c => c.curso))) if (existsSync(join(dir, curso))) cursos.set(curso, aulasDoCurso(dir, curso))
  return cursos
}

function checarCursos(texto, onde, dir) {
  const { acharCitacoes, acharForaDoFormato, conferir } = citacoesComCurso(dir)
  const citacoes = acharCitacoes(texto)
  const fora = acharForaDoFormato(texto).map(f => `${f.semCurso ? 'citacao sem o curso' : 'citacao fora do formato'}: ${f.trecho}`)
  if (!citacoes.length && !fora.length) return { aviso: `AVISO: nenhuma citacao no formato (aula N, marca, <curso>) achada no ${onde}` }
  const cursos = lerCursos(dir, citacoes)
  return { citacoes, cursos, problemas: [...fora, ...conferir(citacoes, cursos).problemas] }
}

// Cabecalho comparado sem acento e sem diferenciar maiuscula. A classe de marca se monta pela barra:
// escrita direto, ja virou o proprio caractere na gravacao.
const SEM_ACENTO = new RegExp(String.fromCharCode(92) + 'p{M}', 'gu')
const normal = s => s.normalize('NFD').replace(SEM_ACENTO, '').toLowerCase().trim()
const SECOES_DO_TEMA = { consenso: 'consenso', divergencias: 'divergencia', 'fonte unica': 'fonte unica' }
const PEDE_AUTORES_DIFERENTES = new Set(['consenso', 'divergencias'])
// o cabecalho vale pelo comeco: "## Fonte unica (menos confirmado)" e "## Consenso:" ainda sao a secao
const COMECO_DA_SECAO = { consenso: /^consenso\b/, divergencias: /^divergencias?\b/, 'fonte unica': /^fonte unica\b/ }
const secaoDe = cabecalho => Object.keys(COMECO_DA_SECAO).find(s => COMECO_DA_SECAO[s].test(normal(cabecalho))) ?? null
// item de lista com qualquer marcador e recuo: "- ", "* ", "+ ", "1. ", "2) "
const ITEM = /^\s*(?:[-*+]|\d+[.)])\s/

function autorDoCurso(dir, curso) {
  const arq = join(dir, curso, 'curso.md')
  const m = existsSync(arq) ? readFileSync(arq, 'utf8').match(/^Autor:[ \t]*(\S.*?)\s*$/m) : null
  return m ? m[1] : null
}

export function conferirTema(dir, arquivo) {
  if (!existsSync(arquivo)) return { codigo: 1, linhas: [`AVISO: sem o arquivo do tema ${arquivo}`] }
  const texto = readFileSync(arquivo, 'utf8')
  const r = checarCursos(texto, 'tema', dir)
  if (r.aviso) return { codigo: 1, linhas: [r.aviso] }
  const problemas = [...r.problemas]
  const autores = new Map()
  for (const curso of r.cursos.keys()) {
    const autor = autorDoCurso(dir, curso)
    if (autor) autores.set(curso, autor)
    else problemas.push(`sem a linha "Autor:" no curso.md de ${curso}`)
  }
  let secao = null
  let achouSecao = false
  texto.split(/\r?\n/).forEach((l, i) => {
    const cab = l.match(/^## (.+)$/)
    if (cab) {
      secao = secaoDe(cab[1])
      if (secao) achouSecao = true
      return
    }
    if (!secao || !ITEM.test(l)) return
    const nome = SECOES_DO_TEMA[secao]
    const cursos = [...new Set(r.citacoes.filter(c => c.linha === i + 1).map(c => c.curso))]
    if (!cursos.length) return problemas.push(`${nome} sem citacao com curso (linha ${i + 1})`)
    // curso que nao existe ou sem autor ja virou problema acima
    if (cursos.some(c => !autores.has(c))) return
    if (PEDE_AUTORES_DIFERENTES.has(secao)) {
      const deles = [...new Set(cursos.map(c => autores.get(c)))]
      if (new Set(deles.map(normal)).size < 2) problemas.push(`${nome} com um autor so (linha ${i + 1}): ${deles.join(', ')}`)
    } else if (secao === 'fonte unica' && cursos.length !== 1) problemas.push(`${nome} com ${cursos.length} cursos (linha ${i + 1}): ${cursos.join(', ')}`)
  })
  if (!achouSecao) return { codigo: 1, linhas: ['AVISO: nenhuma das secoes Consenso, Divergencias ou Fonte unica achada no tema'] }
  if (!problemas.length) return { codigo: 0, linhas: [`conferidas: ${r.citacoes.length}`] }
  return { codigo: 1, linhas: [...problemas, `problemas: ${problemas.length}`] }
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

export function sortearResposta(dir, arquivo, { persona = false, cursos = false, amostra = 3, semente } = {}) {
  const modo = MODOS[persona ? 'persona' : 'curso']
  if (!(amostra >= 1)) return { codigo: 1, linhas: ['AVISO: --amostra precisa ser um numero de 1 pra cima'] }
  if (!existsSync(arquivo)) return { codigo: 1, linhas: [`AVISO: sem o arquivo da resposta ${arquivo}`] }
  const texto = readFileSync(arquivo, 'utf8')
  const daPasta = cursos ? null : lerArquivos(dir, modo)
  const r = cursos ? checarCursos(texto, 'texto da resposta', dir) : checarTexto(texto, 'texto da resposta', modo, daPasta)
  if (r.aviso) return { codigo: 1, linhas: [r.aviso] }
  if (r.problemas.length) {
    const linhas = [...r.problemas, `problemas: ${r.problemas.length}`]
    if (!persona && !cursos && r.problemas.some(p => !p.startsWith('citacao fora do formato'))) linhas.push(OUTRO_CURSO)
    return { codigo: 1, linhas }
  }
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
    const arquivos = cursos ? r.cursos.get(c.curso) : daPasta
    const fonte = arquivos.find(a => Number(a.nome.match(/^(\d+)-/)?.[1]) === n)
    saida.push(`--- ${k + 1} de ${escolhidas.length}: (${modo.rotulo} ${n}, ${c.marca}${cursos ? `, ${c.curso}` : ''})`)
    saida.push(`resposta: ${linhasResposta[c.linha - 1].trim()}`)
    saida.push(`${cursos ? `${c.curso}/` : ''}${modo.pasta}/${fonte.nome}:`)
    for (const bloco of trechoDaMarca(fonte.texto, c.marca)) {
      for (const l of bloco) saida.push(`  ${l}`)
      saida.push('  ...')
    }
  })
  saida.push(`sorteadas: ${escolhidas.length} de ${r.citacoes.length}`)
  return { codigo: 0, linhas: saida }
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
  const valor = nome => (args.includes(nome) ? args[args.indexOf(nome) + 1] : undefined)
  const comValor = new Set(['--resposta', '--amostra', '--semente', '--tema'].map(valor))
  const dir = args.find(a => !a.startsWith('--') && !comValor.has(a))
  if (!dir) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs <pasta> [--persona] [--resposta <arquivo> [--amostra N]] | inteligencia/cursos --cursos (--tema <arquivo> | --resposta <arquivo>)')
    process.exit(1)
  }
  const persona = args.includes('--persona')
  const cursos = args.includes('--cursos')
  // ~ sem o shell expandir (aspas, PowerShell 5.1): a persona mora em ~/.claude/skills/<apelido>
  const casa = p => (p && (p === '~' || p.startsWith('~/')) ? join(homedir(), p.slice(1)) : p)
  const resposta = casa(valor('--resposta'))
  const tema = casa(valor('--tema'))
  const parar = aviso => { console.log(aviso); process.exit(1) }
  // --resposta sem caminho nao pode cair no modo normal e sair verde como se tivesse conferido o rascunho
  if (args.includes('--resposta') && (!resposta || resposta.startsWith('--'))) parar('AVISO: --resposta precisa do caminho do arquivo do rascunho')
  if (args.includes('--tema') && (!tema || tema.startsWith('--'))) parar('AVISO: --tema precisa do caminho do arquivo do tema')
  if (cursos && persona) parar('AVISO: --cursos nao vale com --persona: a persona cita (fonte N, marca), sem curso')
  if (tema && !cursos) parar('AVISO: --tema so vale com --cursos e a pasta inteligencia/cursos')
  if (cursos && !tema && !resposta) parar('AVISO: --cursos precisa de --tema <arquivo> ou --resposta <arquivo>')
  if (tema && resposta) parar('AVISO: --tema e --resposta sao rodadas separadas')
  const r = tema
    ? conferirTema(casa(dir), tema)
    : resposta
      ? sortearResposta(casa(dir), resposta, { persona, cursos, amostra: Number(valor('--amostra') ?? 3), semente: valor('--semente') })
      : conferirPasta(casa(dir), { persona })
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
