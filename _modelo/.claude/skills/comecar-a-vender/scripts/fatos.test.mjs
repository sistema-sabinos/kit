// Testes da leitura dos fatos datados. Rodar: node --test fatos.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerFatos, vencidos } from './fatos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'fatos.mjs')

const TABELA = [
  '# Fatos',
  '',
  '| id | fato | fonte | conferido_em |',
  '|---|---|---|---|',
  '| das-mei | DAS de comércio R$ 82,05/mês | https://exemplo.gov.br/das | 2026-09-29 |',
  '| tarifa | Clássico 10% a 14% | https://exemplo.com/tarifa | 2026-06-01 |',
  ''
].join('\n')

test('le a tabela e devolve os fatos com id, fato, fonte e data', () => {
  const { fatos, erros } = lerFatos(TABELA)
  assert.deepEqual(erros, [])
  assert.equal(fatos.length, 2)
  assert.deepEqual(fatos[0], { id: 'das-mei', fato: 'DAS de comércio R$ 82,05/mês', fonte: 'https://exemplo.gov.br/das', conferido_em: '2026-09-29' })
})

test('arquivo em CRLF le igual ao LF', () => {
  const crlf = TABELA.replace(/\n/g, '\r\n')
  assert.deepEqual(lerFatos(crlf), lerFatos(TABELA))
})

test('vencido e o que passou de 60 dias; o de hoje nao vence', () => {
  const { fatos } = lerFatos(TABELA)
  assert.deepEqual(vencidos(fatos, '2026-09-29').map(f => f.id), ['tarifa'])
  assert.deepEqual(vencidos(fatos, '2026-07-31').map(f => f.id), [])
  assert.deepEqual(vencidos(fatos, '2026-08-01').map(f => f.id), ['tarifa'])
})

test('data impossivel, data fora do formato e fonte sem https viram erro com o id', () => {
  const ruim = TABELA
    .replace('2026-09-29 |', '2026-02-30 |')
    .replace('2026-06-01 |', '01/06/2026 |')
    + '| sem-fonte | algo | contadora | 2026-09-01 |\n'
  const { fatos, erros } = lerFatos(ruim)
  assert.ok(erros.length > 0, 'erros veio vazio')
  assert.equal(erros.length, 3)
  assert.match(erros.join('\n'), /das-mei/)
  assert.match(erros.join('\n'), /tarifa/)
  assert.match(erros.join('\n'), /sem-fonte/)
  assert.equal(fatos.length, 0)
})

test('texto sem a tabela vira erro, nunca lista vazia calada', () => {
  const { fatos, erros } = lerFatos('# nada\n')
  assert.equal(fatos.length, 0)
  assert.match(erros.join('\n'), /conferido_em/)
})

test('a CLI lista o vencido e sai 0; com erro sai 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fatos-'))
  try {
    const bom = join(dir, 'bom.md')
    writeFileSync(bom, TABELA)
    const r = spawnSync(process.execPath, [SCRIPT, 'vencidos', '--hoje', '2026-09-29', '--arquivo', bom], { encoding: 'utf8' })
    assert.equal(r.status, 0)
    assert.ok(r.stdout.trim().length > 0, 'saida vazia')
    assert.match(r.stdout, /tarifa: Clássico 10% a 14% \(conferido em 2026-06-01\)/)
    assert.doesNotMatch(r.stdout, /das-mei/)
    const ruim = join(dir, 'ruim.md')
    writeFileSync(ruim, TABELA.replace('2026-06-01 |', 'ontem |'))
    const r2 = spawnSync(process.execPath, [SCRIPT, 'vencidos', '--hoje', '2026-09-29', '--arquivo', ruim], { encoding: 'utf8' })
    assert.equal(r2.status, 1)
    assert.match(r2.stdout + r2.stderr, /tarifa/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('o fatos.md que vai no kit le sem erro e tem os ids que a trilha usa', () => {
  const texto = readFileSync(join(AQUI, '..', 'referencias', 'fatos.md'), 'utf8')
  const { fatos, erros } = lerFatos(texto)
  assert.deepEqual(erros, [])
  assert.ok(fatos.length >= 20, `so ${fatos.length} fatos`)
  const ids = new Set(fatos.map(f => f.id))
  assert.equal(ids.size, fatos.length, 'id repetido')
})

test('todo id de fato que a SKILL.md cita existe no fatos.md', () => {
  const { fatos } = lerFatos(readFileSync(join(AQUI, '..', 'referencias', 'fatos.md'), 'utf8'))
  const ids = new Set(fatos.map(f => f.id))
  const skill = readFileSync(join(AQUI, '..', 'SKILL.md'), 'utf8')
  const citados = [...skill.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)].map(m => m[1])
    .filter(c => !c.startsWith('comecar-') && !c.startsWith('mercado-') && !c.startsWith('pode-') && !c.startsWith('pesquisar-') && !c.startsWith('publicar-') && !c.startsWith('montar-') && !c.startsWith('abrir-') && !c.startsWith('trilha-') && !c.startsWith('fornecedor-'))
  assert.ok(citados.length >= 10, `so achei ${citados.length} ids citados, o filtro esta errado`)
  const faltam = citados.filter(c => !ids.has(c))
  assert.deepEqual(faltam, [])
})
