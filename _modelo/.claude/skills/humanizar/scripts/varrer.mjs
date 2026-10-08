#!/usr/bin/env node
// Varredor da /humanizar: aponta, por categoria, o que soa robo num texto, e trava a reescrita
// conferindo que nenhum preco, numero, prazo ou medida sumiu, apareceu ou mudou de lugar.
// Sem nota e sem taxa de mudanca: so lista. Detectar sozinho nunca autoriza reescrever.
// Uso, da raiz do projeto:
//   node .claude/skills/humanizar/scripts/varrer.mjs texto.txt
//   node .claude/skills/humanizar/scripts/varrer.mjs --antes original.txt --depois reescrito.txt
// Com um arquivo: uma linha por ocorrencia, "ID linha: trecho", agrupada por categoria, com a
// contagem por gravidade no fim. A regra de cada ID mora em REGRAS, e o catalogo da skill
// (referencias/padroes.md) usa os mesmos IDs.
// Com --antes e --depois: compara a sequencia de fatos dos dois textos, na ordem, e lista o que
// sumiu, apareceu ou mudou de lugar. Fato: dinheiro (R$, US$, euro ou "reais", com mil e
// milhao), percentual, parcela, prazo, medida e numero solto, com algarismo ou por extenso
// ("dois dias" e "2 dias" sao o mesmo fato). Todo fato de numero e todo ordinal ("terceira", "1o")
// levam a palavra que vem logo depois na mesma oracao ("R$ 29,90 mensais", "40 cm de largura") e o
// limite, periodo ou unidade que vem antes ("acima de R$ 99", "plano mensal", "o metro sai a").
// Qualificador fechado (mais, menos, acima, sem, com, antes, depois, >, < e outros) ate 3 palavras
// antes ou depois do fato, na mesma oracao, tambem entra; numero se compara como texto de algarismo,
// nunca por Number(), entao boleto e CEP com zero a esquerda nao se confundem.
// Na duvida reprova: reprovar a mais numa reescrita legitima e aviso, passar com fato mudado nunca.
// Limite conhecido, fora da trava: sentido que muda sem numero ("Pague 2, leve 3" contra "Leve 2,
// pague 3", "Compre um, leve dois", "Cor azul R$ 50; cor rosa R$ 60" com as cores trocadas,
// "Mensalidade" contra "Anuidade", "Envio" contra "Entrega") e meia-risca como sinal de menos,
// que o M-1 ja aponta. Isso fica pra leitura humana.
// Arquivo com BOM de UTF-16 (LE ou BE) e lido certo; sem BOM, UTF-8. Acima de 5000 fatos somados
// nos dois lados, com diferenca, sai 2 com "texto grande demais pra trava".
// Saida: 0 limpo (ou fatos iguais na mesma ordem); 1 achou ocorrencia (ou os fatos mudaram);
// 2 erro de uso, arquivo que nao deu pra ler ou biblioteca de texto ausente. Nas esteiras o 1
// e aviso, nunca bloqueio.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// import dinamico: sem a skill ler-avaliacoes a linha de comando sai 2 com o motivo, nunca 1
let dobrar = null
let erroTexto = null
try {
  ({ dobrar } = await import('../../ler-avaliacoes/scripts/lib/texto.mjs'))
} catch (e) {
  erroTexto = `nao achei .claude/skills/ler-avaliacoes/scripts/lib/texto.mjs (${e.code || e.message}): a /humanizar usa a biblioteca de texto da skill ler-avaliacoes, confira se ela esta no projeto`
}

const LF = String.fromCharCode(10)
const BOM = String.fromCharCode(0xfeff)
const NBSP = String.fromCharCode(0xa0)
const NNBSP = String.fromCharCode(0x202f)
const EURO = String.fromCharCode(0x20ac)
const SUP2 = String.fromCharCode(178)
const SUP3 = String.fromCharCode(179)
const GRAU = String.fromCharCode(176)
const ORDINAL = String.fromCharCode(186)
const MENOS = String.fromCharCode(0x2212)
// fracao de um caractere so (U+00BC a U+00BE, U+2150 a U+215E e U+2189): o valor sai do NFKC,
// que escreve "1", a barra de fracao U+2044 e "8"
const FRACAO = {}
for (const cp of [0xbc, 0xbd, 0xbe, 0x2189, ...Array.from({ length: 15 }, (_, k) => 0x2150 + k)]) {
  const c = String.fromCharCode(cp)
  const [a, b] = c.normalize('NFKC').split(String.fromCharCode(0x2044)).map(Number)
  if (b) FRACAO[c] = a / b
}
// largura zero, soft hyphen e controle bidi saem; o ZWJ (0x200d) fica, senao quebra emoji composto
const INVISIVEIS = [0x200b, 0x200c, 0x2060, 0xfeff, 0xad, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069]
const RE_INVISIVEL = new RegExp('[' + INVISIVEIS.map(c => String.fromCodePoint(c)).join('') + ']', 'g')
const RE_TRAVESSAO = new RegExp('[' + String.fromCharCode(0x2014) + String.fromCharCode(0x2013) + ']', 'g')
// U+202F entre algarismos com 3 depois e separador de milhar ("1 234") e sai antes de virar espaco;
// o NBSP e o espaco comum nunca juntam, senao "R$ 5 300 ml" vira R$ 5300
const RE_MILHAR_DURO = new RegExp('(?<=[0-9])' + NNBSP + '(?=[0-9]{3}(?![0-9]))', 'g')
// todo espaco que nao quebra linha vira espaco comum: TAB, NBSP, U+202F, espaco fino e a faixa
// U+2000 a U+200A, senao "R$" + espaco fino + "100" perde a moeda
const ESPACOS = [0x9, 0xb, 0xc, 0xa0, 0x1680, 0x202f, 0x205f, 0x3000]
for (let c = 0x2000; c <= 0x200a; c++) ESPACOS.push(c)
const RE_ESPACO_DURO = new RegExp('[' + ESPACOS.map(c => String.fromCharCode(c)).join('') + ']', 'g')
// digito estilizado do Instagram (negrito, duplo, sem serifa, monoespacado: U+1D7CE a U+1D7FF)
// vira algarismo; o NFC nao dobra e o \d nao casa
const DIGITO_MAT = 0x1d7ce
const RE_DIGITO_MAT = new RegExp('[' + String.fromCodePoint(DIGITO_MAT) + '-' + String.fromCodePoint(0x1d7ff) + ']', 'gu')

// BOM, quebra de linha, invisivel, digito estilizado, espaco duro e depois NFC: o invisivel sai
// antes pra nao separar a letra do acento solto na composicao
export function normalizar(texto) {
  let t = String(texto ?? '')
  if (t.startsWith(BOM)) t = t.slice(1)
  t = t.replace(/\r\n?/g, LF)
  t = t.replace(RE_INVISIVEL, '')
  t = t.replace(RE_DIGITO_MAT, c => String((c.codePointAt(0) - DIGITO_MAT) % 10))
  t = t.replace(RE_MILHAR_DURO, '').replace(RE_ESPACO_DURO, ' ')
  return t.normalize('NFC')
}

// minuscula caractere por caractere, pra posicao bater com a linha original
function baixar(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const m = s[i].toLowerCase()
    out += m.length === 1 ? m : s[i]
  }
  return out
}

