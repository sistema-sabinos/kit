// Testes do gerador de cenario. Rodar: node --test gerar-cenario.test.mjs
// Codex e Gemini entram falsos: nenhum teste gasta cota nem dinheiro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { REGRAS, montarPrompt, cotaEstourou, escolherModeloImagem, estimar, viaCodex, viaGemini } from './gerar-cenario.mjs'
import { CAMINHO_ENV } from '../../mercado-livre/scripts/lib/env.mjs'
import { CAMINHO_CONFIG } from '../../mercado-livre/scripts/lib/config.mjs'

const RAIZ_FALSA = join('/home', 'aluno', 'loja')
const cenas = [
  { out: join(RAIZ_FALSA, 'anuncios', 'kit', 'cenarios', 'a.png'), descricao: 'bancada de madeira clara' },
  { out: join(RAIZ_FALSA, 'anuncios', 'kit', 'cenarios', 'b.png'), descricao: 'mesa de cozinha' },
]

test('REGRAS proibem produto, texto e pessoa, e pedem o centro vazio', () => {
  for (const t of ['produto', 'texto', 'pessoa', 'CENTRO']) assert.ok(REGRAS.includes(t), t)
})

test('montarPrompt lista cada cena com o caminho de barra normal e as regras', () => {
  const p = montarPrompt(cenas)
  assert.ok(p.includes(REGRAS))
  assert.ok(p.includes('CENA 1') && p.includes('CENA 2'))
  assert.ok(p.includes('mesa de cozinha'))
  assert.ok(!p.includes(String.fromCharCode(92)))
})

test('cotaEstourou reconhece limite de uso e ignora erro comum', () => {
  assert.equal(cotaEstourou("You've hit your usage limit. Try again later."), true)
  assert.equal(cotaEstourou('error 429 Too Many Requests'), true)
  assert.equal(cotaEstourou('arquivo nao encontrado'), false)
})

test('escolherModeloImagem prefere o flash de imagem mais novo e estavel', () => {
  const ids = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image', 'gemini-2.5-pro', 'imagen-4.0-generate-001']
  assert.equal(escolherModeloImagem(ids), 'gemini-3.1-flash-image')
  assert.equal(escolherModeloImagem(['gemini-3-pro-image-preview', 'gemini-2.5-pro']), 'gemini-3-pro-image-preview')
  assert.equal(escolherModeloImagem(['gemini-2.5-pro']), null)
})

test('estimar soma e confere o limite de gasto', () => {
  assert.deepEqual(estimar({ n: 4, precoUsd: 0.05, limiteUsd: 2 }), { total: 0.2, cabe: true })
  assert.deepEqual(estimar({ n: 50, precoUsd: 0.05, limiteUsd: 2 }), { total: 2.5, cabe: false })
})

test('viaCodex: sandbox de escrita, pasta do projeto, prompt no stdin; confere o disco', async () => {
  const vistos = []
  let gerado = false
  const r = await viaCodex(cenas, {
    raiz: RAIZ_FALSA,
    executar: (cmd, args, op) => { vistos.push({ cmd, args, op }); gerado = true; return { status: 0, stdout: 'ok', stderr: '' } },
    carimbo: (p) => (p === cenas[0].out && gerado) ? 1 : null,
  })
  assert.deepEqual(vistos[0].args, ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-'])
  assert.equal(vistos[0].op.cwd, RAIZ_FALSA)
  assert.ok(vistos[0].op.input.includes('bancada de madeira clara'))
  assert.deepEqual(r.geradas, [cenas[0].out])
  assert.deepEqual(r.faltaram, [cenas[1].out])
  assert.equal(r.cota_estourada, false)
  assert.equal(r.custo_usd, 0)
})

test('viaCodex: cota estourada aparece no resultado', async () => {
  const r = await viaCodex(cenas, { raiz: RAIZ_FALSA, executar: () => ({ status: 1, stdout: '', stderr: 'usage limit reached' }), carimbo: () => null })
  assert.equal(r.cota_estourada, true)
  assert.equal(r.faltaram.length, 2)
})

test('viaCodex recusa saida fora da pasta do projeto antes de chamar', async () => {
  let chamou = false
  await assert.rejects(viaCodex([{ out: join('/home', 'outro', 'x.png'), descricao: 'x' }], { raiz: RAIZ_FALSA, executar: () => { chamou = true }, carimbo: () => null }), /dentro da pasta do projeto/)
  assert.equal(chamou, false)
})

test('viaCodex: arquivo que ja existia antes e nao mudou de carimbo conta como nao gerado, mesmo presente no disco', async () => {
  const r = await viaCodex(cenas, {
    raiz: RAIZ_FALSA,
    executar: () => ({ status: 1, stdout: '', stderr: 'usage limit reached' }),
    carimbo: (p) => p === cenas[0].out ? 1000 : null,
  })
  assert.deepEqual(r.faltaram, [cenas[0].out, cenas[1].out])
  assert.deepEqual(r.geradas, [])
  assert.equal(r.cota_estourada, true)
})

function geminiFalso({ respostas }) {
  const urls = []
  const fila = [...respostas]
  const buscar = async (url) => {
    urls.push(url)
    if (url.includes('/models?')) return { status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] }] }) }
    const r = fila.shift()
    return { status: r.status, json: async () => r.corpo }
  }
  return { buscar, urls }
}
const comImagem = { status: 200, corpo: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('png').toString('base64') } }] } }] } }

