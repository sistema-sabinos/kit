import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import zlib from 'node:zlib'
import { ASSINATURA, ErroPng, paeth, lerPng, gravarPng, crc32 } from './lib/png.mjs'
import { comparar, redimensionar, mostrar, principal } from './comparar-telas.mjs'
import { principal as principalParidade } from './paridade.mjs'

// Tela de mentira pros testes: barra do topo, linhas de "texto" e um botao.
function tela(largura, altura, cor = [255, 255, 255]) {
  const rgb = new Uint8Array(largura * altura * 3)
  for (let i = 0; i < largura * altura; i++) rgb.set(cor, i * 3)
  return { largura, altura, rgb }
}

function retangulo(img, x, y, l, a, cor) {
  for (let yy = y; yy < Math.min(img.altura, y + a); yy++) {
    for (let xx = x; xx < Math.min(img.largura, x + l); xx++) img.rgb.set(cor, (yy * img.largura + xx) * 3)
  }
}

function pagina({ largura = 240, altura = 360, topo = [20, 20, 60], destaque = [40, 110, 230], texto = [30, 30, 30], botaoY = 250 } = {}) {
  const img = tela(largura, altura)
  retangulo(img, 0, 0, largura, 40, topo)
  for (let i = 0; i < 6; i++) retangulo(img, 20, 70 + i * 22, largura - 60 - (i % 3) * 30, 8, texto)
  retangulo(img, 20, botaoY, 120, 36, destaque)
  return img
}

function pixel(img, x, y) {
  const o = (y * img.largura + x) * 3
  return [img.rgb[o], img.rgb[o + 1], img.rgb[o + 2]]
}

