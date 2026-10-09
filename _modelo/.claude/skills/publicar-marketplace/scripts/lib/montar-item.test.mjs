// Testes da montagem do anuncio. Funcoes puras: contrato e resposta da API entram prontos.
// Os atributos da categoria imitam o formato de GET /categories/<id>/attributes medido em 2026-09-30.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, precoDeLista, modalidadeDoML, embalagem, casarFicha, montarItem } from './montar-item.mjs'

const ATRIBUTOS = [
  { id: 'BRAND', name: 'Marca', tags: { required: true, catalog_required: true } },
  { id: 'MODEL', name: 'Modelo', tags: { required: true, catalog_required: true } },
  { id: 'POWER_SUPPLY_TYPE', name: 'Tipo de alimentação', tags: { catalog_required: true }, values: [{ id: '1', name: 'Bateria' }, { id: '2', name: 'Corrente doméstica' }] },
  { id: 'COLOR', name: 'Cor', tags: {}, values: [{ id: '52049', name: 'Preto' }] },
  { id: 'GTIN', name: 'Código universal de produto', tags: { conditional_required: true } },
  { id: 'EMPTY_GTIN_REASON', name: 'Motivo de GTIN vazio', tags: { conditional_required: true }, values: [{ id: '17055158', name: 'O produto é um kit ou pack' }, { id: '17055160', name: 'O produto não tem código cadastrado' }] },
  { id: 'ITEM_CONDITION', name: 'Condição do item', tags: { read_only: true } },
]
const CATEGORIA = { id: 'MLB1', nome: 'Moedores', max_title_length: 60, max_pictures_per_item: 3 }
const copy = {
  titulo: 'Moedor Eletrico Inox 200w',
  descricao: 'Texto da descricao',
  ficha: { Marca: 'Acme', Modelo: 'M-1', 'Tipo de alimentacao': 'Corrente domestica', Cor: 'Preto', Voltagem: '127V', Largura: '' },
  precos: { ml_classico: 84.9, ml_premium: 89.9 },
  gtin: null,
}
const decisao = { tipo: 'individual', preco: { tabela: 96.5, alvo_pos_desconto: 84.9 }, marca_autorizada: 'Acme' }
const auditoria = { veredito: 'aprovado', modalidade_escolhida: 'classico' }
const imagens = { aprovado_pelo_usuario: true, imagens: [
  { n: 2, arquivo: 'anuncios/x/imagens/02-uso.jpg' },
  { n: 1, arquivo: 'anuncios/x/imagens/01-capa.jpg' },
  { n: 3, arquivo: 'anuncios/x/imagens/03-medidas.jpg' },
  { n: 4, arquivo: 'anuncios/x/imagens/04-extra.jpg' },
] }
const linha = { produto: 'Moedor', peso_g: '400', dimensoes_cm: '18.5x10.5x10', variacoes: '' }
const base = { copy, decisao, auditoria, imagens, linha, categoria: CATEGORIA, atributosDaCategoria: ATRIBUTOS, estoque: 5, garantiaDias: 90 }

test('normalizar tira acento, caixa e espaco sobrando', () => {
  assert.equal(normalizar('  Tipo de Alimentação '), 'tipo de alimentacao')
})

test('precoDeLista usa a tabela da decisao e calcula o desconto', () => {
  assert.deepEqual(precoDeLista({ decisao, copy, modalidade: 'classico' }), { preco: 96.5, desconto_pct: 12, aviso: null })
})

test('precoDeLista sem tabela cai no preco do copy e avisa', () => {
  const r = precoDeLista({ decisao: { tipo: 'individual' }, copy, modalidade: 'premium' })
  assert.equal(r.preco, 89.9)
  assert.equal(r.desconto_pct, null)
  assert.match(r.aviso, /sem preco de tabela/)
  assert.equal(precoDeLista({ decisao: {}, copy: { precos: {} }, modalidade: 'classico' }).preco, null)
})

test('precoDeLista premium usa o preco do copy e desconta da tabela', () => {
  const d = { preco: { tabela: 56.7, alvo_pos_desconto: 49.9 } }
  const c = { precos: { ml_classico: 49.9, ml_premium: 52.9 } }
  assert.deepEqual(precoDeLista({ decisao: d, copy: c, modalidade: 'premium' }), { preco: 56.7, desconto_pct: 7, aviso: null })
  assert.deepEqual(precoDeLista({ decisao: d, copy: c, modalidade: 'classico' }), { preco: 56.7, desconto_pct: 12, aviso: null })
})

test('precoDeLista com o preco da modalidade acima da tabela entra no preco da modalidade e avisa', () => {
  const r = precoDeLista({ decisao: { preco: { tabela: 50, alvo_pos_desconto: 45 } }, copy: { precos: { ml_premium: 52.9 } }, modalidade: 'premium' })
  assert.equal(r.preco, 52.9)
  assert.equal(r.desconto_pct, null)
  assert.match(r.aviso, /nao fica acima do preco da modalidade/)
})

