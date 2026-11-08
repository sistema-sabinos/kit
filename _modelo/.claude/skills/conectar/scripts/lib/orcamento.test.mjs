// Testes da porta do gasto avulso: teto por lote, orcamento do mes, saldo, trava e registrador.
// Rodar: node --test orcamento.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import {
  lerTeto, TETO_PADRAO_USD, lerOrcamento, gastoDoMes, saldoDoMes, liberarGasto, fecharReserva,
  registrarCusto, mesDaLinha, emLocal, comTrava, SEM_ORCAMENTO, MINIMO_VIDEOS_HISTORICO, avisoDaPermissao,
} from './orcamento.mjs'

const LIB = join(dirname(fileURLToPath(import.meta.url)), 'orcamento.mjs')
const NL = String.fromCharCode(10)

function comArquivo(texto, fazer) {
  const dir = mkdtempSync(join(tmpdir(), 'teto-'))
  try {
    const caminho = join(dir, 'mercado-livre.md')
    if (texto !== null) writeFileSync(caminho, texto)
    return fazer(caminho)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

const bloco = (...linhas) => ['# Configuracao', '', '```mercado-livre', ...linhas, '```', ''].join(NL)
const blocoOrc = (...linhas) => ['# Orcamento do mes', '', 'Texto pra pessoa.', '', '```orcamento', ...linhas, '```', ''].join(NL)

// Projeto de mentira: { ml, orcamento, custos } viram arquivos na raiz temporaria; video: false e o projeto
// sem a /configurar-video (so de ML).
async function comProjeto({ ml, orcamento, custos, video = true } = {}, fazer) {
  const raiz = mkdtempSync(join(tmpdir(), 'orcamento-'))
  try {
    mkdirSync(join(raiz, '_contexto'))
    mkdirSync(join(raiz, 'dados'))
    if (video) mkdirSync(join(raiz, '.claude', 'skills', 'configurar-video'), { recursive: true })
    if (ml) writeFileSync(join(raiz, '_contexto', 'mercado-livre.md'), ml)
    if (orcamento) writeFileSync(join(raiz, '_contexto', 'orcamento.md'), orcamento)
    if (custos) writeFileSync(join(raiz, 'dados', 'custos.jsonl'), custos.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join(NL) + NL)
    return await fazer(raiz)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
}

test('sem o arquivo (projeto so de video) o teto e o padrao, sem mandar rodar /mercado-livre', () => {
  assert.equal(comArquivo(null, lerTeto), TETO_PADRAO_USD)
  assert.equal(TETO_PADRAO_USD, 4)
})

test('o campo do bloco vale, com virgula ou ponto', () => {
  assert.equal(comArquivo(bloco('erp: nenhum', 'limite_gasto_usd: 7,5'), lerTeto), 7.5)
  assert.equal(comArquivo(bloco('limite_gasto_usd: 2'), lerTeto), 2)
})

// o lerConfiguracao do ML tambem fica com a ultima (cada linha sobrescreve a anterior)
test('campo repetido: vale a ultima linha, igual ao lerConfiguracao do ML', () => {
  assert.equal(comArquivo(bloco('limite_gasto_usd: 9', 'limite_gasto_usd: 1'), lerTeto), 1)
})

test('arquivo sem o bloco ou bloco sem o campo cai no padrao', () => {
  assert.equal(comArquivo('# so texto' + NL + 'limite_gasto_usd: 9' + NL, lerTeto), TETO_PADRAO_USD)
  assert.equal(comArquivo(bloco('erp: nenhum'), lerTeto), TETO_PADRAO_USD)
  assert.equal(comArquivo(bloco('limite_gasto_usd:'), lerTeto), TETO_PADRAO_USD)
})

test('campo que nao e numero para o gasto, e a mensagem nao manda rodar /mercado-livre', () => {
  assert.throws(() => comArquivo(bloco('limite_gasto_usd: muito'), lerTeto), e => /precisa ser numero/.test(e.message) && !/Rode \/mercado-livre/.test(e.message))
})

// B2: os quatro casos do leitor
test('leitor, so limite_gasto_usd: teto por lote do ML, com a linha de orcamento nao definido', () => comProjeto({ ml: bloco('limite_gasto_usd: 7') }, (raiz) => {
  assert.deepEqual(lerOrcamento({ raiz }), { tipo: 'lote', usd: 7, aviso: SEM_ORCAMENTO })
  assert.match(SEM_ORCAMENTO, /rode \/configurar-video/)
}))

test('leitor, os dois: vale o orcamento do mes e o teto por lote sai, sem converter um no outro', () => comProjeto({ ml: bloco('limite_gasto_usd: 7'), orcamento: blocoOrc('orcamento_mes_usd: 20', 'definido_em: 2026-10-31') }, (raiz) => {
  const o = lerOrcamento({ raiz })
  assert.equal(o.tipo, 'mes')
  assert.equal(o.usd, 20)
  assert.equal(o.aviso, undefined)
}))

test('leitor, nenhum: teto padrao por lote; o modelo do kit com o campo vazio conta como nao definido', () => comProjeto({}, async (raiz) => {
  assert.deepEqual(lerOrcamento({ raiz }), { tipo: 'lote', usd: TETO_PADRAO_USD, aviso: SEM_ORCAMENTO })
  writeFileSync(join(raiz, '_contexto', 'orcamento.md'), blocoOrc('orcamento_mes_usd:', 'definido_em:'))
  assert.equal(lerOrcamento({ raiz }).tipo, 'lote')
}))

test('leitor, bloco quebrado: lanca, e o liberarGasto para o gasto com a mensagem, mesmo autorizado', () => comProjeto({ orcamento: '# Orcamento' + NL + 'orcamento_mes_usd: 20' + NL }, (raiz) => {
  assert.throws(() => lerOrcamento({ raiz }), /bloco `orcamento` sumiu/)
  const r = liberarGasto({ estimativaUsd: 0.1, autorizado: true }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /bloco `orcamento` sumiu/)
  writeFileSync(join(raiz, '_contexto', 'orcamento.md'), blocoOrc('orcamento_mes_usd: vinte'))
  const r2 = liberarGasto({ estimativaUsd: 0.1, autorizado: true }, { raiz })
  assert.equal(r2.codigo, 3)
  assert.match(r2.parou, /precisa ser numero/)
}))

// B3: o mes e o local. Fuso em processo filho, porque o TZ so vale na partida do processo.
function noFuso(tz, codigo) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import * as o from ${JSON.stringify(pathToFileURL(LIB).href)}; ${codigo}`], { env: { ...process.env, TZ: tz }, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

test('virada do mes no fuso da maquina: 02:30 UTC de 1/11 conta em outubro em Sao Paulo, e data sem hora 2026-11-01 conta em novembro', () => {
  const linhas = JSON.stringify([
    { em: '2026-11-01T02:30:00Z', servico: 'gemini-imagem', usd: 1 },
    { em: '2026-11-01', servico: 'gemini-video', usd: 2 },
  ].map(l => JSON.stringify(l)).join(NL))
  const conta = (agora) => `console.log(JSON.stringify(o.gastoDoMes(${linhas}, { agora: new Date(${JSON.stringify(agora)}) }).usd))`
  assert.equal(noFuso('America/Sao_Paulo', conta('2026-10-31T15:00:00-03:00')), 1)
  assert.equal(noFuso('America/Sao_Paulo', conta('2026-11-15T15:00:00-03:00')), 2)
  // canario: em UTC a mesma linha das 02:30 ja e novembro, entao o fuso de verdade mudou a conta
  assert.equal(noFuso('UTC', conta('2026-11-15T15:00:00Z')), 3)
})

test('mesDaLinha le data sem hora pela string e devolve null pra data que nao e data', () => {
  assert.equal(mesDaLinha('2026-11-01'), '2026-11')
  assert.equal(mesDaLinha('ontem'), null)
  assert.equal(mesDaLinha(undefined), null)
})

test('isca: linha so com brl, usd nulo, quebrada, sem data e fora da lista saem da soma e aparecem contadas a parte', () => {
  const agora = new Date(2026, 9, 20, 12)
  const em = emLocal(new Date(2026, 9, 10, 12))
  const texto = [
    JSON.stringify({ em, servico: 'gemini-imagem', usd: 0.5 }),
    JSON.stringify({ em, servico: 'dominio do app', usd: 0, brl: 40 }),
    JSON.stringify({ em, servico: 'gemini-video', usd: null, nota: 'modelo fora da tabela' }),
    JSON.stringify({ em, servico: 'gemini-tts', brl: 3 }),
    JSON.stringify({ servico: 'gemini-imagem', usd: 9 }),
    '{lixo',
    JSON.stringify({ em: emLocal(new Date(2026, 8, 10, 12)), servico: 'gemini-imagem', usd: 7 }),
  ].join(NL)
  const g = gastoDoMes(texto, { agora })
  assert.equal(g.usd, 0.5)
  assert.deepEqual(g.a_parte, { quebradas: 2, nulas: 1, so_brl: 1, fora_da_lista: 1 })
})

// D56: a linha da midia-social (servico de fora do Gemini, com area) conta; a de app feita a mao, sem area, nao
test('linha com area entra na soma mesmo com servico fora da lista; sem area segue a parte', () => {
  const agora = new Date(2026, 9, 15, 12)
  const em = emLocal(new Date(2026, 9, 10, 12))
  const texto = [
    JSON.stringify({ em, servico: 'openai (carrossel)', usd: 0.4, area: 'imagem' }),
    JSON.stringify({ em, servico: 'dominio do app', usd: 12 }),
  ].join(NL)
  const g = gastoDoMes(texto, { agora })
  assert.equal(g.usd, 0.4)
  assert.equal(g.a_parte.fora_da_lista, 1)
})

// D58: o extrato por area, a soma dos baldes fecha com o gasto do mes
test('extrato: cada servico cai no balde certo e a area gravada vence o servico', () => {
  const agora = new Date(2026, 9, 15, 12)
  const em = emLocal(new Date(2026, 9, 10, 12))
  const linhas = [
    { servico: 'gemini-imagem', usd: 0.25 },
    { servico: 'gemini-visao', usd: 0.5 },
    { servico: 'gemini-fiscal-olho-final', usd: 1 },
    { servico: 'gemini-tts', usd: 0.125 },
    { servico: 'gemini-video', usd: 2 },
    { servico: 'gemini (pauta)', usd: 0.03, area: 'outros' },
    { servico: 'openai (carrossel)', usd: 0.4, area: 'imagem' },
  ]
  const g = gastoDoMes(linhas.map(l => JSON.stringify({ em, ...l })).join(NL), { agora })
  assert.deepEqual(g.por_area, { video: 3.125, imagem: 0.65, ml: 0.5, outros: 0.03 })
  assert.equal(Object.values(g.por_area).reduce((a, b) => a + b, 0).toFixed(6), g.usd.toFixed(6))
})

test('saldo do mes traz o extrato por area', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10'), custos: [{ em: emLocal(), servico: 'gemini-visao', usd: 1 }, { em: emLocal(), servico: 'gemini-imagem', usd: 2 }] }, (raiz) => {
  const s = saldoDoMes({ raiz })
  assert.equal(s.gasto_usd, 3)
  assert.deepEqual(s.por_area, { video: 0, imagem: 2, ml: 1, outros: 0 })
}))

// D57: projeto so de ML nao tem a /configurar-video, entao o aviso que manda rodar ela some
test('leitor sem a /configurar-video no projeto: teto por lote sem o aviso; com ela, com o aviso', () => comProjeto({ ml: bloco('limite_gasto_usd: 7'), video: false }, (raiz) => {
  assert.deepEqual(lerOrcamento({ raiz }), { tipo: 'lote', usd: 7 })
  assert.equal(liberarGasto({ estimativaUsd: 1, autorizado: true }, { raiz }).aviso, undefined)
  mkdirSync(join(raiz, '.claude', 'skills', 'configurar-video'), { recursive: true })
  assert.equal(lerOrcamento({ raiz }).aviso, SEM_ORCAMENTO)
}))

// B4: a trava unica
test('cabe: libera sem mostrar saldo e grava a reserva da estimativa', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10'), custos: [{ em: emLocal(), servico: 'gemini-imagem', usd: 3 }] }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 2, autorizado: true }, { raiz, contexto: 'teste' })
  assert.equal(r.codigo, 0)
  assert.ok(r.reserva)
  // liberado nao diz quanto sobra: so o codigo, a estimativa e o id da reserva
  assert.deepEqual(Object.keys(r).sort(), ['codigo', 'estimativa_usd', 'reserva'])
  const s = saldoDoMes({ raiz })
  assert.equal(s.reservado_usd, 2)
  assert.equal(s.saldo_usd, 5)
}))

test('cabe sem o pode ir: para pedindo o sim e nao reserva', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10') }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 2, autorizado: false }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /pode ir/)
  assert.equal(saldoDoMes({ raiz }).reservado_usd, 0)
}))

test('nao cabe: codigo 3 com a media dada, o gasto do mes e o motivo dito como hipotese', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10', 'media_video_usd: 1,5'), custos: [{ em: emLocal(), servico: 'gemini-imagem', usd: 9 }] }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 2, autorizado: true }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /nao cabe/)
  assert.match(r.parou, /ja gastou US\$ 9\.00/)
  assert.match(r.parou, /media dada .* US\$ 1\.50 por video/)
  assert.match(r.parou, /mais videos, mais cenas, videos mais longos ou mais tentativas/)
  assert.match(r.parou, /hipotese/)
}))

test('acabou: codigo 3 mesmo com estimativa minuscula; com o minimo de videos o motivo vira medida', () => comProjeto({
  orcamento: blocoOrc('orcamento_mes_usd: 3', 'media_video_usd: 0.5'),
  custos: Array.from({ length: MINIMO_VIDEOS_HISTORICO }, (_, i) => ({ em: emLocal(), servico: 'gemini-imagem', usd: 1, video: `v${i}` })),
}, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 0.001, autorizado: true }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /acabou/)
  assert.match(r.parou, new RegExp(`teve ${MINIMO_VIDEOS_HISTORICO} videos a US\\$ 1\\.00`))
  assert.ok(!/hipotese/.test(r.parou))
}))

test('sem orcamento: teto por lote igual a antes, com o aviso de orcamento nao definido', () => comProjeto({ ml: bloco('limite_gasto_usd: 4') }, (raiz) => {
  assert.match(liberarGasto({ estimativaUsd: 5, autorizado: true }, { raiz }).parou, /passa do limite_gasto_usd/)
  const ok = liberarGasto({ estimativaUsd: 3, autorizado: true }, { raiz })
  assert.equal(ok.codigo, 0)
  assert.equal(ok.reserva, null)
  assert.equal(ok.aviso, SEM_ORCAMENTO)
  assert.ok(!existsSync(join(raiz, 'dados', 'orcamento-reservas.json')), 'teto por lote nao reserva')
}))

// 5.49 (bloco C, 2026-11-03): acima do teto por lote, o pode ir que cita o valor passa a valer.
test('teto por lote: acima dele passa com o --acima-do-teto igual ou maior que a estimativa e autorizado', () => comProjeto({ ml: bloco('limite_gasto_usd: 4') }, (raiz) => {
  const sem = liberarGasto({ estimativaUsd: 5, autorizado: true }, { raiz })
  assert.equal(sem.codigo, 3)
  assert.match(sem.parou, /^Barrada pela trava gasto, regra teto-do-lote: .*--acima-do-teto 5 --autorizado/)
  assert.equal(liberarGasto({ estimativaUsd: 5, autorizado: true, acimaDoTetoUsd: 5 }, { raiz }).codigo, 0, 'valor igual a estimativa passa')
  assert.equal(liberarGasto({ estimativaUsd: 5, autorizado: true, acimaDoTetoUsd: 6 }, { raiz }).codigo, 0, 'valor maior passa')
  const menor = liberarGasto({ estimativaUsd: 5, autorizado: true, acimaDoTetoUsd: 4.99 }, { raiz })
  assert.equal(menor.codigo, 3)
  assert.match(menor.parou, /regra teto-do-lote: o --acima-do-teto \(4\.99\) e menor que a estimativa/)
  assert.equal(liberarGasto({ estimativaUsd: 5, autorizado: true, acimaDoTetoUsd: NaN }, { raiz }).codigo, 3, 'valor que nao e numero para')
  const semSim = liberarGasto({ estimativaUsd: 5, autorizado: false, acimaDoTetoUsd: 5 }, { raiz })
  assert.match(semSim.parou, /^Barrada pela trava gasto, regra pode-ir: precisa do pode ir/)
}))

// 5.49 (Codex final, 2026-11-04): o valor citado e teto tambem abaixo do limite por lote e com orcamento do mes
// (o /agendar passa o valor por rodada mostrado no agendamento)
test('valor citado: abaixo do teto por lote e com orcamento do mes, a estimativa maior que ele para', async () => {
  await comProjeto({ ml: bloco('limite_gasto_usd: 4') }, (raiz) => {
    const r = liberarGasto({ estimativaUsd: 3, autorizado: true, acimaDoTetoUsd: 1 }, { raiz })
    assert.equal(r.codigo, 3, 'US$ 3 com US$ 1 citado para')
    assert.match(r.parou, /^Barrada pela trava gasto, regra pode-ir: este gasto \(US\$ 3\.00\) passa do valor citado no pode ir \(1\)/)
    assert.equal(liberarGasto({ estimativaUsd: 3, autorizado: true, acimaDoTetoUsd: 3 }, { raiz }).codigo, 0, 'citado igual passa')
    assert.equal(liberarGasto({ estimativaUsd: 3, autorizado: true }, { raiz }).codigo, 0, 'sem citado, abaixo do teto, passa')
  })
  await comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10') }, (raiz) => {
    const r = liberarGasto({ estimativaUsd: 3, autorizado: true, acimaDoTetoUsd: 1 }, { raiz })
    assert.equal(r.codigo, 3, 'com orcamento do mes tambem para')
    assert.match(r.parou, /regra pode-ir: este gasto \(US\$ 3\.00\) passa do valor citado/)
    assert.ok(!existsSync(join(raiz, 'dados', 'orcamento-reservas.json')), 'parado antes de reservar')
  })
})

test('orcamento do mes segue duro: o --acima-do-teto nao passa gasto que nao cabe', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 2') }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 5, autorizado: true, acimaDoTetoUsd: 50 }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /^Barrada pela trava gasto, regra orcamento-do-mes: este gasto \(US\$ 5\.00\) nao cabe/)
  assert.match(r.parou, /Diga ao usuario o nome da trava e da regra e decida o proximo passo; nao refaca esta acao por outro caminho\.$/)
}))

test('reserva: o gasto registrado com ela desconta do que falta, fechar devolve a sobra, e a de processo morto segue contando', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10') }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 4, autorizado: true }, { raiz })
  registrarCusto({ servico: 'gemini-imagem', usd: 1, contexto: 'x', reserva: r.reserva }, { raiz })
  let s = saldoDoMes({ raiz })
  assert.equal(s.gasto_usd, 1)
  assert.equal(s.reservado_usd, 3)
  assert.equal(s.saldo_usd, 6)
  assert.equal(fecharReserva(r.reserva, { raiz }), true)
  s = saldoDoMes({ raiz })
  assert.equal(s.saldo_usd, 9)
  // reserva de um pid que nao existe mais: o gasto pode ter sido cobrado sem linha, entao conta
  const morto = liberarGasto({ estimativaUsd: 2, autorizado: true }, { raiz, pid: 2147483646 })
  s = saldoDoMes({ raiz })
  assert.equal(s.saldo_usd, 7)
  assert.equal(s.reservas.find(x => x.id === morto.reserva).vivo, false)
}))

// 5.44: a reserva do gasto feito a mao (pid null, a CLI sem --pid) fica viva por 2 horas desde que abriu
test('reserva a mao: sem pid e com ate 2 horas depois, viva antes do ate e morta depois; a antiga sem ate segue morta', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10') }, (raiz) => {
  const t0 = new Date()
  const r = liberarGasto({ estimativaUsd: 1, autorizado: true }, { raiz, pid: null, agora: () => t0 })
  const arq = join(raiz, 'dados', 'orcamento-reservas.json')
  const gravada = JSON.parse(readFileSync(arq, 'utf8')).find(x => x.id === r.reserva)
  assert.equal('pid' in gravada, false)
  assert.equal(Date.parse(gravada.ate) - Date.parse(gravada.em), 2 * 60 * 60 * 1000)
  const em = (ms) => new Date(t0.getTime() + ms)
  assert.equal(saldoDoMes({ raiz, agora: em(60 * 60 * 1000) }).reservas.find(x => x.id === r.reserva).vivo, true)
  assert.equal(saldoDoMes({ raiz, agora: em(2 * 60 * 60 * 1000 + 1000) }).reservas.find(x => x.id === r.reserva).vivo, false)
  // a antiga (sem pid e sem ate) e a de pid vivo ficam como antes
  const lista = JSON.parse(readFileSync(arq, 'utf8'))
  lista.push({ id: 'antiga', usd: 1, em: emLocal(t0), contexto: '' })
  writeFileSync(arq, JSON.stringify(lista))
  const vivo = liberarGasto({ estimativaUsd: 1, autorizado: true }, { raiz, pid: process.pid, agora: () => t0 })
  const s = saldoDoMes({ raiz, agora: em(60 * 60 * 1000) })
  assert.equal(s.reservas.find(x => x.id === 'antiga').vivo, false)
  assert.equal(s.reservas.find(x => x.id === vivo.reserva).vivo, true)
  assert.equal('ate' in JSON.parse(readFileSync(arq, 'utf8')).find(x => x.id === vivo.reserva), false)
}))

test('trava de processo morto se rouba; a de processo vivo espera e estoura o prazo', () => comProjeto({}, (raiz) => {
  writeFileSync(join(raiz, 'dados', 'orcamento.trava'), JSON.stringify({ pid: 2147483646, dono: 'velho' }))
  assert.equal(comTrava(raiz, () => 'entrou'), 'entrou')
  assert.ok(!existsSync(join(raiz, 'dados', 'orcamento.trava')))
  writeFileSync(join(raiz, 'dados', 'orcamento.trava'), JSON.stringify({ pid: process.pid, dono: 'outro' }))
  assert.throws(() => comTrava(raiz, () => 'nao', { prazoMs: 200 }), /nao terminou a tempo/)
  assert.ok(existsSync(join(raiz, 'dados', 'orcamento.trava')), 'trava de outro dono nao se apaga')
}))

test('duas liberacoes ao mesmo tempo com saldo pra uma so (dois processos, fetch falso atrasado): so uma libera', () => comProjeto({ orcamento: blocoOrc('orcamento_mes_usd: 10') }, async (raiz) => {
  const filho = join(raiz, 'gasto.mjs')
  writeFileSync(filho, [
    `import { liberarGasto, registrarCusto, fecharReserva } from ${JSON.stringify(pathToFileURL(LIB).href)}`,
    'const [raiz, largada] = process.argv.slice(2)',
    'while (Date.now() < Number(largada)) {}',
    "const r = liberarGasto({ estimativaUsd: 6, autorizado: true }, { raiz })",
    'if (r.codigo === 0) {',
    '  await new Promise(ok => setTimeout(ok, 400))',
    "  registrarCusto({ servico: 'gemini-imagem', usd: 6, contexto: 'filho', reserva: r.reserva }, { raiz })",
    '  fecharReserva(r.reserva, { raiz })',
    '}',
    'console.log(JSON.stringify({ codigo: r.codigo }))',
  ].join(NL))
  const largada = String(Date.now() + 600)
  const rodar = () => new Promise((ok) => {
    const p = spawn(process.execPath, [filho, raiz, largada])
    let out = ''
    p.stdout.on('data', c => { out += c })
    p.on('close', () => ok(JSON.parse(out).codigo))
  })
  const codigos = (await Promise.all([rodar(), rodar()])).sort()
  assert.deepEqual(codigos, [0, 3])
  assert.equal(readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split(NL).length, 1)
}))

test('registrarCusto grava em com o deslocamento local e so os opcionais que vieram', () => comProjeto({}, (raiz) => {
  registrarCusto({ servico: 'gemini-imagem', usd: 0.0336, contexto: 'c', video: 'reel-1', cenas: 1 }, { raiz, agora: () => new Date('2026-10-31T23:30:00Z') })
  const l = JSON.parse(readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8'))
  assert.equal(new Date(l.em).getTime(), Date.parse('2026-10-31T23:30:00Z'))
  assert.match(l.em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
  assert.deepEqual(Object.keys(l), ['em', 'servico', 'usd', 'contexto', 'video', 'cenas'])
}))

test('registrarCusto grava area, modelo e tokens; area fora da lista nao grava', () => comProjeto({}, (raiz) => {
  registrarCusto({ servico: 'gemini-visao', usd: 0.01, contexto: 'c', area: 'ml', modelo: 'm', tokens_entrada: 10, tokens_saida: 5 }, { raiz })
  registrarCusto({ servico: 'x', usd: 0.01, contexto: 'c', area: 'qualquer', tokens: 7 }, { raiz })
  const [a, b] = readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8').trim().split(NL).map(l => JSON.parse(l))
  assert.deepEqual([a.area, a.modelo, a.tokens_entrada, a.tokens_saida], ['ml', 'm', 10, 5])
  assert.equal(b.area, undefined)
  assert.equal(b.tokens, 7)
}))

// 5.52 (chat 3, decisao 1): a permissao de gasto (area gasto-ia do _contexto/autonomia.md)
const blocoAut = (...linhas) => ['# Permissoes', '', '```autonomia', ...linhas, '```', ''].join(NL)
const gastoIa = (teto = '5 USD mes', porVez = '2') => blocoAut('area: gasto-ia', 'pode: gastar', `teto: ${teto}`, ...(porVez ? [`por_vez: ${porVez}`] : []), 'definido_em: 2026-11-07', 'frase: pode gastar ate 25 reais por mes')
const PERM = (raiz) => join(raiz, 'dados', 'permissao-gastos.jsonl')
const linhasPerm = (raiz) => existsSync(PERM(raiz)) ? readFileSync(PERM(raiz), 'utf8').trim().split(NL).filter(Boolean).map(l => JSON.parse(l)) : []
async function comPermissao({ autonomia, orcamento = blocoOrc('orcamento_mes_usd: 10'), custos, permissao } = {}, fazer) {
  return comProjeto({ orcamento, custos }, (raiz) => {
    if (autonomia !== undefined) writeFileSync(join(raiz, '_contexto', 'autonomia.md'), autonomia)
    if (permissao) writeFileSync(PERM(raiz), permissao.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join(NL) + NL)
    return fazer(raiz)
  })
}

test('permissao: dentro do teto libera sem o sim, reserva, grava a linha da permissao e diz quanto resta', () => comPermissao({ autonomia: gastoIa() }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 1.5, autorizado: false }, { raiz, contexto: 'teste' })
  assert.equal(r.codigo, 0, r.parou)
  assert.ok(r.reserva)
  assert.deepEqual(r.permissao, { resta_usd: 3.5, teto_usd: 5, periodo: 'mes' })
  assert.match(avisoDaPermissao(r), /foi pela permissao .*resta US\$ 3\.50 de US\$ 5\.00 no mes/)
  const [l] = linhasPerm(raiz)
  assert.deepEqual([l.usd, l.reserva, l.contexto, l.teto], [1.5, r.reserva, 'teste', '5 USD mes'])
  assert.equal(saldoDoMes({ raiz }).reservado_usd, 1.5, 'a reserva do mes segue igual a do sim')
  assert.ok(!existsSync(join(raiz, 'dados', 'custos.jsonl')), 'a linha da permissao fica fora do custos.jsonl')
  assert.equal(liberarGasto({ estimativaUsd: 2, autorizado: false }, { raiz }).codigo, 0)
  assert.equal(liberarGasto({ estimativaUsd: 1.5, autorizado: false }, { raiz }).permissao?.resta_usd, 0, 'o ultimo centavo do teto ainda cabe')
  assert.equal(liberarGasto({ estimativaUsd: 0.01, autorizado: false }, { raiz }).codigo, 3, 'canario: com o teto cheio para')
}))

// Codex comum (5.52, chat 3): a liberacao que termina sem cobranca devolve o teto da permissao; cobranca nunca volta
test('permissao: fechar com devolver sem linha de custo devolve o teto uma vez; com cobranca ou fechada a mao nao devolve', () => comPermissao({ autonomia: gastoIa('1 USD mes', '') }, (raiz) => {
  const a = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
  const m = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
  assert.deepEqual([a.codigo, m.codigo], [0, 0])
  assert.equal(liberarGasto({ estimativaUsd: 0.01, autorizado: false }, { raiz }).codigo, 3, 'canario: teto cheio')
  assert.equal(fecharReserva(m.reserva, { raiz }), true)
  assert.equal(liberarGasto({ estimativaUsd: 0.01, autorizado: false }, { raiz }).codigo, 3, 'fechada a mao (--saldo) nao devolve')
  assert.equal(fecharReserva(a.reserva, { raiz, devolver: true }), true)
  assert.equal(fecharReserva(a.reserva, { raiz, devolver: true }), false)
  const b = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
  assert.equal(b.codigo, 0, 'a liberacao sem cobranca devolveu o teto')
  assert.equal(b.permissao.resta_usd, 0, 'devolveu uma vez so')
  registrarCusto({ servico: 'gemini-imagem', usd: 0.2, contexto: 't', reserva: b.reserva }, { raiz })
  assert.equal(fecharReserva(b.reserva, { raiz, devolver: true }), true)
  assert.equal(liberarGasto({ estimativaUsd: 0.01, autorizado: false }, { raiz }).codigo, 3, 'cobranca de verdade nunca devolve')
  assert.deepEqual(linhasPerm(raiz).filter(l => l.devolucao).map(l => l.reserva), [a.reserva])
  assert.equal(saldoDoMes({ raiz }).gasto_usd, 0.2, 'a devolucao fica fora da soma do mes')
}))

test('permissao: acima do por_vez para com o pode ir de sempre e nao grava nada', () => comPermissao({ autonomia: gastoIa() }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 2.5, autorizado: false }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /^Barrada pela trava gasto, regra pode-ir: precisa do pode ir/)
  assert.match(r.fora_da_permissao, /passa do por_vez da permissao \(US\$ 2\.00\)/)
  assert.deepEqual(linhasPerm(raiz), [])
  assert.equal(saldoDoMes({ raiz }).reservado_usd, 0)
  assert.equal(liberarGasto({ estimativaUsd: 2.5, autorizado: true }, { raiz }).codigo, 0, 'com o sim passa')
  assert.deepEqual(linhasPerm(raiz), [], 'gasto com o sim explicito nao conta no teto da permissao')
}))

test('permissao: teto do periodo estourado para; linha de outro mes nao entra na soma', () => comPermissao({
  autonomia: gastoIa('5 USD mes', ''),
  permissao: [{ em: emLocal(), usd: 4.5, reserva: 'a' }, { em: emLocal(new Date(new Date().getFullYear() - 1, 0, 15, 12)), usd: 100, reserva: 'velha' }],
}, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 1, autorizado: false }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.fora_da_permissao, /passa do que resta do teto da permissao \(US\$ 0\.50 de US\$ 5\.00 no mes\)/)
  assert.equal(linhasPerm(raiz).length, 2)
  const ok = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
  assert.equal(ok.codigo, 0, 'canario: o resto do mes ainda libera, e a linha velha ficou fora')
  assert.equal(ok.permissao.resta_usd, 0)
}))

test('permissao: mes estourado para pela regra orcamento-do-mes mesmo com permissao', () => comPermissao({ autonomia: gastoIa(), orcamento: blocoOrc('orcamento_mes_usd: 1'), custos: [{ em: emLocal(), servico: 'gemini-imagem', usd: 0.8 }] }, (raiz) => {
  const r = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
  assert.equal(r.codigo, 3)
  assert.match(r.parou, /^Barrada pela trava gasto, regra orcamento-do-mes: este gasto \(US\$ 0\.50\) nao cabe/)
  assert.deepEqual(linhasPerm(raiz), [])
}))

test('permissao: arquivo quebrado, permissao tirada ou sem orcamento do mes voltam ao pode ir', async () => {
  for (const [nome, autonomia] of [
    ['bloco aberto', '```autonomia' + NL + 'area: gasto-ia' + NL + 'pode: gastar' + NL + 'teto: 5 USD mes' + NL],
    ['linha ilegivel', blocoAut('area: gasto-ia', 'pode: gastar', 'teto: 5 USD mes', 'isto nao e campo')],
    ['teto em reais', blocoAut('area: gasto-ia', 'pode: gastar', 'teto: 25 BRL mes')],
    ['permissao tirada', blocoAut('area: gasto-ia', 'pode: gastar', 'teto: 5 USD mes', 'area: gasto-ia', 'pode:')],
  ]) {
    await comPermissao({ autonomia }, (raiz) => {
      const r = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
      assert.equal(r.codigo, 3, nome)
      assert.match(r.parou, /regra pode-ir: precisa do pode ir/, nome)
      assert.deepEqual(linhasPerm(raiz), [], nome)
    })
  }
  await comPermissao({ autonomia: gastoIa(), permissao: ['{lixo'] }, (raiz) => {
    const r = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
    assert.equal(r.codigo, 3)
    assert.match(r.fora_da_permissao, /permissao-gastos\.jsonl tem defeito/)
  })
  await comPermissao({ autonomia: gastoIa(), orcamento: null }, (raiz) => {
    const r = liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz })
    assert.equal(r.codigo, 3)
    assert.match(r.fora_da_permissao, /so vale com o orcamento do mes definido/)
    assert.deepEqual(linhasPerm(raiz), [])
  })
  // canario: a mesma permissao certa libera
  await comPermissao({ autonomia: gastoIa() }, (raiz) => assert.equal(liberarGasto({ estimativaUsd: 0.5, autorizado: false }, { raiz }).codigo, 0))
})

