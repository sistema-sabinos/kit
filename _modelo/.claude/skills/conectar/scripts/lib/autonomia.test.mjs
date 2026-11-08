// Testes do leitor do arquivo de permissao (_contexto/autonomia.md).
// Rodar: node --test autonomia.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerAutonomia, AREAS_AUTONOMIA } from './autonomia.mjs'

const NL = String.fromCharCode(10)
const CERCA = String.fromCharCode(96).repeat(3)
const bloco = (...linhas) => [CERCA + 'autonomia', ...linhas, CERCA, ''].join(NL)

test('texto vazio, sem bloco ou bloco vazio: nenhuma permissao e nenhum problema', () => {
  for (const t of ['', undefined, 'so texto da pessoa', bloco()]) {
    const r = lerAutonomia(t)
    assert.deepEqual(r, { areas: {}, problemas: [] })
  }
})

test('o arquivo zerado do _modelo le vazio (e o bloco existe de verdade)', () => {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const texto = readFileSync(join(aqui, '..', '..', '..', '..', '..', '_contexto', 'autonomia.md'), 'utf8')
  assert.ok(texto.includes(CERCA + 'autonomia'), 'o arquivo precisa trazer o bloco')
  assert.deepEqual(lerAutonomia(texto), { areas: {}, problemas: [] })
})

test('area de dinheiro completa vira entrada com teto e por_vez numericos', () => {
  const r = lerAutonomia(bloco(
    'area: gasto-ia', 'pode: gastar', 'teto: 20 usd mes', 'por_vez: 2,5',
    'definido_em: 2026-11-07', 'definido_por: dono', 'frase: pode gastar ate 100 reais por mes',
  ))
  assert.deepEqual(r.problemas, [])
  assert.deepEqual(r.areas['gasto-ia'], {
    area: 'gasto-ia', pode: ['gastar'], teto: { valor: 20, moeda: 'USD', periodo: 'mes' }, por_vez: 2.5,
    definido_em: '2026-11-07', definido_por: 'dono', frase: 'pode gastar ate 100 reais por mes',
  })
})

test('area com acoes fechadas: lista de acoes e campos ausentes viram null', () => {
  const r = lerAutonomia(bloco('area: anuncio-ml', 'pode: decidir, fotos,criar-pausado'))
  assert.deepEqual(r.problemas, [])
  assert.deepEqual(r.areas['anuncio-ml'].pode, ['decidir', 'fotos', 'criar-pausado'])
  assert.equal(r.areas['anuncio-ml'].teto, null)
  assert.equal(r.areas['anuncio-ml'].frase, null)
})

test('area repetida: a ultima vale inteira, sem misturar campos do registro antigo', () => {
  const r = lerAutonomia(bloco(
    'area: gasto-ia', 'pode: gastar', 'teto: 20 USD mes', 'frase: antiga',
    'area: anuncio-ml', 'pode: decidir',
    'area: gasto-ia', 'pode: gastar', 'teto: 5 USD mes',
  ))
  assert.deepEqual(r.problemas, [])
  assert.equal(r.areas['gasto-ia'].teto.valor, 5)
  assert.equal(r.areas['gasto-ia'].frase, null)
  assert.deepEqual(r.areas['anuncio-ml'].pode, ['decidir'])
})

test('area repetida com pode vazio: a permissao foi tirada', () => {
  const r = lerAutonomia(bloco('area: apagar', 'pode: apagar', 'area: apagar', 'pode:'))
  assert.deepEqual(r.areas.apagar.pode, [])
})

test('ultimo registro quebrado derruba a area, mesmo com um bom antes dele', () => {
  const r = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', 'teto: 20 USD mes', 'area: gasto-ia', 'pode: gastar', 'teto: muito'))
  assert.equal(r.areas['gasto-ia'], undefined)
  assert.equal(r.problemas.length, 1)
  assert.equal(r.problemas[0].codigo, 'teto-invalido')
})

test('teto invalido: texto, zero, negativo, moeda, periodo e partes faltando', () => {
  for (const teto of ['abc', '0 USD mes', '-3 USD mes', '10 EUR mes', '10 USD ano', '10 USD', '10', '10 USD mes extra']) {
    const r = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', `teto: ${teto}`))
    assert.equal(r.areas['gasto-ia'], undefined, `teto "${teto}" devia derrubar a area`)
    assert.equal(r.problemas.at(-1).codigo, 'teto-invalido', teto)
  }
})

test('por_vez invalido derruba a area; teto e por_vez fora de area de dinheiro tambem', () => {
  let r = lerAutonomia(bloco('area: verba-meta', 'pode: gastar', 'teto: 10 USD mes', 'por_vez: dois'))
  assert.equal(r.areas['verba-meta'], undefined)
  assert.equal(r.problemas[0].codigo, 'por-vez-invalido')
  r = lerAutonomia(bloco('area: apagar', 'pode: apagar', 'teto: 5 USD mes'))
  assert.equal(r.areas.apagar, undefined)
  assert.equal(r.problemas[0].codigo, 'teto-fora-de-dinheiro')
  r = lerAutonomia(bloco('area: anuncio-ml', 'pode: decidir', 'por_vez: 3'))
  assert.equal(r.problemas[0].codigo, 'por-vez-fora-de-dinheiro')
})

