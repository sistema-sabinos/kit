// Testes do cadastro no agendador, sem cadastrar nada de verdade (o executor e simulado).
// Rodar: node --test agendador.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nomeTarefa, rotuloMac, scriptWindows, plistMac, registrarRobo, removerRobo, listarRobos, robosAtrasados } from './agendador.mjs'
import { registrar, lerRegistro } from './registro.mjs'

const AGORA = () => new Date(2026, 8, 24, 9, 0)
const livroDe = (raiz) => lerRegistro(join(raiz, 'robos', 'execucoes.jsonl'))

const RECEITA = "export default { nome: 'estoque', quando: { tipo: 'diario', hora: '08:00' }, prazoMinutos: 10, async conferirAcesso() { return { ok: true } }, async rodar() { return {} } }\n"

function projeto() {
  const raiz = mkdtempSync(join(tmpdir(), 'agendador-'))
  mkdirSync(join(raiz, 'robos'))
  writeFileSync(join(raiz, 'robos', 'estoque.mjs'), RECEITA)
  return { raiz, limpar: () => rmSync(raiz, { recursive: true, force: true }) }
}

function executor(respostas = []) {
  const chamadas = []
  const executar = (cmd, args) => { chamadas.push({ cmd, args }); return respostas.shift() || { status: 0, stdout: '', stderr: '' } }
  return { chamadas, executar }
}

const BASE = { node: '/usr/local/bin/node', motor: '/m/motor.mjs', quando: { tipo: 'diario', hora: '08:00' }, prazoMinutos: 10 }

test('nome da tarefa e rotulo do Mac limpam espaco e apostrofo da pasta do projeto', () => {
  assert.equal(nomeTarefa("/home/x/Loja da Ana's", 'estoque'), 'SabinOS-Loja-da-Ana-s--estoque')
  assert.equal(rotuloMac("/home/x/Loja da Ana's", 'estoque'), 'com.sabinos.loja-da-ana-s.estoque')
})

test('script do Windows traz as cinco configuracoes, o gatilho e o limite com folga e espera de boot', () => {
  const s = scriptWindows({ ...BASE, tarefa: 'SabinOS-Loja--estoque', receita: '/home/Loja/robos/estoque.mjs', raiz: '/home/Loja' })
  for (const trecho of [
    '-StartWhenAvailable',
    '-ExecutionTimeLimit (New-TimeSpan -Minutes 25)',
    '-MultipleInstances IgnoreNew',
    '-AllowStartIfOnBatteries',
    '-DontStopIfGoingOnBatteries',
    "New-ScheduledTaskTrigger -Daily -At '08:00'",
    "Register-ScheduledTask -TaskName 'SabinOS-Loja--estoque'",
    '-Force',
  ]) assert.ok(s.includes(trecho), `faltou: ${trecho}`)
})

test('script do Windows comeca com ErrorActionPreference Stop, senao um cmdlet que falha registra com padrao', () => {
  const s = scriptWindows({ ...BASE, tarefa: 't', receita: '/r.mjs', raiz: '/p' })
  assert.ok(s.startsWith("$ErrorActionPreference = 'Stop'"), s)
})

test('pasta com espaco e apostrofo sai com as aspas certas no Windows', () => {
  const raiz = "/home/Loja da Ana's"
  const s = scriptWindows({ ...BASE, tarefa: 't', receita: `${raiz}/robos/estoque.mjs`, raiz })
  assert.ok(s.includes("-WorkingDirectory '/home/Loja da Ana''s'"), s)
  assert.ok(s.includes(`-Argument '--headless "/usr/local/bin/node" "/m/motor.mjs" "/home/Loja da Ana''s/robos/estoque.mjs" --agendado'`), s)
})

test('no Windows a tarefa chama o node pelo conhost sem janela, senao abre a janela preta a cada rodada', () => {
  const s = scriptWindows({ ...BASE, tarefa: 't', receita: '/r.mjs', raiz: '/p' })
  assert.ok(s.includes("New-ScheduledTaskAction -Execute 'conhost.exe' -Argument '--headless "), s)
  assert.ok(s.includes(`--headless "/usr/local/bin/node" "/m/motor.mjs" "/r.mjs" --agendado' -WorkingDirectory '/p'`), s)
  assert.equal(s.includes("-Execute '/usr/local/bin/node'"), false)
})

