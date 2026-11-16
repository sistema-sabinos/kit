#!/usr/bin/env node
// Margem de um anuncio do Mercado Livre por script, nunca de cabeca: a comissao (com a tarifa fixa) vem da
// API pelo consultar-ml.mjs, e o resto e a conta da referencias/precificacao.md.
// Uso, da raiz do projeto:
//   node .claude/skills/mercado-livre/scripts/margem.mjs --preco 49,90 --custo 15 --frete 8,50
//     --categoria MLB1234 --tipo classico [--imposto 6] [--logistica drop_off]
// --imposto e o imposto_pct; sem ele, vale o do _contexto/mercado-livre.md. --logistica decide a tarifa fixa
// (padrao drop_off). Saida: 0 com o JSON da conta; 1 quando a API recusa ou nao traz o tipo pedido; 2 com
// argumento faltando ou ruim (antes de qualquer consulta). O token nunca aparece: quem le e renova e o mlGet.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { consultar as consultarMl } from './consultar-ml.mjs'
import { carregarConfiguracao, exigir } from './lib/config.mjs'

export const TIPOS = { classico: 'gold_special', premium: 'gold_pro' }
// logistic_type e o shipping_mode que a doc manda junto (developers.mercadolivre.com.br/pt_br/comissao-por-vender,
// lida em 2026-11-15): sem o par certo, a tarifa fixa sai diferente da cobrada
export const MODO_DA_LOGISTICA = {
  drop_off: 'me2', cross_docking: 'me2', xd_drop_off: 'me2', self_service: 'me2', turbo: 'me2', fulfillment: 'me2',
  default: 'me1', custom: 'custom', not_specified: 'not_specified',
}

const erroDeUso = msg => Object.assign(new Error(msg), { codigo: 2 })
const r2 = n => Math.round(n * 100) / 100

// Dinheiro tem no maximo 2 casas: '49,90', '49.90', 'R$ 1.299,90' e '1.200' (milhar, R$ 1200) valem; ponto
// com 3 casas e milhar, nunca decimal, e o que nao for nenhum dos formatos sai 2 (revisao interna da 5.67)
export function valor(nome, entrada, { positivo = false } = {}) {
  const s = String(entrada ?? '').replace(/^R\$/i, '').trim()
  let limpo = null
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) limpo = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) limpo = s.replace(',', '.')
  const n = limpo === null ? NaN : Number(limpo)
  if (!Number.isFinite(n) || (positivo && n === 0)) throw erroDeUso(`--${nome} invalido: "${entrada ?? ''}". Use algo como 49,90 ou 1.299,90`)
  return n
}

export function argumentos(argv) {
  // opcao escrita sem valor sai 2: --imposto ou --logistica vazios nunca viram o padrao calados
  const pega = nome => {
    const i = argv.indexOf('--' + nome)
    if (i < 0) return undefined
    if (argv[i + 1] === undefined || String(argv[i + 1]).startsWith('--')) throw erroDeUso(`--${nome} sem valor`)
    return argv[i + 1]
  }
  for (const nome of ['preco', 'custo', 'frete', 'categoria', 'tipo']) {
    if (pega(nome) === undefined) throw erroDeUso(`faltou --${nome}. Uso: margem.mjs --preco 49,90 --custo 15 --frete 8,50 --categoria MLB1234 --tipo classico [--imposto 6] [--logistica drop_off]`)
  }
  const tipo = String(pega('tipo')).trim().toLowerCase().replace('clássico', 'classico')
  if (!TIPOS[tipo]) throw erroDeUso(`--tipo invalido: "${pega('tipo')}". Use classico ou premium`)
  const categoria = String(pega('categoria')).trim().toUpperCase()
  if (!/^MLB\d+$/.test(categoria)) throw erroDeUso(`--categoria invalida: "${pega('categoria')}". Use o id da categoria, ex.: MLB1234`)
  const logistica = String(pega('logistica') ?? 'drop_off').trim().toLowerCase()
  if (!Object.hasOwn(MODO_DA_LOGISTICA, logistica)) throw erroDeUso(`--logistica invalida: "${logistica}". Use ${Object.keys(MODO_DA_LOGISTICA).join(', ')}`)
  const imposto = pega('imposto')
  return {
    preco: valor('preco', pega('preco'), { positivo: true }),
    custo: valor('custo', pega('custo')),
    frete: valor('frete', pega('frete')),
    impostoPct: imposto === undefined ? undefined : valor('imposto', imposto),
    categoria, tipo, logistica,
  }
}

