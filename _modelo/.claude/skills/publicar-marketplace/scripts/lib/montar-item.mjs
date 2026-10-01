// Monta o anuncio que vai pra API do Mercado Livre a partir dos contratos da esteira (copy, decisao,
// auditoria, imagens) e do que a API disse da categoria. Funcoes puras: nada de rede nem de disco.
// Formato conferido na conta real em 2026-09-30 com POST /items/validate: o titulo vai em
// family_name (title junto e recusado), e medidas e peso da embalagem sao obrigatorios, em
// numero inteiro, cm e g.

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Preco de lista inflado (contrato 3: decisao.preco.tabela) pra dar margem ao desconto da Central
// de Promocoes. Sem tabela, o preco do copy entra cheio e sem espaco pra desconto.
export function precoDeLista({ decisao, copy, modalidade }) {
  const tabela = Number(decisao?.preco?.tabela)
  const alvo = Number(decisao?.preco?.alvo_pos_desconto)
  if (tabela > 0) {
    return { preco: tabela, desconto_pct: alvo > 0 && alvo < tabela ? Math.round((1 - alvo / tabela) * 100) : null, aviso: null }
  }
  const doCopy = Number(copy?.precos?.[`ml_${modalidade}`])
  return {
    preco: doCopy > 0 ? doCopy : null,
    desconto_pct: null,
    aviso: 'sem preco de tabela na decisao: o anuncio entra no preco do copy, sem espaco pra desconto na Central de Promocoes',
  }
}

const MODALIDADE = { classico: 'gold_special', premium: 'gold_pro' }
export const modalidadeDoML = m => MODALIDADE[m] || null

const numero = s => Number(String(s ?? '').trim().replace(',', '.'))

// Medidas e peso da embalagem. Ordem do contrato 0: comprimento x largura x altura, em cm.
export function embalagem({ linha, embalagemFlag = null, pesoFlag = null }) {
  const medidas = String(embalagemFlag || linha?.dimensoes_cm || '').split(/x/i).map(numero)
  const peso = numero(pesoFlag || linha?.peso_g)
  if (medidas.length !== 3 || medidas.some(n => !(n > 0)) || !(peso > 0)) {
    return { atributos: [], pendencia: 'faltam as medidas e o peso da embalagem: passe --embalagem CxLxA (em cm) e --peso-g N, ou preencha dimensoes_cm e peso_g no catalogo do fornecedor' }
  }
  const [c, l, a] = medidas.map(Math.ceil)
  return {
    atributos: [
      { id: 'SELLER_PACKAGE_LENGTH', value_name: `${c} cm` },
      { id: 'SELLER_PACKAGE_WIDTH', value_name: `${l} cm` },
      { id: 'SELLER_PACKAGE_HEIGHT', value_name: `${a} cm` },
      { id: 'SELLER_PACKAGE_WEIGHT', value_name: `${Math.ceil(peso)} g` },
    ],
    pendencia: null,
  }
}

// Ficha do copy ({ "Nome na tela": "valor" }) contra os atributos da categoria. Casa pelo nome sem
// acento; valor que existe na lista fechada do atributo vai pelo id, o resto vai como texto.
// GTIN, o motivo de GTIN vazio e a embalagem (SELLER_PACKAGE_*) sao tratados no montarItem, nunca pela ficha.
// Valor fora da lista fechada vai como texto livre e sai em foraDaLista, pro montarItem avisar.
export function casarFicha(ficha, atributosDaCategoria) {
  const porNome = new Map()
  for (const a of atributosDaCategoria || []) {
    if (a.tags?.read_only || a.id === 'GTIN' || a.id === 'EMPTY_GTIN_REASON' || a.id.startsWith('SELLER_PACKAGE_')) continue
    porNome.set(normalizar(a.name), a)
  }
  const atributos = []
  const semCasa = []
  const foraDaLista = []
  const usados = new Set()
  for (const [nome, valor] of Object.entries(ficha || {})) {
    if (!String(valor ?? '').trim()) continue
    const a = porNome.get(normalizar(nome))
    if (!a) { semCasa.push(nome); continue }
    const naLista = (a.values || []).find(v => normalizar(v.name) === normalizar(valor))
    atributos.push(naLista ? { id: a.id, value_id: naLista.id } : { id: a.id, value_name: String(valor).trim() })
    if (!naLista && (a.values || []).length) foraDaLista.push({ nome: a.name, valor: String(valor).trim(), opcoes: a.values.slice(0, 8).map(v => v.name) })
    usados.add(a.id)
  }
  const falta = tag => [...porNome.values()].filter(a => a.tags?.[tag] && !usados.has(a.id)).map(a => a.name)
  const faltando = falta('required')
  const faltandoCatalogo = falta('catalog_required').filter(n => !faltando.includes(n))
  return { atributos, semCasa, foraDaLista, faltando, faltandoCatalogo }
}

