#!/usr/bin/env node
// Calendario e teto do MEI. Valores e prazos saem de referencias/fatos.md (fonte e data),
// nunca do codigo; o faturamento do ano sai do /caixa. O teto e conferido pelo maior entre o
// vendido e o recebido no ano, porque a regra fala em receita "auferida" sem dizer o regime:
// avisar pelo maior nunca deixa passar do teto calado. Duvida fina vai pro contador.
// Uso: node mei.mjs <comando> [--raiz <pasta do projeto>] [--hoje AAAA-MM-DD]
//   configurar --abertura AAAA-MM-DD --tipo comercio|servico|misto
//   proximos   (DAS, declaracao anual e teto, completo)
//   alertas    (so o que esta perto: DAS em 5 dias, declaracao em 30, teto a partir de 70%)
//   vencidos   (fatos com mais de 60 dias, pra conferir na web)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { carregar, resumoPeriodo } from '../../caixa/scripts/caixa.mjs'
import { reais, valoresEmReais } from '../../caixa/scripts/lib/dinheiro.mjs'
import { lerArquivoFatos, vencidos, fato, dataValida, hojeLocal, diasEntre } from '../../caixa/scripts/lib/fatos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const FATOS = join(AQUI, '..', 'referencias', 'fatos.md')
export const TIPOS = { comercio: 'mei-das', servico: 'mei-das-servico', misto: 'mei-das-misto' }
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const iso = d => d.toISOString().slice(0, 10)
const utc = s => new Date(s + 'T00:00:00Z')

export function lerConfig(raiz) {
  const c = join(raiz, 'dados', 'mei.json')
  if (!existsSync(c)) throw new Error('falta configurar: node mei.mjs configurar --abertura AAAA-MM-DD --tipo comercio|servico|misto')
  const j = JSON.parse(readFileSync(c, 'utf8'))
  if (!dataValida(j.abertura || '') || !TIPOS[j.tipo]) throw new Error('dados/mei.json com abertura ou tipo invalido; rode o configurar de novo')
  return j
}

export function configurar(raiz, abertura, tipo) {
  if (!dataValida(abertura || '')) throw new Error(`abertura "${abertura}" fora do formato AAAA-MM-DD`)
  if (!TIPOS[tipo]) throw new Error(`tipo "${tipo}" nao existe; use comercio, servico ou misto`)
  mkdirSync(join(raiz, 'dados'), { recursive: true })
  writeFileSync(join(raiz, 'dados', 'mei.json'), JSON.stringify({ abertura, tipo }, null, 2) + '\n')
}

// Dia 20; no sabado ou domingo vai pro dia util seguinte. Feriado a lista nao sabe.
function vencimentoDoMes(ano, mes) {
  const d = new Date(Date.UTC(ano, mes - 1, 20))
  const pulo = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 1 : 0
  d.setUTCDate(20 + pulo)
  return { data: iso(d), movido: pulo > 0 }
}

export function proximoDas(hoje) {
  const [a, m] = hoje.split('-').map(Number)
  const v = vencimentoDoMes(a, m)
  if (hoje <= v.data) return v
  return m === 12 ? vencimentoDoMes(a + 1, 1) : vencimentoDoMes(a, m + 1)
}

export function valorDas(fatos, tipo) {
  const v = valoresEmReais(fato(fatos, TIPOS[tipo]).fato)
  if (!v.length) throw new Error(`fato ${TIPOS[tipo]} sem valor em reais`)
  return v[0]
}

// Prazo da declaracao do ano anterior; null quando o MEI abriu depois do ano que ela cobre.
export function proximaDeclaracao(hoje, abertura) {
  let ano = Number(hoje.slice(0, 4))
  if (hoje > `${ano}-05-31`) ano++
  const referente = ano - 1
  if (Number(abertura.slice(0, 4)) > referente) return null
  return { prazo: `${ano}-05-31`, referente, dias: diasEntre(hoje, `${ano}-05-31`) }
}

export function limiteDoAno(fatos, abertura, ano) {
  const [anual, mensal] = valoresEmReais(fato(fatos, 'mei-teto').fato)
  // a frase traz o anual e depois o mensal; reescrita em outra ordem, a conta pararia aqui
  if (!anual || !mensal || mensal * 12 !== anual) throw new Error('fato mei-teto tem que trazer o teto anual e depois o mensal (anual = mensal x 12)')
  const [aa, ma] = abertura.split('-').map(Number)
  if (aa > ano) throw new Error(`o MEI abriu em ${aa}, depois de ${ano}`)
  return aa === ano ? { limite: mensal * (12 - ma + 1), meses: 12 - ma + 1 } : { limite: anual, meses: 12 }
}

