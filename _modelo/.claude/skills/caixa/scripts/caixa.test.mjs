// Testes do caixa. Rodar: node --test caixa.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerCsv, montarCsv } from './lib/csv.mjs'
import { centavos, reais, paraCsv, valoresEmReais } from './lib/dinheiro.mjs'
import { executar, carregar, emAberto, devendo, resumoPeriodo, arquivos } from './caixa.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'caixa.mjs')

function comRaiz(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'caixa-'))
  try { return fn(raiz) } finally { rmSync(raiz, { recursive: true, force: true }) }
}

function rodar(raiz, ...args) {
  const saida = []
  executar([...args, '--raiz', raiz], l => saida.push(l))
  return saida.join('\n')
}

function idDe(saida) {
  const m = /pedido (\S+) anotado/.exec(saida)
  assert.ok(m, `sem id na saida: ${saida}`)
  return m[1]
}

test('dinheiro: formatos brasileiros viram centavos certos', () => {
  assert.equal(centavos('R$ 1.234,56'), 123456)
  assert.equal(centavos('1234,5'), 123450)
  assert.equal(centavos('1234.56'), 123456)
  assert.equal(centavos('1.500'), 150000)
  assert.equal(centavos('81 mil'), 8100000)
  assert.equal(centavos('180'), 18000)
  assert.equal(centavos('abc'), null)
  assert.equal(centavos(''), null)
  assert.equal(reais(8100000), 'R$ 81.000,00')
  assert.equal(reais(8205), 'R$ 82,05')
  assert.equal(paraCsv(123405), '1234,05')
})

test('dinheiro: acha todo valor em reais num texto, inclusive "R$ 81 mil"', () => {
  assert.deepEqual(valoresEmReais('Teto R$ 81 mil; R$ 6.750 por mês; até R$ 97.200'), [8100000, 675000, 9720000])
  assert.deepEqual(valoresEmReais('bolo R$180 e sinal R$ 90,00'), [18000, 9000])
  assert.deepEqual(valoresEmReais('sem valor nenhum'), [])
})

test('csv: nome com ponto e virgula, aspas e acento volta igual depois de gravar e ler', () => {
  const linhas = [{ cliente: 'Ana; "Bia" e Cia', item: 'bolo de maçã' }]
  const texto = montarCsv(['cliente', 'item'], linhas)
  assert.equal(texto.charCodeAt(0), 0xfeff, 'sem BOM o Excel quebra o acento')
  assert.ok(texto.includes('\r\n'))
  assert.deepEqual(lerCsv(texto).linhas, linhas)
  // ponto e virgula sozinho, sem aspas junto, tambem tem que ir entre aspas
  const so = [{ cliente: 'Ana; Bia', item: 'bolo' }]
  assert.deepEqual(lerCsv(montarCsv(['cliente', 'item'], so)).linhas, so)
})

test('csv: le arquivo salvo com virgula e LF (Google Planilhas)', () => {
  const r = lerCsv('Produto,Preco\nbolo,"120,00"\n')
  assert.deepEqual(r.colunas, ['produto', 'preco'])
  assert.deepEqual(r.linhas, [{ produto: 'bolo', preco: '120,00' }])
})

test('pedido com sinal: anota o pedido e o pagamento, e o aberto mostra o que falta', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'Marina, do prédio', '--item', 'bolo 2 kg', '--valor', '180', '--sinal', '90', '--entrega', '2026-10-10', '--hoje', '2026-10-06'))
  const d = carregar(raiz)
  assert.equal(d.pedidos.length, 1)
  assert.equal(d.pedidos[0].cliente, 'Marina, do prédio')
  assert.equal(d.pagamentos.length, 1)
  assert.equal(d.pagamentos[0].pedido, id)
  const saida = rodar(raiz, 'aberto', '--hoje', '2026-10-06')
  assert.ok(saida.includes('falta R$ 90,00 de R$ 180,00'), saida)
  assert.ok(saida.includes('entrega em 4 dia(s)'), saida)
}))