test('area fora da lista: some, com problema, e as boas do mesmo bloco seguem', () => {
  const r = lerAutonomia(bloco('area: ligar-pro-cliente', 'pode: ligar', 'area: apagar', 'pode: apagar'))
  assert.equal(r.areas['ligar-pro-cliente'], undefined)
  assert.deepEqual(r.areas.apagar.pode, ['apagar'])
  assert.equal(r.problemas.length, 1)
  assert.equal(r.problemas[0].codigo, 'area-desconhecida')
  assert.equal(r.problemas[0].area, 'ligar-pro-cliente')
})

test('pode em trafego e em mercado-ads e recusado', () => {
  for (const area of ['trafego', 'mercado-ads']) {
    const r = lerAutonomia(bloco(`area: ${area}`, 'pode: ativar'))
    assert.equal(r.areas[area], undefined, area)
    assert.equal(r.problemas.length, 1, area)
    assert.equal(r.problemas[0].codigo, 'area-recusada', area)
  }
  // nenhuma das duas esta na lista que aceita permissao
  assert.ok(!AREAS_AUTONOMIA.includes('trafego') && !AREAS_AUTONOMIA.includes('mercado-ads'))
})

test('acao fora da lista fechada da area derruba a area', () => {
  const r = lerAutonomia(bloco('area: atendimento-ml', 'pode: responder-pergunta, reembolsar'))
  assert.equal(r.areas['atendimento-ml'], undefined)
  assert.equal(r.problemas[0].codigo, 'acao-invalida')
})

test('bloco que nao fecha: nenhuma permissao, um problema', () => {
  const r = lerAutonomia([CERCA + 'autonomia', 'area: apagar', 'pode: apagar', ''].join(NL))
  assert.deepEqual(r.areas, {})
  assert.equal(r.problemas.length, 1)
  assert.equal(r.problemas[0].codigo, 'bloco-aberto')
})


function vazioCom(t, codigo) {
  const r = lerAutonomia(t)
  assert.deepEqual(r.areas, {}, `defeito ${codigo} devia esvaziar todas as areas`)
  assert.ok(r.problemas.some(p => p.codigo === codigo), `faltou o problema ${codigo}: ${JSON.stringify(r.problemas)}`)
}
const BOA = ['area: apagar', 'pode: apagar']

test('defeito estrutural esvazia o arquivo inteiro: linha ilegivel (com CRLF), campo sem area, campo repetido', () => {
  const crlf = bloco(...BOA, 'area gasto-ia', 'pode: gastar', 'teto: 5 USD mes').split(NL).join(String.fromCharCode(13, 10))
  vazioCom(crlf, 'linha-ilegivel')
  vazioCom(bloco('pode: gastar', ...BOA), 'campo-sem-area')
  vazioCom(bloco(...BOA, 'area: gasto-ia', 'pode: gastar', 'teto: 20 USD mes', 'teto: 900 USD mes'), 'campo-repetido')
})

test('segundo bloco autonomia esvazia tudo; texto depois do primeiro bloco nao conta', () => {
  const dois = bloco(...BOA) + 'texto no meio' + NL + bloco('area: anuncio-ml', 'pode: fotos')
  vazioCom(dois, 'bloco-repetido')
  const um = bloco(...BOA) + 'qualquer prosa depois' + NL
  assert.deepEqual(lerAutonomia(um).areas.apagar.pode, ['apagar'])
})

test('pode vazio e valor presente: tira a permissao do registro anterior', () => {
  const r = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', 'teto: 20 USD mes', 'area: gasto-ia', 'pode:'))
  assert.deepEqual(r.problemas, [])
  assert.deepEqual(r.areas['gasto-ia'].pode, [])
})

test('area de dinheiro com pode exige teto; sem pode nao exige', () => {
  for (const a of ['gasto-ia', 'verba-meta', 'verba-google', 'verba-ml-ads']) {
    const r = lerAutonomia(bloco(`area: ${a}`, 'pode: gastar'))
    assert.equal(r.areas[a], undefined, a)
    assert.equal(r.problemas[0].codigo, 'teto-faltando', a)
  }
  assert.deepEqual(lerAutonomia(bloco('area: gasto-ia', 'pode:')).areas['gasto-ia'].pode, [])
})

test('acoes fechadas das areas de dinheiro e do apagar', () => {
  assert.equal(lerAutonomia(bloco('area: gasto-ia', 'pode: apagar', 'teto: 5 USD mes')).problemas[0].codigo, 'acao-invalida')
  assert.equal(lerAutonomia(bloco('area: apagar', 'pode: gastar')).problemas[0].codigo, 'acao-invalida')
})

