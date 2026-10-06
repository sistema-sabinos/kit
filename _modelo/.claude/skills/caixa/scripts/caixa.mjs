#!/usr/bin/env node
// Caixa do pequeno negocio: pedido, sinal, quanto falta, quem esta devendo e o fechamento.
// Dois arquivos em dados/caixa/: pedidos.csv e pagamentos.csv (sinal e restante sao duas
// linhas de pagamento, pra bater com o extrato do banco). O script grava o CSV pra nome com
// virgula ou aspas nao quebrar a planilha. Mais cobrancas.csv, pro /cobrar saber o degrau.
// Uso: node caixa.mjs <comando> [--raiz <pasta do projeto>] [--hoje AAAA-MM-DD]
//   pedido --cliente "Marina" --item "bolo 2 kg" --valor 180 --entrega AAAA-MM-DD [--sinal 90] [--forma pix] [--data AAAA-MM-DD]
//   pago <id> --valor 90 [--forma pix] [--data AAAA-MM-DD]
//   cancelar <id>
//   devolvido <id> --valor 30 [--data AAAA-MM-DD]
//   cobrado <id> [--data AAAA-MM-DD]
//   aberto | alertas | mes AAAA-MM | ano AAAA | fatos (os de referencias/fatos.md com mais de 60 dias)
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { lerArquivoCsv, gravarArquivoCsv } from './lib/csv.mjs'
import { centavos, reais, paraCsv } from './lib/dinheiro.mjs'
import { dataValida, hojeLocal, diasEntre, lerArquivoFatos, vencidos } from './lib/fatos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const COL_PEDIDOS = ['id', 'data', 'cliente', 'item', 'valor', 'entrega', 'situacao']
export const COL_PAGAMENTOS = ['pedido', 'data', 'valor', 'forma']
export const COL_COBRANCAS = ['pedido', 'data']
export const DIAS_DEVENDO = 7

export function arquivos(raiz) {
  const d = join(raiz, 'dados', 'caixa')
  return { pedidos: join(d, 'pedidos.csv'), pagamentos: join(d, 'pagamentos.csv'), cobrancas: join(d, 'cobrancas.csv') }
}

export function carregar(raiz) {
  const a = arquivos(raiz)
  const pedidos = lerArquivoCsv(a.pedidos, COL_PEDIDOS).linhas
  const pagamentos = lerArquivoCsv(a.pagamentos, COL_PAGAMENTOS).linhas
  const cobrancas = lerArquivoCsv(a.cobrancas, COL_COBRANCAS).linhas
  for (const p of [...pedidos, ...pagamentos]) {
    const c = centavos(p.valor)
    if (c === null) throw new Error(`valor "${p.valor}" ilegivel (${p.id || 'pagamento do pedido ' + p.pedido})`)
    p.centavos = c
  }
  for (const p of pedidos) { p.data = dataDoArquivo(p.data, p.id); p.entrega = dataDoArquivo(p.entrega, p.id) }
  for (const p of [...pagamentos, ...cobrancas]) p.data = dataDoArquivo(p.data, 'pedido ' + p.pedido)
  return { pedidos, pagamentos, cobrancas }
}

// O Excel em portugues regrava AAAA-MM-DD como dd/mm/aaaa; aceita os dois e para no resto,
// porque data ilegivel faria o pedido sumir do mes e do "quem deve" sem aviso.
function dataDoArquivo(s, quem) {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || '')
  const iso = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : s
  if (!dataValida(iso || '')) throw new Error(`data "${s}" ilegivel no caixa (${quem}); use AAAA-MM-DD ou dd/mm/aaaa`)
  return iso
}

function exigirData(s, nome) {
  if (!dataValida(s || '')) throw new Error(`${nome} "${s}" fora do formato AAAA-MM-DD`)
  return s
}

function exigirValor(s, nome) {
  const c = centavos(s)
  if (c === null || c <= 0) throw new Error(`${nome} "${s}" nao e um valor em reais maior que zero`)
  return c
}

function novoId(pedidos, data) {
  const usados = new Set(pedidos.map(p => p.id))
  for (;;) {
    // data + sorteio: dois computadores criando pedido no mesmo dia nao batem o id
    const id = data.slice(2).replace(/-/g, '') + '-' + randomBytes(2).toString('hex').slice(0, 3)
    if (!usados.has(id)) return id
  }
}

// Devolucao nao reabre divida: o que falta conta so o que entrou; a devolucao so desconta do
// recebido do periodo e do que ainda da pra devolver.
export function saldo(dados, pedido) {
  const linhas = dados.pagamentos.filter(x => x.pedido === pedido.id)
  const pago = linhas.filter(x => x.centavos > 0).reduce((s, x) => s + x.centavos, 0)
  const devolvido = -linhas.filter(x => x.centavos < 0).reduce((s, x) => s + x.centavos, 0)
  return { pago, devolvido, falta: pedido.centavos - pago }
}