test('permissao: dois processos no ultimo centavo do teto, so um libera', () => comPermissao({ autonomia: gastoIa('1 USD mes', '') }, async (raiz) => {
  const filho = join(raiz, 'gasto.mjs')
  writeFileSync(filho, [
    `import { liberarGasto } from ${JSON.stringify(pathToFileURL(LIB).href)}`,
    'const [raiz, largada] = process.argv.slice(2)',
    'while (Date.now() < Number(largada)) {}',
    "const r = liberarGasto({ estimativaUsd: 0.6, autorizado: false }, { raiz })",
    'console.log(JSON.stringify({ codigo: r.codigo }))',
  ].join(NL))
  const largada = String(Date.now() + 600)
  const rodar = () => new Promise((ok) => {
    const p = spawn(process.execPath, [filho, raiz, largada])
    let out = ''
    p.stdout.on('data', c => { out += c })
    p.on('close', () => ok(JSON.parse(out).codigo))
  })
  const codigos = (await Promise.all([rodar(), rodar()])).sort()
  assert.deepEqual(codigos, [0, 3])
  assert.equal(linhasPerm(raiz).length, 1)
}))

test('permissao: virada de semana e de mes pelo fuso da maquina', () => {
  // 2026-11-09 e segunda; 02:30 UTC dela ainda e domingo 23:30 em Sao Paulo
  const conta = (linhas, periodo, agora) => `console.log(JSON.stringify(o.gastoDaPermissao(${JSON.stringify(linhas.map(l => JSON.stringify(l)).join(NL))}, { periodo: ${JSON.stringify(periodo)}, agora: new Date(${JSON.stringify(agora)}) })))`
  const semana = [{ em: '2026-11-09T02:30:00Z', usd: 1 }, { em: '2026-11-01T12:00:00-03:00', usd: 2 }]
  assert.equal(noFuso('America/Sao_Paulo', conta(semana, 'semana', '2026-11-08T15:00:00-03:00')), 1)
  assert.equal(noFuso('UTC', conta(semana, 'semana', '2026-11-08T15:00:00Z')), 0, 'canario: em UTC a linha ja e da semana seguinte')
  assert.equal(noFuso('America/Sao_Paulo', conta(semana, 'semana', '2026-11-09T12:00:00-03:00')), 0)
  const mes = [{ em: '2026-12-01T02:30:00Z', usd: 3 }]
  assert.equal(noFuso('America/Sao_Paulo', conta(mes, 'mes', '2026-11-20T12:00:00-03:00')), 3)
  assert.equal(noFuso('UTC', conta(mes, 'mes', '2026-11-20T12:00:00Z')), 0, 'canario: em UTC a linha ja e de dezembro')
  assert.equal(noFuso('America/Sao_Paulo', conta([{ em: '2026-11-08T23:59:00-03:00', usd: 1 }], 'dia', '2026-11-09T00:01:00-03:00')), 0)
})

