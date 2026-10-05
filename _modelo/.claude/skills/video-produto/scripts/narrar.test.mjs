// Teste de narrar (TTS) e transcrever, sem rede e sem gasto: fetch falso e espiao
// no lugar do registro de custos. Confere o custo por token com o preco do dia e
// quando grava (resposta ok) ou nao (erro de HTTP).
// Roda com: node --test narrar.test.mjs
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

delete process.env.GEMINI_SEM_API // o fetch e falso: a trava dura nao pode quebrar a suite
process.env['GEMINI_API' + '_KEY'] = 'chave-de-teste-fake'

const { narrar, transcrever } = await import('./narrar.mjs')

const ATOR = { quem: 'uma mulher de casa', idade: 40, cenario: 'cozinha' }
const PRECOS = { entradaUsdMtok: 1, saidaUsdMtok: 10 }
const MODELOS = {
  models: [
    { name: 'models/gemini-3-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-pro-preview', supportedGenerationMethods: ['generateContent'] },
  ],
}

let linhas
let pasta
let fetchOriginal
let urls
const espiao = (l) => { linhas.push(l); return true }

beforeEach(() => {
  linhas = []
  urls = []
  pasta = fs.mkdtempSync(join(tmpdir(), 'narrar-teste-'))
  fetchOriginal = global.fetch
})

afterEach(() => {
  global.fetch = fetchOriginal
  fs.rmSync(pasta, { recursive: true, force: true })
})

// responde a lista de modelos e, pra generateContent, a resposta programada
function instalarFetch({ ok = true, status = 200, json }) {
  global.fetch = async (url) => {
    urls.push(url)
    if (url.includes('/models?key=')) return { ok: true, status: 200, json: async () => MODELOS }
    return { ok, status, json: async () => json }
  }
}

const AUDIO_B64 = Buffer.alloc(4800).toString('base64')
const comAudio = (usageMetadata) => ({ candidates: [{ content: { parts: [{ inlineData: { data: AUDIO_B64 } }] } }], ...(usageMetadata ? { usageMetadata } : {}) })
const comTexto = (texto, usageMetadata) => ({ candidates: [{ content: { parts: [{ text: texto }] } }], ...(usageMetadata ? { usageMetadata } : {}) })

function wavDeTeste() {
  const p = join(pasta, 'fala.wav')
  fs.writeFileSync(p, Buffer.alloc(100))
  return p
}

test('narrar com usageMetadata registra gemini-tts com o custo por token do dia', async () => {
  instalarFetch({ json: comAudio({ promptTokenCount: 100, candidatesTokenCount: 1000 }) })
  const saida = join(pasta, 'fala.wav')
  const r = await narrar('Texto de teste.', { ator: ATOR, saida, precos: PRECOS, registrarCusto: espiao, contexto: 'video-produto slug-teste bloco-1' })

  assert.ok(r.segundos > 0)
  assert.ok(fs.existsSync(saida))
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].servico, 'gemini-tts')
  assert.equal(linhas[0].usd, 0.0101)
  assert.match(linhas[0].contexto, /video-produto slug-teste bloco-1/)
  assert.match(linhas[0].contexto, /tokens=100\/1000/)
})

// Defeito do teste pago da 3.13: a direcao ia no text e o Gemini 3.8 TTS leu ela
// em voz alta. O text leva SO a fala; a direcao vai em speech_metadata.style.
test('narrar manda so a fala no text e a direcao em speech_metadata.style', async () => {
  let corpo = null
  global.fetch = async (url, init) => {
    urls.push(url)
    if (url.includes('/models?key=')) return { ok: true, status: 200, json: async () => MODELOS }
    corpo = JSON.parse(init.body)
    return { ok: true, status: 200, json: async () => comAudio({ promptTokenCount: 1, candidatesTokenCount: 1 }) }
  }
  const fala = 'Olha, eu vivia sem paciência de desenhar.'
  await narrar(fala, { ator: { ...ATOR, genero: 'masculino', sotaque: 'mineiro' }, saida: join(pasta, 'c.wav'), precos: PRECOS, registrarCusto: espiao })

  assert.ok(corpo, 'o fetch espiao nao viu o pedido do TTS')
  const partes = corpo.contents[0].parts
  assert.equal(partes.length, 1)
  assert.equal(partes[0].text, fala)
  const estilo = partes[0].speech_metadata?.style
  assert.match(estilo, /locutor/)
  assert.match(estilo, /WhatsApp/)
  assert.match(estilo, /mineiro/)
  assert.match(estilo, /masculina/)
  assert.doesNotMatch(estilo, /Fale:/)
  assert.ok(!partes[0].text.includes('locutor'), 'a direcao vazou pro texto falado')
  assert.deepEqual(corpo.generationConfig.responseModalities, ['AUDIO'])
})

