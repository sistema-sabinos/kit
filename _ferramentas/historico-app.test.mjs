// Testes do historico de 30 dias no settings do usuario (5.54, C4, decisao 6).
// Rodar: node --test --test-reporter=tap _ferramentas/historico-app.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./historico-app.mjs', import.meta.url))
const KIT = fileURLToPath(new URL('../', import.meta.url))

// roda o script com HOME e USERPROFILE falsos; settings: texto do ~/.claude/settings.json ou null
function rodar(settings) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'historico-app-')))
  try {
    const arq = join(home, '.claude', 'settings.json')
    if (settings !== null) {
      mkdirSync(join(home, '.claude'))
      writeFileSync(arq, settings)
    }
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home },
    })
    const depois = existsSync(arq) ? readFileSync(arq, 'utf8') : null
    return { home, arq, codigo: r.status, saida: (r.stdout || '') + (r.stderr || ''), depois }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

test('cria o settings do usuario com 30 dias quando ele nao existe', () => {
  const r = rodar(null)
  assert.ok(r.saida.trim(), 'canario: o script imprimiu')
  assert.ok(r.saida.includes(r.arq), 'canario: o caminho impresso comeca no mkdtemp')
  assert.equal(r.codigo, 0, r.saida)
  assert.deepEqual(JSON.parse(r.depois), { desktopSessionCleanupPeriodDays: 30 })
})

test('preserva as outras chaves do settings do usuario', () => {
  const antes = { model: 'opus', permissions: { allow: ['Read'] }, hooks: { Stop: [] } }
  const r = rodar(JSON.stringify(antes, null, 2))
  assert.equal(r.codigo, 0, r.saida)
  assert.ok(r.saida.includes(r.arq), 'canario: o caminho impresso comeca no mkdtemp')
  assert.deepEqual(JSON.parse(r.depois), { ...antes, desktopSessionCleanupPeriodDays: 30 })
})

test('valor que ja existe com outro numero vira 30', () => {
  const r = rodar(JSON.stringify({ desktopSessionCleanupPeriodDays: 90, model: 'opus' }))
  assert.equal(r.codigo, 0, r.saida)
  assert.deepEqual(JSON.parse(r.depois), { desktopSessionCleanupPeriodDays: 30, model: 'opus' })
})

test('com 30 ja gravado nao muda o arquivo', () => {
  // formato compacto de proposito: regravar com indentacao mudaria os bytes
  const antes = '{"model":"opus","desktopSessionCleanupPeriodDays":30}'
  const r = rodar(antes)
  assert.equal(r.codigo, 0, r.saida)
  assert.ok(r.saida.includes(r.arq), 'canario: o caminho impresso comeca no mkdtemp')
  assert.equal(r.depois, antes)
})

// revisao interna da C4: arquivo vazio nao tem configuracao a preservar, vale como {}
test('settings vazio ou so com espaco ganha os 30 dias', () => {
  for (const antes of ['', '  \r\n']) {
    const r = rodar(antes)
    assert.ok(r.saida.includes(r.arq), 'canario: o caminho impresso comeca no mkdtemp')
    assert.equal(r.codigo, 0, r.saida)
    assert.deepEqual(JSON.parse(r.depois), { desktopSessionCleanupPeriodDays: 30 })
  }
})

test('JSON quebrado sai 2 sem gravar', () => {
  for (const antes of ['{"model": "opus",', '[1, 2]']) {
    const r = rodar(antes)
    assert.ok(r.saida.trim(), 'canario: o script imprimiu')
    assert.equal(r.codigo, 2, r.saida)
    assert.equal(r.depois, antes)
  }
})

// 5.55: o /setup chama pelo aplicar --registro, que roda o script (a chamada direta virava duplicata)
test('o /atualizar-kit chama o script e o /setup chama pelo aplicar --registro', () => {
  const cmd = 'node _ferramentas/historico-app.mjs'
  const kitTxt = readFileSync(join(KIT, '.claude/skills/atualizar-kit/SKILL.md'), 'utf8')
  const setup = readFileSync(join(KIT, '.claude/skills/setup/SKILL.md'), 'utf8')
  assert.ok(kitTxt.length > 1000 && setup.length > 1000, 'canario: as duas skills vieram')
  assert.ok(kitTxt.includes(cmd), `o /atualizar-kit chama o ${cmd}`)
  assert.ok(setup.includes('aplicar <pasta-do-projeto> --registro') && !setup.includes(cmd), 'o /setup chama pelo aplicar, sem a chamada direta')
})

// comum do Bloco C (5.54): o mae so compara e roda antes do sim; o Passo 2 do /atualizar-kit nao promete
// a linha do historico vinda dele
test('o Passo 2 do /atualizar-kit nao diz que a comparacao roda o historico', () => {
  const txt = readFileSync(join(KIT, '.claude/skills/atualizar-kit/SKILL.md'), 'utf8').replace(/\r\n/g, '\n')
  const ini = txt.indexOf('\n## Passo 2, comparar e mostrar\n')
  const p2 = txt.slice(ini, txt.indexOf('\n## ', ini + 1))
  assert.ok(ini > 0 && p2.includes('atualizar-projeto.mjs" mae'), 'canario: achou o Passo 2 com o mae')
  assert.ok(!p2.includes('historico-app') && !p2.includes('Historico do app'), p2)
})
