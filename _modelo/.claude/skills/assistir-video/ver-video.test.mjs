// Testes do ver-video.mjs sem rede: o fetch e o https.request viram falsos num modulo
// carregado antes do script (--import), e cada chamada fica anotada num arquivo.
// Rodar: node --test ver-video.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./ver-video.mjs', import.meta.url))

// falso: upload aceita, o estado do arquivo vem de ESTADO, a chamada de analise cai na rede
const FALSO = `
import fs from 'node:fs'
import https from 'node:https'
import { EventEmitter } from 'node:events'
const anotar = (l) => fs.appendFileSync(process.env.LOG_FALSO, l + String.fromCharCode(10))
const resposta = (corpo, cabecalhos = {}) => ({ status: 200, ok: true, headers: new Headers(cabecalhos), json: async () => corpo, text: async () => JSON.stringify(corpo) })
globalThis.fetch = async (url, op = {}) => {
  const u = String(url)
  anotar((op.method || 'GET') + ' ' + u.split('?')[0])
  if (op.method === 'DELETE') return resposta({})
  if (u.includes('/upload/')) return resposta({}, { 'x-goog-upload-url': 'https://falso.invalido/subir' })
  if (u.startsWith('https://falso.invalido/subir')) return resposta({ file: { name: 'files/abc' } })
  return resposta({ state: process.env.ESTADO, uri: 'https://falso.invalido/files/abc', name: 'files/abc', mimeType: 'video/mp4' })
}
https.request = (url, op, responder) => {
  const req = new EventEmitter()
  req.setTimeout = () => req
  anotar('POST ' + String(url).split('?')[0])
  // ANALISE=ok: o Gemini responde com o texto e o uso de tokens; sem-uso: 200 sem usageMetadata; truncada: 200 com
  // o corpo cortado; corte: a conexao cai no meio do corpo; sem ela, a rede cai antes da resposta
  const corpos = {
    ok: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'VEREDITO: APROVADO' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }),
    'sem-uso': JSON.stringify({ candidates: [{ content: { parts: [{ text: 'VEREDITO: APROVADO' }] } }] }),
    truncada: '{"candidates":',
    corte: '{"candidates":',
  }
  req.end = () => setImmediate(() => {
    if (!corpos[process.env.ANALISE]) return req.emit('error', new Error('rede caiu de proposito'))
    const res = new EventEmitter()
    res.statusCode = 200
    res.setEncoding = () => {}
    responder(res)
    res.emit('data', corpos[process.env.ANALISE])
    if (process.env.ANALISE === 'corte') return res.emit('error', new Error('socket caiu no meio do corpo'))
    res.emit('end')
  })
  return req
}
`

