// Testes do cadastro no Bling. Nada vai pra rede: o req falso grava cada chamada e responde por roteiro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerCsv, textoParaHtml, prefixoDoSku, proximoNumero, dimensoesDe, montarPayload, separar, resumo, proximoSkuLivre, enviar, jaCadastrado, possiveisDuplicados, argumentos } from './cadastrar.mjs'

const copy = { titulo: 'Suspiro Tradicional 1 kg Doce Pra Festa', descricao: 'Linha 1\nLinha 2 & <3>', precos: { ml_classico: 54.9, ml_premium: 59.9 }, gtin: '7890000000000', ncm: '1905.90.90', ficha: { Marca: 'Sem marca' } }
const linha = { status: 'OK', categoria: 'doces', produto: 'Suspiro Tradicional 1 kg', ean: '7890000000000', custo: '30.00', peso_g: '1050', dimensoes_cm: '30x20x10' }
const decisao = { tipo: 'individual', categoria: 'doces', custo_total: 30 }
const config = { sku_prefixo: 'LOJA', deposito_id: '777' }

test('lerCsv entende aspas, aspas dobradas, virgula dentro e CRLF', () => {
  const t = 'status,produto,observacao\r\nOK,"Bala, coco","disse ""oi"""\r\nBLOQUEADO,Fone,\r\n'
  assert.deepEqual(lerCsv(t), [{ status: 'OK', produto: 'Bala, coco', observacao: 'disse "oi"' }, { status: 'BLOQUEADO', produto: 'Fone', observacao: '' }])
})

test('textoParaHtml escapa e troca quebra por <br>, e respeita HTML pronto', () => {
  assert.equal(textoParaHtml('a & b\n<c>'), 'a &amp; b<br>&lt;c&gt;')
  assert.equal(textoParaHtml('<p>pronto</p>'), '<p>pronto</p>')
})

test('prefixo e numero do SKU', () => {
  assert.equal(prefixoDoSku('loja', 'Doces'), 'LOJA-DOC-')
  assert.equal(prefixoDoSku('LOJA', 'casa-e-cozinha'), 'LOJA-CAS-')
  assert.throws(() => prefixoDoSku('', 'doces'), /sku_prefixo/)
  assert.equal(proximoNumero('LOJA-DOC-009'), 'LOJA-DOC-010')
  assert.equal(proximoNumero('SEMNUMERO'), null)
  assert.deepEqual(dimensoesDe('30x20x10'), { profundidade: 30, largura: 20, altura: 10, unidadeMedida: 1 })
  assert.equal(dimensoesDe(''), null)
})

test('montarPayload de produto individual leva tudo que tem e so pendencia de imagem fica pro envio', () => {
  const { payload, pendencias } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico', estoque: 10, cnpj: '00.000.000/0001-00' })
  assert.deepEqual(payload, {
    nome: copy.titulo, tipo: 'P', situacao: 'A', formato: 'S', condicao: 1, preco: 54.9, unidade: 'UN',
    descricaoCurta: 'Linha 1<br>Linha 2 &amp; &lt;3&gt;', categoria: { id: 123 }, gtin: '7890000000000', marca: 'Sem marca',
    pesoLiquido: 1.05, pesoBruto: 1.05, dimensoes: { profundidade: 30, largura: 20, altura: 10, unidadeMedida: 1 },
    _skuPrefix: 'LOJA-DOC-', _ncm: '1905.90.90', _depositoId: 777, _estoque: 10, _fornecedor: { cnpj: '00.000.000/0001-00', custo: 30 },
  })
  assert.deepEqual(pendencias, [])
})

test('montarPayload de kit deixa GTIN, peso e medida de fora e explica cada um', () => {
  const kit = { ...copy, gtin: null, ncm: null }
  const { payload, pendencias } = montarPayload({ copy: kit, decisao: { tipo: 'kit', categoria: 'doces', custo_total: 22.5 }, linha: null, config, categoriaId: 123, modalidade: 'premium' })
  assert.equal(payload.preco, 59.9)
  for (const campo of ['gtin', 'pesoLiquido', 'dimensoes', '_ncm', '_fornecedor', '_estoque']) assert.ok(!(campo in payload), campo)
  assert.ok(pendencias.length > 0)
  assert.ok(pendencias.some(p => /kit montado/.test(p)))
  assert.ok(pendencias.some(p => /CNPJ/.test(p)))
})

