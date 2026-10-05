// Teste do gerador de clipe (Veo). Troca o fetch inteiro (sem rede, sem gasto) e
// injeta um espiao no lugar do registro de custos, entao nada toca em dados/ real.
// Arquivos de teste vivem num mkdtemp apagado no fim. O que importa aqui: cada
// desfecho grava UMA linha com o preco do dia, ou nenhuma quando a API diz que
// nao cobrou.
// Roda com: node --test clipe.test.mjs
import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// carregarChave() olha GEMINI_API_KEY antes de qualquer arquivo.
delete process.env.GEMINI_SEM_API // o fetch e falso: a trava dura nao pode quebrar a suite
process.env['GEMINI_API' + '_KEY'] = 'chave-de-teste-fake'

const { gerarClipe, TIERS, tierDoBloco } = await import('./clipe.mjs')

const MODELOS_FAKE = {
  models: [{ name: 'models/veo-3.1-lite-generate-preview', supportedGenerationMethods: ['predictLongRunning'] }],
}
const PRECO = 0.05

let linhas
let pasta
let fetchOriginal
const espiao = (l) => { linhas.push(l); return true }

beforeEach(() => {
  linhas = []
  pasta = fs.mkdtempSync(join(tmpdir(), 'clipe-teste-'))
  fetchOriginal = global.fetch
  mock.timers.enable({ apis: ['setTimeout'] })
})

afterEach(() => {
  mock.restoreAll()
  mock.timers.reset()
  global.fetch = fetchOriginal
  fs.rmSync(pasta, { recursive: true, force: true })
})

function respostaFalsa({ ok = true, status = 200, json = null, contentType = null, bytes = null }) {
  return {
    ok, status,
    json: async () => json,
    headers: { get: () => contentType },
    arrayBuffer: async () => (bytes ? bytes.buffer : new ArrayBuffer(0)),
  }
}

// Fetch falso das 4 chamadas do gerarClipe: listar modelo, abrir operacao, checar
// operacao (poll) e baixar o video. `poll` pode ser funcao, pra o teste espiar o
// que existe em disco no meio do polling.
function instalarFetchFalso({ poll, download }) {
  global.fetch = async (url) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    if (url.includes(':predictLongRunning')) return respostaFalsa({ json: { name: 'operations/teste-123' } })
    if (url.includes('/operations/teste-123')) return respostaFalsa({ json: typeof poll === 'function' ? poll() : poll })
    if (url.includes('video-fake.mp4')) return download
    throw new Error(`fetch falso sem resposta programada pra: ${url}`)
  }
}

// O polling usa setTimeout(10 s). Com os timers mockados, avanca o relogio e cede o
// loop de eventos ate a promessa assentar (cobre os 60 ciclos do timeout real).
async function aguardar(promise) {
  let assentou = false
  promise.then(() => { assentou = true }, () => { assentou = true })
  for (let i = 0; i < 80 && !assentou; i++) {
    mock.timers.tick(10000)
    await new Promise((r) => setImmediate(r))
  }
  return promise
}

const saida = () => join(pasta, 'clipe-fake.mp4')
const base = () => ({ prompt: 'teste', segundos: 8, saida: saida(), precoUsdPorSegundo: PRECO, registrarCusto: espiao, contexto: 'video-produto slug-teste bloco-1', pastaVideo: pasta })
const arquivoOps = () => join(pasta, '_operacoes-abertas.json')
const POLL_COM_VIDEO = { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://example.com/video-fake.mp4' } }] } } }

test('sucesso de 8 s a 0,05 por segundo grava UMA linha de 0,4 com status=sucesso', async () => {
  instalarFetchFalso({
    poll: POLL_COM_VIDEO,
    download: respostaFalsa({ contentType: 'video/mp4', bytes: new Uint8Array(60_000).fill(7) }),
  })
  const resultado = await aguardar(gerarClipe(base()))

  assert.equal(resultado.arquivo, saida())
  assert.equal(resultado.custoUsd, 0.4)
  assert.equal(linhas.length, 1, 'uma cobranca, uma linha: nada de linha aberta somando em dobro')
  assert.equal(linhas[0].servico, 'gemini-video')
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=sucesso/)
  assert.match(linhas[0].contexto, /op=operations\/teste-123/)
  assert.match(linhas[0].contexto, /video-produto slug-teste bloco-1/)
  assert.equal(fs.statSync(saida()).size, 60_000)
})