test('gatilho semanal usa o dia em ingles do PowerShell', () => {
  const s = scriptWindows({ ...BASE, quando: { tipo: 'semanal', dia: 'seg', hora: '09:00' }, tarefa: 't', receita: '/r.mjs', raiz: '/p' })
  assert.ok(s.includes("New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '09:00'"), s)
})

test('plist do Mac: horario em numero, dia da semana, escape de & e log no projeto', () => {
  const p = plistMac({ ...BASE, rotulo: 'com.sabinos.x.estoque', nome: 'estoque', receita: '/Users/ana/Loja & Cia/robos/estoque.mjs', raiz: '/Users/ana/Loja & Cia', quando: { tipo: 'semanal', dia: 'seg', hora: '09:05' } })
  assert.ok(p.includes('<key>Hour</key><integer>9</integer>'), p)
  assert.ok(p.includes('<key>Minute</key><integer>5</integer>'), p)
  assert.ok(p.includes('<key>Weekday</key><integer>1</integer>'), p)
  assert.ok(p.includes('<string>/Users/ana/Loja &amp; Cia/robos/estoque.mjs</string>'), p)
  assert.ok(p.includes('<string>--agendado</string>'), p)
  assert.ok(p.includes('<key>StandardOutPath</key><string>/Users/ana/Loja &amp; Cia/robos/estoque.log</string>'), p)
  assert.equal(p.includes('Loja & Cia'), false)
})

test('registrar no Windows cadastra e confere lendo a tarefa de volta', async () => {
  const pj = projeto()
  const ex = executor()
  try {
    const r = await registrarRobo('robos/estoque.mjs', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, node: '/n', agora: AGORA })
    assert.equal(r.tarefa, nomeTarefa(pj.raiz, 'estoque'))
    assert.equal(ex.chamadas.length, 2)
    assert.equal(ex.chamadas[0].cmd, 'powershell')
    assert.ok(ex.chamadas[0].args.includes('-NoProfile'))
    assert.match(ex.chamadas[0].args.at(-1), /Register-ScheduledTask/)
    assert.match(ex.chamadas[1].args.at(-1), /Get-ScheduledTask/)
    assert.deepEqual(livroDe(pj.raiz), [{ chave: 'estoque:2026-09-24', robo: 'estoque', resultado: 'agendado', inicio: AGORA().toISOString() }])
  } finally { pj.limpar() }
})

test('registrar no Windows recusado explica o motivo e nao anota nada no livro', async () => {
  const pj = projeto()
  const ex = executor([{ status: 1, stdout: '', stderr: 'Acesso negado' }])
  try {
    await assert.rejects(registrarRobo('robos/estoque.mjs', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, node: '/n', agora: AGORA }), /recusou: Acesso negado/)
    assert.deepEqual(livroDe(pj.raiz), [])
  } finally { pj.limpar() }
})

test('registrar no Mac grava o plist, tira o antigo, carrega e confere', async () => {
  const pj = projeto()
  const ex = executor()
  const escritos = []
  const fs = { mkdirSync: () => {}, writeFileSync: (c, t) => escritos.push({ c, t }) }
  try {
    const r = await registrarRobo('robos/estoque.mjs', { raiz: pj.raiz, plataforma: 'darwin', executar: ex.executar, node: '/n', casa: '/Users/ana', uid: () => 501, fs, agora: AGORA })
    const rotulo = rotuloMac(pj.raiz, 'estoque')
    assert.equal(r.tarefa, rotulo)
    assert.equal(escritos[0].c, `/Users/ana/Library/LaunchAgents/${rotulo}.plist`)
    assert.deepEqual(ex.chamadas.map((c) => c.args[0]), ['bootout', 'bootstrap', 'print'])
    assert.deepEqual(ex.chamadas[1].args, ['bootstrap', 'gui/501', escritos[0].c])
    assert.deepEqual(ex.chamadas[2].args, ['print', `gui/501/${rotulo}`])
    assert.deepEqual(livroDe(pj.raiz).map((l) => l.resultado), ['agendado'])
  } finally { pj.limpar() }
})

