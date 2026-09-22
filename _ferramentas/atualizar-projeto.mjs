#!/usr/bin/env node
// Motor de atualizacao de projeto SabinOS. Compara cada arquivo do projeto com a tabela
// de impressoes digitais de todas as versoes do _modelo e monta o plano: troca o que
// ninguem mexeu, pergunta o que foi mexido, nunca toca semente nem arquivo do negocio.
// Uso:
//   node atualizar-projeto.mjs plano <projeto> [--kit <kit>] [--componentes a,b|todos]
//   node atualizar-projeto.mjs aplicar <projeto> [--tambem caminho1,caminho2]
//   node atualizar-projeto.mjs conferir <projeto> [--kit <kit>]
//   node atualizar-projeto.mjs registrar <projeto> <id-da-mudanca> aplicada|recusada
//   node atualizar-projeto.mjs desfazer <projeto> [--backup <antes-...>]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, rmdirSync, renameSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

// CRLF e LF contam como o mesmo conteudo: o git do aluno troca o final de linha sozinho.
// latin1 guarda cada byte como esta, entao arquivo binario tambem passa sem estragar.
export function hashArquivo(buf) {
  const txt = Buffer.from(buf).toString('latin1').split('\r\n').join('\n')
  return createHash('sha256').update(txt, 'latin1').digest('hex').slice(0, 16)
}

export function listar(dir, base = dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) listar(p, base, acc)
    else acc.push(relative(base, p).split(sep).join('/'))
  }
  return acc
}

export function ignorado(rel, regras) {
  const ig = regras.ignorar
  return ig.pastas.some(p => rel.startsWith(p)) || ig.arquivos.includes(rel) || ig.finais.some(f => rel.endsWith(f))
}

export function componenteDe(rel, regras) {
  for (const [nome, c] of Object.entries(regras.componentes)) {
    if (c.caminhos.some(p => (p.endsWith('/') ? rel.startsWith(p) : rel === p))) return nome
  }
  return null
}

function lerJson(p, padrao) {
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : padrao
}

