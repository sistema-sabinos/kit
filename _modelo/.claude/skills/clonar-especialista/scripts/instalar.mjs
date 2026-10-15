// Passo 10 da /clonar-especialista e item "Conselheiros" do /checar: poe o conselheiro da
// copia-mestra no ~/.claude, onde todo projeto enxerga (skill e agente de projeto so sao
// procurados ate a raiz do repositorio, e cada projeto tem git proprio: doc do Claude Code,
// conferida em 2026-10-12). Copia SKILL.md e fichas/ para ~/.claude/skills/<apelido>/ e
// agente.md para ~/.claude/agents/<apelido>.md. Inventario, conflitos, prova e fontes ficam so
// na copia-mestra. Nunca sobrescreve o que nao tem "origem: clonar-especialista". So instala a
// copia-mestra (<pasta-mae>/agentes/<apelido> ou ~/.claude/conselheiros/<apelido>, regra do
// lib/pasta-mae.mjs): copia de teste com o mesmo nome nao passa. Antes de
// copiar, a copia-mestra passa de novo pelas travas (persona medida, citacoes, nome) e precisa
// do teste de fidelidade liberado ("Liberado: sim" em prova/resultado.md) e carimbado ("Persona:
// <carimbo>" igual ao carimbo de agora, lib/carimbo.mjs): a reinstalacao do /checar vem por aqui
// e nao pode soltar uma copia-mestra mexida depois do teste, nem rodada com "Carimbo recusado:".
// O --carimbar grava o carimbo no fim do Passo 9.
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/instalar.mjs <pasta-do-conselheiro>
//   node .claude/skills/clonar-especialista/scripts/instalar.mjs --carimbar <pasta-do-conselheiro>
//   node .claude/skills/clonar-especialista/scripts/instalar.mjs --faltando <pasta-mae>/agentes
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ehNossa } from './lib/frontmatter.mjs'
import { carimboPersona } from './lib/carimbo.mjs'
import { ehMestra } from './lib/pasta-mae.mjs'
import { medirPersona } from './medir-persona.mjs'
import { travarNome } from './travar-nome.mjs'
import { medirColeta } from './medir-coleta.mjs'
import { conferirPasta } from '../../aprender-curso/scripts/conferir-citacoes.mjs'
import { lerGabarito, textoPerguntas } from './montar-bateria.mjs'