test('pagamento maior que o saldo e recusado e nada e gravado', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'Rui', '--item', 'torta', '--valor', '100', '--entrega', '2026-10-06', '--hoje', '2026-10-01'))
  rodar(raiz, 'pago', id, '--valor', '60', '--hoje', '2026-10-02')
  assert.throws(() => rodar(raiz, 'pago', id, '--valor', '41', '--hoje', '2026-10-03'), /maior que o que falta \(R\$ 40,00\)/)
  assert.equal(carregar(raiz).pagamentos.length, 1)
  assert.match(rodar(raiz, 'pago', id, '--valor', '40', '--hoje', '2026-10-03'), /pedido quitado/)
  assert.equal(rodar(raiz, 'aberto', '--hoje', '2026-10-20'), 'nenhum pedido com saldo em aberto')
}))

test('sinal com --data-sinal: o pagamento do sinal leva o dia em que caiu (5.7, H.3)', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'Marina', '--item', 'bolo', '--valor', '170', '--sinal', '85', '--data-sinal', '2026-10-07', '--entrega', '2026-10-10', '--hoje', '2026-10-06', '--data', '2026-10-06'))
  const d = carregar(raiz)
  assert.equal(d.pedidos[0].data, '2026-10-06', 'canario: o pedido fica no dia do pedido')
  assert.deepEqual(d.pagamentos.map(p => [p.pedido, p.data, p.valor]), [[id, '2026-10-07', '85,00']])
  // sem --data-sinal e pedido de hoje, o sinal fica em hoje
  rodar(raiz, 'pedido', '--cliente', 'Rui', '--item', 'torta', '--valor', '100', '--sinal', '40', '--entrega', '2026-10-10', '--hoje', '2026-10-06')
  assert.equal(carregar(raiz).pagamentos[1].data, '2026-10-06')
}))

test('revisao final 5.7: pedido retroativo sem --data-sinal lanca o sinal em hoje, nao no dia do pedido', () => comRaiz(raiz => {
  rodar(raiz, 'pedido', '--cliente', 'Lia', '--item', 'bolo', '--valor', '170', '--sinal', '85', '--entrega', '2026-10-10', '--data', '2026-09-30', '--hoje', '2026-10-08')
  const d = carregar(raiz)
  assert.equal(d.pedidos[0].data, '2026-09-30', 'canario: o pedido fica no dia dele')
  assert.equal(d.pagamentos[0].data, '2026-10-08')
}))

test('--data-sinal invalida ou sem --sinal e recusada antes de gravar qualquer arquivo (5.7, H.3)', () => comRaiz(raiz => {
  rodar(raiz, 'pedido', '--cliente', 'Ana', '--item', 'bolo', '--valor', '100', '--sinal', '50', '--entrega', '2026-10-10', '--hoje', '2026-10-06')
  const a = arquivos(raiz)
  const antes = [readFileSync(a.pedidos, 'utf8'), readFileSync(a.pagamentos, 'utf8')]
  assert.ok(antes[0].includes('Ana') && antes[1].includes('50,00'), 'canario: os dois arquivos existem com o pedido da Ana')
  assert.throws(() => rodar(raiz, 'pedido', '--cliente', 'Bia', '--item', 'torta', '--valor', '80', '--sinal', '40', '--data-sinal', '2026-02-30', '--entrega', '2026-10-10', '--hoje', '2026-10-06'), /data-sinal/)
  assert.throws(() => rodar(raiz, 'pedido', '--cliente', 'Bia', '--item', 'torta', '--valor', '80', '--data-sinal', '2026-10-07', '--entrega', '2026-10-10', '--hoje', '2026-10-06'), /--data-sinal sem --sinal/)
  assert.deepEqual([readFileSync(a.pedidos, 'utf8'), readFileSync(a.pagamentos, 'utf8')], antes)
}))