// O 3.8 devolve WAV pronto (bytes "RIFF"), os anteriores PCM cru. Nos dois casos
// o arquivo final tem UM cabecalho so e a duracao da voz mais o silencio final.
const contarRiff = (buf) => { let n = 0; for (let i = buf.indexOf('RIFF'); i !== -1; i = buf.indexOf('RIFF', i + 1)) n++; return n }
const UM_SEGUNDO_PCM = Buffer.alloc(24000 * 2, 1)
const wavDoGemini = (pcm) => {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

for (const [caso, bytes, mimeType] of [
  ['WAV pronto (RIFF)', wavDoGemini(UM_SEGUNDO_PCM), 'audio/wav'],
  ['PCM cru', UM_SEGUNDO_PCM, 'audio/L16;rate=24000'],
]) {
  test(`narrar com ${caso} grava um cabecalho so e a duracao certa`, async () => {
    instalarFetch({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data: bytes.toString('base64') } }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } } })
    const saida = join(pasta, 'cab.wav')
    const r = await narrar('Texto.', { ator: ATOR, saida, precos: PRECOS, registrarCusto: espiao })
    const arq = fs.readFileSync(saida)
    assert.equal(contarRiff(arq), 1)
    const esperado = 1 + 0.4 // 1 s de voz + SILENCIO_FINAL
    assert.equal(arq.readUInt32LE(40), Math.round(esperado * 24000) * 2, 'tamanho do data')
    assert.equal(arq.length, 44 + arq.readUInt32LE(40))
    assert.ok(Math.abs(r.segundos - esperado) < 1e-9, `segundos=${r.segundos}`)
  })
}

// fetch com uma lista de modelos propria, pra testar a escolha do modelo de voz
function fetchComModelos(nomes) {
  global.fetch = async (url) => {
    urls.push(url)
    if (url.includes('/models?key=')) return { ok: true, status: 200, json: async () => ({ models: nomes.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }) }
    return { ok: true, status: 200, json: async () => comAudio({ promptTokenCount: 1, candidatesTokenCount: 1 }) }
  }
}

test('narrar prefere o TTS flash mesmo com um TTS de outra familia mais novo, e o contexto mostra o modelo', async () => {
  fetchComModelos(['gemini-9-pro-preview-tts', 'gemini-3-flash-preview-tts', 'gemini-3-flash-preview'])
  await narrar('Texto.', { ator: ATOR, saida: join(pasta, 'f.wav'), precos: PRECOS, registrarCusto: espiao })
  assert.ok(urls.some((u) => u.includes('gemini-3-flash-preview-tts:generateContent')), urls.join(' | '))
  assert.match(linhas[0].contexto, /gemini-3-flash-preview-tts/)
})

test('sem TTS flash, narrar cai no outro TTS que existir', async () => {
  fetchComModelos(['gemini-9-pro-preview-tts', 'gemini-3-flash-preview'])
  await narrar('Texto.', { ator: ATOR, saida: join(pasta, 'p.wav'), precos: PRECOS, registrarCusto: espiao })
  assert.ok(urls.some((u) => u.includes('gemini-9-pro-preview-tts:generateContent')), urls.join(' | '))
})

test('narrar tambem aceita o formato com objeto unico', async () => {
  instalarFetch({ json: comAudio({ promptTokenCount: 100, candidatesTokenCount: 1000 }) })
  await narrar({ texto: 'Texto.', ator: ATOR, saida: join(pasta, 'a.wav'), precos: PRECOS, registrarCusto: espiao })
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.0101)
})

test('narrar sem usageMetadata registra usd 0 com custo-desconhecido', async () => {
  instalarFetch({ json: comAudio() })
  await narrar('Texto de teste.', { ator: ATOR, saida: join(pasta, 'fala.wav'), precos: PRECOS, registrarCusto: espiao })
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].servico, 'gemini-tts')
  assert.equal(linhas[0].usd, 0)
  assert.match(linhas[0].contexto, /custo-desconhecido/)
})

