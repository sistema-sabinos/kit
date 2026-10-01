// Testes da leitura da validacao do Mercado Livre. As respostas sao as medidas na conta real em
// 2026-09-30 (POST /items/validate), com os textos da API como vieram.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerValidacao, IGNORAR_SEM_FOTO } from './erros-ml.mjs'

const causa = (type, code, message) => ({ department: 'items', cause_id: 1, type, code, references: [], message })
const recusa = (...cause) => ({ ok: false, status: 400, dado: { cause, message: 'Validation error', error: 'validation_error', status: 400 } })

test('204 passa sem erro nem aviso', () => {
  assert.deepEqual(lerValidacao({ ok: true, status: 204, dado: null }), { passou: true, erros: [], avisos: [], catalogo: false })
})

test('400 so com aviso passa: foi o que a API respondeu pro anuncio certo', () => {
  const r = lerValidacao(recusa(
    causa('warning', 'shipping.lost_me1_by_user', 'User has not mode me1'),
    causa('warning', 'item.shipping.mandatory_free_shipping', 'Mandatory free shipping added'),
  ))
  assert.equal(r.passou, true)
  assert.deepEqual(r.erros, [])
  assert.equal(r.avisos.length, 1, 'o aviso de me1 e ruido e sai')
  assert.match(r.avisos[0], /frete gratis/)
})

test('cada erro medido vira frase com o que fazer', () => {
  const r = lerValidacao(recusa(
    causa('error', 'item.family_name.length_invalid', 'Family Name length is over of 60 character'),
    causa('error', 'item.attribute.missing.seller.package.dimensions', 'The attributes [...] are all required'),
    causa('error', 'item.attribute.invalid.format.seller.package.dimensions', 'Only integers are accepted'),
    causa('error', 'item.listing_type_id.requiresPictures', 'Item pictures are mandatory for listing type gold_special'),
  ))
  assert.equal(r.passou, false)
  assert.equal(r.erros.length, 4)
  assert.match(r.erros[0], /titulo/)
  assert.match(r.erros[1], /medidas e o peso da embalagem/)
  assert.match(r.erros[2], /numero inteiro/)
  assert.match(r.erros[3], /foto/)
})

test('aviso de ficha usa a frase da propria API, que ja vem em portugues', () => {
  const r = lerValidacao(recusa(causa('warning', 'item.attribute.missing_catalog_required', 'O campo "Modelo" é obrigatório e não foi adicionado.')))
  assert.equal(r.passou, true)
  assert.deepEqual(r.avisos, ['O campo "Modelo" é obrigatório e não foi adicionado.'])
})

test('erro sem traducao sai com codigo e mensagem, nunca some', () => {
  const r = lerValidacao(recusa(causa('error', 'item.coisa.nova', 'Something new')))
  assert.equal(r.passou, false)
  assert.deepEqual(r.erros, ['item.coisa.nova: Something new'])
})

test('recusa sem lista de causa (campo invalido) tambem vira erro', () => {
  const r = lerValidacao({ ok: false, status: 400, dado: { cause: [], message: 'body.invalid_fields', error: 'The fields [title] are invalid for requested call.', status: 400 } })
  assert.equal(r.passou, false)
  assert.equal(r.erros.length, 1)
  assert.match(r.erros[0], /title/)
})

test('erro de catalogo liga a flag do plano B', () => {
  const r = lerValidacao(recusa(causa('error', 'item.catalog_listing.required', 'Catalog listing required')))
  assert.equal(r.catalogo, true)
  assert.equal(lerValidacao(recusa(causa('warning', 'item.attribute.missing_catalog_required', 'x'))).catalogo, false, 'aviso de ficha de catalogo nao e catalogo obrigatorio')
})

test('ignorar tira o erro de foto quando a validacao roda antes de subir as imagens', () => {
  const r = lerValidacao(recusa(causa('error', 'item.listing_type_id.requiresPictures', 'x')), { ignorar: IGNORAR_SEM_FOTO })
  assert.equal(r.passou, true)
})

test('500 da API nao passa', () => {
  const r = lerValidacao({ ok: false, status: 500, dado: { message: 'internal' } })
  assert.equal(r.passou, false)
  assert.ok(r.erros.length > 0)
})

test('conta sem permissao de escrita manda pro /conectar', () => {
  for (const status of [401, 403]) {
    const r = lerValidacao({ ok: false, status, dado: { message: 'forbidden', error: 'forbidden', status, cause: [] } })
    assert.equal(r.passou, false)
    assert.equal(r.erros.length, 1)
    assert.match(r.erros[0], /conectar/)
  }
})
