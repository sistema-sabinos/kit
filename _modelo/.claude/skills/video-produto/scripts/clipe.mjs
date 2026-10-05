// Clipe de video no Veo 3.1 (imagem para video). A chamada e assincrona:
// predictLongRunning devolve uma operacao e a gente fica perguntando se terminou.
//
// Dinheiro: o preco por segundo vem de quem chama (preco do dia, nunca chumbado
// aqui) e toda cobranca vira UMA linha no registro de custos, gravada no desfecho
// da operacao. Uma linha "aberta" com custo contaria em dobro na soma, por isso
// nao existe. Desfechos:
//   sucesso, filtrada, falha_download: grava, segundos x preco
//   falha_operacao, timeout: grava com "cobranca incerta" (o Google pode ter cobrado)
//   falha_transitoria: NAO grava (a API diz que a tentativa nao foi cobrada)
//   erro antes de a operacao abrir: NAO grava (nao existe operacao pra cobrar)
// Enquanto a operacao esta aberta, o nome dela fica em
// <pastaVideo>/_operacoes-abertas.json (uma lista de textos) e sai no desfecho.
// Se o processo morrer no meio, o nome fica la e a proxima fase avisa da pendencia.
import fs from 'node:fs'
import path from 'node:path'
import { carregarChave, escolherModelo } from './lib/gemini.mjs'
import { usd } from './lib/dinheiro.mjs'
import { prepararImagem9x16 } from './lib/preparar-imagem.mjs'
import { registrarCusto as registrarCustoPadrao } from '../../configurar-video/scripts/lib/custos.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'

// Os dois tiers do Veo, so pelo nome do modelo. O preco NAO mora aqui.
export const TIERS = {
  fast: { padrao: /^veo-3\.1.*fast/ },
  lite: { padrao: /^veo-3\.1.*lite/ },
}

// Qual tier cada tipo de bloco usa. Tipo desconhecido cai no lite.
export const TIER_POR_TIPO = { produto: 'lite', pessoa: 'lite' }

export function tierDoBloco(bloco) {
  return TIER_POR_TIPO[bloco?.tipo] ?? 'lite'
}

// Um clipe de verdade nao sai com poucos KB. Pega resposta de erro (HTML ou JSON
// pequeno) que o fetch aceitaria como sucesso (status 200), ex: URI assinada expirada.
const TAMANHO_MINIMO_VIDEO_BYTES = 50_000

// Quantas vezes insistir quando o Veo devolve a falha transitoria de audio (a
// propria resposta avisa "You have not been charged for this attempt").
const MAX_TENTATIVAS_AUDIO = 4

function mimeDaImagem(p) {
  return path.extname(p).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
}

function arquivoDeOperacoes(pastaVideo) {
  return path.join(pastaVideo, '_operacoes-abertas.json')
}

function lerOperacoes(pastaVideo) {
  try { return JSON.parse(fs.readFileSync(arquivoDeOperacoes(pastaVideo), 'utf8')) } catch { return [] }
}

// O controle de operacoes abertas nunca derruba a geracao: e um aviso, nao um requisito.
function abrirOperacao(pastaVideo, nome) {
  if (!pastaVideo) return
  try {
    fs.mkdirSync(pastaVideo, { recursive: true })
    const lista = lerOperacoes(pastaVideo).filter((n) => n !== nome)
    fs.writeFileSync(arquivoDeOperacoes(pastaVideo), JSON.stringify([...lista, nome]))
  } catch { /* so aviso */ }
}

function fecharOperacao(pastaVideo, nome) {
  if (!pastaVideo) return
  try {
    const lista = lerOperacoes(pastaVideo).filter((n) => n !== nome)
    if (lista.length) fs.writeFileSync(arquivoDeOperacoes(pastaVideo), JSON.stringify(lista))
    else fs.rmSync(arquivoDeOperacoes(pastaVideo), { force: true })
  } catch { /* so aviso */ }
}

