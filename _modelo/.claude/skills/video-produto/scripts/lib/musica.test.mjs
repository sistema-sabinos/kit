import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

delete process.env.GEMINI_SEM_API // o fetch e falso: a trava dura nao pode quebrar a suite
process.env['GEMINI_API' + '_KEY'] = 'chave-de-teste-fake'

const { promptDeMusica, ESTILOS, gerarMusica } = await import('./musica.mjs')
const { registrarCusto: registrarCustoReal, somarCustos } = await import('../../../configurar-video/scripts/lib/custos.mjs')
const { narrar, transcrever } = await import('../narrar.mjs')
const { gerarClipe } = await import('../clipe.mjs')

// Regra da casa: todo video leva cama de musica, e o ESTILO depende do produto.
// A musica e sempre GERADA por nos, nunca de biblioteca, porque o marketplace
// proibe musica de propriedade de terceiros. Aqui tambem: o que a geracao cobra.

let linhas
let pasta
let fetchOriginal
const espiao = (l) => { linhas.push(l); return true }

beforeEach(() => {
  linhas = []
  pasta = fs.mkdtempSync(join(tmpdir(), 'musica-teste-'))
  fetchOriginal = global.fetch
})

afterEach(() => {
  global.fetch = fetchOriginal
  fs.rmSync(pasta, { recursive: true, force: true })
})

const AUDIO = { steps: [{ content: [{ type: 'audio', data: Buffer.from('musica-de-teste').toString('base64') }] }] }

// ListModels falso + resposta programada do /interactions
function instalarFetch({ modelos, ok = true, status = 200, json = AUDIO, texto = '' }) {
  const corpos = []
  global.fetch = async (url, init) => {
    if (String(url).includes('/models?key=')) return { ok: true, status: 200, json: async () => ({ models: modelos }) }
    corpos.push(JSON.parse(init.body))
    return { ok, status, json: async () => json, text: async () => texto }
  }
  return corpos
}
const LYRIA = [
  { name: 'models/lyria-3-clip-preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/lyria-3-pro-preview', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/lyria-3.5', supportedGenerationMethods: ['generateContent'] },
]

test('cada estilo diz pra que tipo de produto serve, senão a escolha vira chute', () => {
  for (const [nome, e] of Object.entries(ESTILOS)) {
    assert.ok(e.quando && e.quando.length > 10, `estilo ${nome} sem a dica de quando usar`)
    assert.ok(e.prompt && e.prompt.length > 40, `estilo ${nome} com prompt raso`)
  }
})

test('estilo que não existe estoura dizendo quais existem, em vez de gerar qualquer coisa', () => {
  assert.throws(() => promptDeMusica('sertanejo'), (e) => /não existe/.test(e.message) && /calma/.test(e.message))
})

test('todo prompt proíbe vocal e proíbe a música roubar a locução', () => {
  for (const nome of Object.keys(ESTILOS)) {
    const p = promptDeMusica(nome, { segundos: 60 })
    assert.match(p, /Instrumental only/i)
    assert.match(p, /no vocals/i)
    assert.match(p, /UNDER a spoken voiceover/i)
    assert.match(p, /no big build/i)
  }
})

test('pede a faixa com folga sobre a duração do vídeo, pra não precisar repetir a música', () => {
  assert.match(promptDeMusica('calma', { segundos: 68 }), /About 68 seconds/)
})

test('sucesso grava UMA linha gemini-musica com o precoUsd passado e usa o Lyria Pro descoberto', async () => {
  const corpos = instalarFetch({ modelos: LYRIA })
  const saida = join(pasta, 'cama.wav')
  const r = await gerarMusica({ estilo: 'calma', segundos: 60, saida, precoUsd: 0.08, registrarCusto: espiao, contexto: 'video-produto slug-teste' })

  assert.equal(r.custoUsd, 0.08)
  assert.ok(fs.existsSync(saida))
  assert.equal(corpos[0].model, 'lyria-3-pro-preview')
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].servico, 'gemini-musica')
  assert.equal(linhas[0].usd, 0.08)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('modelo explicito tem prioridade e dispensa o ListModels', async () => {
  const corpos = instalarFetch({ modelos: [] })
  await gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), precoUsd: 0.1, modelo: 'lyria-3.5', registrarCusto: espiao })
  assert.equal(corpos[0].model, 'lyria-3.5')
  assert.equal(linhas[0].usd, 0.1)
})

test('!r.ok nao registra nada', async () => {
  instalarFetch({ modelos: LYRIA, ok: false, status: 503, texto: 'fora do ar' })
  await assert.rejects(() => gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), precoUsd: 0.08, registrarCusto: espiao }), /HTTP 503/)
  assert.equal(linhas.length, 0)
})

test('200 sem audio grava uma linha falha_download (cobrou) e estoura', async () => {
  instalarFetch({ modelos: LYRIA, json: { steps: [] } })
  await assert.rejects(() => gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), precoUsd: 0.08, registrarCusto: espiao }), /sem áudio/)
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.08)
  assert.match(linhas[0].contexto, /status=falha_download/)
})

test('200 com corpo que nao e JSON grava falha_download (cobrou) e estoura', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/models?key=')) return { ok: true, status: 200, json: async () => ({ models: LYRIA }) }
    return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') }, text: async () => '' }
  }
  await assert.rejects(() => gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), precoUsd: 0.08, registrarCusto: espiao }))
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.08)
  assert.match(linhas[0].contexto, /status=falha_download/)
})