// 5.52 (chat 3): o ver-video chamado direto passa pela trava do gasto; os testes de faxina vao com o sim e uma
// raiz temporaria sem orcamento (teto por lote padrao), pra nunca tocar no dados/ do kit.
// Conserto da interna: chamado direto, o --raiz nao vale mais; o teste roda uma copia do script dentro de um
// projeto temporario, que vira a raiz dele pelo caminho (o mesmo jeito do projeto do aluno)
const SKILLS = path.join(path.dirname(SCRIPT), '..')
function copiarScripts(dir) {
  for (const [pasta, nomes] of [['assistir-video', ['ver-video.mjs', 'custo.mjs', 'baixar-video.mjs']], [path.join('conectar', 'scripts', 'lib'), ['orcamento.mjs', 'raiz.mjs', 'autonomia.mjs', 'programa.mjs']]]) {
    fs.mkdirSync(path.join(dir, '.claude', 'skills', pasta), { recursive: true })
    for (const n of nomes) fs.copyFileSync(path.join(SKILLS, pasta, n), path.join(dir, '.claude', 'skills', pasta, n))
  }
  return path.join(dir, '.claude', 'skills', 'assistir-video', 'ver-video.mjs')
}
// vezes: roda o script mais de uma vez na mesma pasta (o log de chamadas e de cada rodada); anteriores guarda as outras
function rodar(estado, { args = ['--usd', '0.01', '--autorizado'], antes = () => {}, env = {}, raiz = false, modelo = 'gemini-3.8-flash', vezes = 1 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ver-video-'))
  try {
    const script = copiarScripts(dir)
    const falso = path.join(dir, 'falso.mjs')
    fs.writeFileSync(falso, FALSO)
    const video = path.join(dir, 'aula.mp4')
    fs.writeFileSync(video, Buffer.alloc(1000))
    const log = path.join(dir, 'chamadas.log')
    antes(dir)
    const anteriores = []
    let r, chamadas
    for (let i = 0; i < vezes; i++) {
      if (r) anteriores.push({ status: r.status, stderr: r.stderr, chamadas })
      fs.rmSync(log, { force: true })
      r = spawnSync(process.execPath, ['--import', pathToFileURL(falso).href, script, video, '--model', modelo, ...args, ...(raiz ? ['--raiz', dir] : [])], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: 'falsa', LOG_FALSO: log, ESTADO: estado, ...env },
      })
      chamadas = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
    }
    const ler = (rel) => fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : ''
    return { status: r.status, stderr: r.stderr, stdout: r.stdout, chamadas, anteriores, custos: ler('dados/custos.jsonl'), reservas: ler('dados/orcamento-reservas.json'), permissao: ler('dados/permissao-gastos.jsonl') }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const NL = String.fromCharCode(10)
function projeto(dir, { orcamento = 1, autonomia = null } = {}) {
  fs.mkdirSync(path.join(dir, '_contexto'))
  fs.writeFileSync(path.join(dir, '_contexto', 'orcamento.md'), ['```orcamento', `orcamento_mes_usd: ${orcamento}`, '```', ''].join(NL))
  if (autonomia) fs.writeFileSync(path.join(dir, '_contexto', 'autonomia.md'), ['```autonomia', 'area: gasto-ia', 'pode: gastar', `teto: ${autonomia}`, '```', ''].join(NL))
}

test('trava: chamado direto sem --usd, ou sem o sim e sem permissao, para antes de subir o video', () => {
  const sem = rodar('ACTIVE', { args: [] })
  assert.equal(sem.status, 3, sem.stderr)
  assert.match(sem.stderr, /parou: assistir com o Gemini é pago/)
  assert.equal(sem.chamadas, '', 'nada foi pra rede')
  const semSim = rodar('ACTIVE', { args: ['--usd', '0.5'], antes: (d) => projeto(d) })
  assert.equal(semSim.status, 3, semSim.stderr)
  assert.match(semSim.stderr, /Barrada pela trava gasto, regra pode-ir/)
  assert.equal(semSim.chamadas, '')
})

test('trava: com a permissao de gasto, assiste sem o sim, anota o custo com a reserva e fecha ela', () => {
  const r = rodar('ACTIVE', { args: ['--usd', '0.5'], antes: (d) => projeto(d, { autonomia: '1 USD mes' }), env: { ANALISE: 'ok' } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /VEREDITO: APROVADO/)
  assert.match(r.stderr, /\[permissao\] foi pela permissao .*resta US\$ 0\.50 de US\$ 1\.00 no mes/)
  const [linha] = r.custos.trim().split(NL).map((l) => JSON.parse(l))
  const [perm] = r.permissao.trim().split(NL).map((l) => JSON.parse(l))
  assert.equal(linha.reserva, perm.reserva, 'a linha de custo leva a reserva da liberacao')
  assert.deepEqual(JSON.parse(r.reservas), [], 'a reserva fechou depois do registro')
})

// 5.52 (chat 3, conserto da interna): o --sem-registro pulava a trava inteira sem prova nenhuma. Agora quem ja
// reservou passa --reserva <id>, e o ver-video confere que ela existe, e do pai dele e nao tem linha de custo
const reservaDe = (pid, extra = {}) => (d) => {
  projeto(d, { orcamento: 0.5 })
  fs.mkdirSync(path.join(d, 'dados'))
  // saldo zerado por esta reserva: conferir o saldo de novo pararia
  fs.writeFileSync(path.join(d, 'dados', 'orcamento-reservas.json'), JSON.stringify([{ id: 'de-quem-chamou', usd: 0.5, pid, em: new Date().toISOString() }]))
  if (extra.custo) fs.writeFileSync(path.join(d, 'dados', 'custos.jsonl'), JSON.stringify({ servico: 'gemini-cru', usd: 0.5, reserva: 'de-quem-chamou' }) + NL)
}
test('trava: com --reserva do processo que chamou nao confere o saldo de novo e nao anota o custo', () => {
  // o pai do ver-video aqui e este processo de teste
  const r = rodar('ACTIVE', { args: ['--reserva', 'de-quem-chamou'], antes: reservaDe(process.pid), env: { ANALISE: 'ok' }, raiz: true })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /VEREDITO: APROVADO/)
  assert.equal(r.custos, '', 'com a reserva quem chamou anota')
  assert.equal(JSON.parse(r.reservas).length, 1, 'quem chamou fecha a reserva dele')
})

test('trava: --reserva que nao existe, de outro processo ou ja usada para antes de subir o video', () => {
  const casos = [
    ['inexistente', ['--reserva', 'inventada'], reservaDe(process.pid), /a reserva inventada não existe/],
    ['sem id', ['--reserva'], reservaDe(process.pid), /faltou o id depois do --reserva/],
    ['de outro processo', ['--reserva', 'de-quem-chamou'], reservaDe(process.pid + 1), /não é do processo que chamou/],
    ['ja usada', ['--reserva', 'de-quem-chamou'], reservaDe(process.pid, { custo: true }), /já tem linha de custo/],
  ]
  for (const [nome, args, antes, motivo] of casos) {
    const r = rodar('ACTIVE', { args, antes, env: { ANALISE: 'ok' }, raiz: true })
    assert.equal(r.status, 3, `${nome}: ${r.stderr}`)
    assert.match(r.stderr, motivo, nome)
    assert.equal(r.chamadas, '', `${nome}: nada foi pra rede`)
  }
})

// Codex comum (5.52, chat 3): a conferencia nao marcava a reserva como usada, e dois filhos com o mesmo id passavam
test('trava: a mesma --reserva so vale uma vez; a segunda chamada para antes da rede', () => {
  const r = rodar('ACTIVE', { args: ['--reserva', 'de-quem-chamou'], antes: reservaDe(process.pid), env: { ANALISE: 'ok' }, raiz: true, vezes: 2 })
  const [primeira] = r.anteriores
  assert.equal(primeira.status, 0, primeira.stderr)
  assert.match(primeira.chamadas, /POST .*upload/, 'canario: a primeira foi pra rede')
  assert.equal(r.status, 3, r.stderr)
  assert.match(r.stderr, /a reserva de-quem-chamou já foi usada por outra chamada/)
  assert.equal(r.chamadas, '', 'a segunda nao foi pra rede')
})

// Codex comum (5.52, chat 3): modelo fora da tabela gravava usd null, a linha saia da soma e o saldo ficava inteiro
test('custo: modelo fora da tabela conta a estimativa da trava, marcada, e entra na soma do mes', () => {
  const r = rodar('ACTIVE', { args: ['--usd', '0.5', '--autorizado'], antes: (d) => projeto(d), env: { ANALISE: 'ok' }, modelo: 'gemini-flash-latest' })
  assert.equal(r.status, 0, r.stderr)
  const [linha] = r.custos.trim().split(NL).map((l) => JSON.parse(l))
  assert.equal(linha.modelo, 'gemini-flash-latest', 'canario: o modelo fora da tabela foi usado')
  assert.equal(linha.usd, 0.5, 'a linha leva a estimativa')
  assert.equal(linha.usd_estimado, true)
  assert.ok(linha.reserva, 'a linha leva a reserva')
  assert.deepEqual(JSON.parse(r.reservas), [], 'a reserva fechou com a linha')
})

// Codex comum (5.52, chat 3): a liberacao pela permissao que nao cobrou devolve o teto; a que cobrou, nao
test('permissao: upload que falha devolve o teto da permissao; analise cobrada nao devolve', () => {
  const falhou = rodar('FAILED', { args: ['--usd', '0.5'], antes: (d) => projeto(d, { autonomia: '1 USD mes' }) })
  assert.notEqual(falhou.status, 0)
  const linhas = falhou.permissao.trim().split(NL).map((l) => JSON.parse(l))
  assert.equal(linhas.length, 2, falhou.permissao)
  assert.equal(linhas[1].devolucao, true)
  assert.equal(linhas[1].reserva, linhas[0].reserva)
  const cobrou = rodar('ACTIVE', { args: ['--usd', '0.5'], antes: (d) => projeto(d, { autonomia: '1 USD mes' }), env: { ANALISE: 'ok' } })
  assert.equal(cobrou.status, 0, cobrou.stderr)
  assert.equal(cobrou.permissao.trim().split(NL).length, 1, 'cobranca de verdade nunca devolve')
})

// Codex final (5.52, chat 3): resposta sem usageMetadata devolvia o teto, mesmo com o corpo cortado. Depois que a
// analise saiu, a cobranca e incerta: a reserva fica aberta, o teto nao volta e o aviso sai
test('permissao: analise que saiu e voltou sem uso de tokens (200 sem usageMetadata, corpo cortado, conexao caida) nao devolve', () => {
  for (const analise of ['sem-uso', 'truncada', 'corte']) {
    const r = rodar('ACTIVE', { args: ['--usd', '0.5'], antes: (d) => projeto(d, { autonomia: '1 USD mes' }), env: { ANALISE: analise } })
    assert.match(r.chamadas, /POST .*generateContent/, `${analise}: canario, a analise foi pra rede`)
    assert.match(r.stderr, /Pode ter sido cobrada/, `${analise}: ${r.stderr}`)
    assert.match(r.stderr, /ficou aberta/, `${analise}: o aviso diz que a reserva ficou aberta`)
    assert.equal(r.custos, '', analise)
    const linhas = r.permissao.trim().split(NL).map((l) => JSON.parse(l))
    assert.equal(linhas.length, 1, `${analise}: o teto da permissao nao volta (${r.permissao})`)
    assert.equal(JSON.parse(r.reservas).length, 1, `${analise}: a reserva fica aberta`)
    if (analise !== 'sem-uso') assert.equal(r.status, 1, analise)
  }
  const corte = rodar('ACTIVE', { args: ['--usd', '0.5'], antes: (d) => projeto(d, { autonomia: '1 USD mes' }), env: { ANALISE: 'corte' } })
  assert.match(corte.stderr, /a chamada caiu antes da resposta \(socket caiu no meio do corpo\)/, 'a conexao caida vira erro da chamada')
})

test('trava: --sem-registro sozinho passa pela trava inteira e so tira a linha de custo', () => {
  const nada = rodar('ACTIVE', { args: ['--sem-registro'], env: { ANALISE: 'ok' } })
  assert.equal(nada.status, 3, nada.stderr)
  assert.match(nada.stderr, /parou: assistir com o Gemini é pago/, 'sem --usd nao gasta')
  assert.equal(nada.chamadas, '')
  // com orcamento do mes a trava reservaria: para, fecha a reserva e pede a do chamador
  const mes = rodar('ACTIVE', { args: ['--usd', '0.1', '--autorizado', '--sem-registro'], antes: (d) => projeto(d), env: { ANALISE: 'ok' } })
  assert.equal(mes.status, 3, mes.stderr)
  assert.match(mes.stderr, /o --sem-registro não vale/)
  assert.equal(mes.chamadas, '')
  assert.deepEqual(JSON.parse(mes.reservas), [], 'a reserva que a trava abriu fechou')
  // teto por lote (sem orcamento do mes), com o sim: assiste e nao anota (quem chamou anota)
  const lote = rodar('ACTIVE', { args: ['--usd', '0.1', '--autorizado', '--sem-registro'], env: { ANALISE: 'ok' } })
  assert.equal(lote.status, 0, lote.stderr)
  assert.equal(lote.custos, '')
})

test('trava: chamado direto, o --raiz nao vale (abriria a trava numa pasta com outra permissao)', () => {
  const r = rodar('ACTIVE', { args: ['--usd', '0.5'], antes: (d) => projeto(d, { autonomia: '1 USD mes' }), env: { ANALISE: 'ok' }, raiz: true })
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /o --raiz é só de script que já passou pela trava/)
  assert.equal(r.chamadas, '')
  assert.equal(r.permissao, '')
})

