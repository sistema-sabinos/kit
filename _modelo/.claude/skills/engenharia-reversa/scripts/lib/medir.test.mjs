// Testes do pixel da capa, contra imagem montada por codigo. O navegador entra falso.
// Rodar: node --test medir.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { medidasDePixels, abrirMedidor } from './medir.mjs'

// L x A pixels; pintar(x, y) devolve [r, g, b]
function imagem(L, A, pintar) {
  const dados = new Uint8ClampedArray(L * A * 4)
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
    const [r, g, b] = pintar(x, y)
    dados.set([r, g, b, 255], (y * L + x) * 4)
  }
  return { largura: L, altura: A, dados }
}
const BRANCO = [255, 255, 255]
const PRETO = [0, 0, 0]
const quadrado = (x, y) => (x >= 20 && x < 80 && y >= 20 && y < 80 ? PRETO : BRANCO)

test('quadrado preto no meio de fundo branco: respiro 20%, ocupacao 36%', () => {
  const m = medidasDePixels(imagem(100, 100, quadrado))
  assert.deepEqual(m.fundo, { hex: '#ffffff', branco_puro: true })
  assert.equal(m.respiro, 0.2)
  assert.equal(m.ocupacao, 0.36)
  // 60 linhas com 2 transicoes cada, sobre 100 x 99 comparacoes
  assert.equal(m.densidade_borda, 120 / 9900)
})

test('fundo cinza fica fora do branco puro; produto encostado na borda zera o respiro', () => {
  const m = medidasDePixels(imagem(50, 50, (x, y) => (x < 25 ? [200, 200, 200] : [210, 210, 210])))
  assert.equal(m.fundo.branco_puro, false)
  const encostado = medidasDePixels(imagem(100, 100, (x, y) => (y < 50 && x > 10 && x < 90 ? PRETO : BRANCO)))
  assert.equal(encostado.respiro, (0 + 0.5 + 0.11 + 0.1) / 4)
})

test('capa listrada e mais poluida que capa limpa', () => {
  const limpa = medidasDePixels(imagem(100, 100, quadrado))
  const listrada = medidasDePixels(imagem(100, 100, (x) => (x % 4 < 2 ? PRETO : BRANCO)))
  assert.ok(listrada.densidade_borda > limpa.densidade_borda * 10)
})

function navegadorFalso(resposta) {
  return async () => ({
    newPage: async () => ({ evaluate: async () => { if (resposta instanceof Error) throw resposta; return resposta } }),
    close: async () => {},
  })
}

test('abrirMedidor le o arquivo, passa pela pagina e mede os bytes que voltam', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'medir-'))
  try {
    const arq = join(dir, 'capa.jpg')
    writeFileSync(arq, 'qualquer')
    const img = imagem(100, 100, quadrado)
    const medidor = await abrirMedidor({ abrir: navegadorFalso({ largura: 100, altura: 100, b64: Buffer.from(img.dados).toString('base64') }) })
    const m = await medidor.medir(arq)
    assert.equal(m.respiro, 0.2)
    await medidor.fechar()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('foto que nao abre volta com erro, sem lancar', async () => {
  const medidor = await abrirMedidor({ abrir: navegadorFalso(new Error('a imagem nao abriu')) })
  assert.match((await medidor.medir(join(tmpdir(), 'nao-existe-mesmo.jpg'))).erro, /ENOENT/)
  const dir = mkdtempSync(join(tmpdir(), 'medir-'))
  try {
    const arq = join(dir, 'quebrada.png')
    writeFileSync(arq, 'x')
    assert.deepEqual(await medidor.medir(arq), { erro: 'a imagem nao abriu' })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
