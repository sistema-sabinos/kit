// Narracao em off dos blocos de produto (Gemini TTS) e o gate de voz (transcrever
// de volta o que foi gerado).
// O endpoint /v1beta/interactions da documentacao nao responde na chave comum.
// O que funciona e generateContent com responseModalities AUDIO.
//
// Dinheiro: as duas chamadas cobram por token. O custo sai de usageMetadata da
// resposta vezes o preco por milhao de tokens do dia (precos), e vira UMA linha no
// registro de custos sempre que a API respondeu com sucesso (HTTP ok), mesmo sem
// audio ou sem texto, porque ai o token foi gasto. Resposta com erro de HTTP nao
// grava. Sem usageMetadata, grava usd 0 com "custo-desconhecido" no contexto.
import fs from 'node:fs'
import { pcmParaWav, extrairPcm, silencio, SILENCIO_FINAL } from './lib/wav.mjs'
import { direcaoDeVoz } from './lib/direcao.mjs'
import { carregarChave, escolherModelo } from './lib/gemini.mjs'
import { registrarCusto as registrarCustoPadrao, custoPorTokens } from '../../configurar-video/scripts/lib/custos.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'

function exigirPrecos(precos, quem) {
  if (!(precos?.entradaUsdMtok > 0) || !(precos?.saidaUsdMtok > 0)) {
    throw new Error(`faltam os precos do dia de ${quem} (precos.entradaUsdMtok e precos.saidaUsdMtok, dolar por milhao de tokens, maiores que zero): confira o preco atual e passe nas flags. Nada foi chamado.`)
  }
}

function cobrar({ registrarCusto, servico, uso, precos, contexto, modelo, status }) {
  const usd = custoPorTokens(uso, precos)
  const detalhe = usd === null ? 'custo-desconhecido' : `tokens=${uso.promptTokenCount || 0}/${uso.candidatesTokenCount || 0}`
  registrarCusto({ servico, usd: usd ?? 0, contexto: `${contexto} ${modelo} status=${status} ${detalhe}`.trim() })
}

const lerJson = async (r) => { try { return await r.json() } catch { return {} } }

// Aceita narrar(texto, opcoes) e narrar({ texto, ...opcoes }).
export async function narrar(arg, opcoes = {}) {
  const { texto, voz = 'Aoede', ator, saida, precos, registrarCusto = registrarCustoPadrao, contexto = '' } =
    typeof arg === 'string' ? { ...opcoes, texto: arg } : arg
  exigirPrecos(precos, 'voz (TTS)')
  const key = carregarChave()
  // O preco que a pessoa passa e o da linha do Flash TTS (o dry-run diz isso), entao
  // a voz sai do Flash TTS mesmo quando outra familia de TTS for mais nova. So sem
  // nenhum Flash TTS na chave cai em outro TTS; o nome escolhido vai no contexto do custo.
  let modelo
  try { modelo = await escolherModelo(/flash.*-tts/) } catch { modelo = await escolherModelo(/-tts/) }
  // O text vai SO com a fala; a direcao vai em speech_metadata.style, na mesma
  // part. A partir do Gemini 3.8 TTS o text e transcricao literal: direcao
  // misturada nele e lida em voz alta (aconteceu no teste pago da 3.13).
  // Formato da doc: https://ai.google.dev/gemini-api/docs/speech-generation
  const r = await fetch(`${API}/models/${modelo}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: texto, speech_metadata: { style: direcaoDeVoz(ator) } }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
      },
    }),
  })
  const j = await lerJson(r)
  if (!r.ok) throw new Error(`TTS devolveu HTTP ${r.status}, nada cobrado: ${JSON.stringify(j).slice(0, 300)}`)
  const b64 = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data
  // Cobra antes de checar o audio: 200 sem audio tambem gastou token.
  cobrar({ registrarCusto, servico: 'gemini-tts', uso: j.usageMetadata, precos, contexto, modelo, status: b64 ? 'sucesso' : 'sem_audio' })
  if (!b64) throw new Error(`TTS nao devolveu audio: ${JSON.stringify(j).slice(0, 300)}`)

  // 3.8 devolve WAV pronto, os anteriores PCM cru: extrairPcm devolve sempre o
  // PCM e a taxa, pra sair um cabecalho so no arquivo.
  const { pcm: fala, rate } = extrairPcm(Buffer.from(b64, 'base64'))
  const pcm = Buffer.concat([fala, silencio(SILENCIO_FINAL, rate)])
  fs.writeFileSync(saida, pcmParaWav(pcm, rate))
  return { arquivo: saida, segundos: pcm.length / (rate * 2) }
}

// Gate de voz: ouve o que foi gerado e devolve a transcricao, pra comparar com o
// roteiro. Pega marcacao lida em voz alta e improviso do modelo.
export async function transcrever(arquivoWav, { precos, registrarCusto = registrarCustoPadrao, contexto = '' } = {}) {
  exigirPrecos(precos, 'transcricao')
  const key = carregarChave()
  // Flash: transcrever de volta uma fala de poucos segundos nao pede o modelo caro.
  // Fora os flash de voz, imagem e audio ao vivo, que tambem aceitam generateContent
  // mas nao transcrevem.
  const modelo = await escolherModelo(/-flash(?!.*(?:tts|image|live|audio))/)
  const b64 = fs.readFileSync(arquivoWav).toString('base64')
  const r = await fetch(`${API}/models/${modelo}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: 'Transcreva EXATAMENTE o que é falado neste áudio, palavra por palavra, sem comentar nada.' },
        { inline_data: { mime_type: 'audio/wav', data: b64 } },
      ] }],
    }),
  })
  const j = await lerJson(r)
  const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ').trim()
  if (r.ok) cobrar({ registrarCusto, servico: 'gemini-transcricao', uso: j.usageMetadata, precos, contexto, modelo, status: texto ? 'sucesso' : 'sem_texto' })
  // O transcrever e o gate de voz: se engolir erro e devolver vazio, o gate
  // "aprova" tudo em silencio. Estoura barulhento, com status e comeco do corpo.
  if (!texto) throw new Error(`transcricao nao voltou texto (status ${r.status}): ${JSON.stringify(j).slice(0, 300)}`)
  return texto
}
