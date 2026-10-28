#!/usr/bin/env node
// Gera o codigo de 2FA da conta (TOTP do RFC 6238: SHA-1, 30 segundos, 6 digitos) a partir da
// semente que a pessoa colou no .env, so na conta em que ligou o relogin automatico
// (referencias/relogar.md). Sem pacote: node:crypto.
// Uso, da raiz do projeto: node .claude/skills/conectar/scripts/totp.mjs <CONTA>
// Le <CONTA>_TOTP do .env da raiz e imprime so o codigo, nunca a semente. Sem a variavel sai 2.
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const CONTA = /^[A-Z][A-Z0-9_]*$/

// A semente vem como o app autenticador mostra no "nao consigo ler o QR": base32, com espaco e
// caixa a gosto. O recado de erro nunca leva a semente.
export function base32(semente) {
  const limpa = String(semente).replace(/[\s=-]/g, '').toUpperCase()
  if (!limpa) throw new Error('semente vazia')
  let bits = ''
  for (const letra of limpa) {
    const v = ALFABETO.indexOf(letra)
    if (v < 0) throw new Error('semente com caractere fora do base32 (A a Z e 2 a 7)')
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function codigo(semente, agoraMs = Date.now()) {
  const passo = Math.floor(agoraMs / 1000 / 30)
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(passo))
  const h = createHmac('sha1', base32(semente)).update(contador).digest()
  // truncamento dinamico do RFC 4226: os 4 bits finais dizem de onde tirar os 4 bytes
  const i = h[h.length - 1] & 0x0f
  const n = ((h[i] & 0x7f) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

// NOME=valor por linha, comentario com #, aspas em volta saem; o mesmo formato do chave.mjs
export function lerEnv(texto) {
  const valores = new Map()
  for (const linha of String(texto).split(/\r?\n/)) {
    const l = linha.trim()
    if (!l || l.startsWith('#')) continue
    const m = l.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) v = v.slice(1, -1)
    valores.set(m[1], v)
  }
  return valores
}

function direto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (direto()) {
  const conta = process.argv[2] || ''
  if (!CONTA.test(conta)) {
    console.error('uso: node .claude/skills/conectar/scripts/totp.mjs <CONTA>, com a conta em maiuscula (ML, por exemplo)')
    process.exit(2)
  }
  let texto = ''
  try { texto = readFileSync(join(RAIZ, '.env'), 'utf8') } catch {}
  const semente = lerEnv(texto).get(`${conta}_TOTP`)
  if (!semente) {
    console.error(`falta ${conta}_TOTP no .env`)
    process.exit(2)
  }
  try {
    console.log(codigo(semente))
  } catch (e) {
    console.error(`${conta}_TOTP no .env: ${e.message}`)
    process.exit(2)
  }
}
