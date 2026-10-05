// Testes que abrem o Google Chrome de verdade, contra paginas reais do Mercado Livre gravadas
// em fixtures/ (capturadas em 2026-10-04, com titulo, loja e codigo trocados por neutros).
// Provam os seletores que leem a busca, o video do vendedor e as perguntas, e o medidor de
// pixel decodificando uma foto de verdade.
// O Playwright vem do projeto (npm install --prefix .claude/skills/mercado-livre) ou, na
// bancada de desenvolvimento, da pasta apontada em SABINOS_PLAYWRIGHT. Sem nenhum dos dois,
// os testes aparecem como PULADOS no placar (nunca como verdes).
// Rodar: node --test pagina-real.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acharPlaywright, INSTALAR } from '../../gerar-imagens/scripts/lib/render.mjs'
import { extrairCards, deduplicar } from '../../pesquisar-tendencia/scripts/coletar-cdp.mjs'
import { lerPagina } from '../../espionar-concorrente/scripts/espionar.mjs'
import { extrairPerguntas } from './rx.mjs'
import { abrirMedidor } from './lib/medir.mjs'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))

async function carregarPlaywright() {
  const caminhos = []
  try { caminhos.push(acharPlaywright()) } catch {}
  if (process.env.SABINOS_PLAYWRIGHT) {
    try { caminhos.push(createRequire(join(process.env.SABINOS_PLAYWRIGHT, 'package.json')).resolve('playwright')) } catch {}
  }
  for (const c of caminhos) { try { return await import(pathToFileURL(c).href) } catch {} }
  return null
}

const pw = await carregarPlaywright()
const pular = pw ? false : `sem Playwright. Rode na raiz do projeto: ${INSTALAR}`
let navegador
let pagina

before(async () => {
  if (pular) return
  navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
  pagina = await navegador.newPage()
})
after(async () => { if (navegador) await navegador.close() })

const abrir = nome => pagina.goto(pathToFileURL(join(FIXTURES, nome)).href)

test('busca real: tipo de cada link, vendidos e patrocinado', { skip: pular }, async () => {
  await abrir('busca.html')
  const cards = await pagina.evaluate(extrairCards)
  assert.equal(cards.length, 5)
  const itens = deduplicar(cards)
  assert.deepEqual(itens.map(i => i.tipo).sort(), ['catalogo', 'catalogo', 'produto', 'tradicional', null].sort())
  const pago = itens.find(i => i.tipo === null)
  assert.equal(pago.patrocinado, true)
  assert.equal(itens.filter(i => i.patrocinado).length, 1)
  const vendidos = itens.map(i => i.vendidos)
  assert.ok(vendidos.filter(v => v > 0).length >= 3, JSON.stringify(vendidos))
  assert.ok(vendidos.includes(null), 'um dos cards nao mostra vendidos')
})

test('busca real: o selo de anuncio marca patrocinado mesmo sem o link de clique', { skip: pular }, async () => {
  const html = readFileSync(join(FIXTURES, 'busca.html'), 'utf8').replace(/https:\/\/click1\.mercadolivre\.com\.br\/mclics\/[^"]*/g, 'https://produto.mercadolivre.com.br/MLB-12345-garrafa-exemplo-_JM')
  await pagina.setContent(html)
  const cards = await pagina.evaluate(extrairCards)
  assert.equal(cards.filter(c => /ads-promotions|mclics/.test(c.url)).length, 0)
  assert.equal(cards.filter(c => c.patrocinado).length, 1)
})

test('pagina real: video do vendedor na galeria conta', { skip: pular }, async () => {
  await abrir('video-vendedor.html')
  assert.equal((await pagina.evaluate(lerPagina)).video, true)
})

test('pagina real: video so de comprador nao conta', { skip: pular }, async () => {
  await abrir('video-comprador.html')
  // o exemplo tem video de comprador (o seletor antigo diria que tem video)
  assert.ok(await pagina.evaluate(() => document.querySelectorAll('[class*="clips"]').length) > 0)
  assert.equal((await pagina.evaluate(lerPagina)).video, false)
})

test('perguntas reais: uma por elemento, sem rodape nem botao', { skip: pular }, async () => {
  await abrir('perguntas.html')
  const p = await pagina.evaluate(extrairPerguntas)
  assert.deepEqual(p.map(x => x.pergunta), ['Mantem quente por quantas horas?', 'Vem com tampa extra?', 'Pode ir na lava louca?'])
  assert.ok(p.every(x => !/denunciar|privacidade/i.test(x.pergunta)))
  assert.match(p[0].resposta, /12 horas/)
})

test('medidor com o Chrome de verdade: quadrado preto em fundo branco', { skip: pular }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'medir-real-'))
  const medidor = await abrirMedidor({ carregar: async () => pw })
  try {
    const png = await pagina.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 100
      c.height = 100
      const x = c.getContext('2d')
      x.fillStyle = '#ffffff'
      x.fillRect(0, 0, 100, 100)
      x.fillStyle = '#000000'
      x.fillRect(20, 20, 60, 60)
      return c.toDataURL('image/png').split(',')[1]
    })
    const arq = join(dir, 'capa.png')
    writeFileSync(arq, Buffer.from(png, 'base64'))
    const m = await medidor.medir(arq)
    assert.deepEqual(m.fundo, { hex: '#ffffff', branco_puro: true })
    assert.equal(m.respiro, 0.2)
    assert.equal(m.ocupacao, 0.36)
    assert.match((await medidor.medir(join(dir, 'nao-existe.png'))).erro, /ENOENT/)
  } finally {
    await medidor.fechar()
    rmSync(dir, { recursive: true, force: true })
  }
})
