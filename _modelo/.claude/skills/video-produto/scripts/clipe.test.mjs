// Teste do gerador de clipe (Omni Flash). Troca o fetch inteiro (sem rede, sem gasto) e
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
import { spawnSync } from 'node:child_process'

// carregarChave() olha GEMINI_API_KEY antes de qualquer arquivo.
delete process.env.GEMINI_SEM_API // o fetch e falso: a trava dura nao pode quebrar a suite
process.env['GEMINI_API' + '_KEY'] = 'chave-de-teste-fake'

const { gerarClipe, MODELO_CLIPE } = await import('./clipe.mjs')

// Formato real do ListModels (chave de verdade, 2026-10-20): o Omni sai com
// generateContent, e os Veo 3.1 ainda aparecem ate desligar.
const MODELOS_FAKE = {
  models: [
    { name: 'models/veo-3.1-lite-generate-preview', supportedGenerationMethods: ['predictLongRunning'] },
    { name: 'models/gemini-omni-1.1-flash', version: '001', displayName: 'Gemini Omni 1.1 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
  ],
}
const PRECO = 0.05
const ID = 'v1_teste-123'

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

function respostaFalsa({ ok = true, status = 200, json = null }) {
  return { ok, status, json: async () => json }
}

const VIDEO_B64 = Buffer.from(new Uint8Array(60_000).fill(7)).toString('base64')
const comVideo = ({ data = VIDEO_B64, mime_type = 'video/mp4' } = {}) => ({
  id: ID, status: 'completed', usage: { total_output_tokens: 46336 },
  steps: [
    { type: 'user_input', content: [{ type: 'text', text: 'teste' }] },
    { type: 'thought', content: [{ type: 'thought', text: '...' }] },
    { type: 'model_output', content: [{ type: 'video', mime_type, data }] },
  ],
})
const POLL_COM_VIDEO = comVideo()

// Fetch falso das 3 chamadas do gerarClipe: listar modelo, criar a geracao e
// perguntar por ela (poll). `poll` pode ser funcao, pra o teste espiar o que
// existe em disco no meio do polling. `corpos` guarda o que foi pedido na criacao.
function instalarFetchFalso({ poll, criacao } = {}) {
  const corpos = []
  global.fetch = async (url, init = {}) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    if (url.endsWith('/interactions') && init.method === 'POST') {
      corpos.push({ corpo: JSON.parse(init.body), headers: init.headers })
      return criacao ?? respostaFalsa({ json: { id: ID, status: 'in_progress' } })
    }
    if (url.endsWith(`/interactions/${ID}`)) return respostaFalsa({ json: typeof poll === 'function' ? poll() : poll })
    throw new Error(`fetch falso sem resposta programada pra: ${url}`)
  }
  return corpos
}

// O polling usa setTimeout(10 s). Com os timers mockados, avanca o relogio e cede o
// loop de eventos ate a promessa assentar (cobre os 60 ciclos do timeout real). O teto
// e alto porque o preparo da foto chama o ffmpeg de verdade: as voltas seguem girando
// (o setImmediate deixa o I/O do filho andar) ate o polling comecar.
async function aguardar(promise) {
  let assentou = false
  promise.then(() => { assentou = true }, () => { assentou = true })
  for (let i = 0; i < 200_000 && !assentou; i++) {
    mock.timers.tick(10000)
    await new Promise((r) => setImmediate(r))
  }
  return promise
}

const saida = () => join(pasta, 'clipe-fake.mp4')
const base = () => ({ prompt: 'teste', segundos: 8, saida: saida(), precoUsdPorSegundo: PRECO, registrarCusto: espiao, contexto: 'video-produto slug-teste bloco-1', pastaVideo: pasta })
const arquivoOps = () => join(pasta, '_operacoes-abertas.json')

test('sucesso de 8 s a 0,05 por segundo grava UMA linha de 0,4 com status=sucesso', async () => {
  instalarFetchFalso({ poll: POLL_COM_VIDEO })
  const resultado = await aguardar(gerarClipe(base()))

  assert.equal(resultado.arquivo, saida())
  assert.equal(resultado.custoUsd, 0.4)
  assert.equal(linhas.length, 1, 'uma cobranca, uma linha: nada de linha aberta somando em dobro')
  assert.equal(linhas[0].servico, 'gemini-video')
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=sucesso/)
  assert.match(linhas[0].contexto, /gemini-omni-1\.1-flash/)
  assert.match(linhas[0].contexto, /tokens_saida=46336/)
  assert.match(linhas[0].contexto, /op=v1_teste-123/)
  assert.match(linhas[0].contexto, /video-produto slug-teste bloco-1/)
  assert.equal(fs.statSync(saida()).size, 60_000)
})

