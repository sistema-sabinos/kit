// Deposito do video: o Buffer nao recebe arquivo, so link publico, e busca a midia na hora de postar.
// Dois adaptadores: Cloudinary (padrao, gratis sem cartao) e R2 (saida quando o Cloudinary nao serve).
// Link com validade e recusado aqui, porque o post agendado falharia calado dias depois.
// Teto do Cloudinary gratis (100 MB por video) conferido em 2026-10-04.
import { readFileSync, statSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { basename, extname } from 'node:path'
import { exigir } from './config.mjs'

export const TETO_CLOUDINARY = 100 * 1024 * 1024

const sha256 = d => createHash('sha256').update(d).digest('hex')
const hmac = (k, d) => createHmac('sha256', k).update(d).digest()
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

export const tipoDoArquivo = arq => /\.(mp4|mov)$/i.test(arq) ? 'video' : 'image'

export function assinaturaCloudinary(params, segredo) {
  const base = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
  return createHash('sha1').update(base + segredo).digest('hex')
}

export async function subirCloudinary(env, arquivo, chave, { fetchFn = fetch, agora = new Date(), ler = readFileSync, tamanho = a => statSync(a).size } = {}) {
  exigir({ config: {}, env }, ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])
  if (tamanho(arquivo) > TETO_CLOUDINARY) throw new Error(`${basename(arquivo)} passa de 100 MB, o teto do Cloudinary gratis. Usar o R2 (secao "Deposito do video" do guia) ou exportar o video menor`)
  const tipo = tipoDoArquivo(arquivo)
  const params = { public_id: chave.replace(/\.[^./]+$/, ''), timestamp: Math.floor(agora.getTime() / 1000) }
  const form = new FormData()
  form.set('file', new Blob([ler(arquivo)], { type: MIME[extname(arquivo).toLowerCase()] || 'application/octet-stream' }), basename(arquivo))
  form.set('public_id', params.public_id)
  form.set('timestamp', String(params.timestamp))
  form.set('api_key', env.CLOUDINARY_API_KEY)
  form.set('signature', assinaturaCloudinary(params, env.CLOUDINARY_API_SECRET))
  const r = await fetchFn(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${tipo}/upload`, { method: 'POST', body: form })
  const j = await r.json()
  if (!r.ok || !j.secure_url) throw new Error(`Cloudinary recusou (HTTP ${r.status}): ${j.error?.message || 'sem detalhe'}`)
  return j.secure_url
}

export async function subirR2(env, arquivo, chave, { fetchFn = fetch, agora = new Date(), ler = readFileSync } = {}) {
  exigir({ config: {}, env }, ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'R2_BUCKET', 'R2_URL_PUBLICA'])
  const { R2_ACCESS_KEY_ID: ak, R2_SECRET_ACCESS_KEY: sk, CLOUDFLARE_ACCOUNT_ID: conta, R2_BUCKET: balde } = env
  const contentType = MIME[extname(arquivo).toLowerCase()] || 'application/octet-stream'
  const host = `${conta}.r2.cloudflarestorage.com`
  const body = ler(arquivo)
  const hash = sha256(body)
  const amz = agora.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dia = amz.slice(0, 8)
  const caminho = chave.split('/').map(encodeURIComponent).join('/')
  const uri = `/${balde}/${caminho}`
  const cabecalhos = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${hash}\nx-amz-date:${amz}\n`
  const assinados = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const canonico = ['PUT', uri, '', cabecalhos, assinados, hash].join('\n')
  const escopo = `${dia}/auto/s3/aws4_request`
  const paraAssinar = ['AWS4-HMAC-SHA256', amz, escopo, sha256(canonico)].join('\n')
  const chaveAss = hmac(hmac(hmac(hmac('AWS4' + sk, dia), 'auto'), 's3'), 'aws4_request')
  const assinatura = createHmac('sha256', chaveAss).update(paraAssinar).digest('hex')
  const r = await fetchFn(`https://${host}${uri}`, {
    method: 'PUT',
    headers: { Authorization: `AWS4-HMAC-SHA256 Credential=${ak}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}`, 'x-amz-date': amz, 'x-amz-content-sha256': hash, 'Content-Type': contentType },
    body,
  })
  if (r.status !== 200) throw new Error(`R2 HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return `${env.R2_URL_PUBLICA.replace(/\/+$/, '')}/${caminho}`
}

export function conferirUrl(url) {
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error(`o link do deposito precisa ser https: ${url}`)
  if ([...u.searchParams.keys()].some(k => /signature|expires|token|policy/i.test(k))) throw new Error(`o link do deposito tem validade e o post agendado falharia depois: ${url}`)
  return url
}

export async function subir({ config, env }, arquivo, chave, opts = {}) {
  const qual = config.deposito || 'cloudinary'
  if (qual === 'cloudinary') return conferirUrl(await subirCloudinary(env, arquivo, chave, opts))
  if (qual === 'r2') return conferirUrl(await subirR2(env, arquivo, chave, opts))
  throw new Error(`deposito "${qual}" desconhecido: usar cloudinary ou r2 em _contexto/midia-social.md`)
}
