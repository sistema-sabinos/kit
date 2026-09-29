// Testes da prancha. Rodar: node --test prancha.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarPrancha } from './prancha.mjs'

const dados = {
  slug: 'kit-5',
  custo_usd_total: 0,
  imagens: [
    { n: 2, arquivo: 'anuncios/kit-5/imagens/02-sabores.jpg', papel: 'infografico', motor: 'zero-ia' },
    { n: 1, arquivo: 'anuncios/kit-5/imagens/01-capa.jpg', papel: 'capa', motor: 'foto' },
  ],
}
const sempre = { existe: () => true }

test('cartoes na ordem do numero, imagem pelo nome do arquivo', () => {
  const { html } = montarPrancha(dados, sempre)
  assert.ok(html.indexOf('01-capa.jpg') < html.indexOf('02-sabores.jpg'))
  assert.ok(html.includes('src="01-capa.jpg"'))
  assert.ok(!html.includes('src="anuncios/'))
})

test('custo zero sai por extenso e a resposta esperada aparece', () => {
  const { html } = montarPrancha(dados, sempre)
  assert.ok(html.includes('US$ 0,00'))
  assert.ok(html.includes('aprova tudo'))
  assert.ok(html.includes('refaz a 3'))
})

test('custo com centavos usa virgula', () => {
  assert.ok(montarPrancha({ ...dados, custo_usd_total: 0.2 }, sempre).html.includes('US$ 0,20'))
})

test('texto com < e & e escapado', () => {
  const { html } = montarPrancha({ ...dados, imagens: [{ n: 1, arquivo: 'a/01.jpg', papel: '<script>x</script> & cia', motor: 'foto' }] }, sempre)
  assert.ok(!html.includes('<script>x'))
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt; &amp; cia'))
})

test('texto que a pessoa le sai com acento', () => {
  const { html } = montarPrancha({ ...dados, imagens: [...dados.imagens, { n: 3, arquivo: 'a/03.jpg', papel: 'clima', motor: 'codex' }] }, sempre)
  assert.ok(html.includes('<title>Imagens do anúncio kit-5</title>'))
  assert.ok(html.includes('<h1>Imagens do anúncio kit-5</h1>'))
  assert.ok(html.includes('cenário pelo Codex'))
  assert.ok(!html.includes('anuncio') && !html.includes('cenario'))
})

test('arquivo que falta vira aviso no cartao e na lista', () => {
  const r = montarPrancha(dados, { existe: (p) => !p.endsWith('02-sabores.jpg') })
  assert.deepEqual(r.faltando, ['anuncios/kit-5/imagens/02-sabores.jpg'])
  assert.ok(r.html.includes('falta o arquivo'))
})
