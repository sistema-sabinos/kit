// Passo opcional e pago: o Gemini olha cada foto e devolve uma ficha (papel da foto, rosto,
// texto, evidencia, confianca). Regras duras:
// - modelo descoberto na hora pela lista da API, nunca nome escrito aqui (modelo some sem aviso);
// - preco numa tabela datada; modelo fora da tabela RECUSA estimar e manda conferir o preco;
// - a linha de custo vai pro dados/custos.jsonl assim que a chamada paga volta, antes de
//   interpretar a resposta: se o JSON vier quebrado, o dinheiro ja foi gasto e fica anotado;
// - campo que o modelo nao ve com seguranca vale null.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { RAIZ } from '../../../mercado-livre/scripts/lib/raiz.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'

// US$ por 1 milhao de tokens, pagina oficial ai.google.dev/gemini-api/docs/pricing.
// O raciocinio do modelo e cobrado como saida. Preco muda: conferir na pagina e trocar aqui,
// com a data nova.
export const PRECOS = {
  'gemini-3.8-flash': { entrada: 0.75, saida: 3.75, promocional_ate: '2026-12-31', depois: { entrada: 1.5, saida: 7.5 }, conferido_em: '2026-10-04' },
  'gemini-3.7-flash': { entrada: 0.75, saida: 3.75, promocional_ate: '2026-12-31', depois: { entrada: 1.5, saida: 7.5 }, conferido_em: '2026-10-04' },
  'gemini-3.6-flash': { entrada: 0.75, saida: 3.75, promocional_ate: '2026-12-31', depois: { entrada: 1.5, saida: 7.5 }, conferido_em: '2026-10-04' },
  'gemini-3.5-flash': { entrada: 1.5, saida: 9, conferido_em: '2026-10-04' },
}
// Consumo medido por foto no motor de origem (1.540 de entrada e 1.060 de saida). O ensaio recalibra.
export const TOKENS_POR_FOTO = { entrada: 1540, saida: 1060 }
export const SEGUNDOS_POR_FOTO = 4

export const PAPEIS = [
  'gancho', 'o-que-vem-na-caixa', 'escala-tamanho-real', 'quebra-de-objecao',
  'ancoragem-de-valor', 'prova-social', 'modo-de-uso', 'ficha-tecnica',
  'procedencia-garantia', 'comparativo', 'aspiracional', 'oferta-urgencia',
]

// Fora: o que nao le imagem e devolve texto (embedding, voz, video, geracao de imagem).
const LIXO = /embedding|aqa|imagen|image|veo|tts|live|audio|thinking|lite/i

// O Flash estavel de versao mais alta. Nunca ordenar id como texto ("gemini-10" perde pra "gemini-9").
export function escolherFlash(ids) {
  const nota = id => {
    if (LIXO.test(id) || /preview|exp/i.test(id)) return null
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)-flash(?:-\d{3})?$/)
    return m ? { id, versao: parseFloat(m[1]) } : null
  }
  const lista = ids.map(nota).filter(Boolean).sort((a, b) => b.versao - a.versao)
  return lista.length ? lista[0].id : null
}

export async function descobrirModelo(chave, { buscar = fetch } = {}) {
  const r = await buscar(`${API}/models?key=${chave}&pageSize=300`)
  if (!r.ok) throw new Error(`o Gemini recusou a chave (${r.status}). Confira a GEMINI_API_KEY no .env e o faturamento no aistudio.google.com`)
  const j = await r.json()
  const ids = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
  const modelo = escolherFlash(ids)
  if (!modelo) throw new Error('a sua chave do Gemini nao lista nenhum modelo Flash estavel')
  return modelo
}

export function precoDoDia(modelo, hoje, precos = PRECOS) {
  const p = precos[modelo]
  if (!p) return null
  const depois = p.promocional_ate && hoje > p.promocional_ate
  return { entrada: depois ? p.depois.entrada : p.entrada, saida: depois ? p.depois.saida : p.saida, conferido_em: p.conferido_em, promocional_ate: depois ? null : p.promocional_ate ?? null }
}

export const custoUsd = (tokensEntrada, tokensSaida, preco) => (tokensEntrada * preco.entrada + tokensSaida * preco.saida) / 1e6

// Nunca gasta: so conta. Modelo fora da tabela volta recusado, com o motivo.
export function estimar({ fotos, modelo, hoje, precos = PRECOS }) {
  const preco = precoDoDia(modelo, hoje, precos)
  if (!preco) return { recusado: `o modelo ${modelo} nao esta na tabela de preco (scripts/lib/ver.mjs, PRECOS). Confira o preco na pagina oficial do Gemini e acrescente a linha antes de gastar` }
  const usd = fotos * custoUsd(TOKENS_POR_FOTO.entrada, TOKENS_POR_FOTO.saida, preco)
  return { modelo, fotos, usd: Math.round(usd * 100) / 100, minutos: Math.ceil((fotos * SEGUNDOS_POR_FOTO) / 60), preco }
}

