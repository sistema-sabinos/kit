// Testes das partes puras das cascas da coleta. Sem Chrome e sem rede; o --help roda de verdade.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { opcoes, lista, exigirFfmpeg, abrirPagina } from './lib/pagina.mjs'
import { tagDeEncode, escolherFaixas, atualizarPronto, limparLegendaTxt, juntarComAnteriores, ogDoHtml } from './coletar.mjs'
import { parseOg } from './lib/instagram-publico.mjs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { juntarLevas } from './refiltrar.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const efg = tag => 'https://cdn/x.mp4?efg=' + encodeURIComponent(Buffer.from(JSON.stringify({ vencode_tag: tag })).toString('base64'))

test('opcoes separa --nome valor, bandeira sozinha e argumento solto', () => {
  assert.deepEqual(opcoes(['--dias', '7', '--help', 'a', '--tag', 'x']), { _: ['a'], dias: '7', help: true, tag: 'x' })
})

test('lista tira espaco e arroba', () => {
  assert.deepEqual(lista(' @a, b ,,c'), ['a', 'b', 'c'])
  assert.deepEqual(lista(true), [])
})

test('exigirFfmpeg acusa quando o programa nao existe', () => {
  assert.throws(() => exigirFfmpeg(() => ({ error: new Error('ENOENT') })), /ffmpeg nao encontrado/)
  assert.doesNotThrow(() => exigirFfmpeg(() => ({ status: 0 })))
})

// Rodada 5.12: com a saida por exitCode, conexao aberta depois de aba que falhou pendurava o processo.
test('abrirPagina fecha a conexao com o Chrome quando a aba nao abre', async () => {
  let fechou = 0
  const browser = {
    contexts: () => [{ newPage: async () => { throw new Error('aba recusada') } }],
    close: async () => { fechou++ },
  }
  await assert.rejects(abrirPagina(async () => browser), /aba recusada/)
  assert.equal(fechou, 1)
})

test('escolherFaixas pega a melhor resolucao e separa o audio', () => {
  const urls = [efg('dash_360p_video'), efg('dash_audio'), efg('dash_1080p_video'), 'https://cdn/sem-tag.mp4']
  assert.equal(tagDeEncode(urls[1]), 'dash_audio')
  assert.equal(tagDeEncode('https://cdn/sem-tag.mp4'), '')
  const r = escolherFaixas(urls)
  assert.equal(r.video, urls[2])
  assert.equal(r.audio, urls[1])
  assert.deepEqual(escolherFaixas(['https://cdn/a.mp4']), { video: 'https://cdn/a.mp4', audio: null })
})

test('juntarLevas deixa cada perfil uma vez so', () => {
  const r = juntarLevas([{ perfis: [{ user: 'a', posts: [] }, { user: 'b', posts: [] }] }, { perfis: [{ user: 'a', posts: [1] }] }])
  assert.deepEqual(r.map(p => p.user), ['a', 'b'])
  assert.deepEqual(r[0].posts, [])
})

test('nomeDaLeva aceita o nome nu, o .json e o caminho que o garimpo imprime', async () => {
  const { nomeDaLeva } = await import('./refiltrar.mjs')
  assert.equal(typeof nomeDaLeva, 'function', 'o refiltrar.mjs exporta o nomeDaLeva')
  assert.equal(nomeDaLeva('aberto-2026-10-13'), 'aberto-2026-10-13', 'canario: o nome nu continua')
  assert.equal(nomeDaLeva('aberto-2026-10-13.json'), 'aberto-2026-10-13')
  assert.equal(nomeDaLeva('inteligencia/base-ideias/aberto-2026-10-13-leva1.md'), 'aberto-2026-10-13-leva1')
})

test('juntarComAnteriores troca so os codigos coletados agora e mantem o resto do posts.json', () => {
  const antes = [{ codigo: 'A1', curtidas: 10 }, { codigo: 'B2', curtidas: 20 }, { codigo: 'C3', curtidas: 30 }]
  const r = juntarComAnteriores(antes, [{ codigo: 'B2', curtidas: 99 }, { codigo: 'D4', curtidas: 5 }])
  assert.ok(r.length > 0, 'canario: veio lista')
  assert.deepEqual(r, [{ codigo: 'A1', curtidas: 10 }, { codigo: 'C3', curtidas: 30 }, { codigo: 'B2', curtidas: 99 }, { codigo: 'D4', curtidas: 5 }])
  assert.deepEqual(juntarComAnteriores([], [{ codigo: 'X' }]), [{ codigo: 'X' }])
})