// a dobra troca caractere por caractere, entao a posicao no dobrado vale no original
function preparar(texto) {
  if (erroTexto) throw new Error(erroTexto)
  const linhas = normalizar(texto).split(LF)
  return { linhas, dobradas: linhas.map(dobrar), baixas: linhas.map(baixar) }
}

const recorte = (linha, ini, fim) => {
  const a = Math.max(0, ini - 30)
  const b = Math.min(linha.length, fim + 30)
  return (a > 0 ? '...' : '') + linha.slice(a, b).trim() + (b < linha.length ? '...' : '')
}

// paragrafo numa linha so, com cada sequencia de espaco em branco (quebra de linha, espaco
// duplo) virando um espaco; mapa[k] guarda a linha e a coluna do caractere k
function colapsar(doc, idxs) {
  const b = { linhas: '', dobradas: '', baixas: '', mapa: [] }
  let branco = false
  idxs.forEach((i, n) => {
    const l = doc.linhas[i]
    const ultima = n === idxs.length - 1
    for (let k = 0; k < l.length + (ultima ? 0 : 1); k++) {
      if (k === l.length || /\s/.test(l[k])) {
        if (branco || !b.mapa.length) continue
        branco = true
        b.linhas += ' '
        b.dobradas += ' '
        b.baixas += ' '
      } else {
        branco = false
        b.linhas += l[k]
        b.dobradas += doc.dobradas[i][k]
        b.baixas += doc.baixas[i][k]
      }
      b.mapa.push([i, k])
    }
  })
  return b
}

// frase fixa: casa no paragrafo colapsado e cada casamento vira uma ocorrencia na linha onde
// o trecho comeca
function porLinha(campo, ...rxs) {
  return doc => {
    const out = []
    for (const idxs of paragrafos(doc)) {
      const b = colapsar(doc, idxs)
      const vistos = new Set()
      for (const rx of rxs) {
        for (const m of b[campo].matchAll(rx)) {
          let p = m.index
          if (vistos.has(p)) continue
          vistos.add(p)
          // o casamento que abre no espaco (o INI do R-1) comeca de verdade no caractere seguinte
          if (b.linhas[p] === ' ' && p + 1 < b.mapa.length) p++
          const [i, col] = b.mapa[p]
          out.push({ linha: i + 1, ini: col, trecho: recorte(b.linhas, p, m.index + m[0].length) })
        }
      }
    }
    return out
  }
}

