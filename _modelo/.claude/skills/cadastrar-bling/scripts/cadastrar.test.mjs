// Testes do cadastro no Bling. Nada vai pra rede: o req falso grava cada chamada e responde por roteiro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lerCsv, textoParaHtml, prefixoDoSku, proximoNumero, dimensoesDe, montarPayload, separar, resumo, proximoSkuLivre, enviar, jaCadastrado, possiveisDuplicados, argumentos, montarLote, resumoLote, enviarLote, conferirNoBling, resumoEnvioLote, montarUm, payloadParaEnviar } from './cadastrar.mjs'
import { carimbosDoAnuncio } from '../../mercado-livre/scripts/lib/pipeline.mjs'

// Projeto de mentira numa pasta temporaria (apagada no finally de quem chama), auditado e carimbado.
function projetoBling({ nomeNaDecisao = 'Suspiro Tradicional 1 kg' } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'cadastrar-'))
  const pasta = join(raiz, 'dados', 'pipeline', 'suspiro')
  mkdirSync(pasta, { recursive: true })
  mkdirSync(join(raiz, 'fornecedores', 'forn'), { recursive: true })
  const j = (n, v) => writeFileSync(join(pasta, `${n}.json`), JSON.stringify(v))
  j('status', { slug: 'suspiro', fornecedor: 'forn', categoria: 'doces' })
  j('copy', copy)
  j('decisao', { tipo: 'individual', composicao: [{ produto: nomeNaDecisao, qtd: 1 }], custo_total: 30 })
  j('auditoria', { veredito: 'aprovado', modalidade_escolhida: 'classico', em: '2026-10-08', carimbos: carimbosDoAnuncio(pasta) })
  writeFileSync(join(raiz, 'fornecedores', 'forn', 'bling.json'), JSON.stringify({ cnpj: '00.000.000/0001-00', categorias: { doces: 123 } }))
  writeFileSync(join(raiz, 'fornecedores', 'forn', 'catalogo-analisado.csv'), 'status,categoria,produto,ean,custo,peso_g,dimensoes_cm\nOK,doces,Suspiro Tradicional 1 kg,,30.00,1050,30x20x10\n')
  return { raiz, pasta }
}
const semBling = async () => ({ data: [] })

const copy = { titulo: 'Suspiro Tradicional 1 kg Doce Pra Festa', descricao: 'Linha 1\nLinha 2 & <3>', precos: { ml_classico: 54.9, ml_premium: 59.9 }, gtin: '7890000000000', ncm: '1905.90.90', ficha: { Marca: 'Genérica' } }
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
    descricaoCurta: 'Linha 1<br>Linha 2 &amp; &lt;3&gt;', categoria: { id: 123 }, gtin: '7890000000000', marca: 'Genérica',
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

test('argumentos: --montar-lote e --enviar-lote separam por virgula e cortam espaco e vazio', () => {
  assert.deepEqual(argumentos(['--montar-lote', 'a,b, c']), { acao: 'montar-lote', slugs: ['a', 'b', 'c'] })
  assert.deepEqual(argumentos(['--enviar-lote', 'x,,y']), { acao: 'enviar-lote', slugs: ['x', 'y'] })
})

test('montarLote monta cada slug na ordem e nao derruba o lote quando um da erro', async () => {
  const montar = async slug => {
    if (slug === 'ruim') throw new Error('sem copy.json: rode a /montar-anuncio antes')
    const { payload, pendencias } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
    return { payload, pendencias, dup: slug === 'dup' ? [{ id: 1, codigo: 'X', nome: 'Outro' }] : [] }
  }
  const linhas = await montarLote(['ok', 'ruim', 'dup'], { montar, config, req: async () => ({ data: [] }), apagar: () => {} })
  assert.deepEqual(linhas.map(l => l.slug), ['ok', 'ruim', 'dup'])
  assert.equal(linhas[0].ok, true)
  assert.equal(linhas[0].duplicado, false)
  assert.equal(linhas[1].ok, false)
  assert.match(linhas[1].motivo, /sem copy\.json/)
  assert.equal(linhas[2].ok, true)
  assert.equal(linhas[2].duplicado, true)
})

test('resumoLote mostra uma linha por produto, o motivo de quem nao montou e o total', () => {
  const linhas = [
    { slug: 'a', ok: true, nome: 'Produto A', sku: 'LOJA-DOC-<proximo livre>', preco: 10, duplicado: false, pendencias: [] },
    { slug: 'b', ok: true, nome: 'Produto B', sku: 'LOJA-DOC-<proximo livre>', preco: 20, duplicado: true, pendencias: ['GTIN vazio'] },
    { slug: 'c', ok: false, motivo: 'sem copy.json' },
  ]
  const r = resumoLote(linhas)
  assert.match(r, /a: Produto A/)
  assert.match(r, /duplicado: nao/)
  assert.match(r, /b: Produto B/)
  assert.match(r, /duplicado: sim/)
  assert.match(r, /pendencias: 1/)
  assert.match(r, /c: nao montou \(sem copy\.json\)/)
  assert.match(r, /Total: 3 produtos, 2 montados, 1 com erro/)
})

