// Testes da consulta da ANVISA. Sem navegador e sem rede: a pagina e o relogio sao falsos.
// Rodar: node --test anvisa.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAUSA_MS, AQUECIMENTO_MS, TENTATIVA_MS, ESPERA_RAJADA_MS,
  caminhoDossie, caminhoNotificacao, criarConsulta, lerDossies, lerNotificacoes, irregulares, regularizados,
} from './anvisa.mjs'

// Pagina falsa: cada chamada consome uma resposta da fila. Sem token, o relogio anda o tempo
// que a pagina esperou, como na vida real.
function falso(respostas) {
  let t = 1_000_000
  const chamadas = []
  const esperas = []
  return {
    chamadas,
    esperas,
    agora: () => t,
    dormir: async ms => { esperas.push(ms); t += ms },
    avaliar: async args => {
      chamadas.push(args)
      const r = respostas.shift()
      if (!r) throw new Error('fila de respostas acabou')
      if (r.semToken) t += args.esperarMs
      return r
    },
  }
}
const okJson = obj => ({ status: 200, texto: JSON.stringify(obj) })
const SEM = { semToken: true, detalhe: 'sem-token' }

test('caminhos da API levam o filtro certo, com espaco e acento codificados', () => {
  const d = caminhoDossie('Max Titanium')
  assert.match(d, /^\/api\/dossie\/dossie\?/)
  assert.match(d, /filter%5BtipoAssunto%5D=1/)
  assert.match(d, /filter%5BparametroProduto%5D=Max\+Titanium/)
  assert.match(caminhoNotificacao('Ypê'), /^\/api\/consulta\/alimento\/produtos\?.*filter%5Bmarca%5D=Yp%C3%AA/)
})

test('aquecimento: insiste no primeiro token ate sair e depois devolve o JSON', async () => {
  const f = falso([SEM, SEM, SEM, SEM, okJson({ content: [], totalElements: 0 })])
  const consultar = criarConsulta(f)
  assert.deepEqual(await consultar('/api/x'), { content: [], totalElements: 0 })
  assert.equal(f.chamadas.length, 5)
  assert.equal(f.chamadas[0].esperarMs, TENTATIVA_MS)
})

test('aquecimento: desiste depois de 4 minutos com mensagem de gente', async () => {
  const f = falso(Array(20).fill(SEM))
  const consultar = criarConsulta(f)
  await assert.rejects(consultar('/api/x'), /nao liberou a consulta em 4 minutos/)
  assert.equal(f.chamadas.length, AQUECIMENTO_MS / TENTATIVA_MS)
})

test('depois de aquecida: token que some tem uma nova tentativa, e duas falhas viram erro', async () => {
  const f = falso([okJson({ a: 1 }), SEM, okJson({ b: 2 }), SEM, SEM])
  const consultar = criarConsulta(f)
  await consultar('/api/1')
  assert.deepEqual(await consultar('/api/2'), { b: 2 })
  await assert.rejects(consultar('/api/3'), /parou de liberar a consulta/)
})

test('pausa minima entre consultas seguidas', async () => {
  const f = falso([okJson({}), okJson({})])
  const consultar = criarConsulta(f)
  await consultar('/api/1')
  await consultar('/api/2')
  assert.ok(f.esperas.includes(PAUSA_MS), `esperas: ${f.esperas}`)
})

test('403 em rajada: espera 60 s e tenta uma vez; outro status vira erro', async () => {
  const f = falso([{ status: 403, texto: '{}' }, okJson({ ok: true })])
  assert.deepEqual(await criarConsulta(f)('/api/1'), { ok: true })
  assert.ok(f.esperas.includes(ESPERA_RAJADA_MS))
  const g = falso([{ status: 500, texto: 'erro' }])
  await assert.rejects(criarConsulta(g)('/api/1'), /respondeu 500/)
})

test('resposta que nao e JSON vira erro legivel', async () => {
  const f = falso([{ status: 200, texto: '<html>' }])
  await assert.rejects(criarConsulta(f)('/api/1'), /nao e JSON/)
})

const dossieCru = (produtos, tipo = 'Alimento', empresa = 'EMPRESA X LTDA') => ({
  dataUltimaMedidaCautelar: '2026-05-10T00:00:00',
  tipoProduto: { descricao: tipo },
  empresa: { razaoSocial: empresa },
  produtosConcatenados: produtos,
})

test('lerDossies: decide pelos confirmados, nunca pelo total da API', () => {
  const json = { totalElements: 3, content: [
    dossieCru('TRIBULUS TERRESTRIS 500MG'),
    dossieCru('SUPLEMENTO ACME TERMO  - MARCA ACME'),
    dossieCru('ADESIVO ACME UNIVERSAL', 'Dispositivos Médicos'),
  ] }
  const r = lerDossies(json, { marca: 'Acme', tipos: ['Alimento', 'Medicamento'] })
  assert.equal(r.total, 3)
  assert.equal(r.confirmados, 1)
  assert.equal(r.descartados, 2)
  assert.equal(r.dossies[0].produtos, 'SUPLEMENTO ACME TERMO - MARCA ACME')
  assert.equal(r.dossies[0].data, '2026-05-10')
  assert.equal(r.guardaChuva, 0)
})