test('registrar no Mac que nao aparece no launchd lanca e nao anota agendado', async () => {
  const pj = projeto()
  const ex = executor([{ status: 0 }, { status: 0 }, { status: 113 }])
  const fs = { mkdirSync: () => {}, writeFileSync: () => {} }
  try {
    await assert.rejects(registrarRobo('robos/estoque.mjs', { raiz: pj.raiz, plataforma: 'darwin', executar: ex.executar, node: '/n', casa: '/Users/ana', uid: () => 501, fs, agora: AGORA }), /nao apareceu no launchd/)
    assert.deepEqual(livroDe(pj.raiz), [])
  } finally { pj.limpar() }
})

test('fora do Windows e do Mac, recusa com mensagem clara', async () => {
  const pj = projeto()
  try {
    await assert.rejects(registrarRobo('robos/estoque.mjs', { raiz: pj.raiz, plataforma: 'linux', executar: executor().executar }), /Windows e no Mac/)
  } finally { pj.limpar() }
})

test('remover no Windows procura a tarefa pelo Where-Object, desregistra sem pedir confirmacao e anota removido', async () => {
  const pj = projeto()
  const tarefa = nomeTarefa(pj.raiz, 'estoque')
  const ex = executor([{ status: 0, stdout: `${tarefa}\r\n`, stderr: '' }])
  try {
    const r = await removerRobo('estoque', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, agora: AGORA })
    assert.deepEqual(r, { removido: true })
    assert.equal(ex.chamadas.length, 2)
    // Get-ScheduledTask -TaskName de tarefa que nao existe sai com erro no Windows em
    // portugues mesmo com -ErrorAction SilentlyContinue; o Where-Object sai 0 e vazio.
    assert.equal(ex.chamadas[0].args.at(-1), `Get-ScheduledTask | Where-Object { $_.TaskName -eq '${tarefa}' } | ForEach-Object { $_.TaskName }`)
    assert.ok(ex.chamadas[1].args.at(-1).includes(`Unregister-ScheduledTask -TaskName '${tarefa}' -Confirm:$false`))
    assert.deepEqual(livroDe(pj.raiz), [{ chave: 'estoque:2026-09-24', robo: 'estoque', resultado: 'removido', inicio: AGORA().toISOString() }])
  } finally { pj.limpar() }
})

test('remover no Windows quando a tarefa nao existe mais devolve removido false sem desregistrar nem anotar', async () => {
  const pj = projeto()
  const ex = executor([{ status: 0, stdout: '', stderr: '' }])
  try {
    const r = await removerRobo('estoque', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, agora: AGORA })
    assert.deepEqual(r, { removido: false })
    assert.equal(ex.chamadas.length, 1)
    assert.deepEqual(livroDe(pj.raiz), [])
  } finally { pj.limpar() }
})

test('remover no Windows: aviso no stderr sem a linha da tarefa conta como nao existe e nao desregistra', async () => {
  const pj = projeto()
  const tarefa = nomeTarefa(pj.raiz, 'estoque')
  const ex = executor([{ status: 0, stdout: `${tarefa}-velha\r\n`, stderr: 'AVISO: modulo carregado com nome fora do padrao' }])
  try {
    const r = await removerRobo('estoque', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, agora: AGORA })
    assert.deepEqual(r, { removido: false })
    assert.equal(ex.chamadas.length, 1)
    assert.ok(!ex.chamadas.some((c) => c.args.at(-1).includes('Unregister')))
    assert.deepEqual(livroDe(pj.raiz), [])
  } finally { pj.limpar() }
})