// frases com linha e paragrafo; linha em branco fecha o paragrafo
function frases(doc) {
  const out = []
  let par = 0
  doc.linhas.forEach((l, i) => {
    if (!l.trim()) { par++; return }
    let pos = 0
    for (const pedaco of l.split(/(?<=[.!?][*_)"']*)\s+/)) {
      const ini = l.indexOf(pedaco, pos)
      pos = ini + pedaco.length
      if (!pedaco.trim()) continue
      out.push({ linha: i + 1, par, texto: pedaco, dobrado: doc.dobradas[i].slice(ini, ini + pedaco.length) })
    }
  })
  return out
}

function paragrafos(doc) {
  const out = []
  let atual = null
  doc.dobradas.forEach((l, i) => {
    if (!l.trim()) { atual = null; return }
    if (!atual) { atual = []; out.push(atual) }
    atual.push(i)
  })
  return out
}

// conta casamentos no texto inteiro; com o minimo, uma ocorrencia na linha do primeiro
function contaNoTexto(rx, minimo, nome) {
  return doc => {
    const achados = []
    doc.dobradas.forEach((l, i) => { for (const m of l.matchAll(rx)) achados.push({ i, m }) })
    if (achados.length < minimo) return []
    const { i, m } = achados[0]
    const ini = m.index + m[0].length - m[1].length
    return [{ linha: i + 1, ini, trecho: `${achados.length} ${nome}, a primeira: "${doc.linhas[i].slice(ini, ini + m[1].length)}"` }]
  }
}

const RX_TRINCA = /(?:^|[^a-z0-9])([a-z0-9]+(?: [a-z0-9]+)?, [a-z0-9]+(?: [a-z0-9]+)? e [a-z0-9]+)(?![a-z0-9])/g
const RX_PASSIVA = /(?:^|[^a-z0-9])((?:foi|foram|sera|serao) (?:[a-z]+mente )?[a-z]+(?:ado|ada|ados|adas|ido|ida|idos|idas))(?![a-z0-9])/g
const RX_CONECTIVO = /\b(?:alem disso|ademais|tambem|outrossim|dessa forma|por fim)\b/g
const RX_NEGRITO = /\*\*[^*]+\*\*|__[^_]+__/

function conectivos(doc) {
  const out = []
  for (const par of paragrafos(doc)) {
    const achados = []
    for (const i of par) for (const m of doc.dobradas[i].matchAll(RX_CONECTIVO)) achados.push({ i, m })
    if (achados.length < 3) continue
    const { i, m } = achados[0]
    out.push({ linha: i + 1, ini: m.index, trecho: `${achados.length} conectivos no paragrafo: ${achados.map(a => a.m[0]).join(', ')}` })
  }
  return out
}

function negritos(doc) {
  const porPar = new Map()
  for (const f of frases(doc)) {
    if (!RX_NEGRITO.test(f.texto)) continue
    if (!porPar.has(f.par)) porPar.set(f.par, [])
    porPar.get(f.par).push(f)
  }
  const out = []
  for (const lista of porPar.values()) {
    if (lista.length < 2) continue
    out.push({ linha: lista[0].linha, ini: 0, trecho: `negrito em ${lista.length} frases do mesmo bloco: ${lista.map(f => f.texto).join(' ').slice(0, 100)}` })
  }
  return out
}

function aberturas(doc) {
  const out = []
  let seq = []
  const fechar = () => {
    if (seq.length >= 3) out.push({ linha: seq[0].linha, ini: 0, trecho: `${seq.length} frases seguidas abrindo com "${seq[0].palavra}"` })
    seq = []
  }
  for (const f of frases(doc)) {
    const palavra = (f.dobrado.match(/[a-z0-9]+/) || [''])[0]
    if (!palavra || (seq.length && (seq[0].palavra !== palavra || seq[0].par !== f.par))) fechar()
    if (palavra) seq.push({ palavra, par: f.par, linha: f.linha })
  }
  fechar()
  return out
}

// R-1 roda no texto em minuscula com acento, porque sem o acento o "e" de ligacao vira "e" de ser
const INI = `(?:^|[\\s"'(*])`
const NAO_E = 'n[aã]o (?:é|e|são|sao) (?:s[oó] |apenas |somente )?'
const R1_VIRGULA = new RegExp(INI + NAO_E + '[^,.;:!?\\n]{1,60}?[,;:] (?:(?:mas )?(?:é|são)|(?:mas|e) sim)(?=[\\s,]|$)', 'g')
const R1_TRATA = new RegExp(INI + 'n[aã]o se trata d[eoa]s? [^,.;:!?\\n]{1,60}?[,;:] (?:mas|e sim)(?=\\s)', 'g')
const R1_PONTO = new RegExp(INI + NAO_E + '[^.!?\\n]{1,60}?[.!] (?:é|são)(?=[\\s,]|$)', 'g')
// "é Y, não X": X curto fechando a frase; verbo logo depois do "não" e negacao comum
const VERBO = '(?:é|e|são|sao|tem|têm|vai|vão|precisa|pode|deve|faz|serve|esquenta|solta|desbota|encolhe|risca|quebra|machuca|aperta|amassa|enferruja|pesa|ocupa|perde|deixa|fica)'
const R1_INVERSO = new RegExp(INI + '(?:é|são) [^,.;:!?\\n]{1,40}?, n[aã]o (?!' + VERBO + '(?=[\\s.,!?]|$))[^\\s,.;:!?]+(?: [^\\s,.;:!?]+){0,2}(?=[.!?]|$)', 'g')

export const CATEGORIAS = {
  V: 'vocabulario oco',
  C: 'conversa de robo',
  P: 'prova e promessa inventada',
  A: 'abertura e arremate de redacao',
  R: 'ritmo e retorica',
  L: 'ligacao',
  M: 'marca visual',
  F: 'forma pt-BR',
}

// conta: true marca regra de frequencia, que so existe aqui (nunca no preferencias.md)
export const REGRAS = [
  { id: 'V-1', cat: 'V', grav: 'S2', achar: porLinha('dobradas', /\bsolucao ideal (?:para|pra) quem (?:busca|procura|quer|precisa)\b/g) },
  { id: 'V-3', cat: 'V', grav: 'S2', achar: porLinha('dobradas', /\b(?:eleva|elevar|potencializa|potencializar|transforma|transformar) (?:a )?sua (?:experiencia|rotina)\b/g) },
  { id: 'P-4', cat: 'P', grav: 'S2', achar: porLinha('dobradas', /\b(?:o|a|os|as) (?:melhor|melhores|mais vendid[oa]s?) (?:do|da) (?:mercado|brasil|pais|mundo)\b/g) },
  { id: 'C-1', cat: 'C', grav: 'S1', achar: porLinha('dobradas', /\bespero ter ajudado\b|\bqualquer duvida,? (?:e so|so) chamar\b|\b(?:qualquer duvida,? )?(?:fico|ficamos|estou|estamos) a (?:sua )?(?:inteira )?disposicao\b/g) },
  { id: 'C-2', cat: 'C', grav: 'S1', achar: porLinha('dobradas', /\b(?:otima|excelente) pergunta\b|\bque bom que voce perguntou\b/g) },
  { id: 'C-3', cat: 'C', grav: 'S1', achar: porLinha('dobradas', /\bclaro[!,]? aqui esta\b|\bsegue abaixo\b/g) },
  { id: 'C-5', cat: 'C', grav: 'S1', achar: porLinha('dobradas', /\bcom base nas informacoes (?:disponiveis|fornecidas)\b|\bate onde (?:eu )?sei\b/g) },
  { id: 'A-1', cat: 'A', grav: 'S1', achar: porLinha('dobradas', /\bno mundo (?:atual|de hoje)\b|\bnos dias (?:de hoje|atuais)\b|\b(?:em um|num) mundo cada vez mais\b/g) },
  { id: 'A-2', cat: 'A', grav: 'S2', achar: porLinha('dobradas', /\bvoce ja se perguntou\b|\bimagine um mundo\b/g) },
  { id: 'A-4', cat: 'A', grav: 'S3', achar: porLinha('dobradas', /\bconfira a seguir\b|\btudo (?:o )?que voce precisa saber\b/g) },
  { id: 'R-1', cat: 'R', grav: 'S1', achar: porLinha('baixas', R1_VIRGULA, R1_PONTO, R1_INVERSO, R1_TRATA) },
  { id: 'R-2', cat: 'R', grav: 'S2', conta: true, achar: contaNoTexto(RX_TRINCA, 3, 'trincas') },
  { id: 'R-3', cat: 'R', grav: 'S2', achar: porLinha('dobradas', /\bo resultado\?|\be o melhor(?: de tudo)?[:?]/g) },
  { id: 'R-4', cat: 'R', grav: 'S3', conta: true, achar: aberturas },
  { id: 'L-1', cat: 'L', grav: 'S2', achar: porLinha('dobradas', /\bvale (?:ressaltar|destacar)\b|\bcabe (?:destacar|ressaltar)\b|\be importante (?:salientar|destacar|ressaltar)\b/g) },
  { id: 'L-2', cat: 'L', grav: 'S2', conta: true, achar: conectivos },
  { id: 'L-3', cat: 'L', grav: 'S3', achar: porLinha('dobradas', /\b(?:outrossim|destarte|ademais)\b/g) },
  { id: 'M-1', cat: 'M', grav: 'S1', achar: porLinha('linhas', RE_TRAVESSAO) },
  { id: 'M-2', cat: 'M', grav: 'S2', conta: true, achar: negritos },
  { id: 'F-1', cat: 'F', grav: 'S1', achar: porLinha('dobradas', /\b(?:vou|vamos|vai|vao) estar [a-z]+ndo\b/g) },
  { id: 'F-3', cat: 'F', grav: 'S2', achar: porLinha('dobradas', /\bconta com\b|\bdispoe de\b/g) },
  { id: 'F-4', cat: 'F', grav: 'S2', achar: porLinha('dobradas', /\bvenho,? por meio desta\b|\bno que tange\b/g) },
  { id: 'F-5', cat: 'F', grav: 'S3', conta: true, achar: contaNoTexto(RX_PASSIVA, 3, 'passivas') },
]

const ORDEM_CAT = Object.keys(CATEGORIAS)

export function ocorrencias(texto) {
  const doc = preparar(texto)
  const out = []
  for (const r of REGRAS) {
    for (const o of r.achar(doc)) out.push({ id: r.id, cat: r.cat, grav: r.grav, linha: o.linha, ini: o.ini, trecho: o.trecho })
  }
  return out.sort((a, b) => ORDEM_CAT.indexOf(a.cat) - ORDEM_CAT.indexOf(b.cat) || a.linha - b.linha || a.ini - b.ini)
}

// ---------- fatos ----------

// "1.500" e "1500" iguais; "1,5" e "1.5" iguais. Sai como TEXTO de algarismo, nunca por Number(),
// que arredonda boleto de 47 digitos e come o zero do CEP. Zero a esquerda so cai em numero comum
// de dois digitos ("05" vira "5"); com separador, com 3 digitos ou mais ("0800") ou com cara de
// codigo ("01310-100") fica
function numeroCanonico(s, codigo) {
  let t = s
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(t)) t = t.replace(/\./g, '')
  t = t.replace(',', '.')
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t)
  if (!m) return s
  const dec = (m[2] || '').replace(/0+$/, '')
  const int = codigo || /[.,]/.test(s) || m[1].length >= 3 ? m[1] : m[1].replace(/^0+(?=\d)/, '')
  return dec ? `${int}.${dec}` : int
}

// valor canonico de cada unidade: singular, plural e abreviacao viram a mesma coisa
const PRAZO = { 'dias uteis': 'dias uteis', 'dia util': 'dias uteis', dias: 'dias', dia: 'dias', horas: 'horas', hora: 'horas',
  h: 'horas', semanas: 'semanas', semana: 'semanas', meses: 'meses', mes: 'meses', anos: 'anos', ano: 'anos',
  minutos: 'minutos', minuto: 'minutos', min: 'minutos', segundos: 'segundos', segundo: 'segundos', seg: 'segundos',
  quinzenas: 'quinzena', quinzena: 'quinzena', bimestres: 'bimestre', bimestre: 'bimestre', trimestres: 'trimestre',
  trimestre: 'trimestre', semestres: 'semestre', semestre: 'semestre', decadas: 'decada', decada: 'decada' }
