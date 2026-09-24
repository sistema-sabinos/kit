// Chamada autenticada a API v3 do Bling: token renovado sozinho (tokens.mjs), prazo por
// requisicao e espera no 429 (o Bling aceita 3 por segundo). Erro do Bling sobe com a
// mensagem original dele, porque e ela que diz qual campo esta errado.
// Uso: const req = clienteBling(); const r = await req('GET', '/depositos')
import { tokenBling } from './tokens.mjs'
import { fetchComTimeout } from './fetch-timeout.mjs'

export const API_BLING = 'https://api.bling.com.br/Api/v3'

export function montarUrl(caminho, query) {
  let url = API_BLING + (String(caminho).startsWith('/') ? caminho : '/' + caminho)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) for (const item of v) qs.append(k, String(item))
    else qs.append(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

export function clienteBling({ token, fetchFn = fetchComTimeout, tentativas = 4, esperaMs = 500 } = {}) {
  return async function req(metodo, caminho, { query, corpo } = {}) {
    const t = token || (await tokenBling())
    const headers = { authorization: `Bearer ${t}`, accept: 'application/json' }
    const init = { method: metodo, headers }
    if (corpo !== undefined && corpo !== null) {
      headers['content-type'] = 'application/json'
      init.body = typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
    }
    const url = montarUrl(caminho, query)
    for (let i = 1; ; i++) {
      const r = await fetchFn(url, init)
      if (r.status === 429 && i < tentativas) {
        const depois = Number(r.headers?.get?.('retry-after'))
        const ms = Number.isFinite(depois) && depois > 0 ? depois * 1000 : esperaMs * 2 ** (i - 1)
        if (ms > 0) await new Promise(res => setTimeout(res, ms))
        continue
      }
      const texto = await r.text()
      let dados = null
      try { dados = texto ? JSON.parse(texto) : null } catch { dados = { bruto: texto } }
      if (!r.ok) {
        const erro = new Error(`o Bling recusou ${metodo} ${caminho}: ${r.status} ${JSON.stringify(dados).slice(0, 500)}`)
        erro.status = r.status
        erro.resposta = dados
        throw erro
      }
      return dados
    }
  }
}