test('remover no Windows: qualquer falha do Unregister lanca, seja qual for o idioma da mensagem, e nao anota', async () => {
  const pj = projeto()
  try {
    for (const stderr of ['Acesso negado', 'Nenhum objeto MSFT_ScheduledTask correspondente encontrado', 'No MSFT_ScheduledTask objects found matching input criteria.']) {
      const ex = executor([{ status: 0, stdout: `${nomeTarefa(pj.raiz, 'estoque')}\r\n`, stderr: '' }, { status: 1, stdout: '', stderr }])
      await assert.rejects(removerRobo('estoque', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, agora: AGORA }), (e) => e.message === `o agendador do Windows recusou: ${stderr}`)
    }
    assert.deepEqual(livroDe(pj.raiz), [])
  } finally { pj.limpar() }
})

test('remover no Windows lanca quando nem a leitura do agendador funcionou', async () => {
  const pj = projeto()
  const ex = executor([{ status: 1, stdout: '', stderr: 'falha geral do powershell' }])
  try {
    await assert.rejects(removerRobo('estoque', { raiz: pj.raiz, plataforma: 'win32', executar: ex.executar, agora: AGORA }), /nao consegui ler o agendador do Windows: falha geral do powershell/)
    assert.equal(ex.chamadas.length, 1)
  } finally { pj.limpar() }
})

test('remover no Mac tira o plist e anota removido', async () => {
  const pj = projeto()
  const ex = executor()
  const apagados = []
  const fs = { existsSync: () => true, unlinkSync: (c) => apagados.push(c) }
  try {
    const r = await removerRobo('estoque', { raiz: pj.raiz, plataforma: 'darwin', executar: ex.executar, casa: '/Users/ana', uid: () => 501, fs, agora: AGORA })
    assert.deepEqual(r, { removido: true })
    assert.deepEqual(apagados, [`/Users/ana/Library/LaunchAgents/${rotuloMac(pj.raiz, 'estoque')}.plist`])
    assert.deepEqual(livroDe(pj.raiz).map((l) => l.resultado), ['removido'])
  } finally { pj.limpar() }
})

test('aspas curvas no nome da pasta tambem sao dobradas, porque o PowerShell as trata como aspa simples', () => {
  const curva = String.fromCharCode(0x2019)
  const abre = String.fromCharCode(0x2018)
  const raiz = `/home/Ana${curva}s ${abre}Loja`
  const s = scriptWindows({ ...BASE, tarefa: 't', receita: '/r.mjs', raiz })
  assert.ok(s.includes(`-WorkingDirectory '/home/Ana${curva}${curva}s ${abre}${abre}Loja'`), s)
})

function receitaTexto(nome, quando) {
  return `export default { nome: '${nome}', quando: ${JSON.stringify(quando)}, prazoMinutos: 5, async conferirAcesso() { return { ok: true } }, async rodar() { return {} } }\n`
}

