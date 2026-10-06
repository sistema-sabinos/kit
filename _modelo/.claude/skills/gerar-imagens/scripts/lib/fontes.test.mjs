// Testes das letras embutidas. Os de "no Chrome" abrem o Google Chrome de verdade e
// carregam as fontes do disco; o Playwright vem do projeto (npm install --prefix
// .claude/skills/mercado-livre) ou, na bancada, da pasta em SABINOS_PLAYWRIGHT. Sem
// nenhum dos dois, esses aparecem como PULADOS no placar (nunca como verdes).
// Rodar: node --test fontes.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { acharPlaywright, fotografar, INSTALAR } from './render.mjs'
import { DIR_FONTES, FONTES, cssFontes, avaliarFontes, conferirFontes } from './fontes.mjs'
import { montarPeca } from '../montar-peca.mjs'

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
const carregar = async () => pw
let navegador

before(async () => {
  if (pular) return
  navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
})
after(async () => { if (navegador) await navegador.close() })

// peca do jeito que nasce: indentada, com quebra e espaco entre as tags, e a letra
// so nos elementos que tem texto
function peca(familiaTitulo, familiaTexto = 'Manrope') {
  return [
    '<!doctype html>',
    '<html>',
    '  <head><meta charset="utf-8"><title>peca</title></head>',
    '  <body style="margin:0;background:#FFF4D6">',
    '    <div class="caixa">',
    `      <h1 style="font-family: '${familiaTitulo}'; font-weight: 700; font-size: 90px">Brinquedo à noite</h1>`,
    '      <div>',
    `        <p style="font-family: ${familiaTexto}; font-weight: 400; font-size: 40px">Ação, 1º lugar</p>`,
    '      </div>',
    '    </div>',
    '  </body>',
    '</html>',
  ].join('\n')
}

function pasta() { return mkdtempSync(join(tmpdir(), 'fontes-')) }

test('a pasta de fontes traz as 3 fontes e a licenca de cada uma', () => {
  assert.equal(FONTES.length, 3)
  for (const f of FONTES) {
    const ttf = join(DIR_FONTES, f.arquivo)
    assert.ok(existsSync(ttf), `falta ${f.arquivo}`)
    assert.ok(statSync(ttf).size > 50000, `${f.arquivo} pequeno demais`)
    assert.equal(readFileSync(ttf).readUInt32BE(0), 0x00010000, `${f.arquivo} nao e TrueType`)
    const ofl = readFileSync(join(DIR_FONTES, `OFL-${f.familia}.txt`), 'utf8')
    assert.ok(ofl.includes('SIL Open Font License'), `OFL-${f.familia}.txt sem a licenca`)
    assert.ok(ofl.includes(`The ${f.familia} Project Authors`), `OFL-${f.familia}.txt de outra fonte`)
  }
})

test('cssFontes declara as 3 familias com file absoluto e faixa de peso', () => {
  const css = cssFontes()
  const blocos = css.match(/@font-face \{[^}]*\}/g) || []
  assert.equal(blocos.length, 3)
  for (const f of FONTES) {
    const b = blocos.find(x => x.includes(`font-family: '${f.familia}'`))
    assert.ok(b, `sem @font-face da ${f.familia}`)
    const url = b.match(/url\('([^']+)'\)/)[1]
    assert.ok(url.startsWith('file:///'), url)
    const caminho = fileURLToPath(url)
    assert.ok(isAbsolute(caminho) && existsSync(caminho), caminho)
    assert.ok(b.includes(`font-weight: ${f.pesos};`), b)
  }
  assert.deepEqual(FONTES.map(f => f.pesos), ['200 800', '300 700', '400 700'])
})

test('cssFontes com apostrofo na pasta fecha o url e volta pro caminho certo', () => {
  const dir = join(tmpdir(), "D'Avila", 'fontes')
  const css = cssFontes(dir)
  const blocos = css.match(/@font-face \{[^}]*\}/g) || []
  assert.equal(blocos.length, 3, 'canario: as 3 declaracoes')
  for (const f of FONTES) {
    const b = blocos.find(x => x.includes(`font-family: '${f.familia}'`))
    const m = b.match(/url\('([^']*)'\) format\('truetype'\);/)
    assert.ok(m, `url quebrado: ${b}`)
    assert.equal(fileURLToPath(m[1]), join(dir, f.arquivo))
  }
})

