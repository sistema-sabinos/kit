// Testes da rodada de um robo, com aviso, boot e cao de guarda simulados.
// Rodar: node --test motor.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rodarRobo, falhaAntesDeRodar, esperarRedePadrao, vigiarSeAgendado } from './motor.mjs'
import { caminhoTrava, travar, lerRegistro } from './registro.mjs'

function cenario() {
  const raiz = mkdtempSync(join(tmpdir(), 'motor-'))
  const falas = []
  const armados = []
  const base = {
    raiz,
    argv: ['node', 'motor.mjs'],
    env: {},
    pastaTrava: raiz,
    agora: () => new Date(2026, 8, 24, 8, 0),
    avisar: async (texto) => { falas.push(texto); return { entregue: true } },
    esperarBoot: async () => false,
    esperarRede: async () => true,
    armar: (opts) => {
      const cao = { ...opts, desarmado: false, desarmar() { cao.desarmado = true } }
      armados.push(cao)
      return cao
    },
  }
  const caminhoLivro = join(raiz, 'robos', 'execucoes.jsonl')
  return {
    raiz, falas, armados, base, caminhoLivro,
    livro: () => lerRegistro(caminhoLivro),
    limpar: () => rmSync(raiz, { recursive: true, force: true }),
  }
}

function receita(extra = {}) {
  const estado = { rodadas: 0 }
  const r = {
    nome: 'robo-teste',
    quando: { tipo: 'diario', hora: '08:00' },
    prazoMinutos: 5,
    async conferirAcesso() { return { ok: true } },
    async rodar() { estado.rodadas++; return { avisos: [] } },
    ...extra,
  }
  return { r, estado }
}

test('rodada sem problema registra feito e fica calada', async () => {
  const c = cenario()
  const { r, estado } = receita()
  try {
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'feito', codigo: 0 })
    assert.equal(estado.rodadas, 1)
    const livro = c.livro()
    assert.equal(livro.length, 1)
    assert.equal(livro[0].chave, 'robo-teste:2026-09-24')
    assert.equal(livro[0].resultado, 'feito')
    assert.equal(c.falas.length, 0)
  } finally { c.limpar() }
})

test('segunda disparada no mesmo dia nao roda de novo', async () => {
  const c = cenario()
  const { r, estado } = receita()
  try {
    await rodarRobo({ ...c.base, receita: r })
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'ja-rodou', codigo: 0 })
    assert.equal(estado.rodadas, 1)
    assert.equal(c.livro().length, 1)
  } finally { c.limpar() }
})

test('acesso caido pula, avisa uma vez com o motivo e fecha o dia', async () => {
  const c = cenario()
  const { r, estado } = receita({ async conferirAcesso() { return { ok: false, motivo: 'o token do Mercado Livre venceu' } } })
  try {
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'pulou:acesso', codigo: 0 })
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /o token do Mercado Livre venceu/)
    assert.equal(c.livro()[0].motivo, 'o token do Mercado Livre venceu')
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'ja-rodou', codigo: 0 })
    assert.equal(c.falas.length, 1)
    assert.equal(estado.rodadas, 0)
  } finally { c.limpar() }
})

test('erro na rodada vira falhou com codigo 1, avisa, e a proxima disparada tenta de novo', async () => {
  const c = cenario()
  let vez = 0
  const { r } = receita({ async rodar() { vez++; if (vez === 1) throw new Error('api fora'); return { avisos: [] } } })
  try {
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'falhou', codigo: 1 })
    assert.equal(c.livro()[0].motivo, 'api fora')
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /deu erro e parou/)
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'feito', codigo: 0 })
    assert.equal(vez, 2)
  } finally { c.limpar() }
})

test('erro dentro de conferirAcesso vira falhou, nunca pulou', async () => {
  const c = cenario()
  const { r } = receita({ async conferirAcesso() { throw new Error('dns') } })
  try {
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'falhou', codigo: 1 })
    assert.equal(c.livro()[0].resultado, 'falhou')
  } finally { c.limpar() }
})

