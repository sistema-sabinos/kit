#!/usr/bin/env node
// Publica um anuncio auditado direto no Mercado Livre pela API, sem ERP, e ele nasce PAUSADO: quem
// poe no ar e a pessoa, no painel. Tres voltas, no molde da /cadastrar-bling:
//   node .claude/skills/publicar-marketplace/scripts/publicar-ml.mjs --montar <slug> --estoque N --garantia-dias N [--categoria MLB123] [--embalagem CxLxA --peso-g N]
//        descobre a categoria, monta o anuncio, pede a validacao do Mercado Livre (nao cria nada),
//        grava anuncios/<slug>/ml-payload.json e mostra o resumo. Nada muda na conta.
//   node .claude/skills/publicar-marketplace/scripts/publicar-ml.mjs --enviar <slug>
//        so depois do "pode ir": sobe as imagens, cria o anuncio, pausa, grava a descricao,
//        confere lendo de volta e grava publicacao.json e status.json
//   node .claude/skills/publicar-marketplace/scripts/publicar-ml.mjs --conferir <slug>
//        depois que a pessoa ativou no painel: le o anuncio e marca publicado
// Saida: 0 deu certo; 2 esse produto vai pelo checklist manual (plano B); 1 pendencia ou erro.
// Formato da API conferido na conta real em 2026-09-30 (ver lib/montar-item.mjs).
import { existsSync, readFileSync, statSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { lerJson, gravarJson, dataLocal, conferirAuditoria } from '../../mercado-livre/scripts/lib/pipeline.mjs'
import { lerConfiguracao } from '../../mercado-livre/scripts/lib/config.mjs'
import { mlGet, mlEscrever, mlSubirImagem } from '../../mercado-livre/scripts/lib/ml-api.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { lerCsv } from '../../cadastrar-bling/scripts/cadastrar.mjs'
import { montarItem, normalizar } from './lib/montar-item.mjs'
import { lerValidacao, IGNORAR_SEM_FOTO } from './lib/erros-ml.mjs'

const USO = 'uso: --montar <slug> --estoque N --garantia-dias N [--categoria MLB123] [--embalagem CxLxA --peso-g N] | --enviar <slug> | --conferir <slug>'
const CANAL = 'mercado-livre'
// Janela pra achar o anuncio de um envio cuja resposta nao chegou: relogio do computador e do
// Mercado Livre podem nao bater, entao aceita criado ate 10 minutos antes da tentativa.
const FOLGA_MS = 10 * 60 * 1000
// A busca do Mercado Livre pode demorar pra mostrar um anuncio recem-criado. Dentro dessa janela,
// busca vazia nao prova que o envio falhou: espera em vez de criar em dobro. Valor a calibrar no
// primeiro uso real.
const JANELA_BUSCA_MS = 10 * 60 * 1000
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function argumentos(argv) {
  const i = n => argv.indexOf('--' + n)
  const valor = n => (i(n) >= 0 && argv[i(n) + 1] && !argv[i(n) + 1].startsWith('--') ? argv[i(n) + 1] : null)
  const inteiro = n => {
    if (i(n) < 0) return null
    const v = valor(n)
    if (v === null || !/^\d+$/.test(v)) throw new Error(`--${n} precisa de um numero inteiro`)
    return Number(v)
  }
  const acoes = ['montar', 'enviar', 'conferir'].filter(a => argv.includes('--' + a))
  if (acoes.length !== 1) throw new Error(USO)
  const acao = acoes[0]
  const slug = valor(acao)
  if (!slug) throw new Error(`faltou o slug depois de --${acao}. ${USO}`)
  const conhecidas = new Set(['montar', 'enviar', 'conferir', 'estoque', 'garantia-dias', 'categoria', 'embalagem', 'peso-g'])
  for (const a of argv) if (a.startsWith('--') && !conhecidas.has(a.slice(2))) throw new Error(`nao conheco ${a}. ${USO}`)
  if (acao !== 'montar') return { acao, slug }
  return { acao, slug, estoque: inteiro('estoque'), garantiaDias: inteiro('garantia-dias'), categoria: valor('categoria'), embalagem: valor('embalagem'), pesoG: valor('peso-g') }
}

const caminhos = (slug, raiz) => ({
  pasta: join(raiz, 'dados', 'pipeline', slug),
  payload: join(raiz, 'anuncios', slug, 'ml-payload.json'),
  tentativa: join(raiz, 'anuncios', slug, 'ml-tentativa.json'),
})

const carimbo = arquivo => (existsSync(arquivo) ? statSync(arquivo).mtimeMs : null)

function carregar(slug, raiz) {
  const { pasta } = caminhos(slug, raiz)
  const status = lerJson(join(pasta, 'status.json'))
  if (!status) throw new Error(`nao existe dados/pipeline/${slug}/status.json`)
  const ler = n => lerJson(join(pasta, `${n}.json`))
  const dados = { pasta, status, copy: ler('copy'), decisao: ler('decisao'), auditoria: ler('auditoria'), imagens: ler('imagens'), publicacao: ler('publicacao') }
  if (dados.auditoria?.veredito !== 'aprovado') throw new Error('a auditoria desse anuncio nao esta aprovada: rode o ml-auditor antes de publicar')
  if (dados.imagens?.aprovado_pelo_usuario !== true) throw new Error('as imagens desse anuncio ainda nao foram aprovadas por voce na prancha')
  if (!dados.copy) throw new Error(`nao existe dados/pipeline/${slug}/copy.json`)
  dados.avisoAuditoria = conferirAuditoria(pasta, dados.auditoria).aviso
  return dados
}

// A linha do catalogo do fornecedor do produto individual. Nome da decisao que nao casa com
// nenhuma linha vira pendencia (sem a linha, produto com variacao nao cairia no plano B).
export function linhaDoFornecedor({ status, decisao }, raiz) {
  if (decisao?.tipo === 'kit') return { linha: null, pendencia: null }
  const csv = join(raiz, 'fornecedores', status.fornecedor || '', 'catalogo-analisado.csv')
  const nome = decisao?.composicao?.[0]?.produto
  if (!status.fornecedor || !nome || !existsSync(csv)) return { linha: null, pendencia: null }
  const linha = lerCsv(readFileSync(csv, 'utf8')).find(l => l.produto === nome) || null
  return { linha, pendencia: linha ? null : `o produto "${nome}" da decisao.json nao casou com nenhuma linha do catalogo-analisado.csv: copie na composicao o nome exato da coluna produto` }
}

function exigirSemErp(raiz) {
  const arquivo = join(raiz, '_contexto', 'mercado-livre.md')
  const config = existsSync(arquivo) ? lerConfiguracao(readFileSync(arquivo, 'utf8')) : {}
  if (config.erp === 'bling') throw new Error('a configuracao diz erp: bling. Com Bling, o anuncio nasce pelo Bling (rota Bling da /publicar-marketplace), pra estoque e pedido ficarem ligados')
}

async function descobrirCategoria(api, { titulo, categoria }) {
  let id = categoria
  if (!id) {
    const achadas = await api.get(`/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(titulo)}`)
    id = achadas?.[0]?.category_id
    if (!id) throw new Error(`o Mercado Livre nao achou categoria pro titulo "${titulo}": passe --categoria MLB123`)
  }
  const info = await api.get(`/categories/${id}`)
  const atributos = await api.get(`/categories/${id}/attributes`)
  return {
    categoria: { id, nome: info?.name || id, max_title_length: info?.settings?.max_title_length, max_pictures_per_item: info?.settings?.max_pictures_per_item },
    atributosDaCategoria: Array.isArray(atributos) ? atributos : [],
  }
}

// --montar: nada muda na conta. Grava o payload so quando esta tudo pronto pra enviar; em qualquer
// outro caso apaga o payload antigo, pro --enviar nunca mandar uma versao velha.
export async function montar(slug, opcoes, { api, raiz = RAIZ }) {
  exigirSemErp(raiz)
  const d = carregar(slug, raiz)
  const { payload } = caminhos(slug, raiz)
  const titulo = String(d.copy.titulo ?? '').trim()
  const cat = await descobrirCategoria(api, { titulo, categoria: opcoes.categoria })
  const fornecedor = linhaDoFornecedor(d, raiz)
  const r = montarItem({
    copy: d.copy, decisao: d.decisao, auditoria: d.auditoria, imagens: d.imagens,
    linha: fornecedor.linha, ...cat,
    estoque: opcoes.estoque, garantiaDias: opcoes.garantiaDias, embalagemFlag: opcoes.embalagem, pesoFlag: opcoes.pesoG,
  })
  if (fornecedor.pendencia) r.pendencias.push(fornecedor.pendencia)
  if (d.avisoAuditoria) r.avisos.unshift(d.avisoAuditoria)
  const falhou = extra => { rmSync(payload, { force: true }); return { ...r, ...extra, gravado: false } }
  if (r.planoB) return falhou({})
  if (r.pendencias.length) return falhou({})
  const v = lerValidacao(await api.escrever('POST', '/items/validate', r.corpo), { ignorar: IGNORAR_SEM_FOTO })
  const avisos = [...r.avisos, ...v.avisos]
  if (v.catalogo) return falhou({ avisos, planoB: 'a categoria exige anuncio de catalogo: esta versao publica so anuncio proprio, use o checklist manual' })
  if (!v.passou) return falhou({ avisos, pendencias: v.erros })
  gravarJson(payload, {
    slug, montado_em: new Date().toISOString(),
    corpo: r.corpo, imagens: r.imagens, descricao: r.descricao, resumo: r.resumo, avisos,
    carimbos: { copy: carimbo(join(d.pasta, 'copy.json')), imagens: carimbo(join(d.pasta, 'imagens.json')) },
  })
  return { ...r, avisos, gravado: true }
}

export function textoDoResumo(r) {
  const linhas = []
  if (r.planoB) return `PLANO B: ${r.planoB}`
  if (r.resumo) {
    const s = r.resumo
    linhas.push(
      `Titulo: ${s.titulo} (${s.caracteres} de ${s.limite} caracteres)`,
      `Categoria: ${s.categoria}`,
      `Modalidade: ${s.modalidade} · Preco de lista: R$ ${Number(s.preco).toFixed(2).replace('.', ',')}${s.desconto_pct ? ` (desconto de ${s.desconto_pct}% na Central de Promocoes depois)` : ''}`,
      `Estoque: ${s.estoque} · Garantia: ${s.garantia_dias} dias · Imagens: ${s.imagens}`,
      'Nasce PAUSADO: voce confere no painel e ativa.',
    )
  }
  if (r.pendencias?.length) linhas.push('', 'Falta resolver antes de enviar:', ...r.pendencias.map(p => `- ${p}`))
  if (r.avisos?.length) linhas.push('', 'Avisos:', ...r.avisos.map(a => `- ${a}`))
  return linhas.join('\n')
}

const estadoDe = s => ({ paused: 'pausado', active: 'ativo', closed: 'fechado', under_review: 'em revisao', not_yet_active: 'ainda nao ativo', inactive: 'inativo', payment_required: 'pagamento pendente' }[s] || s || 'desconhecido')

const atencao = (id, link, detalhe) => `ATENCAO: o anuncio ${id} esta ATIVO${detalhe}. Pause agora no painel: ${link || id}`
const avisoDeEstado = (estado, avisos) => {
  if (estado !== 'pausado' && estado !== 'ativo') avisos.push(`o anuncio esta ${estado} no Mercado Livre: nao ative nada, mostre este recibo`)
}

function gravarCanal(slug, raiz, canal) {
  const { pasta } = caminhos(slug, raiz)
  const arquivo = join(pasta, 'publicacao.json')
  const pub = lerJson(arquivo, { slug, erp: null, canais: [] })
  pub.canais = [...(pub.canais || []).filter(c => c.canal !== CANAL), canal]
  gravarJson(arquivo, pub)
}

function gravarEtapa(slug, raiz, etapa, extra = {}) {
  const { pasta } = caminhos(slug, raiz)
  const arquivo = join(pasta, 'status.json')
  const status = lerJson(arquivo)
  status.etapas = { ...(status.etapas || {}), publicacao: etapa }
  gravarJson(arquivo, { ...status, ...extra })
}

// Procura o anuncio de um envio anterior cuja resposta nao chegou: mesmo titulo, criado depois da tentativa.
async function acharAnuncioDaTentativa(api, { titulo, tentativa_em }) {
  const eu = await api.get('/users/me')
  const busca = await api.get(`/users/${eu.id}/items/search?q=${encodeURIComponent(titulo)}&order=start_time_desc&limit=5`)
  const desde = new Date(tentativa_em).getTime() - FOLGA_MS
  const titulonormalizado = normalizar(titulo)
  for (const id of busca?.results || []) {
    try {
      const item = await api.get(`/items/${id}`)
      if (normalizar(item.family_name || item.title) === titulonormalizado && new Date(item.date_created).getTime() >= desde) return item
    } catch (e) {
      // anuncio apagado ou inacessivel, pula para o proximo
    }
  }
  return null
}

async function lerDescricao(api, id) {
  try {
    const r = await api.get(`/items/${id}/description`)
    return r?.plain_text || null
  } catch (e) {
    return null
  }
}

async function gravarDescricao(api, id, descricao) {
  const existe = await lerDescricao(api, id)
  if (existe) return null
  const r = await api.escrever('POST', `/items/${id}/description`, { plain_text: descricao }).catch(e => ({ ok: false, dado: { message: e.message } }))
  return r.ok ? null : `a descricao nao gravou (${r.dado?.message || r.status}): rode --enviar de novo, que ele so grava a descricao`
}

// --enviar: so roda depois do "pode ir" da pessoa.
export async function enviar(slug, { api, raiz = RAIZ, agora = () => new Date() }) {
  exigirSemErp(raiz)
  const d = carregar(slug, raiz)
  const { payload: arquivoPayload, tentativa: arquivoTentativa } = caminhos(slug, raiz)
  const canal = (d.publicacao?.canais || []).find(c => c.canal === CANAL)
  const avisos = []
  const pendencias = []

  if (canal?.anuncio_id) {
    if (canal.descricao !== 'pendente') throw new Error(`esse anuncio ja foi publicado (${canal.anuncio_id}). Pra mudar algo, e pelo painel`)
    const p = lerJson(arquivoPayload)
    const falha = await gravarDescricao(api, canal.anuncio_id, p?.descricao ?? d.copy.descricao)
    let estado = canal.estado
    if (!falha) {
      gravarCanal(slug, raiz, { ...canal, descricao: 'ok' })
      try {
        const real = await api.get(`/items/${canal.anuncio_id}`)
        estado = estadoDe(real.status)
        // Ativo e a pausa nunca foi confirmada (o processo caiu entre a criacao e a pausa): pausa agora.
        // Se o gravado ja era pausado, quem ativou foi a pessoa: nao mexe.
        const confirmada = lerJson(join(caminhos(slug, raiz).pasta, 'status.json'))
        const jaPublicado = confirmada?.etapa_atual === 'publicado' || confirmada?.etapas?.publicacao?.status === 'ok'
        if (real.status === 'active' && canal.estado !== 'pausado' && !jaPublicado) {
          const pausa = await api.escrever('PUT', `/items/${canal.anuncio_id}`, { status: 'paused' }).catch(e => ({ ok: false, dado: { message: e.message } }))
          if (pausa.ok) estado = 'pausado'
          else pendencias.push(atencao(canal.anuncio_id, canal.link, `, a pausa falhou (${pausa.dado?.message || pausa.status})`))
        }
        gravarCanal(slug, raiz, { ...canal, descricao: 'ok', estado })
        // Etapa ja fechada pela pessoa (--conferir): o canal registra o estado lido, a etapa fica como esta.
        if (!jaPublicado) gravarEtapa(slug, raiz, { status: estado, em: dataLocal(agora()), anuncio_id: canal.anuncio_id })
        if (canal.estado !== 'pausado' && !jaPublicado) avisoDeEstado(estado, avisos)
      } catch (e) {
        avisos.push('nao consegui ler o anuncio de volta pra conferir: rode --conferir ' + slug + ' daqui a pouco')
      }
    }
    return { anuncio_id: canal.anuncio_id, link: canal.link, estado, pendencias: falha ? [falha, ...pendencias] : pendencias, avisos }
  }

  const p = lerJson(arquivoPayload)
  if (!p) throw new Error(`nao existe anuncios/${slug}/ml-payload.json: rode --montar antes`)

  let item = null
  const tentativa = lerJson(arquivoTentativa)
  if (tentativa?.tentativa_em) {
    item = await acharAnuncioDaTentativa(api, { titulo: tentativa.titulo, tentativa_em: tentativa.tentativa_em })
    if (item) {
      avisos.push(`o envio anterior tinha chegado: o anuncio ${item.id} ja existia e foi aproveitado`)
    } else {
      const quando = new Date(tentativa.tentativa_em)
      if (agora().getTime() - quando.getTime() < JANELA_BUSCA_MS) {
        throw new Error(`o envio anterior foi as ${hhmm(quando)} e o anuncio ainda nao apareceu na busca do Mercado Livre, que pode demorar. Confira em Anuncios, no painel (pode estar em Pausados ou em Ativos). Rode --enviar de novo depois das ${hhmm(new Date(quando.getTime() + JANELA_BUSCA_MS))}: ele procura de novo antes de criar.`)
      }
    }
  }

  if (!item) {
    const agoraCarimbos = { copy: carimbo(join(d.pasta, 'copy.json')), imagens: carimbo(join(d.pasta, 'imagens.json')) }
    if (agoraCarimbos.copy !== p.carimbos?.copy || agoraCarimbos.imagens !== p.carimbos?.imagens) {
      throw new Error('o copy ou as imagens mudaram depois do resumo que voce aprovou: rode --montar de novo e confira')
    }

    const pictures = []
    for (const arquivo of p.imagens) pictures.push({ id: (await api.subir(join(raiz, arquivo))).id })
    const corpo = { ...p.corpo, pictures }
    const v = lerValidacao(await api.escrever('POST', '/items/validate', corpo))
    if (!v.passou) throw new Error(`o Mercado Livre recusou na validacao, nada foi criado:\n- ${v.erros.join('\n- ')}`)
    gravarJson(arquivoTentativa, { tentativa_em: agora().toISOString(), titulo: p.corpo.family_name })
    let r
    try {
      r = await api.escrever('POST', '/items', corpo)
    } catch (e) {
      if (e.semResposta) throw new Error(`${e.message}\nNAO crie o anuncio no painel. Rode --enviar de novo: ele procura na sua conta se o anuncio chegou antes de tentar outra vez.`)
      throw e
    }
    if (!r.ok) {
      if (r.status >= 500 || r.status === 429) {
        throw new Error(`${r.dado?.message || 'erro ' + r.status}\nNAO crie o anuncio no painel. Rode --enviar de novo: ele procura na sua conta se o anuncio chegou antes de tentar outra vez.`)
      }
      rmSync(arquivoTentativa, { force: true })
      const recusa = lerValidacao(r)
      throw new Error(`o Mercado Livre recusou a criacao, nada foi criado:\n- ${recusa.erros.join('\n- ')}`)
    }
    item = r.dado
    if (!item?.id) {
      throw new Error(`POST /items ok mas sem id\nNAO crie o anuncio no painel. Rode --enviar de novo: ele procura na sua conta se o anuncio chegou antes de tentar outra vez.`)
    }
  }

  const id = item.id
  const link = item.permalink || null
  let estadoPausa = estadoDe(item.status)
  gravarCanal(slug, raiz, { canal: CANAL, anuncio_id: id, modalidade: p.resumo?.modalidade, preco: p.corpo.price, em: dataLocal(agora()), via: 'api', estado: estadoPausa, link, descricao: 'pendente' })
  gravarEtapa(slug, raiz, { status: estadoPausa, em: dataLocal(agora()), anuncio_id: id })

  let pausaFalhou = null
  if (item.status !== 'paused') {
    const pausa = await api.escrever('PUT', `/items/${id}`, { status: 'paused' }).catch(e => ({ ok: false, dado: { message: e.message } }))
    if (pausa.ok) estadoPausa = 'pausado'
    else pausaFalhou = pausa.dado?.message || pausa.status
    // pausa que falhou deixa o estado que a criacao devolveu, nunca um 'ativo' presumido
  } else {
    estadoPausa = 'pausado'
  }
  gravarCanal(slug, raiz, { canal: CANAL, anuncio_id: id, modalidade: p.resumo?.modalidade, preco: p.corpo.price, em: dataLocal(agora()), via: 'api', estado: estadoPausa, link, descricao: 'pendente' })
  gravarEtapa(slug, raiz, { status: estadoPausa, em: dataLocal(agora()), anuncio_id: id })

  const falhaDescricao = await gravarDescricao(api, id, p.descricao)
  if (falhaDescricao) pendencias.push(falhaDescricao)

  let estado = estadoPausa
  try {
    const real = await api.get(`/items/${id}`)
    estado = estadoDe(real.status)
    if ((real.family_name || real.title) !== p.corpo.family_name) avisos.push(`o titulo no Mercado Livre saiu diferente: "${real.family_name || real.title}"`)
    if (Number(real.price) !== Number(p.corpo.price)) avisos.push(`o preco no Mercado Livre saiu R$ ${real.price}, e o montado era R$ ${p.corpo.price}`)
    if ((real.pictures || []).length !== p.imagens.length) avisos.push(`o anuncio ficou com ${(real.pictures || []).length} imagens de ${p.imagens.length}`)
    const final = { canal: CANAL, anuncio_id: id, modalidade: p.resumo?.modalidade, preco: real.price, em: dataLocal(agora()), via: 'api', estado, link: real.permalink || link, descricao: falhaDescricao ? 'pendente' : 'ok' }
    gravarCanal(slug, raiz, final)
    gravarEtapa(slug, raiz, { status: estado, em: dataLocal(agora()), anuncio_id: id })
  } catch (e) {
    avisos.push('nao consegui ler o anuncio de volta pra conferir: rode --conferir ' + slug + ' daqui a pouco')
    const final = { canal: CANAL, anuncio_id: id, modalidade: p.resumo?.modalidade, preco: p.corpo.price, em: dataLocal(agora()), via: 'api', estado: estadoPausa, link, descricao: falhaDescricao ? 'pendente' : 'ok' }
    gravarCanal(slug, raiz, final)
    gravarEtapa(slug, raiz, { status: estadoPausa, em: dataLocal(agora()), anuncio_id: id })
  }

  // Ativo no fim, pela leitura de volta (ou pelo passo da pausa se a leitura falhou): grita, tenha a
  // pausa falhado ou nao. Outro estado que nao pausado nem ativo: a pessoa nao deve ativar nada.
  if (estado === 'ativo') pendencias.push(atencao(id, link, pausaFalhou ? `, a pausa falhou (${pausaFalhou})` : ', a pausa nao pegou'))
  avisoDeEstado(estado, avisos)

  rmSync(arquivoTentativa, { force: true })
  return { anuncio_id: id, link, estado, pendencias, avisos }
}

// --conferir: a pessoa diz que ativou; o anuncio ativo na API fecha a etapa.
export async function conferir(slug, { api, raiz = RAIZ, agora = () => new Date() }) {
  const { pasta } = caminhos(slug, raiz)
  const pub = lerJson(join(pasta, 'publicacao.json'))
  const canal = (pub?.canais || []).find(c => c.canal === CANAL)
  if (!canal?.anuncio_id) throw new Error('esse anuncio ainda nao foi enviado pela API: rode --montar e --enviar')
  const real = await api.get(`/items/${canal.anuncio_id}`)
  const estado = estadoDe(real.status)
  gravarCanal(slug, raiz, { ...canal, estado })
  if (real.status === 'active') gravarEtapa(slug, raiz, { status: 'ok', em: dataLocal(agora()), anuncio_id: canal.anuncio_id }, { etapa_atual: 'publicado' })
  else gravarEtapa(slug, raiz, { status: estado, em: dataLocal(agora()), anuncio_id: canal.anuncio_id })
  return { anuncio_id: canal.anuncio_id, estado, publicado: real.status === 'active' }
}

export async function criarApi() {
  const token = await tokenMl()
  return {
    get: caminho => mlGet(caminho, { token }),
    escrever: (metodo, caminho, corpo) => mlEscrever(metodo, caminho, corpo, { token }),
    subir: arquivo => mlSubirImagem(arquivo, { token }),
  }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = argumentos(process.argv.slice(2))
    const api = await criarApi()
    if (a.acao === 'montar') {
      const r = await montar(a.slug, a, { api })
      console.log(textoDoResumo(r))
      process.exitCode = r.planoB ? 2 : r.gravado ? 0 : 1
    } else if (a.acao === 'enviar') {
      const r = await enviar(a.slug, { api })
      console.log(`Anuncio ${r.anuncio_id}: ${r.estado.toUpperCase()}\n${r.link || ''}`)
      for (const x of [...r.avisos, ...r.pendencias]) console.log(`- ${x}`)
      process.exitCode = r.pendencias.length ? 1 : 0
    } else {
      const r = await conferir(a.slug, { api })
      console.log(r.publicado ? `Anuncio ${r.anuncio_id} ATIVO: etapa de publicacao fechada.` : `Anuncio ${r.anuncio_id} esta ${r.estado}: ative no painel e rode --conferir de novo.`)
      process.exitCode = r.publicado ? 0 : 1
    }
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
