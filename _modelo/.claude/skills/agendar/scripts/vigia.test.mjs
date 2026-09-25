// Testes do vigia do processo pai, com o "vivo" e o "sair" simulados.
// Rodar: node --test vigia.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vigiarPai, paiVivo } from './vigia.mjs'

const esperar = (ms) => new Promise((res) => setTimeout(res, ms))

test('vigia sai com codigo 1 quando o pai some, uma vez so', async () => {
  const saidas = []
  const conferidos = []
  let vezes = 0
  const relogio = vigiarPai({
    ppid: 4242,
    intervaloMs: 5,
    vivo: (pid) => { conferidos.push(pid); vezes++; return vezes < 3 },
    sair: (codigo) => saidas.push(codigo),
  })
  try {
    for (let i = 0; i < 100 && !saidas.length; i++) await esperar(5)
    await esperar(30)
    assert.deepEqual(saidas, [1])
    assert.ok(conferidos.length >= 3, `conferiu ${conferidos.length} vezes`)
    assert.ok(conferidos.every((p) => p === 4242))
  } finally { clearInterval(relogio) }
})

test('vigia nao sai enquanto o pai vive', async () => {
  const saidas = []
  let vezes = 0
  const relogio = vigiarPai({ ppid: 4242, intervaloMs: 5, vivo: () => { vezes++; return true }, sair: (c) => saidas.push(c) })
  try {
    await esperar(60)
    assert.ok(vezes >= 3, `conferiu so ${vezes} vezes`)
    assert.deepEqual(saidas, [])
  } finally { clearInterval(relogio) }
})

test('vigia devolve relogio que nao segura o processo vivo', () => {
  const relogio = vigiarPai({ ppid: 4242, intervaloMs: 5, vivo: () => true, sair: () => {} })
  try {
    assert.equal(relogio.hasRef(), false)
  } finally { clearInterval(relogio) }
})

test('paiVivo: o proprio processo esta vivo, EPERM conta como vivo, processo inexistente nao', () => {
  assert.equal(paiVivo(process.pid), true)
  const erro = (code) => () => { const e = new Error(code); e.code = code; throw e }
  assert.equal(paiVivo(1, erro('EPERM')), true)
  assert.equal(paiVivo(1, erro('ESRCH')), false)
})
