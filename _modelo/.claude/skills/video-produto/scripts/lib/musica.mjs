// Cama de musica do video, gerada por nos no Lyria 3.
//
// Regra da casa: todo video tem musica de fundo. Sem ela o video fica "sem animo",
// por isso a fase 3 se RECUSA a montar sem cama.
//
// Por que a musica e GERADA e nunca pega de biblioteca: o marketplace proibe musica
// de propriedade de terceiros, e trilha de rede social e o erro que mais derruba
// Clips. Musica que a gente gera e nossa.
//
// O ESTILO depende do produto: suplemento de longevidade pede calma, papelaria
// infantil pede animada. Quem escolhe e o roteiro, no campo `musica.estilo`, e a
// escolha e consciente: nao existe estilo padrao silencioso pra todo produto.
//
// Dinheiro: o preco da geracao vem de quem chama (precoUsd, preco do dia). Uma
// geracao, uma linha no registro de custos, gravada no desfecho: sucesso e 200 sem
// audio gravam (o Lyria cobrou), erro de HTTP nao grava.
// Modelo: descoberto no ListModels (o Pro, que faz varios minutos numa chamada so;
// o clip trava em 30 s). `modelo` explicito tem prioridade (flag --modelo-musica).
import fs from 'node:fs'
import { carregarChave, escolherModelo } from './gemini.mjs'
import { registrarCusto as registrarCustoPadrao } from '../../../configurar-video/scripts/lib/custos.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta/interactions'

// A base vale pra qualquer produto: a cama existe pra sustentar a locucao, nao pra
// ser ouvida. Tudo que e "grande" (virada, climax, refrao, mudanca de dinamica)
// rouba a atencao da fala e e proibido aqui.
const BASE = [
  'Instrumental only, no vocals, no singing, no spoken words.',
  'This is a background bed that must sit UNDER a spoken voiceover and never compete with it.',
  'Keep it steady from start to finish: no big build, no drop, no sudden dynamic change, no dramatic ending.',
  'Leave space in the mid frequencies where the human voice sits.',
].join(' ')

export const ESTILOS = {
  calma: {
    quando: 'suplemento, saúde, longevidade, bem-estar, casa, público 40+',
    prompt: 'Warm, calm and hopeful acoustic bed. Soft nylon guitar, gentle piano, light warm pad, soft brushed percussion. 80 BPM, major key. Low energy, unhurried, reassuring.',
  },
  animada: {
    quando: 'papelaria, doces, presente, produto colorido, público jovem',
    prompt: 'Light, playful and upbeat bed. Ukulele or bright plucked guitar, claps, soft marimba, cheerful bass. 110 BPM, major key. Friendly and energetic without being frantic.',
  },
  moderna: {
    quando: 'tecnologia, casa inteligente, organização, produto de utilidade',
    prompt: 'Clean modern bed. Soft synth pad, muted electronic pulse, subtle percussive clicks, warm sub bass. 100 BPM. Neutral, competent and current, not futuristic or cold.',
  },
  elegante: {
    quando: 'beleza, cuidado pessoal, presente premium',
    prompt: 'Elegant and airy bed. Felt piano, soft strings pad, light shaker. 85 BPM, major key. Refined, gentle and unhurried.',
  },
}

export function promptDeMusica(estilo, { segundos = 70 } = {}) {
  const escolhido = ESTILOS[estilo]
  if (!escolhido) {
    throw new Error(`estilo de música "${estilo}" não existe. Os que existem: ${Object.keys(ESTILOS).join(', ')} (ver lib/musica.mjs, cada um diz pra que tipo de produto serve)`)
  }
  // pede com folga: sobra a gente corta na montagem, falta obrigaria a repetir
  // a faixa e a emenda apareceria.
  return `${escolhido.prompt} ${BASE} About ${Math.ceil(segundos)} seconds long.`
}

async function descobrirModelo() {
  try {
    return await escolherModelo(/^lyria-.*pro/)
  } catch (e) {
    throw new Error(`nao achei modelo Lyria Pro na sua chave (${e.message}). Veja os nomes no ListModels e passe --modelo-musica=<nome>. Nada foi gerado nem cobrado.`)
  }
}

export async function gerarMusica({ estilo, segundos, saida, dryRun = false, precoUsd, modelo, registrarCusto = registrarCustoPadrao, contexto = '' }) {
  const prompt = promptDeMusica(estilo, { segundos })
  if (dryRun) {
    return { arquivo: null, custoUsd: 0, prompt, dryRun: true }
  }
  if (!Number.isFinite(precoUsd) || precoUsd <= 0) {
    throw new Error('falta o preco do dia da musica (precoUsd): confira o preco atual do Lyria e passe --preco-musica-usd. Nada foi chamado.')
  }

  const key = carregarChave()
  const modeloUsado = modelo || await descobrirModelo()
  const gravar = (status) => registrarCusto({
    servico: 'gemini-musica',
    usd: precoUsd,
    contexto: `${contexto} ${modeloUsado} status=${status}`.trim(),
  })

  const r = await fetch(API, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modeloUsado, input: prompt }),
  })

  if (!r.ok) {
    throw new Error(`Lyria devolveu HTTP ${r.status}, nada cobrado: ${(await r.text()).slice(0, 300)}`)
  }

  // 200 com corpo ilegivel: o Lyria cobrou, entao grava antes de estourar.
  let j
  try { j = await r.json() } catch (e) {
    gravar('falha_download')
    throw new Error(`Lyria respondeu 200 mas o corpo nao e JSON: ${e.message}`)
  }
  // o audio vem em base64 dentro de um bloco `audio` dos steps. Se nao vier, e erro
  // barulhento: devolver arquivo vazio faria a montagem seguir com cama muda.
  const dados = (j.steps ?? [])
    .flatMap((s) => s.content ?? [])
    .find((c) => c.type === 'audio' && c.data)?.data
  if (!dados) {
    gravar('falha_download')
    throw new Error(`Lyria respondeu 200 mas sem áudio no corpo: ${JSON.stringify(j).slice(0, 300)}`)
  }

  // Grava a cobranca ANTES do arquivo: falha de disco nao pode apagar o gasto.
  gravar('sucesso')
  fs.writeFileSync(saida, Buffer.from(dados, 'base64'))
  return { arquivo: saida, custoUsd: precoUsd, prompt }
}