test('viaGemini: escolhe o modelo pela lista, grava, registra custo por imagem', async () => {
  const { buscar, urls } = geminiFalso({ respostas: [comImagem, comImagem] })
  const gravados = []
  const custos = []
  const r = await viaGemini(cenas, { chave: 'k', precoUsd: 0.05, contexto: 'designer kit', buscar, gravar: (p, b) => gravados.push([p, b.toString()]), registrarCusto: (c) => custos.push(c), esperar: async () => {} })
  assert.equal(r.modelo, 'gemini-3.1-flash-image')
  assert.ok(urls[1].includes('models/gemini-3.1-flash-image:generateContent'))
  assert.equal(gravados.length, 2)
  assert.equal(gravados[0][1], 'png')
  assert.equal(custos.length, 2)
  assert.deepEqual(Object.keys(custos[0]).sort(), ['contexto', 'em', 'servico', 'usd'])
  assert.equal(custos[0].servico, 'gemini-imagem')
  assert.equal(r.custo_usd, 0.1)
})

test('viaGemini: 429 espera e tenta de novo; resposta sem imagem nao cobra', async () => {
  const semImagem = { status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'nao consigo' }] } }] } }
  const { buscar } = geminiFalso({ respostas: [{ status: 429, corpo: {} }, comImagem, semImagem] })
  const esperas = []
  const custos = []
  const r = await viaGemini(cenas, { chave: 'k', precoUsd: 0.05, contexto: 'x', buscar, gravar: () => {}, registrarCusto: (c) => custos.push(c), esperar: async (ms) => esperas.push(ms) })
  assert.equal(esperas.length, 1)
  assert.deepEqual(r.geradas, [cenas[0].out])
  assert.deepEqual(r.faltaram, [cenas[1].out])
  assert.equal(custos.length, 1)
})

test('viaGemini: erro no meio do lote nao perde o que ja foi gerado e pago, e a funcao nao rejeita', async () => {
  let chamadasGenerate = 0
  const buscar = async (url) => {
    if (url.includes('/models?')) return { status: 200, json: async () => ({ models: [{ name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] }] }) }
    chamadasGenerate++
    if (chamadasGenerate === 2) throw new Error('rede caiu no meio do lote')
    return { status: 200, json: async () => comImagem.corpo }
  }
  const custos = []
  const original = console.error
  const erros = []
  console.error = (...a) => erros.push(a.join(' '))
  try {
    const r = await viaGemini(cenas, { chave: 'k', precoUsd: 0.05, contexto: 'x', buscar, gravar: () => {}, registrarCusto: (c) => custos.push(c), esperar: async () => {} })
    assert.deepEqual(r.geradas, [cenas[0].out])
    assert.deepEqual(r.faltaram, [cenas[1].out])
    assert.equal(custos.length, 1)
    assert.ok(erros.some(l => l.includes(cenas[1].out) && l.includes('rede caiu no meio do lote')))
  } finally {
    console.error = original
  }
})

test('viaGemini: falha ao registrar o custo nao devolve a imagem ja gerada e paga pra fila', async () => {
  const { buscar } = geminiFalso({ respostas: [comImagem, comImagem] })
  const gravados = []
  const original = console.error
  const erros = []
  console.error = (...a) => erros.push(a.join(' '))
  try {
    const r = await viaGemini(cenas, {
      chave: 'k', precoUsd: 0.05, contexto: 'x', buscar,
      gravar: (p, b) => gravados.push([p, b.toString()]),
      registrarCusto: () => { throw new Error('disco cheio') },
      esperar: async () => {},
    })
    assert.deepEqual(r.geradas, [cenas[0].out, cenas[1].out])
    assert.deepEqual(r.faltaram, [])
    assert.equal(gravados.length, 2)
    assert.equal(r.custo_usd, 0.1)
    assert.ok(erros.some(l => l.includes(cenas[0].out) && l.includes('disco cheio')))
  } finally {
    console.error = original
  }
})

