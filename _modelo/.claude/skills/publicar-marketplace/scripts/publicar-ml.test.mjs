// Testes da publicacao direto no Mercado Livre. Sem rede: a api falsa responde por rota e grava
// cada chamada. Cada teste monta um projeto de mentira numa pasta temporaria, apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { argumentos, montar, enviar, conferir, textoDoResumo } from './publicar-ml.mjs'

const SLUG = 'moedor-teste'
const ATRIBUTOS = [
  { id: 'BRAND', name: 'Marca', tags: { required: true } },
  { id: 'EMPTY_GTIN_REASON', name: 'Motivo de GTIN vazio', tags: {}, values: [{ id: '17055160', name: 'O produto não tem código cadastrado' }] },
]

function projeto({ erp = 'nenhum', auditoria = { veredito: 'aprovado', modalidade_escolhida: 'classico' }, imagensAprovadas = true, variacoes = '' } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'publicar-ml-'))
  const pasta = join(raiz, 'dados', 'pipeline', SLUG)
  mkdirSync(pasta, { recursive: true })
  mkdirSync(join(raiz, 'anuncios', SLUG, 'imagens'), { recursive: true })
  mkdirSync(join(raiz, 'fornecedores', 'forn-teste'), { recursive: true })
  mkdirSync(join(raiz, '_contexto'), { recursive: true })
  const j = (n, v) => writeFileSync(join(pasta, `${n}.json`), JSON.stringify(v))
  j('status', { slug: SLUG, fornecedor: 'forn-teste', categoria: 'casa', etapa_atual: 'auditado', etapas: {} })
  j('copy', { titulo: 'Moedor Eletrico Inox', descricao: 'Descricao do moedor', ficha: { Marca: 'Acme' }, precos: { ml_classico: 84.9 }, gtin: null })
  j('decisao', { tipo: 'individual', composicao: [{ produto: 'Moedor Inox', qtd: 1 }], preco: { tabela: 96.5, alvo_pos_desconto: 84.9 } })
  j('auditoria', auditoria)
  j('imagens', { aprovado_pelo_usuario: imagensAprovadas, imagens: [{ n: 2, arquivo: `anuncios/${SLUG}/imagens/02-uso.jpg` }, { n: 1, arquivo: `anuncios/${SLUG}/imagens/01-capa.jpg` }] })
  for (const f of ['01-capa.jpg', '02-uso.jpg']) writeFileSync(join(raiz, 'anuncios', SLUG, 'imagens', f), Buffer.from([0xff, 0xd8]))
  writeFileSync(join(raiz, 'fornecedores', 'forn-teste', 'catalogo-analisado.csv'), `status,categoria,produto,ean,custo,peso_g,dimensoes_cm,variacoes,observacao\nOK,casa,Moedor Inox,,50.00,400,18x11x10,${variacoes},\n`)
  const cerca = '`'.repeat(3)
  writeFileSync(join(raiz, '_contexto', 'mercado-livre.md'), `# Mercado Livre\n\n${cerca}mercado-livre\nerp: ${erp}\n${cerca}\n`)
  return { raiz, pasta, ler: n => JSON.parse(readFileSync(join(pasta, `${n}.json`), 'utf8')), payload: join(raiz, 'anuncios', SLUG, 'ml-payload.json') }
}

// rotas: { 'GET /caminho': resposta | (corpo) => resposta, 'POST /items': ... }. Resposta de escrita
// e { ok, status, dado }; Error com semResposta simula a rede caindo.
function apiFalsa(rotas = {}) {
  const chamadas = []
  const achar = (chave, corpo) => {
    const k = Object.keys(rotas).find(r => chave.startsWith(r))
    if (!k) throw new Error(`rota sem resposta no teste: ${chave}`)
    const v = typeof rotas[k] === 'function' ? rotas[k](corpo, chamadas) : rotas[k]
    if (v instanceof Error) throw v
    return v
  }
  let fotos = 0
  return {
    chamadas,
    get: async c => { chamadas.push(`GET ${c}`); return achar(`GET ${c}`) },
    escrever: async (m, c, corpo) => { chamadas.push(`${m} ${c}`); chamadas.push(corpo); return achar(`${m} ${c}`, corpo) },
    subir: async arquivo => { chamadas.push(`SUBIR ${arquivo.replace(/\\/g, '/').split('/').pop()}`); fotos++; return { id: `foto-${fotos}` } },
  }
}