function acharPedido(dados, id) {
  const p = dados.pedidos.find(x => x.id === id)
  if (!p) throw new Error(`nao achei o pedido "${id}"; o caixa.mjs aberto lista os ids`)
  return p
}

export function registrarPedido(raiz, o) {
  const dados = carregar(raiz)
  const data = exigirData(o.data, 'data')
  const entrega = exigirData(o.entrega, 'entrega')
  if (!o.cliente || !o.item) throw new Error('pedido precisa de --cliente e --item')
  const valor = exigirValor(o.valor, 'valor')
  const sinal = o.sinal !== undefined ? exigirValor(o.sinal, 'sinal') : 0
  if (sinal > valor) throw new Error(`sinal de ${reais(sinal)} maior que o pedido de ${reais(valor)}`)
  const id = novoId(dados.pedidos, data)
  const a = arquivos(raiz)
  const linha = { id, data, cliente: o.cliente, item: o.item, valor: paraCsv(valor), entrega, situacao: 'ativo' }
  gravarArquivoCsv(a.pedidos, COL_PEDIDOS, [...dados.pedidos, linha])
  if (sinal) gravarArquivoCsv(a.pagamentos, COL_PAGAMENTOS, [...dados.pagamentos, { pedido: id, data, valor: paraCsv(sinal), forma: o.forma || 'pix' }])
  return { id, valor, sinal, falta: valor - sinal }
}

export function registrarPagamento(raiz, id, o) {
  const dados = carregar(raiz)
  const p = acharPedido(dados, id)
  if (p.situacao === 'cancelado') throw new Error(`o pedido ${id} esta cancelado`)
  const valor = exigirValor(o.valor, 'valor')
  const { falta } = saldo(dados, p)
  if (valor > falta) throw new Error(`pagamento de ${reais(valor)} maior que o que falta (${reais(falta)}) no pedido ${id}; confira o valor`)
  const data = exigirData(o.data, 'data')
  gravarArquivoCsv(arquivos(raiz).pagamentos, COL_PAGAMENTOS, [...dados.pagamentos, { pedido: id, data, valor: paraCsv(valor), forma: o.forma || 'pix' }])
  return { id, valor, falta: falta - valor }
}

export function cancelar(raiz, id) {
  const dados = carregar(raiz)
  const p = acharPedido(dados, id)
  p.situacao = 'cancelado'
  gravarArquivoCsv(arquivos(raiz).pedidos, COL_PEDIDOS, dados.pedidos)
  return { id, pago: saldo(dados, p).pago }
}

// Dinheiro devolvido ao cliente (pedido cancelado, desconto depois de pago): linha negativa,
// pra o recebido do mes e do ano, que o /mei usa, contar o que ficou de verdade.
export function registrarDevolucao(raiz, id, o) {
  const dados = carregar(raiz)
  const p = acharPedido(dados, id)
  const valor = exigirValor(o.valor, 'valor')
  const { pago, devolvido } = saldo(dados, p)
  if (valor > pago - devolvido) throw new Error(`devolucao de ${reais(valor)} maior que o que foi pago (${reais(pago - devolvido)}) no pedido ${id}`)
  const data = exigirData(o.data, 'data')
  gravarArquivoCsv(arquivos(raiz).pagamentos, COL_PAGAMENTOS, [...dados.pagamentos, { pedido: id, data, valor: '-' + paraCsv(valor), forma: 'devolucao' }])
  return { id, valor }
}

export function registrarCobranca(raiz, id, data) {
  const dados = carregar(raiz)
  acharPedido(dados, id)
  exigirData(data, 'data')
  gravarArquivoCsv(arquivos(raiz).cobrancas, COL_COBRANCAS, [...dados.cobrancas, { pedido: id, data }])
}

// Pedido ativo com saldo, do mais atrasado pro que ainda vai ser entregue.
export function emAberto(dados, hoje) {
  return dados.pedidos
    .filter(p => p.situacao !== 'cancelado')
    .map(p => ({ ...p, ...saldo(dados, p), dias: diasEntre(p.entrega, hoje), cobrancas: dados.cobrancas.filter(c => c.pedido === p.id).length }))
    .filter(p => p.falta > 0)
    .sort((a, b) => b.dias - a.dias)
}

export function devendo(dados, hoje) {
  return emAberto(dados, hoje).filter(p => p.dias > DIAS_DEVENDO)
}

export function resumoPeriodo(dados, prefixo) {
  const ativos = dados.pedidos.filter(p => p.situacao !== 'cancelado' && p.data.startsWith(prefixo))
  const vendido = ativos.reduce((s, p) => s + p.centavos, 0)
  const pags = dados.pagamentos.filter(x => x.data.startsWith(prefixo))
  const recebido = pags.reduce((s, x) => s + x.centavos, 0)
  const porForma = {}
  for (const x of pags) porForma[x.forma] = (porForma[x.forma] || 0) + x.centavos
  const pix = pags.filter(x => x.forma === 'pix').length
  const aReceber = ativos.reduce((s, p) => s + saldo(dados, p).falta, 0)
  return { pedidos: ativos.length, vendido, recebido, aReceber, ticket: ativos.length ? Math.round(vendido / ativos.length) : 0, porForma, pix }
}

