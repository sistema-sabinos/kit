// Clipe de video no Gemini Omni Flash (imagem para video), pela Interactions API.
// O Veo 3.1, que fazia isto antes, saiu do ar em 2026-10-22. A chamada roda em
// segundo plano (background): a criacao devolve um id e a gente fica perguntando
// se terminou. Sincrona nao serve: o fetch do Node desiste de resposta que demora
// mais de 5 minutos, e a geracao pode passar disso.
//
// Dinheiro: o preco por segundo vem de quem chama (preco do dia, nunca chumbado
// aqui) e toda cobranca vira UMA linha no registro de custos, gravada no desfecho
// da geracao. Uma linha "aberta" com custo contaria em dobro na soma, por isso
// nao existe. Desfechos:
//   sucesso, falha_download: grava, segundos x preco
//   filtrada, falha_operacao, timeout, falha_criacao: grava com "cobranca incerta"
//     (a doc do Omni nao diz se bloqueio cobra; o Google pode ter cobrado)
//   falha_transitoria: NAO grava (a resposta diz que a tentativa nao foi cobrada)
//   erro antes de a geracao abrir (HTTP de erro na criacao): NAO grava
// Enquanto a geracao esta aberta, o id dela fica em
// <pastaVideo>/_operacoes-abertas.json (uma lista de textos) e sai no desfecho.
// Se o processo morrer no meio, o id fica la e a proxima fase avisa da pendencia.
import fs from 'node:fs'
import path from 'node:path'
import { carregarChave, escolherModelo } from './lib/gemini.mjs'
import { usd } from './lib/dinheiro.mjs'
import { fetchComTimeout, ehTimeout } from './lib/fetch-timeout.mjs'
import { prepararImagem9x16 } from './lib/preparar-imagem.mjs'
import { registrarCusto as registrarCustoPadrao } from '../../configurar-video/scripts/lib/custos.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'

// Um modelo so, pelo nome. Lite, pro, live e afins ficam de fora: o preco que a
// pessoa passa e o da linha do Omni Flash, e outro modelo cobraria outra coisa.
export const MODELO_CLIPE = /^gemini-omni-\d+(?:\.\d+)?-flash(?:-preview)?$/

// Um clipe de verdade nao sai com poucos KB. Pega resposta que diz ser video e nao e.
const TAMANHO_MINIMO_VIDEO_BYTES = 50_000

// Quantas vezes insistir quando a geracao volta com a falha que a propria API
// diz nao ter cobrado ("You have not been charged for this attempt").
const MAX_TENTATIVAS_AUDIO = 4

// Prazos. A criacao manda a imagem e volta logo (o trabalho roda em segundo plano).
// Cada pergunta traz o video inteiro em base64 quando termina, por isso tem folga.
const PRAZO_CRIACAO_MS = 60_000
const PRAZO_POLL_MS = 60_000
const INTERVALO_POLL_MS = 10_000
const MAX_POLLS = 60 // 60 x 10 s = 10 minutos

// Status em que a geracao ainda esta rodando. Qualquer outro e desfecho.
const RODANDO = new Set(['in_progress', 'queued'])

function mimeDaImagem(p) {
  return path.extname(p).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
}

function arquivoDeOperacoes(pastaVideo) {
  return path.join(pastaVideo, '_operacoes-abertas.json')
}

function lerOperacoes(pastaVideo) {
  try { return JSON.parse(fs.readFileSync(arquivoDeOperacoes(pastaVideo), 'utf8')) } catch { return [] }
}

// O controle de geracoes abertas nunca derruba a geracao: e um aviso, nao um requisito.
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

// Pelo REST o video vem em steps > model_output > content tipo video (o
// output_video da doc e campo so do SDK).
function videoDaResposta(st) {
  return (st.steps ?? [])
    .flatMap((s) => s.content ?? [])
    .find((c) => c?.type === 'video' && c.data)
}

const lerJson = async (r) => { try { return await r.json() } catch { return null } }

