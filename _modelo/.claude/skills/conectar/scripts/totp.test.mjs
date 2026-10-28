// Testes do gerador do codigo de 2FA (TOTP do RFC 6238). Os vetores sao os do apendice B do RFC,
// com a semente ASCII convertida em base32 aqui, e o CLI roda numa copia do script dentro de uma
// raiz temporaria, com .env de mentira.
// Rodar: node --test totp.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { codigo, base32, lerEnv } from './totp.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function emBase32(texto) {
  let bits = ''
  for (const b of Buffer.from(texto, 'ascii')) bits += b.toString(2).padStart(8, '0')
  while (bits.length % 5) bits += '0'
  let saida = ''
  for (let i = 0; i < bits.length; i += 5) saida += ALFABETO[parseInt(bits.slice(i, i + 5), 2)]
  return saida
}

const SEMENTE = emBase32('12345678901234567890')
// apendice B do RFC 6238, coluna SHA1, os 6 ultimos digitos dos 8 do RFC
const VETORES = [
  [59, '287082'], [1111111109, '081804'], [1111111111, '050471'],
  [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130'],
]

test('codigo: vetores do apendice B do RFC 6238 (SHA-1, 30 s, 6 digitos)', () => {
  assert.equal(SEMENTE.length, 32, 'canario: a conversao pra base32 da 32 letras')
  for (const [segundos, esperado] of VETORES) assert.equal(codigo(SEMENTE, segundos * 1000), esperado, `T=${segundos}`)
})

test('codigo: semente com espaco e minuscula da o mesmo codigo', () => {
  const solta = SEMENTE.toLowerCase().match(/.{1,4}/g).join(' ')
  assert.notEqual(solta, SEMENTE)
  assert.equal(codigo(solta, 59_000), codigo(SEMENTE, 59_000))
})

test('base32: letra fora do alfabeto recusa sem mostrar a semente', () => {
  const ruim = 'ABC' + '1' + 'DEF'
  assert.throws(() => base32(ruim), e => !e.message.includes(ruim) && /semente/.test(e.message))
})

test('lerEnv: le NOME=valor, ignora comentario e tira aspas', () => {
  const env = lerEnv('# x\nA=1\r\nexport B="dois"\nC=\n')
  assert.equal(env.get('A'), '1')
  assert.equal(env.get('B'), 'dois')
  assert.equal(env.get('C'), '')
})

function raizFalsa(envTexto) {
  const raiz = mkdtempSync(join(tmpdir(), 'totp-'))
  const scripts = join(raiz, '.claude', 'skills', 'conectar', 'scripts')
  mkdirSync(join(scripts, 'lib'), { recursive: true })
  copyFileSync(join(AQUI, 'totp.mjs'), join(scripts, 'totp.mjs'))
  copyFileSync(join(AQUI, 'lib', 'raiz.mjs'), join(scripts, 'lib', 'raiz.mjs'))
  if (envTexto !== null) writeFileSync(join(raiz, '.env'), envTexto)
  return { raiz, rodar: (...args) => spawnSync(process.execPath, [join(scripts, 'totp.mjs'), ...args], { encoding: 'utf8' }) }
}

test('CLI: imprime so o codigo, nunca a semente', () => {
  // isca montada em pedacos, pra o proprio teste nao carregar a semente inteira num literal
  const isca = ['JBSW', 'Y3DP', 'EHPK', '3PXP'].join('')
  const { raiz, rodar } = raizFalsa(`ML_TOTP=${isca}\n`)
  try {
    const r = rodar('ML')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^\d{6}\n$/)
    const tudo = r.stdout + r.stderr
    assert.ok(`x${isca}x`.includes(isca), 'canario: a busca da isca casa')
    assert.ok(!tudo.includes(isca) && !tudo.includes(isca.slice(0, 8)), 'a saida nao leva a semente nem pedaco dela')
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('CLI: sem a variavel sai 2 com o recado e nada mais', () => {
  for (const env of ['OUTRA=1\n', null]) {
    const { raiz, rodar } = raizFalsa(env)
    try {
      const r = rodar('ML')
      assert.equal(r.status, 2)
      assert.equal(r.stdout, '')
      assert.equal(r.stderr.trim(), 'falta ML_TOTP no .env')
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  }
})

test('CLI: conta com caractere fora do nome de variavel sai 2', () => {
  const { raiz, rodar } = raizFalsa('ML_TOTP=AAAA\n')
  try {
    const r = rodar('ml-x')
    assert.equal(r.status, 2)
    assert.equal(r.stdout, '')
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
