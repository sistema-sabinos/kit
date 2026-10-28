// Confere chave do .env sem mostrar o valor. O .env fica em deny pra IA (5.28): a pessoa cola a
// chave pelo editor e a IA roda isto pra saber se colou certo. Nenhum valor sai, nem pedaco dele,
// nem o texto da linha do --em. Nao importa a lib/env.mjs do mercado-livre, que e pacote.
// Uso:
//   node .claude/skills/conectar/scripts/chave.mjs tem NOME [NOME...] [--arquivo <caminho>]
//   node .claude/skills/conectar/scripts/chave.mjs nomes [--arquivo <caminho>]
//   node .claude/skills/conectar/scripts/chave.mjs bate NOME --em <arquivo>:<linha> [--arquivo <caminho>]
//   node .claude/skills/conectar/scripts/chave.mjs bate NOME --com <outro .env> [--arquivo <caminho>]
// Na pasta-mae, <pasta>/.env olha o .env de um projeto (um nivel abaixo, so).
// Saida: 0 com tudo tem (ou bate), 1 com algum falta (ou nao bate), 2 em erro de uso ou leitura.
import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

const ARQUIVOS = ['.env', 'app/codigo/.env.local', '../.env']
const DO_PROJETO = /^[\p{L}\p{N}_][\p{L}\p{N} _.-]*\/\.env$/u
const naLista = arq => ARQUIVOS.includes(arq) || DO_PROJETO.test(arq)
const barras = s => (s || '').split(String.fromCharCode(92)).join('/')
const NOME = /^[A-Za-z_][A-Za-z0-9_]*$/
// origem do --em que ja e segredo: comparar ali nao prova nada e ainda abriria o arquivo. O
// .env.example (e .sample, .template, .<x>.example) sobe pro GitHub e e onde a faxina acha chave
// esquecida: fica liberado, no molde do FONTE_SEGREDO do barrar-perigoso (interna do fechamento)
const ORIGEM_PROIBIDA = [
  /(^|\/)\.env(?!(\.[^/.]+)*\.(example|sample|template)$)[^/]*$/i, /(^|\/)dados\/sessao\//i, /(^|\/)dados\/chrome-perfil\//i, /\.har$/i,
  /(^|\/)storage-state[^/]*\.json$/i, /(^|\/)\.auth(\/|$)/i, /(^|\/)[^/]*totp[^/]*\.json$/i,
]

function sair(codigo, recado) {
  if (recado) console.error(recado)
  process.exit(codigo)
}

function lerArgs(argv) {
  const [comando, ...resto] = argv
  const a = { comando, nomes: [], arquivo: '.env', em: null, com: null }
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--arquivo') a.arquivo = resto[++i]
    else if (resto[i] === '--em') a.em = resto[++i]
    else if (resto[i] === '--com') a.com = resto[++i]
    else a.nomes.push(resto[i])
  }
  return a
}

// devolve o texto, ou null quando o arquivo nao existe; o recado de erro nunca leva conteudo
function lerTexto(caminho) {
  try { return readFileSync(caminho, 'utf8') } catch (e) {
    if (e.code === 'ENOENT') return null
    sair(2, `nao deu pra ler ${caminho} (${e.code || 'erro'})`)
  }
}

function lerEnv(texto) {
  const valores = new Map()
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.trim()
    if (!l || l.startsWith('#')) continue
    const m = l.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) v = v.slice(1, -1)
    valores.set(m[1], v)
  }
  return valores
}