export async function gerarClipe({
  prompt, imagemPath, segundos = 8, saida, dryRun = false,
  precoUsdPorSegundo, registrarCusto = registrarCustoPadrao, contexto = '', pastaVideo, _tentativa = 1,
}) {
  if (dryRun) {
    const estimado = Number.isFinite(precoUsdPorSegundo) ? ` Custaria ${usd(segundos * precoUsdPorSegundo)}.` : ''
    console.error(`[clipe] DRY-RUN, nao gerou nada.${estimado} Prompt:\n${prompt}`)
    return { arquivo: null, custoUsd: 0 }
  }
  if (!Number.isFinite(precoUsdPorSegundo) || precoUsdPorSegundo <= 0) {
    throw new Error('falta o preco do dia do clipe (precoUsdPorSegundo): confira o preco atual do Gemini Omni Flash e passe --preco-usd. Nada foi chamado.')
  }
  const custoUsd = Math.round(segundos * precoUsdPorSegundo * 1e6) / 1e6

  const key = carregarChave()
  let modelo
  try {
    modelo = await escolherModelo(MODELO_CLIPE)
  } catch (e) {
    if (!/nenhum modelo casa/.test(e.message)) throw new Error(`nao consegui listar os modelos do Google (${e.message}). Nada foi gerado nem cobrado; tente de novo em alguns minutos.`)
    throw new Error(`a sua chave nao enxerga o Gemini Omni Flash (${e.message}). O Veo 3.1, que fazia o clipe antes, saiu do ar em 2026-10-22. Nada foi chamado nem cobrado.`)
  }
  const input = []
  if (imagemPath) {
    // O Omni enche o quadro 9:16 cortando o que sobra da foto. Fundo liso sobrando
    // dos lados e cortado antes, sem encostar no produto; pad branco nao entra,
    // porque o Omni o devolve rabiscado (teste pago da 5.19, ver preparar-imagem.mjs).
    const imagemPronta = await prepararImagem9x16(imagemPath)
    input.push({ type: 'image', data: fs.readFileSync(imagemPronta).toString('base64'), mime_type: mimeDaImagem(imagemPronta) })
  }
  input.push({ type: 'text', text: prompt })

  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key }
  const falhaNaCriacao = (motivo) => {
    registrarCusto({
      servico: 'gemini-video', usd: custoUsd,
      contexto: `${contexto} ${modelo} ${segundos}s status=falha_criacao cobranca incerta`.trim(),
    })
    throw new Error(`Omni: a criacao do clipe falhou sem resposta clara (${motivo}); a geracao pode ter aberto e cobrado, confira no painel do Google antes de refazer`)
  }
  let r
  try {
    r = await fetchComTimeout(`${API}/interactions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        model: modelo,
        input,
        background: true,
        // duration no formato de duracao do Google ("8s"), em texto.
        response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p', duration: `${segundos}s` },
      }),
    }, { timeoutMs: PRAZO_CRIACAO_MS })
  } catch (e) {
    // Sem resposta (prazo, conexao que caiu depois de subir a imagem), nao da pra
    // saber se a geracao abriu do lado do Google: a cobranca nao pode sumir.
    falhaNaCriacao(ehTimeout(e) ? `nao respondeu em ${PRAZO_CRIACAO_MS / 1000} s` : e.message)
  }
  const criada = await lerJson(r)
  // Antes de a geracao abrir (400 de validacao, por exemplo) nao ha o que cobrar.
  if (!r.ok) throw new Error(`Omni nao abriu a geracao (HTTP ${r.status}), nada cobrado: ${JSON.stringify(criada).slice(0, 300)}`)
  // 200 e a geracao abriu, mas sem o id (corpo que nao chegou inteiro) nao da pra acompanhar.
  if (!criada?.id) falhaNaCriacao(`HTTP 200 sem o id da geracao: ${JSON.stringify(criada).slice(0, 200)}`)
  const id = criada.id
  console.error(`[clipe] gerando (${modelo}, ${segundos}s, ~${usd(custoUsd)})...`)
  abrirOperacao(pastaVideo, id)

  // Uma linha por cobranca, no desfecho, com o custo ESTIMADO (segundos x preco do
  // dia): o Omni cobra por token, e o total real fica no painel. O status diz se
  // teve entrega, e op= permite achar a geracao la.
  let tokens = ''
  const gravar = (status, extra = '', usdLinha = custoUsd) => {
    fecharOperacao(pastaVideo, id)
    registrarCusto({
      servico: 'gemini-video',
      usd: usdLinha,
      contexto: `${contexto} ${modelo} ${segundos}s status=${status}${extra}${tokens} op=${id}`.trim(),
    })
  }

  let st = null
  let ultimoErro = null
  // Teto pelo relogio de verdade tambem: cada pergunta pode levar ate PRAZO_POLL_MS,
  // e so a contagem de voltas deixaria os 10 minutos virarem mais de uma hora.
  const limite = Date.now() + MAX_POLLS * INTERVALO_POLL_MS
  for (let i = 0; i < MAX_POLLS && Date.now() < limite; i++) {
    await new Promise((s) => setTimeout(s, INTERVALO_POLL_MS))
    // Erro de transporte (rede, prazo, HTTP nao-ok, corpo que nao e JSON) e tentativa
    // perdida, nao desfecho: a geracao segue aberta do lado do Google e pode ja
    // ter sido cobrada. O loop continua; se estourar o teto, cai no timeout abaixo.
    // Geracao que o Google derruba ("high demand", teste pago da 5.19) nao vira status
    // failed: vira HTTP 5xx com corpo de erro em toda pergunta. Mesmo assim espera o
    // teto, porque desistir antes e apagar o id pode jogar fora um clipe que ainda
    // sai (e a pessoa pagaria outro); o erro do Google vai junto no timeout.
    let resp
    try {
      const p = await fetchComTimeout(`${API}/interactions/${id}`, { headers }, { timeoutMs: PRAZO_POLL_MS })
      if (!p.ok) {
        const corpo = p.status >= 500 ? await lerJson(p) : null
        ultimoErro = corpo?.error ?? null
        continue
      }
      ultimoErro = null
      resp = await p.json()
    } catch { continue }
    // 200 com corpo `null` (ou vazio) tambem e tentativa perdida, nunca desfecho
    if (!resp) continue
    if (RODANDO.has(resp.status)) continue
    st = resp
    break
  }
  if (!st) {
    gravar('timeout', ' cobranca incerta')
    const google = ultimoErro ? `; a ultima resposta do Google foi erro: ${JSON.stringify(ultimoErro).slice(0, 300)}` : ''
    throw new Error(`Omni nao terminou o clipe em 10 minutos${google}`)
  }
  const saidaTokens = st.usage?.total_output_tokens
  if (Number.isFinite(saidaTokens)) tokens = ` tokens_saida=${saidaTokens}`

  const erros = JSON.stringify(st.errors ?? [])
  const video = videoDaResposta(st)
  if (!video) {
    // A falha que a API diz nao ter cobrado se repete; o resto grava e estoura.
    if (/have not been charged/i.test(erros)) {
      fecharOperacao(pastaVideo, id)
      if (_tentativa < MAX_TENTATIVAS_AUDIO) {
        console.error(`[clipe] falha transitoria do Omni (nao cobrada). Tentativa ${_tentativa} de ${MAX_TENTATIVAS_AUDIO}, repetindo...`)
        await new Promise((s) => setTimeout(s, 3000 * _tentativa))
        return gerarClipe({ prompt, imagemPath, segundos, saida, dryRun, precoUsdPorSegundo, registrarCusto, contexto, pastaVideo, _tentativa: _tentativa + 1 })
      }
      throw new Error(`Omni devolveu ${MAX_TENTATIVAS_AUDIO}x a falha transitoria de audio (nenhuma cobrada). Ultima: ${erros.slice(0, 200)}`)
    }
    if (st.status === 'failed' || st.status === 'cancelled') {
      gravar('falha_operacao', ' cobranca incerta')
      throw new Error(`Omni falhou (status ${st.status}): ${erros.slice(0, 300)}`)
    }
    gravar('filtrada', ' cobranca incerta')
    throw new Error(`Omni terminou sem video (status ${st.status}): ${JSON.stringify({ status: st.status, errors: st.errors }).slice(0, 400)}`)
  }

  // A geracao entregou: o que vier quebrado aqui ja foi cobrado.
  const buf = Buffer.from(video.data, 'base64')
  const pareceVideo = String(video.mime_type ?? '').startsWith('video/') && buf.length >= TAMANHO_MINIMO_VIDEO_BYTES
  if (!pareceVideo) {
    gravar('falha_download')
    throw new Error(`O video que o Omni devolveu nao parece valido (mime_type "${video.mime_type}", ${buf.length} bytes)`)
  }

  // Grava a cobranca ANTES do arquivo: falha de disco nao pode apagar o gasto.
  gravar('sucesso')
  fs.writeFileSync(saida, buf)
  return { arquivo: saida, custoUsd }
}