const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const pastas = dir => {
  try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch { return [] }
}
// prova/resultado.md acumula o placar de cada rodada da bateria, um bloco "## Rodada <n>" cada
// (arquivo sem nenhum e um bloco so, que o carimbar recusa). "Liberado:" e "Persona:" valem so no ultimo bloco, do
// ultimo "## Rodada" ate o fim: carimbo de rodada velha nunca cobre persona mexida depois
const ultimoBloco = texto => texto.slice([...texto.matchAll(/^## Rodada\b/gm)].at(-1)?.index ?? 0)
const liberado = texto => /^sim\b/.test([...ultimoBloco(texto).matchAll(/^Liberado:[ \t]*(.*)$/gm)].at(-1)?.[1] ?? '')
// "Carimbo recusado:" no ultimo bloco trava a rodada: so rodada nova libera carimbo e instalacao
const recusado = texto => /^Carimbo recusado:/m.test(ultimoBloco(texto))
const destinos = (apelido, casa) => ({
  skill: join(casa, '.claude', 'skills', apelido),
  agente: join(casa, '.claude', 'agents', `${apelido}.md`),
})

export function instalar(pasta, casa = homedir()) {
  const apelido = basename(resolve(pasta))
  // copia carimbada fora da copia-mestra, com o mesmo nome, sobrescreveria calada o instalado
  if (!ehMestra(pasta, casa)) {
    return { codigo: 1, linhas: [`nao instalei: so a copia-mestra em <pasta-mae>/agentes/${apelido} ou em ~/.claude/conselheiros/${apelido} instala, e ${resolve(pasta)} fica fora das duas`] }
  }
  const med = medirPersona(pasta)
  if (med.codigo) return { codigo: 1, linhas: ['persona reprovada no medir-persona, nada instalado:', ...med.linhas] }
  const cit = conferirPasta(pasta, { persona: true })
  if (cit.codigo) return { codigo: 1, linhas: ['citacoes reprovadas no conferir-citacoes, nada instalado:', ...cit.linhas] }
  const nome = travarNome(pasta)
  if (nome.codigo) return { codigo: 1, linhas: ['nome real na persona (travar-nome), nada instalado:', ...nome.linhas] }
  const resultado = ler(join(pasta, 'prova', 'resultado.md'))
  if (!liberado(resultado)) {
    return { codigo: 1, linhas: ['teste de fidelidade sem "Liberado: sim" em prova/resultado.md, nada instalado: rode o Passo 9'] }
  }
  const carimbo = /^Persona:[ \t]*([0-9a-f]{64})[ \t]*$/m.exec(ultimoBloco(resultado))
  if (!carimbo) return { codigo: 1, linhas: ['persona mudou depois do teste de fidelidade (sem carimbo), nada instalado: volte ao Passo 8 (travas) e refaca o Passo 9'] }
  if (carimbo[1] !== carimboPersona(pasta)) {
    return { codigo: 1, linhas: ['persona mudou depois do teste de fidelidade (carimbo diferente), nada instalado: volte ao Passo 8 (travas) e refaca o Passo 9'] }
  }
  if (recusado(resultado)) return { codigo: 1, linhas: ['esta rodada teve o carimbo recusado, nada instalado: rode uma rodada nova da bateria'] }
  const d = destinos(apelido, casa)
  if (existsSync(d.skill) && !ehNossa(ler(join(d.skill, 'SKILL.md')))) return { codigo: 1, linhas: [`${d.skill} existe e nao foi feito por esta skill: nada instalado`] }
  if (existsSync(d.agente) && !ehNossa(ler(d.agente))) return { codigo: 1, linhas: [`${d.agente} existe e nao foi feito por esta skill: nada instalado`] }
  rmSync(d.skill, { recursive: true, force: true })
  mkdirSync(d.skill, { recursive: true })
  copyFileSync(join(pasta, 'SKILL.md'), join(d.skill, 'SKILL.md'))
  if (existsSync(join(pasta, 'fichas'))) cpSync(join(pasta, 'fichas'), join(d.skill, 'fichas'), { recursive: true })
  mkdirSync(join(casa, '.claude', 'agents'), { recursive: true })
  copyFileSync(join(pasta, 'agente.md'), d.agente)
  return { codigo: 0, linhas: [`instalado: ${d.skill}`, `instalado: ${d.agente}`, 'abra uma conversa nova pra ele aparecer'] }
}

// Fim do Passo 9: grava "Persona: <carimbo>" no fim do ultimo bloco de prova/resultado.md (o fim
// do arquivo), no final de linha que o arquivo ja tem. Um carimbo por rodada: o ultimo bloco ja
// carimbado com o mesmo carimbo sai 0 sem mexer; com outro, recusa (persona mexida depois do
// carimbo so se libera com rodada nova da bateria). So carimba placar liberado e
// persona que passa nas quatro travas do Passo 8 (as tres do instalar e o medir-coleta): carimbo
// nunca cobre versao que nao passou no teste. Recusa depois de achar "Liberado: sim" grava
// "Carimbo recusado: <motivo>" no fim do ultimo bloco e trava a rodada: mexer na persona e
// carimbar de novo nao passa, so rodada nova da bateria. Recusa sai no stdout, como a do instalar.
// Prova de que a bateria rodou: o ultimo bloco comeca com "## Rodada <k>" e a rodada k tem
// gabarito, perguntas e respostas nao vazios, com as perguntas iguais as que o montar-bateria
// tira do gabarito (CRLF e LF contam igual): placar escrito a mao nao carimba
const provaDaRodada = (pasta, texto) => {
  const k = /^## Rodada (\d+)\b/.exec(ultimoBloco(texto))?.[1]
  if (!k) return { motivo: 'placar sem "## Rodada <n>"', linha: 'nao carimbei: placar sem "## Rodada <n>": rode a bateria pelo referencias/bateria.md' }
  const arq = {}
  for (const nome of [`gabarito-v${k}.md`, `perguntas-v${k}.md`, `respostas-v${k}.md`]) {
    arq[nome] = ler(join(pasta, 'prova', nome))
    if (!arq[nome].trim()) return { motivo: `falta prova/${nome}`, linha: `nao carimbei: falta prova/${nome} da rodada ${k}` }
  }
  const lf = s => s.replace(/\r\n/g, '\n')
  const gab = lerGabarito(arq[`gabarito-v${k}.md`])
  if (gab.problemas.length || lf(arq[`perguntas-v${k}.md`]) !== textoPerguntas(gab.perguntas, '\n')) {
    return { motivo: `perguntas da rodada ${k} nao batem com o gabarito`, linha: `nao carimbei: perguntas da rodada ${k} nao batem com o gabarito` }
  }
  return null
}

export function carimbar(pasta) {
  const f = join(pasta, 'prova', 'resultado.md')
  if (!existsSync(f)) return { codigo: 1, linhas: [`nao carimbei: ${f} nao existe, grave o placar do teste de fidelidade antes`] }
  const texto = readFileSync(f, 'utf8')
  if (recusado(texto)) return { codigo: 1, linhas: ['nao carimbei: esta rodada teve o carimbo recusado: rode uma rodada nova da bateria'] }
  if (!liberado(texto)) return { codigo: 1, linhas: ['nao carimbei: placar sem "Liberado: sim" em prova/resultado.md'] }
  const eol = texto.includes('\r') ? '\r\n' : '\n'
  const acrescentar = linha => writeFileSync(f, texto + (texto === '' || texto.endsWith('\n') ? '' : eol) + linha + eol)
  const recusar = (motivo, linhas) => { acrescentar(`Carimbo recusado: ${motivo}`); return { codigo: 1, linhas } }
  const prova = provaDaRodada(pasta, texto)
  if (prova) return recusar(prova.motivo, [prova.linha])
  const med = medirPersona(pasta)
  if (med.codigo) return recusar('persona reprovada no medir-persona', ['nao carimbei: persona reprovada no medir-persona, volte ao Passo 8', ...med.linhas])
  const cit = conferirPasta(pasta, { persona: true })
  if (cit.codigo) return recusar('citacoes reprovadas no conferir-citacoes', ['nao carimbei: citacoes reprovadas no conferir-citacoes, volte ao Passo 8', ...cit.linhas])
  const nome = travarNome(pasta)
  if (nome.codigo) return recusar('nome real na persona', ['nao carimbei: nome real na persona (travar-nome), volte ao Passo 8', ...nome.linhas])
  const col = medirColeta(pasta)
  if (col.codigo) return recusar('coleta reprovada no medir-coleta', ['nao carimbei: coleta reprovada no medir-coleta, volte ao Passo 8', ...col.linhas])
  const c = carimboPersona(pasta)
  const velho = /^Persona:[ \t]*([^\r\n]*?)[ \t]*$/m.exec(ultimoBloco(texto))
  if (velho && velho[1] === c) return { codigo: 0, linhas: [`carimbo: ${c}`] }
  if (velho) return recusar('persona mudou depois do carimbo desta rodada', ['nao carimbei: persona mudou depois do carimbo desta rodada: rode uma rodada nova da bateria'])
  acrescentar(`Persona: ${c}`)
  return { codigo: 0, linhas: [`carimbo: ${c}`] }
}

export function faltando(dirAgentes, casa = homedir()) {
  return pastas(dirAgentes)
    .filter(a => existsSync(join(dirAgentes, a, 'SKILL.md')))
    .filter(a => { const d = destinos(a, casa); return !existsSync(join(d.skill, 'SKILL.md')) || !existsSync(d.agente) })
    .sort()
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const args = process.argv.slice(2)
  if (args[0] === '--carimbar' && args[1]) {
    const r = carimbar(args[1])
    for (const l of r.linhas) console.log(l)
    process.exit(r.codigo)
  }
  if (args[0] === '--faltando' && args[1]) {
    const f = faltando(args[1])
    console.log(f.length ? f.join('\n') : 'nenhum')
    process.exit(0)
  }
  if (!args[0] || args[0].startsWith('--')) {
    console.error('Uso: node .claude/skills/clonar-especialista/scripts/instalar.mjs <pasta-do-conselheiro> | --carimbar <pasta-do-conselheiro> | --faltando <pasta-mae>/agentes')
    process.exit(1)
  }
  const r = instalar(args[0])
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
