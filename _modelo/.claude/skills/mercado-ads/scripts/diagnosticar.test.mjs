// Testes do raio-X do Mercado Ads: regras aplicadas ao snapshot e cruzadas com a ata.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { diagnosticar, acos7d } from './diagnosticar.mjs'
import { argumentos, linhasDePromocao } from './rodar.mjs'
import { PADROES } from './estrategia.mjs'

const camp = extra => ({ id: 1, nome: 'Kits', status: 'active', clicks: 100, cost: 40, conversions: 0, acos: 0, roas: 0, orcamento: 10, dias_dados: 10, cost_7d: 14, total_amount_7d: 0, ...extra })
const snap = campanhas => ({ data: '2026-09-23', dias: 30, campanhas, totais: { cost: 40, total_amount: 0, conversions: 0 } })
const decisao = extra => ({ ts: '2026-09-20T12:00:00.000Z', escopo: 'ads', alvo: { id: 1, nome: 'Kits' }, decisao: 'nao_mexer', resumo: 'segurar uma semana', motivo: 'acabou de mudar o lance', baseline: {}, reavaliar_em: '2026-09-27', ...extra })

test('acos7d: null sem dado, Infinity quando gastou sem vender', () => {
  assert.equal(acos7d({}), null)
  assert.equal(acos7d({ cost_7d: 0, total_amount_7d: 0 }), null)
  assert.equal(acos7d({ cost_7d: 7, total_amount_7d: 0 }), Infinity)
  assert.equal(acos7d({ cost_7d: 7, total_amount_7d: 70 }), 0.1)
})

test('sem decisao, gasto sem venda vai pra fila como pausar', () => {
  const r = diagnosticar(snap([camp()]), { ...PADROES })
  assert.deepEqual(r.acoes.map(a => a.acao), ['pausar'])
  assert.ok(r.relatorioMd.length > 0)
  assert.match(r.relatorioMd, /PAUSAR/)
})

test('decisao em vigor cala a recomendacao e aparece no rodape', () => {
  const r = diagnosticar(snap([camp({ cost_7d: 1 })]), { ...PADROES }, { decisoes: [decisao()] })
  assert.equal(r.acoes.length, 0)
  assert.equal(r.emVigor.length, 1)
  assert.match(r.relatorioMd, /Decisoes em vigor/)
})

test('rodape das decisoes mostra o dia local da decisao, o mesmo relogio do prazo', () => {
  const antes = process.env.TZ
  try {
    process.env.TZ = 'America/Sao_Paulo'
    // 19/09 as 22h em Sao Paulo; prazo padrao de 7 dias cai em 26/09
    const d = decisao({ ts: '2026-09-20T01:00:00.000Z', reavaliar_em: undefined })
    const r = diagnosticar(snap([camp({ cost_7d: 1 })]), { ...PADROES }, { decisoes: [d] })
    assert.match(r.relatorioMd, /\(2026-09-19\): segurar uma semana\. Reavaliar em 2026-09-26\./)
  } finally {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  }
})

test('decisao vencida volta como revisar, com o combinado no motivo', () => {
  const r = diagnosticar(snap([camp()]), { ...PADROES }, { decisoes: [decisao({ reavaliar_em: '2026-09-22' })] })
  assert.deepEqual(r.acoes.map(a => a.acao), ['revisar'])
  assert.match(r.acoes[0].motivo, /segurar uma semana/)
})

test('decisao de campanha pausada vencida nao some: volta pra fila', () => {
  const r = diagnosticar(snap([camp({ status: 'paused' })]), { ...PADROES }, { decisoes: [decisao({ decisao: 'pausar', reavaliar_em: '2026-09-21' })] })
  assert.equal(r.ativas, 0)
  assert.equal(r.pausadas, 1)
  assert.match(r.acoes[0].motivo, /campanha pausada/)
})

test('freio no padrao do kit vira aviso no relatorio', () => {
  assert.match(diagnosticar(snap([]), { ...PADROES, _padrao: true }).relatorioMd, /freio ainda esta no padrao/)
})

test('rodar: argumentos e linhas de promocao', () => {
  assert.deepEqual(argumentos([]), { acao: 'raio-x', dias: 30 })
  assert.deepEqual(argumentos(['--promocoes']), { acao: 'promocoes' })
  assert.throws(() => argumentos(['--dias', '200']), /1 a 90/)
  assert.deepEqual(linhasDePromocao(undefined), [])
})

// O prazo tem de sair no dia do relogio do aluno, nunca no do UTC. A sonda roda num processo
// filho com o fuso de Sao Paulo fixo, pra o teste valer em qualquer maquina.
const URL_RODAR = new URL('./rodar.mjs', import.meta.url).href

test('prazo da promocao sai no dia de Sao Paulo, nao no do UTC', () => {
  const codigo = `const { linhasDePromocao, diaDoPrazo } = await import(${JSON.stringify(URL_RODAR)})
    const linha = p => linhasDePromocao([{ id: 'P1', type: 'SMART', status: 'candidate', name: 'Semana', ...p }])[0]
    console.log(JSON.stringify({
      hora: new Date('2026-09-30T01:00:00Z').getHours(),
      z: linha({ deadline_date: '2026-09-30T01:00:00Z' }),
      menos3: diaDoPrazo('2026-09-30T23:59:00.000-03:00'),
      puro: diaDoPrazo('2026-09-30'),
      semPrazo: linha({}),
    }))`
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Sao_Paulo' } })
  assert.equal(r.status, 0, 'sonda falhou: ' + r.stderr)
  assert.ok(r.stdout.trim().length > 0, 'canario: a sonda respondeu')
  const s = JSON.parse(r.stdout)
  assert.equal(s.hora, 22, 'canario: o fuso de Sao Paulo pegou na sonda')
  assert.equal(s.z, 'P1 | SMART | candidate | Semana | adesao ate 2026-09-29')
  assert.equal(s.menos3, '2026-09-30')
  assert.equal(s.puro, '2026-09-30')
  assert.equal(s.semPrazo, 'P1 | SMART | candidate | Semana | adesao ate ?')
})
