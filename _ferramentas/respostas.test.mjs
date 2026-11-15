// Testes do respostas.mjs (rodada 5.66). Rodar: node --test _ferramentas/respostas.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { importar, recortar, lerPerguntas, horaLocal, estado } from './respostas.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'respostas.mjs')
const MOLDE = readFileSync(join(AQUI, '..', 'RESPONDA-AQUI.txt'), 'utf8')
const CR = String.fromCharCode(13), LF = String.fromCharCode(10)
const TRAV = String.fromCharCode(0x2014)
const QUANDO = new Date(2026, 10, 15, 9, 7)
const linhasDe = t => t.split(CR + LF).join(LF).split(LF)
const respostaDe = (t, n) => lerPerguntas(linhasDe(t)).find(p => p.n === n)

test('canario: o molde do RESPONDA-AQUI.txt tem 17 perguntas em branco e e CRLF', () => {
  const ps = lerPerguntas(linhasDe(MOLDE))
  assert.equal(ps.length, 17)
  assert.ok(ps.every(p => p.resposta === '' && !p.carimbo))
  assert.ok(MOLDE.includes(CR + LF))
})

test('importar grava so nas em branco, embaixo do rotulo, com o carimbo da outra IA, e mantem o CRLF', () => {
  const colado = 'Claro! Seguem:\n[1] nome\nSua resposta: Sou a Marina, a loja e a Marina Doces.\n\n[4] o que faz\nSua resposta:\nVendo bolo por encomenda\nno bairro.\n[9]\nSua resposta: Só o meu negócio\n'
  const r = importar(MOLDE, colado, QUANDO)
  assert.deepEqual(r.gravadas, [1, 4, 9])
  assert.equal(r.fora, 1)
  assert.ok(r.texto.includes(CR + LF) && !r.texto.split(CR + LF).join('').includes(LF), 'o arquivo saiu com final de linha misturado')
  assert.equal(respostaDe(r.texto, 4).resposta, 'Vendo bolo por encomenda no bairro.')
  assert.equal(respostaDe(r.texto, 9).resposta, 'Só o meu negócio')
  assert.ok(r.texto.includes('Sua resposta: [2026-11-15 09:07 outra IA]' + CR + LF + 'Sou a Marina'))
  assert.equal(lerPerguntas(linhasDe(r.texto)).length, 17, 'a conta de perguntas mudou depois de gravar')
  assert.equal(respostaDe(r.texto, 2).resposta, '', 'gravou na pergunta errada')
  // nada muda alem das tres perguntas
  assert.equal(r.texto.split('outra IA]').length - 1, 3)
})

test('importar descarta pergunta que nao existe, repetida, sem rotulo e a que ja tinha resposta', () => {
  const ja = importar(MOLDE, '[2]\nSua resposta: comecei em 2019\n', QUANDO).texto
  const colado = '[18]\nSua resposta: x\n[5]\nSua resposta: 10 mil\n[5]\nSua resposta: 20 mil\n[6] canais\nInstagram\n[2]\nSua resposta: outra historia\n[3]\nSua resposta: Uso o básico\n'
  const r = importar(ja, colado, QUANDO)
  assert.deepEqual(r.gravadas, [3])
  assert.deepEqual(r.descartadas, ['18 (essa pergunta nao existe)', '5 (veio repetida)', '6 (sem "Sua resposta:")', '2 (ja tinha resposta)'])
  assert.equal(respostaDe(r.texto, 5).resposta, '')
  assert.equal(respostaDe(r.texto, 2).resposta, 'comecei em 2019')
})

test('importar troca o travessao por virgula e deixa em branco o modelo nao preenchido', () => {
  const colado = `[8]\nSua resposta: mulher de 30 a 50 anos ${TRAV} quer tratar flacidez\n[10]\nSua resposta: (o que você sabe, ou vazio)\n[13]\nSua resposta:\n`
  const r = importar(MOLDE, colado, QUANDO)
  assert.deepEqual(r.gravadas, [8])
  assert.deepEqual(r.vazias, [10, 13])
  assert.equal(respostaDe(r.texto, 8).resposta, 'mulher de 30 a 50 anos, quer tratar flacidez')
  assert.ok(!r.texto.includes(TRAV) && !r.texto.includes(String.fromCharCode(0x2013)))
})

test('recortar le a resposta na mesma linha do rotulo e nas de baixo, ate a proxima pergunta', () => {
  const { blocos } = recortar('[1] a\nSua resposta: um\ndois\n\n[2] b\nSua resposta:\ntres\n')
  assert.deepEqual(blocos, [{ n: 1, texto: 'um\ndois' }, { n: 2, texto: 'tres' }])
})