test('a criacao pede o Omni em segundo plano, 9:16, 720p e a duracao em texto, com a chave no cabecalho', async () => {
  const corpos = instalarFetchFalso({ poll: POLL_COM_VIDEO })
  await aguardar(gerarClipe(base()))
  assert.equal(corpos.length, 1)
  const { corpo, headers } = corpos[0]
  assert.equal(corpo.model, 'gemini-omni-1.1-flash')
  assert.equal(corpo.background, true)
  assert.deepEqual(corpo.response_format, { type: 'video', aspect_ratio: '9:16', resolution: '720p', duration: '8s' })
  assert.deepEqual(corpo.input, [{ type: 'text', text: 'teste' }])
  assert.equal(headers['x-goog-api-key'], 'chave-de-teste-fake')
})

test('geracao concluida sem video grava filtrada com cobranca incerta e estoura', async () => {
  instalarFetchFalso({ poll: { id: ID, status: 'completed', steps: [{ type: 'model_output', content: [] }] } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni terminou sem video/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=filtrada cobranca incerta/)
  assert.equal(fs.existsSync(saida()), false, 'nao teve video, nao pode ter arquivo')
})

test('video com mime que nao e de video grava falha_download e nao escreve o .mp4', async () => {
  instalarFetchFalso({ poll: comVideo({ mime_type: 'text/html' }) })
  await assert.rejects(() => aguardar(gerarClipe(base())), /nao parece valido/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=falha_download/)
  assert.equal(fs.existsSync(saida()), false)
})

test('video pequeno demais tambem vira falha_download', async () => {
  instalarFetchFalso({ poll: comVideo({ data: Buffer.alloc(200).toString('base64') }) })
  await assert.rejects(() => aguardar(gerarClipe(base())), /nao parece valido/)

  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=falha_download/)
  assert.equal(fs.existsSync(saida()), false)
})

