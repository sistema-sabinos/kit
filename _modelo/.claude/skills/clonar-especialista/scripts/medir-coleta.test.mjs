// Testes do medir-coleta.mjs: criterio de "completo" da coleta lido do inventario.md.
// Rodar: node --test medir-coleta.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { medirColeta, lerInventario } from './medir-coleta.mjs'

const CRLF = String.fromCharCode(13, 10)
const CAB = ['pessoa: Fulano', '', '| N | camada | tipo | idioma | ano | fonte | etiqueta | status | itens | novos |', '|---|---|---|---|---|---|---|---|---|---|']
const linha = (n, camada, etiqueta, status, novos) => `| ${n} | ${camada} | x | en | 2020 | fonte ${n} | ${etiqueta} | ${status} | 10 | ${novos} |`
// 8 feitas (4 de base com muito item novo, 4 depois quase sem novidade), 1 de prova.
// A 8 (camada e) fica fora da saturacao: das camadas a a d sao 7
const COMPLETA = [
  linha(1, 'a', 'artifact', 'feita', 40), linha(2, 'a', 'artifact', 'feita', 30), linha(3, 'b', 'verbatim', 'feita', 20),
  linha(4, 'b', 'verbatim', 'feita', 10), linha(5, 'c', 'verbatim', 'feita', 3), linha(6, 'd', 'impression', 'feita', 1),
  linha(7, 'c', 'verbatim', 'feita', 0), linha(8, 'e', 'impression', 'feita', 0), linha(9, 'b', 'verbatim', 'prova', 0),
]

function pasta(linhas, cabeca = []) {
  const dir = mkdtempSync(join(tmpdir(), 'medir-coleta-'))
  writeFileSync(join(dir, 'inventario.md'), [...cabeca, ...CAB, ...linhas].join(CRLF))
  return dir
}