test('viaGemini: resposta paga que nao consegue ser salva ainda registra o custo e avisa', async () => {
  const { buscar } = geminiFalso({ respostas: [comImagem, comImagem] })
  const custos = []
  const original = console.error
  const erros = []
  console.error = (...a) => erros.push(a.join(' '))
  try {
    const r = await viaGemini(cenas, {
      chave: 'k', precoUsd: 0.05, contexto: 'x', buscar,
      gravar: (p) => { if (p === cenas[0].out) throw new Error('sem permissao na pasta') },
      registrarCusto: (c) => custos.push(c),
      esperar: async () => {},
    })
    assert.deepEqual(r.faltaram, [cenas[0].out])
    assert.deepEqual(r.geradas, [cenas[1].out])
    assert.equal(custos.length, 2)
    assert.equal(r.custo_usd, 0.1)
    assert.ok(erros.some(l => l.includes(cenas[0].out) && l.includes('paga') && l.includes('sem permissao na pasta')))
  } finally {
    console.error = original
  }
})

test('viaGemini: resposta fora do 200 fala o status e a mensagem da API', async () => {
  const negado = { status: 403, corpo: { error: { message: 'API key not valid' } } }
  const { buscar } = geminiFalso({ respostas: [negado, { status: 400, corpo: {} }] })
  const original = console.error
  const erros = []
  console.error = (...a) => erros.push(a.join(' '))
  try {
    const r = await viaGemini(cenas, { chave: 'k', precoUsd: 0.05, contexto: 'x', buscar, gravar: () => {}, registrarCusto: () => {}, esperar: async () => {} })
    assert.deepEqual(r.faltaram, [cenas[0].out, cenas[1].out])
    assert.ok(erros.length > 0, 'nenhuma linha de erro saiu')
    assert.ok(erros.some(l => l.includes(`[gemini] ${cenas[0].out}: HTTP 403`) && l.includes('API key not valid')))
    assert.ok(erros.some(l => l.includes(`[gemini] ${cenas[1].out}: HTTP 400`)))
  } finally {
    console.error = original
  }
})

// A casca de linha de comando e a trava do dinheiro: os testes abaixo rodam o script de
// verdade, sem chave, e provam a ordem das travas (limite e "pode ir" antes da chave, chave
// antes da rede). Dentro do kit nao pode existir .env nem configuracao do aluno.
const SCRIPT = fileURLToPath(new URL('./gerar-cenario.mjs', import.meta.url))

function rodarCli(args, n) {
  if (existsSync(CAMINHO_ENV)) assert.fail(`existe um .env em ${CAMINHO_ENV}: este teste nao roda com chave de verdade por perto. Tire o arquivo e rode de novo.`)
  if (existsSync(CAMINHO_CONFIG)) assert.fail(`existe ${CAMINHO_CONFIG}: o teste precisa do limite padrao de 2 dolares. Tire o arquivo e rode de novo.`)
  const pasta = mkdtempSync(join(tmpdir(), 'gerar-cenario-cli-'))
  try {
    const lista = Array.from({ length: n }, (_, i) => ({ out: join(pasta, `c${i}.png`), descricao: 'bancada clara' }))
    const arquivo = join(pasta, 'cenas.json')
    writeFileSync(arquivo, JSON.stringify(lista))
    const env = { ...process.env }
    delete env.GEMINI_API_KEY
    const r = spawnSync(process.execPath, [SCRIPT, '--degrau', 'gemini', '--cenas', arquivo, ...args], { cwd: pasta, env, encoding: 'utf8', timeout: 30000 })
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}

test('CLI gemini: sem --autorizado para com saida 3 antes de gastar', () => {
  const r = rodarCli(['--preco-usd', '0.05'], 1)
  assert.equal(r.status, 3, r.stderr)
  assert.ok(r.stdout.trim().length > 0, 'saida vazia')
  const j = JSON.parse(r.stdout)
  assert.ok(j.parou && j.parou.includes('pode ir'))
  assert.equal(j.estimativa_usd, 0.05)
})

test('CLI gemini: acima do limite para com saida 3 mesmo autorizado, antes de olhar a chave', () => {
  const r = rodarCli(['--preco-usd', '1', '--autorizado'], 5)
  assert.equal(r.status, 3, r.stderr)
  assert.ok(r.stdout.trim().length > 0, 'saida vazia')
  const j = JSON.parse(r.stdout)
  assert.ok(j.parou && j.parou.includes('limite_gasto_usd'))
  assert.equal(j.estimativa_usd, 5)
  assert.ok(!r.stderr.includes('GEMINI_API_KEY'))
})

test('CLI gemini: dentro do limite e autorizado, sem chave, sai 2 sem chamar a rede', () => {
  const r = rodarCli(['--preco-usd', '0.05', '--autorizado'], 1)
  assert.equal(r.status, 2, r.stderr)
  assert.ok(r.stderr.includes('falta GEMINI_API_KEY'))
  assert.equal(r.stdout.trim(), '')
})
