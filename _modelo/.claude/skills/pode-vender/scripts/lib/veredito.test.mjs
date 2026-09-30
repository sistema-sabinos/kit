// Testes da regra do gate de marca. Rodar: node --test veredito.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SELO, CATEGORIAS, gatesDaCategoria, tiposDaCategoria, decidir } from './veredito.mjs'

const ml = (veredito, totalBusca = 5000, anunciosComAMarca = 20) => ({ veredito, totalBusca, anunciosComAMarca })
const dossie = (lista = []) => ({
  confirmados: lista.length,
  guardaChuva: lista.filter(d => d.guardaChuva).length,
  dossies: lista,
})
const d = (produtos, guardaChuva = false) => ({ data: '2026-05-10', produtos, guardaChuva })
const notif = (n, numeros = []) => ({
  notificadosAtivos: n,
  itens: numeros.map(numero => ({ produto: 'X', numero, tipo: 'Notificado', situacao: 'Ativo' })),
})
const ok = { controleOk: true }

test('categorias e gates por categoria', () => {
  assert.deepEqual(CATEGORIAS, ['suplemento', 'alimento', 'cosmetico', 'saneante', 'outra'])
  assert.deepEqual(gatesDaCategoria('suplemento'), { ml: true, dossie: true, notificacao: true })
  assert.deepEqual(gatesDaCategoria('alimento'), { ml: true, dossie: true, notificacao: false })
  assert.deepEqual(gatesDaCategoria('cosmetico'), { ml: true, dossie: true, notificacao: false })
  assert.deepEqual(gatesDaCategoria('outra'), { ml: true, dossie: false, notificacao: false })
  assert.throws(() => gatesDaCategoria('eletronico'), /categoria "eletronico" nao existe/)
  assert.deepEqual(tiposDaCategoria('suplemento'), ['Alimento', 'Medicamento'])
  assert.deepEqual(tiposDaCategoria('saneante'), ['Saneantes'])
  assert.deepEqual(tiposDaCategoria('cosmetico'), ['Cosmético'])
})

test('regra 1: controle falhou deixa tudo INCONCLUSIVO, mesmo com gates bons', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie(), notificacao: notif(3) } }, { categoria: 'suplemento', controleOk: false })
  assert.equal(r.selo, SELO.INCONCLUSIVO)
  assert.match(r.motivos[0], /controle/)
  assert.match(r.rota, /pesquisa web/)
})

test('regra 1: gate que devia rodar e deu erro (ou nao veio) deixa a marca INCONCLUSIVO', () => {
  const comErro = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: { erro: 'a ANVISA nao liberou' }, notificacao: notif(3) } }, { categoria: 'suplemento', ...ok })
  assert.equal(comErro.selo, SELO.INCONCLUSIVO)
  assert.match(comErro.motivos.join(' '), /a ANVISA nao liberou/)
  const semNotif = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie() } }, { categoria: 'suplemento', ...ok })
  assert.equal(semNotif.selo, SELO.INCONCLUSIVO)
})

test('regra 2: dossie guarda-chuva com a marca rara ou ausente no ML e NAO PODE', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('RARA', 3000, 2), dossie: dossie([d('TODOS OS SUPLEMENTOS - MARCA ACME', true)]), notificacao: notif(5) } }, { categoria: 'suplemento', ...ok })
  assert.equal(r.selo, SELO.NAO)
  assert.match(r.motivos[0], /marca inteira/)
})

test('regra 2: dossie guarda-chuva com a marca viva no ML e ATENCAO, mostrando a empresa', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie([{ data: '2026-04-24', produtos: 'TODOS OS SUPLEMENTOS - MARCA ACME', empresa: 'REVENDA X', guardaChuva: true }]), notificacao: notif(5) } }, { categoria: 'suplemento', ...ok })
  assert.equal(r.selo, SELO.ATENCAO)
  assert.match(r.motivos.join(' '), /revendedor/)
  assert.match(r.motivos.join(' '), /REVENDA X/)
  assert.match(r.rota, /fabricante/)
})