test('writeFileSync falhando nao perde a cobranca: a linha de sucesso sai antes', async () => {
  instalarFetch({ modelos: LYRIA })
  await assert.rejects(() => gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'nao-existe', 'c.wav'), precoUsd: 0.08, registrarCusto: espiao }))
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sucesso/)
})

test('sem modelo e sem Lyria no ListModels estoura mandando passar --modelo-musica, sem gravar', async () => {
  instalarFetch({ modelos: [{ name: 'models/gemini-3-pro-preview', supportedGenerationMethods: ['generateContent'] }] })
  await assert.rejects(() => gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), precoUsd: 0.08, registrarCusto: espiao }), /--modelo-musica/)
  assert.equal(linhas.length, 0)
})

test('sem precoUsd nao chama nada', async () => {
  global.fetch = async (url) => { throw new Error(`sem preco nao pode chamar fetch, chamou: ${url}`) }
  await assert.rejects(() => gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), registrarCusto: espiao }), /preco do dia/)
})

test('dry-run nao chama nada e nao grava', async () => {
  global.fetch = async (url) => { throw new Error(`dry-run nao pode chamar fetch, chamou: ${url}`) }
  const r = await gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'c.wav'), dryRun: true, registrarCusto: espiao })
  assert.equal(r.dryRun, true)
  assert.equal(linhas.length, 0)
})

// Ciclo completo falso: 4 clipes, 4 TTS, 4 transcricoes e 1 musica, todos pelo
// registrarCusto de verdade num dados/ de mkdtemp. A soma tem que bater com a
// conta a mao: nada em dobro, nada faltando.
//   clipes:        4 x (8 s x 0,05)                 = 1,6
//   TTS:           4 x (100 x 1 + 1000 x 10) / 1e6  = 4 x 0,0101 = 0,0404
//   transcricoes:  4 x (2000 x 0,5 + 50 x 2) / 1e6  = 4 x 0,0011 = 0,0044
//   musica:        1 x 0,08                         = 0,08
//   total                                           = 1,7248
test('ciclo completo falso (4 clipes, 4 TTS, 4 transcricoes, 1 musica) soma o que a conta a mao da', async () => {
  const { mock } = await import('node:test')
  const registrar = (l) => registrarCustoReal(l, { raiz: pasta })
  const modelos = [
    { name: 'models/veo-3.1-lite-generate-preview', supportedGenerationMethods: ['predictLongRunning'] },
    { name: 'models/gemini-3-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
    ...LYRIA,
  ]
  const audio = Buffer.alloc(4800).toString('base64')
  global.fetch = async (url) => {
    const u = String(url)
    const ok = (json) => ({ ok: true, status: 200, json: async () => json, text: async () => '', headers: { get: () => 'video/mp4' }, arrayBuffer: async () => new Uint8Array(60_000).buffer })
    if (u.includes('/models?key=')) return ok({ models: modelos })
    if (u.includes(':predictLongRunning')) return ok({ name: 'operations/ciclo-1' })
    if (u.includes('/operations/ciclo-1')) return ok({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://example.com/video-fake.mp4' } }] } } })
    if (u.includes('video-fake.mp4')) return ok({})
    if (u.includes('-tts:generateContent')) return ok({ candidates: [{ content: { parts: [{ inlineData: { data: audio } }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1000 } })
    if (u.includes(':generateContent')) return ok({ candidates: [{ content: { parts: [{ text: 'fala' }] } }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 50 } })
    return ok(AUDIO)
  }
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    for (let i = 1; i <= 4; i++) {
      const ctx = `video-produto slug-teste bloco-${i}`
      const p = gerarClipe({ prompt: 't', segundos: 8, saida: join(pasta, `c${i}.mp4`), precoUsdPorSegundo: 0.05, registrarCusto: registrar, contexto: ctx, pastaVideo: pasta })
      let pronto = false
      p.then(() => { pronto = true }, () => { pronto = true })
      for (let k = 0; k < 5 && !pronto; k++) { mock.timers.tick(10000); await new Promise((r) => setImmediate(r)) }
      await p
      await narrar(`fala ${i}`, { ator: { quem: 'uma mulher de casa', idade: 40, cenario: 'cozinha' }, saida: join(pasta, `f${i}.wav`), precos: { entradaUsdMtok: 1, saidaUsdMtok: 10 }, registrarCusto: registrar, contexto: ctx })
      await transcrever(join(pasta, `f${i}.wav`), { precos: { entradaUsdMtok: 0.5, saidaUsdMtok: 2 }, registrarCusto: registrar, contexto: ctx })
    }
    await gerarMusica({ estilo: 'calma', segundos: 60, saida: join(pasta, 'm.wav'), precoUsd: 0.08, registrarCusto: registrar, contexto: 'video-produto slug-teste' })
  } finally {
    mock.timers.reset()
  }

  const texto = fs.readFileSync(join(pasta, 'dados', 'custos.jsonl'), 'utf8')
  const todas = texto.trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(todas.length, 13, '4 + 4 + 4 + 1 linhas, uma por cobranca')
  assert.equal(todas.filter((l) => l.servico === 'gemini-video').length, 4)
  assert.equal(todas.filter((l) => l.servico === 'gemini-tts').length, 4)
  assert.equal(todas.filter((l) => l.servico === 'gemini-transcricao').length, 4)
  assert.equal(todas.filter((l) => l.servico === 'gemini-musica').length, 1)
  assert.equal(somarCustos(texto), 1.7248)
})
