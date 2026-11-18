// Passo 8 da /clonar-especialista: com apelido, o nome real nao aparece no SKILL.md nem no
// agente.md do conselheiro. O nome vem da linha "pessoa:" do inventario.md; a linha
// "nome-no-agente: sim" (o aluno escolheu usar o nome) libera. Inventario e fichas podem ter o
// nome: e com ele que se cita a obra. "primeira-pessoa: sim" sem o nome liberado sai 1 (5.57).
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/travar-nome.mjs <pasta-do-conselheiro>
// Sai 0 com "sem o nome: ..." ou "nome liberado pelo aluno"; sai 1 com cada ocorrencia.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acharNome, partesDoNome } from './lib/nome.mjs'
import { opcoesDoInventario } from './lib/inventario.mjs'

const ARQUIVOS = ['SKILL.md', 'agente.md']
const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }

export function travarNome(pasta) {
  const inv = ler(join(pasta, 'inventario.md'))
  const pessoa = /^pessoa:[ \t]*(.+?)[ \t]*$/m.exec(inv)?.[1]
  if (!pessoa) return { codigo: 1, linhas: ['AVISO: inventario.md sem a linha "pessoa: <nome completo>"'] }
  const op = opcoesDoInventario(inv)
  // 5.57: falar como a pessoa escondendo o nome dela nao fecha; a primeira pessoa so vem com o nome
  if (op.primeiraPessoa && !op.nomeNoAgente) return { codigo: 1, linhas: ['primeira-pessoa: sim pede nome-no-agente: sim no inventario.md: o conselheiro so fala como a pessoa com o nome dela liberado'] }
  if (op.nomeNoAgente) return { codigo: 0, linhas: [op.primeiraPessoa ? 'nome liberado pelo aluno, com primeira pessoa' : 'nome liberado pelo aluno'] }
  const partes = partesDoNome(pessoa)
  if (!partes.length) return { codigo: 1, linhas: [`AVISO: nome curto demais pra conferir ("${pessoa}", menos de 4 letras juntando as partes): confira o nome a mao`] }
  const faltam = ARQUIVOS.filter(a => !existsSync(join(pasta, a)))
  if (faltam.length) return { codigo: 1, linhas: faltam.map(a => `AVISO: falta ${a}`) }
  const linhas = []
  for (const a of ARQUIVOS) {
    for (const x of acharNome(ler(join(pasta, a)), pessoa)) linhas.push(`${a}:${x.linha}: "${x.trecho}" (parte "${x.parte}")`)
  }
  if (!linhas.length) return { codigo: 0, linhas: [`sem o nome: ${partes.length} partes conferidas em ${ARQUIVOS.length} arquivos`] }
  return { codigo: 1, linhas: [...linhas, `ocorrencias: ${linhas.length}`] }
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
  const pasta = process.argv[2]
  if (!pasta) {
    console.error('Uso: node .claude/skills/clonar-especialista/scripts/travar-nome.mjs <pasta-do-conselheiro>')
    process.exit(1)
  }
  const r = travarNome(pasta)
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
