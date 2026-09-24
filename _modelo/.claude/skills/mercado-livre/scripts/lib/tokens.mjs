#!/usr/bin/env node
// Token de acesso do Mercado Livre e do Bling, com renovacao automatica.
// Le o .env do projeto; se o token vence em menos de 5 minutos, troca o refresh_token por
// um novo e grava de volta (data em ISO). Uso direto: node tokens.mjs ml|bling
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerEnv, gravarEnv, CAMINHO_ENV } from './env.mjs'
import { fetchComTimeout } from './fetch-timeout.mjs'

export const MARGEM_MS = 5 * 60 * 1000
export const URL_TOKEN_ML = 'https://api.mercadolibre.com/oauth/token'
export const URL_TOKEN_BLING = 'https://api.bling.com.br/Api/v3/oauth/token'

// Aceita ISO ou numero em milissegundos. Sem data, ou data que nao se le, conta como vencido:
// um refresh a mais e barato, uma chamada com token morto derruba a rodada inteira.
export function expirou(expiraEm, agora = Date.now(), margemMs = MARGEM_MS) {
  if (expiraEm === undefined || expiraEm === null) return true
  const s = String(expiraEm).trim()
  if (!s) return true
  const t = /^\d+$/.test(s) ? Number(s) : Date.parse(s)
  if (!Number.isFinite(t)) return true
  return t - agora < margemMs
}

export function chavesDe(servico) {
  const P = servico === 'ml' ? 'ML' : servico === 'bling' ? 'BLING' : null
  if (!P) throw new Error(`servico desconhecido: ${servico} (use ml ou bling)`)
  return { id: `${P}_CLIENT_ID`, segredo: `${P}_CLIENT_SECRET`, acesso: `${P}_ACCESS_TOKEN`, refresh: `${P}_REFRESH_TOKEN`, expira: `${P}_TOKEN_EXPIRES_AT` }
}

export function pedidoDeRefresh(servico, env) {
  const k = chavesDe(servico)
  for (const c of [k.id, k.segredo, k.refresh]) {
    if (!env[c]) throw new Error(`falta ${c} no .env. Rode /conectar (Mercado Livre e Bling) ou node .claude/skills/mercado-livre/scripts/autorizar.mjs --${servico} --url`)
  }
  const form = { 'content-type': 'application/x-www-form-urlencoded' }
  if (servico === 'ml') {
    return { url: URL_TOKEN_ML, init: { method: 'POST', headers: { ...form, accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env[k.id], client_secret: env[k.segredo], refresh_token: env[k.refresh] }).toString() } }
  }
  const basic = Buffer.from(`${env[k.id]}:${env[k.segredo]}`).toString('base64')
  return { url: URL_TOKEN_BLING, init: { method: 'POST', headers: { ...form, accept: '1.0', authorization: `Basic ${basic}`, 'enable-jwt': '1' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env[k.refresh] }).toString() } }
}

export function patchDeToken(servico, resposta, agora = Date.now()) {
  const k = chavesDe(servico)
  if (!resposta || !resposta.access_token) throw new Error(`resposta do ${servico} sem access_token`)
  const segundos = Number(resposta.expires_in) || 0
  const patch = { [k.acesso]: resposta.access_token, [k.expira]: new Date(agora + segundos * 1000).toISOString() }
  if (resposta.refresh_token) patch[k.refresh] = resposta.refresh_token
  // o ML devolve o id da conta junto do token; as outras skills precisam dele pra chamar a API
  if (servico === 'ml' && resposta.user_id !== undefined && resposta.user_id !== null) patch.ML_USER_ID = String(resposta.user_id)
  return patch
}

async function renovar(servico, env, { fetchFn, tentativas = 4, esperaMs = 2000, log = () => {} }) {
  const { url, init } = pedidoDeRefresh(servico, env)
  let ultimo = ''
  let status
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetchFn(url, init)
      if (r.ok) return await r.json()
      status = r.status
      ultimo = `${r.status} ${await r.text().catch(() => '')}`.trim()
      if (!(r.status === 429 || r.status >= 500)) break
      log(`renovar ${servico}: ${r.status}, tentativa ${i} de ${tentativas}`)
    } catch (e) {
      status = undefined
      ultimo = e.message || String(e)
      log(`renovar ${servico}: ${ultimo}, tentativa ${i} de ${tentativas}`)
    }
    if (i < tentativas && esperaMs > 0) await new Promise(res => setTimeout(res, esperaMs * i))
  }
  const erro = new Error(`renovar o token do ${servico} falhou: ${ultimo}`)
  erro.status = status
  throw erro
}

const NOME_DO_SERVICO = { ml: 'Mercado Livre', bling: 'Bling' }

export async function token(servico, { caminhoEnv = CAMINHO_ENV, fetchFn = fetchComTimeout, agora = Date.now(), esperaMs, tentativas, log } = {}) {
  const env = lerEnv(caminhoEnv)
  const k = chavesDe(servico)
  if (env[k.acesso] && !expirou(env[k.expira], agora)) return env[k.acesso]
  let resposta
  try {
    resposta = await renovar(servico, env, { fetchFn, esperaMs, tentativas, log })
  } catch (e) {
    if (e.status !== 400) throw e
    // 400 no refresh: ou outro processo renovou primeiro (o refresh antigo morreu na mao dele)
    // ou a autorizacao venceu. Se o .env ganhou token novo e vivo nesse meio tempo, e o primeiro caso.
    const agoraEnv = lerEnv(caminhoEnv)
    if (agoraEnv[k.acesso] && agoraEnv[k.acesso] !== env[k.acesso] && !expirou(agoraEnv[k.expira], agora)) return agoraEnv[k.acesso]
    throw new Error(`a autorizacao do ${NOME_DO_SERVICO[servico]} venceu ou foi usada por outro processo. Rode: node .claude/skills/mercado-livre/scripts/autorizar.mjs --${servico} --url`)
  }
  const patch = patchDeToken(servico, resposta, agora)
  gravarEnv(patch, caminhoEnv)
  return patch[k.acesso]
}

export const tokenMl = opcoes => token('ml', opcoes)
export const tokenBling = opcoes => token('bling', opcoes)

// Frase do uso direto: diz ate quando o token vale, sem nunca mostrar o token na tela.
export function resumoDoToken(servico, env) {
  return `token do ${servico} valido ate ${env[chavesDe(servico).expira]}`
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    await token(process.argv[2])
    console.log(resumoDoToken(process.argv[2], lerEnv()))
  } catch (e) { console.error(e.message); process.exit(1) }
}