// Codificador de PNG do teste, com o filtro escolhido em toda linha, paleta e tRNS.
function codificar(caminho, l, a, linhasAmostra, tipoCor, { prof = 8, filtro = 0, plte = null, trns = null, entrelacado = 0, idat = null } = {}) {
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipoCor]
  const bpp = Math.max(1, Math.floor((prof * canais) / 8))
  const cru = []
  let ant = new Uint8Array(linhasAmostra[0].length)
  for (const linhaAmostra of linhasAmostra) {
    const linha = Uint8Array.from(linhaAmostra)
    cru.push(filtro)
    for (let i = 0; i < linha.length; i++) {
      const v = linha[i]
      const esq = i >= bpp ? linha[i - bpp] : 0
      const cima = ant[i]
      const ce = i >= bpp ? ant[i - bpp] : 0
      let f = v
      if (filtro === 1) f = v - esq
      else if (filtro === 2) f = v - cima
      else if (filtro === 3) f = v - ((esq + cima) >> 1)
      else if (filtro === 4) f = v - paeth(esq, cima, ce)
      cru.push(f & 0xff)
    }
    ant = linha
  }
  const pedaco = (tipo, corpo) => {
    const cab = Buffer.alloc(8)
    cab.writeUInt32BE(corpo.length, 0)
    cab.write(tipo, 4, 'latin1')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), corpo])), 0)
    return Buffer.concat([cab, corpo, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(l, 0)
  ihdr.writeUInt32BE(a, 4)
  ihdr[8] = prof
  ihdr[9] = tipoCor
  ihdr[12] = entrelacado
  const partes = [ASSINATURA, pedaco('IHDR', ihdr)]
  if (plte) partes.push(pedaco('PLTE', Buffer.from(plte.flat())))
  if (trns) partes.push(pedaco('tRNS', Buffer.from(trns)))
  partes.push(pedaco('IDAT', idat || zlib.deflateSync(Buffer.from(cru))), pedaco('IEND', Buffer.alloc(0)))
  writeFileSync(caminho, Buffer.concat(partes))
}

test('crc32 proprio bate com o valor de referencia do CRC-32', () => {
  assert.equal(crc32(Buffer.from('123456789', 'latin1')), 0xcbf43926)
  assert.equal(crc32(Buffer.alloc(0)), 0)
  assert.equal(crc32(Buffer.from('IEND', 'latin1')), 0xae426082)
})

function comPasta(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'comparar-telas-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function rodar(argv) {
  const saida = []
  const erro = []
  const codigo = principal(argv, (t) => saida.push(t), (t) => erro.push(t))
  return { codigo, saida: saida.join('\n'), erro: erro.join('\n') }
}

// Leitura e gravacao

test('ida e volta em RGB devolve a mesma imagem', () => comPasta((d) => {
  const img = pagina({ largura: 40, altura: 30 })
  gravarPng(join(d, 'a.png'), img)
  const lida = lerPng(join(d, 'a.png'))
  assert.deepEqual([lida.largura, lida.altura], [40, 30])
  assert.deepEqual(lida.rgb, img.rgb)
}))

test('os 5 filtros em RGBA', () => comPasta((d) => {
  const l = 7
  const a = 5
  const fonte = []
  for (let y = 0; y < a; y++) {
    const linha = []
    for (let x = 0; x < l; x++) linha.push([(x * 30) % 256, (y * 50) % 256, (x * y * 17) % 256, 255])
    fonte.push(linha)
  }
  const esperado = Uint8Array.from(fonte.flatMap((linha) => linha.flatMap((px) => px.slice(0, 3))))
  for (let filtro = 0; filtro < 5; filtro++) {
    codificar(join(d, 'f.png'), l, a, fonte.map((linha) => linha.flat()), 6, { filtro })
    assert.deepEqual(lerPng(join(d, 'f.png')).rgb, esperado, `filtro ${filtro}`)
  }
}))

test('transparencia vira branco', () => comPasta((d) => {
  codificar(join(d, 'a.png'), 1, 1, [[0, 0, 0, 0]], 6)
  assert.deepEqual(pixel(lerPng(join(d, 'a.png')), 0, 0), [255, 255, 255])
}))

test('tRNS em cinza e RGB: a cor marcada vira branco e as outras continuam opacas', () => comPasta((d) => {
  codificar(join(d, 'rgb8.png'), 2, 1, [[0, 0, 0, 10, 20, 30]], 2, { trns: [0, 0, 0, 0, 0, 0] })
  const r8 = lerPng(join(d, 'rgb8.png'))
  assert.deepEqual([pixel(r8, 0, 0), pixel(r8, 1, 0)], [[255, 255, 255], [10, 20, 30]], 'RGB 8 bits')
  codificar(join(d, 'cinza8.png'), 2, 1, [[50, 51]], 0, { trns: [0, 50] })
  const c8 = lerPng(join(d, 'cinza8.png'))
  assert.deepEqual([pixel(c8, 0, 0), pixel(c8, 1, 0)], [[255, 255, 255], [51, 51, 51]], 'cinza 8 bits')
  // Os dois pixels tem o mesmo byte alto; so o primeiro bate com a cor de 16 bits do tRNS.
  codificar(join(d, 'rgb16.png'), 2, 1, [[0x12, 0x00, 0x34, 0x00, 0x56, 0x00, 0x12, 0xff, 0x34, 0x00, 0x56, 0x00]], 2, { prof: 16, trns: [0x12, 0x00, 0x34, 0x00, 0x56, 0x00] })
  const r16 = lerPng(join(d, 'rgb16.png'))
  assert.deepEqual([pixel(r16, 0, 0), pixel(r16, 1, 0)], [[255, 255, 255], [0x12, 0x34, 0x56]], 'RGB 16 bits')
}))

test('cinza, paleta de 2 bits e 16 bits', () => comPasta((d) => {
  codificar(join(d, 'g.png'), 3, 1, [[0, 128, 255]], 0)
  const g = lerPng(join(d, 'g.png'))
  assert.deepEqual([pixel(g, 0, 0), pixel(g, 1, 0), pixel(g, 2, 0)], [[0, 0, 0], [128, 128, 128], [255, 255, 255]])
  codificar(join(d, 'p.png'), 4, 1, [[0b00011011]], 3, { prof: 2, plte: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [9, 9, 9]] })
  const p = lerPng(join(d, 'p.png'))
  assert.deepEqual([0, 1, 2, 3].map((x) => pixel(p, x, 0)), [[255, 0, 0], [0, 255, 0], [0, 0, 255], [9, 9, 9]])
  codificar(join(d, 's.png'), 1, 1, [[0x12, 0x34, 0xab, 0xcd, 0xef, 0x01]], 2, { prof: 16 })
  assert.deepEqual(pixel(lerPng(join(d, 's.png')), 0, 0), [0x12, 0xab, 0xef])
}))

