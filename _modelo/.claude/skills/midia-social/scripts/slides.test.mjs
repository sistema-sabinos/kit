// Testes do gerador de slides. Rodar: node --test slides.test.mjs
// Nenhum teste abre navegador de verdade: o Playwright entra falso, como no render.test do gerar-imagens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { gerarSlides, lerArgs, INSTALAR, TETO } from './slides.mjs'

function falso(registro, { launchFalha = false } = {}) {
  return async () => ({
    chromium: {
      launch: async op => {
        registro.push(['launch', op])
        if (launchFalha) throw new Error('Chromium distribution chrome is not found\nlinha 2')
        return {
          newPage: async op => {
            registro.push(['newPage', op])
            return {
              goto: async (u, op) => registro.push(['goto', u, op]),
              evaluate: async () => {},
              screenshot: async op => registro.push(['screenshot', op]),
            }
          },
          close: async () => registro.push(['close']),
        }
      },
    },
  })
}

function projeto(n, pastaHtml = 'html') {
  const raiz = mkdtempSync(join(tmpdir(), 'slides-'))
  const dir = join(raiz, 'producao', '2026-10-08-moedor', pastaHtml)
  mkdirSync(dir, { recursive: true })
  // gravados fora de ordem: a ordem tem que sair do nome
  for (let i = n; i >= 1; i--) writeFileSync(join(dir, `slide-${String(i).padStart(2, '0')}.html`), `<p>${i}</p>`)
  writeFileSync(join(dir, 'rascunho.html'), '<p>fora</p>')
  return raiz
}

const fotos = r => r.filter(x => x[0] === 'screenshot').map(x => x[1])
const PASTA = 'producao/2026-10-08-moedor'

test('3 HTML viram 3 PNG em final/, em ordem, no 1080x1350', async () => {
  const raiz = projeto(3)
  try {
    const r = [], log = []
    assert.equal(await gerarSlides({ pasta: PASTA, raiz, carregar: falso(r), log: m => log.push(m) }), 0)
    const lista = fotos(r)
    assert.ok(lista.length > 0, 'canario: houve screenshot')
    assert.deepEqual(lista.map(o => basename(o.path)), ['slide-01.png', 'slide-02.png', 'slide-03.png'])
    assert.ok(lista.every(o => o.path.includes(join('2026-10-08-moedor', 'final')) && o.type === 'png'))
    assert.deepEqual(r.find(x => x[0] === 'newPage')[1], { viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })
    assert.deepEqual(r.find(x => x[0] === 'launch')[1], { channel: 'chrome' })
    const goto = r.find(x => x[0] === 'goto')
    assert.ok(goto[1].startsWith('file:') && goto[1].endsWith('slide-01.html'))
    assert.deepEqual(goto[2], { waitUntil: 'networkidle' })
    assert.ok(existsSync(join(raiz, PASTA, 'final')))
    assert.deepEqual(r.at(-1), ['close'])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('--916 le html-916/ e grava final-916/ no 1080x1920', async () => {
  const raiz = projeto(2, 'html-916')
  try {
    const r = []
    assert.equal(await gerarSlides({ ...lerArgs(['--pasta', PASTA, '--916']), raiz, carregar: falso(r), log: () => {} }), 0)
    const lista = fotos(r)
    assert.equal(lista.length, 2)
    assert.ok(lista.every(o => o.path.includes(join('2026-10-08-moedor', 'final-916'))))
    assert.deepEqual(r.find(x => x[0] === 'newPage')[1].viewport, { width: 1080, height: 1920 })
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('11 HTML: nenhum screenshot, saida 1 e o aviso do teto', async () => {
  const raiz = projeto(TETO + 1)
  try {
    const r = [], log = []
    assert.equal(await gerarSlides({ pasta: PASTA, raiz, carregar: falso(r), log: m => log.push(m) }), 1)
    assert.ok(log.length > 0, 'canario: houve aviso')
    assert.match(log.join('\n'), /o agendador aceita no maximo 10 slides/)
    assert.equal(r.length, 0, 'nem abriu o navegador')
    assert.ok(!existsSync(join(raiz, PASTA, 'final')))
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('--so 02 gera um slide so', async () => {
  const raiz = projeto(3)
  try {
    const r = []
    assert.equal(await gerarSlides({ ...lerArgs(['--pasta', PASTA, '--so', '2']), raiz, carregar: falso(r), log: () => {} }), 0)
    assert.deepEqual(fotos(r).map(o => basename(o.path)), ['slide-02.png'])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('sem Playwright sai 1 com o comando de instalar', async () => {
  const raiz = projeto(1)
  try {
    const log = []
    const carregar = async () => { throw new Error("Cannot find package 'playwright'") }
    assert.equal(await gerarSlides({ pasta: PASTA, raiz, carregar, log: m => log.push(m) }), 1)
    assert.ok(log.join('\n').includes(INSTALAR))
    assert.ok(INSTALAR.includes('--prefix .claude/skills/midia-social'))
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('sem Chrome sai 1 numa linha so do erro e nada gravado', async () => {
  const raiz = projeto(1)
  try {
    const r = [], log = []
    assert.equal(await gerarSlides({ pasta: PASTA, raiz, carregar: falso(r, { launchFalha: true }), log: m => log.push(m) }), 1)
    assert.match(log.join('\n'), /Chrome esta instalado/)
    assert.ok(!log.join('\n').includes('linha 2'))
    assert.equal(fotos(r).length, 0)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('rodada inteira tira de final/ o PNG de slide que perdeu o HTML; --so nao mexe', async () => {
  const raiz = projeto(3)
  try {
    const dirFinal = join(raiz, PASTA, 'final')
    mkdirSync(dirFinal, { recursive: true })
    const velhos = () => ['01', '02', '03', '04', '05'].forEach(n => writeFileSync(join(dirFinal, `slide-${n}.png`), 'x'))
    velhos()
    writeFileSync(join(dirFinal, 'capa-extra.png'), 'x')
    assert.equal(await gerarSlides({ pasta: PASTA, so: '01', raiz, carregar: falso([]), log: () => {} }), 0)
    assert.ok(existsSync(join(dirFinal, 'slide-05.png')), 'canario: com --so o 05 fica')
    const log = []
    assert.equal(await gerarSlides({ pasta: PASTA, raiz, carregar: falso([]), log: m => log.push(m) }), 0)
    assert.deepEqual(readdirSync(dirFinal).sort(), ['capa-extra.png', 'slide-01.png', 'slide-02.png', 'slide-03.png'])
    assert.match(log.join('\n'), /removido: final\/slide-04\.png/)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('sem --pasta mostra o uso e sai 1', async () => {
  const log = []
  assert.equal(await gerarSlides({ carregar: falso([]), log: m => log.push(m) }), 1)
  assert.match(log.join('\n'), /^uso: /)
})
