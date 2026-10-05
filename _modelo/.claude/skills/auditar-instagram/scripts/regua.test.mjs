// Testes da regua da auditoria. Sem rede.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diasParaVencer, avisoDoToken, entraNaRegua, diasDesde, urlRenovar, codigoDoLink, secaoResultado, idInstagramValido } from './regua.mjs'

const agora = new Date('2026-10-04T12:00:00Z')

test('diasParaVencer e avisoDoToken', () => {
  assert.equal(diasParaVencer('2026-10-10', '2026-10-04'), 6)
  assert.equal(diasParaVencer(undefined, '2026-10-04'), null)
  assert.equal(avisoDoToken(30), null)
  assert.match(avisoDoToken(6), /6 dias.*--renovar/)
  assert.throws(() => avisoDoToken(0), /venceu.*configurar\.md/)
  assert.match(avisoDoToken(null), /IG_TOKEN_VENCE_EM/)
})

test('entraNaRegua deixa fora post com menos de 48 horas', () => {
  assert.equal(entraNaRegua({ timestamp: '2026-10-03T12:00:00+0000' }, agora), false)
  assert.equal(entraNaRegua({ timestamp: '2026-10-02T11:59:00+0000' }, agora), true)
})

test('diasDesde', () => {
  assert.equal(diasDesde('2026-09-27T12:00:00+0000', agora), 7)
})

test('urlRenovar usa o endpoint de renovacao do Instagram', () => {
  const u = new URL(urlRenovar('tok'))
  assert.equal(u.origin + u.pathname, 'https://graph.instagram.com/refresh_access_token')
  assert.equal(u.searchParams.get('grant_type'), 'ig_refresh_token')
  assert.equal(u.searchParams.get('access_token'), 'tok')
})

test('codigoDoLink le reel e post, com ou sem barra no fim', () => {
  assert.equal(codigoDoLink('https://www.instagram.com/reel/AbC_12-x/'), 'AbC_12-x')
  assert.equal(codigoDoLink('https://www.instagram.com/p/XyZ9'), 'XyZ9')
  assert.equal(codigoDoLink('https://www.tiktok.com/@a/video/1'), null)
})

test('secaoResultado mostra o medido ao lado do prometido', () => {
  const t = secaoResultado({ metricas: { reach: 1200, saved: 30, shares: 12, follows: 4 }, prometido: 'salvamento', data: '2026-10-11' })
  assert.match(t, /## Resultado/)
  assert.match(t, /1200/)
  assert.match(t, /salvamento/)
})

test('idInstagramValido pega so a linha do Instagram do VALIDO AGORA', () => {
  const t = '# Publicacao\n\n## VALIDO AGORA\n\n| Rede | Post ID |\n|---|---|\n| tiktok | p2 |\n| instagram | p1 |\n\n## Historico\n\n| instagram | velho |\n'
  assert.equal(idInstagramValido(t), 'p1')
  assert.equal(idInstagramValido('# nada'), null)
})