test('status failed grava uma linha falha_operacao com "cobranca incerta"', async () => {
  instalarFetchFalso({ poll: { id: ID, status: 'failed', errors: [{ code: 'x', message: 'quebrou' }] } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni falhou.*quebrou/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=falha_operacao/)
  assert.match(linhas[0].contexto, /cobranca incerta/)
})

test('timeout do polling grava uma linha com "cobranca incerta"', async () => {
  instalarFetchFalso({ poll: { id: ID, status: 'in_progress' } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni nao terminou o clipe em 10 minutos/)

  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.4)
  assert.match(linhas[0].contexto, /status=timeout/)
  assert.match(linhas[0].contexto, /cobranca incerta/)
})

test('falha_transitoria nao grava nada e tenta de novo; a repeticao que da certo grava uma linha so', async () => {
  let polls = 0
  const corpos = instalarFetchFalso({
    poll: () => (++polls === 1
      ? { id: ID, status: 'failed', errors: [{ message: 'We encountered an issue with the audio for your prompt. You have not been charged for this attempt.' }] }
      : POLL_COM_VIDEO),
  })
  const resultado = await aguardar(gerarClipe(base()))

  assert.equal(polls, 2, 'tinha que ter tentado duas vezes')
  assert.equal(corpos.length, 2, 'duas criacoes')
  assert.equal(resultado.custoUsd, 0.4)
  assert.equal(linhas.length, 1, 'a tentativa nao cobrada nao pode virar linha')
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('falha_transitoria em todas as tentativas estoura sem gravar linha nenhuma', async () => {
  instalarFetchFalso({ poll: { id: ID, status: 'failed', errors: [{ message: 'You have not been charged for this attempt.' }] } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /4x a falha transitoria/)
  assert.equal(linhas.length, 0)
  assert.equal(fs.existsSync(arquivoOps()), false, 'geracao encerrada nao fica pendurada')
})

test('a geracao aberta aparece em _operacoes-abertas.json durante o polling e some no desfecho', async () => {
  let vistoNoPolling = null
  instalarFetchFalso({
    poll: () => {
      vistoNoPolling = JSON.parse(fs.readFileSync(arquivoOps(), 'utf8'))
      return POLL_COM_VIDEO
    },
  })
  await aguardar(gerarClipe(base()))

  assert.deepEqual(vistoNoPolling, [ID])
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('geracao que estoura no meio (timeout) tambem sai de _operacoes-abertas.json', async () => {
  instalarFetchFalso({ poll: { id: ID, status: 'in_progress' } })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni nao terminou/)
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('criacao com HTTP de erro nao grava nada: a geracao nem abriu', async () => {
  instalarFetchFalso({ criacao: respostaFalsa({ ok: false, status: 400, json: { error: { message: 'duration invalida' } } }) })
  await assert.rejects(() => aguardar(gerarClipe(base())), /nao abriu a geracao \(HTTP 400\), nada cobrado.*duration invalida/)
  assert.equal(linhas.length, 0)
  assert.equal(fs.existsSync(arquivoOps()), false)
})

test('criacao que estoura o prazo grava timeout_criacao com cobranca incerta', async () => {
  global.fetch = async (url, init = {}) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    // o fetch de verdade rejeita com o motivo do abort quando o prazo estoura
    return new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(init.signal.reason)))
  }
  await assert.rejects(() => aguardar(gerarClipe(base())), /criacao do clipe falhou sem resposta clara \(nao respondeu em 60 s\).*painel/)
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=falha_criacao cobranca incerta/)
})

// Revisao interna da 5.19: a conexao pode cair depois de a imagem subir, e um 200
// pode chegar sem o corpo inteiro. Nos dois casos a geracao pode ter aberto.
test('criacao com conexao que cai (fetch failed) ou 200 sem id grava falha_criacao com cobranca incerta', async () => {
  for (const criacao of [() => { throw new TypeError('fetch failed') }, () => respostaFalsa({ json: null })]) {
    linhas = []
    global.fetch = async (url) => (url.includes('/models?key=') ? respostaFalsa({ json: MODELOS_FAKE }) : criacao())
    await assert.rejects(() => aguardar(gerarClipe(base())), /falhou sem resposta clara.*pode ter aberto e cobrado/)
    assert.equal(linhas.length, 1)
    assert.match(linhas[0].contexto, /status=falha_criacao cobranca incerta/)
  }
})

test('listagem de modelos com HTTP de erro nao vira "sua chave nao enxerga o Omni"', async () => {
  global.fetch = async (url) => {
    if (url.includes('/models?key=')) return respostaFalsa({ ok: false, status: 503, json: { error: { message: 'indisponivel' } } })
    throw new Error('nao podia criar')
  }
  await assert.rejects(() => aguardar(gerarClipe(base())), (e) => /nao consegui listar os modelos.*HTTP 503.*Nada foi gerado nem cobrado/.test(e.message) && !/nao enxerga/.test(e.message))
  assert.equal(linhas.length, 0)
})

test('a foto vai no pedido como imagem base64 com o mime certo, antes do texto e sem pad', async () => {
  const foto = join(pasta, 'foto.png')
  // testsrc varia coluna a coluna: sem fundo liso pra cortar, a foto vai original
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=64x64', '-frames:v', '1', foto])
  assert.ok(fs.existsSync(foto), 'o ffmpeg tinha que criar a foto do teste')
  const corpos = instalarFetchFalso({ poll: POLL_COM_VIDEO })
  await aguardar(gerarClipe({ ...base(), imagemPath: foto }))
  const { input } = corpos[0].corpo
  assert.equal(input.length, 2)
  assert.deepEqual(input[0], { type: 'image', mime_type: 'image/png', data: fs.readFileSync(foto).toString('base64') })
  assert.deepEqual(input[1], { type: 'text', text: 'teste' })
})

test('toda chamada do clipe sai com prazo (signal), inclusive a listagem e o poll', async () => {
  const semPrazo = []
  global.fetch = async (url, init = {}) => {
    if (!init.signal) semPrazo.push(url)
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    if (url.endsWith('/interactions')) return respostaFalsa({ json: { id: ID } })
    return respostaFalsa({ json: POLL_COM_VIDEO })
  }
  await aguardar(gerarClipe(base()))
  assert.deepEqual(semPrazo, [])
  assert.equal(linhas.length, 1)
})

// Cobranca que nao pode sumir: erro de transporte no polling nao e desfecho.
// fetch falso em que o poll se comporta como `pollN(n)` (n = numero da chamada)
function fetchComPoll(pollN) {
  let polls = 0
  global.fetch = async (url, init = {}) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    if (url.endsWith('/interactions') && init.method === 'POST') return respostaFalsa({ json: { id: ID } })
    if (url.endsWith(`/interactions/${ID}`)) return pollN(++polls)
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

// Visto no teste pago da 5.19: a geracao morreu por "high demand" e toda pergunta
// sobre ela voltou HTTP 500 com corpo de erro, nunca status failed.
const ALTA_DEMANDA = { error: { message: 'The model is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.', code: 'api_error' } }

// Revisao do Codex na 5.19: desistir depois de alguns 500 seguidos podia abandonar
// uma geracao que ainda ia entregar, e a pessoa pagaria outra. Espera o teto e leva
// a mensagem do Google no erro, pro recado certo.
test('poll 500 com corpo de erro ate o teto vira timeout com a mensagem do Google no erro', async () => {
  let polls = 0
  fetchComPoll(() => { polls++; return respostaFalsa({ ok: false, status: 500, json: ALTA_DEMANDA }) })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni nao terminou o clipe em 10 minutos; a ultima resposta do Google foi erro:.*high demand/)
  assert.equal(polls, 60)
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=timeout cobranca incerta/)
})

test('poll 500 com corpo de erro muitas vezes e depois sucesso: segue e grava sucesso', async () => {
  fetchComPoll((n) => (n <= 30 ? respostaFalsa({ ok: false, status: 500, json: ALTA_DEMANDA }) : respostaFalsa({ json: POLL_COM_VIDEO })))
  await aguardar(gerarClipe(base()))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('o teto de 10 minutos vale no relogio: pergunta que trava ate o prazo nao estica a espera', async () => {
  mock.timers.reset()
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let polls = 0
  global.fetch = async (url, init = {}) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: MODELOS_FAKE })
    if (url.endsWith('/interactions')) return respostaFalsa({ json: { id: ID } })
    polls++
    // so rejeita quando o prazo da pergunta abortar, como uma conexao presa
    return new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(init.signal.reason)))
  }
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni nao terminou o clipe em 10 minutos/)
  assert.ok(polls <= 11, `${polls} perguntas: o teto passou dos 10 minutos de relogio`)
  assert.match(linhas[0].contexto, /status=timeout/)
})