const MEDIDA = { polegadas: 'polegada', polegada: 'polegada', pol: 'polegada', quilometros: 'km', quilometro: 'km', km: 'km',
  metros: 'm', metro: 'm', m: 'm', centimetros: 'cm', centimetro: 'cm', cm: 'cm', milimetros: 'mm', milimetro: 'mm', mm: 'mm',
  litros: 'l', litro: 'l', l: 'l', mililitros: 'ml', mililitro: 'ml', ml: 'ml', quilogramas: 'kg', quilograma: 'kg',
  quilos: 'kg', quilo: 'kg', kg: 'kg', gramas: 'g', grama: 'g', g: 'g', miligramas: 'mg', miligrama: 'mg', mg: 'mg',
  mah: 'mah', watts: 'w', watt: 'w', w: 'w', volts: 'v', volt: 'v', v: 'v', kwh: 'kwh', kw: 'kw', btus: 'btu', btu: 'btu',
  kb: 'kb', mb: 'mb', gb: 'gb', tb: 'tb', megabytes: 'mb', megabyte: 'mb', gigabytes: 'gb', gigabyte: 'gb',
  terabytes: 'tb', terabyte: 'tb', hz: 'hz', khz: 'khz', mhz: 'mhz', ghz: 'ghz',
  [GRAU + 'c']: 'celsius', [ORDINAL + 'c']: 'celsius', 'graus celsius': 'celsius', [GRAU + 'f']: 'fahrenheit',
  [ORDINAL + 'f']: 'fahrenheit', 'graus fahrenheit': 'fahrenheit', graus: 'graus', grau: 'graus',
  pares: 'par', par: 'par', unidades: 'unidade', unidade: 'unidade', und: 'unidade', un: 'unidade', pecas: 'peca', peca: 'peca' }
const COMPRIMENTO = new Set(['m', 'cm', 'mm', 'km'])
const MOEDA_DEPOIS = { reais: '', real: '', dolares: 'usd ', dolar: 'usd ', euros: 'eur ', euro: 'eur ' }
// moeda antes do numero, com simbolo ou codigo ISO ("USD 100")
const MOEDA_ANTES = { 'r$': '', brl: '', 'us$': 'usd ', usd: 'usd ', [EURO]: 'eur ', eur: 'eur ', gbp: 'gbp ' }
const MULTIPLICADOR = { mil: 1e3, milhao: 1e6, milhoes: 1e6, bilhao: 1e9, bilhoes: 1e9, duzia: 12, duzias: 12,
  dezena: 10, dezenas: 10, centena: 100, centenas: 100 }
// abreviacao so multiplica colada no algarismo ("10k", "R$ 2 mi"); sozinha nao e numero
const ABREVIACAO = { k: 1e3, mi: 1e6, bi: 1e9 }
// o que pode vir depois da barra ou do "por" num fato: "R$ 10/mes", "R$ 10 por kg"
const POR_UNIDADE = { ...PRAZO, ...MEDIDA }
// proporcao sem algarismo: "rende o dobro"
const PROPORCAO = { dobro: '2x', triplo: '3x', quadruplo: '4x', quintuplo: '5x', metade: '0.5x' }
const POR_EXTENSO = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70,
  oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900, meia: 0.5, meio: 0.5 }
// sozinhas sao artigo ("um design"), pedaco de "por cento" ou peca de roupa e lugar ("meia",
// "no meio"): so viram fato com unidade, moeda ou multiplicador ("meia duzia"). "zero" tambem
// ("do zero", "zero estresse"), e ainda vale como valor de cobranca ("taxa zero", "juros zero")
const FRACAS = new Set(['um', 'uma', 'cento', 'meia', 'meio', 'zero'])
const RX_ZERO_VALOR = /(?:^|[^a-z])(?:taxas?|juros?|frete|tarifas?|anuidade|entrada|custo|mensalidade) $/
const DIA_SEMANA = 'domingo|segunda|terca|quarta|quinta|sexta|sabado'
// abreviacao do dia so conta em serie com outro dia ("seg a sex", "sab/dom"), senao "vai ter" vira prazo
const DIA_ABREV = 'seg|ter|qua|qui|sex|sab|dom'
const DIA_QQ = `(?:${DIA_SEMANA}|${DIA_ABREV})(?:-feira)?\\.?`
const LIGA_DIA = '(?: a | ate | e |-|/|, )'
const MESES = 'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro'
// lista FECHADA de qualificador que muda o sentido do fato ate 3 palavras antes ou depois, na mesma
// oracao; o sinal de maior-ou-igual e menor-ou-igual entram montados por codigo
const QUALIF_JANELA = new Set(['mais', 'menos', 'acima', 'abaixo', 'antes', 'depois', 'sem', 'com', 'ate', 'desde',
  'inferior', 'superior', 'minimo', 'maximo', 'cima', 'baixo', '>', '<', String.fromCharCode(8805), String.fromCharCode(8804)])
const RX_TOKEN = new RegExp('[a-z]+|[<>' + String.fromCharCode(8805) + String.fromCharCode(8804) + ']', 'g')
// palavra seguinte ao numero: artigo e preposicao curta se pulam; conjuncao fecha sem palavra
const PULA = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'no', 'na', 'em', 'por', 'ao'])
const FECHA = new Set(['e', 'ou', 'mas', 'que'])
const ORDINAL_EXTENSO = { primeir: 1, segund: 2, terceir: 3, quart: 4, quint: 5, sext: 6, setim: 7, oitav: 8, non: 9, decim: 10 }
// o que vem antes do fato na mesma oracao e muda o sentido sem mudar o numero: limite ("acima de
// R$ 99"), periodo ("plano mensal por R$ 30") e forma de pagar; unidade antes ("o metro sai a
// R$ 39,90") entra pela tabela de unidade. O resto (verbo, sujeito) fica fora, senao "Possui 2
// portas" contra "Tem 2 portas" reprovaria
const QUALIFICA = new Set(['acima', 'abaixo', 'minimo', 'minima', 'maximo', 'maxima', 'ate', 'partir', 'desde', 'mais',
  'menos', 'apenas', 'so', 'somente', 'cada', 'mensal', 'mensais', 'anual', 'anuais', 'semanal', 'semanais', 'diario',
  'diaria', 'diarios', 'diarias', 'quinzenal', 'bimestral', 'trimestral', 'semestral', 'vista', 'entrada', 'parcelado',
  'parcelada'])
// fracao por extenso depois de numero por extenso: "um terco", "dois quintos"
const FRACAO_EXTENSO = { terco: 3, tercos: 3, quarto: 4, quartos: 4, quinto: 5, quintos: 5, decimo: 10, decimos: 10 }