test('no Chrome, fonte em pasta com apostrofo carrega', { skip: pular }, async () => {
  const dir = pasta()
  const pagina = await navegador.newPage()
  try {
    const fontes = join(dir, "D'Avila")
    mkdirSync(fontes)
    for (const f of FONTES) copyFileSync(join(DIR_FONTES, f.arquivo), join(fontes, f.arquivo))
    writeFileSync(join(dir, 'p.html'), '<p>x</p>')
    await pagina.goto(pathToFileURL(join(dir, 'p.html')).href)
    await pagina.addStyleTag({ content: cssFontes(fontes) })
    for (const f of FONTES) {
      const n = await pagina.evaluate(async x => {
        try { return (await document.fonts.load(`700 40px "${x}"`)).filter(y => y.status === 'loaded').length } catch { return -1 }
      }, f.familia)
      assert.equal(n, 1, f.familia)
    }
  } finally {
    await pagina.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('avaliarFontes aponta letra fora das embutidas e letra que nao carregou', () => {
  const ok = avaliarFontes({
    usadas: [{ familia: 'Fredoka', peso: '700' }, { familia: 'manrope', peso: '400' }],
    carregadas: [{ familia: 'Fredoka', peso: '700', faces: 1 }, { familia: 'manrope', peso: '400', faces: 1 }],
  })
  assert.deepEqual(ok, [])
  const p = avaliarFontes({
    usadas: [{ familia: 'Poppins', peso: '700' }, { familia: 'Poppins', peso: '400' }, { familia: 'Lora', peso: '700' }, { familia: 'Times New Roman', peso: '400' }],
    carregadas: [{ familia: 'Lora', peso: '700', faces: 0 }],
  })
  assert.equal(p.length, 3, p.join(' | '))
  assert.ok(p.some(x => x.includes('"Poppins"') && x.includes('Manrope, Fredoka ou Lora')))
  assert.ok(p.some(x => x.includes('"Times New Roman"')))
  assert.ok(p.some(x => x.includes('"Lora"') && x.includes('Lora.ttf')))
})

test('no Chrome, as 3 familias carregam do disco', { skip: pular }, async () => {
  // por file://, como a peca abre: pagina em branco (setContent) nao le arquivo do disco
  const dir = pasta()
  const pagina = await navegador.newPage()
  try {
    writeFileSync(join(dir, 'p.html'), '<p>x</p>')
    await pagina.goto(pathToFileURL(join(dir, 'p.html')).href)
    await pagina.addStyleTag({ content: cssFontes() })
    const conta = familia => pagina.evaluate(async f => {
      try { return (await document.fonts.load(`700 40px "${f}"`)).filter(x => x.status === 'loaded').length } catch { return -1 }
    }, familia)
    assert.equal(await conta('Familia Que Nao Existe'), 0, 'canario: familia inexistente devolve 0 face')
    for (const f of FONTES) assert.equal(await conta(f.familia), 1, f.familia)
  } finally {
    await pagina.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('no Chrome, peca indentada com font-family so no texto passa', { skip: pular }, async () => {
  const dir = pasta()
  try {
    writeFileSync(join(dir, 'peca.html'), peca('Fredoka'))
    const out = join(dir, '02-peca.jpg')
    await montarPeca({ html: join(dir, 'peca.html'), out, largura: 600, foto: (f, o) => fotografar(f, { ...o, carregar }) })
    assert.ok(statSync(out).size > 1000)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('no Chrome, peca com fonte fora das embutidas reprova pelo nome', { skip: pular }, async () => {
  const dir = pasta()
  try {
    writeFileSync(join(dir, 'peca.html'), peca('Poppins'))
    const out = join(dir, '02-peca.jpg')
    await assert.rejects(
      montarPeca({ html: join(dir, 'peca.html'), out, largura: 600, foto: (f, o) => fotografar(f, { ...o, carregar }) }),
      e => e.message.includes('"Poppins"') && e.message.includes('nao esta embutida'))
    assert.ok(!existsSync(out), 'a foto nao pode ter saido')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('no Chrome, texto escondido em letra de fora nao reprova; o visivel reprova', { skip: pular }, async () => {
  const dir = pasta()
  const montar = (corpo, nome) => {
    writeFileSync(join(dir, nome), `<!doctype html><html><head><meta charset="utf-8"></head><body>${corpo}<p style="font-family: Manrope; font-weight: 400">Texto que aparece</p></body></html>`)
    return montarPeca({ html: join(dir, nome), out: join(dir, nome + '.jpg'), largura: 600, foto: (f, o) => fotografar(f, { ...o, carregar }) })
  }
  try {
    await assert.rejects(montar('<h1 style="font-family: system-ui">Titulo</h1>', 'visivel.html'),
      e => e.message.includes('"system-ui"'), 'canario: system-ui visivel reprova')
    await montar([
      '<h1 style="display:none; font-family: system-ui">Titulo escondido</h1>',
      '<span style="visibility:hidden; font-family: Arial">some</span>',
      '<div style="display:none"><b style="font-family: Georgia">dentro do escondido</b></div>',
    ].join(''), 'escondido.html')
    assert.ok(statSync(join(dir, 'escondido.html.jpg')).size > 1000)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('no Chrome, texto de ::before e ::after conta como texto da peca', { skip: pular }, async () => {
  const dir = pasta()
  const montar = (css, nome) => {
    writeFileSync(join(dir, nome), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><p style="font-family: Manrope; font-weight: 400">Texto <span class="selo"></span></p></body></html>`)
    return montarPeca({ html: join(dir, nome), out: join(dir, nome + '.jpg'), largura: 600, foto: (f, o) => fotografar(f, { ...o, carregar }) })
  }
  try {
    await assert.rejects(montar('.selo::before { content: "10 cm"; font-family: Arial; font-weight: 700 }', 'antes.html'),
      e => e.message.includes('"Arial"') && e.message.includes('nao esta embutida'))
    assert.ok(!existsSync(join(dir, 'antes.html.jpg')), 'a foto nao pode ter saido')
    await assert.rejects(montar('.selo::after { content: "novo"; font-family: Georgia }', 'depois.html'),
      e => e.message.includes('"Georgia"'))
    await montar('.selo::before { content: "10 cm"; font-family: Manrope; font-weight: 700 }', 'manrope.html')
    assert.ok(statSync(join(dir, 'manrope.html.jpg')).size > 1000)
    await montar('.selo::before { content: ""; display: inline-block; width: 20px; height: 20px; background: red; font-family: Arial }', 'vazio.html')
    assert.ok(statSync(join(dir, 'vazio.html.jpg')).size > 1000)
    // imagem por CSS nao tem letra: nao reprova
    const svg = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27/%3E'
    await montar(`.selo::before { content: url("${svg}"); font-family: Arial }`, 'imagem.html')
    assert.ok(statSync(join(dir, 'imagem.html.jpg')).size > 1000)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('no Chrome, fonte embutida com arquivo faltando reprova', { skip: pular }, async () => {
  const dir = pasta()
  try {
    const fontes = join(dir, 'fontes')
    mkdirSync(fontes)
    for (const f of FONTES.filter(x => x.familia !== 'Lora')) copyFileSync(join(DIR_FONTES, f.arquivo), join(fontes, f.arquivo))
    writeFileSync(join(dir, 'peca.html'), peca('Lora'))
    const out = join(dir, '02-peca.jpg')
    await assert.rejects(
      fotografar(pathToFileURL(join(dir, 'peca.html')).href, { saida: out, largura: 600, altura: 600, css: cssFontes(fontes), conferir: conferirFontes, carregar }),
      e => e.message.includes('"Lora"') && e.message.includes('nao carregou'))
    assert.ok(!existsSync(out), 'a foto nao pode ter saido')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