test('aviso da receita vai pro Telegram e o relatorio vai pra relatorios/', async () => {
  const c = cenario()
  const { r } = receita({ async rodar() { return { avisos: ['2 anuncios zerados', '  '], relatorio: '# estoque\n' } } })
  try {
    await rodarRobo({ ...c.base, receita: r })
    assert.equal(c.falas.length, 1)
    assert.equal(c.falas[0], 'robo-teste:\n2 anuncios zerados')
    assert.equal(readFileSync(join(c.raiz, 'relatorios', 'robo-teste-2026-09-24.md'), 'utf8'), '# estoque\n')
  } finally { c.limpar() }
})

test('receita que devolve nada ou avisos fora de lista fecha como feito sem quebrar', async () => {
  for (const volta of [undefined, { avisos: 'texto solto' }, { relatorio: 42 }]) {
    const c = cenario()
    const { r } = receita({ async rodar() { return volta } })
    try {
      assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'feito', codigo: 0 })
      assert.equal(c.falas.length, 0)
      assert.equal(existsSync(join(c.raiz, 'relatorios')), false)
    } finally { c.limpar() }
  }
})

test('disparo duplo ao mesmo tempo: a segunda sai como ocupado sem rodar', async () => {
  const c = cenario()
  let soltar
  let rodadas = 0
  const { r } = receita({ async rodar() { rodadas++; await new Promise((res) => { soltar = res }); return { avisos: [] } } })
  try {
    const primeira = rodarRobo({ ...c.base, receita: r })
    await new Promise((res) => setImmediate(res))
    assert.equal(typeof soltar, 'function', 'a primeira rodada tinha que estar dentro do rodar')
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'ocupado', codigo: 0 })
    soltar()
    assert.deepEqual(await primeira, { resultado: 'feito', codigo: 0 })
    assert.equal(rodadas, 1)
    assert.equal(c.livro().filter((l) => l.resultado === 'feito').length, 1)
  } finally { c.limpar() }
})

test('trava velha de rodada que morreu e removida, anotada, e a rodada segue', async () => {
  const c = cenario()
  const { r } = receita()
  const caminho = caminhoTrava(c.raiz, 'robo-teste', c.raiz)
  try {
    writeFileSync(caminho, '999')
    const velho = new Date(Date.now() - 60 * 60_000)
    utimesSync(caminho, velho, velho)
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'feito', codigo: 0 })
    assert.deepEqual(c.livro().map((l) => l.resultado), ['trava-velha-removida', 'feito'])
    assert.equal(existsSync(caminho), false)
  } finally { c.limpar() }
})

test('trava de rodada viva segura mesmo depois de a primeira ter comecado ha pouco', async () => {
  const c = cenario()
  const { r, estado } = receita()
  const viva = travar(caminhoTrava(c.raiz, 'robo-teste', c.raiz), 5 * 60_000)
  try {
    assert.equal(viva.ok, true)
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'ocupado', codigo: 0 })
    assert.equal(estado.rodadas, 0)
  } finally { viva.soltar(); c.limpar() }
})

test('modo teste sem Telegram mostra o aviso na tela e nunca grava recado', async () => {
  const c = cenario()
  const { r } = receita({ async rodar() { return { avisos: ['farinha acaba na quinta'] } } })
  const tela = []
  try {
    const res = await rodarRobo({ ...c.base, argv: ['node', 'motor.mjs', '--teste'], receita: r, naTela: (t) => tela.push(t) })
    assert.deepEqual(res, { resultado: 'feito', codigo: 0 })
    assert.deepEqual(c.falas, [], 'nao chamou o aviso, que gravaria recado')
    assert.equal(tela.length, 1)
    assert.match(tela[0], /^\[teste\] robo-teste:\nfarinha acaba na quinta/)
    assert.equal(existsSync(join(c.raiz, '_memoria', 'recados')), false)
    // rodada de verdade sem Telegram continua virando recado pelo aviso
    await rodarRobo({ ...c.base, receita: r, naTela: (t) => tela.push(t) })
    assert.equal(c.falas.length, 1)
  } finally { c.limpar() }
})