test('atrasados: le o livro, conta da ultima rodada ou do agendamento, e ignora removido e o que nunca foi agendado', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'agendador-'))
  const agora = new Date(2026, 8, 24, 9, 0)
  const pasta = join(raiz, 'robos')
  const livro = join(pasta, 'execucoes.jsonl')
  const diario = { tipo: 'diario', hora: '08:00' }
  const semanal = { tipo: 'semanal', dia: 'seg', hora: '08:00' }
  try {
    mkdirSync(pasta)
    const receitas = {
      'diario-em-dia': diario, 'diario-atrasado': diario, 'diario-falhou': diario,
      'semanal-em-dia': semanal, 'semanal-atrasado': semanal,
      'semanal-agendado-recente': semanal, 'semanal-agendado-antigo': semanal,
      'removido': diario, 'reagendado': diario, 'nunca-agendado': diario,
    }
    for (const [nome, quando] of Object.entries(receitas)) writeFileSync(join(pasta, `${nome}.mjs`), receitaTexto(nome, quando))
    writeFileSync(join(pasta, 'quebrado.mjs'), 'export default { nome: \n')
    for (const [nome, data, resultado] of [
      ['diario-em-dia', '2026-09-20', 'agendado'], ['diario-em-dia', '2026-09-23', 'feito'],
      ['diario-atrasado', '2026-09-22', 'feito'],
      ['diario-falhou', '2026-09-22', 'falhou'],
      ['semanal-em-dia', '2026-09-19', 'pulou:acesso'],
      ['semanal-atrasado', '2026-09-15', 'feito'],
      ['semanal-agendado-recente', '2026-09-21', 'agendado'],
      ['semanal-agendado-antigo', '2026-09-15', 'agendado'],
      ['removido', '2026-09-01', 'feito'], ['removido', '2026-09-02', 'removido'],
      ['reagendado', '2026-09-01', 'feito'], ['reagendado', '2026-09-02', 'removido'], ['reagendado', '2026-09-23', 'agendado'],
    ]) registrar(livro, { chave: `${nome}:${data}`, robo: nome, resultado })

    const lista = await robosAtrasados({ raiz, agora })
    assert.ok(lista.length > 0, 'lista veio vazia')
    assert.deepEqual(lista.map((i) => i.nome), ['diario-atrasado', 'diario-falhou', 'quebrado', 'semanal-agendado-antigo', 'semanal-atrasado'])
    const por = Object.fromEntries(lista.map((i) => [i.nome, i]))
    assert.deepEqual(por['diario-atrasado'], { nome: 'diario-atrasado', desde: '2026-09-22' })
    assert.deepEqual(por['diario-falhou'], { nome: 'diario-falhou', desde: '2026-09-22' })
    assert.deepEqual(por['semanal-atrasado'], { nome: 'semanal-atrasado', desde: '2026-09-15' })
    assert.deepEqual(por['semanal-agendado-antigo'], { nome: 'semanal-agendado-antigo', desde: '2026-09-15', nuncaRodou: true })
    assert.match(por.quebrado.motivo, /^receita com erro: /)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('atrasados: projeto sem pasta robos devolve lista vazia', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'agendador-'))
  try {
    assert.deepEqual(await robosAtrasados({ raiz, agora: new Date(2026, 8, 24, 9, 0) }), [])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('listar no Windows cruza as tarefas do projeto com a ultima rodada de cada robo', async () => {
  const pj = projeto()
  const prefixo = nomeTarefa(pj.raiz, '')
  const ex = executor([{ status: 0, stdout: `${prefixo}estoque\r\n${prefixo}vendas\r\n`, stderr: '' }])
  try {
    const livro = join(pj.raiz, 'robos', 'execucoes.jsonl')
    registrar(livro, { chave: 'estoque:2026-09-24', robo: 'estoque', resultado: 'feito' })
    // agendar e remover tambem vao pro livro, mas nao sao rodada: o listar mostra a rodada
    registrar(livro, { chave: 'estoque:2026-09-24', robo: 'estoque', resultado: 'agendado' })
    registrar(livro, { chave: 'vendas:2026-09-24', robo: 'vendas', resultado: 'agendado' })
    const lista = await listarRobos({ raiz: pj.raiz, plataforma: 'win32', executar: ex.executar })
    assert.equal(ex.chamadas[0].args.at(-1), `Get-ScheduledTask | Where-Object { $_.TaskName -like '${prefixo}*' } | ForEach-Object { $_.TaskName }`)
    assert.equal(lista.length, 2)
    assert.equal(lista[0].nome, 'estoque')
    assert.equal(lista[0].ultima.resultado, 'feito')
    assert.equal(lista[1].nome, 'vendas')
    assert.equal(lista[1].ultima, null)
  } finally { pj.limpar() }
})

test('listar no Windows nao confunde o projeto Loja com o projeto Loja-Nova gracas ao hifen duplo', async () => {
  const ex = executor([{ status: 0, stdout: 'SabinOS-Loja--estoque\r\nSabinOS-Loja-Nova--vendas\r\n', stderr: '' }])
  const lista = await listarRobos({ raiz: '/home/Loja', plataforma: 'win32', executar: ex.executar })
  assert.equal(lista.length, 1)
  assert.equal(lista[0].nome, 'estoque')
})

test('listar no Windows lanca erro quando o proprio comando de leitura falha', async () => {
  const ex = executor([{ status: 1, stdout: '', stderr: 'falha geral do powershell' }])
  await assert.rejects(listarRobos({ raiz: '/home/Loja', plataforma: 'win32', executar: ex.executar }), /nao consegui ler o agendador do Windows: falha geral do powershell/)
})