const INSTRUCAO = `Voce analisa UMA foto de anuncio de marketplace brasileiro e devolve SO JSON, sem texto fora dele:
{
  "papel": um de ${JSON.stringify(PAPEIS)},
  "confianca": numero de 0 a 1,
  "rosto": true ou false (rosto humano visivel),
  "texto_grande": o texto em letra grande copiado literal, ou null,
  "texto": todo o texto legivel da foto copiado literal, ou null,
  "escala": true se a foto mostra o tamanho real (mao, regua, objeto conhecido do lado), senao false,
  "evidencia": o que exatamente na foto sustenta a sua leitura
}
REGRAS: nunca invente. Campo que voce nao ve com seguranca vale null. Texto e copia literal, nunca parafrase.`

export function validarFicha(f) {
  const erros = []
  if (!f || typeof f !== 'object') return ['a ficha nao e um objeto']
  if (f.papel !== null && !PAPEIS.includes(f.papel)) erros.push(`papel fora da lista: ${f.papel}`)
  if (typeof f.confianca !== 'number' || f.confianca < 0 || f.confianca > 1) erros.push('confianca precisa ser numero de 0 a 1')
  if (typeof f.evidencia !== 'string' || !f.evidencia.trim()) erros.push('falta evidencia')
  return erros
}

const MIMES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

async function chamarGemini({ modelo, chave, corpo, buscar = fetch }) {
  const r = await buscar(`${API}/models/${modelo}:generateContent?key=${chave}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

export const registrarCusto = (linha, raiz = RAIZ) => {
  mkdirSync(join(raiz, 'dados'), { recursive: true })
  appendFileSync(join(raiz, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n')
}

// Uma chamada paga por foto. O custo sai dos tokens que a propria resposta informa.
export async function fichaDaFoto(caminho, contexto, { modelo, chave, preco, chamar = chamarGemini, registrar = registrarCusto, ler = readFileSync, agora = () => new Date().toISOString() }) {
  const mime = MIMES[extname(caminho).toLowerCase()] || 'image/jpeg'
  const corpo = {
    contents: [{ parts: [
      { text: `${INSTRUCAO}\n\nAnuncio: ${contexto.titulo ?? 'sem titulo'} (foto ${contexto.ordem} de ${contexto.total}).` },
      { inlineData: { mimeType: mime, data: ler(caminho).toString('base64') } },
    ] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  }
  const j = await chamar({ modelo, chave, corpo })
  const entrada = j.usageMetadata?.promptTokenCount ?? 0
  const saida = (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0)
  const usd = Math.round(custoUsd(entrada, saida, preco) * 1e6) / 1e6
  // anotar e condicao pra seguir: se o arquivo nao aceita a linha, a rodada inteira para
  try { registrar({ em: agora(), servico: 'gemini-visao', modelo, tokens_entrada: entrada, tokens_saida: saida, usd, contexto: `engenharia-reversa ${contexto.id ?? ''}`.trim() }) } catch (e) {
    throw Object.assign(new Error(`a foto ${contexto.ordem} de ${contexto.id ?? '?'} foi cobrada (US$ ${usd}) e o custo nao foi anotado em dados/custos.jsonl (${e.message}); parei pra nao seguir pagando sem anotar. Anote essa linha a mao`), { fatal: true })
  }
  if (contexto.gasto) contexto.gasto.usd += usd
  const ficha = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
  const erros = validarFicha(ficha)
  // a ordem vem do laco, nunca do que o modelo ecoou
  return { ...ficha, ordem: contexto.ordem, valida: !erros.length, erros }
}

// fotosPorAnuncio: [{ id, titulo, fotos: [caminho...] }] -> { fichas: { [id]: [ficha...] }, gasto_usd, parou }
// Foto que falha vira ficha com erro e a rodada segue; custo que nao pode ser anotado para tudo.
// `limite` e o teto do gasto REAL (a soma das linhas anotadas), alem do teto da estimativa.
export async function verFotos(fotosPorAnuncio, opcoes, { log = () => {}, limite = Infinity } = {}) {
  const fichas = {}
  const gasto = { usd: 0 }
  let parou = false
  for (const a of fotosPorAnuncio) {
    if (parou) break
    fichas[a.id] = []
    for (const [i, caminho] of a.fotos.entries()) {
      if (gasto.usd >= limite - 1e-9) { parou = true; break }
      const contexto = { id: a.id, titulo: a.titulo, ordem: i + 1, total: a.fotos.length, gasto }
      try { fichas[a.id].push(await fichaDaFoto(caminho, contexto, opcoes)) } catch (e) {
        if (e.fatal) throw e
        fichas[a.id].push({ ordem: i + 1, erro: String(e.message).slice(0, 200), valida: false })
      }
    }
    log(`${a.id}: ${fichas[a.id].filter(f => f.valida).length} de ${a.fotos.length} fotos lidas`)
  }
  if (parou) log(`parei no limite de gasto: US$ ${Math.round(gasto.usd * 1e4) / 1e4} de US$ ${limite}`)
  return { fichas, gasto_usd: Math.round(gasto.usd * 1e6) / 1e6, parou }
}
