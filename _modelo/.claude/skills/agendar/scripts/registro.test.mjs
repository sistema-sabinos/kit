// Testes do livro de rodadas e da trava. Rodar: node --test registro.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RAIZ } from './lib/raiz.mjs'
import { dataLocal, chaveDa, lerRegistro, jaRodou, registrar, ultimaDe, caminhoTrava, travar } from './registro.mjs'

function pasta() {
  const dir = mkdtempSync(join(tmpdir(), 'registro-'))
  return { dir, limpar: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a raiz vista de dentro da lib e a pasta que tem esta skill', () => {
  assert.ok(existsSync(join(RAIZ, '.claude', 'skills', 'agendar', 'scripts', 'registro.mjs')), `RAIZ deu ${RAIZ}`)
})

test('dataLocal usa o fuso local e completa com zero', () => {
  assert.equal(dataLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.equal(chaveDa('estoque', '2026-01-05'), 'estoque:2026-01-05')
})

test('feito e pulou:acesso fecham o dia, falhou nao fecha', () => {
  const p = pasta()
  const livro = join(p.dir, 'robos', 'execucoes.jsonl')
  try {
    registrar(livro, { chave: 'a:2026-09-24', robo: 'a', resultado: 'feito' })
    registrar(livro, { chave: 'b:2026-09-24', robo: 'b', resultado: 'pulou:acesso' })
    registrar(livro, { chave: 'c:2026-09-24', robo: 'c', resultado: 'falhou' })
    assert.equal(lerRegistro(livro).length, 3)
    assert.equal(jaRodou(livro, 'a:2026-09-24'), true)
    assert.equal(jaRodou(livro, 'b:2026-09-24'), true)
    assert.equal(jaRodou(livro, 'c:2026-09-24'), false)
    assert.equal(jaRodou(livro, 'a:2026-09-25'), false)
  } finally { p.limpar() }
})

test('agendado e removido vao pro livro mas nao fecham o dia', () => {
  const p = pasta()
  const livro = join(p.dir, 'robos', 'execucoes.jsonl')
  try {
    registrar(livro, { chave: 'a:2026-09-24', robo: 'a', resultado: 'agendado' })
    registrar(livro, { chave: 'b:2026-09-24', robo: 'b', resultado: 'removido' })
    assert.equal(lerRegistro(livro).length, 2)
    assert.equal(jaRodou(livro, 'a:2026-09-24'), false)
    assert.equal(jaRodou(livro, 'b:2026-09-24'), false)
  } finally { p.limpar() }
})

test('linha corrompida no meio do livro e ignorada e o resto vale', () => {
  const p = pasta()
  const livro = join(p.dir, 'execucoes.jsonl')
  try {
    registrar(livro, { chave: 'a:1', robo: 'a', resultado: 'falhou' })
    appendFileSync(livro, '{"chave":"a:1","rob\n')
    registrar(livro, { chave: 'a:2', robo: 'a', resultado: 'feito' })
    assert.equal(lerRegistro(livro).length, 2)
    assert.equal(ultimaDe(livro, 'a').chave, 'a:2')
    assert.equal(ultimaDe(livro, 'z'), null)
    assert.deepEqual(lerRegistro(join(p.dir, 'nao-existe.jsonl')), [])
  } finally { p.limpar() }
})

test('trava: a segunda tentativa falha enquanto a primeira segura, e solta libera', () => {
  const p = pasta()
  const caminho = caminhoTrava('/proj', 'a', p.dir)
  try {
    const t1 = travar(caminho, 60_000)
    assert.equal(t1.ok, true)
    assert.equal(t1.removeuVelha, false)
    assert.deepEqual(travar(caminho, 60_000), { ok: false })
    t1.soltar()
    assert.equal(existsSync(caminho), false)
    const t3 = travar(caminho, 60_000)
    assert.equal(t3.ok, true)
    t3.soltar()
  } finally { p.limpar() }
})

test('trava com mais que o dobro do prazo e de rodada morta: sai e a nova entra', () => {
  const p = pasta()
  const caminho = caminhoTrava('/proj', 'a', p.dir)
  try {
    writeFileSync(caminho, '999')
    const velho = new Date(Date.now() - 10 * 60_000)
    utimesSync(caminho, velho, velho)
    const t = travar(caminho, 60_000)
    assert.equal(t.ok, true)
    assert.equal(t.removeuVelha, true)
    t.soltar()
  } finally { p.limpar() }
})

test('caminho da trava e estavel e muda com o projeto e com o robo', () => {
  assert.equal(caminhoTrava('/p', 'a', '/t'), caminhoTrava('/p', 'a', '/t'))
  assert.notEqual(caminhoTrava('/p', 'a', '/t'), caminhoTrava('/p', 'b', '/t'))
  assert.notEqual(caminhoTrava('/p', 'a', '/t'), caminhoTrava('/q', 'a', '/t'))
})