test('a linha Diferencial: sozinha nao conta como resposta da 4', () => {
  const linhas = linhasDe(MOLDE)
  const p4 = lerPerguntas(linhas).find(p => p.n === 4)
  linhas.splice(p4.rotulo + 1, 0, 'Diferencial: entrego no mesmo dia')
  assert.equal(lerPerguntas(linhas).find(p => p.n === 4).resposta, '')
})

// interna da 5.66: o que o ChatGPT e o Gemini devolvem de verdade
test('recortar tira o negrito do markdown, entende o "nao sei" da outra IA e nao estraga intervalo de numero', () => {
  const T = String.fromCharCode(0x2013)
  const { blocos, fora } = recortar(`**[1]** nome\n**Sua resposta:** Carla\n## [8] cliente\nSua resposta: mulheres de 30${T}50 anos ${TRAV} com filhos\n[5]\nSua resposta: ${TRAV}\n[6]\nSua resposta: (em branco)\n[7]\nSua resposta: -\n[10]\nSua resposta: N/A\n`)
  assert.equal(fora, 0)
  assert.deepEqual(blocos, [
    { n: 1, texto: 'Carla' }, { n: 8, texto: 'mulheres de 30 a 50 anos, com filhos' },
    { n: 5, texto: '' }, { n: 6, texto: '' }, { n: 7, texto: '' }, { n: 10, texto: '' },
  ])
})

test('separador e cerca de bloco de codigo entre as perguntas nao viram resposta', () => {
  const r = importar(MOLDE, '```\n[5]\nSua resposta: (em branco)\n---\n[6]\nSua resposta: Instagram\n***\n[7]\nSua resposta: Não tenho\n```\n', QUANDO)
  assert.deepEqual(r.gravadas, [6, 7])
  assert.deepEqual(r.vazias, [5])
  assert.equal(respostaDe(r.texto, 6).resposta, 'Instagram')
  assert.equal(respostaDe(r.texto, 7).resposta, 'Não tenho')
  assert.equal(estado(r.texto).emBranco.includes(5), true)
})

// interna no lugar da volta 2 da final: separador com espaco, cerca com texto e "nao sei" com marca de lista
test('separador com espaco some, cerca com a resposta na mesma linha fica, e "nao sei" de lista ou italico e vazio', () => {
  const { blocos } = recortar('[1] a\nSua resposta: não sei\n\n- - -\n[2] b\nSua resposta: nada\n* * *\n[3] c\nSua resposta:\n```Loja Ana```\n[4] d\nSua resposta:\n```text\nLoja X\n```\n[5] e\nSua resposta:\n- não sei\n[6] f\nSua resposta:\n1. Não sei\n[7] g\nSua resposta: *não sei*\n[8] h\nSua resposta: - Instagram\n')
  assert.deepEqual(blocos, [
    { n: 1, texto: '' }, { n: 2, texto: '' }, { n: 3, texto: '```Loja Ana```' }, { n: 4, texto: 'Loja X' },
    { n: 5, texto: '' }, { n: 6, texto: '' }, { n: 7, texto: '' }, { n: 8, texto: '- Instagram' },
  ])
})

test('recortar mantem o sublinhado duplo de perfil de rede', () => {
  assert.deepEqual(recortar('[10]\nSua resposta: Sigo **@ana__silva** no Instagram\n').blocos, [{ n: 10, texto: 'Sigo @ana__silva no Instagram' }])
})

test('resposta escrita a mao na mesma linha do rotulo conta, e a pergunta nao some da conta', () => {
  const t = MOLDE.replace('Sua resposta:' + CR + LF, 'Sua resposta: Sou a Carla' + CR + LF)
  const e = estado(t)
  assert.equal(e.total, 17, 'a pergunta com resposta na linha do rotulo sumiu da conta')
  assert.deepEqual(e.respondidas, [1])
  const r = importar(t, '[1]\nSua resposta: outra\n[2]\nSua resposta: comecei em 2019\n', QUANDO)
  assert.deepEqual(r.gravadas, [2])
  assert.ok(r.descartadas.includes('1 (ja tinha resposta)'))
})

test('importar na 4 mantem a linha Diferencial: que ja estava embaixo dela', () => {
  const linhas = linhasDe(MOLDE)
  const p4 = lerPerguntas(linhas).find(p => p.n === 4)
  linhas.splice(p4.rotulo + 1, 0, 'Diferencial: entrego no mesmo dia')
  const r = importar(linhas.join(CR + LF), '[4]\nSua resposta: Vendo bolo por encomenda\n', QUANDO)
  assert.deepEqual(r.gravadas, [4])
  assert.ok(r.texto.includes('Vendo bolo por encomenda' + CR + LF + 'Diferencial: entrego no mesmo dia'), 'o diferencial que ja estava sumiu')
  assert.equal(respostaDe(r.texto, 4).resposta, 'Vendo bolo por encomenda')
})