// 'anterior-3.0' vem antes de qualquer numero
function compararVersao(a, b) {
  const partes = v => (v.startsWith('anterior') ? [-1] : v.split('.').map(Number))
  const x = partes(a), y = partes(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function montarPlano({ kit, projeto, escolhidos = [] }) {
  const regras = lerJson(join(kit, '_ferramentas', 'componentes.json'))
  const impressoes = lerJson(join(kit, '_ferramentas', 'impressoes.json'))
  const versaoKit = readFileSync(join(kit, 'VERSAO'), 'utf8').trim()
  const recibo = lerJson(join(projeto, '.sabinos', 'instalado.json'), null)
  const modelo = join(kit, '_modelo')
  const doKit = listar(modelo).filter(rel => !ignorado(rel, regras))
  const doKitSet = new Set(doKit)
  const hashDe = rel => hashArquivo(readFileSync(join(projeto, rel)))
  // conhecido = conteudo que o kit ja entregou algum dia, ou que o recibo registrou
  const conhecido = (rel, h) => Boolean(impressoes.arquivos[rel]?.[h]) || recibo?.arquivos?.[rel] === h

  // componente instalado = pelo menos um arquivo dele (de qualquer versao) existe no projeto
  const todos = [...new Set([...Object.keys(impressoes.arquivos), ...doKit])]
  const componentes = {}
  for (const nome of Object.keys(regras.componentes)) {
    const tem = todos.some(rel => componenteDe(rel, regras) === nome && existsSync(join(projeto, rel)))
    componentes[nome] = tem ? 'instalado' : 'disponivel'
  }
  for (const nome of escolhidos === 'todos' ? Object.keys(regras.componentes) : escolhidos) {
    if (!regras.componentes[nome]) throw new Error(`componente desconhecido: ${nome}`)
    if (componentes[nome] === 'disponivel') componentes[nome] = 'escolhido'
  }
  // dependencia: o que um componente ativo exige entra junto, e o plano diz quem puxou
  const puxadoPor = {}
  for (let mudou = true; mudou;) {
    mudou = false
    for (const [nome, c] of Object.entries(regras.componentes)) {
      if (componentes[nome] === 'disponivel') continue
      for (const dep of c.depende) {
        if (componentes[dep] !== 'disponivel') continue
        componentes[dep] = 'puxado'
        puxadoPor[dep] = nome
        mudou = true
      }
    }
  }

  const itens = []
  for (const rel of doKit) {
    const comp = componenteDe(rel, regras)
    if (!comp || componentes[comp] === 'disponivel') continue
    if (!existsSync(join(projeto, rel))) { itens.push({ caminho: rel, acao: 'adicionar', componente: comp }); continue }
    const h = hashDe(rel)
    if (h === hashArquivo(readFileSync(join(modelo, rel)))) itens.push({ caminho: rel, acao: 'igual', componente: comp })
    else if (conhecido(rel, h)) itens.push({ caminho: rel, acao: 'trocar', componente: comp, de: impressoes.arquivos[rel]?.[h] ?? recibo?.versao })
    else itens.push({ caminho: rel, acao: 'perguntar', componente: comp })
  }
  // o kit entregou e depois tirou: intocado, sugere remover; mexido, virou da pessoa
  for (const rel of Object.keys(impressoes.arquivos)) {
    if (doKitSet.has(rel) || ignorado(rel, regras) || regras.mistos.includes(rel)) continue
    if (!existsSync(join(projeto, rel))) continue
    if (conhecido(rel, hashDe(rel))) itens.push({ caminho: rel, acao: 'sugerir-remover', componente: componenteDe(rel, regras) })
  }

  // sem recibo, a melhor estimativa e a versao mais nova entre os arquivos que bateram
  let versaoProjeto = recibo?.versao ?? null
  if (!recibo) {
    const rotulos = Object.keys(impressoes.arquivos)
      .filter(rel => existsSync(join(projeto, rel)))
      .map(rel => impressoes.arquivos[rel][hashDe(rel)])
      .filter(Boolean)
      .sort(compararVersao)
    versaoProjeto = rotulos.at(-1) ?? null
  }
  return {
    versaoKit, versaoProjeto, versaoEstimada: !recibo, escolhidos, componentes, puxadoPor, itens,
    mistos: regras.mistos.filter(m => existsSync(join(projeto, m))),
  }
}

const TITULOS = {
  trocar: 'Troca sem perguntar (ninguem mexeu)',
  adicionar: 'Adiciona (novo)',
  perguntar: 'Pergunta antes (foi mexido no projeto)',
  'sugerir-remover': 'Sugere remover (saiu do kit, ninguem mexeu)',
}

export function resumo(plano) {
  const v = plano.versaoProjeto ? `${plano.versaoProjeto}${plano.versaoEstimada ? ' (estimada)' : ''}` : 'desconhecida'
  const l = [`Projeto na versao ${v}, kit na ${plano.versaoKit}.`]
  for (const [acao, titulo] of Object.entries(TITULOS)) {
    const desse = plano.itens.filter(i => i.acao === acao)
    if (!desse.length) continue
    l.push('', `${titulo}: ${desse.length}`)
    for (const i of desse) l.push(`  - ${i.caminho}${i.de ? ` (era ${i.de})` : ''}`)
  }
  l.push('', `Ja em dia: ${plano.itens.filter(i => i.acao === 'igual').length}`)
  const disponiveis = Object.keys(plano.componentes).filter(n => plano.componentes[n] === 'disponivel')
  if (disponiveis.length) l.push(`Componentes que o projeto ainda nao tem: ${disponiveis.join(', ')}`)
  for (const [dep, quem] of Object.entries(plano.puxadoPor)) l.push(`Entra junto por dependencia: ${dep} (exigido por ${quem})`)
  if (plano.mistos.length) l.push(`Arquivos mistos, pra conversa: ${plano.mistos.join(', ')}`)
  return l.join('\n')
}

function limparVazias(projeto, rel) {
  for (let d = dirname(join(projeto, rel)); resolve(d) !== resolve(projeto) && readdirSync(d).length === 0; d = dirname(d)) rmdirSync(d)
}

const RECIBO = join('.sabinos', 'instalado.json')

// copia de seguranca e plano nao sobem pro GitHub pelo auto-sync; recibo e motor sobem.
// So acrescenta a linha que falta, no final de linha que o arquivo ja usa.
const LINHAS_GITIGNORE = ['antes-*/', 'desfeito-*/', 'plano.json']
export function garantirGitignore(projeto) {
  const p = join(projeto, '.sabinos', '.gitignore')
  mkdirSync(dirname(p), { recursive: true })
  const atual = existsSync(p) ? readFileSync(p, 'utf8') : ''
  const fim = atual.includes('\r\n') ? '\r\n' : '\n'
  const tem = new Set(atual.split(/\r?\n/).map(l => l.trim()))
  const faltam = LINHAS_GITIGNORE.filter(l => !tem.has(l))
  if (!faltam.length) return
  const base = atual && !atual.endsWith('\n') ? atual + fim : atual
  writeFileSync(p, base + faltam.map(l => l + fim).join(''))
}

// hora local, com segundos: AAAAMMDD-HHMMSS. Usado no nome de todo backup, pra
// a ordem por data bater com a ordem alfabetica e nunca colidir entre chamadas.
function carimboDe(agora) {
  const z = n => String(n).padStart(2, '0')
  return `${agora.getFullYear()}${z(agora.getMonth() + 1)}${z(agora.getDate())}-${z(agora.getHours())}${z(agora.getMinutes())}${z(agora.getSeconds())}`
}

export function aplicarPlano({ kit, projeto, plano, tambem = [], agora = new Date() }) {
  const porCaminho = new Map(plano.itens.map(i => [i.caminho, i]))
  for (const c of tambem) {
    const i = porCaminho.get(c)
    if (!i || !['perguntar', 'sugerir-remover'].includes(i.acao)) throw new Error(`fora do plano pra aprovar: ${c}`)
  }
  const copiar = plano.itens.filter(i => ['adicionar', 'trocar'].includes(i.acao) || (i.acao === 'perguntar' && tambem.includes(i.caminho)))
  const remover = plano.itens.filter(i => i.acao === 'sugerir-remover' && tambem.includes(i.caminho))

  const backup = `antes-${plano.versaoKit}-${carimboDe(agora)}`
  const pasta = join(projeto, '.sabinos', backup)
  if (existsSync(pasta)) throw new Error(`ja existe ${pasta}`)
  garantirGitignore(projeto)
  mkdirSync(pasta, { recursive: true })
  // misto e recibo entram sempre: a conversa mexe nos mistos depois do motor
  const guardar = [...copiar, ...remover].map(i => i.caminho).concat(plano.mistos, RECIBO.split(sep).join('/'))
  for (const rel of guardar) {
    const origem = join(projeto, rel)
    if (!existsSync(origem)) continue
    mkdirSync(dirname(join(pasta, 'arquivos', rel)), { recursive: true })
    copyFileSync(origem, join(pasta, 'arquivos', rel))
  }
  const adicionados = copiar.map(i => i.caminho).filter(rel => !existsSync(join(projeto, rel)))
  if (!existsSync(join(projeto, RECIBO))) adicionados.push(RECIBO.split(sep).join('/'))
  writeFileSync(join(pasta, 'adicionados.json'), JSON.stringify(adicionados, null, 2) + '\n')

  for (const i of copiar) {
    mkdirSync(dirname(join(projeto, i.caminho)), { recursive: true })
    copyFileSync(join(kit, '_modelo', i.caminho), join(projeto, i.caminho))
  }
  for (const i of remover) {
    rmSync(join(projeto, i.caminho))
    limparVazias(projeto, i.caminho)
  }

  // recibo: so o que agora e igual ao kit. Arquivo mexido e mantido nao entra, senao a
  // proxima atualizacao o acharia "conhecido" e trocaria sem perguntar.
  const anterior = lerJson(join(projeto, RECIBO), {})
  const arquivos = {}
  const iguais = plano.itens.filter(i => i.acao === 'igual').concat(copiar)
  for (const i of iguais) arquivos[i.caminho] = hashArquivo(readFileSync(join(projeto, i.caminho)))
  writeFileSync(join(projeto, RECIBO), JSON.stringify({
    versao: plano.versaoKit, data: agora.toISOString().slice(0, 10), arquivos, mudancas: anterior.mudancas ?? {},
  }, null, 2) + '\n')
  return { backup, copiados: copiar.map(i => i.caminho), removidos: remover.map(i => i.caminho) }
}

export function desfazer({ projeto, backup, agora = new Date() }) {
  const pasta = join(projeto, '.sabinos', backup)
  if (!existsSync(pasta)) throw new Error(`copia de seguranca nao encontrada: ${backup}`)
  const apagados = lerJson(join(pasta, 'adicionados.json'), [])
  const restaurados = listar(join(pasta, 'arquivos'))

  // antes de mexer, guarda o que esta ai agora no mesmo formato de backup, pra
  // este desfazer tambem poder ser desfeito (por exemplo, um misto editado depois
  // do aplicar seria perdido na restauracao abaixo se nao fosse salvo aqui antes)
  const seguranca = `antes-desfazer-${carimboDe(agora)}`
  const pastaSeguranca = join(projeto, '.sabinos', seguranca)
  if (existsSync(pastaSeguranca)) throw new Error(`ja existe ${pastaSeguranca}`)
  mkdirSync(pastaSeguranca, { recursive: true })
  for (const rel of [...new Set([...apagados, ...restaurados])]) {
    const origem = join(projeto, rel)
    if (!existsSync(origem)) continue
    mkdirSync(dirname(join(pastaSeguranca, 'arquivos', rel)), { recursive: true })
    copyFileSync(origem, join(pastaSeguranca, 'arquivos', rel))
  }
  const adicionadosSeguranca = restaurados.filter(rel => !existsSync(join(projeto, rel)))
  writeFileSync(join(pastaSeguranca, 'adicionados.json'), JSON.stringify(adicionadosSeguranca, null, 2) + '\n')

  for (const rel of apagados) {
    if (!existsSync(join(projeto, rel))) continue
    rmSync(join(projeto, rel))
    limparVazias(projeto, rel)
  }
  for (const rel of restaurados) {
    mkdirSync(dirname(join(projeto, rel)), { recursive: true })
    copyFileSync(join(pasta, 'arquivos', rel), join(projeto, rel))
  }

  // o nome antigo sai da lista de candidatos do "desfazer" seguinte, sem apagar nada.
  // Se o rename falhar, a restauracao ja esta feita: avisa em vez de estourar.
  let renomeado = true
  try { renameSync(pasta, join(projeto, '.sabinos', `desfeito-${backup}`)) } catch { renomeado = false }
  return { restaurados, apagados, seguranca, renomeado }
}

export function registrarMudanca({ projeto, id, estado, agora = new Date() }) {
  if (!id) throw new Error('id obrigatorio')
  if (!['aplicada', 'recusada'].includes(estado)) throw new Error(`estado invalido: ${estado}`)
  const p = join(projeto, RECIBO)
  if (!existsSync(p)) throw new Error('sem recibo: rode "aplicar" antes')
  const r = lerJson(p)
  r.mudancas = { ...(r.mudancas ?? {}), [id]: `${estado} ${agora.toISOString().slice(0, 10)}` }
  writeFileSync(p, JSON.stringify(r, null, 2) + '\n')
}

function lerArgs(argv) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i]
    else o._.push(argv[i])
  }
  return o
}

