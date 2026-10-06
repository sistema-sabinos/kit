// Testes do estilo.mjs: a categoria do produto vira estilo, e quem nao tem linha para.
// Rodar: node --test estilo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolverEstilo, lerBlocoEstilos } from './estilo.mjs'
import { lerEstilos } from './lib/estilos-md.mjs'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const PARTIDA = lerEstilos()

function projeto({ status = { slug: 'kit', categoria: 'brinquedos' }, config }) {
  const raiz = mkdtempSync(join(tmpdir(), 'estilo-'))
  mkdirSync(join(raiz, 'dados', 'pipeline', 'kit'), { recursive: true })
  if (status) writeFileSync(join(raiz, 'dados', 'pipeline', 'kit', 'status.json'), JSON.stringify(status))
  if (config !== undefined) {
    mkdirSync(join(raiz, '_contexto'), { recursive: true })
    writeFileSync(join(raiz, '_contexto', 'mercado-livre.md'), config)
  }
  return raiz
}

const bloco = (...linhas) => ['# Configuração', '', '```mercado-livre', 'erp: nenhum', '```', '', '```estilo-anuncio', ...linhas, '```', ''].join(LF)

function rodar(opcoes) {
  const raiz = projeto(opcoes)
  try { return resolverEstilo({ slug: 'kit', raiz }) } finally { rmSync(raiz, { recursive: true, force: true }) }
}

test('categoria com linha sai 0 com o estilo e as cores certas', () => {
  const r = rodar({ config: bloco('# uma linha por categoria', '', 'pet: Limpo', 'brinquedos: Colorido') })
  assert.equal(r.codigo, 0, r.saida)
  const s = JSON.parse(r.saida)
  assert.equal(s.categoria, 'brinquedos')
  assert.equal(s.estilo, 'Colorido')
  assert.ok(PARTIDA.Colorido.cores.length >= 3, 'canario: cores de partida lidas')
  assert.deepEqual(s.cores, PARTIDA.Colorido.cores)
  assert.deepEqual(s.letras, { titulo: { familia: 'Fredoka', peso: 700 }, texto: { familia: 'Fredoka', peso: 400 } })
})

test('linha com cores proprias troca as de partida', () => {
  const r = rodar({ config: bloco('brinquedos: Colorido #112233 #aabbcc #445566') })
  assert.equal(r.codigo, 0, r.saida)
  assert.deepEqual(JSON.parse(r.saida).cores, ['#112233', '#AABBCC', '#445566'])
})

test('categoria sem linha sai 2 com o nome dela', () => {
  const r = rodar({ config: bloco('pet: Limpo') })
  assert.equal(r.codigo, 2, r.saida)
  assert.ok(r.saida.includes('categoria "brinquedos" sem estilo'), r.saida)
  assert.ok(r.saida.includes('pet: Limpo'), 'mostra as linhas que existem')
})

test('sem o bloco estilo-anuncio sai 2', () => {
  const r = rodar({ config: '# Configuração\n\n```mercado-livre\nerp: nenhum\n```\n' })
  assert.equal(r.codigo, 2, r.saida)
  assert.ok(r.saida.includes('"brinquedos"'))
})

test('sem o arquivo de configuracao sai 2', () => {
  const r = rodar({})
  assert.equal(r.codigo, 2, r.saida)
  assert.ok(r.saida.includes('"brinquedos"'))
})

test('status sem categoria sai 1', () => {
  const r = rodar({ status: { slug: 'kit' }, config: bloco('brinquedos: Colorido') })
  assert.equal(r.codigo, 1)
  assert.match(r.saida, /sem categoria/)
  const r2 = rodar({ status: null, config: bloco('brinquedos: Colorido') })
  assert.equal(r2.codigo, 1)
  assert.match(r2.saida, /status\.json/)
})

