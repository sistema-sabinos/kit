// Testes do lacunas.mjs numa pasta-mae falsa (com _modelo/ e VERSAO) e dois projetos.
// Rodar: node --test lacunas.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { agora, anotar, arquivoDoProjeto, juntar, lerAnotacoes, lerTabela, marcar } from './lacunas.mjs'

const SCRIPT = fileURLToPath(new URL('./lacunas.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)

function mae() {
  const raiz = mkdtempSync(join(tmpdir(), 'lacunas-'))
  const m = join(raiz, 'mae')
  mkdirSync(join(m, '_modelo'), { recursive: true })
  writeFileSync(join(m, 'VERSAO'), '5.57')
  const mestra = join(m, 'agentes', 'souza')
  mkdirSync(mestra, { recursive: true })
  const a = join(m, 'Projeto-01'), b = join(m, 'Projeto-02')
  mkdirSync(a); mkdirSync(b)
  return { raiz, casa: join(raiz, 'casa'), mestra, a, b }
}
const limpar = p => rmSync(p.raiz, { recursive: true, force: true })

test('agora: data e hora local com segundos', () => {
  assert.equal(agora(new Date(2026, 0, 5, 7, 8, 9)), '2026-01-05 07:08:09')
})

test('anotar: grava no projeto uma linha por deducao, com o tema limpo', () => {
  const p = mae()
  try {
    const r1 = anotar(p.a, 'souza', 'Imposto de renda no Brasil', { quando: '2026-11-17 09:00:00' })
    assert.deepEqual(r1, { codigo: 0, linhas: ['anotada: Imposto de renda no Brasil'] })
    const r2 = anotar(p.a, 'souza', '  imposto   de RENDA no brasil ', { quando: '2026-11-17 15:00:00' })
    assert.deepEqual(r2.linhas, ['anotada: imposto de RENDA no brasil'])
    const txt = readFileSync(arquivoDoProjeto(p.a, 'souza'), 'utf8')
    assert.match(txt, /^# Lacunas do souza/)
    assert.deepEqual(lerAnotacoes(txt).map(x => x.data), ['2026-11-17 09:00:00', '2026-11-17 15:00:00'])
  } finally { limpar(p) }
})

test('mesmo projeto e mesmo dia: fechada ao meio-dia e deduzida a tarde, reabre (achado da comum e da interna no B1)', () => {
  const p = mae()
  try {
    anotar(p.a, 'souza', 'Taxa de corretagem', { quando: '2026-11-17 10:00:00' })
    juntar(p.mestra, { projeto: p.a, casa: p.casa })
    marcar(p.mestra, 'taxa de corretagem', 'sem-fonte', '', { casa: p.casa, quando: '2026-11-17 12:00:00' })
    assert.deepEqual(anotar(p.a, 'souza', 'Taxa de corretagem', { quando: '2026-11-17 15:00:00' }).linhas, ['anotada: Taxa de corretagem'])
    const r = juntar(p.mestra, { projeto: p.a, casa: p.casa })
    assert.deepEqual(r.linhas, ['juntei: 1 temas novos de 1 projetos; abertas: 1', 'aberta: Taxa de corretagem'])
  } finally { limpar(p) }
})

test('juntar e marcar: copia-mestra que nao existe recusa sem estourar', () => {
  const p = mae()
  try {
    const falta = join(p.mestra, '..', 'nao-existe')
    const j = juntar(falta, { projeto: p.a, casa: p.casa })
    assert.equal(j.codigo, 1)
    assert.match(j.linhas[0], /^nao juntei: .*nao existe: confira o apelido$/)
    assert.match(marcar(falta, 'x', 'sem-fonte', '', { casa: p.casa }).linhas[0], /^nao marquei: .*nao existe/)
  } finally { limpar(p) }
})

test('anotar: recusa apelido torto, tema vazio e tema longo; barra vertical vira barra', () => {
  const p = mae()
  try {
    assert.equal(anotar(p.a, 'Souza X', 'tema').codigo, 1)
    assert.equal(anotar(p.a, 'souza', '   ').codigo, 1)
    assert.equal(anotar(p.a, 'souza', 'x'.repeat(121)).codigo, 1)
    assert.equal(existsSync(arquivoDoProjeto(p.a, 'souza')), false, 'recusa nao grava')
    anotar(p.a, 'souza', 'renda | fixa', { quando: '2026-11-17 09:00:00' })
    assert.deepEqual(lerAnotacoes(readFileSync(arquivoDoProjeto(p.a, 'souza'), 'utf8')).map(x => x.tema), ['renda / fixa'])
  } finally { limpar(p) }
})

test('anotar: preserva o CRLF do arquivo que ja existe', () => {
  const p = mae()
  try {
    const f = arquivoDoProjeto(p.a, 'souza')
    mkdirSync(join(f, '..'), { recursive: true })
    writeFileSync(f, ['# Lacunas do souza', '', '- 2026-11-01 10:00:00 | velho', ''].join(CRLF))
    anotar(p.a, 'souza', 'novo', { quando: '2026-11-17 09:00:00' })
    const t = readFileSync(f, 'utf8')
    assert.ok(t.endsWith('- 2026-11-17 09:00:00 | novo' + CRLF), JSON.stringify(t.slice(-40)))
    assert.equal(t.split(CRLF).length - 1, t.split(String.fromCharCode(10)).length - 1, 'toda quebra e CRLF')
  } finally { limpar(p) }
})

test('juntar: une os projetos da pasta-mae, sem repetir o tema aberto e sem mexer nos projetos', () => {
  const p = mae()
  try {
    anotar(p.a, 'souza', 'Imposto de renda', { quando: '2026-11-17 09:00:00' })
    anotar(p.b, 'souza', 'imposto de renda', { quando: '2026-11-17 10:00:00' })
    anotar(p.b, 'souza', 'Previdencia privada', { quando: '2026-11-17 11:00:00' })
    const antes = readFileSync(arquivoDoProjeto(p.b, 'souza'), 'utf8')
    const r = juntar(p.mestra, { projeto: p.a, casa: p.casa })
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    assert.deepEqual(r.linhas, ['juntei: 2 temas novos de 2 projetos; abertas: 2', 'aberta: Imposto de renda', 'aberta: Previdencia privada'])
    assert.equal(readFileSync(arquivoDoProjeto(p.b, 'souza'), 'utf8'), antes)
    const r2 = juntar(p.mestra, { projeto: p.a, casa: p.casa })
    assert.match(r2.linhas[0], /^juntei: 0 temas novos de 2 projetos; abertas: 2$/)
    assert.equal(lerTabela(readFileSync(join(p.mestra, 'lacunas.md'), 'utf8')).length, 2)
  } finally { limpar(p) }
})

test('juntar: tema fechado so reabre com anotacao depois da marcacao, mesmo no mesmo dia (achado da comum)', () => {
  const p = mae()
  try {
    anotar(p.a, 'souza', 'Imposto de renda', { quando: '2026-11-17 09:00:00' })
    juntar(p.mestra, { projeto: p.a, casa: p.casa })
    const m = marcar(p.mestra, 'imposto de renda', 'sem-fonte', '', { casa: p.casa, quando: '2026-11-17 12:00:00' })
    assert.deepEqual(m, { codigo: 0, linhas: ['marcada: Imposto de renda sem-fonte'] })
    // a anotacao velha nao reabre
    assert.match(juntar(p.mestra, { projeto: p.a, casa: p.casa }).linhas[0], /^juntei: 0 temas novos/)
    // a tarde, outro projeto anota o mesmo tema: reabre
    anotar(p.b, 'souza', 'Imposto de renda', { quando: '2026-11-17 15:00:00' })
    const r = juntar(p.mestra, { projeto: p.a, casa: p.casa })
    assert.deepEqual(r.linhas, ['juntei: 1 temas novos de 2 projetos; abertas: 1', 'aberta: Imposto de renda'])
    // no dia seguinte, o mesmo projeto da anotacao fechada anota de novo: reabre
    marcar(p.mestra, 'imposto de renda', 'coberta', '24, 25', { casa: p.casa, quando: '2026-11-17 18:00:00' })
    assert.deepEqual(anotar(p.a, 'souza', 'Imposto de renda', { quando: '2026-11-18 08:00:00' }).linhas, ['anotada: Imposto de renda'])
    assert.match(juntar(p.mestra, { projeto: p.a, casa: p.casa }).linhas[0], /^juntei: 1 temas novos/)
    const t = lerTabela(readFileSync(join(p.mestra, 'lacunas.md'), 'utf8'))
    assert.deepEqual(t.map(x => [x.status, x.fichas]), [['sem-fonte', ''], ['coberta', '24, 25'], ['aberta', '']])
  } finally { limpar(p) }
})

test('juntar e marcar: so na copia-mestra; marcar recusa status, fichas e tema que nao existe', () => {
  const p = mae()
  try {
    const solta = join(p.raiz, 'solta', 'souza')
    mkdirSync(solta, { recursive: true })
    assert.match(juntar(solta, { projeto: p.a, casa: p.casa }).linhas[0], /^nao juntei:/)
    assert.equal(marcar(solta, 'x', 'coberta', '1', { casa: p.casa }).codigo, 1)
    anotar(p.a, 'souza', 'tema', { quando: '2026-11-17 09:00:00' })
    juntar(p.mestra, { projeto: p.a, casa: p.casa })
    for (const [st, fi, re] of [['feita', '', /use coberta ou sem-fonte/], ['coberta', '', /pede as fichas/], ['coberta', 'vinte', /use os numeros/]]) {
      const r = marcar(p.mestra, 'tema', st, fi, { casa: p.casa })
      assert.equal(r.codigo, 1)
      assert.match(r.linhas[0], re)
    }
    assert.match(marcar(p.mestra, 'outro', 'sem-fonte', '', { casa: p.casa }).linhas[0], /^nao achei lacuna aberta/)
  } finally { limpar(p) }
})

test('juntar: copia-mestra fora da pasta-mae le so o projeto aberto', () => {
  const p = mae()
  try {
    const mestra = join(p.casa, '.claude', 'conselheiros', 'souza')
    mkdirSync(mestra, { recursive: true })
    anotar(p.a, 'souza', 'um', { quando: '2026-11-17 09:00:00' })
    anotar(p.b, 'souza', 'dois', { quando: '2026-11-17 09:00:00' })
    const r = juntar(mestra, { projeto: p.a, casa: p.casa })
    assert.deepEqual(r.linhas, ['juntei: 1 temas novos de 1 projetos; abertas: 1', 'aberta: um'])
  } finally { limpar(p) }
})

test('anotar: 12 conversas ao mesmo tempo, nenhuma anotacao se perde (achado da final)', async () => {
  const p = mae()
  try {
    const { spawn } = await import('node:child_process')
    const um = i => new Promise(ok => spawn(process.execPath, [SCRIPT, 'anotar', 'souza', `tema ${i}`], { cwd: p.a }).on('close', ok))
    const codigos = await Promise.all(Array.from({ length: 12 }, (_, i) => um(i)))
    assert.deepEqual(codigos, Array(12).fill(0))
    const temas = lerAnotacoes(readFileSync(arquivoDoProjeto(p.a, 'souza'), 'utf8')).map(x => x.tema).sort()
    assert.equal(temas.length, 12, JSON.stringify(temas))
    assert.match(readFileSync(arquivoDoProjeto(p.a, 'souza'), 'utf8'), /^# Lacunas do souza/)
  } finally { limpar(p) }
})

test('lacuna chamada "tema" nao some como cabecalho da tabela (achado da final, volta 2)', () => {
  const p = mae()
  try {
    anotar(p.a, 'souza', 'tema', { quando: '2026-11-17 09:00:00' })
    assert.match(juntar(p.mestra, { projeto: p.a, casa: p.casa }).linhas[0], /abertas: 1$/)
    assert.deepEqual(marcar(p.mestra, 'tema', 'sem-fonte', '', { casa: p.casa }).linhas, ['marcada: tema sem-fonte'])
    assert.equal(lerTabela(readFileSync(join(p.mestra, 'lacunas.md'), 'utf8')).length, 1, 'canario: o cabecalho de verdade nao vira linha')
  } finally { limpar(p) }
})

test('anotar nunca regrava o que ja esta no arquivo (achado da final, volta 2)', () => {
  const p = mae()
  try {
    const f = arquivoDoProjeto(p.a, 'souza')
    anotar(p.a, 'souza', 'um', { quando: '2026-11-17 09:00:00' })
    const antes = readFileSync(f, 'utf8')
    anotar(p.a, 'souza', 'dois', { quando: '2026-11-17 10:00:00' })
    const depois = readFileSync(f, 'utf8')
    assert.ok(depois.startsWith(antes), 'o comeco do arquivo mudou')
    assert.equal(depois.split('# Lacunas do souza').length - 1, 1, 'cabecalho uma vez so')
  } finally { limpar(p) }
})

test('CLI: anotar pelo projeto aberto e uso errado sai 1', () => {
  const p = mae()
  try {
    const r = spawnSync(process.execPath, [SCRIPT, 'anotar', 'souza', 'renda fixa'], { cwd: p.a, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'anotada: renda fixa')
    assert.ok(existsSync(arquivoDoProjeto(p.a, 'souza')))
    const u = spawnSync(process.execPath, [SCRIPT, 'anotar'], { cwd: p.a, encoding: 'utf8' })
    assert.equal(u.status, 1)
    assert.match(u.stdout, /^Uso:/)
  } finally { limpar(p) }
})