const alternativas = obj => Object.keys(obj).sort((a, b) => b.length - a.length).join('|')
const FRACOES = Object.keys(FRACAO).join('')
// sinal (hifen, U+2212 ou +), algarismos e fracao de um caractere colada ("1" + meio)
const RX_ALGARISMO = new RegExp(`(?<![\\d.,])(?:([-+${MENOS}])?(\\d+(?:[.,]\\d+)*)([${FRACOES}])?|([${FRACOES}]))`, 'g')
const RX_PALAVRA_NUM = new RegExp(`(?<![a-z0-9])(?:${alternativas({ ...POR_EXTENSO, ...MULTIPLICADOR })})(?![a-z0-9])`, 'g')
const RX_MOEDA_ANTES = new RegExp(`(us\\$|r\\$|${EURO}|(?<![a-z])(?:usd|eur|brl|gbp)) *$`)
// abreviacao de periodo colada no fato: "2% a.m.", "a.a.", "a.d."
const RX_PERIODO_ABREV = / (a\.[mad])\.?(?![a-z0-9])/y
const RX_FRACAO_EXTENSO = new RegExp(` (${alternativas(FRACAO_EXTENSO)})(?![a-z])`, 'y')
// ordinal colado no algarismo: "1o", "1a", e com o indicador ordinal masculino ou feminino
const RX_ORDINAL_COLADO = new RegExp(`(?:[oa]s?|[${ORDINAL}${String.fromCharCode(0xaa)}])(?![a-z0-9])`, 'y')
const RX_MULTIPLICADOR = new RegExp(` ?(${alternativas({ ...MULTIPLICADOR, ...ABREVIACAO })})(?![a-z0-9])`, 'y')
const RX_MOEDA_DEPOIS = new RegExp(` ?(${alternativas(MOEDA_DEPOIS)})(?![a-z])`, 'y')
const RX_PERCENTUAL = / ?(?:%|por cento(?![a-z]))/y
const RX_PARCELA = /(?: ?x(?![a-z0-9])| vezes(?![a-z]))/y
const RX_POR = new RegExp(`(?: ?/ ?| (?:por|ao|a) )(${alternativas(POR_UNIDADE)})(?![a-z])`, 'y')
const RX_E_MEIO = / e mei[oa](?![a-z])/y
const RX_PROPORCAO = new RegExp(`(?<![a-z])(?:${alternativas(PROPORCAO)})(?![a-z])`, 'g')
const RX_PRAZO = new RegExp(` ?(${alternativas(PRAZO)})(?![a-z0-9])`, 'y')
const RX_MEDIDA = new RegExp(` ?(${alternativas(MEDIDA)})(?![a-z])`, 'y')
const RX_EXPOENTE = new RegExp(`(?:([${SUP2}2])|([${SUP3}3])| (quadrad|cubic)[oa]s?(?![a-z]))(?![0-9])`, 'y')
const RX_PRAZO_PALAVRA = new RegExp(`\\b(?:depois de amanha|amanha|hoje|mesmo dia|na hora|imediatamente|imediat[oa]|proxima semana|fim de semana|quinzena|bimestre|trimestre|semestre|decada|${MESES}|(?:${DIA_SEMANA})(?:-feira)?|(?<=${DIA_QQ}${LIGA_DIA})(?:${DIA_ABREV})|(?:${DIA_ABREV})(?=\\.?${LIGA_DIA}${DIA_QQ}(?![a-z]))|(?:(?:este|esta|esse|essa|neste|nesta|nesse|nessa|deste|desta|desse|dessa|proximo|proxima|ultimo|ultima|todo|toda|cada) )?(?:mes|meses|semanas?|anos?|dias? (?:util|uteis)))(?![a-z])`, 'g')
const RX_PALAVRA_SEGUINTE = / ([a-z]+)(?![a-z0-9$])/y
const RX_ORDINAL = new RegExp(`(?<![a-z])(${Object.keys(ORDINAL_EXTENSO).join('|')})[oa]s?(?![a-z]|-feira)`, 'g')

const formatar = n => String(Math.round(n * 1e6) / 1e6)

function casaEm(rx, l, pos) {
  rx.lastIndex = pos
  return rx.exec(l)
}

// lugar que a proxima parcela pode ocupar: depois de "duzentos" cabe ate 99, depois de "vinte" ate 9
const lugarDe = v => (v >= 100 ? 100 : v >= 20 ? 10 : 0)

// numero por extenso: "vinte e quatro" vira 24, "dois mil e quinhentos" vira 2500; quando a
// palavra seguinte nao continua o numero ("duas e tres"), fecha um e abre outro
function porExtenso(l) {
  const out = []
  let cur = null
  const fechar = () => {
    if (cur) out.push({ ini: cur.ini, fim: cur.fim, n: cur.total + cur.grupo, fraco: cur.palavras === 1 && FRACAS.has(cur.primeira), extenso: true })
    cur = null
  }
  for (const m of l.matchAll(RX_PALAVRA_NUM)) {
    const w = m[0]
    const mult = MULTIPLICADOR[w]
    const v = POR_EXTENSO[w]
    const vao = cur ? l.slice(cur.fim, m.index) : null
    // "dois e meio": o meio so continua depois do "e" e de numero inteiro
    const meio = v === 0.5 && vao === ' e ' && Number.isInteger(cur.total + cur.grupo)
    const continua = cur && (vao === ' ' || vao === ' e ') &&
      (mult ? cur.ultMult === null || cur.ultMult > mult : v < cur.lugar || meio)
    if (!continua) {
      fechar()
      cur = { ini: m.index, fim: m.index, total: 0, grupo: 0, ultMult: null, lugar: Infinity, palavras: 0, primeira: w }
    }
    if (mult) {
      cur.total += (cur.grupo || 1) * mult
      cur.grupo = 0
      cur.ultMult = mult
      cur.lugar = 1000
    } else {
      cur.grupo += v
      cur.lugar = lugarDe(v)
    }
    cur.palavras++
    cur.fim = m.index + w.length
  }
  fechar()
  return out
}

function porAlgarismo(l) {
  const out = []
  for (const m of l.matchAll(RX_ALGARISMO)) {
    let ini = m.index
    const fim = m.index + m[0].length
    // hifen ou + colado em letra ou algarismo e ligacao ("10-20", "sku-20", "10+20"), nunca sinal
    const sinal = m[1] && !(ini > 0 && /[a-z0-9]/.test(l[ini - 1]))
    if (m[1] && !sinal) ini++
    const mais = sinal && m[1] === '+'
    const menos = sinal && !mais
    const fracao = FRACAO[m[3] || m[4]] || 0
    const codigo = l[fim] === '-' && /[0-9]/.test(l[fim + 1] || '')
    const canon = m[2] === undefined ? '0' : numeroCanonico(m[2], codigo)
    let n = Number(canon) + fracao
    if (menos) n = -n
    // texto exato do numero; com fracao colada vale a conta
    const txt = fracao ? null : (menos ? '-' : '') + canon
    out.push({ ini, fim, n, txt, mais, fraco: false, extenso: false })
  }
  return out
}

// tipa o fato e depois junta o que vem atras da barra ou do "por" ("R$ 10/mes")
function classificar(l, c, o) {
  const f = tipar(l, c, o)
  if (!f || f.tipo === 'numero' && !Number.isFinite(c.n)) return f
  const p = casaEm(RX_POR, l, f.fim)
  if (p) {
    f.valor += '/' + POR_UNIDADE[p[1]]
    f.fim += p[0].length
  }
  return f
}

