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
  registrarCusto, mesDaLinha, emLocal, comTrava, SEM_ORCAMENTO, MINIMO_VIDEOS_HISTORICO,
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

test('emLocal: em Sao Paulo a hora e a local e o deslocamento e -03:00', () => {
  assert.equal(noFuso('America/Sao_Paulo', "console.log(JSON.stringify(o.emLocal(new Date('2026-11-01T02:30:00Z'))))"), '2026-10-31T23:30:00.000-03:00')
})
