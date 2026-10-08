// Testes da leitura publica do Instagram. Sem rede e sem Chrome.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataDoCodigo, numero, parseOg, seguidoresDoOg, proxy, mediana, gradeDosLinks, ranquear, ritmo, decodeEnt, alertaDosPosts } from './instagram-publico.mjs'

// Caractere invisivel na legenda (rodada 5.2). fromCodePoint, nunca fromCharCode, pro bloco Tag.
const cp = (...n) => String.fromCodePoint(...n)
test('parseOg tira caractere escondido da legenda, inclusive vindo como entidade, e anota o alerta', () => {
  const og = parseOg('10 likes, 2 comments - acme on October 3, 2026: &quot;Compre ja&#xE0041;&#xE0042;' + cp(0xe0043, 0x2067) + ' agora&quot;. ')
  assert.equal(og.legenda, '"Compre ja agora"')
  assert.deepEqual(og.alertas, { tag: 3, bidi: 1 })
  assert.equal(og.curtidas, 10)
  assert.equal('alertas' in parseOg('12K likes, 300 comments - acme on October 3, 2026: &quot;Oi&quot;. '), false)
  assert.equal(decodeEnt('a&#x110000;b&#1114112;c'), 'abc', 'fora do Unicode vira vazio em vez de lancar')
})

test('alertaDosPosts soma os posts com alerta, ou null quando nenhum tinha', () => {
  assert.equal(alertaDosPosts([{ legenda: 'a' }, {}]), null)
  const linha = alertaDosPosts([{ alertas: { tag: 3, bidi: 1 } }, { legenda: 'x' }, { alertas: { tag: 2, bidi: 0 } }])
  assert.match(linha, /^Atencao: 2 legenda\(s\) com caractere escondido \(5 de texto invisivel, 1 de inversao de direcao\)/)
})

test('dataDoCodigo decodifica o codigo do link em data, mais novo com codigo maior', () => {
  assert.ok(dataDoCodigo('B') instanceof Date)
  assert.ok(dataDoCodigo('DAAAAAAAAAA') > dataDoCodigo('CAAAAAAAAAA'))
})

test('numero entende mil, K, mi, ponto e virgula de milhar', () => {
  assert.equal(numero('1,2 mil'), 1200)
  assert.equal(numero('3.4K'), 3400)
  assert.equal(numero('2 mi'), 2000000)
  assert.equal(numero('1.234'), 1234)
  assert.equal(numero('4,008'), 4008)
  assert.equal(numero('87'), 87)
  assert.equal(numero(''), null)
})

test('parseOg le curtidas, comentarios e legenda em portugues e ingles', () => {
  assert.deepEqual(parseOg('1.234 curtidas, 56 comentários - lojateste em 3 de outubro de 2026'), { curtidas: 1234, comentarios: 56, legenda: null })
  assert.deepEqual(parseOg('12K likes, 300 comments - acme on October 3, 2026: &quot;Oi&quot;. '), { curtidas: 12000, comentarios: 300, legenda: '"Oi"' })
  assert.deepEqual(parseOg('sem numero'), { curtidas: null, comentarios: null, legenda: null })
})

test('seguidoresDoOg em portugues e ingles', () => {
  assert.equal(seguidoresDoOg('12,5 mil seguidores, 300 seguindo, 80 posts'), 12500)
  assert.equal(seguidoresDoOg('3,100 Followers, 10 Following'), 3100)
})

test('decodeEnt resolve entidade numerica e nomeada', () => {
  assert.equal(decodeEnt('GR&#xc1;TIS &amp; &#39;ok&#39;'), "GRÁTIS & 'ok'")
})

test('proxy e mediana', () => {
  assert.equal(proxy({ curtidas: 100, comentarios: 5 }), 150)
  assert.equal(proxy({ curtidas: null, comentarios: 5 }), null)
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([1, 2, 3, 4]), 2.5)
  assert.equal(mediana([]), null)
})

test('gradeDosLinks tira duplicado, ordena do mais novo e corta no teto', () => {
  const g = gradeDosLinks(['/acme/p/CAAAAAAAAAA/', '/reel/DAAAAAAAAAA/', '/acme/p/CAAAAAAAAAA/', '/explore/'], 1)
  assert.equal(g.length, 1)
  assert.deepEqual({ tipo: g[0].tipo, codigo: g[0].codigo }, { tipo: 'reel', codigo: 'DAAAAAAAAAA' })
})

test('ranquear: multiplo contra a mediana da grade inteira, janela, piso de curtidas e sinal de funil', () => {
  const agora = new Date('2026-10-04T12:00:00Z')
  const d = n => new Date(agora - n * 864e5).toISOString()
  const perfis = [{ user: 'acme', posts: [
    { codigo: 'a', tipo: 'reel', curtidas: 100, comentarios: 0, data: d(1) },
    { codigo: 'b', tipo: 'reel', curtidas: 100, comentarios: 0, data: d(2) },
    { codigo: 'c', tipo: 'post', curtidas: 1000, comentarios: 10, data: d(3) },
    { codigo: 'd', tipo: 'reel', curtidas: 5000, comentarios: 0, data: d(9) },
    { codigo: 'e', tipo: 'reel', curtidas: 400, comentarios: 400, data: d(1) },
  ] }]
  const r = ranquear(perfis, { dias: 4, piso: 300, agora })
  assert.deepEqual(r.lista.map(x => x.codigo), ['e', 'c'])
  assert.equal(r.lista[0].multiplo, 4)
  assert.equal(r.lista[1].multiplo, 1)
  assert.equal(r.lista[0].funil, true)
  assert.equal(r.lista[1].funil, false)
  assert.equal(r.abaixoDoPiso, 2)
})

test('ritmo em posts por semana, nulo com menos de 2 posts', () => {
  const agora = new Date('2026-10-04T12:00:00Z')
  const posts = [0, 1, 2, 3].map(n => ({ data: new Date(agora - n * 2 * 864e5) }))
  assert.equal(ritmo(posts), 4.7)
  assert.equal(ritmo(posts.slice(0, 1)), null)
})