test('modo teste avisa mesmo sem problema e nao conta como a rodada do dia', async () => {
  const c = cenario()
  const { r, estado } = receita()
  try {
    const env = { TELEGRAM_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' }
    const res = await rodarRobo({ ...c.base, env, argv: ['node', 'motor.mjs', '--teste'], receita: r })
    assert.deepEqual(res, { resultado: 'feito', codigo: 0 })
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /^\[teste\] robo-teste/)
    assert.equal(existsSync(c.caminhoLivro), false)
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'feito', codigo: 0 })
    assert.equal(estado.rodadas, 2)
  } finally { c.limpar() }
})

test('a chave usa o dia em que a rodada comecou, mesmo passando da meia-noite', async () => {
  const c = cenario()
  const { r } = receita()
  const horas = [new Date(2026, 8, 24, 23, 59), new Date(2026, 8, 25, 0, 1)]
  let i = 0
  try {
    await rodarRobo({ ...c.base, agora: () => horas[Math.min(i++, 1)], receita: r })
    assert.equal(c.livro()[0].chave, 'robo-teste:2026-09-24')
  } finally { c.limpar() }
})

test('cao de guarda armado com o prazo da receita e desarmado no fim, e o boot e esperado', async () => {
  const c = cenario()
  const { r } = receita()
  const boot = []
  try {
    await rodarRobo({ ...c.base, esperarBoot: async (min, nome, opts) => { boot.push({ min, nome, opts }) }, receita: r })
    assert.equal(c.armados.length, 1)
    assert.equal(c.armados[0].ms, 5 * 60_000)
    assert.equal(c.armados[0].desarmado, true)
    assert.equal(boot.length, 1)
    assert.equal(boot[0].min, 10)
    assert.equal(boot[0].opts.soAgendado, true)
  } finally { c.limpar() }
})

test('receita invalida e recusada antes de criar qualquer arquivo', async () => {
  const c = cenario()
  const { r } = receita({ nome: 'Robo Teste' })
  try {
    await assert.rejects(rodarRobo({ ...c.base, receita: r }), /nome da receita/)
    assert.equal(existsSync(join(c.raiz, 'robos')), false)
  } finally { c.limpar() }
})

test('cao de guarda estourado marca falhou, avisa uma vez, solta a trava, e rodar tardio nao sobrescreve', async () => {
  const c = cenario()
  let soltarRodar
  const { r } = receita({ async rodar() { return new Promise((res) => { soltarRodar = res }) } })
  const caminho = caminhoTrava(c.raiz, 'robo-teste', c.raiz)
  try {
    rodarRobo({ ...c.base, receita: r })
    await new Promise((res) => setImmediate(res))
    assert.equal(c.armados.length, 1)
    const cao = c.armados[0]
    assert.equal(typeof cao.aoEstourar, 'function')
    assert.ok(cao.prazoAvisoMs > 15000, `prazoAvisoMs (${cao.prazoAvisoMs}) tinha que passar de 15000`)
    await cao.aoEstourar()
    assert.deepEqual(c.livro().map((l) => ({ resultado: l.resultado, motivo: l.motivo })), [{ resultado: 'falhou', motivo: 'passou de 5 min' }])
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /foi parado/)
    assert.equal(existsSync(caminho), false)

    soltarRodar({ avisos: [] })
    await new Promise((res) => setImmediate(res))
    assert.equal(c.livro().length, 1)
    assert.equal(c.falas.length, 1)
  } finally { c.limpar() }
})

test('cao de guarda estourado no meio do aviso de sucesso nao dobra o livro nem o aviso', async () => {
  const c = cenario()
  const { r } = receita({ async rodar() { return { avisos: ['x'] } } })
  let vezes = 0
  const avisar = async (texto) => {
    vezes++
    if (vezes === 1) await c.armados[0].aoEstourar()
    c.falas.push(texto)
    return { entregue: true }
  }
  try {
    await rodarRobo({ ...c.base, avisar, receita: r })
    assert.deepEqual(c.livro().map((l) => l.resultado), ['falhou'])
    assert.equal(c.falas.length, 2)
    assert.equal(c.falas.filter((f) => /foi parado/.test(f)).length, 1)
    assert.equal(c.falas.filter((f) => f === 'robo-teste:\nx').length, 1)
  } finally { c.limpar() }
})