test('geracao filtrada (sem video) grava uma linha com o custo e estoura erro', async () => {
  instalarFetchFalso({
    poll: { done: true, response: { generateVideoResponse: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ['teste'] } } },
  })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Veo terminou sem video/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=filtrada/)
  assert.equal(fs.existsSync(saida()), false, 'nao teve video, nao pode ter arquivo')
})

test('download com 403 grava falha_download com custo e nao escreve o .mp4', async () => {
  instalarFetchFalso({
    poll: POLL_COM_VIDEO,
    download: respostaFalsa({ ok: false, status: 403, contentType: 'text/html', bytes: Buffer.from('<html>Forbidden</html>') }),
  })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Download do video nao parece valido/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=falha_download/)
  assert.equal(fs.existsSync(saida()), false)
})

test('download 200 com corpo pequeno demais tambem vira falha_download', async () => {
  instalarFetchFalso({
    poll: POLL_COM_VIDEO,
    download: respostaFalsa({ contentType: 'video/mp4', bytes: new Uint8Array(200) }),
  })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Download do video nao parece valido/)

  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=falha_download/)
  assert.equal(fs.existsSync(saida()), false)
})

test('falha_operacao (st.error) grava uma linha com "cobranca incerta"', async () => {
  instalarFetchFalso({ poll: { error: { message: 'quebrou' } } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Veo falhou/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=falha_operacao/)
  assert.match(linhas[0].contexto, /cobranca incerta/)
})

test('timeout do polling grava uma linha com "cobranca incerta"', async () => {
  instalarFetchFalso({ poll: { done: false } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Veo nao terminou em 10 minutos/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=timeout/)
  assert.match(linhas[0].contexto, /cobranca incerta/)
})

test('falha_transitoria nao grava nada e tenta de novo; a repeticao que da certo grava uma linha so', async () => {
  let polls = 0
  instalarFetchFalso({
    poll: () => (++polls === 1
      ? { done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['We encountered an issue with the audio for your prompt. You have not been charged for this attempt.'] } } }
      : POLL_COM_VIDEO),
    download: respostaFalsa({ contentType: 'video/mp4', bytes: new Uint8Array(60_000).fill(7) }),
  })
  const resultado = await aguardar(gerarClipe(base()))

  assert.equal(polls, 2, 'tinha que ter tentado duas vezes')
  assert.equal(resultado.custoUsd, 0.4)
  assert.equal(linhas.length, 1, 'a tentativa nao cobrada nao pode virar linha')
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('falha_transitoria em todas as tentativas estoura sem gravar linha nenhuma', async () => {
  instalarFetchFalso({
    poll: { done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ['issue with the audio'] } } },
  })
  await assert.rejects(() => aguardar(gerarClipe(base())), /4x a falha transitoria/)
  assert.equal(linhas.length, 0)
  assert.equal(fs.existsSync(arquivoOps()), false, 'operacao encerrada nao fica pendurada')
})