test('sinal maior que o pedido e valor ilegivel sao recusados', () => comRaiz(raiz => {
  assert.throws(() => rodar(raiz, 'pedido', '--cliente', 'X', '--item', 'Y', '--valor', '50', '--sinal', '60', '--entrega', '2026-10-06'), /sinal/)
  assert.throws(() => rodar(raiz, 'pedido', '--cliente', 'X', '--item', 'Y', '--valor', 'cem', '--entrega', '2026-10-06'), /valor/)
  assert.throws(() => rodar(raiz, 'pedido', '--cliente', 'X', '--item', 'Y', '--valor', '50', '--entrega', '2026-02-30'), /entrega/)
}))

test('devendo: so entra pedido entregue ha mais de 7 dias com saldo, do mais antigo pro mais novo', () => comRaiz(raiz => {
  const a = idDe(rodar(raiz, 'pedido', '--cliente', 'Antiga', '--item', 'bolo', '--valor', '100', '--entrega', '2026-09-01', '--hoje', '2026-08-30'))
  idDe(rodar(raiz, 'pedido', '--cliente', 'Recente', '--item', 'bolo', '--valor', '100', '--entrega', '2026-10-01', '--hoje', '2026-09-30'))
  const c = idDe(rodar(raiz, 'pedido', '--cliente', 'Media', '--item', 'bolo', '--valor', '100', '--entrega', '2026-09-20', '--hoje', '2026-09-19'))
  const q = idDe(rodar(raiz, 'pedido', '--cliente', 'Quitada', '--item', 'bolo', '--valor', '100', '--sinal', '100', '--entrega', '2026-09-01', '--hoje', '2026-08-30'))
  const d = devendo(carregar(raiz), '2026-10-06')
  assert.deepEqual(d.map(p => p.id), [a, c])
  assert.ok(!d.some(p => p.id === q))
  const alerta = rodar(raiz, 'alertas', '--hoje', '2026-10-06')
  assert.match(alerta, /^2 pedido\(s\).*total R\$ 200,00; o mais antigo: Antiga, R\$ 100,00, ha 35 dias$/)
}))

test('alertas fica calado quando ninguem deve (canario: com devedor ele fala)', () => comRaiz(raiz => {
  assert.equal(rodar(raiz, 'alertas', '--hoje', '2026-10-06'), '')
  rodar(raiz, 'pedido', '--cliente', 'Z', '--item', 'bolo', '--valor', '10', '--entrega', '2026-09-01', '--hoje', '2026-09-01')
  assert.notEqual(rodar(raiz, 'alertas', '--hoje', '2026-10-06'), '')
}))

test('cancelado sai do aberto e do vendido, e avisa quando ja tinha pagamento', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'C', '--item', 'bolo', '--valor', '100', '--sinal', '30', '--entrega', '2026-10-10', '--hoje', '2026-10-01'))
  assert.match(rodar(raiz, 'cancelar', id), /ja tinha R\$ 30,00 pago/)
  assert.deepEqual(emAberto(carregar(raiz), '2026-10-20'), [])
  assert.equal(resumoPeriodo(carregar(raiz), '2026-10').vendido, 0)
  assert.throws(() => rodar(raiz, 'pago', id, '--valor', '10'), /cancelado/)
}))

test('mes: vendido pelo dia do pedido, recebido pelo dia do pagamento, e conta os pix', () => comRaiz(raiz => {
  const a = idDe(rodar(raiz, 'pedido', '--cliente', 'A', '--item', 'bolo', '--valor', '200', '--sinal', '100', '--entrega', '2026-10-02', '--hoje', '2026-09-28'))
  rodar(raiz, 'pago', a, '--valor', '100', '--forma', 'dinheiro', '--hoje', '2026-10-02')
  rodar(raiz, 'pedido', '--cliente', 'B', '--item', 'torta', '--valor', '50', '--sinal', '25', '--entrega', '2026-10-09', '--hoje', '2026-10-05')
  const set = resumoPeriodo(carregar(raiz), '2026-09')
  assert.deepEqual([set.vendido, set.recebido, set.aReceber], [20000, 10000, 0])
  const out = resumoPeriodo(carregar(raiz), '2026-10')
  assert.deepEqual([out.pedidos, out.vendido, out.recebido, out.aReceber, out.pix], [1, 5000, 12500, 2500, 1])
  assert.deepEqual(out.porForma, { dinheiro: 10000, pix: 2500 })
  const saida = rodar(raiz, 'mes', '2026-10')
  assert.ok(saida.includes('vendido R$ 50,00, recebido R$ 125,00'), saida)
  assert.ok(saida.includes('pix recebidos no mes: 1'), saida)
  assert.throws(() => rodar(raiz, 'mes', '2026-1'), /AAAA-MM/)
}))

