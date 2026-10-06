// Testes do calendario e do teto do MEI. Rodar: node --test mei.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { proximoDas, valorDas, proximaDeclaracao, limiteDoAno, situacaoTeto, executar } from './mei.mjs'
import { executar as caixa, carregar } from '../../caixa/scripts/caixa.mjs'
import { lerArquivoFatos } from '../../caixa/scripts/lib/fatos.mjs'
import { valoresEmReais } from '../../caixa/scripts/lib/dinheiro.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'mei.mjs')
const FATOS = join(AQUI, '..', 'referencias', 'fatos.md')
const fatos = lerArquivoFatos(FATOS)

function comRaiz(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'mei-'))
  try { return fn(raiz) } finally { rmSync(raiz, { recursive: true, force: true }) }
}

const rodar = (raiz, ...args) => {
  const out = []
  executar([...args, '--raiz', raiz], l => out.push(l))
  return out.join('\n')
}

// pedido ja quitado, pra o vendido e o recebido andarem juntos
function venda(raiz, valor, data) {
  caixa(['pedido', '--cliente', 'C', '--item', 'bolo', '--valor', valor, '--sinal', valor, '--entrega', data, '--data', data, '--raiz', raiz], () => {})
}

test('o fatos.md do MEI tem o que o script le, e os numeros batem entre si', () => {
  const [anual, mensal, excesso] = valoresEmReais(fatos.find(f => f.id === 'mei-teto').fato)
  assert.equal(anual, 8100000)
  assert.equal(mensal * 12, anual, 'o teto mensal vezes 12 tem que dar o anual')
  assert.equal(excesso, Math.round(anual * 1.2), 'o limite dos 20% tem que ser 1,2 vezes o teto')
  assert.equal(valorDas(fatos, 'comercio'), 8205)
  assert.equal(valorDas(fatos, 'servico'), 8605)
  assert.equal(valorDas(fatos, 'misto'), 8705)
})

test('DAS: dia 20; sabado e domingo vao pro dia util seguinte; passou do dia, e o do mes que vem', () => {
  assert.deepEqual(proximoDas('2026-10-06'), { data: '2026-10-20', movido: false })
  assert.deepEqual(proximoDas('2026-10-20'), { data: '2026-10-20', movido: false })
  assert.deepEqual(proximoDas('2026-10-21'), { data: '2026-11-20', movido: false })
  assert.deepEqual(proximoDas('2026-06-01'), { data: '2026-06-22', movido: true })
  assert.deepEqual(proximoDas('2026-09-21'), { data: '2026-09-21', movido: true })
  assert.deepEqual(proximoDas('2026-12-22'), { data: '2027-01-20', movido: false })
})

test('declaracao anual: 31 de maio sobre o ano anterior; quem abriu este ano so declara no ano que vem', () => {
  assert.deepEqual(proximaDeclaracao('2026-05-01', '2024-03-10'), { prazo: '2026-05-31', referente: 2025, dias: 30 })
  assert.deepEqual(proximaDeclaracao('2026-06-01', '2024-03-10'), { prazo: '2027-05-31', referente: 2026, dias: 364 })
  assert.equal(proximaDeclaracao('2026-05-01', '2026-02-01'), null)
  assert.equal(proximaDeclaracao('2026-10-06', '2026-02-01').referente, 2026)
})

test('teto proporcional: no ano da abertura conta o mes da abertura inteiro ate dezembro', () => {
  assert.deepEqual(limiteDoAno(fatos, '2026-09-15', 2026), { limite: 2700000, meses: 4 })
  assert.deepEqual(limiteDoAno(fatos, '2026-01-01', 2026), { limite: 8100000, meses: 12 })
  assert.deepEqual(limiteDoAno(fatos, '2020-05-01', 2026), { limite: 8100000, meses: 12 })
  assert.throws(() => limiteDoAno(fatos, '2027-01-01', 2026), /depois de 2026/)
})

test('faixas do teto: 81 mil cravado nao passou; um centavo acima passou; 97.200 e um centavo passou dos 20%', () => {
  const casos = [['56699,99', 'ok'], ['56700', '70'], ['72900', '90'], ['81000', '90'], ['81000,01', 'passou'], ['97200', 'passou'], ['97200,01', 'passou-20']]
  for (const [v, faixa] of casos) {
    comRaiz(r => {
      venda(r, v, '2026-03-10')
      const t = situacaoTeto(fatos, '2020-01-01', carregar(r), 2026)
      assert.equal(t.faixa, faixa, `${v} deu ${t.faixa}`)
    })
  }
})

test('teto conta pelo maior entre vendido e recebido', () => comRaiz(raiz => {
  // vendeu 80 mil em dezembro de 2025 e recebeu em janeiro: em 2026 o recebido manda
  caixa(['pedido', '--cliente', 'Festa', '--item', 'buffet', '--valor', '80000', '--entrega', '2025-12-20', '--data', '2025-12-01', '--raiz', raiz], () => {})
  const id = carregar(raiz).pedidos[0].id
  caixa(['pago', id, '--valor', '80000', '--data', '2026-01-05', '--raiz', raiz], () => {})
  const t26 = situacaoTeto(fatos, '2020-01-01', carregar(raiz), 2026)
  assert.deepEqual([t26.vendido, t26.recebido, t26.faturamento], [0, 8000000, 8000000])
  const t25 = situacaoTeto(fatos, '2020-01-01', carregar(raiz), 2025)
  assert.deepEqual([t25.vendido, t25.recebido, t25.faturamento], [8000000, 0, 8000000])
  assert.equal(t26.faixa, '90')
}))

