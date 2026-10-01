// Leitura e escrita autenticadas na API do Mercado Livre: token renovado sozinho (tokens.mjs) e
// prazo por requisicao (fetch-timeout.mjs). A leitura tenta de novo em 429 e 5xx, que sao
// passageiros; a escrita nunca repete (ver mlEscrever).
// Uso: const conta = await mlGet('/users/123')
// Varias chamadas seguidas: pegue o token uma vez e passe em { token }, pra nao ler o .env a cada uma.
import { tokenMl } from './tokens.mjs'
import { fetchComTimeout } from './fetch-timeout.mjs'
import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

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

// Escrita (POST e PUT com JSON). Tenta UMA vez so, de proposito: repetir um POST que pode ter
// chegado cria anuncio em dobro. Recusa da API (4xx, 5xx) volta como dado, porque a validacao do
// Mercado Livre responde 400 com a lista do que esta errado, e quem chama precisa ler essa lista.
// So queda de rede lanca, marcada com semResposta: ninguem sabe se o pedido chegou.
export async function mlEscrever(metodo, caminho, corpo, { token, fetchFn = fetchComTimeout } = {}) {
  const t = token || (await tokenMl())
  const headers = { authorization: `Bearer ${t}`, accept: 'application/json', 'content-type': 'application/json' }
  let r
  try {
    r = await fetchFn(urlDa(caminho), { method: metodo, headers, body: JSON.stringify(corpo ?? {}) })
  } catch (e) {
    const erro = new Error(`a resposta do Mercado Livre nao chegou (${urlDa(caminho).split('?')[0]}): ${e.message || e}`)
    erro.semResposta = true
    throw erro
  }
  const texto = await r.text().catch(() => '')
  let dado = null
  if (texto) {
    try { dado = JSON.parse(texto) } catch { dado = { message: texto.slice(0, 300) } }
  }
  return { ok: r.ok, status: r.status, dado }
}

const TIPO_IMAGEM = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }

// Sobe uma imagem do computador pro Mercado Livre (multipart) e devolve o id dela, que entra no
// anuncio como { id }. Imagem sozinha nao aparece pra ninguem ate entrar num anuncio.
export async function mlSubirImagem(arquivo, { token, fetchFn = fetchComTimeout, ler = readFileSync } = {}) {
  const tipo = TIPO_IMAGEM[extname(arquivo).toLowerCase()]
  if (!tipo) throw new Error(`${basename(arquivo)}: o Mercado Livre so aceita JPG ou PNG`)
  const t = token || (await tokenMl())
  const form = new FormData()
  form.append('file', new Blob([ler(arquivo)], { type: tipo }), basename(arquivo))
  let r
  try {
    r = await fetchFn(urlDa('/pictures/items/upload'), { method: 'POST', headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, body: form })
  } catch (e) {
    throw new Error(`${basename(arquivo)}: a resposta do Mercado Livre nao chegou: ${e.message || e}`)
  }
  const texto = await r.text().catch(() => '')
  let dado = null
  try { dado = JSON.parse(texto) } catch {}
  if (!r.ok || !dado?.id) throw new Error(`${basename(arquivo)}: o Mercado Livre recusou a imagem (${r.status} ${dado?.message || texto.slice(0, 200)})`)
  return { id: dado.id }
}