test('PNG entrelacado e recusado com a dica', () => comPasta((d) => {
  codificar(join(d, 'i.png'), 1, 1, [[1, 2, 3]], 2, { entrelacado: 1 })
  assert.throws(() => lerPng(join(d, 'i.png')), (e) => e instanceof ErroPng && /entrelacad/.test(e.message) && /salve de novo/.test(e.message))
}))

test('arquivo que nao e PNG e recusado', () => comPasta((d) => {
  writeFileSync(join(d, 'x.png'), Buffer.from('GIF89a', 'latin1'))
  assert.throws(() => lerPng(join(d, 'x.png')), ErroPng)
}))

test('PNG corrompido ou cortado e recusado e a linha de comando sai 2', () => comPasta((d) => {
  // cabecalho diz 2 linhas e os dados so trazem 1
  codificar(join(d, 'c.png'), 1, 2, [[1, 2, 3]], 2)
  assert.throws(() => lerPng(join(d, 'c.png')), (e) => e instanceof ErroPng && /cortados/.test(e.message))
  // dados que nao sao zlib
  codificar(join(d, 'z.png'), 1, 1, [[1, 2, 3]], 2, { idat: Buffer.from([1, 2, 3, 4, 5]) })
  assert.throws(() => lerPng(join(d, 'z.png')), (e) => e instanceof ErroPng && /corrompidos/.test(e.message))
  const r = rodar([join(d, 'z.png'), join(d, 'c.png')])
  assert.ok(r.erro.length > 0)
  assert.equal(r.codigo, 2)
}))

// Comparacao

test('telas iguais dao 100 e nenhuma regiao, nos dois modos', () => {
  for (const modo of ['layout', 'pixel']) {
    const { relatorio } = comparar(pagina(), pagina(), { modo })
    assert.equal(relatorio.nota, 100, modo)
    assert.deepEqual(relatorio.regioes, [], modo)
    assert.equal(relatorio.veredito, 'bate', modo)
  }
})

test('marca nova mantem a nota de layout e derruba a de pixel', () => {
  const original = pagina()
  const nova = pagina({ topo: [120, 20, 40], destaque: [20, 160, 90], texto: [60, 50, 40] })
  const layout = comparar(original, nova, { modo: 'layout' }).relatorio
  const px = comparar(original, nova, { modo: 'pixel' }).relatorio
  assert.ok(layout.nota >= 90, `layout ${layout.nota}`)
  assert.ok(px.nota < layout.nota)
  assert.ok(px.regioes.length > 0)
})

test('botao movido aparece onde ele esta', () => {
  const { relatorio } = comparar(pagina(), pagina({ botaoY: 310 }), { modo: 'layout' })
  assert.ok(relatorio.nota < 100)
  assert.ok(relatorio.regioes.length > 0)
  assert.ok(relatorio.regioes.every((r) => r.y >= 200), JSON.stringify(relatorio.regioes.map((r) => r.y)))
  assert.ok(relatorio.regioes.every((r) => r.x < 160))
  assert.ok(relatorio.regioes.some((r) => /baixo|meio/.test(r.onde)))
})

test('tela em branco sai diferente', () => {
  const { relatorio } = comparar(pagina(), tela(240, 360), { modo: 'layout' })
  assert.ok(relatorio.nota < 50)
  assert.equal(relatorio.veredito, 'diferente')
})

