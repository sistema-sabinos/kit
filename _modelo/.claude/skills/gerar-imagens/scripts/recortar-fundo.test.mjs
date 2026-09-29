// Testes do recorte. Rodar: node --test recortar-fundo.test.mjs
// A imagem de teste e montada aqui, pixel a pixel: sem arquivo, sem navegador.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recortar, avisoDoRecorte, recortarArquivo } from './recortar-fundo.mjs'

// W x H com fundo da cor `fundo` e um quadrado escuro de `de` ate `ate` (inclusive)
function imagem(W, H, fundo, de, ate, miolo) {
  const d = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const dentro = x >= de && x <= ate && y >= de && y <= ate
    const noMiolo = miolo && x >= miolo[0] && x <= miolo[1] && y >= miolo[0] && y <= miolo[1]
    const v = noMiolo ? 255 : dentro ? 40 : fundo
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255
  }
  return d
}
const alfa = (d, W, x, y) => d[(y * W + x) * 4 + 3]

test('fundo branco ligado a borda some, produto fica inteiro', () => {
  const d = imagem(10, 10, 255, 3, 6)
  const n = recortar(d, 10, 10, { limiar: 242, feather: 0 })
  assert.equal(n, 84)
  assert.equal(alfa(d, 10, 0, 0), 0)
  assert.equal(alfa(d, 10, 4, 4), 255)
})

test('branco cercado pelo produto (rotulo branco) nao some', () => {
  const d = imagem(10, 10, 255, 2, 7, [4, 5])
  recortar(d, 10, 10, { limiar: 242, feather: 0 })
  assert.equal(alfa(d, 10, 4, 4), 255)
  assert.equal(alfa(d, 10, 0, 9), 0)
})

test('feather suaviza so a borda do produto', () => {
  const d = imagem(10, 10, 255, 2, 7)
  recortar(d, 10, 10, { limiar: 242, feather: 1 })
  assert.equal(alfa(d, 10, 2, 4), 150)
  assert.equal(alfa(d, 10, 4, 4), 255)
})

test('fundo cinza abaixo do limiar fica; limiar menor tira', () => {
  const a = imagem(10, 10, 230, 3, 6)
  assert.equal(recortar(a, 10, 10, { limiar: 242, feather: 0 }), 0)
  const b = imagem(10, 10, 230, 3, 6)
  assert.equal(recortar(b, 10, 10, { limiar: 225, feather: 0 }), 84)
})

test('avisoDoRecorte: quase nada saiu, quase tudo saiu, ou tudo certo', () => {
  assert.match(avisoDoRecorte(2), /fundo branco/)
  assert.match(avisoDoRecorte(97), /limiar/)
  assert.equal(avisoDoRecorte(60), null)
})

test('recortarArquivo recusa saida que nao e png, antes de abrir o navegador', async () => {
  let abriu = false
  await assert.rejects(recortarArquivo({ entrada: 'a.jpg', saida: 'b.jpg', pagina: async () => { abriu = true } }), /\.png/)
  assert.equal(abriu, false)
})

test('recortarArquivo cria a pasta de saida quando ela ainda nao existe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'recorte-'))
  try {
    const entrada = join(dir, 'foto.jpg')
    writeFileSync(entrada, Buffer.from([0xff, 0xd8, 0xff]))
    const saida = join(dir, 'anuncios', 'kit-5', 'cenarios', 'pote-recorte.png')
    const pagina = async () => ({ png: 'data:image/png;base64,AAAA', transparentes: 50, total: 100 })
    const r = await recortarArquivo({ entrada, saida, pagina })
    assert.ok(existsSync(saida))
    assert.equal(r.transparente_pct, 50)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