// olha o que vem antes (moeda) e depois (multiplicador, moeda, %, parcela, prazo, medida);
// o e o mesmo texto na caixa original, pra unidade que depende de maiuscula (ampere)
function tipar(l, c, o) {
  let { ini, fim, n } = c
  // texto exato do algarismo enquanto nenhuma conta (mil, e meio) mexeu no numero; o + colado fica
  let exato = c.txt ?? null
  const num = () => (c.mais ? '+' : '') + (exato ?? formatar(n))
  if (!Number.isFinite(n)) return { tipo: 'numero', valor: num(), ini, fim }
  let m
  if (c.extenso && (m = casaEm(RX_FRACAO_EXTENSO, l, fim))) return { tipo: 'numero', valor: formatar(n / FRACAO_EXTENSO[m[1]]), ini, fim: fim + m[0].length }
  // so o fim da linha antes do numero: casar no comeco inteiro a cada numero fica quadratico
  const antes = l.slice(Math.max(0, ini - 24), ini).match(RX_MOEDA_ANTES)
  if (!c.extenso) {
    const mm = casaEm(RX_MULTIPLICADOR, l, fim)
    if (mm) { n *= MULTIPLICADOR[mm[1]] || ABREVIACAO[mm[1]]; fim += mm[0].length; exato = null }
  }
  if (antes) return { tipo: 'dinheiro', valor: MOEDA_ANTES[antes[1]] + num(), ini: ini - antes[0].length, fim }
  if ((m = casaEm(RX_MOEDA_DEPOIS, l, fim))) return { tipo: 'dinheiro', valor: MOEDA_DEPOIS[m[1]] + num(), ini, fim: fim + m[0].length }
  if ((m = casaEm(RX_PERCENTUAL, l, fim))) return { tipo: 'percentual', valor: num() + '%', ini, fim: fim + m[0].length }
  if ((m = casaEm(RX_PARCELA, l, fim))) return { tipo: 'parcela', valor: num() + 'x', ini, fim: fim + m[0].length }
  if (!c.extenso && Number.isInteger(n) && n > 0 && (m = casaEm(RX_ORDINAL_COLADO, l, fim))) return { tipo: 'ordinal', valor: num(), ini, fim: fim + m[0].length }
  // "uma hora e meia", "2 litros e meio"
  const eMeio = () => {
    const e = casaEm(RX_E_MEIO, l, fim)
    if (e) { n += 0.5; fim += e[0].length; exato = null }
  }
  if ((m = casaEm(RX_PRAZO, l, fim))) {
    fim += m[0].length
    eMeio()
    return { tipo: 'prazo', valor: `${num()} ${PRAZO[m[1]]}`, ini, fim }
  }
  if ((m = casaEm(RX_AMPERE, o, fim))) return { tipo: 'medida', valor: `${num()} ${AMPERE[m[1]]}`, ini, fim: fim + m[0].length }
  if ((m = casaEm(RX_MEDIDA, l, fim))) {
    let unidade = MEDIDA[m[1]] + caixa(o.slice(fim + m[0].length - m[1].length, fim + m[0].length))
    fim += m[0].length
    const e = COMPRIMENTO.has(unidade) && casaEm(RX_EXPOENTE, l, fim)
    if (e) {
      unidade += (e[1] || e[3] === 'quadrad') ? SUP2 : SUP3
      fim += e[0].length
    }
    eMeio()
    return { tipo: 'medida', valor: `${num()} ${unidade}`, ini, fim }
  }
  if (c.fraco && !(n === 0 && RX_ZERO_VALOR.test(l.slice(Math.max(0, ini - 16), ini)))) return null
  return { tipo: 'numero', valor: num(), ini, fim }
}

// palavra logo depois do fato, na mesma oracao: "R$ 29,90 mensais", "1 cv", "R$ 39,90 o metro";
// pula artigo e preposicao curta, e pontuacao, algarismo ou conjuncao fecham sem palavra
function palavraSeguinte(l, pos, o) {
  let m = casaEm(RX_PERIODO_ABREV, l, pos)
  if (m) return { palavra: m[1], fim: pos + m[0].length }
  while ((m = casaEm(RX_PALAVRA_SEGUINTE, l, pos))) {
    if (FECHA.has(m[1])) break
    if (!PULA.has(m[1])) return { palavra: m[1] + caixa(o.slice(pos + 1, pos + m[0].length)), fim: pos + m[0].length }
    pos += m[0].length
  }
  return { palavra: '', fim: null }
}

// a caixa so conta onde muda o sentido, o resto compara sem ela ("KG" e "kg", "HDMI" e "hdmi"):
// bit contra byte ("Gb" e bit; "GB", "kB" e "gb" minusculo, o uso comum, sao byte) e mili contra
// mega no m antes de W, V, A, Hz e Wh ("mW" e mili, "MW" e mega; "mhz" minusculo e o uso comum, mega)
const caixa = s => {
  const b = s.toLowerCase()
  if (/^[kmgt]b$/.test(b)) return /^[KMGT]b$/.test(s) ? '[bit]' : ''
  if (/^m(?:w|v|a|hz|wh)$/.test(b)) return s[0] === 'm' && s !== 'mhz' ? '[mili]' : ''
  return ''
}

const ehUnidade = w => Object.hasOwn(POR_UNIDADE, w)

// qualificador e unidade entre o fato anterior (ou a pontuacao) e este: "acima", "mensal", "m"
function palavrasAntes(trecho) {
  return (trecho.match(/[a-z]+/g) || []).filter(w => QUALIFICA.has(w) || ehUnidade(w)).map(w => (ehUnidade(w) ? POR_UNIDADE[w] : w)).join('+')
}

// qualificador da lista fechada nos tokens da janela: "acima", ">", "mais"
// o "com" de "conta com" e "vem com" e verbo, nao qualificador: trocar "conta com" por "tem" e o
// conserto do F-3 e nao pode reprovar a trava
const VERBO_COM = new Set(['conta', 'contam', 'vem', 'vêm', 'acompanha'])
// desde: onde a janela comeca; o verbo antes do "com" pode estar fora dela ("conta com mais de 3")
const qualificadores = (tokens, desde = 0) => tokens.filter((w, i) => i >= desde && QUALIF_JANELA.has(w) && !(w === 'com' && VERBO_COM.has(tokens[i - 1]))).join('+')

// como o fato aparece na diferenca: com o qualificador, a unidade e a palavra junto, senao
// "acima de R$ 50" contra "abaixo de R$ 50" sairia como duas linhas iguais
function rotulo(f) {
  const junto = [f.antes, ...f.qualif.split('|'), f.palavra].filter(Boolean).join(' ').split('+').join(' ')
  return junto ? `${f.texto} (junto de: ${junto})` : f.texto
}

// NFKC caractere por caractere, so na extracao de fatos: digito de largura cheia vira algarismo.
// O que o NFKC transforma em mais de um caractere (fracao, ligadura) fica como esta, pra posicao
// bater com a linha mostrada; a fracao entra pela tabela FRACAO. Indicador ordinal e expoente ficam,
// porque as tabelas de unidade ja os leem
const RX_NAO_ASCII = new RegExp('[' + String.fromCharCode(0x80) + '-' + String.fromCharCode(0xffff) + ']', 'g')
const MANTER = new Set([ORDINAL, String.fromCharCode(0xaa), SUP2, SUP3])
const compativel = l => l.replace(RX_NAO_ASCII, c => {
  if (MANTER.has(c)) return c
  const k = c.normalize('NFKC').toLowerCase()
  return k.length === 1 ? k : c
})

