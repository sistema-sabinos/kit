// Testes da composicao. Rodar: node --test compor-cena.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validarCena, htmlDaCena, comporCena } from './compor-cena.mjs'

const base = { produto: 'p.png', out: 'o.jpg', escala: 0.6, linha: 0.88, x: 0.5 }

test('validarCena: exige um fundo, cena ou cor, e nunca os dois', () => {
  assert.throws(() => validarCena({ ...base }), /--cena ou --fundo/)
  assert.throws(() => validarCena({ ...base, cena: 'c.png', fundo: '#ffffff' }), /so um/)
})

test('validarCena: cor em hexadecimal de 6 digitos', () => {
  assert.throws(() => validarCena({ ...base, fundo: 'branco' }), /#ffffff/)
  assert.doesNotThrow(() => validarCena({ ...base, fundo: '#FFFFFF' }))
})

test('validarCena: produto recortado em png e medidas dentro da faixa', () => {
  assert.throws(() => validarCena({ ...base, fundo: '#ffffff', produto: 'p.jpg' }), /recortar-fundo/)
  assert.throws(() => validarCena({ ...base, fundo: '#ffffff', escala: 1.5 }), /--escala/)
  assert.throws(() => validarCena({ ...base, fundo: '#ffffff', x: -0.1 }), /--x/)
})

test('htmlDaCena com cor: fundo pintado, sem imagem de cena, produto na altura pedida', () => {
  const h = htmlDaCena({ largura: 1200, altura: 1200, fundo: '#ffffff', produto: 'data:image/png;base64,AA', escala: 0.5, linha: 0.9, x: 0.5, sombra: true })
  assert.match(h, /background:#ffffff/)
  assert.ok(!h.includes('id="cena"'))
  assert.match(h, /height:600px/)
  assert.match(h, /top:1080px/)
  assert.match(h, /id="sombra"/)
})

test('htmlDaCena com cena e sem sombra', () => {
  const h = htmlDaCena({ largura: 1000, altura: 1000, cena: 'data:image/png;base64,BB', produto: 'data:image/png;base64,AA', escala: 0.4, linha: 0.8, x: 0.3, sombra: false })
  assert.match(h, /id="cena" src="data:image\/png;base64,BB"/)
  assert.match(h, /left:300px/)
  assert.ok(!h.includes('id="sombra"'))
})

test('comporCena le os arquivos, embute como data URL e manda pro fotografar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'compor-'))
  try {
    const produto = join(dir, 'p.png')
    writeFileSync(produto, Buffer.from([1, 2, 3]))
    const chamadas = []
    const r = await comporCena({ fundo: '#ffffff', produto, out: join(dir, '01-capa.jpg'), foto: async (h, o) => chamadas.push([h, o]) })
    assert.ok(chamadas[0][0].includes('data:image/png;base64,AQID'))
    assert.equal(chamadas[0][1].largura, 1200)
    assert.equal(r.custo_usd, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('htmlDaCena: produto largo encosta na base com object-position:bottom', () => {
  const h = htmlDaCena({ largura: 1200, altura: 1200, fundo: '#ffffff', produto: 'data:image/png;base64,AA', escala: 0.5, linha: 0.9, x: 0.5, sombra: true })
  assert.match(h, /object-position:bottom/)
})
