// Testes do vigia do processo pai, com o "vivo" e o "sair" simulados.
// O relogio e o falso do node:test (mock.timers): o teste avanca o tempo na mao, entao
// maquina lenta ou suite cheia nao muda o resultado. No Node 22.0.0 o relogio falso nao para
// o intervalo limpo de dentro do proprio callback (o 22.23.3 ja para); o teste roda na bancada.
// Rodar: node --test vigia.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vigiarPai, paiVivo } from './vigia.mjs'

test('vigia sai com codigo 1 quando o pai some, uma vez so', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
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
    t.mock.timers.tick(4)
    assert.equal(conferidos.length, 0, 'conferiu antes do intervalo')
    t.mock.timers.tick(1)
    t.mock.timers.tick(5)
    assert.deepEqual(saidas, [])
    t.mock.timers.tick(5)
    assert.deepEqual(saidas, [1])
    t.mock.timers.tick(50)
    assert.deepEqual(saidas, [1])
    assert.equal(conferidos.length, 3)
    assert.ok(conferidos.every((p) => p === 4242))
  } finally { clearInterval(relogio) }
})

test('vigia nao sai enquanto o pai vive', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const saidas = []
  let vezes = 0
  const relogio = vigiarPai({ ppid: 4242, intervaloMs: 5, vivo: () => { vezes++; return true }, sair: (c) => saidas.push(c) })
  try {
    for (let i = 0; i < 12; i++) t.mock.timers.tick(5)
    assert.equal(vezes, 12)
    assert.deepEqual(saidas, [])
  } finally { clearInterval(relogio) }
})

// Relogio de verdade de proposito: o falso nao guarda o unref. Nao depende de tempo.
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