test('coleta completa sai 0 com as 5 condicoes ok', () => {
  const dir = pasta(COMPLETA)
  try {
    const r = medirColeta(dir)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    assert.equal(r.linhas.filter(l => l.startsWith('ok ')).length, 5)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('janela final com novidade acima de 5% reprova a saturacao', () => {
  const dir = pasta(COMPLETA.map(l => l.replace('| 7 | c | x | en | 2020 | fonte 7 | verbatim | feita | 10 | 0 |', '| 7 | c | x | en | 2020 | fonte 7 | verbatim | feita | 10 | 9 |')))
  try {
    const r = medirColeta(dir)
    assert.equal(r.codigo, 1)
    assert.ok(r.linhas.some(l => /^falta saturacao/.test(l)), r.linhas.join(' | '))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('menos de 7 feitas, pouca fonte primaria, 1 fala espontanea, livro pendente e sem prova: cada um acusa', () => {
  const dir = pasta([linha(1, 'a', 'impression', 'feita', 5), linha(2, 'b', 'verbatim', 'feita', 5), linha(3, 'e', 'impression', 'feita', 5), linha(4, 'a', 'artifact', 'pendente', 0)])
  try {
    const r = medirColeta(dir)
    assert.equal(r.codigo, 1)
    for (const re of [/^falta saturacao/, /^falta fonte primaria/, /^falta fala espontanea/, /^falta obra propria/, /^falta prova/]) {
      assert.ok(r.linhas.some(l => re.test(l)), `faltou ${re}: ${r.linhas.join(' | ')}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('linha torta e maiuscula: le o que da e acusa a torta', () => {
  const r = lerInventario([...CAB, '|  1 | A | livro | en | 1990 | x | Artifact | Feita | 10 | 10 |', '| 2 | b | so tres colunas |'].join(CRLF))
  assert.equal(r.linhas.length, 1)
  assert.equal(r.linhas[0].status, 'feita')
  assert.equal(r.linhas[0].camada, 'a')
  assert.deepEqual(r.tortas, [2])
})

test('duas provas em dez fontes (20%) passam do teto de 15%', () => {
  const dir = pasta([...COMPLETA, linha(10, 'c', 'verbatim', 'prova', 0)])
  try {
    const r = medirColeta(dir)
    assert.equal(r.codigo, 1)
    assert.ok(r.linhas.some(l => /^falta prova: 2 separadas de 10 fontes \(exatamente 1\)/.test(l)), r.linhas.join(' | '))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('uma prova em 14 fontes (7%) fica abaixo de 10% e reprova', () => {
  const extras = [10, 11, 12, 13, 14].map(n => linha(n, 'c', 'verbatim', 'feita', 0))
  const dir = pasta([...COMPLETA, ...extras])
  try {
    const r = medirColeta(dir)
    assert.equal(r.codigo, 1, r.linhas.join(' | '))
    assert.ok(r.linhas.some(l => /^falta prova: 1 separadas de 14 fontes \(exatamente 2\)/.test(l)), r.linhas.join(' | '))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('N repetido e contagem que nao e inteiro de 0 pra cima viram linha torta', () => {
  const r = lerInventario([...CAB, linha(1, 'a', 'artifact', 'feita', 5), linha(1, 'a', 'artifact', 'feita', 5),
    '| 3 | a | x | en | 2020 | f | artifact | feita | xyz | 1 |', '| 4 | a | x | en | 2020 | f | artifact | feita | 10 | -1 |',
    '| 5 | z | x | en | 2020 | f | artifact | feita | 10 | 1 |'].join(CRLF))
  assert.ok(r.tortas.length > 0, 'saida veio vazia')
  assert.deepEqual(r.linhas.map(l => l.n), [1])
  assert.deepEqual(r.tortas, [1, 3, 4, 5])
})

test('coleta incompleta aceita pelo aluno passa; prova fora da faixa nunca', () => {
  const umaFala = COMPLETA.map(l => l.replace('| 4 | b |', '| 4 | c |'))
  const sem = pasta(umaFala)
  const com = pasta(umaFala, ['coleta-aceita: 2026-10-12, so existe 1 entrevista longa'])
  const comProvaDemais = pasta([...umaFala, linha(10, 'c', 'verbatim', 'prova', 0)], ['coleta-aceita: 2026-10-12, so existe 1 entrevista longa'])
  try {
    assert.equal(medirColeta(sem).codigo, 1)
    const r = medirColeta(com)
    assert.equal(r.codigo, 0, r.linhas.join(' | '))
    assert.ok(r.linhas.some(l => /^falta fala espontanea/.test(l)))
    assert.ok(r.linhas.some(l => /^AVISO: coleta incompleta aceita pelo aluno: 2026-10-12/.test(l)))
    assert.equal(medirColeta(comProvaDemais).codigo, 1)
  } finally {
    for (const d of [sem, com, comProvaDemais]) rmSync(d, { recursive: true, force: true })
  }
})

test('prova da camada e sai 1 com falta prova primaria, mesmo com coleta aceita', () => {
  const comCamada = c => COMPLETA.map(l => l.replace('| 9 | b |', `| 9 | ${c} |`))
  const LINHA = /^falta prova primaria: fonte 9/
  const c = pasta(comCamada('c'))
  const e = pasta(comCamada('e'))
  const eAceita = pasta(comCamada('e'), ['coleta-aceita: 2026-10-12, so existe 1 entrevista longa'])
  try {
    assert.ok(comCamada('e').join(CRLF).includes('| 9 | e |'), 'canario: a prova virou camada e')
    const rc = medirColeta(c)
    assert.equal(rc.codigo, 0, `canario: prova da camada c passa: ${rc.linhas.join(' | ')}`)
    assert.ok(!rc.linhas.some(l => LINHA.test(l)), rc.linhas.join(' | '))
    for (const d of [e, eAceita]) {
      const r = medirColeta(d)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, 1, r.linhas.join(' | '))
      assert.ok(r.linhas.some(l => LINHA.test(l)), r.linhas.join(' | '))
    }
  } finally {
    for (const d of [c, e, eAceita]) rmSync(d, { recursive: true, force: true })
  }
})

test('coleta-aceita abaixo da tabela nao vale', () => {
  const umaFala = COMPLETA.map(l => l.replace('| 4 | b |', '| 4 | c |'))
  const ACEITE = 'coleta-aceita: 2026-10-12, so existe 1 entrevista longa'
  const noCabecalho = pasta(umaFala, [ACEITE])
  const abaixo = pasta([...umaFala, '', ACEITE])
  try {
    assert.equal(medirColeta(noCabecalho).codigo, 0, 'canario: o aceite no cabecalho vale')
    const r = medirColeta(abaixo)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 1, r.linhas.join(' | '))
    assert.ok(!r.linhas.some(l => l.startsWith('AVISO: coleta incompleta aceita')), r.linhas.join(' | '))
  } finally {
    for (const d of [noCabecalho, abaixo]) rmSync(d, { recursive: true, force: true })
  }
})

test('sem linha fases no cabecalho avisa, sem mudar o codigo de saida', () => {
  const AVISO = 'AVISO: fases da carreira sem conferencia registrada (linha fases: no cabecalho do inventario)'
  const sem = pasta(COMPLETA)
  const com = pasta(COMPLETA, ['fases: 2026-10-12, comeco, auge e fase atual'])
  try {
    const r = medirColeta(sem)
    assert.equal(r.codigo, 0, r.linhas.join(' | '))
    assert.ok(r.linhas.includes(AVISO), r.linhas.join(' | '))
    const rc = medirColeta(com)
    assert.equal(rc.codigo, 0, rc.linhas.join(' | '))
    assert.ok(!rc.linhas.includes(AVISO), 'avisou com a linha fases no cabecalho')
  } finally {
    for (const d of [sem, com]) rmSync(d, { recursive: true, force: true })
  }
})

test('nenhuma obra propria lida (camada a): avisa pros Limites sem mudar o codigo de saida', () => {
  const AVISO = 'AVISO: nenhuma obra propria lida (camada a): diga isso nos Limites da persona'
  // livros 1 e 2 viram fala (camada b): o resto da coleta continua ok; o livro sem amostra entra como fora
  const semObra = [...COMPLETA.map(l => l.replace(/^\| ([12]) \| a \|/, '| $1 | b |')), '| 10 | a | livro | en | 2016 | livro sem amostra legitima | artifact | fora | 0 | 0 |']
  const com = pasta(COMPLETA)
  const sem = pasta(semObra)
  try {
    assert.ok(!semObra.join(CRLF).includes('| a | x |'), 'canario: nenhuma linha a lida sobrou')
    const r = medirColeta(sem)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0, r.linhas.join(' | '))
    assert.ok(r.linhas.includes(AVISO), r.linhas.join(' | '))
    const rc = medirColeta(com)
    assert.equal(rc.codigo, 0)
    assert.ok(!rc.linhas.includes(AVISO), 'avisou com obra propria lida')
  } finally {
    for (const d of [com, sem]) rmSync(d, { recursive: true, force: true })
  }
})

test('ficha de fonte de prova reprova a prova intacta, mesmo com coleta aceita', () => {
  const limpa = pasta(COMPLETA)
  const vazada = pasta(COMPLETA)
  const aceita = pasta(COMPLETA, ['coleta-aceita: 2026-10-12, so existe 1 entrevista longa'])
  try {
    for (const d of [limpa, vazada, aceita]) { mkdirSync(join(d, 'fichas')); writeFileSync(join(d, 'fichas', '01-livro.md'), 'x') }
    for (const d of [vazada, aceita]) writeFileSync(join(d, 'fichas', '09-entrevista.md'), 'x')
    const rl = medirColeta(limpa)
    assert.equal(rl.codigo, 0, `canario: ficha de fonte feita nao acusa: ${rl.linhas.join(' | ')}`)
    for (const d of [vazada, aceita]) {
      const r = medirColeta(d)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, 1, r.linhas.join(' | '))
      assert.ok(r.linhas.includes('falta prova intacta: ficha de fonte de prova (fonte 9)'), r.linhas.join(' | '))
    }
  } finally {
    for (const d of [limpa, vazada, aceita]) rmSync(d, { recursive: true, force: true })
  }
})

test('camada e nao conta na saturacao', () => {
  // Ficha da camada e poe tudo em Fatos e criticas, que o contador nao conta: tres dela no fim
  // dariam janela de 0% falsa. Canario: o mesmo caso com 5 a 7 na camada c satura
  const fonte = (n, camada, etiqueta, status, itens, novos) => `| ${n} | ${camada} | x | en | 2020 | fonte ${n} | ${etiqueta} | ${status} | ${itens} | ${novos} |`
  const caso = c => [
    fonte(1, 'a', 'artifact', 'feita', 10, 10), fonte(2, 'a', 'artifact', 'feita', 10, 10),
    fonte(3, 'b', 'verbatim', 'feita', 10, 10), fonte(4, 'b', 'verbatim', 'feita', 10, 10),
    ...[5, 6, 7].map(n => fonte(n, c, 'impression', 'feita', 0, 0)), fonte(8, 'c', 'verbatim', 'prova', 0, 0),
  ]
  const fases = ['fases: 2026-10-14, comeco e auge']
  const e = pasta(caso('e'), fases)
  const c = pasta(caso('c'), fases)
  try {
    const rc = medirColeta(c)
    assert.ok(rc.linhas.length > 0, 'saida veio vazia')
    assert.ok(rc.linhas.some(l => /^ok saturacao/.test(l)), `canario: camada c nao saturou: ${rc.linhas.join(' | ')}`)
    const re = medirColeta(e)
    assert.ok(re.linhas.length > 0, 'saida veio vazia')
    assert.equal(re.codigo, 1, re.linhas.join(' | '))
    assert.ok(re.linhas.some(l => /^falta saturacao/.test(l)), re.linhas.join(' | '))
  } finally {
    for (const d of [e, c]) rmSync(d, { recursive: true, force: true })
  }
})

test('sem inventario ou sem tabela sai 1 com aviso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'medir-coleta-'))
  try {
    assert.match(medirColeta(dir).linhas[0], /sem inventario\.md/)
    writeFileSync(join(dir, 'inventario.md'), 'pessoa: x')
    assert.match(medirColeta(dir).linhas[0], /nenhuma fonte/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
