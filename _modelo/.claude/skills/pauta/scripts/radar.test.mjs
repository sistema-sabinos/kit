// Testes do radar de tendencias. Sem rede: RSS e HTML gravados no proprio teste.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerRss, lerTrends24, radar } from './radar.mjs'

const RSS = '<rss><channel><item><title>Titulo A &amp; B - Jornal X</title><link>https://n/a</link><pubDate>Fri, 03 Oct 2026 10:00:00 GMT</pubDate></item><item><title><![CDATA[Titulo C]]></title><link>https://n/c</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>'
const T24 = '<ol><li><a href="/x" class=trend-link>Japão</a></li><li><a class="trend-link" href="/y">Apertei 13</a></li><li><a class=trend-link>Japão</a></li></ol>'

test('lerRss tira entidade, CDATA e o nome do jornal', () => {
  const r = lerRss(RSS)
  assert.deepEqual(r.map(i => i.titulo), ['Titulo A & B', 'Titulo C'])
  assert.equal(r[0].fonte, 'Jornal X')
  assert.equal(r[0].link, 'https://n/a')
})

test('lerTrends24 pega os termos sem repetir, com ou sem aspas na classe', () => {
  assert.deepEqual(lerTrends24(T24), ['Japão', 'Apertei 13'])
})

test('radar busca cada termo no Google Noticias, deixa so os ultimos 7 dias e junta o X', async () => {
  const pedidas = []
  const fetchFn = async url => { pedidas.push(url); return { ok: true, text: async () => (String(url).includes('trends24') ? T24 : RSS) } }
  const md = await radar({ fetchFn, agora: new Date('2026-10-04T12:00:00Z'), termos: ['fone bluetooth'] })
  assert.ok(pedidas.some(u => /news\.google\.com\/rss\/search\?q=fone%20bluetooth/.test(u)))
  assert.match(md, /Titulo A & B/)
  assert.doesNotMatch(md, /Titulo C/)
  assert.match(md, /Apertei 13/)
})

test('radar com fonte fora do ar segue com as outras e avisa', async () => {
  const fetchFn = async url => String(url).includes('trends24') ? { ok: false, status: 503, text: async () => '' } : { ok: true, text: async () => RSS }
  const md = await radar({ fetchFn, agora: new Date('2026-10-04T12:00:00Z'), termos: ['x'] })
  assert.match(md, /fora do ar/)
  assert.match(md, /Titulo A & B/)
})