test('cada casca responde ao --help sem abrir Chrome', () => {
  for (const s of ['coletar.mjs', 'garimpo.mjs', 'refiltrar.mjs', 'frequencia.mjs']) {
    const r = spawnSync(process.execPath, [join(AQUI, s), '--help'], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${s}: ${r.stderr}`)
    assert.match(r.stdout, /uso:/, s)
  }
})

// Rodada 5.2: post ja baixado antes da limpeza. fromCodePoint, nunca fromCharCode, pro bloco Tag.
test('atualizarPronto limpa a legenda guardada e anota o alerta, alem dos numeros', () => {
  const cp = (...n) => String.fromCodePoint(...n)
  const velho = { codigo: 'x', legenda: 'Compre' + cp(0xe0041, 0xe0042, 0x202e) + ' ja', curtidas: 1, arquivo: 'slides/x' }
  const r = atualizarPronto(velho, { curtidas: 9, comentarios: null, legenda: 'Compre ja' }, '2026-10-08')
  assert.equal(r.legenda, 'Compre ja')
  assert.deepEqual(r.alertas, { tag: 2, bidi: 1 })
  assert.equal(r.curtidas, 9)
  assert.equal(r.atualizado, '2026-10-08')
  const limpo = atualizarPronto({ codigo: 'y', legenda: 'oi' }, { curtidas: null, comentarios: null }, '2026-10-08')
  assert.equal('alertas' in limpo, false)
  assert.equal('atualizado' in limpo, false)
})

test('limparLegendaTxt limpa o arquivo do carrossel mesmo sem alerta (largura zero)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'legenda-'))
  try {
    const arq = join(dir, 'legenda.txt')
    writeFileSync(arq, 'Compre' + String.fromCodePoint(0x200b) + ' ja')
    assert.equal(limparLegendaTxt(arq), true)
    assert.equal(readFileSync(arq, 'utf8'), 'Compre ja')
    assert.equal(limparLegendaTxt(arq), false, 'arquivo ja limpo nao se regrava')
    assert.equal(limparLegendaTxt(join(dir, 'nao-existe.txt')), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Rodada 5.12: bruto de um reel real (fixtures/reel-real-2026-10-12.json, anonimizado). O
// Instagram deixou de mandar 1080p/720p na etiqueta e passou a mandar _q20 a _q90; so o q90 era
// 1080x1920 (medido por ffprobe), e a coleta pegava o primeiro da rede, o q20.
const REAL = JSON.parse(readFileSync(join(AQUI, 'fixtures', 'reel-real-2026-10-12.json'), 'utf8'))

test('escolherFaixas no bruto real pega a faixa de maior resolucao e o audio', () => {
  assert.ok(REAL.faixas.length > 2, 'canario: fixture com faixas')
  const medida = u => REAL.faixas.find(f => f.url === u).medida
  const maior = Math.max(...REAL.faixas.filter(f => f.medida.tipo === 'video').map(f => f.medida.altura))
  const r = escolherFaixas(REAL.faixas.map(f => f.url))
  assert.equal(medida(r.video).altura, maior)
  assert.equal(medida(r.audio).tipo, 'audio')
  assert.equal(escolherFaixas([...REAL.faixas].reverse().map(f => f.url)).video, r.video, 'nao depende da ordem da rede')
})

test('ogDoHtml le o og do HTML real em qualquer ordem de atributo e o parseOg tira numero e legenda', () => {
  const desc = ogDoHtml(REAL.metaOg)
  assert.ok(desc.length > 50, 'canario: og lido')
  const og = parseOg(desc)
  assert.equal(og.curtidas, 1251)
  assert.equal(og.comentarios, 144)
  assert.match(og.legenda, /^"Chegou a promoção da loja com a @convidada! /)
  assert.equal([...og.legenda].filter(c => c.codePointAt(0) === 0x2063).length, 0, 'separador invisivel sai')
  const invertida = REAL.metaOg.replace(/<meta (property="og:description") (content="[^"]*")/, '<meta $2 $1')
  assert.notEqual(invertida, REAL.metaOg, 'canario: a ordem foi trocada')
  assert.equal(ogDoHtml('<html><meta name="description" content="x">' + invertida), desc)
  assert.equal(ogDoHtml('<html>sem og</html>'), '')
})

// Rodada 5.15: o mesmo --tag de uma leva do garimpo do mesmo dia gravava o ranking por cima do .md dela.
test('item 11: refiltrar recusa o --tag de uma leva do garimpo do mesmo dia', async () => {
  const { nomeDoRefeito } = await import('./refiltrar.mjs')
  assert.equal(typeof nomeDoRefeito, 'function', 'o refiltrar.mjs exporta o nomeDoRefeito')
  const dir = mkdtempSync(join(tmpdir(), 'refiltrar-'))
  try {
    writeFileSync(join(dir, 'aberto-2026-10-14-leva1.json'), '{"perfis":[]}')
    writeFileSync(join(dir, 'aberto-2026-10-14-leva1.md'), 'leva do garimpo')
    writeFileSync(join(dir, 'aberto-2026-10-14-4dias.md'), 'refeito antes')
    assert.equal(nomeDoRefeito(dir, '2026-10-14', '4dias'), 'aberto-2026-10-14-4dias.md', 'canario: refazer o proprio ranking (sem .json) continua')
    assert.throws(() => nomeDoRefeito(dir, '2026-10-14', 'leva1'), /aberto-2026-10-14-leva1.*outro --tag/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