test('no ano da abertura, venda de antes do CNPJ nao conta pro teto (achado da revisao)', () => comRaiz(raiz => {
  for (const m of ['03', '04', '05', '06', '07', '08', '09']) venda(raiz, '4000', `2026-${m}-10`)
  venda(raiz, '1000', '2026-10-05')
  const t = situacaoTeto(fatos, '2026-10-01', carregar(raiz), 2026)
  assert.deepEqual([t.limite, t.faturamento, t.faixa], [2025000, 100000, 'ok'])
  // canario: o ano todo, sem o recorte, passaria do teto
  assert.equal(situacaoTeto(fatos, '2020-01-01', carregar(raiz), 2026).faturamento, 2900000)
}))

test('fato mei-teto reescrito com o mensal antes do anual para a conta em vez de errar calado', () => {
  const trocado = fatos.map(f => f.id === 'mei-teto' ? { ...f, fato: 'média de R$ 6.750 por mês, R$ 81 mil por ano' } : f)
  assert.throws(() => limiteDoAno(trocado, '2020-01-01', 2026), /anual = mensal x 12/)
})

test('como o aluno roda: de dentro do projeto, sem --raiz, le dados/mei.json e o caixa', () => {
  const proj = mkdtempSync(join(tmpdir(), 'proj-'))
  try {
    for (const s of ['mei', 'caixa']) cpSync(join(AQUI, '..', '..', s), join(proj, '.claude', 'skills', s), { recursive: true })
    const m = '.claude/skills/mei/scripts/mei.mjs'
    const c = spawnSync(process.execPath, [m, 'configurar', '--abertura', '2025-03-02', '--tipo', 'comercio'], { cwd: proj, encoding: 'utf8' })
    assert.equal(c.status, 0, c.stderr)
    assert.ok(existsSync(join(proj, 'dados', 'mei.json')))
    const p = spawnSync(process.execPath, [m, 'proximos', '--hoje', '2026-10-06'], { cwd: proj, encoding: 'utf8' })
    assert.equal(p.status, 0, p.stderr)
    assert.match(p.stdout, /DAS de R\$ 82,05 vence em 14 dia/)
  } finally {
    rmSync(proj, { recursive: true, force: true })
  }
})

test('alertas: calado longe de tudo; fala do DAS a 5 dias, da declaracao a 30 e do teto a partir de 70%', () => comRaiz(raiz => {
  rodar(raiz, 'configurar', '--abertura', '2020-01-01', '--tipo', 'comercio')
  assert.equal(rodar(raiz, 'alertas', '--hoje', '2026-10-06'), '')
  assert.match(rodar(raiz, 'alertas', '--hoje', '2026-10-15'), /^DAS de R\$ 82,05 vence em 5 dia\(s\), 2026-10-20 \(terça\)/)
  assert.match(rodar(raiz, 'alertas', '--hoje', '2026-05-02'), /declaração anual de 2025 até 2026-05-31, faltam 29 dia/)
  venda(raiz, '60000', '2026-03-10')
  assert.match(rodar(raiz, 'alertas', '--hoje', '2026-10-06'), /teto 2026: R\$ 60\.000,00 de R\$ 81\.000,00, 74%\. Vale começar a conversa com o contador/)
}))

test('alertas avisa fato vencido (canario: com fatos de hoje fica calado)', () => comRaiz(raiz => {
  rodar(raiz, 'configurar', '--abertura', '2020-01-01', '--tipo', 'servico')
  assert.equal(rodar(raiz, 'alertas', '--hoje', '2026-10-06'), '')
  assert.match(rodar(raiz, 'alertas', '--hoje', '2027-01-06'), /fatos do MEI com mais de 60 dias/)
}))

test('proximos mostra DAS do tipo, declaracao e teto com as duas contas', () => comRaiz(raiz => {
  rodar(raiz, 'configurar', '--abertura', '2026-09-15', '--tipo', 'misto')
  const s = rodar(raiz, 'proximos', '--hoje', '2026-09-21')
  assert.match(s, /DAS de R\$ 87,05 vence hoje, 2026-09-21 \(segunda\), o dia 20 cai no fim de semana/)
  assert.match(s, /declaração anual de 2026: até 2027-05-31, faltam 252 dia/)
  assert.match(s, /teto 2026: R\$ 0,00 de R\$ 27\.000,00 \(proporcional a 4 meses\), 0%/)
  rodar(raiz, 'configurar', '--abertura', '2026-02-01', '--tipo', 'misto')
  assert.match(rodar(raiz, 'proximos', '--hoje', '2026-03-01'), /declaração anual: a primeira é em maio de 2027/)
}))

test('configurar recusa data e tipo errados; sem configurar, o recado diz o que fazer', () => comRaiz(raiz => {
  assert.throws(() => rodar(raiz, 'configurar', '--abertura', '2026-13-01', '--tipo', 'comercio'), /abertura/)
  assert.throws(() => rodar(raiz, 'configurar', '--abertura', '2026-01-01', '--tipo', 'industria'), /tipo "industria"/)
  const r = spawnSync(process.execPath, [SCRIPT, 'proximos', '--raiz', raiz], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /falta configurar/)
}))

test('fatos.md com linha quebrada para tudo, em vez de usar numero errado', () => comRaiz(raiz => {
  const ruim = join(raiz, 'fatos.md')
  writeFileSync(ruim, readFileSync(FATOS, 'utf8').replace('| 2026-10-06 |', '| ontem |'))
  assert.throws(() => rodar(raiz, 'vencidos', '--fatos', ruim), /linha com problema/)
}))