test('lerDossies: TODOS/TODAS marca guarda-chuva; apelido conta como a marca', () => {
  const json = { totalElements: 2, content: [
    dossieCru('TODOS OS SUPLEMENTOS ALIMENTARES - MARCA ACME'),
    dossieCru('LINHA TERMOFORT CAPSULAS'),
  ] }
  const r = lerDossies(json, { marca: 'Acme', aliases: ['Termofort'], tipos: ['Alimento'] })
  assert.equal(r.confirmados, 2)
  assert.equal(r.guardaChuva, 1)
})

test('lerDossies: so "TODOS OS PRODUTOS/SUPLEMENTOS/..." e medida da marca inteira', () => {
  const json = { totalElements: 4, content: [
    dossieCru('TODOS OS PRODUTOS DA MARCA ACME'),
    dossieCru('CREME ACME PARA TODOS OS TIPOS DE PELE'),
    dossieCru('ACME TERMO - TODOS OS LOTES'),
    dossieCru('ACME SHAMPOO PARA TODO TIPO DE CABELO'),
  ] }
  const r = lerDossies(json, { marca: 'Acme', tipos: ['Alimento'] })
  assert.equal(r.confirmados, 4)
  assert.equal(r.guardaChuva, 1)
  assert.equal(r.dossies[0].guardaChuva, true)
})

test('lerDossies: marca curta nao casa dentro de outra palavra', () => {
  const json = { totalElements: 1, content: [dossieCru('CHA DE BOLDO 30 SACHES')] }
  assert.equal(lerDossies(json, { marca: 'Bold', tipos: ['Alimento'] }).confirmados, 0)
})

test('lerDossies e lerNotificacoes recusam formato sem content', () => {
  assert.throws(() => lerDossies({}, { marca: 'Acme' }), /mudou o formato/)
  assert.throws(() => lerNotificacoes({ erro: 1 }), /mudou o formato/)
})

test('lerDossies marca incompleto quando a ANVISA tem mais do que veio na pagina', () => {
  const json = { totalElements: 80, content: [dossieCru('ACME TERMO')] }
  assert.equal(lerDossies(json, { marca: 'Acme', tipos: ['Alimento'] }).incompleto, true)
  const cheio = { totalElements: 1, content: [dossieCru('ACME TERMO')] }
  assert.equal(lerDossies(cheio, { marca: 'Acme', tipos: ['Alimento'] }).incompleto, false)
})

test('lerDossies e lerNotificacoes recusam item sem os campos esperados', () => {
  assert.throws(() => lerDossies({ totalElements: 1, content: [{ produtos: 'ACME' }] }, { marca: 'Acme' }), /mudou o formato/)
  assert.throws(() => lerNotificacoes({ totalElements: 1, content: [{ nome: 'x' }] }), /mudou o formato/)
})

test('lerNotificacoes conta so notificado e ativo', () => {
  const item = (tipo, situacao, numero) => ({ produto: { descricao: 'P', numeroRegistroOuNotificacao: numero, tipoRegularizacao: tipo, situacaoRegistro: situacao }, detentorRegistro: { razaoSocial: 'D' } })
  const r = lerNotificacoes({ totalElements: 3, content: [item('Notificado', 'Ativo', '1'), item('Notificado', 'Cancelado', '2'), item('Registrado', 'Ativo', '3')] })
  assert.equal(r.total, 3)
  assert.equal(r.ativos, 2)
  assert.equal(r.notificadosAtivos, 1)
  assert.deepEqual(r.itens[0], { produto: 'P', numero: '1', tipo: 'Notificado', situacao: 'Ativo', detentor: 'D' })
})

test('lerDossies troca travessao do texto da ANVISA por hifen', () => {
  const traco = String.fromCharCode(0x2013)
  const json = { totalElements: 1, content: [dossieCru(`ACME TERMO ${traco} LOTE 12`)] }
  const r = lerDossies(json, { marca: 'Acme', tipos: ['Alimento'] })
  assert.equal(r.dossies[0].produtos, 'ACME TERMO - LOTE 12')
})

test('irregulares e regularizados passam o caminho certo pra consulta', async () => {
  const pedidos = []
  const consultar = async caminho => { pedidos.push(caminho); return { content: [], totalElements: 0 } }
  assert.equal((await irregulares(consultar, 'Acme', { tipos: ['Alimento'] })).confirmados, 0)
  assert.equal((await regularizados(consultar, 'Acme')).notificadosAtivos, 0)
  assert.deepEqual(pedidos, [caminhoDossie('Acme'), caminhoNotificacao('Acme')])
})
