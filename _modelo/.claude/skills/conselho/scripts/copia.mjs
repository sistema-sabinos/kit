// Volta garantida do /conselho: antes de a conversa mexer num arquivo do amarelo, guarda a copia
// byte a byte e anota o registro; "volta o que o conselho mudou" devolve cada arquivo como estava.
// A copia sai por script, nunca pela ferramenta de escrever, que grava LF e trocaria o final de
// linha de um .md em CRLF. O registro nasce antes da mudanca, entao a volta funciona num chat novo
// mesmo se a reuniao caiu antes da ata.
// Uso (da raiz do projeto):
//   node .claude/skills/conselho/scripts/copia.mjs antes <arquivo> [<arquivo>...] --reuniao <AAAA-MM-DD-tema>
//   node .claude/skills/conselho/scripts/copia.mjs voltar [--reuniao <AAAA-MM-DD-tema>]...
// Com mais de um --reuniao, as reunioes voltam juntas (as que se cruzaram nos mesmos arquivos).
// A reuniao se chama como a ata (data e tema), pra duas reunioes de mesmo tema em dias diferentes
// nao se misturarem. Na volta, o que esta no arquivo agora fica guardado antes, entao nada se perde.
// Sai 0 com uma linha por arquivo; 1 quando nao ha o que voltar; 2 com uso errado ou caminho fora.
import { existsSync, lstatSync, statSync, mkdirSync, readFileSync, appendFileSync, copyFileSync, rmSync, realpathSync, constants } from 'node:fs'
import { join, resolve, relative, isAbsolute, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PASTA = join('_memoria', 'conselho', 'antes')
const LISTA = join(PASTA, 'LISTA.md')
const TEMA = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/
const LF = String.fromCharCode(10)
const CABECALHO = '# Registro do /conselho' + LF + LF + 'Cada linha: quando | reuniao | arquivo | copia (ou novo) | acao' + LF + LF

const dois = n => String(n).padStart(2, '0')
const quando = d => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())} ${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`
const carimbo = d => quando(d).replace(' ', '-').split(':').join('')
const barra = rel => rel.split(sep).join('/')

function opcao(args, nome) {
  const i = args.indexOf(nome)
  return i < 0 ? undefined : args[i + 1]
}

function anotar(projeto, linha) {
  const lista = join(projeto, LISTA)
  if (!existsSync(lista)) appendFileSync(lista, CABECALHO)
  appendFileSync(lista, linha + LF)
}

function linhasDoRegistro(projeto) {
  const lista = join(projeto, LISTA)
  if (!existsSync(lista)) return []
  return readFileSync(lista, 'utf8').split(/\r?\n/).filter(l => l.startsWith('- ')).map(l => {
    const [q, tema, arquivo, copia, acao] = l.slice(2).split(' | ')
    return { q, tema, arquivo, copia, acao }
  })
}

// o caminho como o disco ve, relativo ao projeto: link, juncao, nome curto do Windows (GIT~1) e
// caixa diferente viram o nome de verdade; null quando cai fora (comum do B2 e final do Codex)
function relReal(projeto, cheio) {
  let existe = cheio
  while (!existsSync(existe)) {
    // link ou juncao pendurada (o destino ainda nao existe) passa a valer quando o destino nascer: recusa
    try { lstatSync(existe); return null } catch {}
    existe = dirname(existe)
  }
  const rel = relative(realpathSync.native(projeto), join(realpathSync.native(existe), relative(existe, cheio)))
  return rel.startsWith('..') || isAbsolute(rel) ? null : barra(rel)
}
const dentro = (projeto, cheio) => relReal(projeto, cheio) !== null
// a pasta do registro e o proprio LISTA.md, que pode ser link pra fora (final do Codex)
const registroDentro = projeto => dentro(projeto, join(projeto, PASTA)) && dentro(projeto, join(projeto, LISTA))

// .git (em qualquer pasta), .env e o proprio registro, em qualquer caixa e com ponto ou espaco no fim,
// que o Windows ignora
function proibido(rel) {
  const partes = rel.toLowerCase().split('/').map(p => p.replace(/[. ]+$/, ''))
  return partes.some(p => p === '.git' || p === '.env' || p.startsWith('.env.')) ||
    (partes[0] === '_memoria' && partes[1] === 'conselho')
}

// caminho relativo, dentro do projeto, fora do .git, do .env e do proprio registro; sem dois-pontos,
// que no Windows abre outro fluxo do mesmo arquivo (.env::$DATA e o .env), e sem nome curto do
// Windows (ARQUIV~1.MD), que com o arquivo apagado nao se liga mais ao nome de verdade
function alvo(projeto, arquivo) {
  if (!arquivo || isAbsolute(arquivo) || arquivo.includes(':') || /~[0-9]/.test(arquivo)) return null
  const cheio = resolve(projeto, arquivo)
  const rel = relative(projeto, cheio)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  const real = relReal(projeto, cheio)
  if (real === null || proibido(barra(rel)) || proibido(real)) return null
  // a chave compara o mesmo arquivo escrito de jeitos diferentes (Notas.md e notas.md viram o nome
  // que o disco guarda); sem minuscula, porque em pasta que separa a caixa sao dois arquivos
  return { cheio, rel: barra(rel), chave: real }
}

// copia byte a byte pra pasta do registro, sem nunca sobrescrever outra copia
function guardar(projeto, a, agora) {
  const base = `${carimbo(agora)}-`
  const nome = a.rel.split('/').join('--')
  for (let n = 1; n < 100; n++) {
    const rel = barra(join(PASTA, `${base}${dois(n)}-${nome}`))
    try {
      copyFileSync(a.cheio, join(projeto, rel), constants.COPYFILE_EXCL)
      return rel
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
  }
  return null
}

function antes(projeto, args, agora) {
  const tema = opcao(args, '--reuniao')
  if (!tema || !TEMA.test(tema)) return { codigo: 2, stderr: 'uso: copia.mjs antes <arquivo> [<arquivo>...] --reuniao <AAAA-MM-DD-tema>' }
  // varios arquivos numa chamada curta: no teste de 2026-11-16 o laco e a fila de comandos quebraram no terminal
  const i = args.indexOf('--reuniao')
  const nomes = args.slice(1).filter((_, j) => j + 1 !== i && j + 1 !== i + 1)
  const alvos = nomes.map(n => alvo(projeto, n))
  if (!nomes.length || alvos.some(a => !a)) return { codigo: 2, stderr: 'recusado: cada arquivo precisa ser um caminho relativo dentro do projeto (fora do .git, do .env e do registro); nada foi guardado' }
  // pasta no lugar de arquivo travaria a volta da reuniao inteira (revisao do conserto da final)
  const pasta = alvos.find(a => existsSync(a.cheio) && !statSync(a.cheio).isFile())
  if (pasta) return { codigo: 2, stderr: `recusado: ${pasta.rel} e uma pasta; passe cada arquivo dela; nada foi guardado` }
  if (!registroDentro(projeto)) return { codigo: 2, stderr: `recusado: ${barra(PASTA)} aponta pra fora do projeto; nada foi guardado` }
  mkdirSync(join(projeto, PASTA), { recursive: true })
  const saida = []
  for (const a of alvos) {
    let copia = 'novo'
    if (existsSync(a.cheio)) {
      copia = guardar(projeto, a, agora)
      if (!copia) return { codigo: 2, stderr: `recusado: copias demais de ${a.rel} no mesmo segundo` }
    }
    anotar(projeto, `- ${quando(agora)} | ${tema} | ${a.rel} | ${copia} | antes`)
    saida.push(copia === 'novo' ? `novo: ${a.rel} (a volta apaga)` : `copia: ${a.rel} -> ${copia}`)
  }
  return { codigo: 0, stdout: saida.join(LF) }
}

function voltar(projeto, args, agora) {
  // varias reunioes juntas (--reuniao A --reuniao B): reunioes que se cruzaram nos mesmos arquivos
  // so voltam limpas juntas, cada arquivo pro estado de antes da primeira delas (final do Codex)
  const pedidos = args.flatMap((a, i) => a === '--reuniao' ? [args[i + 1]] : [])
  if (pedidos.some(p => !TEMA.test(p ?? ''))) return { codigo: 2, stderr: 'uso: copia.mjs voltar [--reuniao <AAAA-MM-DD-tema>]...' }
  if (!registroDentro(projeto)) return { codigo: 2, stderr: `nao voltei nada: ${barra(PASTA)} aponta pra fora do projeto` }
  const linhas = linhasDoRegistro(projeto)
  const doAntes = linhas.filter(l => l.acao === 'antes')
  const temas = new Set(pedidos.length ? pedidos : doAntes.slice(-1).map(l => l.tema))
  if (!temas.size) return { codigo: 1, stdout: 'nada pra voltar: o registro esta vazio' }
  const voltadas = new Set(linhas.filter(l => l.acao === 'voltou').map(l => l.tema))
  for (const t of temas) {
    if (voltadas.has(t)) return { codigo: 1, stdout: `nada pra voltar: a reuniao ${t} ja voltou` }
    if (!doAntes.some(l => l.tema === t)) return { codigo: 1, stdout: `nada pra voltar: a reuniao ${t} nao esta no registro` }
  }
  const daReuniao = doAntes.filter(l => temas.has(l.tema))
  // tudo conferido antes de mexer: copia que sumiu ou registro mexido a mao nao volta nada pela metade (interna do ramo)
  const ruim = daReuniao.find(l => !alvo(projeto, l.arquivo) || (l.copia !== 'novo' &&
    (!barra(l.copia || '').startsWith(barra(PASTA) + '/') || l.copia.includes('..') || !existsSync(join(projeto, l.copia)) || !dentro(projeto, join(projeto, l.copia)))))
  if (ruim) return { codigo: 2, stderr: `nao voltei nada: falta a copia de ${ruim.arquivo} (${ruim.copia}), apagada ou o registro foi mexido` }
  // arquivo que virou pasta depois da reuniao nao tem onde voltar: recusa antes de mexer em qualquer
  // um, senao a reuniao ficaria marcada como voltada sem ele (final do Codex)
  const virou = daReuniao.find(l => l.copia !== 'novo' && existsSync(alvo(projeto, l.arquivo).cheio) && !statSync(alvo(projeto, l.arquivo).cheio).isFile())
  if (virou) return { codigo: 2, stderr: `nao voltei nada: ${virou.arquivo} virou pasta depois da reuniao; tire a pasta do caminho e peca de novo` }
  // outra reuniao que ainda nao voltou e mexeu num destes arquivos depois da primeira vez que esta mexeu
  // perderia a mudanca dela (interna do ramo); conta da primeira vez em cada arquivo, nao do fim da
  // reuniao, e pelo arquivo de verdade, nao pela grafia (final do Codex)
  const chave = l => alvo(projeto, l.arquivo)?.chave
  const quemSegura = grupo => {
    const primeira = new Map()
    for (const l of doAntes) if (grupo.has(l.tema) && !primeira.has(chave(l))) primeira.set(chave(l), linhas.indexOf(l))
    return linhas.find((l, j) => l.acao === 'antes' && !grupo.has(l.tema) && !voltadas.has(l.tema) &&
      j > (primeira.get(chave(l)) ?? Infinity))
  }
  const mais = quemSegura(temas)
  if (mais) {
    const juntas = `copia.mjs voltar ${[...temas, mais.tema].map(t => `--reuniao ${t}`).join(' ')}`
    // so oferece voltar a outra primeiro quando ela, sozinha, passa; senao as duas se cruzaram
    const sozinha = !quemSegura(new Set([mais.tema]))
    return { codigo: 1, stdout: sozinha
      ? `antes, volte a reuniao ${mais.tema}, que e mais nova e mexeu em ${mais.arquivo}; ou volte juntas: ${juntas}; nada mudou`
      : `a reuniao ${mais.tema} mexeu em ${mais.arquivo} no meio desta e as duas se cruzaram: so voltam juntas: ${juntas}; nada mudou` }
  }
  const saida = []
  const guardados = new Set()
  try {
    // do fim pro comeco: com duas copias do mesmo arquivo, a primeira (o estado de antes da reuniao) fica por ultimo
    for (const l of [...daReuniao].reverse()) {
      const a = alvo(projeto, l.arquivo)
      // a pasta que a reuniao criou no lugar de um arquivo novo fica como esta: a volta so mexe em arquivo
      if (existsSync(a.cheio) && !statSync(a.cheio).isFile()) {
        saida.push(`deixei: ${a.rel} virou pasta, a volta so mexe em arquivo`)
        continue
      }
      // o que esta no arquivo agora (com o que a pessoa mexeu depois da reuniao) fica guardado antes da volta (comum do B2)
      if (!guardados.has(a.chave) && existsSync(a.cheio)) {
        guardados.add(a.chave)
        const atual = guardar(projeto, a, agora)
        if (!atual) return { codigo: 2, stderr: `recusado: nao deu pra guardar o atual de ${a.rel}` }
        anotar(projeto, `- ${quando(agora)} | ${l.tema} | ${a.rel} | ${atual} | guardado na volta`)
        saida.push(`guardado: o que estava em ${a.rel} antes da volta ficou em ${atual}`)
      }
      if (l.copia === 'novo') {
        if (existsSync(a.cheio)) rmSync(a.cheio)
        saida.push(`apagado: ${a.rel} (a reuniao criou)`)
      } else {
        // a pasta do arquivo pode ter sumido depois da reuniao
        mkdirSync(dirname(a.cheio), { recursive: true })
        copyFileSync(join(projeto, l.copia), a.cheio)
        saida.push(`voltou: ${a.rel}`)
      }
    }
  } catch (e) {
    return { codigo: 2, stderr: `parei no meio (${e.code || e.message}): feche o arquivo que estiver aberto e peca de novo; o que ja voltou: ${saida.join('; ') || 'nada'}` }
  }
  for (const l of daReuniao) anotar(projeto, `- ${quando(agora)} | ${l.tema} | ${l.arquivo} | - | voltou`)
  return { codigo: 0, stdout: [...new Set(saida)].join(LF) }
}

export function rodar(args, { projeto = process.cwd(), agora = new Date() } = {}) {
  const raiz = resolve(projeto)
  if (args[0] === 'antes') return antes(raiz, args, agora)
  if (args[0] === 'voltar') return voltar(raiz, args, agora)
  return { codigo: 2, stderr: 'uso: copia.mjs antes <arquivo> --reuniao <tema> | copia.mjs voltar [--reuniao <tema>]' }
}

function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  const r = rodar(process.argv.slice(2))
  if (r.stdout) console.log(r.stdout)
  if (r.stderr) console.error(r.stderr)
  process.exitCode = r.codigo
}
