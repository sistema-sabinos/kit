#!/usr/bin/env node
// Primeira autorizacao do Mercado Livre e do Bling: gera o link, recebe o codigo e grava os
// tokens no .env do projeto. As URLs de autorizacao foram conferidas na documentacao oficial
// em 2026-09-23.
//
// Uso, da raiz do projeto:
//   node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml --url        imprime o link de autorizacao
//   node .claude/skills/mercado-livre/scripts/autorizar.mjs --bling --url
//   node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml <codigo ou URL de retorno inteira>
//   node .claude/skills/mercado-livre/scripts/autorizar.mjs --bling <codigo ou URL de retorno inteira>
//   node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml --ouvir [porta]   receptor local em http://127.0.0.1:<porta>/callback (padrao 8765)
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerEnv, gravarEnv, CAMINHO_ENV } from './lib/env.mjs'
import { chavesDe, patchDeToken, URL_TOKEN_ML, URL_TOKEN_BLING } from './lib/tokens.mjs'
import { fetchComTimeout } from './lib/fetch-timeout.mjs'

export const URL_AUTORIZA_ML = 'https://auth.mercadolivre.com.br/authorization'
export const URL_AUTORIZA_BLING = 'https://www.bling.com.br/Api/v3/oauth/authorize'

export function urlDeAutorizacao(servico, env) {
  const k = chavesDe(servico)
  if (!env[k.id]) throw new Error(`falta ${k.id} no .env. Crie o aplicativo no portal de desenvolvedor e cole o id la.`)
  if (servico === 'ml') {
    if (!env.ML_REDIRECT_URI) throw new Error('falta ML_REDIRECT_URI no .env: a mesma URL de retorno cadastrada no aplicativo do Mercado Livre.')
    return `${URL_AUTORIZA_ML}?${new URLSearchParams({ response_type: 'code', client_id: env[k.id], redirect_uri: env.ML_REDIRECT_URI })}`
  }
  return `${URL_AUTORIZA_BLING}?${new URLSearchParams({ response_type: 'code', client_id: env[k.id], state: String(Date.now()) })}`
}

// Aceita o codigo puro ou a URL inteira de retorno, colada da barra do navegador.
export function codigoDe(entrada) {
  const s = String(entrada || '').trim()
  if (!s) throw new Error('faltou o codigo de autorizacao (ou a URL de retorno inteira).')
  if (/^https?:\/\//i.test(s)) {
    const code = new URL(s).searchParams.get('code')
    if (!code) throw new Error('a URL colada nao tem o parametro code. Copie a URL inteira da barra do navegador depois de autorizar.')
    return code
  }
  return s
}

export function pedidoDeTroca(servico, codigo, env) {
  const k = chavesDe(servico)
  for (const c of [k.id, k.segredo]) if (!env[c]) throw new Error(`falta ${c} no .env.`)
  const form = { 'content-type': 'application/x-www-form-urlencoded' }
  if (servico === 'ml') {
    return { url: URL_TOKEN_ML, init: { method: 'POST', headers: { ...form, accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: env[k.id], client_secret: env[k.segredo], code: codigo, redirect_uri: env.ML_REDIRECT_URI || '' }).toString() } }
  }
  const basic = Buffer.from(`${env[k.id]}:${env[k.segredo]}`).toString('base64')
  return { url: URL_TOKEN_BLING, init: { method: 'POST', headers: { ...form, accept: '1.0', authorization: `Basic ${basic}`, 'enable-jwt': '1' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: codigo }).toString() } }
}

export async function trocarCodigo(servico, codigo, { caminhoEnv = CAMINHO_ENV, fetchFn = fetchComTimeout, agora = Date.now() } = {}) {
  const env = lerEnv(caminhoEnv)
  const { url, init } = pedidoDeTroca(servico, codigo, env)
  const r = await fetchFn(url, init)
  if (!r.ok) throw new Error(`a troca do codigo no ${servico} falhou: ${r.status} ${await r.text()}`.trim())
  const patch = patchDeToken(servico, await r.json(), agora)
  gravarEnv(patch, caminhoEnv)
  return patch
}

// Escuta so em 127.0.0.1 (ninguem de fora da maquina alcanca o receptor) e so no /callback.
export function ouvirCallback({ porta = 8765, aoReceber, aoErro = e => { throw e } }) {
  const servidor = createServer((req, res) => {
    const u = new URL(req.url, `http://127.0.0.1:${porta || 80}`)
    res.setHeader('content-type', 'text/html; charset=utf-8')
    if (u.pathname !== '/callback') { res.statusCode = 404; res.end('<p>Nada aqui.</p>'); return }
    const erro = u.searchParams.get('error')
    if (erro) {
      res.end('<p>Autorizacao recusada. Pode fechar esta aba.</p>')
      servidor.close()
      aoErro(new Error('a autorizacao foi recusada no site: ' + (u.searchParams.get('error_description') || erro)))
      return
    }
    const code = u.searchParams.get('code')
    if (!code) { res.statusCode = 404; res.end('<p>Sem codigo nesta URL.</p>'); return }
    res.end('<p>Codigo recebido. Pode fechar esta aba e voltar pra conversa.</p>')
    servidor.close()
    aoReceber(code)
  })
  servidor.on('error', e => aoErro(e))
  servidor.listen(porta, '127.0.0.1')
  return servidor
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const a = process.argv.slice(2)
  const servico = a.includes('--ml') ? 'ml' : a.includes('--bling') ? 'bling' : null
  if (!servico) { console.error('diga --ml ou --bling'); process.exit(1) }
  try {
    if (a.includes('--url')) {
      console.log(urlDeAutorizacao(servico, lerEnv()))
    } else if (a.includes('--ouvir')) {
      const porta = Number(a[a.indexOf('--ouvir') + 1]) || 8765
      console.log(`Esperando o retorno em http://127.0.0.1:${porta}/callback. Essa URL precisa ser a mesma cadastrada no aplicativo e no .env.`)
      ouvirCallback({ porta, aoReceber: async code => {
        try { await trocarCodigo(servico, code); console.log(`Tokens do ${servico} gravados no .env.`) }
        catch (e) { console.error(e.message); process.exitCode = 1 }
      }, aoErro: e => {
        console.error(e.code === 'EADDRINUSE' ? `a porta ${porta} ja esta em uso. Feche o que esta usando ela ou escolha outra: --ouvir <porta>` : e.message)
        process.exit(1)
      } })
    } else {
      await trocarCodigo(servico, codigoDe(a.find(x => !x.startsWith('--'))))
      console.log(`Tokens do ${servico} gravados no .env.`)
    }
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
