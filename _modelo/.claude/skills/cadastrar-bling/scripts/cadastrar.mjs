#!/usr/bin/env node
// Cadastro de um anuncio auditado no Bling (API v3), em duas voltas: --montar grava o payload e
// mostra o resumo sem enviar nada; --enviar manda o payload revisado, so depois do "pode ir".
//
// Uso, da raiz do projeto:
//   node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --categorias
//        lista as categorias de produto do Bling (id e nome), pra pessoa escolher
//   node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --montar <slug> [--estoque N]
//        grava anuncios/<slug>/bling-payload.json e mostra o resumo, as pendencias e o possivel duplicado
//   node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --enviar <slug>
//        cria o produto, aplica NCM, estoque e fornecedor, e grava publicacao.json (bloco erp)
// Le: dados/pipeline/<slug>/ (status, decisao, copy, auditoria), fornecedores/<f>/catalogo-analisado.csv,
// fornecedores/<f>/bling.json ({ "cnpj", "categorias": { "<categoria>": <id> } }) e _contexto/mercado-livre.md.
//
// Conferido em 2026-09-24 num SDK de terceiro (bling-erp-api-js), atualizado pra v310,
// porque developer.bling.com.br/referencia e SPA (sem HTML estatico pro robo) e
// ajuda.bling.com.br bloqueia robo com 403: condicao, descricaoCurta, gtin, marca,
// pesoLiquido, pesoBruto, dimensoes (largura, altura, profundidade, unidadeMedida) e
// categoria.id em POST /produtos; tributacao.ncm em PATCH /produtos/{id}; POST /estoques
// com operacao "B"; GET /contatos?numeroDocumento=; GET /categorias/produtos.
// POST /produtos/fornecedores leva idContato no INPUT (uso real medido num cadastro
// de verdade no Bling); um SDK de terceiro tipa esse mesmo campo como fornecedor.id,
// mas so na RESPOSTA (inconsistencia do proprio Bling) - conferir de novo na fumaca
// do plano D. Nao deu pra confirmar se GET /produtos aceita pesquisa= por prefixo de
// codigo (o SDK de terceiros so lista os parametros nome e codigo, nenhum dos dois
// serve pra prefixo): conferir na fumaca do plano D.
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { carregarConfiguracao, exigir } from '../../mercado-livre/scripts/lib/config.mjs'
import { clienteBling } from '../../mercado-livre/scripts/lib/bling-api.mjs'
import { slugDe, lerJson, gravarJson } from '../../mercado-livre/scripts/lib/pipeline.mjs'

// CSV do contrato 0: virgula separa, aspas protegem, aspas dobradas viram uma.
export function lerCsv(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let dentro = false
  const s = String(texto).replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (dentro) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++ } else if (c === '"') dentro = false
      else campo += c
    } else if (c === '"') dentro = true
    else if (c === ',') { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else campo += c
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha) }
  const [cab, ...resto] = linhas.filter(l => l.some(x => x !== ''))
  return (resto || []).map(l => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ''])))
}

// Descricao vai no campo que o Bling manda pro Mercado Livre, e o editor dele engole quebra de
// linha comum: vira <br>. Texto que ja veio com HTML passa como esta.
export function textoParaHtml(texto) {
  const s = String(texto ?? '')
  if (/<br|<p|<div/i.test(s)) return s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(/\r?\n/).join('<br>')
}

// ('LOJA', 'doces') -> 'LOJA-DOC-'
export function prefixoDoSku(prefixo, categoria) {
  const cat = slugDe(categoria).replace(/-/g, '').slice(0, 3).toUpperCase()
  const pre = slugDe(prefixo).toUpperCase()
  if (!pre || !cat) throw new Error('prefixo do SKU e categoria sao obrigatorios (sku_prefixo em _contexto/mercado-livre.md)')
  return `${pre}-${cat}-`
}

