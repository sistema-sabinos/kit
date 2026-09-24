// Testes do diagnostico da conta: regras por anuncio, reputacao, evolucao e a ata.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analisarItem, analisarReputacao, evolucao, diagnosticar } from './diagnosticar.mjs'
import { analisarAnuncio, relatorio } from './keywords.mjs'

const bom = extra => ({ id: 'a', title: 'x'.repeat(58), status: 'active', price: 50, available_quantity: 10, sold_quantity: 0, pictures: Array(8).fill({}), _descricao_len: 800, warranty: '90 dias', attributes: [], ...extra })
const snap = (itens, visitas = {}, vendas = {}) => ({ data: '2026-09-23', janela_dias: 30, totais: { itens: itens.length, ativos: 0, pausados: 0, encerrados: 0 }, itens, visitas: { mapa: visitas }, vendas: { porItem: vendas }, reputacao: null, promocoes: [] })
const tags = r => r.problemas.map(p => `${p.sev}:${p.tag}`)

test('anuncio redondo nao tem problema', () => {
  assert.deepEqual(tags(analisarItem(bom(), snap([], { a: 100 }, { a: 5 }))), [])
})

test('mortos: pausado que ja vendeu e critico, ativo sem visita e critico', () => {
  assert.deepEqual(tags(analisarItem(bom({ status: 'paused', sold_quantity: 12 }), snap([]))), ['critico:morto'])
  assert.deepEqual(tags(analisarItem(bom({ status: 'paused', sold_quantity: 1 }), snap([]))), ['baixo:morto'])
  assert.deepEqual(tags(analisarItem(bom(), snap([], { a: 0 }))), ['critico:morto'])
  assert.deepEqual(tags(analisarItem(bom({ available_quantity: 0 }), snap([], { a: 30 }))), ['critico:sem-estoque'])
})

test('conversao, qualidade e Full', () => {
  assert.deepEqual(tags(analisarItem(bom(), snap([], { a: 80 }, {}))), ['alto:conversao'])
  assert.deepEqual(tags(analisarItem(bom(), snap([], { a: 500 }, { a: 2 }))), ['alto:conversao'])
  const feio = bom({ pictures: [{}, {}], title: 'curto', warranty: null, _descricao_len: 100, _obrigatorios_faltando: ['Marca'], health: 0.5 })
  assert.deepEqual(tags(analisarItem(feio, snap([], { a: 10 }, { a: 1 }))), ['alto:fotos', 'critico:atributos', 'medio:descricao', 'medio:titulo', 'baixo:garantia', 'alto:health'])
  assert.deepEqual(tags(analisarItem(bom({ shipping: { logistic_type: 'cross_docking' } }), snap([], { a: 200 }, { a: 12 }))), ['oportunidade:full'])
  assert.deepEqual(tags(analisarItem(bom({ _descricao_len: null }), snap([], { a: 100 }, { a: 5 }))), [])
})

test('margem e impacto saem do custo do Bling', () => {
  const r = analisarItem(bom({ _custo: 30, _bling_id: 1 }), snap([], { a: 100 }, { a: 5 }))
  assert.equal(r.margemUn, 20)
  assert.equal(r.impacto, 100)
  assert.deepEqual(tags(analisarItem(bom({ _custo: 0, _bling_id: 1 }), snap([], { a: 100 }, { a: 5 }))), ['baixo:custo'])
})

test('reputacao marca o que passou do limite', () => {
  const r = analisarReputacao({ level_id: '5_green', metrics: { claims: { rate: 0.03 }, delayed_handling_time: { rate: 0.08 }, cancellations: { rate: 0 } } })
  assert.equal(r.nivel, 'verde')
  assert.equal(r.acima, true)
  assert.match(r.linhas[0], /ACIMA/)
  assert.match(r.linhas[1], /perto/)
  assert.deepEqual(analisarReputacao(null).acima, false)
})

test('evolucao: primeira coleta avisa, depois compara', () => {
  assert.match(evolucao(snap([]), null)[0], /Primeira coleta/)
  const antes = { ...snap([{ id: 'a', status: 'active' }], {}, { a: 3 }), totais: { ativos: 1, pausados: 0 } }
  const agora = { ...snap([{ id: 'a', status: 'paused' }], {}, { a: 1 }), totais: { ativos: 0, pausados: 1 } }
  assert.deepEqual(evolucao(agora, antes), ['Ativos: 1 para 0', 'Pausados: 0 para 1', 'Unidades vendidas na janela: 3 para 1', '1 anuncio(s) pausaram desde a ultima: a'])
})

test('diagnosticar ordena pelo mais grave e tira da fila quem tem decisao em vigor', () => {
  const itens = [bom({ id: 'leve', title: 'curto' }), bom({ id: 'grave', status: 'paused', sold_quantity: 20 }), bom({ id: 'aposentado', status: 'paused', sold_quantity: 50 })]
  const decisoes = [{ ts: '2026-09-01T12:00:00.000Z', escopo: 'conta', alvo: { id: 'aposentado' }, decisao: 'aposentar', resumo: 'produto saiu de linha', motivo: 'fornecedor parou', baseline: {}, permanente: true }]
  const r = diagnosticar({ atual: snap(itens, { leve: 100 }, { leve: 5 }), decisoes })
  assert.equal(r.comAcao, 2)
  assert.equal(r.naGaveta, 1)
  assert.ok(r.md.indexOf('grave') < r.md.indexOf('### x'))
  assert.match(r.md, /Fora da fila por decisao em vigor/)
  assert.match(r.md, /aposentar, produto saiu de linha/)
  assert.match(r.md, /conferir ao vivo/)
})

test('palavra-chave: termo forte fora do titulo aparece em faltando', () => {
  const it = { id: 'a', title: 'Bala de Coco Caseira 500g', status: 'active', attributes: [{ value_name: 'Sem glúten' }] }
  const r = analisarAnuncio(it, [{ termo: 'bala de coco', posicao: 1 }, { termo: 'bala sem gluten', posicao: 2 }, { termo: 'chocolate', posicao: 3 }])
  // 'bala sem gluten' divide 3 palavras com o produto (titulo mais atributo): 3 / raiz de 2 = 2,12,
  // acima de 'bala de coco' com 2 / raiz de 1 = 2
  assert.deepEqual(r.relevantes.map(t => t.termo), ['bala sem gluten', 'bala de coco'])
  assert.deepEqual(r.faltando.map(t => t.termo), ['bala sem gluten'])
  const md = relatorio([{ it, ...r }], '2026-09-23')
  assert.match(md, /Faltando no titulo: bala sem gluten/)
})
