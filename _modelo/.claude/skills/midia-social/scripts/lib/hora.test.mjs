// dataHoraLocal tem de seguir o relogio do aluno, nunca o UTC. A sonda roda num processo filho com
// o fuso fixo, pra o teste valer em qualquer maquina.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const URL_HORA = new URL('./hora.mjs', import.meta.url).href

function sonda(tz, iso) {
  const codigo = `const { dataHoraLocal } = await import(${JSON.stringify(URL_HORA)}); console.log(dataHoraLocal(new Date(${JSON.stringify(iso)})))`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8', env: { ...process.env, TZ: tz } })
  assert.equal(r.status, 0, 'sonda no fuso ' + tz + ' falhou: ' + r.stderr)
  assert.ok(r.stdout.trim().length > 0, 'canario: a sonda respondeu')
  return r.stdout.trim()
}

test('dataHoraLocal mostra a hora de Sao Paulo, nao a do UTC', () => {
  assert.equal(sonda('America/Sao_Paulo', '2026-10-20T01:30:00Z'), '2026-10-19 22:30')
  assert.equal(sonda('Etc/GMT-14', '2026-10-20T01:30:00Z'), '2026-10-20 15:30')
  assert.equal(sonda('America/Sao_Paulo', '2026-01-05T12:07:00Z'), '2026-01-05 09:07')
})
