// Testes da casca da auditoria nos dois modos que gravam arquivo do aluno. Sem rede: fetch falso por URL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { renovar, medir } from './auditar-instagram.mjs'

const CRASES = '`'.repeat(3)
const resposta = j => ({ json: async () => j })

function projeto(env) {
  const raiz = mkdtempSync(join(tmpdir(), 'audit-ig-'))
  mkdirSync(join(raiz, '_contexto'))
  writeFileSync(join(raiz, '_contexto', 'midia-social.md'), CRASES + 'config\nperfil: lojateste\n' + CRASES + '\n')
  writeFileSync(join(raiz, '.env'), env)
  return raiz
}

test('renovar troca so as duas linhas do token e mantem o resto do .env', async () => {
  const raiz = projeto('OUTRA=1\r\nIG_ACCESS_TOKEN=velho\r\nIG_TOKEN_VENCE_EM=2026-10-01\r\nBUFFER_API_KEY=k\r\n')
  try {
    const fetchFn = async url => { assert.match(String(url), /refresh_access_token/); return resposta({ access_token: 'novo', expires_in: 60 * 86400 }) }
    const vence = await renovar({ fetchFn, agora: new Date('2026-10-04T12:00:00Z'), raiz })
    assert.equal(vence, '2026-12-03')
    assert.equal(readFileSync(join(raiz, '.env'), 'utf8'), 'OUTRA=1\r\nIG_ACCESS_TOKEN=novo\r\nIG_TOKEN_VENCE_EM=2026-12-03\r\nBUFFER_API_KEY=k\r\n')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('renovar com recusa da Meta nao mexe no .env', async () => {
  const raiz = projeto('IG_ACCESS_TOKEN=velho\n')
  try {
    await assert.rejects(renovar({ fetchFn: async () => resposta({ error: { message: 'expired' } }), raiz }), /expired/)
    assert.equal(readFileSync(join(raiz, '.env'), 'utf8'), 'IG_ACCESS_TOKEN=velho\n')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

function postPublicado(raiz, timestamp) {
  const dir = join(raiz, 'producao', 'p1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'publicacao.md'), '# Publicacao\n\n## VALIDO AGORA\n\n| Rede | Post ID |\n|---|---|\n| instagram | buf-1 |\n')
  writeFileSync(join(dir, 'brief.md'), '# Brief\n\n## Item salvavel\nlista de medidas\n')
  return async url => {
    const u = String(url)
    if (u.startsWith('https://api.buffer.com')) return { status: 200, json: async () => ({ data: { post: { id: 'buf-1', status: 'sent', externalLink: 'https://www.instagram.com/reel/Abc1/' } } }) }
    if (u.includes('/me/media')) return resposta({ data: [{ id: 'm1', permalink: 'https://www.instagram.com/reel/Abc1/', timestamp, media_product_type: 'REELS' }] })
    if (u.includes('/m1/insights')) return resposta({ data: [{ name: 'reach', values: [{ value: 900 }] }, { name: 'saved', values: [{ value: 12 }] }] })
    throw new Error('url inesperada ' + u)
  }
}

test('medir com 7 dias grava o Resultado no brief com o prometido', async () => {
  const raiz = projeto('IG_ACCESS_TOKEN=t\nBUFFER_API_KEY=k\n')
  try {
    const fetchFn = postPublicado(raiz, '2026-09-26T12:00:00+0000')
    await medir('p1', { fetchFn, agora: new Date('2026-10-04T12:00:00Z'), raiz })
    const brief = readFileSync(join(raiz, 'producao', 'p1', 'brief.md'), 'utf8')
    assert.match(brief, /## Resultado/)
    assert.match(brief, /\| Alcance \| 900 \|/)
    assert.match(brief, /prometia: lista de medidas/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('medir antes de 7 dias nao grava nada', async () => {
  const raiz = projeto('IG_ACCESS_TOKEN=t\nBUFFER_API_KEY=k\n')
  try {
    const fetchFn = postPublicado(raiz, '2026-10-01T12:00:00+0000')
    assert.equal(await medir('p1', { fetchFn, agora: new Date('2026-10-04T12:00:00Z'), raiz }), null)
    assert.doesNotMatch(readFileSync(join(raiz, 'producao', 'p1', 'brief.md'), 'utf8'), /Resultado/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})
