// Chave e escolha de modelo. O modelo e DESCOBERTO em runtime, nunca chumbado:
// os nomes mudam e saem do ar, e uma lista fixa quebra a skill inteira.
import { join } from 'node:path'
import { lerEnv } from '../../../mercado-livre/scripts/lib/env.mjs'
import { RAIZ } from '../../../mercado-livre/scripts/lib/raiz.mjs'
import { fetchComTimeout } from './fetch-timeout.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'

export function carregarChave({ env = process.env, raiz = RAIZ } = {}) {
  // TRAVA DURA DE TESTE. Toda chamada paga desta skill (clipe, voz, transcricao,
  // musica) passa por aqui antes de falar com a rede, entao bloquear a chave
  // bloqueia o gasto inteiro, inclusive em processo filho (herda o ambiente).
  if (env.GEMINI_SEM_API === '1') {
    throw new Error('GEMINI_SEM_API=1: chamada de API bloqueada de proposito (modo teste). Fora de teste, tire a variavel do ambiente; num teste, algum caminho tentou GASTAR sem passar pelo gate.')
  }
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY
  const doEnv = lerEnv(join(raiz, '.env')).GEMINI_API_KEY
  if (doEnv) return doEnv
  throw new Error('falta GEMINI_API_KEY no .env do projeto (o /conectar ensina a pegar)')
}

// `metodo` null aceita o modelo sem olhar o supportedGenerationMethods (o Lyria fala
// pela Interactions API, e o metodo que o ListModels mostra pra ele pode mudar).
export async function escolherModelo(padrao, metodo = 'generateContent') {
  const key = carregarChave()
  // A listagem e de graca e rapida: prazo curto, pra conexao presa nao pendurar a fase.
  const r = await fetchComTimeout(`${API}/models?key=${key}&pageSize=300`, {}, { timeoutMs: 30_000 })
  if (!r.ok) throw new Error(`a listagem de modelos do Google voltou HTTP ${r.status}`)
  const j = await r.json()
  // Duas travas. (1) so modelo que a propria API diz que aceita o metodo pedido
  // (generateContent por padrao). (2) so id das familias que a gente usa: gemini-,
  // veo- e lyria-.
  const ids = (j.models ?? [])
    .filter((m) => metodo === null || (m.supportedGenerationMethods ?? []).includes(metodo))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((id) => /^(gemini|veo|lyria)-/.test(id) && padrao.test(id))
  if (!ids.length) throw new Error(`nenhum modelo casa com ${padrao} (metodo ${metodo ?? 'qualquer'})`)
  // Versao mais nova primeiro, so a que vem logo depois do prefixo da familia (o
  // gemini-omni- conta como prefixo). Nunca pegar numero solto no meio do nome,
  // senao sufixo de data vira versao.
  const versao = (id) => parseFloat(id.match(/^(?:gemini|veo|lyria)-(?:omni-)?(\d+(?:\.\d+)?)/)?.[1] ?? '0')
  return ids.sort((a, b) => versao(b) - versao(a))[0]
}
