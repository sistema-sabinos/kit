import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lerCsv, montarCsv, lerArquivoCsv, gravarArquivoCsv } from './csv.mjs'

const BOM = String.fromCharCode(0xfeff)

test('lerCsv le o CSV do Excel: ponto e virgula, BOM e CRLF', () => {
  const r = lerCsv(BOM + 'Funcao;Prioridade\r\nLogin;obrigatoria\r\nAgenda;importante\r\n')
  assert.deepEqual(r.colunas, ['funcao', 'prioridade'])
  assert.deepEqual(r.linhas, [{ funcao: 'Login', prioridade: 'obrigatoria' }, { funcao: 'Agenda', prioridade: 'importante' }])
})

test('lerCsv le virgula sem BOM e com LF, como sai do Google Planilhas', () => {
  const r = lerCsv('fonte,nota,texto\nml,2,veio quebrado\n')
  assert.deepEqual(r.linhas, [{ fonte: 'ml', nota: '2', texto: 'veio quebrado' }])
})

test('lerCsv respeita aspas com separador, aspas dobradas e quebra de linha dentro', () => {
  const r = lerCsv('texto;nota\n"caro; demais";1\n"ele disse ""nunca mais""";2\n"linha um\nlinha dois";3\n')
  assert.deepEqual(r.linhas.map(l => l.texto), ['caro; demais', 'ele disse "nunca mais"', 'linha um\nlinha dois'])
})

test('lerCsv vazio devolve nada', () => {
  assert.deepEqual(lerCsv(''), { colunas: [], linhas: [] })
})

test('montarCsv sai com BOM, ponto e virgula e CRLF, e volta igual pelo lerCsv', () => {
  const linhas = [{ a: 'x;y', b: 'com "aspas"' }, { a: 'preço', b: '' }]
  const t = montarCsv(['a', 'b'], linhas)
  assert.ok(t.startsWith(BOM))
  assert.ok(t.endsWith('\r\n'))
  assert.deepEqual(lerCsv(t).linhas, linhas)
})

test('lerArquivoCsv e gravarArquivoCsv: grava em pasta nova, le, cobra coluna e arquivo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csv-teste-'))
  try {
    const arq = join(dir, 'sub', 'f.csv')
    gravarArquivoCsv(arq, ['funcao', 'prioridade'], [{ funcao: 'Login', prioridade: 'obrigatoria' }])
    assert.ok(readFileSync(arq, 'utf8').startsWith(BOM))
    assert.equal(lerArquivoCsv(arq, ['funcao']).linhas[0].funcao, 'Login')
    assert.equal(lerArquivoCsv(arq).linhas.length, 1)
    assert.throws(() => lerArquivoCsv(arq, ['funcao', 'notas']), /faltam as colunas notas/)
    assert.throws(() => lerArquivoCsv(join(dir, 'nao-existe.csv'), ['funcao']), /nao achei o arquivo/)
    const ruim = join(dir, 'ruim.csv')
    writeFileSync(ruim, 'texto\npre' + String.fromCharCode(0xfffd) + 'o\n')
    assert.throws(() => lerArquivoCsv(ruim, ['texto']), /CSV UTF-8/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
