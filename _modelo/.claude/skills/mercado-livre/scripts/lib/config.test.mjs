// Testes da configuracao do aluno (bloco mercado-livre). Rodar: node --test config.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerConfiguracao, carregarConfiguracao, exigir, PADROES, VALORES } from './config.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const EXEMPLO = join(AQUI, '..', '..', 'referencias', 'configuracao-exemplo.md')

test('o modelo de configuracao que vem no kit se le inteiro e nao traz numero de dinheiro', () => {
  const c = lerConfiguracao(readFileSync(EXEMPLO, 'utf8'))
  assert.equal(c.erp, 'nenhum')
  assert.equal(c.limite_gasto_usd, 4)
  assert.equal(c.imposto_pct, undefined)
  assert.equal(c.margem_minima_rs, undefined)
  assert.deepEqual(c.fornecedores, [])
  assert.throws(() => exigir(c, ['imposto_pct']), /imposto_pct/)
})

test('sem o bloco, o erro diz onde esta o modelo', () => {
  assert.throws(() => lerConfiguracao('# nada aqui\n'), /configuracao-exemplo\.md/)
})

test('numero com virgula e com porcentagem entra como numero', () => {
  const c = lerConfiguracao('```mercado-livre\nimposto_pct: 6,5%\nmargem_minima_pct: 15 %\n```\n')
  assert.equal(c.imposto_pct, 6.5)
  assert.equal(c.margem_minima_pct, 15)
})

test('numero que nao e numero explica o campo', () => {
  assert.throws(() => lerConfiguracao('```mercado-livre\nimposto_pct: seis\n```\n'), /imposto_pct.*"seis"/)
})

test('campo vazio cai no padrao, e lista vira array', () => {
  const c = lerConfiguracao('```mercado-livre\nerp:\nfornecedores: a, b ,c\n```\n')
  assert.equal(c.erp, PADROES.erp)
  assert.deepEqual(c.fornecedores, ['a', 'b', 'c'])
  assert.equal(c.limite_gasto_usd, 4)
})

test('carregarConfiguracao sem arquivo manda rodar /mercado-livre', () => {
  assert.throws(() => carregarConfiguracao(join(tmpdir(), 'nao-existe-' + process.pid + '.md')), /mercado-livre/)
})

test('carregarConfiguracao le o arquivo do caminho dado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
  try {
    const caminho = join(dir, 'mercado-livre.md')
    writeFileSync(caminho, '```mercado-livre\nsku_prefixo: LOJA\n```\n')
    assert.equal(carregarConfiguracao(caminho).sku_prefixo, 'LOJA')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('exigir lista o que falta e devolve a configuracao quando esta tudo la', () => {
  const c = lerConfiguracao('```mercado-livre\nimposto_pct: 6\n```\n')
  assert.throws(() => exigir(c, ['imposto_pct', 'sku_prefixo', 'fornecedores']), /sku_prefixo, fornecedores/)
  assert.equal(exigir(c, ['imposto_pct']), c)
})

test('chave em maiuscula cai no campo certo', () => {
  const c = lerConfiguracao('```mercado-livre\nLoja_Oficial: sim\nIMPOSTO_PCT: 7\n```\n')
  assert.equal(c.loja_oficial, 'sim')
  assert.equal(c.imposto_pct, 7)
  assert.equal('Loja_Oficial' in c, false)
})

test('valor zero em campo numerico nao vira ausente', () => {
  const c = lerConfiguracao('```mercado-livre\nmargem_minima_rs: 0\n```\n')
  assert.equal(c.margem_minima_rs, 0)
  assert.equal(exigir(c, ['margem_minima_rs']), c)
})

test('sem o campo modelo, quem ja vende continua como estoque', () => {
  const c = lerConfiguracao('```mercado-livre\nerp: bling\n```\n')
  assert.equal(c.modelo, 'estoque')
  assert.equal(PADROES.modelo, 'estoque')
})

test('modelo dropshipping e estado entram', () => {
  const c = lerConfiguracao('```mercado-livre\nmodelo: dropshipping\nestado: SP\n```\n')
  assert.equal(c.modelo, 'dropshipping')
  assert.equal(c.estado, 'SP')
})

test('modelo com erro de digitacao da erro com os valores aceitos, nunca cai no padrao', () => {
  assert.throws(() => lerConfiguracao('```mercado-livre\nmodelo: drop\n```\n'), /dropshipping.*estoque/)
  assert.deepEqual(VALORES.modelo, ['dropshipping', 'estoque'])
})

test('os valores de modelo que a trilha manda gravar sao os que a configuracao aceita', () => {
  const trilha = join(AQUI, '..', '..', '..', 'comecar-a-vender', 'referencias', 'trilha-modelo.md')
  const linha = readFileSync(trilha, 'utf8').split('\n').find(l => l.startsWith('`modelo`:'))
  assert.ok(linha, 'a trilha-modelo.md nao documenta o campo modelo')
  const valores = linha.slice('`modelo`:'.length).split('(')[0].split(' ou ')
    .map(v => v.replace(/[.,`]/g, '').trim()).filter(Boolean)
  assert.ok(valores.length > 0, 'nao achei nenhum valor na linha do modelo')
  for (const v of valores) assert.ok(VALORES.modelo.includes(v), `a trilha cita "${v}", que a configuracao recusa`)
})

test('MEI com imposto 0 conta como preenchido', () => {
  const c = lerConfiguracao('```mercado-livre\nimposto_pct: 0\n```\n')
  assert.equal(c.imposto_pct, 0)
  assert.doesNotThrow(() => exigir(c, ['imposto_pct']))
})

test('bloco em CRLF le o modelo sem o CR grudado', () => {
  const c = lerConfiguracao('```mercado-livre\r\nmodelo: dropshipping\r\nestado: SP\r\n```\r\n')
  assert.equal(c.modelo, 'dropshipping')
  assert.equal(c.estado, 'SP')
})
