// Le a resposta da validacao do Mercado Livre (POST /items/validate, e a recusa de um POST /items)
// e devolve o que trava e o que so avisa, em frase de gente. Medido na conta real em 2026-09-30:
// anuncio certo pode voltar 400 so com avisos (type "warning"), entao quem decide e o tipo de cada
// causa, nunca o status HTTP sozinho.

const FRASE = {
  'item.family_name.length_invalid': 'o titulo passou do limite de caracteres da categoria: encurte no copy.json e monte de novo',
  'item.attribute.missing.seller.package.dimensions': 'faltam as medidas e o peso da embalagem: passe --embalagem CxLxA e --peso-g N, ou preencha dimensoes_cm e peso_g no catalogo do fornecedor',
  'item.attribute.invalid.format.seller.package.dimensions': 'medida ou peso da embalagem em formato errado: o Mercado Livre so aceita numero inteiro, em cm e em g',
  'item.listing_type_id.requiresPictures': 'o anuncio precisa de pelo menos uma foto',
  'item.shipping.mandatory_free_shipping': 'frete gratis obrigatorio nesse preco: o Mercado Livre liga sozinho, e o custo do frete sai da sua margem',
}

// Aviso que nao muda nada pra pessoa (conta sem o modo de envio antigo "me1").
const RUIDO = new Set(['shipping.lost_me1_by_user'])

// No --montar as imagens ainda nao subiram, entao a falta de foto e esperada.
export const IGNORAR_SEM_FOTO = ['item.listing_type_id.requiresPictures']

const frase = c => FRASE[c.code] || (c.type === 'warning' && c.message) || `${c.code}: ${c.message}`

export function lerValidacao(resposta, { ignorar = [] } = {}) {
  const { ok, status, dado } = resposta || {}
  if (ok) return { passou: true, erros: [], avisos: [], catalogo: false }
  const causas = (Array.isArray(dado?.cause) ? dado.cause : []).filter(c => !RUIDO.has(c.code) && !ignorar.includes(c.code))
  const erros = causas.filter(c => c.type !== 'warning').map(frase)
  const avisos = causas.filter(c => c.type === 'warning').map(frase)
  const catalogo = causas.some(c => c.type !== 'warning' && /catalog/i.test(c.code || ''))
  const semLista = !Array.isArray(dado?.cause) || dado.cause.length === 0
  if (status === 401 || status === 403) erros.push(`a conta do Mercado Livre nao deixou escrever (${status}): confira no /conectar se o aplicativo tem permissao de leitura e escrita, e autorize de novo. Enquanto isso, publique pelo checklist`)
  else if (semLista) erros.push(`o Mercado Livre recusou (${status}): ${dado?.error || dado?.message || 'sem detalhe'}`)
  return { passou: erros.length === 0, erros, avisos, catalogo }
}