const LEITURAS = {
  'GET /sites/MLB/domain_discovery': [{ category_id: 'MLB99', category_name: 'Moedores' }],
  'GET /categories/MLB99/attributes': ATRIBUTOS,
  'GET /categories/MLB99': { name: 'Moedores', settings: { max_title_length: 60, max_pictures_per_item: 12 } },
}
const OK_VALIDA = { ok: false, status: 400, dado: { cause: [{ type: 'warning', code: 'shipping.lost_me1_by_user', message: 'x' }] } }
const OPCOES = { estoque: 5, garantiaDias: 90 }
const ITEM = { id: 'MLB123', status: 'paused', family_name: 'Moedor Eletrico Inox', price: 96.5, pictures: [{}, {}], permalink: 'https://produto.mercadolivre.com.br/MLB-123' }

test('argumentos: uma acao so, slug obrigatorio, numero inteiro e flag desconhecida barrada', () => {
  assert.deepEqual(argumentos(['--montar', 'x', '--estoque', '5', '--garantia-dias', '90']), { acao: 'montar', slug: 'x', estoque: 5, garantiaDias: 90, categoria: null, embalagem: null, pesoG: null })
  assert.deepEqual(argumentos(['--enviar', 'x']), { acao: 'enviar', slug: 'x' })
  assert.throws(() => argumentos(['--montar']), /slug/)
  assert.throws(() => argumentos(['--montar', 'x', '--enviar', 'x']), /uso/)
  assert.throws(() => argumentos(['--montar', 'x', '--estoque', '2.5']), /inteiro/)
  assert.throws(() => argumentos(['--montar', 'x', '--estoqe', '5']), /nao conheco --estoqe/)
})