test('marca de fabricante sem marca_autorizada vira pendencia; Genérica e marca autorizada passam', () => {
  const semAutorizacao = montarItem({ ...base, decisao: { ...decisao, marca_autorizada: null } })
  assert.ok(semAutorizacao.pendencias.some(p => /Marca "Acme" fora da regra/.test(p)), semAutorizacao.pendencias.join(' | '))
  const generica = montarItem({ ...base, copy: { ...copy, ficha: { ...copy.ficha, Marca: 'Genérica' } }, decisao: { ...decisao, marca_autorizada: null } })
  assert.ok(!generica.pendencias.some(p => /Marca/.test(p)), generica.pendencias.join(' | '))
  assert.ok(!montarItem(base).pendencias.some(p => /Marca/.test(p)), 'marca autorizada passa')
  const semMarca = montarItem({ ...base, copy: { ...copy, ficha: { ...copy.ficha, Marca: 'Sem marca' } }, decisao: { ...decisao, marca_autorizada: null } })
  assert.ok(semMarca.pendencias.some(p => /use "Genérica"/.test(p)), 'Sem marca nao e o valor do Mercado Livre')
})

test('modalidadeDoML traduz e recusa o que nao conhece', () => {
  assert.equal(modalidadeDoML('classico'), 'gold_special')
  assert.equal(modalidadeDoML('premium'), 'gold_pro')
  assert.equal(modalidadeDoML(undefined), null)
})

test('embalagem arredonda pra cima e sai em cm e g, e as flags mandam', () => {
  assert.deepEqual(embalagem({ linha }).atributos, [
    { id: 'SELLER_PACKAGE_LENGTH', value_name: '19 cm' },
    { id: 'SELLER_PACKAGE_WIDTH', value_name: '11 cm' },
    { id: 'SELLER_PACKAGE_HEIGHT', value_name: '10 cm' },
    { id: 'SELLER_PACKAGE_WEIGHT', value_name: '400 g' },
  ])
  const f = embalagem({ linha, embalagemFlag: '20x15x12', pesoFlag: '1200' })
  assert.equal(f.atributos[0].value_name, '20 cm')
  assert.equal(f.atributos[3].value_name, '1200 g')
  assert.equal(f.pendencia, null)
})

test('embalagem sem dado vira pendencia, com virgula decimal aceita', () => {
  assert.match(embalagem({ linha: null }).pendencia, /--embalagem/)
  assert.match(embalagem({ linha: { dimensoes_cm: '10x10', peso_g: '300' } }).pendencia, /--embalagem/)
  assert.equal(embalagem({ linha: { dimensoes_cm: '10,2x5x5', peso_g: '99,5' } }).atributos[0].value_name, '11 cm')
})

test('casarFicha casa pelo nome sem acento, usa value_id quando o valor existe na lista', () => {
  const r = casarFicha(copy.ficha, ATRIBUTOS)
  assert.deepEqual(r.atributos, [
    { id: 'BRAND', value_name: 'Acme' },
    { id: 'MODEL', value_name: 'M-1' },
    { id: 'POWER_SUPPLY_TYPE', value_id: '2' },
    { id: 'COLOR', value_id: '52049' },
  ])
  assert.deepEqual(r.semCasa, ['Voltagem'])
  assert.deepEqual(r.faltando, [])
  assert.deepEqual(r.faltandoCatalogo, [])
})

test('casarFicha separa obrigatorio que trava de obrigatorio de catalogo que so avisa', () => {
  const r = casarFicha({ Marca: 'Acme' }, ATRIBUTOS)
  assert.deepEqual(r.faltando, ['Modelo'])
  assert.deepEqual(r.faltandoCatalogo, ['Tipo de alimentação'])
})

test('casarFicha ignora valor vazio e atributo so de leitura', () => {
  const r = casarFicha({ Marca: '  ', 'Condição do item': 'Novo' }, ATRIBUTOS)
  assert.ok(!r.atributos.some(a => a.id === 'ITEM_CONDITION'))
  assert.deepEqual(r.faltando, ['Marca', 'Modelo'])
})

