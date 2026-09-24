// Leitura autenticada da API do Mercado Livre: token renovado sozinho (tokens.mjs), prazo por
// requisicao (fetch-timeout.mjs) e nova tentativa em 429 e 5xx, que sao passageiros.
// Uso: const conta = await mlGet('/users/123')
// Varias chamadas seguidas: pegue o token uma vez e passe em { token }, pra nao ler o .env a cada uma.
import { tokenMl } from './tokens.mjs'
import { fetchComTimeout } from './fetch-timeout.mjs'

export const API_ML = 'https://api.mercadolibre.com'

export function urlDa(caminho) {
  const s = String(caminho)
  if (s.startsWith('http')) return s
  return API_ML + (s.startsWith('/') ? s : '/' + s)
}

export async function mlGet(caminho, { token, fetchFn = fetchComTimeout, tentativas = 3, esperaMs = 1200, apiVersion } = {}) {
  const t = token || (await tokenMl())
  const headers = { authorization: `Bearer ${t}`, accept: 'application/json' }
  if (apiVersion) headers['api-version'] = String(apiVersion)
  let ultimo = ''
  let status
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetchFn(urlDa(caminho), { headers })
      if (r.ok) return r.status === 204 ? {} : await r.json()
      status = r.status
      ultimo = `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`.trim()
      if (!(r.status === 429 || r.status >= 500)) break
    } catch (e) {
      status = undefined
      ultimo = e.message || String(e)
    }
    if (i < tentativas && esperaMs > 0) await new Promise(res => setTimeout(res, esperaMs * i))
  }
  // a query sai da mensagem: token e filtro de conta viajam ali
  const erro = new Error(`a API do Mercado Livre recusou ${urlDa(caminho).split('?')[0]}: ${ultimo}`)
  erro.status = status
  throw erro
}