test('o rotulo conferido se le como da outra IA e conferido', () => {
  const t = importar(MOLDE, '[1]\nSua resposta: Carla\n', QUANDO).texto.replace('09:07 outra IA]', '09:07 outra IA conferida]')
  const p1 = respostaDe(t, 1)
  assert.ok(p1.outraIA && p1.conferida && p1.carimbo === '2026-11-15 09:07')
  assert.ok(!respostaDe(importar(MOLDE, '[1]\nSua resposta: Carla\n', QUANDO).texto, 1).conferida)
})

test('estado conta so resposta de verdade: carimbo sozinho e Diferencial sozinho seguem em branco', () => {
  const linhas = linhasDe(MOLDE.split('Sua resposta:').join('Sua resposta: [2026-11-15 09:00]'))
  const p4 = lerPerguntas(linhas).find(p => p.n === 4)
  linhas.splice(p4.rotulo + 1, 0, 'Diferencial: entrego no mesmo dia')
  const p1 = lerPerguntas(linhas).find(p => p.n === 1)
  linhas.splice(p1.rotulo + 1, 0, 'Sou a Carla')
  const e = estado(linhas.join(CR + LF))
  assert.equal(e.total, 17)
  assert.deepEqual(e.respondidas, [1])
  assert.ok(e.emBranco.includes(4) && e.emBranco.length === 16)
  assert.deepEqual(e.comCarimbo, [1])
})

test('estado separa o que veio de outra IA e ainda nao foi conferido', () => {
  const imp = importar(MOLDE, '[1]\nSua resposta: Carla\n[3]\nSua resposta: Uso o básico\n', QUANDO).texto
  const conf = imp.replace('Sua resposta: [2026-11-15 09:07 outra IA]' + CR + LF + 'Carla', 'Sua resposta: [2026-11-15 09:07 outra IA conferida]' + CR + LF + 'Carla')
  const e = estado(conf)
  assert.deepEqual(e.outraIA, [1, 3])
  assert.deepEqual(e.semConferir, [3])
  const cli = spawnSync(process.execPath, [SCRIPT, 'estado', '--arquivo', join(AQUI, '..', 'RESPONDA-AQUI.txt')], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  assert.match(cli.stdout, /^respondidas: 0 de 17$/m)
  assert.match(cli.stdout, /^com carimbo: 0 de 0$/m)
})

test('a hora sai do relogio do computador, nunca em UTC (fuso trocado pelo env do processo filho)', () => {
  assert.match(horaLocal(QUANDO), /^2026-11-15 09:07$/)
  const instante = 'new Date(Date.UTC(2026, 10, 15, 2, 30))'
  const em = tz => spawnSync(process.execPath, ['--input-type=module', '-e', `import { horaLocal } from ${JSON.stringify('file:///' + SCRIPT.split(String.fromCharCode(92)).join('/'))}; console.log(horaLocal(${instante}))`], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).stdout.trim()
  const utc = em('UTC'), sp = em('America/Sao_Paulo')
  assert.equal(utc, '2026-11-15 02:30', 'canario: o fuso UTC chegou no processo filho')
  assert.equal(sp, '2026-11-14 23:30')
})

test('pela linha de comando: grava so o RESPONDA-AQUI.txt, e entrada vazia ou uso errado falham', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'respostas-'))
  try {
    const arq = join(pasta, 'RESPONDA-AQUI.txt')
    writeFileSync(arq, MOLDE)
    const rodar = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8' })
    const ok = rodar(['importar', '--arquivo', arq], '[16]\nSua resposta: Só eu\n')
    assert.equal(ok.status, 0, ok.stderr)
    assert.match(ok.stdout, /^gravadas: 16$/m)
    assert.equal(respostaDe(readFileSync(arq, 'utf8'), 16).resposta, 'Só eu')
    assert.deepEqual(readdirSync(pasta), ['RESPONDA-AQUI.txt'], 'o script deixou arquivo a mais')
    assert.equal(rodar(['importar', '--arquivo', arq], '  \n').status, 1)
    assert.equal(rodar(['outra-coisa'], 'x').status, 2)
    assert.equal(rodar(['importar', '--arquivo', join(pasta, 'nao-existe.txt')], 'x').status, 1)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