test('montarPayload recusa o que falta de verdade', () => {
  assert.throws(() => montarPayload({ copy: { descricao: 'x' }, decisao, linha, config, categoriaId: 1, modalidade: 'classico' }), /montar-anuncio/)
  assert.throws(() => montarPayload({ copy, decisao, linha, config, categoriaId: null, modalidade: 'classico' }), /--categorias/)
  assert.throws(() => montarPayload({ copy, decisao, linha, config: {}, categoriaId: 1, modalidade: 'classico' }), /sku_prefixo/)
  assert.throws(() => montarPayload({ copy: { ...copy, precos: {} }, decisao, linha, config, categoriaId: 1, modalidade: 'classico' }), /ml_classico/)
})

test('separar tira os campos com _ e o resumo mostra o SKU por gerar', () => {
  const { payload, pendencias } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const { corpo, aux } = separar(payload)
  assert.ok(Object.keys(corpo).every(k => !k.startsWith('_')))
  assert.equal(aux._skuPrefix, 'LOJA-DOC-')
  const r = resumo(payload, pendencias)
  assert.ok(r.length > 0)
  assert.match(r, /LOJA-DOC-<proximo livre>/)
  assert.match(r, /R\$ 54,90/)
})

// req falso: cada chamada entra em `feitas`; `responder` decide a resposta ou lanca.
function reqFalso(responder) {
  const feitas = []
  const req = async (metodo, caminho, opcoes = {}) => { feitas.push({ metodo, caminho, ...opcoes }); return responder(metodo, caminho, opcoes, feitas) }
  return { req, feitas }
}

test('proximoSkuLivre acha o maior numero do prefixo, ignorando codigo de outro prefixo', async () => {
  const { req } = reqFalso(() => ({ data: [{ codigo: 'LOJA-DOC-001' }, { codigo: 'LOJA-DOC-007' }, { codigo: 'OUTRA-DOC-050' }, { codigo: null }] }))
  assert.equal(await proximoSkuLivre('LOJA-DOC-', req), 'LOJA-DOC-008')
})

test('enviar cria, aplica NCM, lanca estoque no deposito que existe e vincula o custo', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico', estoque: 10, cnpj: '00.000.000/0001-00' })
  const { req, feitas } = reqFalso((m, c) => {
    if (m === 'GET' && c === '/produtos') return { data: [] }
    if (m === 'POST' && c === '/produtos') return { data: { id: 555 } }
    if (m === 'GET' && c === '/depositos') return { data: [{ id: 777 }] }
    if (m === 'GET' && c === '/contatos') return { data: [{ id: 42 }] }
    return null
  })
  const r = await enviar(payload, { req })
  assert.equal(r.id, 555)
  assert.equal(r.sku, 'LOJA-DOC-001')
  assert.deepEqual(feitas.map(f => `${f.metodo} ${f.caminho}`), ['GET /produtos', 'POST /produtos', 'PATCH /produtos/555', 'GET /depositos', 'POST /estoques', 'GET /contatos', 'POST /produtos/fornecedores'])
  const post = feitas[1].corpo
  assert.ok(Object.keys(post).every(k => !k.startsWith('_')))
  assert.equal(feitas[5].query.numeroDocumento, '00000000000100')
  assert.equal(feitas[6].corpo.idContato, 42)
  assert.equal(feitas[6].corpo.precoCusto, 30)
  assert.equal(r.pendencias.length, 1)
})

test('enviar anda o numero quando o SKU ja existe', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  let posts = 0
  const { req, feitas } = reqFalso((m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') { posts++; if (posts < 3) throw new Error('o Bling recusou POST /produtos: 400 {"description":"O código LOJA-DOC já foi cadastrado"}'); return { data: { id: 9 } } }
    return null
  })
  const r = await enviar(payload, { req })
  assert.equal(r.sku, 'LOJA-DOC-003')
  assert.equal(feitas.filter(f => f.caminho === '/produtos' && f.metodo === 'POST').length, 3)
})

test('enviar nao lanca estoque em deposito que sumiu, e erro que nao e de SKU sobe', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico', estoque: 5 })
  const { req, feitas } = reqFalso((m, c) => {
    if (m === 'GET' && c === '/depositos') return { data: [{ id: 1 }] }
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') return { data: { id: 9 } }
    return null
  })
  const r = await enviar(payload, { req })
  assert.ok(!feitas.some(f => f.caminho === '/estoques'))
  assert.ok(r.pendencias.some(p => /deposito 777/.test(p)))
  const ruim = reqFalso(m => { if (m === 'GET') return { data: [] }; throw new Error('o Bling recusou POST /produtos: 400 {"description":"preco invalido"}') })
  await assert.rejects(enviar(payload, { req: ruim.req }), /preco invalido/)
})