test('montarItem monta o corpo inteiro na forma que a validacao aceitou', () => {
  const r = montarItem(base)
  assert.equal(r.planoB, null)
  assert.deepEqual(r.pendencias, [])
  assert.deepEqual(r.corpo, {
    family_name: 'Moedor Eletrico Inox 200w',
    category_id: 'MLB1',
    price: 96.5,
    currency_id: 'BRL',
    available_quantity: 5,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    status: 'paused',
    shipping: { mode: 'me2' },
    sale_terms: [{ id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' }, { id: 'WARRANTY_TIME', value_name: '90 dias' }],
    attributes: [
      { id: 'BRAND', value_name: 'Acme' },
      { id: 'MODEL', value_name: 'M-1' },
      { id: 'POWER_SUPPLY_TYPE', value_id: '2' },
      { id: 'COLOR', value_id: '52049' },
      { id: 'EMPTY_GTIN_REASON', value_id: '17055160' },
      { id: 'SELLER_PACKAGE_LENGTH', value_name: '19 cm' },
      { id: 'SELLER_PACKAGE_WIDTH', value_name: '11 cm' },
      { id: 'SELLER_PACKAGE_HEIGHT', value_name: '10 cm' },
      { id: 'SELLER_PACKAGE_WEIGHT', value_name: '400 g' },
    ],
  })
  assert.ok(!('title' in r.corpo), 'a API recusa title junto com family_name (medido)')
})

test('montarItem poe as imagens na ordem do mapa e corta no teto da categoria', () => {
  const r = montarItem(base)
  assert.deepEqual(r.imagens, ['anuncios/x/imagens/01-capa.jpg', 'anuncios/x/imagens/02-uso.jpg', 'anuncios/x/imagens/03-medidas.jpg'])
  assert.ok(r.avisos.some(a => /4 imagens/.test(a) && /3/.test(a)))
})

test('montarItem com GTIN manda o codigo, kit manda o motivo de kit', () => {
  assert.ok(montarItem({ ...base, copy: { ...copy, gtin: '7890000000000' } }).corpo.attributes.some(a => a.id === 'GTIN' && a.value_name === '7890000000000'))
  const kit = montarItem({ ...base, decisao: { ...decisao, tipo: 'kit' }, linha: null, embalagemFlag: '20x20x10', pesoFlag: '800' })
  assert.ok(kit.corpo.attributes.some(a => a.id === 'EMPTY_GTIN_REASON' && a.value_id === '17055158'))
})

test('montarItem junta as pendencias que travam, sem inventar valor', () => {
  const r = montarItem({ ...base, copy: { ...copy, titulo: 'X'.repeat(61), ficha: { Marca: 'Acme' } }, auditoria: { veredito: 'aprovado' }, linha: null, estoque: null, garantiaDias: null })
  const texto = r.pendencias.join(' | ')
  for (const trecho of [/titulo tem 61/, /Modelo/, /modalidade/, /--embalagem/, /--estoque/, /--garantia-dias/]) assert.match(texto, trecho)
})

test('montarItem manda pro plano B produto com variacao', () => {
  assert.match(montarItem({ ...base, linha: { ...linha, variacoes: 'cores' } }).planoB, /variacao/)
  assert.match(montarItem({ ...base, decisao: { ...decisao, variacoes: ['azul', 'rosa'] } }).planoB, /variacao/)
})

test('montarItem avisa campo de catalogo faltando e campo da ficha sem casa', () => {
  const r = montarItem({ ...base, copy: { ...copy, ficha: { Marca: 'Acme', Modelo: 'M-1', Voltagem: '127V' } } })
  assert.deepEqual(r.pendencias, [])
  assert.ok(r.avisos.some(a => /Tipo de alimentação/.test(a)))
  assert.ok(r.avisos.some(a => /Voltagem/.test(a)))
})

test('montarItem recusa estoque que nao e inteiro positivo', () => {
  for (const estoque of [0, -1, 2.5]) assert.ok(montarItem({ ...base, estoque }).pendencias.some(p => /--estoque/.test(p)), String(estoque))
})

test('montarItem avisa valor da ficha fora da lista fechada, com as opcoes, e manda como texto', () => {
  const r = montarItem({ ...base, copy: { ...copy, ficha: { ...copy.ficha, 'Tipo de alimentação': 'Elétrico (tomada)' } } })
  const aviso = r.avisos.find(a => /Elétrico \(tomada\)/.test(a))
  assert.ok(aviso, 'sem aviso de fora da lista')
  assert.match(aviso, /texto livre/)
  assert.match(aviso, /Bateria, Corrente doméstica/)
  assert.ok(r.corpo.attributes.some(a => a.id === 'POWER_SUPPLY_TYPE' && a.value_name === 'Elétrico (tomada)'))
  const f = casarFicha({ 'Tipo de alimentação': 'Solar' }, ATRIBUTOS)
  assert.deepEqual(f.foraDaLista, [{ nome: 'Tipo de alimentação', valor: 'Solar', opcoes: ['Bateria', 'Corrente doméstica'] }])
})

test('casarFicha nunca pega a embalagem pela ficha, nem cobra como faltando', () => {
  const comEmbalagem = [...ATRIBUTOS, { id: 'SELLER_PACKAGE_WEIGHT', name: 'Peso do pacote', tags: { required: true } }]
  const r = casarFicha({ Marca: 'Acme', 'Peso do pacote': '10 g' }, comEmbalagem)
  assert.ok(!r.atributos.some(a => a.id === 'SELLER_PACKAGE_WEIGHT'))
  assert.ok(!r.faltando.includes('Peso do pacote'))
  assert.ok(!montarItem({ ...base, atributosDaCategoria: comEmbalagem }).pendencias.some(p => /Peso do pacote/.test(p)))
})

test('montarItem trata descricao vazia como pendencia', () => {
  for (const descricao of ['', '   ', undefined]) assert.ok(montarItem({ ...base, copy: { ...copy, descricao } }).pendencias.some(p => /nao tem descricao/.test(p)), String(descricao))
})