test('SKILL: nao ensina a IA a pular a trava', () => {
  const skill = fs.readFileSync(path.join(path.dirname(SCRIPT), 'SKILL.md'), 'utf8')
  assert.match(skill, /--sem-registro/, 'canario: a SKILL fala da opcao')
  assert.doesNotMatch(skill, /nem passa pela trava/)
  assert.match(skill, /a IA nunca usa essas opções/)
})

test('faxina: a copia no Gemini e apagada mesmo quando a chamada de analise cai', () => {
  const r = rodar('ACTIVE')
  assert.match(r.chamadas, /POST .*upload/, 'canario: o upload falso rodou')
  assert.match(r.stderr, /a chamada caiu/)
  assert.equal(r.status, 1)
  assert.match(r.chamadas, /DELETE .*files\/abc/, 'a copia no Gemini ficou pra tras')
})

test('faxina: a copia no Gemini e apagada mesmo quando o processamento do upload falha', () => {
  const r = rodar('FAILED')
  assert.match(r.chamadas, /POST .*upload/, 'canario: o upload falso rodou')
  assert.match(r.stderr, /nao conseguiu processar|não conseguiu processar/, 'canario: caiu no processamento')
  assert.notEqual(r.status, 0)
  assert.match(r.chamadas, /DELETE .*files\/abc/, 'a copia no Gemini ficou pra tras')
})