function principal(argv) {
  const a = lerArgs(argv)
  const [cmd, alvo] = a._
  if (!cmd || !alvo) throw new Error('uso: plano|aplicar|conferir|registrar|desfazer <projeto> ...')
  const projeto = resolve(alvo)
  if (!existsSync(join(projeto, '_contexto'))) throw new Error(`nao parece projeto SabinOS (sem _contexto/): ${projeto}`)
  const kit = resolve(a.kit ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const arqPlano = join(projeto, '.sabinos', 'plano.json')

  if (cmd === 'plano') {
    const escolhidos = a.componentes === 'todos' ? 'todos' : (a.componentes ? a.componentes.split(',') : [])
    const plano = montarPlano({ kit, projeto, escolhidos })
    garantirGitignore(projeto)
    writeFileSync(arqPlano, JSON.stringify({ ...plano, kit }, null, 2) + '\n')
    console.log(resumo(plano))
  } else if (cmd === 'aplicar') {
    if (!existsSync(arqPlano)) throw new Error('rode "plano" antes de "aplicar"')
    const plano = lerJson(arqPlano)
    const atual = montarPlano({ kit: plano.kit, projeto, escolhidos: plano.escolhidos })
    if (JSON.stringify(atual.itens) !== JSON.stringify(plano.itens)) throw new Error('o projeto mudou depois do plano; rode "plano" de novo')
    const r = aplicarPlano({ kit: plano.kit, projeto, plano, tambem: a.tambem ? a.tambem.split(',') : [] })
    // o motor fica no projeto pra o desfazer funcionar mesmo depois que o kit baixado sumir
    copyFileSync(fileURLToPath(import.meta.url), join(projeto, '.sabinos', 'atualizar-projeto.mjs'))
    rmSync(arqPlano)
    console.log(`Aplicado. Copiados: ${r.copiados.length}. Removidos: ${r.removidos.length}.`)
    console.log(`Copia de seguranca: .sabinos/${r.backup}`)
  } else if (cmd === 'conferir') {
    const pend = montarPlano({ kit, projeto }).itens.filter(i => ['adicionar', 'trocar'].includes(i.acao))
    if (pend.length) {
      console.log(`Ainda falta: ${pend.map(i => i.caminho).join(', ')}`)
      process.exitCode = 1
    } else console.log('Tudo em dia com o kit.')
  } else if (cmd === 'registrar') {
    registrarMudanca({ projeto, id: a._[2], estado: a._[3] })
    console.log(`Registrado: ${a._[2]} ${a._[3]}`)
  } else if (cmd === 'desfazer') {
    const dir = join(projeto, '.sabinos')
    // pela data no nome, nunca pela ordem alfabetica: "antes-3.10-..." vem antes
    // de "antes-3.9-..." em texto, mas e o mais novo. desfeito-* fica de fora, e
    // antes-desfazer-* tambem: desfazer a volta reaplicaria a atualizacao, so com --backup.
    const carimboDoNome = n => n.match(/(\d{8}-\d{6})$/)?.[1] ?? ''
    const candidatos = existsSync(dir) ? readdirSync(dir).filter(n => n.startsWith('antes-') && !n.startsWith('antes-desfazer-')) : []
    const lista = candidatos.sort((x, y) => carimboDoNome(x).localeCompare(carimboDoNome(y)))
    const backup = a.backup ?? lista.at(-1)
    if (!backup) throw new Error('nenhuma copia de seguranca de atualizacao em .sabinos/ (pra voltar um desfazer, use --backup antes-desfazer-...)')
    if (!a.backup && lista.length > 1) console.log(`Usando a mais nova (${backup}). Outras: ${lista.slice(0, -1).reverse().join(', ')}`)
    const r = desfazer({ projeto, backup })
    console.log(`Desfeito. Voltaram: ${r.restaurados.length}. Sairam: ${r.apagados.length}.`)
    console.log(`Copia de seguranca: .sabinos/${r.seguranca}`)
    if (!r.renomeado) console.log(`Restauracao feita, mas nao consegui renomear .sabinos/${backup}; apague ou renomeie a mao.`)
  } else throw new Error(`comando desconhecido: ${cmd}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { principal(process.argv.slice(2)) } catch (e) {
    console.error(`erro: ${e.message}`)
    process.exit(1)
  }
}
