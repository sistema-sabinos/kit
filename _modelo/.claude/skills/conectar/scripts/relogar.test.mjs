// Testes do relogar.mjs pela linha de comando, sem Chrome: tudo o que eles provam acontece antes
// de abrir o navegador, ou no perfil que nao existe (o relogar so abre perfil que ja existe).
// O .env, a raiz e a receita moram em pastas temporarias fora de repositorio.
// Rodar: node --test relogar.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'relogar.mjs')

// iscas montadas em pedacos
const ISCA = { usuario: ['vend', 'edor@', 'x.com'].join(''), senha: ['Se', 'nha', '-9', '!q'].join(''), semente: ['JBSW', 'Y3DP', 'EHPK', '3PXP'].join('') }
const tres = `ML_USUARIO=${ISCA.usuario}\nML_SENHA=${ISCA.senha}\nML_TOTP=${ISCA.semente}\n`
const RECEITA = { conta: 'ML', host: 'loja.exemplo', sessao: '/entrar', passos: [{ campo: 'usuario', seletor: '#u' }, { clicar: '#ok' }] }

const saidas = []
function rodar(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60_000 })
  saidas.push(r.stdout + r.stderr)
  return r
}

function comPasta(fn) {
  const t = mkdtempSync(join(tmpdir(), 'relogar-'))
  try { return fn(t) } finally { rmSync(t, { recursive: true, force: true }) }
}

test('--env dentro de repositorio git sai 2 sem ler, ate com o arquivo ausente', () => comPasta(t => {
  const repo = join(t, 'repo')
  mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0, 'canario: o git init rodou')
  writeFileSync(join(repo, '.env'), tres)
  for (const env of [join(repo, '.env'), join(repo, 'nao-existe.env')]) {
    const r = rodar('ML', '--raiz', t, '--env', env)
    assert.equal(r.status, 2, r.stderr)
    assert.equal(r.stdout, '')
    assert.match(r.stderr, /recusa arquivo dentro de repositorio/)
  }
}))

test('--env le o arquivo dado, nao o .env da raiz', () => comPasta(t => {
  writeFileSync(join(t, '.env'), tres)
  const fora = join(t, 'prova')
  mkdirSync(fora)
  writeFileSync(join(fora, '.env'), `ML_USUARIO=${ISCA.usuario}\nML_SENHA=${ISCA.senha}\n`)
  const r = rodar('ML', '--raiz', t, '--env', join(fora, '.env'))
  assert.equal(r.status, 1)
  assert.equal(r.stdout, 'falta-variavel\n')
  assert.match(r.stderr, /ML_TOTP/)
}))

test('--raiz leva ao .env dela, e sem --receita a conta fora da lista da sem-receita sem abrir Chrome', () => comPasta(t => {
  writeFileSync(join(t, '.env'), tres.replace(/^ML_/gm, 'LOJA_'))
  const r = rodar('LOJA', '--raiz', t)
  assert.equal(r.status, 1, r.stderr)
  assert.equal(r.stdout, 'sem-receita\n')
  const vazia = rodar('LOJA', '--raiz', join(t, 'outra'))
  assert.equal(vazia.stdout, 'falta-variavel\n', 'canario: raiz sem .env da falta-variavel')
}))

test('--receita le o arquivo dado: quebrado ou invalido sai 2', () => comPasta(t => {
  writeFileSync(join(t, '.env'), tres)
  writeFileSync(join(t, 'quebrada.json'), '{')
  writeFileSync(join(t, 'invalida.json'), JSON.stringify({ ...RECEITA, passos: [{ campo: 'cpf', seletor: '#x' }] }))
  const q = rodar('ML', '--raiz', t, '--receita', join(t, 'quebrada.json'))
  assert.equal(q.status, 2)
  assert.match(q.stderr, /quebrada\.json/)
  const i = rodar('ML', '--raiz', t, '--receita', join(t, 'invalida.json'))
  assert.equal(i.status, 2)
  assert.match(i.stderr, /receita invalida: passo com campo/)
}))

test('--receita valida com a raiz sem perfil para em falhou, sem criar perfil', () => comPasta(t => {
  writeFileSync(join(t, '.env'), tres)
  writeFileSync(join(t, 'receita.json'), JSON.stringify(RECEITA))
  const r = rodar('ML', '--raiz', t, '--receita', join(t, 'receita.json'))
  assert.equal(r.status, 1, r.stderr)
  assert.equal(r.stdout, 'falhou\n')
  assert.ok(r.stderr.includes(join(t, 'dados', 'chrome-perfil')), `o recado cita o perfil da --raiz: ${r.stderr}`)
  assert.ok(!existsSync(join(t, 'dados')), 'o relogar nao criou perfil')
}))

test('--receita de outra conta sai 2', () => comPasta(t => {
  writeFileSync(join(t, '.env'), tres)
  writeFileSync(join(t, 'receita.json'), JSON.stringify({ ...RECEITA, conta: 'LOJA' }))
  const r = rodar('ML', '--raiz', t, '--receita', join(t, 'receita.json'))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /da conta LOJA, nao de ML/)
}))