test('enviar chama aoCriar uma vez com id e SKU logo depois do POST', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const chamadas = []
  const { req, feitas } = reqFalso((m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') return { data: { id: 555 } }
    return null
  })
  await enviar(payload, { req, aoCriar: x => chamadas.push({ ...x, depoisDe: feitas.length }) })
  assert.deepEqual(chamadas, [{ id: 555, sku: 'LOJA-DOC-001', depoisDe: 2 }])
})

test('aoCriar que falha nao derruba o envio e vira a primeira pendencia com id e SKU', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const logs = []
  const { req } = reqFalso((m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') return { data: { id: 555 } }
    return null
  })
  const r = await enviar(payload, { req, log: m => logs.push(m), aoCriar: () => { throw new Error('disco cheio') } })
  assert.equal(r.id, 555)
  assert.ok(r.pendencias.length > 0)
  assert.match(r.pendencias[0], /id 555/)
  assert.match(r.pendencias[0], /LOJA-DOC-001/)
  assert.match(r.pendencias[0], /disco cheio/)
  assert.match(r.pendencias[0], /duplica/)
  assert.ok(logs.some(l => /id 555/.test(l) && /duplica/.test(l)), 'o aviso sai na hora pelo log')
})

test('PATCH de NCM que falha vira pendencia e o resultado ainda traz o id', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const { req } = reqFalso((m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') return { data: { id: 555 } }
    if (m === 'PATCH') throw new Error('o Bling recusou PATCH /produtos/555: 400 {"description":"NCM invalido"}')
    return null
  })
  const r = await enviar(payload, { req })
  assert.equal(r.id, 555)
  assert.ok(r.pendencias.length > 0)
  assert.ok(r.pendencias.some(p => /NCM nao aplicado/.test(p) && /NCM invalido/.test(p)))
})

test('possiveisDuplicados junta a busca por nome e por GTIN sem repetir id', async () => {
  const { req, feitas } = reqFalso((m, c, o) => {
    if (o.query.pesquisa === 'Suspiro 1 kg') return { data: [{ id: 1, codigo: 'LOJA-DOC-001', nome: 'Suspiro 1 kg' }, { id: 2, codigo: 'X', nome: 'Suspiro 1 kg antigo' }] }
    return { data: [{ id: 2, codigo: 'X', nome: 'Suspiro 1 kg antigo' }, { id: 3, codigo: 'Y', nome: 'Outro com o mesmo GTIN', preco: 9 }] }
  })
  const r = await possiveisDuplicados(req, { nome: 'Suspiro 1 kg', gtin: '7890000000000' })
  assert.deepEqual(feitas.map(f => f.query.pesquisa), ['Suspiro 1 kg', '7890000000000'])
  assert.deepEqual(r, [{ id: 1, codigo: 'LOJA-DOC-001', nome: 'Suspiro 1 kg' }, { id: 2, codigo: 'X', nome: 'Suspiro 1 kg antigo' }, { id: 3, codigo: 'Y', nome: 'Outro com o mesmo GTIN' }])
  const avisos = []
  assert.deepEqual(await possiveisDuplicados(async () => { throw new Error('401') }, { nome: 'a', log: m => avisos.push(m) }), [])
  assert.equal(avisos.length, 1)
})

test('argumentos: --estoque sem numero e erro, com numero passa', () => {
  assert.throws(() => argumentos(['--montar', 'kit', '--estoque']), /faltou o numero de --estoque/)
  assert.throws(() => argumentos(['--montar', 'kit', '--estoque', '--outro']), /faltou o numero de --estoque/)
  assert.deepEqual(argumentos(['--montar', 'kit', '--estoque', '4']), { acao: 'montar', slug: 'kit', estoque: 4 })
  assert.deepEqual(argumentos(['--montar', 'kit']), { acao: 'montar', slug: 'kit', estoque: null })
})

test('jaCadastrado recusa pelo bloco erp ou pelo status, e deixa passar anuncio novo', () => {
  assert.match(jaCadastrado('kit', { erp: { id: 555 } }, {}), /ja foi cadastrado no Bling com id 555/)
  assert.match(jaCadastrado('kit', null, { etapas: { cadastro: { status: 'ok', bling_id: 9 } } }), /id 9; pra refazer/)
  assert.equal(jaCadastrado('kit', { slug: 'kit', canais: [] }, { etapas: {} }), null)
})
