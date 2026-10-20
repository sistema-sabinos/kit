// Testes do navegador que desenha. Rodar: node --test render.test.mjs
// Nenhum teste abre navegador de verdade: o Playwright entra falso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { INSTALAR, acharPlaywright, abrirNavegador, opcoesDaFoto, comPagina, fotografar } from './render.mjs'

function falso(registro, { launchFalha = false, screenshotFalha = false } = {}) {
  return async () => ({
    chromium: {
      launch: async (op) => {
        registro.push(['launch', op])
        if (launchFalha) throw new Error('Chromium distribution chrome is not found\nlinha 2')
        return {
          newPage: async (op) => {
            registro.push(['newPage', op])
            return {
              goto: async (u, op) => registro.push(['goto', u, op]),
              setContent: async (h) => registro.push(['setContent', h]),
              addStyleTag: async (op) => registro.push(['addStyleTag', op]),
              evaluate: async () => {},
              screenshot: async (op) => {
                if (screenshotFalha) throw new Error('quebrou')
                registro.push(['screenshot', op])
              },
            }
          },
          close: async () => registro.push(['close']),
        }
      },
    },
  })
}

test('acharPlaywright sem o pacote instalado lanca com o comando de instalar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'render-'))
  try {
    assert.throws(() => acharPlaywright(dir), e => e.message.includes(INSTALAR))
    assert.ok(INSTALAR.includes('npm install --prefix .claude/skills/mercado-livre'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('abrirNavegador pede o Chrome do computador', async () => {
  const r = []
  await abrirNavegador({ carregar: falso(r) })
  assert.deepEqual(r[0], ['launch', { channel: 'chrome' }])
})

test('abrirNavegador sem Chrome explica em uma linha o que conferir', async () => {
  await assert.rejects(abrirNavegador({ carregar: falso([], { launchFalha: true }) }), e => {
    assert.ok(e.message.includes('Chrome esta instalado'))
    assert.ok(!e.message.includes('linha 2'))
    return true
  })
})

test('opcoesDaFoto: jpg com qualidade, png sem, resto recusa', () => {
  assert.deepEqual(opcoesDaFoto('a/01-capa.JPG'), { type: 'jpeg', quality: 92 })
  assert.deepEqual(opcoesDaFoto('a/recorte.png'), { type: 'png' })
  assert.throws(() => opcoesDaFoto('a/foto.gif'), /\.jpg ou \.png/)
})

test('comPagina fecha o navegador mesmo quando a tarefa quebra', async () => {
  const r = []
  await assert.rejects(comPagina(async () => { throw new Error('x') }, { carregar: falso(r) }))
  assert.deepEqual(r.at(-1), ['close'])
})

// O fotografar cria a pasta da saida: saida relativa deixava uma pasta x/ onde o teste rodava, e
// ela foi parar no zip da 5.18. Toda saida de teste mora numa pasta temporaria limpa no fim.
const SOBRA = join(process.cwd(), 'x')
const sobraJaExistia = existsSync(SOBRA)

async function emPastaTemporaria(fazer) {
  const dir = mkdtempSync(join(tmpdir(), 'render-'))
  try { return await fazer(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('fotografar: HTML vai por setContent, file: vai por goto, viewport e tipo certos', () => emPastaTemporaria(async dir => {
  const r = []
  const saida = join(dir, 'x', '02.jpg')
  await fotografar('<p>oi</p>', { saida, largura: 1200, altura: 1500, carregar: falso(r) })
  assert.deepEqual(r.find(x => x[0] === 'newPage')[1], { viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 })
  assert.deepEqual(r.find(x => x[0] === 'setContent'), ['setContent', '<p>oi</p>'])
  assert.deepEqual(r.find(x => x[0] === 'screenshot')[1], { path: saida, type: 'jpeg', quality: 92 })
  const r2 = []
  await fotografar('file:///home/a/peca.html', { saida: join(dir, 'x', 'p.png'), largura: 800, altura: 800, carregar: falso(r2) })
  assert.equal(r2.find(x => x[0] === 'goto')[1], 'file:///home/a/peca.html')
  assert.ok(!r2.some(x => x[0] === 'setContent'))
}))

test('fotografar recusa extensao errada antes de abrir o navegador', async () => {
  const r = []
  await assert.rejects(fotografar('<p/>', { saida: 'x.bmp', largura: 10, altura: 10, carregar: falso(r) }))
  assert.equal(r.length, 0)
})

test('fotografar cria a pasta de saida quando ela ainda nao existe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'render-'))
  try {
    const saida = join(dir, 'anuncios', 'kit-5', 'imagens', '01-capa.jpg')
    await fotografar('<p>oi</p>', { saida, largura: 100, altura: 100, carregar: falso([]) })
    assert.ok(existsSync(dirname(saida)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('fotografar com css injeta o estilo depois do goto e confere antes da foto', () => emPastaTemporaria(async dir => {
  const r = []
  const conferir = async pagina => { assert.ok(pagina.screenshot); r.push(['conferir']) }
  await fotografar('file:///a/peca.html', { saida: join(dir, 'x', 'p.jpg'), largura: 100, altura: 100, css: '@font-face {}', conferir, carregar: falso(r) })
  const ordem = r.map(x => x[0]).filter(n => ['goto', 'addStyleTag', 'conferir', 'screenshot'].includes(n))
  assert.deepEqual(ordem, ['goto', 'addStyleTag', 'conferir', 'screenshot'])
  assert.deepEqual(r.find(x => x[0] === 'addStyleTag')[1], { content: '@font-face {}' })
}))

test('fotografar com conferir que lanca nao tira a foto', () => emPastaTemporaria(async dir => {
  const r = []
  const conferir = async () => { r.push(['conferir']); throw new Error('letra "Poppins" nao esta embutida') }
  await assert.rejects(fotografar('<p>oi</p>', { saida: join(dir, 'x', 'p.jpg'), largura: 100, altura: 100, conferir, carregar: falso(r) }), /Poppins/)
  assert.ok(r.some(x => x[0] === 'conferir'), 'o conferir precisa ter rodado')
  assert.ok(!r.some(x => x[0] === 'screenshot'))
  assert.deepEqual(r.at(-1), ['close'])
}))

test('fotografar sem css nao chama addStyleTag', () => emPastaTemporaria(async dir => {
  const r = []
  await fotografar('<p>oi</p>', { saida: join(dir, 'x', 'p.jpg'), largura: 100, altura: 100, carregar: falso(r) })
  assert.ok(r.some(x => x[0] === 'screenshot'), 'a foto precisa ter saido')
  assert.ok(!r.some(x => x[0] === 'addStyleTag'))
}))

// Fica por ultimo: os testes de um arquivo rodam em ordem, entao aqui todos ja passaram.
test('os testes do fotografar nao deixam a pasta x/ onde rodaram', t => {
  if (sobraJaExistia) { t.diagnostic(`${SOBRA} ja existia antes dos testes: esta conferencia nao provou nada, rode de uma pasta sem x/`); return }
  assert.equal(existsSync(SOBRA), false, `sobrou ${SOBRA}: alguma saida de teste voltou a ser relativa`)
})