test('cobrado: anota a cobranca e o aberto mostra quantas vezes', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'D', '--item', 'bolo', '--valor', '80', '--entrega', '2026-09-01', '--hoje', '2026-09-01'))
  rodar(raiz, 'cobrado', id, '--data', '2026-09-15')
  rodar(raiz, 'cobrado', id, '--data', '2026-09-25')
  assert.ok(rodar(raiz, 'aberto', '--hoje', '2026-10-06').includes('cobrado 2x'))
  assert.throws(() => rodar(raiz, 'cobrado', 'nao-existe'), /nao achei o pedido/)
}))

test('planilha editada a mao com valor "R$ 1.200,00" e lida; coluna faltando para com recado', () => comRaiz(raiz => {
  const a = arquivos(raiz)
  mkdirSync(dirname(a.pedidos), { recursive: true })
  writeFileSync(a.pedidos, 'id;data;cliente;item;valor;entrega;situacao\r\nx1;2026-10-01;Eva;casamento;R$ 1.200,00;2026-10-01;ativo\r\n')
  assert.equal(emAberto(carregar(raiz), '2026-10-20')[0].falta, 120000)
  writeFileSync(a.pedidos, 'id;data;cliente;valor\r\nx1;2026-10-01;Eva;10\r\n')
  assert.throws(() => carregar(raiz), /faltam as colunas item, entrega, situacao/)
}))

test('fatos: os do kit valem hoje e vencem depois de 60 dias (canario: com a data de hoje fica calado)', () => comRaiz(raiz => {
  assert.equal(rodar(raiz, 'fatos', '--hoje', '2026-10-06'), 'nenhum fato vencido')
  const velho = rodar(raiz, 'fatos', '--hoje', '2026-12-31')
  assert.match(velho, /^pix-pf-31: /)
  assert.match(velho, /mei-teto: /)
}))

test('planilha regravada pelo Excel com data dd/mm/aaaa continua contando no mes e no "quem deve" (achado da revisao)', () => comRaiz(raiz => {
  const a = arquivos(raiz)
  mkdirSync(dirname(a.pedidos), { recursive: true })
  writeFileSync(a.pedidos, 'id;data;cliente;item;valor;entrega;situacao\r\nx1;18/09/2026;Ana;bolo;150;20/9/2026;ativo\r\n')
  assert.equal(devendo(carregar(raiz), '2026-10-06')[0].dias, 16)
  assert.equal(resumoPeriodo(carregar(raiz), '2026-09').vendido, 15000)
  writeFileSync(a.pedidos, 'id;data;cliente;item;valor;entrega;situacao\r\nx1;ontem;Ana;bolo;150;2026-09-20;ativo\r\n')
  assert.throws(() => carregar(raiz), /data "ontem" ilegivel no caixa \(x1\)/)
}))

test('arquivo salvo sem UTF-8 (acento estragado) para com recado em vez de regravar o lixo', () => comRaiz(raiz => {
  const a = arquivos(raiz)
  mkdirSync(dirname(a.pedidos), { recursive: true })
  // "Ána" em latin1: o byte C1 sozinho nao e UTF-8 valido
  writeFileSync(a.pedidos, Buffer.concat([Buffer.from('id;data;cliente;item;valor;entrega;situacao\r\nx1;2026-09-18;'), Buffer.from([0xc1]), Buffer.from('na;bolo;150;2026-09-20;ativo\r\n')]))
  assert.throws(() => carregar(raiz), /CSV UTF-8/)
  assert.throws(() => rodar(raiz, 'pedido', '--cliente', 'B', '--item', 'b', '--valor', '10', '--entrega', '2026-10-10'), /CSV UTF-8/)
}))