// marcador de enfase do markdown (**, __, * e _ colados numa palavra) sai so na extracao de fatos,
// senao "R$ **50**" perde a moeda; o que o marcador ocupava some do texto e cada caractere que fica
// guarda a coluna original. Asterisco solto entre espacos ou dentro de palavra ("2*3", "snake_case") fica
const RX_ENFASE = /(?<=^|[\s(\[{"'.,;:!?])[*_]{1,3}(?=\S)|(?<=\S)[*_]{1,3}(?=$|[\s)\]}"'.,;:!?%])/g
function semEnfase(doc) {
  const base = { linhas: [], dobradas: [], baixas: [], colunas: [] }
  doc.dobradas.forEach((d, i) => {
    const fora = new Uint8Array(d.length)
    for (const m of d.matchAll(RX_ENFASE)) fora.fill(1, m.index, m.index + m[0].length)
    const cols = []
    for (let k = 0; k < d.length; k++) if (!fora[k]) cols.push(k)
    base.colunas.push(cols)
    for (const campo of ['linhas', 'dobradas', 'baixas']) base[campo].push(cols.map(k => doc[campo][i][k]).join(''))
  })
  return base
}

// ampere so pela caixa original, colado ou com um espaco: "2 A", "500mA", "7 Ah", "5000 mAh";
// o "a" minusculo continua artigo
const RX_AMPERE = /(?: ?)(mAh|Ah|mA|A)(?![\p{L}\p{N}])/uy
const AMPERE = { A: 'a', mA: 'ma', Ah: 'ah', mAh: 'mah' }
// dia da semana seguido de substantivo e ordinal ("segunda compra", "terca parte"); seguido de
// "feira", preposicao, conjuncao ou pontuacao continua dia
const DIA_ORDINAL = { segunda: 2, terca: 3, quarta: 4, quinta: 5, sexta: 6 }
const DEPOIS_DO_DIA = new Set(['feira', 'de', 'a', 'as', 'ao', 'pela', 'pelo', 'e', 'ou', 'ate', 'das'])
const RX_PALAVRA_DEPOIS = / ([a-z]+)/y

export function fatos(texto) {
  const doc = preparar(texto)
  const base = semEnfase(doc)
  const out = []
  // um paragrafo por vez (linhas seguidas sem linha em branco), com o espaco em branco colapsado:
  // "2" + quebra de linha + "kg" e "2  kg" viram "2 kg"; mapa leva de volta a linha e a coluna
  for (const idxs of paragrafos(base)) {
    const b = colapsar(base, idxs)
    const l = compativel(b.dobradas)
    const o = b.linhas
    // mapa de ocupacao em vez de lista: linha com 200 mil numeros nao fica quadratica
    const usados = new Uint8Array(l.length + 1)
    const daLinha = []
    const livre = (a, b) => usados.subarray(a, b).indexOf(1) < 0
    // numero e ordinal levam a palavra seguinte; prazo por palavra e proporcao nao
    const guardar = (tipo, valor, ini, fim, comPalavra) => {
      usados.fill(1, ini, fim)
      const p = comPalavra ? palavraSeguinte(l, fim, o) : { palavra: '', fim: null }
      daLinha.push({ tipo, valor, palavra: p.palavra, ini, fim: p.fim ?? fim })
    }
    const candidatos = [...porAlgarismo(l), ...porExtenso(l)].sort((a, b) => a.ini - b.ini)
    for (const c of candidatos) {
      if (!livre(c.ini, c.fim)) continue
      const f = classificar(l, c, o)
      if (!f || !livre(f.ini, f.fim)) continue
      guardar(f.tipo, f.valor, f.ini, f.fim, true)
    }
    for (const m of l.matchAll(RX_PRAZO_PALAVRA)) {
      const fim = m.index + m[0].length
      if (!livre(m.index, fim)) continue
      const seguinte = Object.hasOwn(DIA_ORDINAL, m[0]) && casaEm(RX_PALAVRA_DEPOIS, l, fim)
      if (seguinte && !DEPOIS_DO_DIA.has(seguinte[1])) guardar('ordinal', String(DIA_ORDINAL[m[0]]), m.index, fim, true)
      else guardar('prazo', m[0].replace(/-feira$/, '').replace(/^imediat.*/, 'imediato'), m.index, fim, false)
    }
    // ordinal por extenso e fato sozinho tambem: "na terceira compra" contra "na decima compra"
    for (const m of l.matchAll(RX_ORDINAL)) {
      const fim = m.index + m[0].length
      if (livre(m.index, fim)) guardar('ordinal', String(ORDINAL_EXTENSO[m[1]]), m.index, fim, true)
    }
    for (const m of l.matchAll(RX_PROPORCAO)) {
      const fim = m.index + m[0].length
      if (livre(m.index, fim)) guardar('proporcao', PROPORCAO[m[0]], m.index, fim, false)
    }
    daLinha.sort((a, b) => a.ini - b.ini)
    let anterior = 0
    daLinha.forEach((f, k) => {
      let corte = f.ini
      while (corte > anterior && !/[,.;:!?]/.test(l[corte - 1])) corte--
      const trecho = l.slice(corte, f.ini)
      anterior = Math.max(anterior, f.fim)
      // janela depois: ate a pontuacao ou o proximo fato, o que vier primeiro
      const limite = k + 1 < daLinha.length ? daLinha[k + 1].ini : l.length
      let ate = f.fim
      while (ate < limite && !/[,.;:!?]/.test(l[ate])) ate++
      const depois = l.slice(f.fim, ate).match(RX_TOKEN) || []
      const tk = trecho.match(RX_TOKEN) || []
      const qualif = qualificadores(tk, tk.length - 3) + '|' + qualificadores(depois.slice(0, 3))
      // "as 14h" e horario, "em 14h" e prazo
      const tipo = f.tipo === 'prazo' && f.valor.endsWith(' horas') && /(?:^|[^a-z])d?as $/.test(trecho) ? 'horario' : f.tipo
      const [i, col] = b.mapa[f.ini]
      out.push({ tipo, valor: f.valor, antes: palavrasAntes(trecho), palavra: f.palavra, qualif, texto: o.slice(f.ini, f.fim), linha: i + 1, ini: base.colunas[i][col] })
    })
  }
  // paragrafo a paragrafo e, dentro dele, na ordem do texto: a ordem de saida ja e a do texto
  return out
}

// o que vem antes e a palavra seguinte entram na chave: "acima de R$ 99" e "abaixo de R$ 99",
// "R$ 29,90 mensais" e "R$ 29,90 anuais" sao fatos diferentes
const chave = f => `${f.tipo} ${f.valor}|${f.antes}|${f.palavra}|${f.qualif}`

// teto de fatos somados nos dois lados: acima disso, com diferenca, sai 2 antes de comparar
const TETO_FATOS = 5000

// teto da tabela da subsequencia (celulas de 4 bytes): acima disso sai 2 com mensagem, nunca estoura a memoria
const TETO_TABELA = 4e7

// maior subsequencia comum: o que fica fora dela de um lado e do outro mudou. O comeco e o fim
// iguais saem antes, entao tabela grande quase igual roda sem montar a tabela inteira
function foraDaComum(a, b) {
  let ini = 0
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++
  let fa = a.length
  let fb = b.length
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) { fa--; fb-- }
  const n = fa - ini
  const m = fb - ini
  const w = m + 1
  if ((n + 1) * w > TETO_TABELA) throw new Error(`texto grande demais pra trava: ${n} fatos contra ${m} fora do trecho igual. Compare em partes menores`)
  const t = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = a[ini + i] === b[ini + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
    }
  }
  const sobraA = []
  const sobraB = []
  const pares = []
  for (let k = 0; k < ini; k++) pares.push([k, k])
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[ini + i] === b[ini + j]) pares.push([ini + i++, ini + j++])
    else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) sobraA.push(ini + i++)
    else sobraB.push(ini + j++)
  }
  while (i < n) sobraA.push(ini + i++)
  while (j < m) sobraB.push(ini + j++)
  for (let k = 0; fa + k < a.length; k++) pares.push([fa + k, fb + k])
  return { sobraA, sobraB, pares }
}