export function situacaoTeto(fatos, abertura, dados, ano) {
  const { limite, meses } = limiteDoAno(fatos, abertura, ano)
  // no ano da abertura, venda de antes do CNPJ (como pessoa fisica) nao entra no teto do MEI
  const conta = abertura.startsWith(String(ano))
    ? { ...dados, pedidos: dados.pedidos.filter(p => p.data >= abertura), pagamentos: dados.pagamentos.filter(x => x.data >= abertura) }
    : dados
  const r = resumoPeriodo(conta, String(ano))
  const faturamento = Math.max(r.vendido, r.recebido)
  const pct = Math.floor((faturamento / limite) * 100)
  let faixa = 'ok'
  if (faturamento > Math.round(limite * 1.2)) faixa = 'passou-20'
  else if (faturamento > limite) faixa = 'passou'
  else if (pct >= 90) faixa = '90'
  else if (pct >= 70) faixa = '70'
  return { limite, meses, vendido: r.vendido, recebido: r.recebido, faturamento, pct, faixa }
}

function fraseTeto(t, ano) {
  const base = `teto ${ano}: ${reais(t.faturamento)} de ${reais(t.limite)}${t.meses < 12 ? ` (proporcional a ${t.meses} meses)` : ''}, ${t.pct}%`
  if (t.faixa === 'passou-20') return `${base}. PASSOU DO TETO EM MAIS DE 20%: o desenquadramento vale desde 1º de janeiro (ou desde a abertura) e tem prazo pra comunicar; procurar o contador agora`
  if (t.faixa === 'passou') return `${base}. Passou do teto em até 20%: comunicar o desenquadramento até o último dia útil do mês seguinte, pagar o DAS sobre o que passou e virar microempresa em janeiro; falar com o contador`
  if (t.faixa === '90') return `${base}. Perto do limite: falar com o contador antes de fechar pedido grande`
  if (t.faixa === '70') return `${base}. Vale começar a conversa com o contador sobre o próximo passo`
  return base
}

function fraseDas(fatos, tipo, hoje) {
  const d = proximoDas(hoje)
  const dias = diasEntre(hoje, d.data)
  const dia = DIAS_SEMANA[utc(d.data).getUTCDay()]
  const quando = dias === 0 ? 'vence hoje' : `vence em ${dias} dia(s)`
  return { dias, texto: `DAS de ${reais(valorDas(fatos, tipo))} ${quando}, ${d.data} (${dia})${d.movido ? ', o dia 20 cai no fim de semana' : ''}; feriado bancário empurra pro dia útil seguinte` }
}

export function executar(argv, log = console.log) {
  const [cmd, ...a] = argv
  const valor = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined }
  const raiz = valor('--raiz') || join(AQUI, '..', '..', '..', '..')
  const hoje = valor('--hoje') || hojeLocal()
  const fatos = lerArquivoFatos(valor('--fatos') || FATOS)
  if (cmd === 'vencidos') {
    const v = vencidos(fatos, hoje)
    if (!v.length) return log('nenhum fato vencido')
    for (const f of v) log(`${f.id}: ${f.fato} (conferido em ${f.conferido_em})`)
    return
  }
  if (cmd === 'configurar') {
    configurar(raiz, valor('--abertura'), valor('--tipo'))
    return log(`MEI configurado: aberto em ${valor('--abertura')}, ${valor('--tipo')}`)
  }
  if (cmd !== 'proximos' && cmd !== 'alertas') throw new Error('comando desconhecido; use configurar, proximos, alertas ou vencidos')
  const cfg = lerConfig(raiz)
  const ano = Number(hoje.slice(0, 4))
  const das = fraseDas(fatos, cfg.tipo, hoje)
  const decl = proximaDeclaracao(hoje, cfg.abertura)
  const teto = situacaoTeto(fatos, cfg.abertura, carregar(raiz), ano)
  const velhos = vencidos(fatos, hoje)
  const linhas = []
  if (cmd === 'proximos') {
    linhas.push(das.texto)
    linhas.push(decl ? `declaração anual de ${decl.referente}: até ${decl.prazo}, faltam ${decl.dias} dia(s)` : `declaração anual: a primeira é em maio de ${Number(cfg.abertura.slice(0, 4)) + 1}`)
    linhas.push(fraseTeto(teto, ano) + `. Conta pelo maior entre o vendido (${reais(teto.vendido)}) e o recebido (${reais(teto.recebido)}) que estão no /caixa`)
    if (velhos.length) linhas.push(`fatos com mais de 60 dias (conferir na web antes de usar): ${velhos.map(f => f.id).join(', ')}`)
  } else {
    if (das.dias <= 5) linhas.push(das.texto)
    if (decl && decl.dias <= 30) linhas.push(`declaração anual de ${decl.referente} até ${decl.prazo}, faltam ${decl.dias} dia(s)`)
    if (teto.faixa !== 'ok') linhas.push(fraseTeto(teto, ano))
    if (velhos.length) linhas.push(`fatos do MEI com mais de 60 dias, conferir na web: ${velhos.map(f => f.id).join(', ')}`)
  }
  for (const l of linhas) log(l)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { executar(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(1) }
}