test('enviarLote pula quem ja esta cadastrado, envia o resto e para no primeiro erro', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const gravados = []
  const carregar = slug => {
    if (slug === 'jacadastrado') return { recusa: 'ja foi cadastrado no Bling com id 1' }
    return { pasta: `/pipeline/${slug}`, payload }
  }
  let posts = 0
  const req = async (m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') {
      posts++
      if (posts === 2) throw new Error('o Bling recusou POST /produtos: 400 {"description":"preco invalido"}')
      return { data: { id: 100 + posts } }
    }
    return null
  }
  const gravar = (slug, pasta, dados) => gravados.push({ slug, pasta, ...dados })
  const resultado = await enviarLote(['ok1', 'jacadastrado', 'ruim', 'nunca-chega'], { carregar, req, gravar })
  assert.equal(resultado.planejados, 4)
  assert.deepEqual(resultado.jaEstavam, ['jacadastrado'])
  assert.deepEqual(resultado.criados.map(c => c.slug), ['ok1'])
  assert.equal(resultado.parouEm, 'ruim')
  assert.match(resultado.erro, /preco invalido/)
  assert.equal(gravados.length, 1)
  assert.equal(gravados[0].slug, 'ok1')
  assert.equal(gravados[0].pasta, '/pipeline/ok1')
})

test('enviarLote: carregar que lanca (slug sem --montar) para o lote sem perder quem ja foi criado', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const gravados = []
  const postos = []
  const carregar = slug => {
    if (slug === 'semmontar') throw new Error('nao existe anuncios/semmontar/bling-payload.json: rode --montar antes')
    return { pasta: `/pipeline/${slug}`, payload }
  }
  const req = async (m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') { postos.push(c); return { data: { id: 777 } } }
    return null
  }
  const gravar = (slug, pasta, dados) => gravados.push({ slug, pasta, ...dados })
  const resultado = await enviarLote(['ok1', 'semmontar'], { carregar, req, gravar })
  assert.equal(resultado.planejados, 2)
  assert.deepEqual(resultado.criados.map(c => c.slug), ['ok1'])
  assert.equal(resultado.parouEm, 'semmontar')
  assert.match(resultado.erro, /rode --montar antes/)
  assert.equal(gravados.length, 1)
  assert.equal(postos.length, 1)
})

// req que cria tudo e deixa o PATCH de NCM falhar: vira pendencia comum, o lote segue.
const reqComNcmRuim = () => {
  let id = 200
  return async (m, c) => {
    if (m === 'GET') return { data: [] }
    if (m === 'POST' && c === '/produtos') return { data: { id: ++id } }
    if (m === 'PATCH') throw new Error('NCM invalido')
    return null
  }
}

test('enviarLote: pendencia comum aparece no resumo por produto e o lote segue', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const carregar = slug => ({ pasta: `/pipeline/${slug}`, payload: structuredClone(payload) })
  const resultado = await enviarLote(['a', 'b'], { carregar, req: reqComNcmRuim(), gravar: () => {} })
  assert.deepEqual(resultado.criados.map(c => c.slug), ['a', 'b'])
  assert.equal(resultado.parouEm, null)
  const r = resumoEnvioLote(resultado, [{ id: 201, achou: true }, { id: 202, achou: true }])
  assert.match(r, /a: id 201, SKU LOJA-DOC-001/)
  assert.match(r, /b: id 202, SKU LOJA-DOC-001/)
  assert.match(r, /NCM nao aplicado.*NCM invalido/)
  assert.doesNotMatch(r, /Parou em/)
})