function atributoDeGtin({ copy, decisao, atributosDaCategoria }) {
  if (copy?.gtin) return { id: 'GTIN', value_name: String(copy.gtin) }
  const motivo = (atributosDaCategoria || []).find(a => a.id === 'EMPTY_GTIN_REASON')
  if (!motivo) return null
  const procura = decisao?.tipo === 'kit' ? 'kit ou pack' : 'nao tem codigo'
  const valor = (motivo.values || []).find(v => normalizar(v.name).includes(procura))
  return valor ? { id: 'EMPTY_GTIN_REASON', value_id: valor.id } : null
}

const temVariacao = ({ linha, decisao }) =>
  Boolean(String(linha?.variacoes ?? '').trim()) || (Array.isArray(decisao?.variacoes) && decisao.variacoes.length > 0)

// Devolve { corpo, imagens, descricao, pendencias, avisos, planoB, resumo }. Pendencia trava o envio
// e diz o que fazer; planoB diz por que esse produto vai pelo checklist manual.
export function montarItem({ copy, decisao, auditoria, imagens, linha, categoria, atributosDaCategoria, estoque, garantiaDias, embalagemFlag = null, pesoFlag = null }) {
  const pendencias = []
  const avisos = []
  if (temVariacao({ linha, decisao })) {
    return { corpo: null, imagens: [], descricao: '', pendencias, avisos, planoB: 'produto com variacao (cor, tamanho, sabor): esta versao publica so anuncio simples, use o checklist manual', resumo: null }
  }

  const titulo = String(copy?.titulo ?? '').trim()
  const limite = Number(categoria?.max_title_length) || 60
  if (!titulo) pendencias.push('o copy.json nao tem titulo')
  else if (titulo.length > limite) pendencias.push(`o titulo tem ${titulo.length} caracteres e a categoria aceita ${limite}: encurte no copy.json e monte de novo`)

  const modalidade = auditoria?.modalidade_escolhida
  const listingType = modalidadeDoML(modalidade)
  if (!listingType) pendencias.push('a auditoria nao diz a modalidade (classico ou premium): rode a auditoria de novo')

  const preco = precoDeLista({ decisao, copy, modalidade })
  if (!preco.preco) pendencias.push('sem preco: nem a decisao nem o copy trazem preco pra essa modalidade')
  if (preco.aviso) avisos.push(preco.aviso)

  if (!(Number.isInteger(estoque) && estoque > 0)) pendencias.push('falta o estoque: passe --estoque N, com o que o fornecedor confirmou (numero inteiro maior que zero)')
  if (!(Number.isInteger(garantiaDias) && garantiaDias > 0)) pendencias.push('falta a garantia: passe --garantia-dias N (ex.: 90)')

  const ficha = casarFicha(copy?.ficha, atributosDaCategoria)
  for (const nome of ficha.faltando) pendencias.push(`a categoria exige "${nome}" e a ficha do copy.json nao tem: preencha e monte de novo`)
  for (const nome of ficha.faltandoCatalogo) avisos.push(`a ficha nao tem "${nome}": o Mercado Livre aceita sem, mas o anuncio perde forca na busca`)
  for (const f of ficha.foraDaLista) avisos.push(`"${f.nome}" vai como texto livre ("${f.valor}"); a categoria tem a lista ${f.opcoes.join(', ')}. Trocar na ficha por uma delas faz o anuncio aparecer no filtro`)
  if (ficha.semCasa.length) avisos.push(`campos da ficha que a categoria nao tem e ficaram de fora: ${ficha.semCasa.join(', ')}`)

  if (!String(copy?.descricao ?? '').trim()) pendencias.push('o copy.json nao tem descricao')

  const pacote = embalagem({ linha, embalagemFlag, pesoFlag })
  if (pacote.pendencia) pendencias.push(pacote.pendencia)

  const ordem = [...(imagens?.imagens || [])].sort((a, b) => Number(a.n) - Number(b.n)).map(i => i.arquivo)
  const teto = Number(categoria?.max_pictures_per_item) || 12
  if (ordem.length === 0) pendencias.push('o imagens.json nao tem nenhuma imagem')
  if (ordem.length > teto) avisos.push(`o mapa tem ${ordem.length} imagens e a categoria aceita ${teto}: vao as ${teto} primeiras`)

  const gtin = atributoDeGtin({ copy, decisao, atributosDaCategoria })
  const corpo = {
    family_name: titulo,
    category_id: categoria?.id,
    price: preco.preco,
    currency_id: 'BRL',
    available_quantity: estoque,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: listingType,
    status: 'paused',
    shipping: { mode: 'me2' },
    sale_terms: [
      { id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' },
      { id: 'WARRANTY_TIME', value_name: `${garantiaDias} dias` },
    ],
    attributes: [...ficha.atributos, ...(gtin ? [gtin] : []), ...pacote.atributos],
  }
  const resumo = {
    titulo, caracteres: titulo.length, limite,
    categoria: `${categoria?.nome} (${categoria?.id})`,
    modalidade: modalidade || null, preco: preco.preco, desconto_pct: preco.desconto_pct,
    estoque, garantia_dias: garantiaDias, imagens: Math.min(ordem.length, teto),
  }
  return { corpo, imagens: ordem.slice(0, teto), descricao: String(copy?.descricao ?? ''), pendencias, avisos, planoB: null, resumo }
}