test('regra 3: marca ausente do ML com busca magra e NAO PODE; com busca cheia e ATENCAO', () => {
  const magra = decidir({ marca: 'Acme', gates: { ml: ml('AUSENTE', 12, 0) } }, { categoria: 'outra', ...ok })
  assert.equal(magra.selo, SELO.NAO)
  const cheia = decidir({ marca: 'Acme', gates: { ml: ml('AUSENTE', 8000, 0) } }, { categoria: 'outra', ...ok })
  assert.equal(cheia.selo, SELO.ATENCAO)
})

test('regra 3: marca ausente com busca cheia mas com dossie confirmado e NAO PODE', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('AUSENTE', 8000, 0), dossie: dossie([d('ACME COLAGENO')]) } }, { categoria: 'alimento', ...ok })
  assert.equal(r.selo, SELO.NAO)
})

test('regra 3b: dossie lido pela metade nunca da PODE', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: { ...dossie(), total: 80, incompleto: true }, notificacao: notif(3, ['1']) } }, { categoria: 'suplemento', ...ok })
  assert.equal(r.selo, SELO.ATENCAO)
  assert.match(r.motivos.join(' '), /80 dossies/)
})

test('regra 4: suplemento sem notificacao encontrada e ATENCAO, mesmo com dossie so de um produto', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie([d('ACME TERMOGENICO')]), notificacao: notif(0) } }, { categoria: 'suplemento', ...ok })
  assert.equal(r.selo, SELO.ATENCAO)
  assert.match(r.rota, /numero de notificacao/)
  assert.match(r.rota, /01\/09\/2026/)
  assert.equal(r.vetados.length, 1)
  assert.match(r.motivos[0], /imprecisa/)
})

test('regra 5: dossie de produto especifico e PODE MENOS OS VETADOS, com a lista', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie([d('ACME TERMOGENICO')]), notificacao: notif(2, ['1.2345.6789.001-1']) } }, { categoria: 'suplemento', ...ok })
  assert.equal(r.selo, SELO.PODE_MENOS)
  assert.deepEqual(r.vetados, ['2026-05-10: ACME TERMOGENICO'])
})

test('regra 6: suplemento com notificacao ativa e PODE, com o numero nos motivos', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie(), notificacao: notif(1, ['1.2345.6789.001-1']) } }, { categoria: 'suplemento', ...ok })
  assert.equal(r.selo, SELO.PODE)
  assert.match(r.motivos.join(' '), /1\.2345\.6789\.001-1/)
  assert.match(r.motivos.join(' '), /confira que sao mesmo da sua marca/)
  assert.match(r.motivos.join(' '), /detentor nao informado/)
})

test('regra 7: categoria sem gate C com tudo ok e PODE NA MARCA', () => {
  const alimento = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE'), dossie: dossie() } }, { categoria: 'alimento', ...ok })
  assert.equal(alimento.selo, SELO.PODE_NA_MARCA)
  const outra = decidir({ marca: 'Acme', gates: { ml: ml('PRESENTE') } }, { categoria: 'outra', ...ok })
  assert.equal(outra.selo, SELO.PODE_NA_MARCA)
  assert.match(outra.motivos.join(' '), /resto do \/pode-vender/)
})

test('marca rara no ML entra como motivo sem mudar o selo', () => {
  const r = decidir({ marca: 'Acme', gates: { ml: ml('RARA', 3000, 2) } }, { categoria: 'outra', ...ok })
  assert.equal(r.selo, SELO.PODE_NA_MARCA)
  assert.match(r.motivos[0], /so 2 anuncio/)
})

test('nenhum caminho devolve PODE quando algum gate falhou', () => {
  for (const categoria of CATEGORIAS) {
    const r = decidir({ marca: 'Acme', gates: { ml: { erro: 'pagina mudou' }, dossie: dossie(), notificacao: notif(3) } }, { categoria, ...ok })
    assert.equal(r.selo, SELO.INCONCLUSIVO, categoria)
  }
})
