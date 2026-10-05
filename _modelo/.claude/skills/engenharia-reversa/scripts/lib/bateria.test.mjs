// Testes da bateria e da analise da rodada. Rodar: node --test bateria.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TESTES_GRATIS, TESTES_VER, limiaresDaRodada, anatomia, placar, analisar } from './bateria.mjs'

const lido = (id, grupo, extra = {}) => ({ id, grupo, titulo: `Caneca ${id}`, preco: 50, vendidos: grupo === 'campeao' ? 1000 : 20, tipo: 'tradicional', fotos: Array(5).fill('u'), video: false, descricao: '', perguntas: [], capa: { fundo: { branco_puro: false }, respiro: 0.05, densidade_borda: 0.05 }, ...extra })
const ficha = (ordem, papel, extra = {}) => ({ ordem, papel, valida: true, rosto: false, texto_grande: null, texto: null, escala: false, ...extra })
const teste = (lista, nome) => lista.find(([n]) => n === nome)[1]

test('testes gratis leem capa, fotos e video; capa sem medida nao passa', () => {
  const ctx = { mediana_respiro: 0.1, mediana_densidade: 0.1 }
  const a = lido('a', 'campeao', { fotos: Array(8).fill('u'), video: true, capa: { fundo: { branco_puro: true }, respiro: 0.2, densidade_borda: 0.2 } })
  assert.deepEqual(TESTES_GRATIS.map(([, t]) => t(a, ctx)), [true, true, true, true, true])
  assert.deepEqual(TESTES_GRATIS.map(([, t]) => t(lido('b', 'controle', { capa: { erro: 'x' } }), ctx)), [false, false, false, false, false])
})

test('testes do --ver usam so ficha valida, e texto grande so na foto 1', () => {
  const a = lido('a', 'campeao', { fichas: [ficha(2, 'quebra-de-objecao', { texto_grande: 'X' }), ficha(1, 'gancho', { rosto: true, valida: false })] })
  assert.equal(teste(TESTES_VER, 'rosto humano em alguma foto')(a), false)
  assert.equal(teste(TESTES_VER, 'texto grande na capa')(a), false)
  assert.equal(teste(TESTES_VER, 'quebra de objecao ate a foto 3')(a), true)
  assert.equal(teste(TESTES_VER, 'escala ou tamanho real mostrado')(lido('b', 'campeao', { fichas: [ficha(4, 'modo-de-uso', { escala: true })] })), true)
})

test('limiares sao a mediana da rodada inteira, ignorando capa sem medida', () => {
  const l = limiaresDaRodada([lido('a', 'campeao', { capa: { respiro: 0.1, densidade_borda: 0.3 } }), lido('b', 'controle', { capa: { respiro: 0.3, densidade_borda: 0.1 } }), lido('c', 'controle', { capa: { erro: 'x' } })])
  assert.deepEqual(l, { mediana_respiro: 0.2, mediana_densidade: 0.2, capas_medidas: 2 })
})

test('anatomia: papel dominante por posicao sobre quem chega ali, e papeis que ninguem usa', () => {
  const r = anatomia([
    lido('a', 'campeao', { fichas: [ficha(1, 'gancho'), ficha(2, 'modo-de-uso')] }),
    lido('b', 'campeao', { fichas: [ficha(1, 'gancho')] }),
    lido('c', 'campeao'),
  ])
  assert.equal(r.anuncios, 2)
  assert.deepEqual(r.posicoes, [{ posicao: 1, papel: 'gancho', de: 2, quantos: 2 }, { posicao: 2, papel: 'modo-de-uso', de: 1, quantos: 1 }])
  assert.ok(r.papeis_que_nenhum_campeao_usa.includes('prova-social'))
  assert.equal(anatomia([lido('x', 'campeao')]), null)
})

test('placar conta os vereditos', () => {
  assert.deepEqual(placar([{ veredito: 'regra' }, { veredito: 'regra' }, { veredito: 'ruido' }]), { regra: 2, 'anti-padrao': 0, 'custo-de-entrada': 0, irrelevante: 0, ruido: 1 })
})