test('poll 200 com JSON null uma vez: tentativa perdida, segue e grava UMA linha de sucesso', async () => {
  fetchComPoll((n) => respostaFalsa({ json: n === 1 ? null : POLL_COM_VIDEO }))
  await aguardar(gerarClipe(base()))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('poll que sempre falha por transporte cai no timeout com cobranca incerta', async () => {
  fetchComPoll(() => { throw new Error('rede caiu') })
  await assert.rejects(() => aguardar(gerarClipe(base())), /Omni nao terminou/)
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=timeout/)
  assert.match(linhas[0].contexto, /cobranca incerta/)
})

test('writeFileSync do mp4 falhando nao perde a cobranca: a linha de sucesso ja foi gravada', async () => {
  instalarFetchFalso({ poll: POLL_COM_VIDEO })
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

// O ListModels de depois de 2026-10-22: sem Omni na chave (e sem o Veo, que saiu),
// o clipe para antes de criar qualquer coisa e diz que nada foi cobrado.
test('sem Omni na chave estoura dizendo que o Veo saiu e que nada foi cobrado, sem criar geracao', async () => {
  const criou = []
  global.fetch = async (url, init = {}) => {
    if (url.includes('/models?key=')) return respostaFalsa({ json: { models: [MODELOS_FAKE.models[0]] } })
    criou.push(url, init)
    throw new Error('nao podia criar')
  }
  await assert.rejects(() => aguardar(gerarClipe(base())), /nao enxerga o Gemini Omni Flash.*Veo 3\.1.*saiu do ar.*Nada foi chamado nem cobrado/)
  assert.equal(criou.length, 0)
  assert.equal(linhas.length, 0)
})

// Trava do verde falso da 5.18: o mock usava so ids veo-3.1 e a suite seguiria
// verde depois do desligamento. O regex tem de casar com o Omni Flash, e com mais
// nada que cobre outro preco.
test('o modelo do clipe e o Omni Flash: casa com ele e recusa Veo, lite, pro e live', () => {
  for (const id of ['gemini-omni-1.1-flash', 'gemini-omni-1.2-flash', 'gemini-omni-2-flash-preview']) {
    assert.ok(MODELO_CLIPE.test(id), `${id} tinha que casar`)
  }
  for (const id of ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview',
    'gemini-omni-1.1-flash-lite', 'gemini-omni-1.1-pro', 'gemini-omni-1.1-flash-live', 'gemini-3.8-flash', 'gemini-omni-flash-preview']) {
    assert.ok(!MODELO_CLIPE.test(id), `${id} nao podia casar`)
  }
})
