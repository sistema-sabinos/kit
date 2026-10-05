// Configuracao do pacote de midia social: o bloco config de _contexto/midia-social.md e o .env.
// O aluno comeca sem nada configurado, entao chave faltando diz qual secao do guia resolve.
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from './raiz.mjs'

export const GUIA = '.claude/skills/midia-social/referencias/configurar.md'

// Secao -> chaves. Escrito assim (e nao chave -> secao) porque "NOME_DA_CHAVE: 'texto'" parece segredo
// atribuido pro Gate 1 do kit.
const CHAVES_POR_SECAO = [
  ['Buffer', ['BUFFER_API_KEY', 'organizacao_buffer', 'canal_instagram', 'canal_tiktok', 'canal_youtube']],
  ['Deposito do video', ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'R2_BUCKET', 'R2_URL_PUBLICA']],
  ['Instagram', ['IG_ACCESS_TOKEN', 'IG_TOKEN_VENCE_EM']],
]
export const SECAO_DO_GUIA = Object.fromEntries(CHAVES_POR_SECAO.flatMap(([secao, chaves]) => chaves.map(c => [c, secao])))

export function parseConfig(texto) {
  const m = String(texto).match(/```config\r?\n([\s\S]*?)```/)
  if (!m) return {}
  const out = {}
  for (const crua of m[1].split(/\r?\n/)) {
    const linha = crua.replace(/#.*$/, '').trim()
    const i = linha.indexOf(':')
    if (i <= 0) continue
    const valor = linha.slice(i + 1).trim()
    if (valor) out[linha.slice(0, i).trim()] = valor
  }
  return out
}

export function parseEnv(texto) {
  const out = {}
  for (const crua of String(texto).split(/\r?\n/)) {
    const linha = crua.trim()
    if (!linha || linha.startsWith('#')) continue
    const i = linha.indexOf('=')
    if (i === -1) continue
    let valor = linha.slice(i + 1).trim()
    if (valor.length >= 2 && /^(["']).*\1$/.test(valor)) valor = valor.slice(1, -1)
    out[linha.slice(0, i).trim().replace(/^export\s+/, '')] = valor
  }
  return out
}

// Grava chaves no .env sem perder nenhuma outra: troca a linha que existe, acrescenta a que falta, mantem o
// final de linha do arquivo, grava em temporario e renomeia. Um .env truncado gravado por cima apagaria tudo.
export function gravarEnv(patch, { raiz = RAIZ } = {}) {
  const arq = join(raiz, '.env')
  const texto = existsSync(arq) ? readFileSync(arq, 'utf8') : ''
  const fim = texto.includes('\r\n') ? '\r\n' : '\n'
  const ehChave = l => /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l)
  const vistas = new Set()
  const linhas = (texto ? texto.split(/\r?\n/) : []).map(l => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)
    if (m && Object.prototype.hasOwnProperty.call(patch, m[1])) { vistas.add(m[1]); return `${m[1]}=${patch[m[1]]}` }
    return l
  })
  while (linhas.length && linhas[linhas.length - 1] === '') linhas.pop()
  for (const [k, v] of Object.entries(patch)) if (!vistas.has(k)) linhas.push(`${k}=${v}`)
  if (linhas.filter(ehChave).length < texto.split(/\r?\n/).filter(ehChave).length) throw new Error('a gravacao perderia chaves do .env: nada foi gravado')
  writeFileSync(arq + '.tmp', linhas.join(fim) + fim)
  renameSync(arq + '.tmp', arq)
}

export function lerConfig({ raiz = RAIZ } = {}) {
  const ler = rel => existsSync(join(raiz, rel)) ? readFileSync(join(raiz, rel), 'utf8') : ''
  return { config: parseConfig(ler(join('_contexto', 'midia-social.md'))), env: parseEnv(ler('.env')) }
}

export function exigir({ config, env }, chaves) {
  const faltam = chaves.filter(c => !(config[c] || env[c]))
  if (!faltam.length) return
  const linhas = faltam.map(c => `  ${c} (secao "${SECAO_DO_GUIA[c] || 'Configuracao'}")`)
  throw new Error(`falta configurar:\n${linhas.join('\n')}\nO passo a passo esta em ${GUIA}`)
}