// Sem --imposto, o imposto_pct da configuracao do aluno; sem os dois, sai 2 dizendo onde preencher.
export function impostoDaConfiguracao(carregar = () => exigir(carregarConfiguracao(), ['imposto_pct'])) {
  try { return carregar().imposto_pct } catch (e) {
    throw erroDeUso(`${e.message.split('\n')[0]}\nPasse --imposto <porcentagem> ou preencha o imposto_pct pela /mercado-livre.`)
  }
}

const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function margem(entrada, { consultar = consultarMl, imposto = impostoDaConfiguracao, data = hoje } = {}) {
  const { preco, custo, frete, categoria, tipo, logistica } = entrada
  const impostoPct = entrada.impostoPct ?? imposto()
  const listingType = TIPOS[tipo]
  const q = new URLSearchParams({
    price: preco.toFixed(2), category_id: categoria, listing_type_id: listingType, currency_id: 'BRL',
    logistic_type: logistica, shipping_mode: MODO_DA_LOGISTICA[logistica],
  })
  let resposta
  try { resposta = await consultar(`/sites/MLB/listing_prices?${q}`) } catch (e) {
    throw Object.assign(new Error(`a API do Mercado Livre recusou a consulta da comissao (${e.status ?? 'sem status'}). Sem autorizacao do ML, leia a comissao na Central de Vendedores.`), { codigo: 1 })
  }
  // a API devolve uma lista, uma linha por tipo, mesmo filtrando: so vale a linha do tipo pedido, e uma so
  const linhas = (Array.isArray(resposta) ? resposta : [resposta]).filter(l => l && l.listing_type_id === listingType)
  if (linhas.length !== 1 || !Number.isFinite(linhas[0].sale_fee_amount)) {
    throw Object.assign(new Error(`a API devolveu ${linhas.length} linha(s) do tipo ${listingType} com comissao; esperava 1. Confira a categoria ${categoria}.`), { codigo: 1 })
  }
  const l = linhas[0]
  // sale_fee_amount ja traz a tarifa fixa; preco x percentage_fee perderia ela
  const comissao = l.sale_fee_amount
  const impostoRs = preco * impostoPct / 100
  const margemRs = preco - comissao - frete - impostoRs - custo
  return {
    preco: r2(preco), comissao_rs: r2(comissao), comissao_pct: l.sale_fee_details?.percentage_fee ?? null,
    tarifa_fixa: l.sale_fee_details?.fixed_fee ?? null, frete: r2(frete), imposto_pct: impostoPct, imposto_rs: r2(impostoRs),
    custo: r2(custo), margem_rs: r2(margemRs), margem_pct: r2(margemRs / preco * 100),
    tipo, logistica, categoria, fonte: 'listing_prices da API do Mercado Livre', data: data(),
  }
}

// O CLI inteiro, com as dependencias trocaveis pro teste: devolve o que sairia em cada canal.
export async function rodar(argv, deps) {
  try {
    return { codigo: 0, stdout: JSON.stringify(await margem(argumentos(argv), deps), null, 2), stderr: '' }
  } catch (e) {
    return { codigo: e.codigo || 1, stdout: '', stderr: e.message }
  }
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  const r = await rodar(process.argv.slice(2))
  if (r.stdout) console.log(r.stdout)
  if (r.stderr) console.error(r.stderr)
  process.exitCode = r.codigo
}