export async function gerarClipe({
  prompt, imagemPath, segundos = 8, saida, dryRun = false, tier = 'lite',
  precoUsdPorSegundo, registrarCusto = registrarCustoPadrao, contexto = '', pastaVideo, _tentativa = 1,
}) {
  if (!TIERS[tier]) throw new Error(`tier de Veo desconhecido: ${JSON.stringify(tier)}. Existem: ${Object.keys(TIERS).join(', ')}`)
  if (dryRun) {
    const estimado = Number.isFinite(precoUsdPorSegundo) ? ` Custaria ${usd(segundos * precoUsdPorSegundo)}.` : ''
    console.error(`[clipe] DRY-RUN, nao gerou nada.${estimado} Prompt:\n${prompt}`)
    return { arquivo: null, custoUsd: 0 }
  }
  if (!Number.isFinite(precoUsdPorSegundo) || precoUsdPorSegundo <= 0) {
    throw new Error('falta o preco do dia do clipe (precoUsdPorSegundo): confira o preco atual do Veo e passe --preco-usd. Nada foi chamado.')
  }
  const custoUsd = Math.round(segundos * precoUsdPorSegundo * 1e6) / 1e6

  const key = carregarChave()
  // O Veo nao fala generateContent, fala predictLongRunning.
  const modelo = await escolherModelo(TIERS[tier].padrao, 'predictLongRunning')
  const instancia = { prompt }
  if (imagemPath) {
    // O Veo preserva a proporcao da imagem dentro do canvas 9:16 em vez de preencher:
    // foto quadrada vira video com tarja preta, e o marketplace recusa video com
    // borda. Por isso a imagem ja nasce 9:16 (pad com fundo branco, sem cortar).
    const imagemPronta = await prepararImagem9x16(imagemPath)
    // Schema "predict": a imagem vai em bytesBase64Encoded + mimeType, sem inlineData.
    instancia.image = {
      bytesBase64Encoded: fs.readFileSync(imagemPronta).toString('base64'),
      mimeType: mimeDaImagem(imagemPronta),
    }
  }

  const r = await fetch(`${API}/models/${modelo}:predictLongRunning?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [instancia],
      // durationSeconds e NUMERO, a API recusa texto.
      parameters: { aspectRatio: '9:16', resolution: '720p', durationSeconds: segundos },
    }),
  })
  const op = await r.json()
  // Antes de a operacao abrir (400 de validacao, por exemplo) nao ha o que cobrar.
  if (!op?.name) throw new Error(`Veo nao abriu a operacao: ${JSON.stringify(op).slice(0, 300)}`)
  console.error(`[clipe] gerando (${modelo}, ${segundos}s, ~${usd(custoUsd)})...`)
  abrirOperacao(pastaVideo, op.name)

  // Uma linha por cobranca, no desfecho, com o custo ESTIMADO (segundos x preco do
  // dia): a gente nao sabe quanto o Google cobrou de fato num caso filtrado ou
  // timeout. O status diz se teve entrega, e op= permite achar a cobranca la.
  const gravar = (status, extra = '', usdLinha = custoUsd) => {
    fecharOperacao(pastaVideo, op.name)
    registrarCusto({
      servico: 'gemini-video',
      usd: usdLinha,
      contexto: `${contexto} ${modelo} ${segundos}s status=${status}${extra} op=${op.name}`.trim(),
    })
  }

  let dados = null
  for (let i = 0; i < 60; i++) {
    await new Promise((s) => setTimeout(s, 10000))
    // Erro de transporte (rede, HTTP nao-ok, corpo que nao e JSON) e tentativa
    // perdida, nao desfecho: a operacao segue aberta do lado do Google e pode ja
    // ter sido cobrada. O loop continua; se estourar o teto, cai no timeout abaixo.
    let st
    try {
      const resp = await fetch(`${API}/${op.name}?key=${key}`)
      if (!resp.ok) continue
      st = await resp.json()
    } catch { continue }
    // 200 com corpo `null` (ou vazio) tambem e tentativa perdida, nunca desfecho
    if (!st) continue
    // So st.error com HTTP 200 e falha da operacao.
    if (st.error) {
      gravar('falha_operacao', ' cobranca incerta')
      throw new Error(`Veo falhou: ${JSON.stringify(st.error).slice(0, 300)}`)
    }
    if (st.done) { dados = st; break }
  }
  if (!dados) {
    gravar('timeout', ' cobranca incerta')
    throw new Error('Veo nao terminou em 10 minutos')
  }

  const uri = dados.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
  if (!uri) {
    // done:true sem video tem dois sabores. A falha transitoria de audio vem com
    // "have not been charged" e se repete. O resto e filtro de conteudo, que cobra.
    const motivo = dados.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0] ?? ''
    const transitoria = /issue with the audio|have not been charged/i.test(motivo)
    if (transitoria) {
      // Nao grava: a API afirma que esta tentativa nao foi cobrada.
      fecharOperacao(pastaVideo, op.name)
      if (_tentativa < MAX_TENTATIVAS_AUDIO) {
        console.error(`[clipe] falha transitoria de audio do Veo (nao cobrada). Tentativa ${_tentativa} de ${MAX_TENTATIVAS_AUDIO}, repetindo...`)
        await new Promise((s) => setTimeout(s, 3000 * _tentativa))
        return gerarClipe({ prompt, imagemPath, segundos, saida, dryRun, tier, precoUsdPorSegundo, registrarCusto, contexto, pastaVideo, _tentativa: _tentativa + 1 })
      }
      throw new Error(`Veo devolveu ${MAX_TENTATIVAS_AUDIO}x a falha transitoria de audio (nenhuma cobrada). Ultima: ${motivo.slice(0, 200)}`)
    }
    gravar('filtrada')
    throw new Error(`Veo terminou sem video: ${JSON.stringify(dados).slice(0, 400)}`)
  }

  // Se o download estourar por rede, a operacao ja foi cobrada: grava falha_download.
  let bin, contentType, buf
  try {
    bin = await fetch(uri, { headers: { 'x-goog-api-key': key } })
    contentType = bin.headers.get('content-type') ?? ''
    buf = Buffer.from(await bin.arrayBuffer())
  } catch (e) {
    gravar('falha_download')
    throw new Error(`Download do video falhou antes de terminar: ${e.message}`)
  }
  // Status ok E cara de video (content-type video/ E tamanho minimo plausivel).
  const pareceVideo = contentType.startsWith('video/') && buf.length >= TAMANHO_MINIMO_VIDEO_BYTES
  if (!bin.ok || !pareceVideo) {
    gravar('falha_download')
    const amostra = buf.length < 2000 ? buf.toString('utf8').slice(0, 300) : `${buf.length} bytes`
    throw new Error(`Download do video nao parece valido (HTTP ${bin.status}, content-type "${contentType}"): ${amostra}`)
  }

  // Grava a cobranca ANTES do arquivo: falha de disco nao pode apagar o gasto.
  gravar('sucesso')
  fs.writeFileSync(saida, buf)
  return { arquivo: saida, custoUsd }
}