// 'LOJA-DOC-009' -> 'LOJA-DOC-010', mantendo os zeros
export function proximoNumero(codigo) {
  const m = String(codigo).match(/^(.*-)(\d+)$/)
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : null
}

// '30x20x10' (comprimento x largura x altura, em cm) -> dimensoes do Bling
export function dimensoesDe(texto) {
  const m = String(texto ?? '').replace(/,/g, '.').match(/^\s*([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*$/i)
  if (!m) return null
  const [c, l, a] = m.slice(1).map(Number)
  return { profundidade: c, largura: l, altura: a, unidadeMedida: 1 }
}

// Monta o payload sem rede. Campo sem dado fica de fora (nunca null nem zero inventado) e vira
// pendencia. Os campos com _ sao da ida pro Bling em mais de uma chamada e saem antes do POST.
export function montarPayload({ copy, decisao, linha, config, categoriaId, modalidade, estoque = null, cnpj = null }) {
  if (!copy?.titulo || !copy?.descricao) throw new Error('copy.json sem titulo ou descricao: rode a /montar-anuncio antes')
  if (!categoriaId) throw new Error('falta a categoria do Bling pra essa categoria: rode --categorias, escolha com a pessoa e grave em fornecedores/<f>/bling.json')
  exigir(config, ['sku_prefixo'])
  const preco = copy.precos?.[`ml_${modalidade}`]
  if (typeof preco !== 'number') throw new Error(`copy.json sem preco pra modalidade ${modalidade} (precos.ml_${modalidade})`)
  const pendencias = []
  const p = { nome: copy.titulo, tipo: 'P', situacao: 'A', formato: 'S', condicao: 1, preco, unidade: 'UN', descricaoCurta: textoParaHtml(copy.descricao), categoria: { id: Number(categoriaId) } }
  if (copy.gtin) p.gtin = String(copy.gtin)
  else pendencias.push(decisao?.tipo === 'kit' ? 'GTIN vazio (kit montado nao tem codigo de barras, e isso e o certo)' : 'GTIN vazio: sem codigo confiavel o anuncio perde visibilidade')
  if (copy.ficha?.Marca) p.marca = copy.ficha.Marca
  const peso = Number(linha?.peso_g)
  if (decisao?.tipo !== 'kit' && peso > 0) { p.pesoLiquido = peso / 1000; p.pesoBruto = peso / 1000 } else pendencias.push('peso: pesar o produto embalado e preencher no Bling (peso errado custa frete em toda venda)')
  const dim = decisao?.tipo === 'kit' ? null : dimensoesDe(linha?.dimensoes_cm)
  if (dim) p.dimensoes = dim
  else pendencias.push('dimensoes: medir a embalagem e preencher no Bling')
  p._skuPrefix = prefixoDoSku(config.sku_prefixo, decisao?.categoria ?? linha?.categoria ?? '')
  if (copy.ncm) p._ncm = copy.ncm
  else pendencias.push('NCM vazio: pedir ao fornecedor ou a contadora antes da primeira nota')
  if (estoque !== null) {
    if (config.deposito_id) { p._depositoId = Number(config.deposito_id); p._estoque = estoque } else pendencias.push('estoque pedido, mas a configuracao nao tem deposito_id')
  }
  const custo = decisao?.custo_total ?? Number(linha?.custo)
  if (cnpj && custo > 0) p._fornecedor = { cnpj: String(cnpj), custo }
  else pendencias.push('custo: sem o CNPJ do fornecedor em fornecedores/<f>/bling.json, o custo nao entra no Bling')
  return { payload: p, pendencias }
}

export function separar(payload) {
  const corpo = {}
  const aux = {}
  for (const [k, v] of Object.entries(payload)) (k.startsWith('_') ? aux : corpo)[k] = v
  return { corpo, aux }
}

export function resumo(payload, pendencias) {
  const { corpo, aux } = separar(payload)
  const brl = n => `R$ ${Number(n).toFixed(2).replace('.', ',')}`
  const L = [
    `Nome:       ${corpo.nome}`,
    `SKU:        ${corpo.codigo || `${aux._skuPrefix}<proximo livre>`}`,
    `Categoria:  id ${corpo.categoria.id}`,
    `Preco:      ${brl(corpo.preco)}`,
    `Custo:      ${aux._fornecedor ? brl(aux._fornecedor.custo) : 'nao vai (sem CNPJ do fornecedor)'}`,
    `GTIN:       ${corpo.gtin || 'vazio'}`,
    `NCM:        ${aux._ncm || 'vazio'}`,
    `Estoque:    ${aux._estoque ?? 'nao mexe'}${aux._depositoId ? ` no deposito ${aux._depositoId}` : ''}`,
  ]
  if (pendencias.length) L.push('', 'Pendencias:', ...pendencias.map(x => `- ${x}`))
  return L.join('\n')
}

export async function proximoSkuLivre(prefixo, req) {
  // pesquisa= busca em nome e codigo; codigo= e busca exata e nao serve pra prefixo
  let maior = 0
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await req('GET', '/produtos', { query: { pesquisa: prefixo, limite: 100, pagina } })
    const lista = r?.data || []
    for (const p of lista) {
      if (!String(p.codigo ?? '').startsWith(prefixo)) continue
      const m = String(p.codigo).match(/-(\d+)$/)
      if (m) maior = Math.max(maior, Number(m[1]))
    }
    if (lista.length < 100) break
  }
  return `${prefixo}${String(maior + 1).padStart(3, '0')}`
}

// Produto que parece ja existir: busca pelo nome e, se houver, pelo GTIN, sem repetir id.
// So leitura; erro do Bling aqui nao trava o --montar, vira lista vazia com aviso.
export async function possiveisDuplicados(req, { nome, gtin, log = () => {} }) {
  try {
    const achados = new Map()
    for (const termo of [nome, gtin].filter(Boolean)) {
      for (const p of (await req('GET', '/produtos', { query: { pesquisa: termo } }))?.data || []) {
        if (p?.id != null && !achados.has(p.id)) achados.set(p.id, { id: p.id, codigo: p.codigo ?? '', nome: p.nome ?? '' })
      }
    }
    return [...achados.values()]
  } catch (e) {
    log(`nao deu pra procurar duplicado no Bling (${e.message}): confira no painel antes de enviar`)
    return []
  }
}

const colidiu = e => /cadastrad/i.test(e.message) && /c[oó]digo/i.test(e.message)

// Depois do POST o produto ja existe: nada daqui pra frente lanca. Falha de NCM, estoque ou
// fornecedor vira pendencia com a mensagem do Bling, e aoCriar grava o id na hora. Se o aoCriar falhar, o aviso sai no log na hora e vira a primeira pendencia.
export async function enviar(payload, { req, log = () => {}, aoCriar = null }) {
  const { corpo, aux } = separar(payload)
  const pendencias = []
  if (!corpo.codigo && aux._skuPrefix) corpo.codigo = await proximoSkuLivre(aux._skuPrefix, req)
  let criado
  for (let tentativa = 0; ; tentativa++) {
    try { criado = await req('POST', '/produtos', { corpo }); break } catch (e) {
      const prox = aux._skuPrefix && colidiu(e) ? proximoNumero(corpo.codigo) : null
      if (!prox || tentativa >= 30) throw e
      log(`SKU ${corpo.codigo} ja existe, tentando ${prox}`)
      corpo.codigo = prox
    }
  }
  const id = criado?.data?.id
  if (!id) throw new Error(`o Bling nao devolveu o id do produto: ${JSON.stringify(criado).slice(0, 300)}`)
  log(`produto criado: id ${id}, SKU ${corpo.codigo}`)
  if (aoCriar) {
    try { aoCriar({ id, sku: corpo.codigo }) } catch (e) {
      const aviso = `ATENCAO: o produto foi criado no Bling (id ${id}, SKU ${corpo.codigo}), mas gravar isso no computador falhou (${e.message}). Anote o id no bloco erp do publicacao.json antes de rodar --enviar de novo, senao o reenvio duplica o produto.`
      log(aviso)
      pendencias.push(aviso)
    }
  }
  if (aux._ncm) {
    try { await req('PATCH', `/produtos/${id}`, { corpo: { tributacao: { ncm: aux._ncm } } }) } catch (e) { pendencias.push(`NCM nao aplicado, preencher no Bling. O Bling respondeu: ${e.message}`) }
  }
  if (aux._estoque != null && aux._depositoId) {
    try {
      // deposito inexistente o Bling aceita calado e o saldo some: confere antes
      const depositos = (await req('GET', '/depositos'))?.data || []
      if (depositos.some(d => Number(d.id) === Number(aux._depositoId))) {
        await req('POST', '/estoques', { corpo: { produto: { id }, deposito: { id: aux._depositoId }, operacao: 'B', quantidade: aux._estoque, observacoes: 'estoque inicial pela /cadastrar-bling' } })
      } else pendencias.push(`o deposito ${aux._depositoId} da configuracao nao existe no Bling: estoque nao lancado. Confira o deposito_id em _contexto/mercado-livre.md`)
    } catch (e) { pendencias.push(`estoque nao lancado, lancar no Bling. O Bling respondeu: ${e.message}`) }
  }
  if (aux._fornecedor?.cnpj) {
    try {
      // o custo so grava pelo vinculo com o fornecedor; PATCH direto no produto responde 200 e nao grava
      const contato = (await req('GET', '/contatos', { query: { numeroDocumento: aux._fornecedor.cnpj.replace(/\D/g, '') } }))?.data?.[0]
      if (contato?.id) await req('POST', '/produtos/fornecedores', { corpo: { produto: { id }, idContato: contato.id, codigo: corpo.codigo, precoCusto: aux._fornecedor.custo, precoCompra: aux._fornecedor.custo, padrao: true } })
      else pendencias.push(`nenhum contato com o CNPJ ${aux._fornecedor.cnpj} no Bling: cadastre o fornecedor e vincule o custo na aba Fornecedores do produto`)
    } catch (e) { pendencias.push(`custo do fornecedor nao vinculado, vincular na aba Fornecedores do produto. O Bling respondeu: ${e.message}`) }
  }
  pendencias.push('imagens: sobem do computador pela tela do anuncio (Bling ou painel do Mercado Livre), na ordem do mapa de fotos')
  return { id, sku: corpo.codigo, pendencias }
}

// Segundo --enviar do mesmo anuncio criaria outro produto: recusa se ja ha id gravado.
export function jaCadastrado(slug, publicacao, status) {
  const id = publicacao?.erp?.id ?? (status?.etapas?.cadastro?.status === 'ok' ? status.etapas.cadastro.bling_id ?? '(sem id gravado)' : null)
  if (id == null) return null
  return `o anuncio ${slug} ja foi cadastrado no Bling com id ${id}; pra refazer, apague o produto no Bling e o bloco erp do publicacao.json`
}

export function argumentos(argv) {
  const i = n => argv.indexOf('--' + n)
  const valor = n => (i(n) >= 0 && argv[i(n) + 1] && !argv[i(n) + 1].startsWith('--') ? argv[i(n) + 1] : null)
  if (argv.includes('--categorias')) return { acao: 'categorias' }
  if (valor('montar')) {
    const est = valor('estoque')
    if (argv.includes('--estoque') && est === null) throw new Error('faltou o numero de --estoque')
    if (est !== null && !(Number.isInteger(Number(est)) && Number(est) >= 0)) throw new Error('--estoque precisa ser um numero inteiro')
    return { acao: 'montar', slug: valor('montar'), estoque: est === null ? null : Number(est) }
  }
  if (valor('enviar')) return { acao: 'enviar', slug: valor('enviar') }
  if (valor('montar-lote')) return { acao: 'montar-lote', slugs: valor('montar-lote').split(',').map(s => s.trim()).filter(Boolean) }
  if (valor('enviar-lote')) return { acao: 'enviar-lote', slugs: valor('enviar-lote').split(',').map(s => s.trim()).filter(Boolean) }
  throw new Error('uso: --categorias | --montar <slug> [--estoque N] | --enviar <slug> | --montar-lote <slugs> | --enviar-lote <slugs>')
}

function carregarAnuncio(slug) {
  const pasta = join(RAIZ, 'dados', 'pipeline', slug)
  const status = lerJson(join(pasta, 'status.json'))
  if (!status) throw new Error(`nao existe dados/pipeline/${slug}/status.json`)
  const auditoria = lerJson(join(pasta, 'auditoria.json'))
  if (auditoria?.veredito !== 'aprovado') throw new Error(`o anuncio ${slug} nao tem auditoria aprovada: rode o ml-auditor antes de cadastrar`)
  return { pasta, status, auditoria, decisao: lerJson(join(pasta, 'decisao.json')), copy: lerJson(join(pasta, 'copy.json')) }
}

// Monta um slug sem imprimir nada: grava anuncios/<slug>/bling-payload.json e ja procura duplicado.
// Usado pelo --montar (mostra o resumo inteiro) e pelo --montar-lote (uma linha por produto).
export async function montarUm(slug, { estoque = null, config, req, log = () => {} }) {
  const { status, auditoria, decisao, copy } = carregarAnuncio(slug)
  const forn = join(RAIZ, 'fornecedores', status.fornecedor)
  const bling = lerJson(join(forn, 'bling.json'), {})
  const csv = join(forn, 'catalogo-analisado.csv')
  const nome = decisao?.composicao?.[0]?.produto
  const linha = existsSync(csv) && decisao?.tipo !== 'kit' ? lerCsv(readFileSync(csv, 'utf8')).find(l => l.produto === nome) : null
  const { payload, pendencias } = montarPayload({ copy, decisao: { ...decisao, categoria: status.categoria }, linha, config, categoriaId: bling.categorias?.[status.categoria], modalidade: auditoria.modalidade_escolhida || 'classico', estoque, cnpj: bling.cnpj })
  gravarJson(join(RAIZ, 'anuncios', slug, 'bling-payload.json'), payload)
  const dup = await possiveisDuplicados(req, { nome: payload.nome, gtin: payload.gtin, log })
  return { payload, pendencias, dup }
}

const apagarPayload = slug => rmSync(join(RAIZ, 'anuncios', slug, 'bling-payload.json'), { force: true })

// --montar-lote: monta cada slug na ordem dada. Produto que nao monta entra com o motivo e nao
// derruba o lote (o proximo slug continua normalmente). O bling-payload.json velho de quem nao
// montou e apagado, pro --enviar-lote nao mandar uma versao antiga por engano.
export async function montarLote(slugs, { montar = montarUm, config, req, log = () => {}, apagar = apagarPayload }) {
  const linhas = []
  for (const slug of slugs) {
    try {
      const { payload, pendencias, dup } = await montar(slug, { config, req, log })
      linhas.push({ slug, ok: true, nome: payload.nome, sku: `${payload._skuPrefix}<proximo livre>`, preco: payload.preco, duplicado: dup.length > 0, pendencias })
    } catch (e) {
      apagar(slug)
      linhas.push({ slug, ok: false, motivo: e.message })
    }
  }
  return linhas
}

export function resumoLote(linhas) {
  const brl = n => `R$ ${Number(n).toFixed(2).replace('.', ',')}`
  const L = linhas.map(l => l.ok
    ? `${l.slug}: ${l.nome} | SKU ${l.sku} | ${brl(l.preco)} | duplicado: ${l.duplicado ? 'sim' : 'nao'}${l.pendencias.length ? ` | pendencias: ${l.pendencias.length}` : ''}`
    : `${l.slug}: nao montou (${l.motivo})`)
  const ok = linhas.filter(l => l.ok).length
  L.push('', `Total: ${linhas.length} produtos, ${ok} montados, ${linhas.length - ok} com erro`)
  return L.join('\n')
}

// O que o --enviar-lote precisa de um slug: recusa se jaCadastrado ja barra, senao o payload gravado.
function carregarParaEnviar(slug) {
  const { pasta, status } = carregarAnuncio(slug)
  const recusa = jaCadastrado(slug, lerJson(join(pasta, 'publicacao.json')), status)
  if (recusa) return { recusa }
  const payload = lerJson(join(RAIZ, 'anuncios', slug, 'bling-payload.json'))
  if (!payload) throw new Error(`nao existe anuncios/${slug}/bling-payload.json: rode --montar antes`)
  return { pasta, payload }
}

// Grava publicacao.json (bloco erp) e status.json depois de criar o produto, no mesmo formato do --enviar de um so.
function gravarEnvio(slug, pasta, { id, sku, em }) {
  const pub = lerJson(join(pasta, 'publicacao.json'), { slug, canais: [] })
  gravarJson(join(pasta, 'publicacao.json'), { ...pub, erp: { sistema: 'bling', id, sku, em } })
  const st = lerJson(join(pasta, 'status.json'))
  st.etapas = { ...st.etapas, cadastro: { status: 'ok', em, bling_id: id, sku } }
  st.etapa_atual = 'cadastrado'
  gravarJson(join(pasta, 'status.json'), st)
}

// --enviar-lote: em ordem, pula quem jaCadastrado ja barra (conta como "ja estava"), envia o resto
// pelo mesmo enviar() do --enviar de um so, e para no primeiro erro (nao segue cadastrando no escuro).
// carregar() que lanca (status.json ausente, auditoria nao aprovada, bling-payload.json faltando)
// conta como o mesmo tipo de parada: o resultado ate ali (com quem ja foi criado) ainda volta,
// pra quem chama sempre poder mostrar o resumo e conferir no Bling o que foi criado nesta rodada.
// Pendencia que comeca com ATENCAO (o produto foi criado mas o id nao foi gravado, e reenviar
// duplicaria) tambem para o lote: o slug entra em criados e em parouEm, com o aviso como motivo.
export async function enviarLote(slugs, { carregar = carregarParaEnviar, req, log = () => {}, gravar = gravarEnvio }) {
  const resultado = { planejados: slugs.length, criados: [], jaEstavam: [], parouEm: null, erro: null }
  for (const slug of slugs) {
    let c
    try {
      c = carregar(slug)
    } catch (e) {
      resultado.parouEm = slug
      resultado.erro = e.message
      break
    }
    if (c.recusa) { resultado.jaEstavam.push(slug); continue }
    const hoje = new Date().toISOString().slice(0, 10)
    const aoCriar = ({ id, sku }) => gravar(slug, c.pasta, { id, sku, em: hoje })
    try {
      const r = await enviar(c.payload, { req, log, aoCriar })
      resultado.criados.push({ slug, id: r.id, sku: r.sku, pendencias: r.pendencias })
      const atencao = r.pendencias.find(p => p.startsWith('ATENCAO'))
      if (atencao) {
        resultado.parouEm = slug
        resultado.erro = atencao
        break
      }
    } catch (e) {
      resultado.parouEm = slug
      resultado.erro = e.message
      break
    }
  }
  return resultado
}

// Confere no Bling que cada id criado nesta rodada existe de verdade (GET /produtos/{id}).
export async function conferirNoBling(req, ids) {
  const resultado = []
  for (const id of ids) {
    try {
      const r = await req('GET', `/produtos/${id}`)
      resultado.push({ id, achou: !!r?.data?.id })
    } catch (e) {
      resultado.push({ id, achou: false, erro: e.message })
    }
  }
  return resultado
}

export function resumoEnvioLote(resultado, conferidos) {
  const achou = conferidos.filter(c => c.achou).length
  const L = [
    `Planejados:          ${resultado.planejados}`,
    `Criados agora:       ${resultado.criados.length}`,
    `Ja estavam:          ${resultado.jaEstavam.length}`,
    `Conferidos no Bling: ${achou}/${conferidos.length}`,
  ]
  // cada produto criado com as pendencias dele, igual o --enviar de um so mostra
  for (const c of resultado.criados) L.push('', `${c.slug}: id ${c.id}, SKU ${c.sku}`, ...(c.pendencias || []).map(p => `- ${p}`))
  if (resultado.parouEm) L.push('', `Parou em: ${resultado.parouEm} (${resultado.erro})`)
  const naoAchados = conferidos.filter(c => !c.achou)
  if (naoAchados.length) L.push('', 'Nao achado no Bling ao conferir:', ...naoAchados.map(c => `- id ${c.id}`))
  return L.join('\n')
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = argumentos(process.argv.slice(2))
    const config = carregarConfiguracao()
    if (config.erp !== 'bling') throw new Error('a configuracao diz erp: nenhum. Sem Bling, o cadastro e pela /publicar-marketplace direto no painel.')
    if (a.acao === 'categorias') {
      const r = await clienteBling()('GET', '/categorias/produtos', { query: { limite: 100 } })
      for (const c of r?.data || []) console.log(`${c.id}\t${c.descricao}`)
    } else if (a.acao === 'montar') {
      const { payload, pendencias, dup } = await montarUm(a.slug, { estoque: a.estoque, config, req: clienteBling(), log: m => console.error(m) })
      console.log(resumo(payload, pendencias))
      if (dup.length) {
        console.log('\nPossivel duplicado no Bling:')
        for (const d of dup) console.log(`- id ${d.id}, SKU ${d.codigo || '(sem)'}: ${d.nome}`)
        console.log('confirmar com a pessoa antes de enviar')
      }
      console.log(`\npayload em anuncios/${a.slug}/bling-payload.json. Nada foi enviado.`)
    } else if (a.acao === 'montar-lote') {
      const linhas = await montarLote(a.slugs, { config, req: clienteBling(), log: m => console.error(m) })
      console.log(resumoLote(linhas))
    } else if (a.acao === 'enviar-lote') {
      const resultado = await enviarLote(a.slugs, { req: clienteBling(), log: m => console.error(m) })
      const conferidos = await conferirNoBling(clienteBling(), resultado.criados.map(c => c.id))
      console.log(resumoEnvioLote(resultado, conferidos))
    } else {
      const { pasta, status } = carregarAnuncio(a.slug)
      const recusa = jaCadastrado(a.slug, lerJson(join(pasta, 'publicacao.json')), status)
      if (recusa) throw new Error(recusa)
      const caminho = join(RAIZ, 'anuncios', a.slug, 'bling-payload.json')
      const payload = lerJson(caminho)
      if (!payload) throw new Error(`nao existe anuncios/${a.slug}/bling-payload.json: rode --montar antes`)
      const hoje = new Date().toISOString().slice(0, 10)
      const aoCriar = ({ id, sku }) => {
        const pub = lerJson(join(pasta, 'publicacao.json'), { slug: a.slug, canais: [] })
        gravarJson(join(pasta, 'publicacao.json'), { ...pub, erp: { sistema: 'bling', id, sku, em: hoje } })
      }
      const r = await enviar(payload, { req: clienteBling(), log: m => console.error(m), aoCriar })
      const st = lerJson(join(pasta, 'status.json'))
      st.etapas = { ...st.etapas, cadastro: { status: 'ok', em: hoje, bling_id: r.id, sku: r.sku } }
      st.etapa_atual = 'cadastrado'
      gravarJson(join(pasta, 'status.json'), st)
      console.log(`cadastrado no Bling: id ${r.id}, SKU ${r.sku}`)
      for (const p of r.pendencias) console.log(`- ${p}`)
    }
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