test('emLocal: em Sao Paulo a hora e a local e o deslocamento e -03:00', () => {
  assert.equal(noFuso('America/Sao_Paulo', "console.log(JSON.stringify(o.emLocal(new Date('2026-11-01T02:30:00Z'))))"), '2026-10-31T23:30:00.000-03:00')
})

// 5.52 (chat 3, conserto da interna): os textos de gasto que mandam esperar o pode ir citam a permissao escrita no
// mesmo trecho, senao a IA pede o pode ir mesmo com a permissao dada, ou fica entre duas ordens
test('SKILL: os textos de gasto com o pode ir citam a permissao do autonomia.md no mesmo trecho', () => {
  const SKILLS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const casos = [
    ['editar-video', 'gasto (imagem por IA, olho final) só com o'],
    ['mercado-livre', 'Custo: antes de todo gasto, mesmo pequeno e dentro do teto'],
    ['gerar-imagens', 'Gemini, só depois do "pode ir" desta rodada'],
    ['midia-social', 'Antes de qualquer uso, o comando diz quanto vai custar'],
  ]
  for (const [skill, ancora] of casos) {
    const texto = readFileSync(join(SKILLS, skill, 'SKILL.md'), 'utf8')
    const ini = texto.indexOf(ancora)
    assert.ok(ini >= 0, `canario: a ${skill}/SKILL.md tem o trecho de gasto`)
    const trecho = texto.slice(ini, ini + 400)
    assert.match(trecho, /pode ir/, `canario: o trecho da ${skill} fala do pode ir`)
    assert.match(trecho, /_contexto\/autonomia\.md`?, em que o script roda sem o\s+`--autorizado`/, `${skill}: o pode ir sem a permissao`)
  }
})