test('devolvido: sai do recebido do mes e nao passa do que foi pago (achado da revisao)', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'C', '--item', 'bolo', '--valor', '150', '--sinal', '150', '--entrega', '2026-10-10', '--hoje', '2026-10-01'))
  assert.match(rodar(raiz, 'cancelar', id), /devolvido .* --valor/)
  assert.throws(() => rodar(raiz, 'devolvido', id, '--valor', '151', '--hoje', '2026-10-02'), /maior que o que foi pago \(R\$ 150,00\)/)
  rodar(raiz, 'devolvido', id, '--valor', '150', '--hoje', '2026-10-02')
  const r = resumoPeriodo(carregar(raiz), '2026-10')
  assert.deepEqual([r.pedidos, r.recebido], [0, 0])
  assert.equal(resumoPeriodo(carregar(raiz), '2026').recebido, 0)
}))

test('devolucao em pedido ativo e quitado nao reabre divida nem vira cobranca (achado da segunda revisao)', () => comRaiz(raiz => {
  const id = idDe(rodar(raiz, 'pedido', '--cliente', 'Zé', '--item', 'bolo', '--valor', '170', '--sinal', '170', '--entrega', '2026-09-20', '--hoje', '2026-09-18'))
  rodar(raiz, 'devolvido', id, '--valor', '20', '--hoje', '2026-09-21')
  assert.equal(rodar(raiz, 'aberto', '--hoje', '2026-10-06'), 'nenhum pedido com saldo em aberto')
  assert.equal(rodar(raiz, 'alertas', '--hoje', '2026-10-06'), '')
  assert.equal(resumoPeriodo(carregar(raiz), '2026-09').recebido, 15000)
  // devolucoes somadas nao passam do que entrou
  rodar(raiz, 'devolvido', id, '--valor', '150', '--hoje', '2026-09-22')
  assert.throws(() => rodar(raiz, 'devolvido', id, '--valor', '1', '--hoje', '2026-09-23'), /maior que o que foi pago \(R\$ 0,00\)/)
}))

test('como o aluno roda: de dentro do projeto, sem --raiz, grava em dados/caixa/', () => {
  const proj = mkdtempSync(join(tmpdir(), 'proj-'))
  try {
    cpSync(join(AQUI, '..'), join(proj, '.claude', 'skills', 'caixa'), { recursive: true })
    const s = '.claude/skills/caixa/scripts/caixa.mjs'
    const p = spawnSync(process.execPath, [s, 'pedido', '--cliente', 'Marina', '--item', 'bolo', '--valor', '170', '--sinal', '85', '--entrega', '2026-10-10'], { cwd: proj, encoding: 'utf8' })
    assert.equal(p.status, 0, p.stderr)
    assert.ok(existsSync(join(proj, 'dados', 'caixa', 'pedidos.csv')))
    const a = spawnSync(process.execPath, [s, 'aberto'], { cwd: proj, encoding: 'utf8' })
    assert.match(a.stdout, /Marina \| bolo \| falta R\$ 85,00/)
  } finally {
    rmSync(proj, { recursive: true, force: true })
  }
})

test('linha de comando: erro sai com codigo 1 e recado, sem pilha', () => comRaiz(raiz => {
  const r = spawnSync(process.execPath, [SCRIPT, 'pago', 'nada', '--valor', '10', '--raiz', raiz], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /nao achei o pedido "nada"/)
  assert.ok(!/at .*caixa\.mjs/.test(r.stderr))
  const ok = spawnSync(process.execPath, [SCRIPT, 'aberto', '--raiz', raiz], { encoding: 'utf8' })
  assert.equal(ok.status, 0)
  assert.equal(ok.stdout.trim(), 'nenhum pedido com saldo em aberto')
}))