// o valor tem de aparecer inteiro: colado em qualquer outro caractere, o .env pode guardar so um
// pedaco e apagar a origem perderia o resto (comum do Codex e cetico do conserto, chat 7). Linha na
// forma NOME=valor, NOME: valor ou "chave": "valor" vale pelo valor inteiro dali (interna do
// fechamento: o token do Telegram, <id>:<hash>, cortado no : batia). No texto solto so espaco, aspas,
// crase e ponta da linha separam; ponto, virgula, ponto e virgula e barra de tabela so com espaco ou
// fim do outro lado (1|chave e chave.resto sao a mesma chave), e o valor de ?nome= ou &nome= de link
// vai ate o & ou o #, so quando a palavra tem ? ou :// (link de verdade). A forma so decide quando o
// valor dela, sem " #comentario", sem , ou ; no fim e sem aspas, e um token limpo; codigo, frase ou
// chave/valor dentro de chaves caem no texto solto (conferente da volta 1 do fechamento).
const FORMAS = [/^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=(.*)$/, /^[\p{L}_][\p{L}\p{N}_.-]*\s*:(?:\s+(.*))?$/u, /^"[^"]*"\s*:(.*)$/]
const semAspas = v => (v.length >= 2 && `"'\``.includes(v[0]) && v.at(-1) === v[0] ? v.slice(1, -1) : v)
const LIMPO = /^[^\s()[\]{}"'`]*$/
const SEPARA = /[\s"'`]/
const vazioOuEspaco = c => c === undefined || /\s/.test(c)
function inteiroNa(linha, valor) {
  for (const re of FORMAS) {
    const m = linha.trim().match(re)
    if (!m) continue
    const v = semAspas((m[1] ?? '').replace(/\s+#.*$/, '').trim().replace(/[,;]$/, ''))
    // link dentro da forma (URL=https://x/?token=...) cai no texto solto, onde o doLink le
    if (LIMPO.test(v) && !/\?|:\/\//.test(v)) return v === valor
    break
  }
  for (let i = linha.indexOf(valor); i >= 0; i = linha.indexOf(valor, i + 1)) {
    const a = linha[i - 1]
    const d = linha[i + valor.length]
    const palavra = linha.slice(0, i).split(SEPARA).pop()
    const doLink = a === '=' && /[?&][A-Za-z0-9_.-]+=$/.test(palavra) && /\?|:\/\//.test(palavra)
    // NOME= ou --opcao= como palavra inteira antes do valor (compose, docker -e, set): conferente da volta 2
    const daVariavel = a === '=' && /^(?:--?[A-Za-z][A-Za-z0-9_.-]*|[A-Z_][A-Z0-9_]*)=$/.test(palavra)
    const antesOk = a === undefined || SEPARA.test(a) || doLink || daVariavel || (a === '|' && vazioOuEspaco(linha[i - 2]))
    const depoisOk = d === undefined || SEPARA.test(d) || (doLink && '&#'.includes(d)) || (',.;|'.includes(d) && vazioOuEspaco(linha[i + valor.length + 1]))
    if (antesOk && depoisOk) return true
  }
  return false
}

function linhaDeOrigem(em) {
  const i = (em || '').lastIndexOf(':')
  const caminho = barras(i > 0 ? em.slice(0, i) : '').replace(/^(\.\/)+/, '')
  const n = Number(i > 0 ? em.slice(i + 1) : NaN)
  if (!caminho || !Number.isInteger(n) || n < 1) sair(2, 'use --em <arquivo>:<linha>, com a linha a partir de 1')
  if (isAbsolute(caminho) || /^[A-Za-z]:/.test(caminho) || caminho.split('/').includes('..')) {
    sair(2, '--em aceita so caminho dentro do projeto, sem ..')
  }
  if (ORIGEM_PROIBIDA.some(r => r.test(caminho))) sair(2, `--em recusa ${caminho}: e arquivo de segredo ou de sessao`)
  const texto = lerTexto(caminho)
  if (texto === null) sair(2, `sem ${caminho}`)
  const linhas = texto.split(/\r?\n/)
  if (n > linhas.length) sair(2, `${caminho} tem menos de ${n} linhas`)
  return linhas[n - 1]
}

const a = lerArgs(process.argv.slice(2))
const FORA = 'arquivo fora da lista: use .env, app/codigo/.env.local, ../.env ou <pasta>/.env'
const arquivo = barras(a.arquivo)
const com = a.com === null ? null : barras(a.com)
if (!naLista(arquivo)) sair(2, FORA)
if (!['tem', 'nomes', 'bate'].includes(a.comando)) sair(2, 'comando: tem, nomes ou bate')
if (a.comando === 'tem' && a.nomes.length === 0) sair(2, 'diga ao menos um NOME')
if (a.comando === 'bate' && (a.nomes.length !== 1 || !!a.em === (com !== null))) {
  sair(2, 'use bate NOME --em <arquivo>:<linha> ou bate NOME --com <outro .env>')
}
if (com !== null && (!naLista(com) || com === arquivo)) sair(2, `--com: ${FORA}, diferente do --arquivo`)
for (const n of a.nomes) if (!NOME.test(n)) sair(2, `nome invalido: ${JSON.stringify(n)}`)

// --com: o outro .env vira a "linha de origem"; vazio ou ausente la nunca bate
const outro = com === null ? null : lerEnv(lerTexto(com) ?? '').get(a.nomes[0])
const origem = a.comando !== 'bate' ? null : com === null ? linhaDeOrigem(a.em) : outro
const texto = lerTexto(arquivo)
const saida = []
if (texto === null) saida.push(`sem ${arquivo}`)
const env = lerEnv(texto ?? '')
const tem = n => !!env.get(n)
let codigo = texto === null ? 1 : 0

if (a.comando === 'nomes') {
  saida.push(...[...env.keys()].filter(tem).sort())
} else if (a.comando === 'tem') {
  for (const n of a.nomes) {
    saida.push(`${n}: ${tem(n) ? 'tem' : 'falta'}`)
    if (!tem(n)) codigo = 1
  }
} else {
  const n = a.nomes[0]
  // variavel vazia ou ausente e falta antes de comparar: o vazio entrava em laco no indexOf (final do Codex)
  const igual = () => (com === null ? inteiroNa(origem, env.get(n)) : origem === env.get(n))
  const estado = !tem(n) ? 'falta' : igual() ? 'bate' : 'nao bate'
  saida.push(`${n}: ${estado}`)
  codigo = estado === 'bate' ? 0 : 1
}
console.log(saida.join('\n'))
process.exit(codigo)