test('print de tela retina compara na mesma largura', () => {
  const pequena = pagina({ largura: 120, altura: 180 })
  const grande = redimensionar(pequena, 240, 360)
  const { relatorio } = comparar(pequena, grande, { modo: 'layout' })
  assert.ok(relatorio.nota >= 90)
  assert.equal(relatorio.comparado_em.largura, 120)
})

test('diferenca de altura aparece no relatorio', () => {
  const img = pagina()
  const alta = tela(240, 450)
  alta.rgb.set(img.rgb, 0)
  const { relatorio } = comparar(img, alta)
  assert.equal(relatorio.modo, 'layout')
  assert.equal(relatorio.diferenca_altura_pct, 25)
  assert.match(mostrar(relatorio, 'a', 'b'), /25% mais alta/)
})

// Linha de comando

test('linha de comando: JSON, imagem de diferenca e minimo', () => comPasta((d) => {
  const [a, b, saida] = ['a.png', 'b.png', 'diff.png'].map((n) => join(d, n))
  gravarPng(a, pagina())
  gravarPng(b, pagina({ botaoY: 310 }))
  const r = rodar([a, b, '--json', '--saida', saida])
  assert.equal(r.codigo, 0)
  const rel = JSON.parse(r.saida)
  assert.equal(typeof rel.nota, 'number')
  assert.equal(rel.arquivos.minha, b)
  assert.equal(rel.imagem_diff, saida)
  const diff = lerPng(saida)
  assert.deepEqual([diff.largura, diff.altura], [rel.comparado_em.largura, rel.comparado_em.altura])
  assert.equal(rodar([a, b, '--minimo', '99.9']).codigo, 1)
  assert.equal(rodar([a, a, '--minimo', '99.9']).codigo, 0)
}))

test('--json-saida grava JSON em UTF-8 sem BOM e o paridade --visual le a pasta', () => comPasta((d) => {
  const [a, b] = ['a.png', 'b.png'].map((n) => join(d, n))
  gravarPng(a, pagina())
  gravarPng(b, pagina({ botaoY: 310 }))
  const pasta = join(d, 'comparacoes')
  mkdirSync(pasta)
  const destino = join(pasta, 'T07.json')
  const r = rodar([a, b, '--json-saida', destino])
  assert.equal(r.codigo, 0, r.erro)
  assert.match(r.saida, /LAYOUT/)
  const bytes = readFileSync(destino)
  assert.ok(bytes.length > 0)
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf])
  const rel = JSON.parse(bytes.toString('utf8'))
  assert.equal(typeof rel.nota, 'number')
  assert.equal(rel.arquivos.minha, b)
  const csv = join(d, 'f.csv')
  writeFileSync(csv, 'funcao,prioridade,original,minha\nA,obrigatoria,sim,sim\n')
  const saida = []
  const erro = []
  const codigo = principalParidade([csv, '--visual', pasta, '--json'], (t) => saida.push(t), (t) => erro.push(t))
  assert.equal(codigo, 0, erro.join('\n'))
  const placar = JSON.parse(saida.join('\n'))
  assert.equal(placar.visual.length, 1)
  assert.equal(placar.visual[0].nota, rel.nota)
  assert.equal(placar.nota_telas, rel.nota)
}))

test('--json-saida sem caminho sai 2', () => comPasta((d) => {
  const [a, b] = ['a.png', 'b.png'].map((n) => join(d, n))
  gravarPng(a, pagina())
  gravarPng(b, pagina())
  const r = rodar([a, b, '--json-saida'])
  assert.ok(r.erro.length > 0)
  assert.equal(r.codigo, 2)
}))

