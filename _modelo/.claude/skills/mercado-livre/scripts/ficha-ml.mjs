#!/usr/bin/env node
// Ficha de cada anuncio ativo do Mercado Livre, a unica fonte que o responder-ml.mjs aceita pra responder
// pergunta de comprador (so leitura na conta).
//   node .claude/skills/mercado-livre/scripts/ficha-ml.mjs --montar
// Le os anuncios ativos (titulo, atributos, condicoes de venda, preco), a descricao e, no anuncio de catalogo,
// a descricao do produto de catalogo. Grava dados/atendimento/ml/fichas.json com o hash de cada ficha e o
// motivo quando ela esta incompleta (sem descricao, atributo obrigatorio faltando ou leitura que falhou):
// ficha incompleta nao responde nada, a pergunta vai pra rascunho.
// Saida: 0 gravou; 1 erro.
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'
import { gravarJson } from './lib/pipeline.mjs'
import { lerEnv } from './lib/env.mjs'
import { mlGet } from './lib/ml-api.mjs'
import { tokenMl } from './lib/tokens.mjs'
import { idsDaConta, itensDaConta, CAMPOS } from '../../auditar-conta/scripts/coletar.mjs'

export const CAMPOS_FICHA = `${CAMPOS},last_updated,sale_terms`
export const arquivoFichas = (raiz = RAIZ) => join(raiz, 'dados', 'atendimento', 'ml', 'fichas.json')

// sha256 do que a ficha diz (padrao do carimbosDoAnuncio): o responder-ml confere de novo antes de enviar,
// e a ficha mexida a mao depois de montada deixa de valer
export function hashDaFicha(f) {
  const { item_id, last_updated, fontes, incompleto } = f
  return createHash('sha256').update(JSON.stringify({ item_id, last_updated, fontes, incompleto })).digest('hex')
}

const valorDe = a => a.value_name ?? (a.values || []).map(v => v.name).filter(Boolean).join(', ')
const linhas = lista => lista.filter(Boolean).join('\n')

export async function montarFichas({ get, uid, raiz = RAIZ, agora = new Date(), dormir }) {
  if (!uid) throw new Error('falta ML_USER_ID no .env. Rode a autorizacao do Mercado Livre pelo /conectar.')
  const ids = await idsDaConta(uid, get)
  const lidos = await itensDaConta(ids, get, dormir, CAMPOS_FICHA)
  const itens = lidos.filter(it => it.status === 'active')
  const obrigatorios = new Map()
  const fichas = {}
  // anuncio que a multiget nao devolveu (code diferente de 200) ganha ficha incompleta, pra o aluno ver na saida
  const vieram = new Set(lidos.map(it => it.id))
  for (const id of ids.filter(id => !vieram.has(id))) {
    const ficha = { item_id: id, last_updated: null, fontes: {}, incompleto: ['leitura que falhou: anuncio'] }
    fichas[id] = { ...ficha, hash: hashDaFicha(ficha) }
  }
  for (const it of itens) {
    const incompleto = []
    const fontes = {
      titulo: it.title || '',
      atributos: linhas((it.attributes || []).map(a => (a.name && valorDe(a) ? `${a.name}: ${valorDe(a)}` : null))),
      condicoes: linhas([
        ...(it.sale_terms || []).map(t => (t.name && valorDe(t) ? `${t.name}: ${valorDe(t)}` : null)),
        it.warranty ? `Garantia: ${it.warranty}` : null,
        it.condition ? `Condicao: ${it.condition === 'new' ? 'novo' : it.condition === 'used' ? 'usado' : it.condition}` : null,
      ]),
      anuncio: linhas([it.price !== undefined && it.price !== null ? `Preco: R$ ${Number(it.price).toFixed(2).replace('.', ',')}` : null, it.shipping?.free_shipping ? 'Frete gratis' : null]),
      descricao: '',
    }
    try {
      const d = await get(`/items/${it.id}/description`)
      fontes.descricao = d.plain_text || d.text || ''
    } catch (e) {
      // anuncio de catalogo pode nao ter descricao propria: a do produto de catalogo vale no lugar
      if (!it.catalog_listing) incompleto.push(`leitura que falhou: descricao (${e.status || e.message})`)
    }
    if (it.catalog_listing && it.catalog_product_id) {
      try { fontes.catalogo = (await get(`/products/${it.catalog_product_id}`)).short_description?.content || '' } catch (e) { incompleto.push(`leitura que falhou: catalogo (${e.status || e.message})`) }
    }
    if (!fontes.descricao.trim() && !(fontes.catalogo || '').trim()) incompleto.push('sem descricao')
    if (it.category_id && !obrigatorios.has(it.category_id)) {
      try { obrigatorios.set(it.category_id, (await get(`/categories/${it.category_id}/attributes`)).filter(a => a.tags?.required || a.tags?.catalog_required)) } catch { obrigatorios.set(it.category_id, null) }
    }
    const obrig = obrigatorios.get(it.category_id)
    if (obrig === null) incompleto.push('leitura que falhou: atributos da categoria')
    const tem = new Set((it.attributes || []).filter(a => a.value_name || a.value_id).map(a => a.id))
    for (const a of obrig || []) if (!tem.has(a.id)) incompleto.push(`atributo obrigatorio faltando: ${a.name || a.id}`)
    const ficha = { item_id: it.id, last_updated: it.last_updated || null, fontes, incompleto }
    if (!ficha.last_updated) incompleto.push('leitura que falhou: sem last_updated')
    fichas[it.id] = { ...ficha, hash: hashDaFicha(ficha) }
  }
  const saida = { montado_em: agora.toISOString(), fichas }
  gravarJson(arquivoFichas(raiz), saida)
  return saida
}

// Compara os caminhos reais: chamado por juncao ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url ja resolvido, e a comparacao crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  try {
    if (process.argv[2] !== '--montar' || process.argv.length > 3) throw new Error('uso: --montar')
    const token = await tokenMl()
    const r = await montarFichas({ get: c => mlGet(c, { token }), uid: lerEnv().ML_USER_ID })
    const todas = Object.values(r.fichas)
    const incompletas = todas.filter(f => f.incompleto.length)
    console.log(`${todas.length} fichas de anuncio ativo, ${incompletas.length} incompletas (pergunta delas vai pra rascunho)`)
    for (const f of incompletas) console.log(`- ${f.item_id}: ${f.incompleto.join('; ')}`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