test('montar valida sem criar nada, grava o payload e o resumo diz que nasce pausado', async () => {
  const p = projeto()
  try {
    const api = apiFalsa({ ...LEITURAS, 'POST /items/validate': OK_VALIDA })
    const r = await montar(SLUG, OPCOES, { api, raiz: p.raiz })
    assert.equal(r.gravado, true)
    assert.ok(!api.chamadas.includes('POST /items'), 'o --montar criou anuncio')
    const salvo = JSON.parse(readFileSync(p.payload, 'utf8'))
    assert.equal(salvo.corpo.family_name, 'Moedor Eletrico Inox')
    assert.equal(salvo.corpo.price, 96.5)
    assert.deepEqual(salvo.imagens, [`anuncios/${SLUG}/imagens/01-capa.jpg`, `anuncios/${SLUG}/imagens/02-uso.jpg`])
    assert.ok(salvo.corpo.attributes.some(a => a.id === 'SELLER_PACKAGE_WEIGHT' && a.value_name === '400 g'), 'a embalagem veio do catalogo do fornecedor')
    const texto = textoDoResumo(r)
    assert.ok(texto.length > 0)
    assert.match(texto, /PAUSADO/)
    assert.match(texto, /20 de 60|Moedor Eletrico Inox/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('montar com pendencia ou recusa da validacao nao grava e apaga payload velho', async () => {
  const p = projeto()
  try {
    writeFileSync(p.payload, '{"velho":true}')
    const semEstoque = await montar(SLUG, { garantiaDias: 90 }, { api: apiFalsa(LEITURAS), raiz: p.raiz })
    assert.equal(semEstoque.gravado, false)
    assert.ok(semEstoque.pendencias.some(x => /--estoque/.test(x)))
    assert.ok(!existsSync(p.payload), 'payload velho ficou')
    const recusa = { ok: false, status: 400, dado: { cause: [{ type: 'error', code: 'item.attribute.missing.seller.package.dimensions', message: 'x' }] } }
    const r = await montar(SLUG, OPCOES, { api: apiFalsa({ ...LEITURAS, 'POST /items/validate': recusa }), raiz: p.raiz })
    assert.equal(r.gravado, false)
    assert.match(r.pendencias.join(' '), /embalagem/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('montar manda pro plano B produto com variacao e categoria de catalogo', async () => {
  const p = projeto({ variacoes: 'cores' })
  try {
    const r = await montar(SLUG, OPCOES, { api: apiFalsa(LEITURAS), raiz: p.raiz })
    assert.match(r.planoB, /variacao/)
    assert.match(textoDoResumo(r), /PLANO B/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
  const q = projeto()
  try {
    const catalogo = { ok: false, status: 400, dado: { cause: [{ type: 'error', code: 'item.catalog_listing.required', message: 'x' }] } }
    const r = await montar(SLUG, OPCOES, { api: apiFalsa({ ...LEITURAS, 'POST /items/validate': catalogo }), raiz: q.raiz })
    assert.match(r.planoB, /catalogo/)
    assert.ok(!existsSync(q.payload))
  } finally {
    rmSync(q.raiz, { recursive: true, force: true })
  }
})

test('montar e enviar recusam auditoria reprovada, imagem sem aprovacao e conta com Bling', async () => {
  for (const [opcoes, esperado] of [[{ auditoria: { veredito: 'reprovado' } }, /auditoria/], [{ imagensAprovadas: false }, /imagens/], [{ erp: 'bling' }, /Bling/]]) {
    const p = projeto(opcoes)
    try {
      await assert.rejects(montar(SLUG, OPCOES, { api: apiFalsa(LEITURAS), raiz: p.raiz }), esperado)
      await assert.rejects(enviar(SLUG, { api: apiFalsa(), raiz: p.raiz }), esperado)
    } finally {
      rmSync(p.raiz, { recursive: true, force: true })
    }
  }
})

async function montado(p) {
  await montar(SLUG, OPCOES, { api: apiFalsa({ ...LEITURAS, 'POST /items/validate': OK_VALIDA }), raiz: p.raiz })
}

test('enviar sobe as imagens na ordem, cria pausado, grava descricao e registra', async () => {
  const p = projeto()
  try {
    await montado(p)
    const api = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items/MLB123/description': { ok: true, status: 201, dado: {} }, 'POST /items': { ok: true, status: 201, dado: ITEM }, 'GET /items/MLB123': ITEM })
    const r = await enviar(SLUG, { api, raiz: p.raiz, agora: () => new Date('2026-10-01T12:00:00Z') })
    assert.deepEqual(api.chamadas.filter(c => typeof c === 'string' && c.startsWith('SUBIR')), ['SUBIR 01-capa.jpg', 'SUBIR 02-uso.jpg'])
    const criado = api.chamadas[api.chamadas.indexOf('POST /items') + 1]
    assert.deepEqual(criado.pictures, [{ id: 'foto-1' }, { id: 'foto-2' }])
    assert.equal(criado.status, 'paused')
    assert.ok(!api.chamadas.includes('PUT /items/MLB123'), 'pausou de novo o que ja nasceu pausado')
    assert.deepEqual(r.pendencias, [])
    assert.equal(r.estado, 'pausado')
    const canal = p.ler('publicacao').canais.find(c => c.canal === 'mercado-livre')
    assert.deepEqual(canal, { canal: 'mercado-livre', anuncio_id: 'MLB123', modalidade: 'classico', preco: 96.5, em: '2026-10-01', via: 'api', estado: 'pausado', link: ITEM.permalink, descricao: 'ok' })
    assert.deepEqual(p.ler('status').etapas.publicacao, { status: 'pausado', em: '2026-10-01', anuncio_id: 'MLB123' })
    assert.equal(p.ler('status').etapa_atual, 'auditado', 'publicado so depois que a pessoa ativa')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('enviar pausa em seguida quando o anuncio nasce ativo, e avisa em destaque se a pausa falha', async () => {
  const p = projeto()
  try {
    await montado(p)
    const ativo = { ...ITEM, status: 'active' }
    const api = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items/MLB123/description': { ok: true, status: 201, dado: {} }, 'POST /items': { ok: true, status: 201, dado: ativo }, 'PUT /items/MLB123': { ok: false, status: 500, dado: { message: 'erro interno' } }, 'GET /items/MLB123': ativo })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.ok(api.chamadas.includes('PUT /items/MLB123'))
    assert.equal(r.estado, 'ativo')
    assert.ok(r.pendencias.some(a => /ATENCAO/.test(a) && /ATIVO/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].estado, 'ativo', 'o estado gravado e o que a conta mostra')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('enviar recusa sem payload, com copy mudado depois do resumo e com anuncio ja publicado', async () => {
  const p = projeto()
  try {
    await assert.rejects(enviar(SLUG, { api: apiFalsa(), raiz: p.raiz }), /--montar antes/)
    await montado(p)
    const futuro = new Date(Date.now() + 60_000)
    utimesSync(join(p.pasta, 'copy.json'), futuro, futuro)
    await assert.rejects(enviar(SLUG, { api: apiFalsa(), raiz: p.raiz }), /mudaram depois do resumo/)
    writeFileSync(join(p.pasta, 'publicacao.json'), JSON.stringify({ slug: SLUG, erp: null, canais: [{ canal: 'mercado-livre', anuncio_id: 'MLB9', descricao: 'ok' }] }))
    await assert.rejects(enviar(SLUG, { api: apiFalsa(), raiz: p.raiz }), /ja foi publicado \(MLB9\)/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('enviar com validacao recusada nao cria nada', async () => {
  const p = projeto()
  try {
    await montado(p)
    const recusa = { ok: false, status: 400, dado: { cause: [{ type: 'error', code: 'item.coisa', message: 'ruim' }] } }
    const api = apiFalsa({ 'POST /items/validate': recusa })
    await assert.rejects(enviar(SLUG, { api, raiz: p.raiz }), /nada foi criado[\s\S]*item\.coisa/)
    assert.ok(!api.chamadas.includes('POST /items'))
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('queda de rede na criacao: nao repete, e o proximo --enviar acha o anuncio antes de criar outro', async () => {
  const p = projeto()
  try {
    await montado(p)
    const queda = Object.assign(new Error('a resposta do Mercado Livre nao chegou'), { semResposta: true })
    const api1 = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items': queda })
    await assert.rejects(enviar(SLUG, { api: api1, raiz: p.raiz, agora: () => new Date('2026-10-01T12:00:00Z') }), /Rode --enviar de novo/)
    assert.equal(api1.chamadas.filter(c => c === 'POST /items').length, 1)
    assert.ok(JSON.parse(readFileSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json'), 'utf8')).tentativa_em, 'a tentativa nao ficou marcada')

    const achado = { ...ITEM, date_created: '2026-10-01T12:00:05.000Z', price: 99.9 }
    const api2 = apiFalsa({
      'GET /users/me': { id: 42 },
      'GET /users/42/items/search': { results: ['MLB123'] },
      'GET /items/MLB123': achado,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
    })
    const r = await enviar(SLUG, { api: api2, raiz: p.raiz })
    assert.ok(!api2.chamadas.includes('POST /items'), 'criou em dobro')
    assert.ok(!api2.chamadas.some(c => typeof c === 'string' && c.startsWith('SUBIR')), 'subiu imagem de novo')
    assert.equal(r.anuncio_id, 'MLB123')
    assert.ok(r.avisos.some(a => /aproveitado/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].preco, 99.9, 'gravou o preco da conta')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('queda de rede sem anuncio achado: cria de novo, uma vez', async () => {
  const p = projeto()
  try {
    await montado(p)
    writeFileSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json'), JSON.stringify({ tentativa_em: '2026-10-01T12:00:00.000Z', titulo: 'Moedor Eletrico Inox' }))
    const api = apiFalsa({
      'GET /users/me': { id: 42 },
      'GET /users/42/items/search': { results: ['MLB7'] },
      'GET /items/MLB7': { id: 'MLB7', family_name: 'Outro produto', date_created: '2026-10-01T12:00:01.000Z' },
      'POST /items/validate': OK_VALIDA,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
      'POST /items': { ok: true, status: 201, dado: ITEM },
      'GET /items/MLB123': ITEM,
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz, agora: () => new Date('2026-10-01T12:15:00.000Z') })
    assert.equal(api.chamadas.filter(c => c === 'POST /items').length, 1)
    assert.equal(r.anuncio_id, 'MLB123')
    assert.ok(!existsSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json')), 'a marca ficou depois de dar certo')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('descricao que falha fica pendente, e o --enviar seguinte so grava a descricao', async () => {
  const p = projeto()
  try {
    await montado(p)
    const api1 = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items/MLB123/description': { ok: false, status: 500, dado: { message: 'erro' } }, 'POST /items': { ok: true, status: 201, dado: ITEM }, 'GET /items/MLB123': ITEM })
    const r1 = await enviar(SLUG, { api: api1, raiz: p.raiz })
    assert.equal(r1.pendencias.length, 1)
    assert.match(r1.pendencias[0], /descricao/)
    assert.equal(p.ler('publicacao').canais[0].descricao, 'pendente')
    const api2 = apiFalsa({ 'POST /items/MLB123/description': { ok: true, status: 201, dado: {} }, 'GET /items/MLB123/description': { plain_text: '' }, 'GET /items/MLB123': ITEM })
    const r2 = await enviar(SLUG, { api: api2, raiz: p.raiz })
    assert.deepEqual(api2.chamadas.filter(c => typeof c === 'string'), ['GET /items/MLB123/description', 'POST /items/MLB123/description', 'GET /items/MLB123'])
    assert.deepEqual(r2.pendencias, [])
    assert.equal(p.ler('publicacao').canais[0].descricao, 'ok')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('conferir fecha a etapa so com o anuncio ativo', async () => {
  const p = projeto()
  try {
    writeFileSync(join(p.pasta, 'publicacao.json'), JSON.stringify({ slug: SLUG, erp: null, canais: [{ canal: 'mercado-livre', anuncio_id: 'MLB123', estado: 'pausado', descricao: 'ok' }] }))
    const pausado = await conferir(SLUG, { api: apiFalsa({ 'GET /items/MLB123': { status: 'paused' } }), raiz: p.raiz })
    assert.equal(pausado.publicado, false)
    assert.notEqual(p.ler('status').etapa_atual, 'publicado')
    const ativo = await conferir(SLUG, { api: apiFalsa({ 'GET /items/MLB123': { status: 'active' } }), raiz: p.raiz, agora: () => new Date('2026-10-02T10:00:00') })
    assert.equal(ativo.publicado, true)
    assert.equal(p.ler('status').etapa_atual, 'publicado')
    assert.deepEqual(p.ler('status').etapas.publicacao, { status: 'ok', em: '2026-10-02', anuncio_id: 'MLB123' })
    assert.equal(p.ler('publicacao').canais[0].estado, 'ativo')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('POST /items 503: marca fica, proximo --enviar acha o anuncio', async () => {
  const p = projeto()
  try {
    await montado(p)
    const api1 = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items': { ok: false, status: 503, dado: { message: 'gateway timeout' } } })
    await assert.rejects(enviar(SLUG, { api: api1, raiz: p.raiz, agora: () => new Date('2026-10-01T12:00:00Z') }), /Rode --enviar de novo/)
    assert.ok(existsSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json')), 'a marca ficou')
    const achado = { ...ITEM, date_created: '2026-10-01T12:00:05.000Z' }
    const api2 = apiFalsa({
      'GET /users/me': { id: 42 },
      'GET /users/42/items/search': { results: ['MLB123'] },
      'GET /items/MLB123': achado,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
    })
    const r = await enviar(SLUG, { api: api2, raiz: p.raiz })
    assert.ok(!api2.chamadas.includes('POST /items'))
    assert.equal(r.anuncio_id, 'MLB123')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('queda de rede na criacao, copy muda, --montar de novo, --enviar acha pela marca', async () => {
  const p = projeto()
  try {
    await montado(p)
    const queda = Object.assign(new Error('a resposta do Mercado Livre nao chegou'), { semResposta: true })
    const api1 = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items': queda })
    await assert.rejects(enviar(SLUG, { api: api1, raiz: p.raiz, agora: () => new Date('2026-10-01T12:00:00Z') }), /Rode --enviar de novo/)
    const futuro = new Date(Date.now() + 60_000)
    utimesSync(join(p.pasta, 'copy.json'), futuro, futuro)
    await montar(SLUG, OPCOES, { api: apiFalsa({ ...LEITURAS, 'POST /items/validate': OK_VALIDA }), raiz: p.raiz })
    const achado = { ...ITEM, date_created: '2026-10-01T12:00:05.000Z' }
    const api2 = apiFalsa({
      'GET /users/me': { id: 42 },
      'GET /users/42/items/search': { results: ['MLB123'] },
      'GET /items/MLB123': achado,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
    })
    const r = await enviar(SLUG, { api: api2, raiz: p.raiz })
    assert.ok(!api2.chamadas.includes('POST /items'), 'criou em dobro')
    assert.equal(r.anuncio_id, 'MLB123')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('GET /items apos criacao lanca: sem erro, canal gravado com estado do pause, aviso para conferir', async () => {
  const p = projeto()
  try {
    await montado(p)
    const api = apiFalsa({
      'POST /items/validate': OK_VALIDA,
      'POST /items': { ok: true, status: 201, dado: ITEM },
      'PUT /items/MLB123': { ok: true, status: 200, dado: {} },
      'GET /items/MLB123': new Error('item nao achado'),
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.anuncio_id, 'MLB123')
    assert.equal(r.estado, 'pausado')
    assert.ok(r.avisos.some(a => /conferir/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].estado, 'pausado')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('pausa falha: ATENCAO vai pra pendencias', async () => {
  const p = projeto()
  try {
    await montado(p)
    const ativo = { ...ITEM, status: 'active' }
    const api = apiFalsa({
      'POST /items/validate': OK_VALIDA,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
      'POST /items': { ok: true, status: 201, dado: ativo },
      'PUT /items/MLB123': { ok: false, status: 500, dado: { message: 'erro interno' } },
      'GET /items/MLB123': ativo,
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.estado, 'ativo')
    assert.ok(r.pendencias.some(a => /ATENCAO/.test(a) && /ATIVO/.test(a)))
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('busca de duplicado com resultado que lanca e outro que casa: aproveita o que casa', async () => {
  const p = projeto()
  try {
    await montado(p)
    writeFileSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json'), JSON.stringify({ tentativa_em: '2026-10-01T12:00:00.000Z', titulo: 'Moedor Eletrico Inox' }))
    const achado = { ...ITEM, date_created: '2026-10-01T12:00:05.000Z' }
    const api = apiFalsa({
      'GET /users/me': { id: 42 },
      'GET /users/42/items/search': { results: ['MLB999', 'MLB123'] },
      'GET /items/MLB999': new Error('nao achado'),
      'GET /items/MLB123': achado,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.anuncio_id, 'MLB123')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('titulo que volta com caixa ou acento diferente: busca aproveita', async () => {
  const p = projeto()
  try {
    await montado(p)
    writeFileSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json'), JSON.stringify({ tentativa_em: '2026-10-01T12:00:00.000Z', titulo: 'Moedor Eletrico Inox' }))
    const caixa = { ...ITEM, family_name: 'MOEDOR ELETRICO INOX', date_created: '2026-10-01T12:00:05.000Z' }
    const api = apiFalsa({
      'GET /users/me': { id: 42 },
      'GET /users/42/items/search': { results: ['MLB123'] },
      'GET /items/MLB123': caixa,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.anuncio_id, 'MLB123')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('descricao pendente com GET /items/MLB123/description devolvendo plain_text: marca ok sem postar', async () => {
  const p = projeto()
  try {
    await montado(p)
    writeFileSync(join(p.pasta, 'publicacao.json'), JSON.stringify({ slug: SLUG, erp: null, canais: [{ canal: 'mercado-livre', anuncio_id: 'MLB123', estado: 'pausado', descricao: 'pendente' }] }))
    const api = apiFalsa({
      'GET /items/MLB123/description': { plain_text: 'Descricao do moedor' },
      'GET /items/MLB123': ITEM,
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.ok(!api.chamadas.includes('POST /items/MLB123/description'), 'repostou a descricao')
    assert.deepEqual(r.pendencias, [])
    assert.equal(p.ler('publicacao').canais[0].descricao, 'ok')
    assert.equal(r.estado, 'pausado')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('POST /items 400 com erro: marca some', async () => {
  const p = projeto()
  try {
    await montado(p)
    const recusa = { ok: false, status: 400, dado: { cause: [{ type: 'error', code: 'item.coisa', message: 'ruim' }] } }
    const api = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items': recusa })
    await assert.rejects(enviar(SLUG, { api, raiz: p.raiz }), /nada foi criado/)
    assert.ok(!existsSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json')), 'a marca foi apagada')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('POST /items ok mas sem id: lanca pedindo --enviar de novo, marca fica', async () => {
  const p = projeto()
  try {
    await montado(p)
    const semId = { ok: true, status: 201, dado: {} }
    const api = apiFalsa({ 'POST /items/validate': OK_VALIDA, 'POST /items': semId })
    await assert.rejects(enviar(SLUG, { api, raiz: p.raiz, agora: () => new Date('2026-10-01T12:00:00Z') }), /Rode --enviar de novo/)
    assert.ok(existsSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json')), 'a marca ficou')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('nasce ativo, pausa ok, leitura de volta lanca: grava pausado em ambos os arquivos, aviso pra conferir', async () => {
  const p = projeto()
  try {
    await montado(p)
    const ativo = { ...ITEM, status: 'active' }
    const api = apiFalsa({
      'POST /items/validate': OK_VALIDA,
      'POST /items/MLB123/description': { ok: true, status: 201, dado: {} },
      'POST /items': { ok: true, status: 201, dado: ativo },
      'PUT /items/MLB123': { ok: true, status: 200, dado: {} },
      'GET /items/MLB123': new Error('item nao achado'),
    })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.estado, 'pausado')
    assert.ok(r.avisos.some(a => /conferir/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].estado, 'pausado')
    assert.equal(p.ler('status').etapas.publicacao.status, 'pausado')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

const LEITURA_PAUSA = { 'POST /items/validate': OK_VALIDA, 'POST /items/MLB123/description': { ok: true, status: 201, dado: {} } }

test('nasce em revisao e a pausa falha: grava em revisao, sem ATENCAO, avisa pra nao ativar', async () => {
  const p = projeto()
  try {
    await montado(p)
    const revisao = { ...ITEM, status: 'under_review' }
    const api = apiFalsa({ ...LEITURA_PAUSA, 'POST /items': { ok: true, status: 201, dado: revisao }, 'PUT /items/MLB123': { ok: false, status: 400, dado: { message: 'em revisao' } }, 'GET /items/MLB123': revisao })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.estado, 'em revisao')
    assert.ok(!r.pendencias.some(a => /ATENCAO/.test(a)))
    assert.ok(r.avisos.some(a => /em revisao/.test(a) && /nao ative nada/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].estado, 'em revisao')
    assert.equal(p.ler('status').etapas.publicacao.status, 'em revisao')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('pausa deu certo mas a leitura de volta mostra ativo: ATENCAO e estado ativo', async () => {
  const p = projeto()
  try {
    await montado(p)
    const ativo = { ...ITEM, status: 'active' }
    const api = apiFalsa({ ...LEITURA_PAUSA, 'POST /items': { ok: true, status: 201, dado: ativo }, 'PUT /items/MLB123': { ok: true, status: 200, dado: {} }, 'GET /items/MLB123': ativo })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.equal(r.estado, 'ativo')
    assert.ok(r.pendencias.some(a => /ATENCAO/.test(a) && /ATIVO/.test(a) && /Pause agora/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].estado, 'ativo')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

function comCanalPendente(p, estado) {
  writeFileSync(join(p.pasta, 'publicacao.json'), JSON.stringify({ slug: SLUG, erp: null, canais: [{ canal: 'mercado-livre', anuncio_id: 'MLB123', estado, descricao: 'pendente' }] }))
}

test('descricao pendente, anuncio ativo e pausa nunca confirmada: pausa agora', async () => {
  const p = projeto()
  try {
    await montado(p)
    comCanalPendente(p, 'ativo')
    const api = apiFalsa({ 'GET /items/MLB123/description': { plain_text: 'x' }, 'GET /items/MLB123': { ...ITEM, status: 'active' }, 'PUT /items/MLB123': { ok: true, status: 200, dado: {} } })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.ok(api.chamadas.includes('PUT /items/MLB123'), 'nao pausou')
    assert.equal(r.estado, 'pausado')
    assert.equal(p.ler('publicacao').canais[0].estado, 'pausado')
    assert.ok(!r.pendencias.some(a => /ATENCAO/.test(a)))
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
  const q = projeto()
  try {
    await montado(q)
    comCanalPendente(q, 'ativo')
    const api = apiFalsa({ 'GET /items/MLB123/description': { plain_text: 'x' }, 'GET /items/MLB123': { ...ITEM, status: 'active' }, 'PUT /items/MLB123': { ok: false, status: 500, dado: { message: 'erro' } } })
    const r = await enviar(SLUG, { api, raiz: q.raiz })
    assert.ok(r.pendencias.some(a => /ATENCAO/.test(a)))
    assert.equal(q.ler('publicacao').canais[0].estado, 'ativo')
  } finally {
    rmSync(q.raiz, { recursive: true, force: true })
  }
})

test('descricao pendente, canal gravado pausado e anuncio ativo: foi a pessoa, nao pausa nem grita', async () => {
  const p = projeto()
  try {
    await montado(p)
    comCanalPendente(p, 'pausado')
    const api = apiFalsa({ 'GET /items/MLB123/description': { plain_text: 'x' }, 'GET /items/MLB123': { ...ITEM, status: 'active' } })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.ok(!api.chamadas.includes('PUT /items/MLB123'), 'pausou o que a pessoa ativou')
    assert.deepEqual(r.pendencias, [])
    assert.equal(r.estado, 'ativo')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('marca recente e busca vazia: nao cria, manda esperar; marca velha: cria uma vez', async () => {
  const p = projeto()
  try {
    await montado(p)
    writeFileSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json'), JSON.stringify({ tentativa_em: '2026-10-01T12:00:00.000Z', titulo: 'Moedor Eletrico Inox' }))
    const rotas = { 'GET /users/me': { id: 42 }, 'GET /users/42/items/search': { results: [] }, ...LEITURA_PAUSA, 'POST /items': { ok: true, status: 201, dado: ITEM }, 'GET /items/MLB123': ITEM }
    const api = apiFalsa(rotas)
    await assert.rejects(enviar(SLUG, { api, raiz: p.raiz, agora: () => new Date('2026-10-01T12:02:00.000Z') }), /depois das/)
    assert.ok(!api.chamadas.some(c => typeof c === 'string' && c.startsWith('SUBIR')), 'subiu imagem')
    assert.ok(!api.chamadas.includes('POST /items'), 'criou em dobro')
    assert.ok(existsSync(join(p.raiz, 'anuncios', SLUG, 'ml-tentativa.json')), 'a marca sumiu')
    const api2 = apiFalsa(rotas)
    await enviar(SLUG, { api: api2, raiz: p.raiz, agora: () => new Date('2026-10-01T12:15:00.000Z') })
    assert.equal(api2.chamadas.filter(c => c === 'POST /items').length, 1)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('conferir grava o estado real tambem quando o anuncio nao esta ativo', async () => {
  const p = projeto()
  try {
    writeFileSync(join(p.pasta, 'publicacao.json'), JSON.stringify({ slug: SLUG, erp: null, canais: [{ canal: 'mercado-livre', anuncio_id: 'MLB123', estado: 'pausado', descricao: 'ok' }] }))
    const r = await conferir(SLUG, { api: apiFalsa({ 'GET /items/MLB123': { status: 'under_review' } }), raiz: p.raiz, agora: () => new Date('2026-10-02T10:00:00') })
    assert.equal(r.publicado, false)
    assert.equal(p.ler('publicacao').canais[0].estado, 'em revisao')
    assert.deepEqual(p.ler('status').etapas.publicacao, { status: 'em revisao', em: '2026-10-02', anuncio_id: 'MLB123' })
    assert.notEqual(p.ler('status').etapa_atual, 'publicado')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('descricao pendente de anuncio que a pessoa ja publicou: nao pausa, nao grita, mantem a etapa ok', async () => {
  const p = projeto()
  try {
    await montado(p)
    comCanalPendente(p, 'ativo')
    const status = p.ler('status')
    writeFileSync(join(p.pasta, 'status.json'), JSON.stringify({ ...status, etapa_atual: 'publicado', etapas: { ...status.etapas, publicacao: { status: 'ok', em: '2026-10-02', anuncio_id: 'MLB123' } } }))
    const api = apiFalsa({ 'GET /items/MLB123/description': { plain_text: '' }, 'POST /items/MLB123/description': { ok: true, status: 201, dado: {} }, 'GET /items/MLB123': { ...ITEM, status: 'active' }, 'PUT /items/MLB123': { ok: true, status: 200, dado: {} } })
    const r = await enviar(SLUG, { api, raiz: p.raiz })
    assert.ok(!api.chamadas.includes('PUT /items/MLB123'), 'pausou anuncio publicado')
    assert.ok(!r.pendencias.some(a => /ATENCAO/.test(a)))
    assert.equal(p.ler('publicacao').canais[0].descricao, 'ok')
    assert.equal(p.ler('status').etapa_atual, 'publicado')
    assert.equal(p.ler('status').etapas.publicacao.status, 'ok')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})
