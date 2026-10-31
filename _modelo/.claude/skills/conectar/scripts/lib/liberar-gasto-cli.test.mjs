// Prova a casca: uma linha JSON no stdout, codigo 0 so quando libera, 3 em todo o resto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'liberar-gasto-cli.mjs')
const rodar = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })

function comRaiz(orcamento, fazer) {
  const raiz = mkdtempSync(join(tmpdir(), 'liberar-cli-'))
  try {
    mkdirSync(join(raiz, '_contexto'))
    if (orcamento !== null) writeFileSync(join(raiz, '_contexto', 'orcamento.md'), ['```orcamento', `orcamento_mes_usd: ${orcamento}`, '```', ''].join(String.fromCharCode(10)))
    return fazer(raiz)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
}

test('cabe e autorizado: sai 0 com a reserva no nome do pid passado', () => comRaiz(5, (raiz) => {
  const r = rodar(['--usd', '0.5', '--autorizado', '--pid', '4242', '--raiz', raiz])
  assert.equal(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout)
  assert.equal(j.codigo, 0)
  assert.ok(j.reserva)
  const reservas = JSON.parse(readFileSync(join(raiz, 'dados', 'orcamento-reservas.json'), 'utf8'))
  assert.equal(reservas[0].pid, 4242)
}))

test('sem --autorizado, acima do saldo ou sem --usd valido: sai 3 com o motivo', () => comRaiz(5, (raiz) => {
  for (const [args, motivo] of [[['--usd', '0.5'], /pode ir/], [['--usd', '9', '--autorizado'], /nao cabe/], [['--usd', 'muito', '--autorizado'], /--usd valido/]]) {
    const r = rodar([...args, '--raiz', raiz])
    assert.equal(r.status, 3, r.stdout)
    assert.match(JSON.parse(r.stdout).parou, motivo)
  }
}))