test('narrar com 200 sem audio ainda registra (o token foi gasto) e estoura', async () => {
  instalarFetch({ json: { candidates: [{ content: { parts: [{ text: 'so texto' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1000 } } })
  await assert.rejects(() => narrar('Texto.', { ator: ATOR, saida: join(pasta, 'x.wav'), precos: PRECOS, registrarCusto: espiao }), /TTS nao devolveu audio/)
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].usd, 0.0101)
  assert.match(linhas[0].contexto, /status=sem_audio/)
})

test('narrar com erro de HTTP nao registra', async () => {
  instalarFetch({ ok: false, status: 500, json: { error: { message: 'caiu' } } })
  await assert.rejects(() => narrar('Texto.', { ator: ATOR, saida: join(pasta, 'x.wav'), precos: PRECOS, registrarCusto: espiao }), /HTTP 500/)
  assert.equal(linhas.length, 0)
})

test('narrar sem precos do dia estoura antes de qualquer fetch', async () => {
  global.fetch = async (url) => { throw new Error(`sem preco nao pode chamar fetch, chamou: ${url}`) }
  await assert.rejects(() => narrar('Texto.', { ator: ATOR, saida: join(pasta, 'x.wav'), registrarCusto: espiao }), /precos do dia/)
  assert.equal(linhas.length, 0)
})

test('preco zero nao vale: narrar e transcrever exigem preco maior que zero', async () => {
  global.fetch = async (url) => { throw new Error(`preco zero nao pode chamar fetch, chamou: ${url}`) }
  const zero = { entradaUsdMtok: 0, saidaUsdMtok: 0 }
  await assert.rejects(() => narrar('Texto.', { ator: ATOR, saida: join(pasta, 'x.wav'), precos: zero, registrarCusto: espiao }), /precos do dia/)
  await assert.rejects(() => transcrever(wavDeTeste(), { precos: zero, registrarCusto: espiao }), /precos do dia/)
  assert.equal(linhas.length, 0)
})

test('transcrever com r.ok registra gemini-transcricao e usa modelo flash', async () => {
  instalarFetch({ json: comTexto('ola mundo', { promptTokenCount: 2000, candidatesTokenCount: 50 }) })
  const texto = await transcrever(wavDeTeste(), { precos: { entradaUsdMtok: 0.5, saidaUsdMtok: 2 }, registrarCusto: espiao, contexto: 'video-produto slug-teste bloco-1' })

  assert.equal(texto, 'ola mundo')
  assert.equal(linhas.length, 1)
  assert.equal(linhas[0].servico, 'gemini-transcricao')
  assert.equal(linhas[0].usd, 0.0011)
  assert.match(linhas[0].contexto, /gemini-3-flash-preview status=sucesso/)
  assert.ok(urls.some((u) => u.includes('gemini-3-flash-preview:generateContent')), 'tinha que usar o modelo flash')
  assert.ok(!urls.some((u) => u.includes('-pro-')), 'nao pode usar o Pro')
})

test('transcrever com r.ok mas sem texto registra (gastou) e estoura', async () => {
  instalarFetch({ json: { candidates: [{ content: { parts: [] } }], usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 0 } } })
  await assert.rejects(() => transcrever(wavDeTeste(), { precos: PRECOS, registrarCusto: espiao }), /transcricao nao voltou texto/)
  assert.equal(linhas.length, 1)
  assert.match(linhas[0].contexto, /status=sem_texto/)
})

test('transcrever com !r.ok nao registra e estoura', async () => {
  instalarFetch({ ok: false, status: 429, json: { error: { message: 'limite' } } })
  await assert.rejects(() => transcrever(wavDeTeste(), { precos: PRECOS, registrarCusto: espiao }), /status 429/)
  assert.equal(linhas.length, 0)
})

test('transcrever sem precos do dia estoura antes de qualquer fetch', async () => {
  global.fetch = async (url) => { throw new Error(`sem preco nao pode chamar fetch, chamou: ${url}`) }
  await assert.rejects(() => transcrever(wavDeTeste(), { registrarCusto: espiao }), /precos do dia/)
})