test('gasto-ia so aceita USD; verba-* aceita BRL', () => {
  const g = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', 'teto: 100 BRL mes'))
  assert.equal(g.areas['gasto-ia'], undefined)
  assert.equal(g.problemas[0].codigo, 'teto-invalido')
  const v = lerAutonomia(bloco('area: verba-meta', 'pode: gastar', 'teto: 100 BRL semana'))
  assert.deepEqual(v.areas['verba-meta'].teto, { valor: 100, moeda: 'BRL', periodo: 'semana' })
})

test('por_vez acima do teto derruba a area; igual ao teto passa', () => {
  const r = lerAutonomia(bloco('area: verba-google', 'pode: gastar', 'teto: 10 USD mes', 'por_vez: 10,5'))
  assert.equal(r.areas['verba-google'], undefined)
  assert.equal(r.problemas[0].codigo, 'por-vez-acima-do-teto')
  assert.equal(lerAutonomia(bloco('area: verba-google', 'pode: gastar', 'teto: 10 USD mes', 'por_vez: 10')).areas['verba-google'].por_vez, 10)
})

test('definido_em precisa ser data real do calendario', () => {
  for (const d of ['2026-13-45', '2026-02-30', '2026-00-10', '26-01-01']) {
    const r = lerAutonomia(bloco('area: apagar', 'pode: apagar', `definido_em: ${d}`))
    assert.equal(r.areas.apagar, undefined, d)
    assert.equal(r.problemas[0].codigo, 'data-invalida', d)
  }
  assert.equal(lerAutonomia(bloco('area: apagar', 'pode: apagar', 'definido_em: 2028-02-29')).areas.apagar.definido_em, '2028-02-29')
})

test('campo desconhecido derruba so a area dele', () => {
  const r = lerAutonomia(bloco(...BOA, 'area: anuncio-ml', 'pode: fotos', 'bonus: sim'))
  assert.deepEqual(r.areas.apagar.pode, ['apagar'])
  assert.equal(r.areas['anuncio-ml'], undefined)
  assert.equal(r.problemas[0].codigo, 'campo-desconhecido')
})

test('S3b: primeiro bloco sem fechar e um segundo com a revogacao: a cerca com texto nao fecha o primeiro', () => {
  const t = [CERCA + 'autonomia', 'area: apagar', 'pode: apagar', ''].join(NL) + bloco('area: apagar', 'pode:')
  const r = lerAutonomia(t)
  assert.deepEqual(r.areas, {})
  assert.ok(r.problemas.some(p => p.codigo === 'bloco-aberto'), JSON.stringify(r.problemas))
  // cerca de fecho com espaco em volta ainda fecha
  assert.deepEqual(lerAutonomia([CERCA + 'autonomia', 'area: apagar', 'pode: apagar', '  ' + CERCA + '  ', ''].join(NL)).areas.apagar.pode, ['apagar'])
})

test('cerca de abertura so vale como linha propria: citar a cerca no meio da frase nao abre bloco', () => {
  const citado = ['Exemplo citado: ' + CERCA + 'autonomia', 'area: apagar', 'pode: apagar', CERCA, ''].join(NL)
  assert.deepEqual(lerAutonomia(citado), { areas: {}, problemas: [] })
  // a citacao no texto nao atrapalha o bloco de verdade que vem depois
  const comBloco = 'Veja: ' + CERCA + 'autonomia' + NL + bloco('area: apagar', 'pode: apagar')
  assert.deepEqual(lerAutonomia(comBloco).areas.apagar.pode, ['apagar'])
  // abertura com espaco em volta ainda abre
  assert.deepEqual(lerAutonomia(['  ' + CERCA + 'autonomia  ', 'area: apagar', 'pode: apagar', CERCA, ''].join(NL)).areas.apagar.pode, ['apagar'])
})

test('numero fora do alcance (Infinity) e zero nao passam em teto nem por_vez', () => {
  const nove = '9'.repeat(309)
  let r = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', `teto: ${nove} USD mes`))
  assert.equal(r.areas['gasto-ia'], undefined)
  assert.equal(r.problemas[0].codigo, 'teto-invalido')
  r = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', 'teto: 10 USD mes', `por_vez: ${nove}`))
  assert.equal(r.areas['gasto-ia'], undefined)
  assert.equal(r.problemas[0].codigo, 'por-vez-invalido')
  for (const zero of ['0', '0,0', '-0']) {
    r = lerAutonomia(bloco('area: gasto-ia', 'pode: gastar', `teto: ${zero} USD mes`))
    assert.equal(r.areas['gasto-ia'], undefined, zero)
    assert.equal(r.problemas[0].codigo, 'teto-invalido', zero)
  }
})
