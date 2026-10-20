// Passo 9 da /clonar-especialista: separa a pergunta do gabarito por script, porque com as
// duas no mesmo arquivo o conselheiro abriu tudo (ensaio de 2026-10-12, 3 voltas seguidas).
// Le prova/gabarito-v<rodada>.md e grava prova/perguntas-v<rodada>.md so com as perguntas, na
// mesma numeracao. Rodada e o numero de cada vez que a bateria roda (1, 2, 3..., contando a
// anulada); nao e o "Volta:" do placar, que conta de 0 e so sobe com rodada limpa.
// Formato do gabarito (quem le as fontes de prova escreve assim):
//   ## P<n> <parte>          parte = prova, isca, constancia, constancia-b, mudanca ou negocio
//   pergunta: <texto da pergunta>
//   <linhas livres de gabarito: trecho real, posicao esperada, o que passa>
// O script copia so a linha "## P<n> <parte>" e o texto depois de "pergunta:"; nada mais.
// Recusa (sai 1, nao grava): gabarito ausente, linha antes do primeiro "## P" que nao seja o
// titulo "# ..." (linha fora de bloco), cabecalho "## " fora do formato, pergunta sem a
// linha "pergunta:", numero repetido, menos de 10 de prova, 5 iscas, 2 constancia, 1
// constancia-b ou 3 de negocio. Depois de gravar, linha livre do gabarito com 20 caracteres ou
// mais que aparece inteira nas perguntas, com o rotulo ("posicao esperada: ...") ou so o valor
// depois dele, apaga o arquivo e sai 1 (vazou gabarito). Dentro do mesmo bloco, o valor de linha
// livre com 6 caracteres ou mais na pergunta (sem maiuscula nem acento) tambem vaza.
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/montar-bateria.mjs <pasta-do-conselheiro> <rodada>
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CABECALHO = /^## P(\d+) (prova|isca|constancia|constancia-b|mudanca|negocio)[ \t]*$/
const PERGUNTA = /^pergunta:[ \t]*(.*?)[ \t]*$/
const ROTULO = /^[\p{L}\p{M}\w ]+:[ \t]*/u
const MINIMO = { prova: 10, isca: 5, constancia: 2, 'constancia-b': 1, negocio: 3 }

export function lerGabarito(texto) {
  const perguntas = []
  const problemas = []
  for (const l of String(texto ?? '').split(/\r?\n/)) {
    const t = l.trim()
    const cab = CABECALHO.exec(t)
    if (cab) { perguntas.push({ n: Number(cab[1]), parte: cab[2], cab: t, pergunta: null, gabarito: [] }); continue }
    if (t.startsWith('## ')) { problemas.push(`cabecalho fora do formato: ${t}`); continue }
    const q = perguntas.at(-1)
    // antes do primeiro "## P" so cabe o titulo "# ...": outra linha ali sumiria calada
    if (!q) { if (t && !t.startsWith('# ')) problemas.push(`linha fora de bloco, antes do primeiro ## P: ${t}`); continue }
    const p = PERGUNTA.exec(t)
    if (p && q.pergunta === null) q.pergunta = p[1]
    else if (t) q.gabarito.push(t)
  }
  const vistos = new Set()
  for (const q of perguntas) {
    if (!q.pergunta) problemas.push(`P${q.n} sem a linha "pergunta:"`)
    if (vistos.has(q.n)) problemas.push(`numero repetido: P${q.n}`)
    vistos.add(q.n)
  }
  for (const [parte, min] of Object.entries(MINIMO)) {
    const n = perguntas.filter(q => q.parte === parte).length
    if (n < min) problemas.push(`${parte}: ${n} (minimo ${min})`)
  }
  return { perguntas, problemas }
}

export function textoPerguntas(perguntas, eol) {
  const out = []
  for (const q of perguntas) out.push(q.cab, q.pergunta, '')
  return out.join(eol)
}

// a linha inteira e o valor sem o rotulo: resposta colada na pergunta sem "posicao esperada:"
const trechos = l => [l, l.replace(ROTULO, '')].filter(t => t.length >= 20)
// no mesmo bloco o corte desce pra 6: resposta curta ("posicao esperada: recusar.") entregue na
// pergunta ("Dica: recusar."), sem diferenca de maiuscula e acento
const sem = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const vazaNoBloco = q => q.gabarito.some(l => { const v = sem(l.replace(ROTULO, '')).trim(); return v.length >= 6 && sem(q.pergunta).includes(v) })

export function montarBateria(pasta, rodada) {
  const rel = `prova/perguntas-v${rodada}.md`
  const fGab = join(pasta, 'prova', `gabarito-v${rodada}.md`)
  if (!existsSync(fGab)) return { codigo: 1, linhas: [`nao montei: nao achei ${fGab}`] }
  const texto = readFileSync(fGab, 'utf8')
  const { perguntas, problemas } = lerGabarito(texto)
  if (problemas.length) return { codigo: 1, linhas: problemas.map(p => `nao montei: ${p}`) }
  const fPerg = join(pasta, rel)
  const saida = textoPerguntas(perguntas, texto.includes('\r') ? '\r\n' : '\n')
  writeFileSync(fPerg, saida)
  const gravado = readFileSync(fPerg, 'utf8')
  const vazou = perguntas.find(q => vazaNoBloco(q) || q.gabarito.some(l => trechos(l).some(t => gravado.includes(t))))
  if (vazou) {
    rmSync(fPerg, { force: true })
    return { codigo: 1, linhas: [`vazou gabarito: uma linha do gabarito da P${vazou.n} aparece nas perguntas; apaguei ${rel}, tire o gabarito da linha "pergunta:"`] }
  }
  return { codigo: 0, linhas: [`perguntas: ${perguntas.length} em ${rel}`] }
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
  const [pasta, rodada] = process.argv.slice(2)
  if (!pasta || !/^[1-9]\d*$/.test(rodada ?? '')) {
    console.log('Uso: node .claude/skills/clonar-especialista/scripts/montar-bateria.mjs <pasta-do-conselheiro> <rodada> (rodada = 1, 2, 3..., conta toda vez que a bateria roda; nao e o Volta: do placar)')
    process.exit(1)
  }
  const r = montarBateria(pasta, Number(rodada))
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