test('enviarLote: aoCriar que falha (ATENCAO) para o lote nesse slug e o aviso sai no resumo', async () => {
  const { payload } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
  const carregar = slug => ({ pasta: `/pipeline/${slug}`, payload: structuredClone(payload) })
  const gravar = slug => { if (slug === 'b') throw new Error('disco cheio') }
  const resultado = await enviarLote(['a', 'b', 'c'], { carregar, req: reqComNcmRuim(), gravar })
  assert.deepEqual(resultado.criados.map(c => c.slug), ['a', 'b'])
  assert.equal(resultado.parouEm, 'b')
  assert.match(resultado.erro, /^ATENCAO/)
  assert.match(resultado.erro, /disco cheio/)
  const r = resumoEnvioLote(resultado, [{ id: 201, achou: true }, { id: 202, achou: true }])
  assert.match(r, /Parou em: b \(ATENCAO: o produto foi criado no Bling \(id 202/)
  assert.match(r, /b: id 202, SKU LOJA-DOC-001/)
})

test('montarLote apaga o bling-payload.json velho de quem nao montou', async () => {
  const montar = async slug => {
    if (slug === 'ruim') throw new Error('auditoria nao aprovada')
    const { payload, pendencias } = montarPayload({ copy, decisao, linha, config, categoriaId: 123, modalidade: 'classico' })
    return { payload, pendencias, dup: [] }
  }
  const apagados = []
  await montarLote(['ok', 'ruim'], { montar, config, req: async () => ({ data: [] }), apagar: slug => apagados.push(slug) })
  assert.deepEqual(apagados, ['ruim'])
})

test('conferirNoBling confere cada id e aponta o que nao achou', async () => {
  const req = async (m, c) => {
    if (c === '/produtos/1') return { data: { id: 1 } }
    if (c === '/produtos/2') throw new Error('404')
    return { data: null }
  }
  const r = await conferirNoBling(req, [1, 2, 3])
  assert.deepEqual(r, [{ id: 1, achou: true }, { id: 2, achou: false, erro: '404' }, { id: 3, achou: false }])
})

test('resumoEnvioLote mostra os numeros e onde parou', () => {
  const resultado = { planejados: 4, criados: [{ slug: 'a', id: 1, sku: 'X' }], jaEstavam: ['b'], parouEm: 'c', erro: 'preco invalido' }
  const conferidos = [{ id: 1, achou: true }]
  const r = resumoEnvioLote(resultado, conferidos)
  assert.match(r, /Planejados:\s+4/)
  assert.match(r, /Criados agora:\s+1/)
  assert.match(r, /Ja estavam:\s+1/)
  assert.match(r, /Conferidos no Bling: 1\/1/)
  assert.match(r, /Parou em: c \(preco invalido\)/)
})

test('montarUm recusa copy mudado depois da auditoria', async () => {
  const p = projetoBling()
  try {
    const ok = await montarUm('suspiro', { config, req: semBling, raiz: p.raiz })
    assert.equal(ok.payload.nome, copy.titulo, 'canario: auditado em dia monta')
    writeFileSync(join(p.pasta, 'copy.json'), JSON.stringify({ ...copy, titulo: 'Outro titulo' }))
    await assert.rejects(montarUm('suspiro', { config, req: semBling, raiz: p.raiz }), /copy\.json mudou depois da auditoria/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('montarUm com nome da decisao diferente do CSV vira pendencia', async () => {
  const p = projetoBling({ nomeNaDecisao: 'Suspiro tradicional 1 kg' })
  try {
    const r = await montarUm('suspiro', { config, req: semBling, raiz: p.raiz })
    assert.ok(r.pendencias.some(x => x.includes('"Suspiro tradicional 1 kg" da decisao.json nao casou')), r.pendencias.join(' | '))
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('montarPayload: marca de fabricante sem marca_autorizada trava; Genérica e marca autorizada passam', () => {
  const fabricante = { ...copy, ficha: { Marca: 'Acme' } }
  assert.throws(() => montarPayload({ copy: fabricante, decisao, linha, config, categoriaId: 1, modalidade: 'classico' }), /Marca "Acme" fora da regra/)
  assert.ok(!montarPayload({ copy: fabricante, decisao: { ...decisao, marca_autorizada: 'Acme' }, linha, config, categoriaId: 1, modalidade: 'classico' }).pendencias.some(p => /Marca/.test(p)))
  assert.ok(!montarPayload({ copy, decisao, linha, config, categoriaId: 1, modalidade: 'classico' }).pendencias.some(p => /Marca/.test(p)))
})

test('payloadParaEnviar recusa payload antigo com marca fora da regra', () => {
  const p = projetoBling()
  try {
    mkdirSync(join(p.raiz, 'anuncios', 'suspiro'), { recursive: true })
    const gravar = marca => writeFileSync(join(p.raiz, 'anuncios', 'suspiro', 'bling-payload.json'), JSON.stringify({ nome: copy.titulo, marca }))
    gravar('Genérica')
    assert.equal(payloadParaEnviar('suspiro', p.raiz).marca, 'Genérica', 'canario: payload na regra sai')
    gravar('Acme')
    assert.throws(() => payloadParaEnviar('suspiro', p.raiz), /Marca "Acme" fora da regra/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})