test('cao de guarda estourado enquanto conferirAcesso espera impede o rodar e fecha falhou', async () => {
  const c = cenario()
  let liberarAcesso
  let vezesRodar = 0
  const { r } = receita({
    async conferirAcesso() { return new Promise((res) => { liberarAcesso = res }) },
    async rodar() { vezesRodar++; return { avisos: [] } },
  })
  try {
    const promessa = rodarRobo({ ...c.base, receita: r })
    await new Promise((res) => setImmediate(res))
    assert.equal(c.armados.length, 1)
    await c.armados[0].aoEstourar()
    liberarAcesso({ ok: true })
    const res = await promessa
    assert.deepEqual(res, { resultado: 'falhou', codigo: 1 })
    assert.equal(vezesRodar, 0)
    assert.equal(existsSync(join(c.raiz, 'relatorios')), false)
    assert.deepEqual(c.livro().map((l) => l.resultado), ['falhou'])
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /foi parado/)
  } finally { c.limpar() }
})

test('erro antes de travar (pasta da trava nao existe) vira falhou, avisa e registra', async () => {
  const c = cenario()
  const { r } = receita()
  try {
    const res = await rodarRobo({ ...c.base, pastaTrava: join(c.raiz, 'nao-existe', 'mais-fundo'), receita: r })
    assert.deepEqual(res, { resultado: 'falhou', codigo: 1 })
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /deu erro e parou/)
    assert.equal(c.livro()[0].resultado, 'falhou')
  } finally { c.limpar() }
})

test('erro na rodada com o livro quebrado ainda avisa', async () => {
  const c = cenario()
  // a receita estraga o livro (vira pasta) e quebra: gravar 'falhou' vai falhar tambem
  const { r } = receita({ async rodar() { mkdirSync(c.caminhoLivro, { recursive: true }); throw new Error('api fora') } })
  try {
    assert.deepEqual(await rodarRobo({ ...c.base, receita: r }), { resultado: 'falhou', codigo: 1 })
    assert.equal(c.falas.length, 1)
    assert.match(c.falas[0], /deu erro e parou/)
  } finally { c.limpar() }
})

test('modo teste grava o relatorio num arquivo proprio, sem sobrescrever o do dia', async () => {
  const c = cenario()
  const { r } = receita({ async rodar() { return { avisos: [], relatorio: '# do teste\n' } } })
  const pasta = join(c.raiz, 'relatorios')
  try {
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, 'robo-teste-2026-09-24.md'), '# do dia\n')
    await rodarRobo({ ...c.base, argv: ['node', 'motor.mjs', '--teste'], receita: r })
    assert.equal(readFileSync(join(pasta, 'robo-teste-2026-09-24.md'), 'utf8'), '# do dia\n')
    assert.equal(readFileSync(join(pasta, 'robo-teste-2026-09-24-teste.md'), 'utf8'), '# do teste\n')
  } finally { c.limpar() }
})

test('espera a rede so quando disparado pelo agendador, e antes do conferirAcesso', async () => {
  const ordem = []
  for (const [argv, espera] of [
    [['node', 'motor.mjs', 'robos/x.mjs', '--agendado'], true],
    [['node', 'motor.mjs', 'robos/x.mjs'], false],
    [['node', 'motor.mjs', 'robos/x.mjs', '--teste'], false],
  ]) {
    const c = cenario()
    ordem.length = 0
    const { r } = receita({ async conferirAcesso() { ordem.push('acesso'); return { ok: true } } })
    try {
      await rodarRobo({ ...c.base, argv, esperarRede: async () => { ordem.push('rede'); return true }, receita: r })
      assert.deepEqual(ordem, espera ? ['rede', 'acesso'] : ['acesso'], argv.join(' '))
    } finally { c.limpar() }
  }
})

test('rede que nao volta nao impede a rodada: a receita decide', async () => {
  const c = cenario()
  const { r, estado } = receita()
  try {
    const res = await rodarRobo({ ...c.base, argv: ['node', 'motor.mjs', '--agendado'], esperarRede: async () => false, receita: r })
    assert.deepEqual(res, { resultado: 'feito', codigo: 0 })
    assert.equal(estado.rodadas, 1)
  } finally { c.limpar() }
})