export function compararFatos(antes, depois) {
  const A = fatos(antes)
  const B = fatos(depois)
  const ka = A.map(chave)
  const kb = B.map(chave)
  // sequencia identica nao tem o que comparar, entao tabela grande igual continua saindo 0
  const identicos = ka.length === kb.length && ka.every((k, n) => k === kb[n])
  if (!identicos && A.length + B.length > TETO_FATOS) {
    throw new Error(`texto grande demais pra trava: ${A.length} fatos antes e ${B.length} depois, teto de ${TETO_FATOS} somados. Compare em partes menores`)
  }
  const { sobraA, sobraB, pares } = foraDaComum(ka, kb)
  const livres = [...sobraB]
  const mudou = new Map()
  for (const ia of sobraA) {
    const k = livres.findIndex(jb => chave(B[jb]) === chave(A[ia]))
    if (k >= 0) mudou.set(ia, livres.splice(k, 1)[0])
  }
  // quem ficou na subsequencia mas foi cruzado por um fato que mudou de lugar tambem mudou:
  // na troca de dois precos, os dois lados aparecem
  for (const [ia, jb] of [...mudou]) {
    for (const [pa, pb] of pares) if ((pa > ia) !== (pb > jb)) mudou.set(pa, pb)
  }
  const diferencas = []
  for (const ia of [...new Set([...sobraA, ...mudou.keys()])].sort((x, y) => x - y)) {
    if (mudou.has(ia)) diferencas.push({ tipo: 'mudou de lugar', fato: A[ia], linhaAntes: A[ia].linha, linhaDepois: B[mudou.get(ia)].linha })
    else diferencas.push({ tipo: 'sumiu', fato: A[ia], linhaAntes: A[ia].linha })
  }
  for (const jb of livres) diferencas.push({ tipo: 'apareceu', fato: B[jb], linhaDepois: B[jb].linha })
  return { iguais: diferencas.length === 0, antes: A, depois: B, diferencas }
}

// ---------- saida ----------

export function mostrarOcorrencias(oc) {
  if (!oc.length) return 'Limpo: nenhum padrao do varredor apareceu. A leitura do catalogo continua valendo, porque ela pega o que regra nao pega.'
  const out = []
  for (const cat of ORDEM_CAT) {
    const daCat = oc.filter(o => o.cat === cat)
    if (!daCat.length) continue
    if (out.length) out.push('')
    out.push(`${cat} ${CATEGORIAS[cat]} (${daCat.length})`)
    for (const o of daCat) out.push(`${o.id} ${o.linha}: ${o.trecho}`)
  }
  const g = s => oc.filter(o => o.grav === s).length
  out.push('', `${oc.length} ${oc.length === 1 ? 'ocorrencia' : 'ocorrencias'} (S1 ${g('S1')}, S2 ${g('S2')}, S3 ${g('S3')}). Aviso pra revisar: detectar sozinho nunca autoriza reescrever.`)
  return out.join(LF)
}

export function mostrarComparacao(r) {
  if (r.iguais) {
    if (!r.antes.length) return 'Trava antes/depois: nenhum preco, numero, prazo ou medida nos dois textos, nada pra conferir.'
    return `Trava antes/depois: os ${r.antes.length} fatos (preco, numero, prazo e medida) batem, na mesma ordem.`
  }
  const out = [`Trava antes/depois: ${r.diferencas.length} ${r.diferencas.length === 1 ? 'diferenca' : 'diferencas'}. Confira cada uma antes de entregar.`]
  for (const d of r.diferencas) {
    if (d.tipo === 'sumiu') out.push(`sumiu: ${rotulo(d.fato)} (antes, linha ${d.linhaAntes})`)
    else if (d.tipo === 'apareceu') out.push(`apareceu: ${rotulo(d.fato)} (depois, linha ${d.linhaDepois})`)
    else out.push(`mudou de lugar: ${rotulo(d.fato)} (antes linha ${d.linhaAntes}, depois linha ${d.linhaDepois})`)
  }
  return out.join(LF)
}

const USO = 'uso: node .claude/skills/humanizar/scripts/varrer.mjs texto.txt, ou --antes original.txt --depois reescrito.txt'

function lerArgv(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) { a._.push(k); continue }
    const nome = k.slice(2)
    if (nome !== 'antes' && nome !== 'depois') throw new Error(`opcao desconhecida ${k}. ${USO}`)
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${k} precisa do caminho do arquivo. ${USO}`)
    a[nome] = v
    i++
  }
  return a
}

// BOM de UTF-16 decide a leitura: FF FE little endian, FE FF big endian; sem ele, UTF-8
function decodificar(b) {
  if (b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le')
  if (b[0] === 0xfe && b[1] === 0xff) return Buffer.from(b.subarray(2, b.length - (b.length % 2))).swap16().toString('utf16le')
  return b.toString('utf8')
}

function ler(cwd, caminho) {
  let b
  try {
    b = readFileSync(resolve(cwd, caminho))
  } catch (e) {
    throw new Error(`nao consegui ler ${caminho} (${e.code || e.message}): confira o caminho a partir da raiz do projeto`)
  }
  return decodificar(b)
}

export function principal(argv, escrever = console.log, avisar = console.error, cwd = process.cwd()) {
  try {
    const a = lerArgv(argv)
    if (a.antes !== undefined || a.depois !== undefined) {
      if (a.antes === undefined || a.depois === undefined || a._.length) throw new Error(`a trava pede --antes e --depois, sem outro arquivo. ${USO}`)
      const r = compararFatos(ler(cwd, a.antes), ler(cwd, a.depois))
      escrever(mostrarComparacao(r))
      return r.iguais ? 0 : 1
    }
    if (a._.length !== 1) throw new Error(USO)
    const oc = ocorrencias(ler(cwd, a._[0]))
    escrever(mostrarOcorrencias(oc))
    return oc.length ? 1 : 0
  } catch (e) {
    avisar(`varrer: ${e.message}`)
    return 2
  }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    process.exitCode = principal(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