function opcoes(a) {
  const o = {}
  const pos = []
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { o[a[i].slice(2)] = a[i + 1]; i++ }
    else pos.push(a[i])
  }
  return { o, pos }
}

function linhaAberto(p) {
  const quando = p.dias > 0 ? `entregue ha ${p.dias} dia(s)` : p.dias === 0 ? 'entrega hoje' : `entrega em ${-p.dias} dia(s)`
  const cob = p.cobrancas ? `, cobrado ${p.cobrancas}x` : ''
  return `${p.id} | ${p.cliente} | ${p.item} | falta ${reais(p.falta)} de ${reais(p.centavos)} | ${quando}${cob}`
}

export function executar(argv, log = console.log) {
  const [cmd, ...resto] = argv
  const { o, pos } = opcoes(resto)
  const raiz = o.raiz || join(AQUI, '..', '..', '..', '..')
  const hoje = o.hoje || hojeLocal()
  if (cmd === 'pedido') {
    const r = registrarPedido(raiz, { ...o, data: o.data || hoje })
    log(`pedido ${r.id} anotado: ${reais(r.valor)}${r.sinal ? `, sinal de ${reais(r.sinal)}` : ''}, falta ${reais(r.falta)}`)
  } else if (cmd === 'pago') {
    const r = registrarPagamento(raiz, pos[0], { ...o, data: o.data || hoje })
    log(`pagamento de ${reais(r.valor)} no pedido ${r.id}; ${r.falta ? `falta ${reais(r.falta)}` : 'pedido quitado'}`)
  } else if (cmd === 'cancelar') {
    const r = cancelar(raiz, pos[0])
    log(`pedido ${r.id} cancelado${r.pago ? `; ja tinha ${reais(r.pago)} pago: combinar devolucao ou credito com o cliente, e devolvendo, anotar com "devolvido ${r.id} --valor"` : ''}`)
  } else if (cmd === 'devolvido') {
    const r = registrarDevolucao(raiz, pos[0], { ...o, data: o.data || hoje })
    log(`devolucao de ${reais(r.valor)} anotada no pedido ${r.id}`)
  } else if (cmd === 'cobrado') {
    registrarCobranca(raiz, pos[0], o.data || hoje)
    log(`cobranca do pedido ${pos[0]} anotada`)
  } else if (cmd === 'aberto') {
    const lista = emAberto(carregar(raiz), hoje)
    if (!lista.length) return log('nenhum pedido com saldo em aberto')
    log(`${lista.length} pedido(s) com saldo, total ${reais(lista.reduce((s, p) => s + p.falta, 0))}:`)
    for (const p of lista) log(linhaAberto(p))
  } else if (cmd === 'alertas') {
    const d = devendo(carregar(raiz), hoje)
    if (!d.length) return
    const velho = d[0]
    log(`${d.length} pedido(s) entregue(s) ha mais de ${DIAS_DEVENDO} dias ainda devendo, total ${reais(d.reduce((s, p) => s + p.falta, 0))}; o mais antigo: ${velho.cliente}, ${reais(velho.falta)}, ha ${velho.dias} dias`)
  } else if (cmd === 'mes' || cmd === 'ano') {
    const per = pos[0] || (cmd === 'mes' ? hoje.slice(0, 7) : hoje.slice(0, 4))
    if (!(cmd === 'mes' ? /^\d{4}-\d{2}$/ : /^\d{4}$/).test(per)) throw new Error(`periodo "${per}" fora do formato ${cmd === 'mes' ? 'AAAA-MM' : 'AAAA'}`)
    const r = resumoPeriodo(carregar(raiz), per)
    log(`${per}: ${r.pedidos} pedido(s), vendido ${reais(r.vendido)}, recebido ${reais(r.recebido)}, ainda a receber desses pedidos ${reais(r.aReceber)}, ticket medio ${reais(r.ticket)}`)
    const formas = Object.entries(r.porForma).map(([f, c]) => `${f} ${reais(c)}`).join(', ')
    if (formas) log(`recebido por forma: ${formas}`)
    if (cmd === 'mes') log(`pix recebidos no mes: ${r.pix}`)
  } else if (cmd === 'fatos') {
    const v = vencidos(lerArquivoFatos(o.arquivo || join(AQUI, '..', 'referencias', 'fatos.md')), hoje)
    if (!v.length) return log('nenhum fato vencido')
    for (const f of v) log(`${f.id}: ${f.fato} (conferido em ${f.conferido_em})`)
  } else {
    throw new Error('comando desconhecido; use pedido, pago, cancelar, devolvido, cobrado, aberto, alertas, mes, ano ou fatos')
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { executar(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(1) }
}