test('linha de comando sem nenhuma flag: texto, sai 0 mesmo bem diferente e nao grava imagem', () => comPasta((d) => {
  const [a, b] = ['a.png', 'b.png'].map((n) => join(d, n))
  gravarPng(a, pagina())
  gravarPng(b, tela(240, 360))
  const r = rodar([a, b])
  assert.equal(r.codigo, 0)
  assert.match(r.saida, /LAYOUT/)
  assert.match(r.saida, /DIFERENTE/)
  assert.throws(() => JSON.parse(r.saida))
  assert.deepEqual(readdirSync(d).sort(), ['a.png', 'b.png'])
}))

test('largura que nao divide pelas colunas: a faixa da direita e a de baixo entram na comparacao', () => comPasta((d) => {
  // 390 / 12 da celula de 32 e sobra 6 px (384 a 389); 100 / 32 sobra 4 linhas (96 a 99).
  const l = 390
  const a = 100
  const linhas = (preto) => Array.from({ length: a }, (_, y) => Array.from({ length: l }, (_, x) => (preto(x, y) ? [0, 0, 0] : [255, 255, 255])).flat())
  const branca = join(d, 'branca.png')
  const direita = join(d, 'direita.png')
  const baixo = join(d, 'baixo.png')
  codificar(branca, l, a, linhas(() => false), 2)
  codificar(direita, l, a, linhas((x) => x >= 385), 2)
  codificar(baixo, l, a, linhas((x, y) => y >= 97), 2)
  for (const [alvo, onde] of [[direita, /direita/], [baixo, /baixo/]]) {
    for (const modo of ['layout', 'pixel']) {
      const r = rodar([branca, alvo, '--json', '--modo', modo])
      assert.equal(r.codigo, 0, r.erro)
      assert.ok(r.saida.length > 0)
      const rel = JSON.parse(r.saida)
      assert.ok(rel.nota < 100, `${modo} ${alvo}: nota ${rel.nota}`)
      assert.notEqual(rel.veredito, modo === 'layout' ? 'bate' : '')
      assert.ok(rel.regioes.length > 0, `${modo} ${alvo}: sem regiao`)
      assert.ok(rel.regioes.some((g) => onde.test(g.onde)), JSON.stringify(rel.regioes))
      if (onde.source === 'direita') assert.ok(rel.regioes.some((g) => g.x + g.largura === l), JSON.stringify(rel.regioes))
    }
  }
}))

// achado do Codex na 5.1: a ultima coluna engolia a sobra inteira e, com muitas colunas, ficava
// tao larga que a borda se diluia abaixo do limiar de celula vazia (nota 100 pra tela diferente)
test('muitas colunas: a sobra vira coluna parcial e a metade preta nao some', () => comPasta((d) => {
  const l = 399
  const a = 100
  const linhas = (preto) => Array.from({ length: a }, (_, y) => Array.from({ length: l }, (_, x) => (preto(x, y) ? [0, 0, 0] : [255, 255, 255])).flat())
  const branca = join(d, 'branca.png')
  const metade = join(d, 'metade.png')
  codificar(branca, l, a, linhas(() => false), 2)
  codificar(metade, l, a, linhas((x) => x >= 200), 2)
  const r = rodar([branca, metade, '--json', '--modo', 'layout', '--colunas', '200'])
  assert.equal(r.codigo, 0, r.erro)
  assert.ok(r.saida.length > 0)
  const rel = JSON.parse(r.saida)
  assert.ok(rel.nota < 100, `nota ${rel.nota}`)
  assert.notEqual(rel.veredito, 'bate')
  assert.ok(rel.regioes.length > 0, 'sem regiao')
  for (const g of rel.regioes) assert.ok(g.x + g.largura <= l, JSON.stringify(g))
}))

test('arquivo que nao existe sai 2 com mensagem', () => {
  const r = rodar([join(tmpdir(), 'nao-existe-a.png'), join(tmpdir(), 'nao-existe-b.png')])
  assert.ok(r.erro.length > 0)
  assert.equal(r.codigo, 2)
  assert.match(r.erro, /nao achei/)
  assert.ok(!existsSync(join(tmpdir(), 'nao-existe-a.png')))
})
