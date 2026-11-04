// Prova a casca: uma linha JSON no stdout, codigo 0 so quando libera, 3 em todo o resto.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TETO_PADRAO_USD } from './orcamento.mjs'

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

// 5.44: sem --pid e gasto feito a mao, e a reserva nasce sem pid e com ate 2 horas depois (antes levava o pid da CLI,
// que sai logo, e aparecia morta com o gasto em andamento)
test('sem --pid: a reserva nasce sem pid e com ate 2 horas depois do em', () => comRaiz(5, (raiz) => {
  const r = rodar(['--usd', '0.5', '--autorizado', '--raiz', raiz])
  assert.equal(r.status, 0, r.stderr)
  const [reserva] = JSON.parse(readFileSync(join(raiz, 'dados', 'orcamento-reservas.json'), 'utf8'))
  assert.equal('pid' in reserva, false)
  assert.equal(Date.parse(reserva.ate) - Date.parse(reserva.em), 2 * 60 * 60 * 1000)
}))

// 5.49 (bloco C, 2026-11-03): sem orcamento do mes, o --acima-do-teto passa o gasto acima do teto por lote
test('--acima-do-teto: sem orcamento, passa acima do teto por lote so com o valor citado e o --autorizado', () => comRaiz(null, (raiz) => {
  const sem = rodar(['--usd', '9', '--autorizado', '--raiz', raiz])
  assert.equal(sem.status, 3, sem.stdout)
  assert.match(JSON.parse(sem.stdout).parou, /^Barrada pela trava gasto, regra teto-do-lote: /)
  assert.equal(rodar(['--usd', '9', '--autorizado', '--acima-do-teto', '9', '--raiz', raiz]).status, 0)
  for (const v of [['--acima-do-teto', '8'], ['--acima-do-teto']]) assert.equal(rodar(['--usd', '9', '--autorizado', ...v, '--raiz', raiz]).status, 3, v.join(' '))
}))

// 5.49 (bloco 12, 2026-11-03): toda skill que manda rodar esta CLI junta o --acima-do-teto no mesmo passo,
// senao gasto acima do teto por lote fica parado mesmo com o pode ir que cita o valor (furo do /carrossel e da /midia-social)
test('SKILL: todo passo que roda o liberar-gasto-cli explica o --acima-do-teto', () => {
  const skills = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const achados = []
  for (const nome of readdirSync(skills).sort()) {
    let texto
    try { texto = readFileSync(join(skills, nome, 'SKILL.md'), 'utf8') } catch { continue }
    const linhas = texto.split(String.fromCharCode(10))
    linhas.forEach((l, i) => {
      if (!l.includes('liberar-gasto-cli.mjs')) return
      let fim = i + 1
      while (fim < linhas.length && !/^[0-9]+[.] /.test(linhas[fim].trimStart()) && !linhas[fim].startsWith('#')) fim++
      achados.push({ nome, passo: linhas.slice(i, fim).join(String.fromCharCode(10)) })
    })
  }
  const nomes = new Set(achados.map(a => a.nome))
  for (const n of ['carrossel', 'midia-social', 'editar-video']) assert.ok(nomes.has(n), `canario: ${n} roda o liberar-gasto-cli`)
  for (const a of achados) assert.ok(a.passo.includes('--acima-do-teto <'), `${a.nome}: o passo do liberar-gasto-cli nao junta o --acima-do-teto`)
  // 5.49 (bloco 12, 2026-11-03): sem o _contexto/mercado-livre.md ou sem o campo, o lerTeto cai no padrao;
  // passo que so cita o limite_gasto_usd deixa a IA achar que nao ha teto e perguntar o pode ir de novo
  for (const a of achados) assert.ok(a.passo.includes(`US$ ${TETO_PADRAO_USD} sem`), `${a.nome}: o passo do liberar-gasto-cli nao cita o teto padrao (US$ ${TETO_PADRAO_USD} sem o campo)`)
})

test('sem --autorizado, acima do saldo ou sem --usd valido: sai 3 com o motivo', () => comRaiz(5, (raiz) => {
  for (const [args, motivo] of [[['--usd', '0.5'], /pode ir/], [['--usd', '9', '--autorizado'], /nao cabe/], [['--usd', 'muito', '--autorizado'], /--usd valido/]]) {
    const r = rodar([...args, '--raiz', raiz])
    assert.equal(r.status, 3, r.stdout)
    assert.match(JSON.parse(r.stdout).parou, motivo)
  }
}))