test('categoria do catalogo com espaco e maiuscula casa com a linha', () => {
  for (const linha of ['Casa e Cozinha: Natural', 'casa-e-cozinha: Natural', 'Casa e  Cozínha: Natural']) {
    const r = rodar({ status: { slug: 'kit', categoria: 'casa e cozinha' }, config: bloco(linha) })
    assert.equal(r.codigo, 0, `${linha}: ${r.saida}`)
    const s = JSON.parse(r.saida)
    assert.equal(s.estilo, 'Natural')
    assert.equal(s.categoria, 'casa e cozinha', 'o valor do status.json nao muda')
  }
})

test('estilo fora dos tres reprova dizendo a linha', () => {
  assert.throws(() => lerBlocoEstilos(bloco('pet: Limpo', 'brinquedos: Moderno')), e => e.message.includes('brinquedos: Moderno'))
  assert.throws(() => lerBlocoEstilos(bloco(': Limpo')), e => e.message.includes(': Limpo'))
  assert.throws(() => lerBlocoEstilos(bloco('pet: Limpo #12')), e => e.message.includes('pet: Limpo #12'))
  assert.deepEqual(lerBlocoEstilos(bloco('pet: limpo')), [{ categoria: 'pet', estilo: 'Limpo', cores: [] }], 'canario: linha boa passa')
})

test('bloco em CRLF le sem o CR grudado', () => {
  const texto = bloco('pet: Limpo', 'brinquedos: Colorido #FFF4D6 #FF6B6B #4D96FF').split(LF).join(CR + LF)
  assert.ok(texto.includes(CR), 'canario: texto em CRLF')
  const linhas = lerBlocoEstilos(texto)
  assert.deepEqual(linhas.map(l => l.categoria), ['pet', 'brinquedos'])
  assert.deepEqual(linhas[1].cores, ['#FFF4D6', '#FF6B6B', '#4D96FF'])
  const r = rodar({ config: texto })
  assert.equal(r.codigo, 0, r.saida)
  assert.equal(JSON.parse(r.saida).estilo, 'Colorido')
})

test('dois blocos estilo-anuncio reprovam pedindo pra juntar', () => {
  const um = bloco('pet: Limpo')
  assert.deepEqual(lerBlocoEstilos(um).map(l => l.categoria), ['pet'], 'canario: um bloco so passa')
  const dois = um + ['```estilo-anuncio', 'brinquedos: Colorido', '```', ''].join(LF)
  assert.throws(() => lerBlocoEstilos(dois), /dois blocos estilo-anuncio; junte num so/)
  assert.throws(() => rodar({ config: dois }), /dois blocos estilo-anuncio; junte num so/)
})

test('duas linhas da mesma categoria reprovam nomeando as duas', () => {
  assert.equal(lerBlocoEstilos(bloco('Casa e Cozinha: Limpo', 'pet: Natural')).length, 2, 'canario: categorias diferentes passam')
  const dup = bloco('Casa e Cozinha: Limpo', 'pet: Natural', 'casa-e-cozinha: Natural')
  const nomeia = e => e.message.includes('Casa e Cozinha: Limpo') && e.message.includes('casa-e-cozinha: Natural')
  assert.throws(() => lerBlocoEstilos(dup), nomeia)
  assert.throws(() => rodar({ status: { slug: 'kit', categoria: 'pet' }, config: dup }), nomeia)
})

test('sem --slug sai 1', () => {
  const script = fileURLToPath(new URL('./estilo.mjs', import.meta.url))
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /faltou --slug/)
})

test('o configuracao-exemplo do kit traz o bloco vazio e nao traz guia_de_marca', () => {
  const texto = readFileSync(fileURLToPath(new URL('../../mercado-livre/referencias/configuracao-exemplo.md', import.meta.url)), 'utf8')
  assert.ok(texto.includes('```mercado-livre'), 'canario: arquivo lido')
  assert.deepEqual(lerBlocoEstilos(texto), [])
  assert.ok(!texto.includes('guia_de_marca'))
})