function rodada({ nCampeoes, nControle, comVer = false, campeao = {}, controle = {} }) {
  const lidos = [
    ...Array.from({ length: nCampeoes }, (_, i) => lido(`c${i}`, 'campeao', typeof campeao === 'function' ? campeao(i) : campeao)),
    ...Array.from({ length: nControle }, (_, i) => lido(`k${i}`, 'controle', typeof controle === 'function' ? controle(i) : controle)),
  ]
  return analisar({ termo: 'caneca termica', data: '2026-10-04', amostra: { busca: 100 }, grupos: { diagnostico: { sorteados: nControle } }, lidos, comVer })
}

test('rodada boa: video em todo campeao e em nenhum controle vira regra', () => {
  const r = rodada({ nCampeoes: 10, nControle: 10, campeao: { video: true, fotos: Array(9).fill('u') }, controle: { fotos: Array(9).fill('u') } })
  assert.equal(r.padroes.length, 5)
  assert.equal(r.padroes.find(p => p.nome === 'video do vendedor no anuncio').veredito, 'regra')
  assert.equal(r.padroes.find(p => p.nome === '8 ou mais fotos').veredito, 'custo-de-entrada')
  assert.equal(r.inconclusivo, false)
  assert.equal(r.anatomia, null)
})

test('2 campeoes que concordam 100% deixam a rodada inconclusiva', () => {
  const r = rodada({ nCampeoes: 2, nControle: 10, campeao: { video: true } })
  assert.equal(r.inconclusivo, true)
  assert.equal(r.padroes.find(p => p.nome === 'video do vendedor no anuncio').veredito, 'irrelevante')
})

test('com --ver a bateria tem 10 testes e a anatomia sai', () => {
  const r = rodada({ nCampeoes: 4, nControle: 4, comVer: true, campeao: { fichas: [ficha(1, 'gancho')] } })
  assert.equal(r.padroes.length, 10)
  assert.equal(r.anatomia.posicoes[0].papel, 'gancho')
})

test('escada e objecoes entram no resultado; texto de foto responde objecao', () => {
  const lidos = [
    lido('MLB1', 'campeao', { tipo: 'catalogo', perguntas: [{ pergunta: 'Mantem quente quantas horas?' }] }),
    lido('MLB2', 'controle', { fichas: [ficha(1, 'gancho', { texto: 'Mantem quente 12 horas' })] }),
  ]
  const semVer = analisar({ termo: 't', data: 'd', amostra: {}, grupos: { diagnostico: {} }, lidos, listas: [{ id: 'MLB1', ofertas: [{ preco: 10 }, { preco: 20 }] }] })
  assert.equal(semVer.escada[0].piso, 10)
  assert.equal(semVer.escada[0].titulo, 'Caneca MLB1')
  // a ficha de um --ver anterior traz o texto da foto, e ele ja responde a duvida
  assert.equal(semVer.objecoes.length, 0)
  assert.deepEqual(semVer.cobertura_perguntas.sem_perguntas, ['MLB2'])
  assert.equal(semVer.composicao.escopo, 'produto')
})

// Regressao da revisao final de 2026-10-04: controle sem ficha (cota estourada) fabricava regra.
test('anuncio sem ficha valida sai dos testes do --ver; grupo com menos de 3 lidos nao decide', () => {
  const r = rodada({ nCampeoes: 10, nControle: 10, comVer: true, campeao: { fichas: [ficha(1, 'gancho', { rosto: true })] }, controle: { fichas: [{ ordem: 1, erro: 'Gemini 429', valida: false }] } })
  const rosto = r.padroes.find(p => p.nome === 'rosto humano em alguma foto')
  assert.notEqual(rosto.veredito, 'regra')
  assert.equal(rosto.controle_total, 0)
  assert.equal(rosto.bloqueio, 'sem-ficha')
  // os testes gratis seguem com os 20
  assert.equal(r.padroes.find(p => p.nome === '8 ou mais fotos').amostra, 20)
})