// Chrome de mentira: responde o /json/version com o guid da sentinela do perfil (a lib confere e
// nao abre Chrome nenhum), lista zero abas e recusa aba nova; quem passar da trava da janela
// termina em falhou por falta de aba. Roda com spawn assincrono, pra o servidor responder enquanto o script roda.
test('relogin ha menos da janela, marcado no perfil, para em falhou antes de usar o Chrome', async () => {
  const t = mkdtempSync(join(tmpdir(), 'relogar-'))
  const pedidos = []
  const s = createServer((req, res) => {
    pedidos.push(req.url)
    const porta = s.address().port
    if (req.url === '/json/version') return res.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${porta}/devtools/browser/guid-falso` }))
    if (req.url === '/json/list') return res.end('[]')
    res.statusCode = 404
    res.end()
  })
  await new Promise(r => s.listen(0, '127.0.0.1', r))
  const rodarAssincrono = (...args) => new Promise(ok => {
    const f = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    f.stdout.on('data', d => { stdout += d })
    f.stderr.on('data', d => { stderr += d })
    f.on('close', status => { saidas.push(stdout + stderr); ok({ status, stdout, stderr }) })
  })
  try {
    writeFileSync(join(t, '.env'), tres)
    writeFileSync(join(t, 'receita.json'), JSON.stringify(RECEITA))
    const perfil = join(t, 'dados', 'chrome-perfil')
    mkdirSync(perfil, { recursive: true })
    writeFileSync(join(perfil, '.sabinos-porta.json'), JSON.stringify({ porta: s.address().port, guid: 'guid-falso', perfil }))
    writeFileSync(join(perfil, '.sabinos-relogin.json'), JSON.stringify({ ML: Date.now() - 60_000 }))
    const r = await rodarAssincrono('ML', '--raiz', t, '--receita', join(t, 'receita.json'))
    assert.equal(r.stdout, 'falhou\n', r.stderr)
    assert.match(r.stderr, /caiu de novo menos de 10 minutos/)
    writeFileSync(join(perfil, '.sabinos-relogin.json'), JSON.stringify({ LOJA: Date.now() }))
    const outra = await rodarAssincrono('ML', '--raiz', t, '--receita', join(t, 'receita.json'))
    assert.equal(outra.stdout, 'falhou\n', `canario: sem marca da conta, passa da trava e chega no Chrome de mentira: ${outra.stderr}`)
    assert.match(outra.stderr, /nenhuma aba do Chrome dedicado/)
    // outro relogin da mesma conta no meio: a trava exclusiva segura o segundo antes da marca
    const trava = join(perfil, '.sabinos-relogin-trava-ML')
    writeFileSync(trava, String(Date.now()))
    const junto = await rodarAssincrono('ML', '--raiz', t, '--receita', join(t, 'receita.json'))
    assert.equal(junto.stdout, 'falhou\n', junto.stderr)
    assert.match(junto.stderr, /outro relogin de ML esta rodando/)
    assert.ok(existsSync(trava), 'a trava do outro processo fica')
    // trava de processo que morreu ha mais da janela sai, e o relogar solta a dele no fim
    writeFileSync(trava, String(Date.now() - 11 * 60_000))
    const velha = await rodarAssincrono('ML', '--raiz', t, '--receita', join(t, 'receita.json'))
    assert.match(velha.stderr, /nenhuma aba do Chrome dedicado/, 'canario: a trava velha nao segurou')
    assert.ok(!existsSync(trava), 'o relogar soltou a trava ao sair')
    // sem --receita e sem aba do site, abre a entrada da receita da conta (a do ML, da lista)
    pedidos.length = 0
    const daLista = await rodarAssincrono('ML', '--raiz', t)
    assert.match(daLista.stderr, /nenhuma aba do Chrome dedicado/, daLista.stderr)
    assert.ok(pedidos.includes('/json/new?https://www.mercadolivre.com.br/login/identification'), `pediu a aba da entrada: ${pedidos.join(' ')}`)
  } finally {
    await new Promise(r => s.close(r))
    rmSync(t, { recursive: true, force: true })
  }
})

test('conta fora do formato sai 2', () => {
  for (const conta of ['ml', 'ML-X', '']) assert.equal(rodar(conta).status, 2, conta)
})

test('nenhum valor do .env aparece em stdout ou stderr de nenhuma das rodadas', () => {
  assert.ok(saidas.length >= 8, `canario: ${saidas.length} rodadas guardadas`)
  // canario: a mesma busca, nas mesmas saidas com um vazamento plantado, acha cada isca
  for (const v of Object.values(ISCA)) assert.ok([...saidas, `vazou ${v}`].join('').includes(v), 'canario: a busca da isca casa')
  const tudo = saidas.join('')
  for (const v of Object.values(ISCA)) assert.ok(!tudo.includes(v), 'valor do .env na saida')
})
