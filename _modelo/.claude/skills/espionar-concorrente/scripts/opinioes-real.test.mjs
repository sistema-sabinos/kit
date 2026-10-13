// Testes que abrem o Google Chrome de verdade contra o recorte da pagina real de todas as
// opinioes do Mercado Livre (fixtures/opinioes-real-2026-10-12.html, lida sem login no ensaio
// da 5.12, texto de cada opiniao trocado por neutro). Provam o seletor da data e a rolagem que
// carrega mais. A carga de mais opinioes imita o que o ensaio mediu: a pagina abre com 15, cada
// opiniao ocupa uns 319 px (4787 px pra 15), e so chegando no fim da pagina vem mais 15.
// O Playwright vem do projeto (npm install --prefix .claude/skills/mercado-livre) ou, na
// bancada, da pasta apontada em SABINOS_PLAYWRIGHT. Sem nenhum dos dois, os testes aparecem
// como PULADOS no placar (nunca como verdes).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acharPlaywright, INSTALAR } from '../../gerar-imagens/scripts/lib/render.mjs'
import { lerAvaliacoesDaPagina, avaliacoesDaPagina, lerTodasAsOpinioes } from './espionar.mjs'

const RECORTE = readFileSync(fileURLToPath(new URL('./fixtures/opinioes-real-2026-10-12.html', import.meta.url)), 'utf8')

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
  pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } })
})
after(async () => { if (navegador) await navegador.close() })

test('opinioes reais: a data vem do tempo da opiniao, nao do pais', { skip: pular }, async () => {
  await pagina.setContent(RECORTE)
  const cru = await pagina.evaluate(lerAvaliacoesDaPagina)
  assert.equal(cru.comentarios.length, 4, 'canario: o recorte tem 4 opinioes')
  assert.deepEqual(cru.comentarios.map(c => c.data), ['Há mais de 1 ano', 'Há 1 ano', 'Há mais de 1 ano', 'Há 6 meses'])
  const r = avaliacoesDaPagina(cru, { hoje: '2026-10-12' })
  assert.equal(r.total, 1391)
  assert.equal(r.media, 4.8)
  assert.deepEqual(r.avaliacoes.map(a => a.nota), [5, 5, 5, 5])
  assert.equal(r.avaliacoes[0].texto, 'Chegou rapido e mantem a agua gelada o dia todo.')
  assert.equal(r.avaliacoes[0].curtidas, 13)
  assert.deepEqual(r.avaliacoes.map(a => a.data), ['2025-10-12', '2025-10-12', '2025-10-12', '2026-04-12'])
  assert.ok(r.avaliacoes.every(a => a.data_aproximada === true && a.data_texto.startsWith('Há ')), 'aproximada, com o texto da pagina')
})

// Pagina que se comporta como a medida: 15 de cara, mais 15 so quando a rolagem chega no fim.
const comCarga = total => RECORTE.replace('</body>', `<style>.ui-review-capability-comments__comment{min-height:319px;display:block}</style>
<script>{
const caixa = document.querySelector('.ui-review-capability-comments')
const modelos = [...caixa.children].map(c => c.outerHTML)
const por = n => { for (let i = 0; i < n && caixa.children.length < ${total}; i++) caixa.insertAdjacentHTML('beforeend', modelos[caixa.children.length % modelos.length]) }
caixa.innerHTML = ''; por(15)
let carregando = false
addEventListener('scroll', () => {
  if (carregando || scrollY + innerHeight < document.body.scrollHeight - 5) return
  carregando = true; setTimeout(() => { por(15); carregando = false }, 300)
})
}</script></body>`)

test('lerTodasAsOpinioes desce ate o fim e junta as 100, sem parar nas 15 da primeira leva', { skip: pular }, async () => {
  await pagina.setContent(comCarga(1391))
  const r = await lerTodasAsOpinioes(pagina, { espera: () => pagina.waitForTimeout(500) })
  assert.ok(r.comentarios.length >= 100, `leu ${r.comentarios.length}`)
  assert.equal(r.parou, 'cem')
})

test('lerTodasAsOpinioes para quando a lista acaba e diz por que parou', { skip: pular }, async () => {
  await pagina.setContent(comCarga(20))
  const r = await lerTodasAsOpinioes(pagina, { espera: () => pagina.waitForTimeout(500) })
  assert.equal(r.comentarios.length, 20)
  assert.equal(r.parou, 'acabou')
})