test('a operacao aberta aparece em _operacoes-abertas.json durante o polling e some no desfecho', async () => {
  let vistoNoPolling = null
  instalarFetchFalso({
    poll: () => {
      vistoNoPolling = JSON.parse(fs.readFileSync(arquivoOps(), 'utf8'))
      return POLL_COM_VIDEO
    },
    download: respostaFalsa({ contentType: 'video/mp4', bytes: new Uint8Array(60_000).fill(7) }),
  })
  await aguardar(gerarClipe(base()))

  assert.deepEqual(vistoNoPolling, ['operations/teste-123'])
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('operacao que estoura no meio (timeout) tambem sai de _operacoes-abertas.json', async () => {
  instalarFetchFalso({ poll: { done: false } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Veo nao terminou/)
  assert.equal(fs.existsSync(arquivoOps()), false)
})

// Cobranca que nao pode sumir: erro de transporte no polling nao e desfecho.
const download60k = () => respostaFalsa({ contentType: 'video/mp4', bytes: new Uint8Array(60_000).fill(7) })

// fetch falso em que o poll se comporta como `pollN(n)` (n = numero da chamada)
function fetchComPoll(pollN) {
  let polls = 0
  global.fetch = async (url) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    if (url.includes(':predictLongRunning')) return respostaFalsa({ json: { name: 'operations/teste-123' } })
    if (url.includes('/operations/teste-123')) return pollN(++polls)
    if (url.includes('video-fake.mp4')) return download60k()
    throw new Error(`sem resposta: ${url}`)
  }
}

test('poll que lanca erro de rede uma vez e depois da sucesso: segue e grava UMA linha de sucesso', async () => {
  fetchComPoll((n) => { if (n === 1) throw new Error('rede caiu'); return respostaFalsa({ json: POLL_COM_VIDEO }) })
  await aguardar(gerarClipe(base()))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('poll 503 com HTML (json invalido) uma vez: segue, sem falha_operacao', async () => {
  fetchComPoll((n) => (n === 1
    ? { ok: false, status: 503, json: async () => { throw new SyntaxError('Unexpected token <') } }
    : respostaFalsa({ json: POLL_COM_VIDEO })))
  await aguardar(gerarClipe(base()))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('poll 429 com JSON de erro uma vez e depois sucesso: nada de falha_operacao', async () => {
  fetchComPoll((n) => (n === 1
    ? respostaFalsa({ ok: false, status: 429, json: { error: { code: 429, message: 'limite' } } })
    : respostaFalsa({ json: POLL_COM_VIDEO })))
  await aguardar(gerarClipe(base()))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
  assert.doesNotMatch(linhas[0].contexto, /falha_operacao/)
})

test('poll 200 com JSON null uma vez: tentativa perdida, segue e grava UMA linha de sucesso', async () => {
  fetchComPoll((n) => respostaFalsa({ json: n === 1 ? null : POLL_COM_VIDEO }))
  await aguardar(gerarClipe(base()))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('poll que sempre falha por transporte cai no timeout com cobranca incerta', async () => {
  fetchComPoll(() => { throw new Error('rede caiu') })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Veo nao terminou/)
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=timeout/)
  assert.match(linhas[0].contexto, /cobranca incerta/)
})

test('download que lanca (arrayBuffer) grava UMA linha falha_download e limpa a operacao', async () => {
  instalarFetchFalso({ poll: POLL_COM_VIDEO, download: { ok: true, status: 200, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => { throw new Error('conexao cortada') } } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Download do video/)
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=falha_download/)
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('writeFileSync do mp4 falhando nao perde a cobranca: a linha de sucesso ja foi gravada', async () => {
  instalarFetchFalso({ poll: POLL_COM_VIDEO, download: download60k() })
  const alvo = join(pasta, 'pasta-que-nao-existe', 'clipe.mp4')
  await assert.rejects(() => aguardar(gerarClipe({ ...base(), saida: alvo })))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('sem preco do dia nao chama nada: estoura antes de qualquer fetch', async () => {
  global.fetch = async (url) => { throw new Error(`sem preco nao pode chamar fetch, chamou: ${url}`) }
  await assert.rejects(() => gerarClipe({ ...base(), precoUsdPorSegundo: undefined }), /preco do dia/)
  assert.equal(linhas.length, 0)
})

test('dry-run nao toca em fetch nem no registro de custos', async () => {
  global.fetch = async (url) => { throw new Error(`dry-run nao pode chamar fetch, chamou: ${url}`) }
  const resultado = await gerarClipe({ ...base(), dryRun: true })
  assert.equal(resultado.arquivo, null)
  assert.equal(resultado.custoUsd, 0)
  assert.equal(linhas.length, 0)
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('produto e pessoa vao de Lite; tipo desconhecido tambem cai no Lite', () => {
  assert.equal(tierDoBloco({ tipo: 'produto' }), 'lite')
  assert.equal(tierDoBloco({ tipo: 'pessoa' }), 'lite')
  assert.equal(tierDoBloco({ tipo: 'sei-la' }), 'lite')
  assert.equal(tierDoBloco(undefined), 'lite')
})

test('cada tier casa com o modelo certo e so com ele, e o preco nao mora no codigo', () => {
  assert.ok(TIERS.fast.padrao.test('veo-3.1-fast-generate-preview'))
  assert.ok(!TIERS.fast.padrao.test('veo-3.1-lite-generate-preview'))
  assert.ok(TIERS.lite.padrao.test('veo-3.1-lite-generate-preview'))
  assert.ok(!TIERS.lite.padrao.test('veo-3.1-fast-generate-preview'))
  assert.ok(!TIERS.fast.padrao.test('veo-3.1-generate-preview'))
  assert.ok(!TIERS.lite.padrao.test('veo-3.1-generate-preview'))
  for (const t of Object.values(TIERS)) assert.equal(t.usdPorSegundo, undefined)
})
