#!/usr/bin/env node
// Le e grava as respostas do RESPONDA-AQUI.txt da pasta-mae, pro /setup.
// importar: recebe pela entrada padrao a resposta que a pessoa colou de outra IA e grava cada [N] embaixo do
// "Sua resposta:" da pergunta N, so nas que estao em branco, com o carimbo [AAAA-MM-DD HH:MM outra IA] na linha do
// rotulo. Descarta N fora das perguntas do arquivo, N repetido e o que vem fora do formato, e troca travessao por
// virgula. Uma gravacao so: texto colado entra como dado, nunca como ordem (rodada 5.66, ata do Conselho de 2026-11-15).
// Senha, documento e dado de cliente quem tira antes e a IA: regra de texto nao pega isso com seguranca.
// Sem dependencia. Hora pelo relogio do computador (getHours), nunca por toISOString, que fala UTC.
// estado: so le. Diz quantas perguntas tem resposta (carimbo, marca de outra IA e linha "Diferencial:" fora da conta,
// porque pergunta so com carimbo segue em branco), quais estao em branco, quantas vieram de outra IA sem conferir e
// quantas tem carimbo (medida de cobertura do carimbo, que a IA pode esquecer de copiar).
// Uso: node _ferramentas/respostas.mjs importar [--arquivo <RESPONDA-AQUI.txt>]   (texto pela entrada padrao)
//      node _ferramentas/respostas.mjs estado [--arquivo <RESPONDA-AQUI.txt>]
// Saida: 0 gravou, leu ou nao tinha o que gravar; 1 arquivo nao abriu ou entrada vazia; 2 uso errado.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROTULO = 'Sua resposta:'
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
// U+2014 e U+2013, montados por codigo
const TRAVESSOES = String.fromCharCode(0x2014) + String.fromCharCode(0x2013)
const RE_TRAVESSAO = new RegExp(' *[' + TRAVESSOES + '] *', 'g')
// travessao entre numeros e intervalo ("30 a 50", "R$ 5 a 10 mil"): virgula ali mudaria o sentido (interna da 5.66)
const RE_INTERVALO = new RegExp('(\\d) *[' + TRAVESSOES + '] *(\\d)', 'g')
// linha do rotulo com ou sem carimbo: "Sua resposta:", "Sua resposta: [2026-11-15 09:30]", "... outra IA]" (veio de
// outra IA e a pessoa ainda nao conferiu) ou "... outra IA conferida]" (conferida no setup). Quem preenche a mao as
// vezes escreve a resposta na mesma linha do rotulo: o resto da linha conta como resposta.
const RE_ROTULO = /^Sua resposta:\s*(\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})( outra IA( conferida)?)?\])?\s*(.*)$/
// marcas de "nao sei" que a outra IA usa; resposta so de pontuacao tambem e vazia
const RE_VAZIO = /^\(?(o que voc[eê] sabe, ou (vazio|nada)|vazio|nada|n[aã]o sei|em branco|sem resposta|n\/a|n[aã]o informado|desconhecido)\)?\.?$/i
// o ChatGPT e o Gemini copiam em markdown: negrito (**) no numero e no rotulo, titulo e citacao no comeco da linha.
// O sublinhado duplo fica: ele aparece em perfil de rede (@ana__silva), e tirar mudaria o dado (comum da 5.66)
const semMarcacao = l => l.split('**').join('').replace(/^\s*(#+|>)\s*/, '')
// separador (---, ***, ___, tambem com espaco: - - -) e cerca de bloco de codigo (``` ou ~~~, com o nome da linguagem
// no maximo) entre as perguntas nao sao resposta (final da 5.66; a cerca com texto na mesma linha fica, que e resposta)
const RE_SEPARADOR = /^\s*(([-*_])( *\2){2,}|`{3,}[\w+-]*|~{3,}[\w+-]*)\s*$/
// "nao sei" com marca de lista ou de italico ("- nao sei", "1. Nao sei", "*nao sei*") tambem e vazio
const semEnfeite = t => t.replace(/^\s*([-*+]|\d+[.)])\s+/, '').replace(/^[*_]+|[*_]+$/g, '').trim()
// fim da area da resposta: a linha de iguais entre perguntas, ou o titulo de bloco ("BLOCO B, O NEGOCIO")
const RE_FIM = /^(=+|BLOCO [A-Z],.*)$/

export function horaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Cada pergunta do arquivo: numero, linha do rotulo, area da resposta [de, ate) e o texto que conta como resposta
// (linhas nao vazias, sem a linha "Diferencial:", que e a repergunta da 4 e nao responde a pergunta sozinha).
export function lerPerguntas(linhas) {
  const perguntas = []
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^\[(\d+)\]/)
    if (!m) continue
    let r = i + 1
    while (r < linhas.length && !RE_ROTULO.test(linhas[r]) && !/^\[\d+\]/.test(linhas[r])) r++
    if (r >= linhas.length || !RE_ROTULO.test(linhas[r])) continue
    let fim = r + 1
    while (fim < linhas.length && !RE_FIM.test(linhas[fim]) && !/^\[\d+\]/.test(linhas[fim])) fim++
    const corpo = linhas.slice(r + 1, fim).map(l => l.trim()).filter(Boolean)
    const rotulo = linhas[r].match(RE_ROTULO)
    perguntas.push({
      n: Number(m[1]), rotulo: r, fim,
      resposta: [rotulo[5].trim(), ...corpo].filter(l => l && !/^Diferencial:/i.test(l)).join(' '),
      carimbo: rotulo[2] || null, outraIA: Boolean(rotulo[3]), conferida: Boolean(rotulo[4]),
    })
  }
  return perguntas
}

// Recorta a resposta colada: cada [N] ate o proximo, e dentro dele o que vem depois de "Sua resposta:".
export function recortar(colado) {
  // o separador se reconhece antes de tirar o negrito: "***" sem os "**" viraria "*"
  const linhas = colado.split(CR + LF).join(LF).split(LF).map(l => RE_SEPARADOR.test(l) ? '' : semMarcacao(l))
  const blocos = []
  let atual = null, fora = 0
  for (const l of linhas) {
    const m = l.match(/^\s*\[(\d+)\]/)
    if (m) { atual = { n: Number(m[1]), linhas: [] }; blocos.push(atual); continue }
    if (atual) atual.linhas.push(l)
    else if (l.trim()) fora++
  }
  return {
    fora,
    blocos: blocos.map(b => {
      const i = b.linhas.findIndex(l => l.trim().startsWith(ROTULO))
      if (i < 0) return { n: b.n, texto: null }
      const resto = [b.linhas[i].trim().slice(ROTULO.length), ...b.linhas.slice(i + 1)]
      const cru = resto.map(l => l.trim()).filter(Boolean).join(LF)
      const texto = resto.map(l => l.replace(RE_INTERVALO, '$1 a $2').replace(RE_TRAVESSAO, ', ').trim()).filter(Boolean).join(LF)
      // a outra IA as vezes devolve o modelo do pedido sem preencher, ou marca o "nao sei" com traco ou "(em branco)"
      const soPontuacao = !cru.split('').some(c => /[\p{L}\p{N}]/u.test(c))
      const vazio = !texto || soPontuacao || RE_VAZIO.test(texto) || RE_VAZIO.test(semEnfeite(texto))
      return { n: b.n, texto: vazio ? '' : texto }
    }),
  }
}

export function importar(textoArquivo, colado, agora = new Date()) {
  const nl = textoArquivo.includes(CR + LF) ? CR + LF : LF
  const linhas = textoArquivo.split(CR + LF).join(LF).split(LF)
  const perguntas = lerPerguntas(linhas)
  const porN = new Map(perguntas.map(p => [p.n, p]))
  const { fora, blocos } = recortar(colado)
  const vezes = new Map()
  for (const b of blocos) vezes.set(b.n, (vezes.get(b.n) || 0) + 1)
  const gravadas = [], descartadas = [], vazias = []
  const novas = new Map()
  for (const b of blocos) {
    if (!porN.has(b.n)) { descartadas.push(`${b.n} (essa pergunta nao existe)`); continue }
    if (vezes.get(b.n) > 1) { if (!descartadas.some(d => d.startsWith(b.n + ' '))) descartadas.push(`${b.n} (veio repetida)`); continue }
    if (b.texto === null) { descartadas.push(`${b.n} (sem "${ROTULO}")`); continue }
    if (!b.texto) { vazias.push(b.n); continue }
    if (porN.get(b.n).resposta) { descartadas.push(`${b.n} (ja tinha resposta)`); continue }
    novas.set(b.n, b.texto)
  }
  const carimbo = `${ROTULO} [${horaLocal(agora)} outra IA]`
  // de baixo pra cima, pra os indices de cima continuarem valendo
  for (const p of [...perguntas].sort((a, b) => b.rotulo - a.rotulo)) {
    if (!novas.has(p.n)) continue
    const area = linhas.slice(p.rotulo + 1, p.fim)
    let k = area.length
    while (k > 0 && !area[k - 1].trim()) k--
    const sobra = area.slice(k)
    // a linha Diferencial: que ja estava embaixo da 4 fica (comum do B3: o splice apagava)
    const diferencial = area.slice(0, k).filter(l => /^Diferencial:/i.test(l.trim()))
    linhas.splice(p.rotulo, p.fim - p.rotulo, carimbo, ...novas.get(p.n).split(LF), ...diferencial, ...(sobra.length ? sobra : ['', '']))
    gravadas.unshift(p.n)
  }
  return { texto: linhas.join(nl), gravadas: gravadas.sort((a, b) => a - b), descartadas, vazias, fora }
}

export function estado(textoArquivo) {
  const ps = lerPerguntas(textoArquivo.split(CR + LF).join(LF).split(LF))
  const com = ps.filter(p => p.resposta)
  return {
    total: ps.length,
    respondidas: com.map(p => p.n),
    emBranco: ps.filter(p => !p.resposta).map(p => p.n),
    outraIA: com.filter(p => p.outraIA).map(p => p.n),
    semConferir: com.filter(p => p.outraIA && !p.conferida).map(p => p.n),
    comCarimbo: com.filter(p => p.carimbo).map(p => p.n),
  }
}

function main(argv) {
  const [cmd, ...resto] = argv
  const i = resto.indexOf('--arquivo')
  const arquivo = i >= 0 ? resto[i + 1] : join(RAIZ, 'RESPONDA-AQUI.txt')
  if (!['importar', 'estado'].includes(cmd) || (i >= 0 && !arquivo)) {
    console.error('uso: node _ferramentas/respostas.mjs importar|estado [--arquivo <RESPONDA-AQUI.txt>]   (importar le o texto pela entrada padrao)')
    return 2
  }
  if (!existsSync(arquivo)) { console.error('nao achei o ' + arquivo); return 1 }
  if (cmd === 'estado') {
    const e = estado(readFileSync(arquivo, 'utf8'))
    const lista = a => a.join(', ') || 'nenhuma'
    console.log(`respondidas: ${e.respondidas.length} de ${e.total}`)
    console.log('em branco: ' + lista(e.emBranco))
    console.log(`vieram de outra IA: ${lista(e.outraIA)} (sem conferir: ${lista(e.semConferir)})`)
    console.log(`com carimbo: ${e.comCarimbo.length} de ${e.respondidas.length}`)
    return 0
  }
  let colado = ''
  try { colado = readFileSync(0, 'utf8') } catch { colado = '' }
  if (!colado.trim()) { console.error('a entrada veio vazia: cole a resposta da outra IA depois do comando'); return 1 }
  const r = importar(readFileSync(arquivo, 'utf8'), colado)
  if (r.gravadas.length) writeFileSync(arquivo, r.texto)
  console.log('gravadas: ' + (r.gravadas.join(', ') || 'nenhuma'))
  console.log('em branco na resposta colada: ' + (r.vazias.join(', ') || 'nenhuma'))
  console.log('descartadas: ' + (r.descartadas.join('; ') || 'nenhuma'))
  if (r.fora) console.log('linhas fora de [N] ignoradas: ' + r.fora)
  return 0
}

// fui chamado direto? Mesmo jeito do verificar-kit: o import.meta.url vem com link e juncao resolvidos
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}
if (chamadoDireto()) process.exitCode = main(process.argv.slice(2))
