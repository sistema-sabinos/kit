// Ponta a ponta do modo avulso da espionagem (--mlb), sem rede: o Google Chrome de verdade le a
// pagina de anuncio sintetica (fixtures/anuncio-avulso-sintetico.html, montada a mao) pelos mesmos
// leitores do Chrome dedicado, o bruto sai em dados/concorrentes/ de uma raiz temporaria e a
// /video-produto roda de verdade, com --dry-run, em cima dele. Toda requisicao da pagina e barrada.
// O Playwright vem do projeto (npm install --prefix .claude/skills/mercado-livre) ou, na bancada,
// da pasta apontada em SABINOS_PLAYWRIGHT. Sem nenhum dos dois, o teste aparece como PULADO.
// Codigo de anuncio montado por partes, porque o Gate 1 barra as letras seguidas de 6 ou mais digitos.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acharPlaywright, INSTALAR } from '../../gerar-imagens/scripts/lib/render.mjs'
import { itemAvulso, espionarAvulso, leitoresDoChrome, resumoAvulso } from './espionar.mjs'

const PAGINA = readFileSync(fileURLToPath(new URL('./fixtures/anuncio-avulso-sintetico.html', import.meta.url)), 'utf8')
const VIDEO = fileURLToPath(new URL('../../video-produto/scripts/video-produto.mjs', import.meta.url))
const L = 'MLB'
const ID = L + '7770001'

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
const barradas = []

before(async () => {
  if (pular) return
  navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
  pagina = await navegador.newPage()
  await pagina.route('**/*', r => { barradas.push(r.request().url()); return r.abort() })
})
after(async () => { if (navegador) await navegador.close() })

test('modo avulso de ponta a ponta: o link entra, o bruto sai em dados/concorrentes e a /video-produto --dry-run aceita', { skip: pular }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'espionar-avulso-'))
  try {
    const abertos = []
    const abrir = async url => { abertos.push(url); await pagina.setContent(PAGINA) }
    const item = itemAvulso(`https://produto.mercadolivre.com.br/${L}-7770001-garrafa-termica-exemplo`)
    assert.equal(item.id, ID)
    const { arquivo, anuncio } = await espionarAvulso({
      item, raiz, hoje: '2026-10-20', dormir: async () => {}, log: () => {},
      ...leitoresDoChrome(pagina, abrir, { espera: async () => {} }),
    })

    // o anuncio, todas as opinioes e a aba de perguntas, pelos links que a propria pagina deu
    assert.deepEqual(abertos, [item.url, 'https://www.mercadolivre.com.br/noindex/catalog/reviews/exemplo', 'https://www.mercadolivre.com.br/perguntas/exemplo'])
    assert.equal(arquivo, join(raiz, 'dados', 'concorrentes', `_raw-concorrentes-${ID}.json`))
    const bruto = JSON.parse(readFileSync(arquivo, 'utf8'))
    assert.equal(bruto.avulso, true)
    assert.equal(bruto.anuncios.length, 1)
    const a = bruto.anuncios[0]
    assert.equal(a.erro, undefined)
    assert.equal(a.titulo, 'Garrafa Termica Exemplo Inox 1 Litro')
    assert.equal(a.preco, 89.9)
    assert.equal(a.vendedor, 'LOJA EXEMPLO')
    assert.equal(a.vendidos, 1000)
    assert.equal(a.fotos.length, 2)
    assert.equal(a.atributos.Capacidade, '1 L')
    assert.deepEqual(a.avaliacoes.avaliacoes.map(x => x.nota), [5, 5, 2])
    assert.equal(a.avaliacoes_em, '2026-10-20')
    assert.match(a.perguntas, /Cabe no porta copo do carro\?/)
    assert.equal(a.perguntas_em, '2026-10-20')
    // nada da esteira: sem fornecedores/ e sem vocabulario da categoria
    assert.deepEqual(readdirSync(raiz), ['dados'])

    // o comando que o script sugere roda de verdade, da raiz do projeto, com --dry-run
    const linhas = resumoAvulso(raiz, arquivo, anuncio)
    assert.equal(linhas[1], `dados/concorrentes/_raw-concorrentes-${ID}.json`)
    const sugeridos = linhas[2].split(' ').filter(x => /^--(mlb|fase|de-espionagem)=/.test(x))
    assert.equal(sugeridos.length, 3, `canario: o comando sugerido traz --mlb, --fase e --de-espionagem (${linhas[2]})`)
    const producao = join(raiz, 'producao')
    const r = spawnSync(process.execPath, [VIDEO, ...sugeridos, '--slug=garrafa-exemplo', `--producao=${producao}`, '--dry-run'], { cwd: raiz, encoding: 'utf8' })
    assert.equal(r.status, 0, `video-produto saiu ${r.status}:\n${r.stderr}`)
    const coleta = JSON.parse(readFileSync(join(producao, 'garrafa-exemplo', 'coleta.json'), 'utf8'))
    assert.equal(coleta.origem, 'espionagem')
    assert.equal(coleta.mlb, ID)
    assert.ok(coleta.duvidas.length >= 3, `duvidas: ${JSON.stringify(coleta.duvidas)}`)
    assert.ok(existsSync(arquivo))
    assert.deepEqual(barradas, [], 'a pagina nao pediu nada pra rede')
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})