test('esperarRedePadrao tenta de novo ate a rede voltar, desiste no limite e nunca lanca', async () => {
  let vezes = 0
  const volta = await esperarRedePadrao({
    lookup: async () => { vezes++; if (vezes < 3) throw new Error('ENOTFOUND') },
    intervaloMs: 1, limiteMs: 10_000,
  })
  assert.equal(volta, true)
  assert.equal(vezes, 3)
  const nunca = await esperarRedePadrao({ lookup: async () => { throw new Error('ENOTFOUND') }, intervaloMs: 1, limiteMs: 20 })
  assert.equal(nunca, false)
})

test('falha antes de rodar (receita quebrada) na rodada agendada grava robos/<nome>.log e avisa com o nome do robo', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'motor-'))
  const falas = []
  try {
    await falhaAntesDeRodar({
      argv: ['node', 'motor.mjs', 'robos/estoque-zerado.mjs', '--agendado'],
      alvo: 'robos/estoque-zerado.mjs',
      erro: new Error('Unexpected token }'),
      raiz,
      env: {},
      avisar: async (texto, opts) => { falas.push({ texto, opts }) },
      agora: () => new Date(2026, 8, 24, 8, 0),
    })
    const log = readFileSync(join(raiz, 'robos', 'estoque-zerado.log'), 'utf8')
    assert.ok(log.length > 0, 'log veio vazio')
    assert.match(log, /Unexpected token \}/)
    assert.match(log, /2026-09-24/)
    assert.equal(falas.length, 1)
    assert.match(falas[0].texto, /estoque-zerado/)
    assert.match(falas[0].texto, /não conseguiu nem começar/)
    assert.equal(falas[0].opts.robo, 'estoque-zerado')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('falha antes de rodar nao lanca nem se o aviso quebrar', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'motor-'))
  try {
    await falhaAntesDeRodar({
      argv: ['node', 'motor.mjs', 'robos/x.mjs', '--agendado'],
      alvo: 'robos/x.mjs', erro: new Error('quebrou'), raiz, env: {},
      avisar: async () => { throw new Error('sem rede') }, agora: () => new Date(2026, 8, 24, 8, 0),
    })
    assert.match(readFileSync(join(raiz, 'robos', 'x.log'), 'utf8'), /quebrou/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('vigia do pai liga so no Windows e so na rodada do agendador', () => {
  for (const [plataforma, argv, liga] of [
    ['win32', ['node', 'motor.mjs', 'robos/x.mjs', '--agendado'], true],
    ['win32', ['node', 'motor.mjs', 'robos/x.mjs'], false],
    ['win32', ['node', 'motor.mjs', 'robos/x.mjs', '--teste'], false],
    ['darwin', ['node', 'motor.mjs', 'robos/x.mjs', '--agendado'], false],
  ]) {
    let chamadas = 0
    const r = vigiarSeAgendado({ plataforma, argv, vigiar: () => { chamadas++ } })
    assert.equal(chamadas, liga ? 1 : 0, `${plataforma} ${argv.join(' ')}`)
    assert.equal(r, liga)
  }
})

test('falha antes de rodar na rodada manual grava o log mas nao manda aviso: quem rodou ja ve o erro na tela', async () => {
  for (const argv of [['node', 'motor.mjs', 'robos/x.mjs'], ['node', 'motor.mjs', 'robos/x.mjs', '--teste']]) {
    const raiz = mkdtempSync(join(tmpdir(), 'motor-'))
    const falas = []
    try {
      await falhaAntesDeRodar({
        argv, alvo: 'robos/x.mjs', erro: new Error('quebrou'), raiz, env: {},
        avisar: async (texto) => { falas.push(texto) }, agora: () => new Date(2026, 8, 24, 8, 0),
      })
      const log = readFileSync(join(raiz, 'robos', 'x.log'), 'utf8')
      assert.ok(log.length > 0, 'log veio vazio')
      assert.match(log, /quebrou/)
      assert.deepEqual(falas, [], argv.join(' '))
    } finally { rmSync(raiz, { recursive: true, force: true }) }
  }
})
