import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  carregarTemas, lerAvaliacoes, deEspionagem, analisar, peso, recorte, montarRelatorio, casaTema,
} from './avaliacoes.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'avaliacoes.mjs')
const HOJE = '2026-10-01'

const LINHAS = [
  ['mercado-livre', 'https://www.mercadolivre.com.br/r/1', '2026-08-01', '1',
    'Caro demais pelo que é. Queria que viesse com o carregador.'],
  ['amazon', 'https://www.amazon.com.br/r/2', '2026-07-15', '2',
    'O preço dobrou esse ano. O vendedor nunca respondeu minha mensagem.'],
  ['shopee', 'https://shopee.com.br/r/3', '2026-06-01', '2',
    'Não vale o que custa. Não tem como escolher a cor na compra.'],
  ['reclame-aqui', 'https://www.reclameaqui.com.br/r/4', '2026-05-01', '',
    'Sinceramente o preço é o que pesa pra minha lojinha.'],
  ['mercado-livre', 'https://www.mercadolivre.com.br/r/5', '2026-08-10', '5',
    'Amei, uso todo dia e funciona muito bem.'],
  ['amazon', 'https://www.amazon.com.br/r/6', '2026-07-01', '1',
    'Veio quebrado e a tampa não fecha.'],
  ['mercado-livre', 'https://www.mercadolivre.com.br/r/7', '2026-08-02', '1',
    'Cheiro forte de plástico que não sai de jeito nenhum.'],
  // sem link: sai fora e entra na conta de descartadas
  ['mercado-livre', '', '2026-08-01', '1', 'Caro e quebrou.'],
  // texto repetido (com espaco a mais): conta uma vez so
  ['shopee', 'https://shopee.com.br/r/9', '2026-07-16', '2',
    'O preço dobrou esse ano.  O vendedor nunca respondeu minha mensagem.'],
]

const aspas = v => '"' + String(v).replace(/"/g, '""') + '"'
function gravarCsv(caminho, linhas, cabecalho = ['source', 'url', 'date', 'rating', 'text'], sep = ',') {
  writeFileSync(caminho, [cabecalho, ...linhas].map(l => l.map(aspas).join(sep)).join('\r\n') + '\r\n')
}

function rodar(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  return { codigo: r.status, saida: r.stdout, erro: r.stderr }
}

function comFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'avaliacoes-'))
  try {
    const caminho = join(dir, 'avaliacoes.csv')
    gravarCsv(caminho, LINHAS)
    const temas = carregarTemas()
    const lidas = lerAvaliacoes(caminho)
    const resultado = analisar(lidas.avaliacoes, temas, { hoje: HOJE })
    return fn({ dir, caminho, temas, lidas, resultado })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('linha sem link sai fora e avaliacao repetida conta uma vez', () => comFixture(({ lidas }) => {
  assert.equal(lidas.descartadas, 1)
  assert.equal(lidas.duplicadas, 1)
  assert.equal(lidas.avaliacoes.length, 7)
}))

test('preco e a maior reclamacao', () => comFixture(({ resultado }) => {
  const topo = resultado.temas.filter(t => t.tipo === 'reclamacao')[0]
  assert.equal(topo.id, 'preco')
  assert.equal(topo.quantidade, 4)
  assert.equal(topo.fraco, false)
  assert.equal(topo.fontes.length, 4)
}))

test('toda citacao e literal e tem link', () => comFixture(({ lidas, resultado }) => {
  const porLink = new Map(lidas.avaliacoes.map(a => [a.link, a.texto]))
  const citacoes = [...resultado.temas.flatMap(t => t.citacoes), ...resultado.pedidos]
  assert.ok(citacoes.length > 0, 'nenhuma citacao saiu')
  for (const c of citacoes) {
    assert.ok(porLink.has(c.link), `link fora da entrada: ${c.link}`)
    assert.ok(porLink.get(c.link).includes(c.citacao.replace(/^\.+|\.+$/g, '').trim()), `citacao nao literal: ${c.citacao}`)
  }
}))

test('pedidos saem nas palavras do cliente', () => comFixture(({ resultado }) => {
  const textos = resultado.pedidos.map(p => p.citacao)
  assert.ok(textos.length > 0)
  assert.ok(textos.some(t => t.includes('carregador')))
  assert.ok(textos.some(t => t.includes('escolher a cor')))
}))

test('tema de uma fonte so fica fraco', () => comFixture(({ resultado }) => {
  const defeito = resultado.temas.find(t => t.id === 'defeito')
  assert.ok(defeito, 'tema defeito sumiu')
  assert.equal(defeito.fraco, true)
}))

test('nota baixa sem tema aparece pra ler na mao', () => comFixture(({ resultado }) => {
  const links = resultado.sem_tema_negativas.map(a => a.link)
  assert.ok(links.includes('https://www.mercadolivre.com.br/r/7'))
}))

test('avaliacao velha vale metade e sem nota vale 0,6', () => {
  assert.equal(peso({ nota: 1, data: '2023-01-01' }, '2026-10-01', 18), 0.5)
  assert.equal(peso({ nota: null, data: null }, '2026-10-01', 18), 0.6)
  assert.equal(peso({ nota: 1, data: '2026-09-01' }, '2026-10-01', 18), 1)
})

// achado do Codex na revisao final (5.1): elogio de 5 estrelas que fala de entrega virava
// reclamacao de entrega; tema de reclamacao so conta nota 1, 2 ou 3, ou sem nota
const elogio = (texto, i, nota) => ({ fonte: 'f' + i, link: 'https://exemplo.com/e' + i, data: null, nota, texto })

test('elogio de 4 e 5 estrelas sobre entrega fica fora das reclamacoes', () => {
  const avs = ['Entrega excelente, antes do prazo', 'Entrega rapida, vendedor atencioso', 'Melhor entrega que ja recebi']
    .map((t, i) => elogio(t, i, i === 2 ? 4 : 5))
  const temas = carregarTemas('marketplace')
  // canario: o tema de entrega casa esses textos, senao o teste nao prova nada
  const entregaTema = temas.temas.find(t => t.id === 'entrega')
  assert.ok(entregaTema, 'tema entrega sumiu')
  assert.ok(avs.every(a => casaTema(entregaTema, a.texto)), 'canario: o tema entrega nao casa os elogios')
  const r = analisar(avs, temas, { hoje: HOJE })
  assert.deepEqual(r.temas.filter(t => t.tipo === 'reclamacao').map(t => t.id), [])
})

test('nota 2 e sem nota sobre entrega continuam contando como reclamacao', () => {
  const temas = carregarTemas('marketplace')
  const r = analisar([elogio('A entrega atrasou duas semanas', 1, 2), elogio('Entrega demorou demais', 2, null)], temas, { hoje: HOJE })
  const entrega = r.temas.find(t => t.id === 'entrega')
  assert.ok(entrega, 'a reclamacao de entrega sumiu')
  assert.equal(entrega.quantidade, 2)
  assert.deepEqual(entrega.citacoes.map(c => c.nota).sort(), [2, null].sort())
})

test('relatorio com aviso de amostra pequena, link e sem travessao', () => comFixture(({ lidas, resultado }) => {
  const texto = montarRelatorio(resultado, lidas)
  assert.ok(texto.includes('Amostra pequena'))
  assert.ok(texto.includes('1 linha descartada'))
  assert.ok(texto.includes('https://shopee.com.br/r/3'))
  assert.ok(!texto.includes(String.fromCharCode(0x2014)))
  assert.ok(!texto.includes(String.fromCharCode(0x2013)))
}))

test('CSV sem coluna de link sai 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avaliacoes-'))
  try {
    const p = join(dir, 'semlink.csv')
    gravarCsv(p, [['mercado-livre', 'gostei']], ['fonte', 'texto'])
    const r = rodar([p])
    assert.equal(r.codigo, 2)
    assert.ok(r.erro.includes('link'), `erro sem a palavra link: ${r.erro}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--json e --saida pela linha de comando', () => comFixture(({ dir, caminho }) => {
  const saida = join(dir, 'sub', 'relatorio.md')
  const r = rodar([caminho, '--hoje', HOJE, '--saida', saida])
  assert.equal(r.codigo, 0, r.erro)
  assert.ok(existsSync(saida))
  assert.ok(readFileSync(saida, 'utf8').includes('# O que os clientes do concorrente odeiam e pedem'))
  const j = rodar([caminho, '--json', '--hoje', HOJE])
  assert.equal(j.codigo, 0, j.erro)
  const dados = JSON.parse(j.saida)
  assert.equal(dados.descartadas, 1)
  assert.equal(dados.duplicadas, 1)
}))

test('recorte em volta do trecho que casou', () => {
  const texto = 'x'.repeat(400) + ' caro demais ' + 'y'.repeat(400)
  const s = recorte(texto, /caro/i, 100)
  assert.ok(s.includes('caro'))
  assert.ok(s.length <= 106, `recorte com ${s.length}`)
})

// achado na prova com avaliacao real da App Store (5.1): o recorte saia "...éssimo", com a
// palavra cortada no meio; o trecho mostrado tem que comecar e terminar em palavra inteira
test('recorte comeca e termina em palavra inteira', () => {
  const texto = 'Péssimo por não ter opção de detalhar denuncia nem nada do tipo ou enviar captura de tela pois tentaram me dar golpe e fui assediado e a plataforma não me deu ajuda em nada, me sentindo super constrangido e oprimido pela situação toda que passei nesse aplicativo horrível'
  const palavras = new Set(texto.split(/\s+/))
  // varios tamanhos de janela, pra alguma ponta cair no meio de palavra se o conserto sumir
  for (let limite = 60; limite <= 160; limite += 7) {
    const s = recorte(texto, /golpe/i, limite)
    assert.ok(s.includes('golpe'), `sem o trecho que casou: ${s}`)
    assert.ok(s.startsWith('...') && s.endsWith('...'), `devia cortar nas duas pontas: ${s}`)
    const miolo = s.slice(3, -3).trim().split(/\s+/)
    assert.ok(miolo.length > 3, 'recorte vazio')
    for (const p of [miolo[0], miolo[miolo.length - 1]]) assert.ok(palavras.has(p), `limite ${limite}: palavra cortada no meio: "${p}" em ${s}`)
    assert.ok(texto.includes(s.slice(3, -3).trim()), 'o recorte deixou de ser literal')
  }
})

test('recorte sem corte nao ganha reticencias', () => {
  assert.equal(recorte('Muito caro.', /caro/i, 100), 'Muito caro.')
})

test('golpe tem tema proprio nos temas de app, fora da cobranca', () => {
  const temas = carregarTemas('app')
  const cobranca = temas.temas.find(t => t.id === 'cobranca')
  const golpe = temas.temas.find(t => t.id === 'golpe')
  assert.ok(golpe, 'falta o tema golpe nos temas de app')
  assert.ok(casaTema(golpe, 'Tentaram me dar um GOLPE aqui dentro'))
  assert.ok(casaTema(golpe, 'Perfil falso pedindo Pix'))
  assert.ok(!casaTema(cobranca, 'Tentaram me dar um golpe aqui dentro'))
  assert.ok(casaTema(cobranca, 'Cobraram duas vezes no cartão'))
})

// Novos do porte

test('acento e maiuscula nao mudam o tema: preço, preco e PREÇO', () => {
  const temas = carregarTemas()
  const avs = ['O preço subiu.', 'O preco subiu.', 'O PREÇO SUBIU.'].map((texto, i) => ({
    fonte: 'f' + i, link: 'https://exemplo.com/' + i, data: null, nota: 2, texto,
  }))
  const r = analisar(avs, temas, { hoje: HOJE })
  const preco = r.temas.find(t => t.id === 'preco')
  assert.ok(preco, 'tema preco nao casou nada')
  assert.equal(preco.quantidade, 3)
  // a citacao sai do texto original, com o acento dele
  assert.ok(preco.citacoes.some(c => c.citacao === 'O PREÇO SUBIU.'))
})

test('"veio quebrado" cai em defeito', () => {
  const temas = carregarTemas()
  const defeito = temas.temas.find(t => t.id === 'defeito')
  assert.ok(casaTema(defeito, 'Veio QUEBRADO, que tristeza'))
  assert.ok(!casaTema(defeito, 'Veio inteiro'))
})

test('ponte --de-espionagem: fonte por anuncio, link do anuncio, sem data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avaliacoes-'))
  try {
    const bruto = {
      produto: 'Garrafa térmica', categoria: 'cozinha', em: '2026-10-01', termo: 'garrafa termica',
      anuncios: [
        { id: 'MLB111', url: 'https://www.mercadolivre.com.br/a/MLB111', avaliacoes: { media: 3, total: 3, avaliacoes: [
          { nota: 1, titulo: 'Veio quebrado', texto: 'A tampa chegou rachada.', curtidas: 2 },
          { nota: 5, titulo: 'Excelente', texto: '', curtidas: 0 },
          { nota: 4, titulo: '', texto: '', curtidas: 0 },
        ] } },
        { id: 'MLB222', url: 'https://www.mercadolivre.com.br/a/MLB222', avaliacoes: { media: 3, total: 2, avaliacoes: [
          { nota: 5, titulo: 'Excelente', texto: '', curtidas: 0 },
          { nota: 2, titulo: '', texto: 'Demorou demais pra chegar e o preço é alto.', curtidas: 1 },
        ] } },
        { id: 'MLB333', url: 'https://www.mercadolivre.com.br/a/MLB333', avaliacoes: { erro: 'HTTP 403' } },
      ],
    }
    const caminho = join(dir, '_raw-concorrentes-garrafa.json')
    writeFileSync(caminho, JSON.stringify(bruto, null, 2))
    const lidas = deEspionagem(caminho)
    // a sem titulo e sem texto sai fora; "Excelente" em dois anuncios sao duas avaliacoes
    assert.equal(lidas.descartadas, 1)
    assert.equal(lidas.duplicadas, 0)
    assert.equal(lidas.avaliacoes.length, 4)
    for (const a of lidas.avaliacoes) {
      assert.match(a.fonte, /^MLB\d+$/)
      assert.ok(a.link.endsWith('/' + a.fonte))
      assert.equal(a.data, null)
    }
    const r = analisar(lidas.avaliacoes, carregarTemas(), { hoje: HOJE })
    const defeito = r.temas.find(t => t.id === 'defeito')
    assert.deepEqual(defeito.fontes, ['MLB111'])
    assert.equal(defeito.fraco, true)
    // toda citacao aparece literal no bruto
    const textosDoBruto = bruto.anuncios.flatMap(a => a.avaliacoes.avaliacoes || []).flatMap(v => [v.titulo, v.texto])
    const citacoes = r.temas.flatMap(t => t.citacoes)
    assert.ok(citacoes.length > 0)
    for (const c of citacoes) assert.ok(textosDoBruto.some(t => t && t.includes(c.citacao)), `fora do bruto: ${c.citacao}`)
    // pela linha de comando, o relatorio avisa que o link leva ao anuncio
    const cli = rodar(['--de-espionagem', caminho, '--hoje', HOJE])
    assert.equal(cli.codigo, 0, cli.erro)
    assert.ok(cli.saida.includes('leva ao anúncio'))
    assert.ok(cli.saida.includes('MLB111'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sem nenhuma flag opcional: relatorio no terminal, temas de marketplace', () => comFixture(({ caminho }) => {
  const r = rodar([caminho])
  assert.equal(r.codigo, 0, r.erro)
  assert.ok(r.saida.includes('## O que odeiam'))
  assert.ok(r.saida.includes('Preço e custo-benefício'))
}))

test('CSV do Excel: ponto e virgula, BOM, colunas em portugues e data dd/mm/aaaa', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avaliacoes-'))
  try {
    const p = join(dir, 'excel.csv')
    const linhas = [['amazon', 'https://www.amazon.com.br/r/1', '01/08/2026', '1', 'Caro; e o preço subiu']]
    writeFileSync(p, String.fromCharCode(0xfeff) + [['fonte', 'link', 'data', 'nota', 'texto'], ...linhas].map(l => l.map(aspas).join(';')).join('\r\n') + '\r\n')
    const lidas = lerAvaliacoes(p)
    assert.equal(lidas.avaliacoes.length, 1)
    const a = lidas.avaliacoes[0]
    assert.equal(a.fonte, 'amazon')
    assert.equal(a.data, '2026-08-01')
    assert.equal(a.nota, 1)
    assert.equal(a.texto, 'Caro; e o preço subiu')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('entrada ruim sai 2: sem arquivo, --meses torto, tema com padrao quebrado, bruto que nao e da espionagem', () => {
  const dir = mkdtempSync(join(tmpdir(), 'avaliacoes-'))
  try {
    const csv = join(dir, 'a.csv')
    gravarCsv(csv, LINHAS)
    const r0 = rodar([])
    assert.equal(r0.codigo, 2)
    assert.ok(r0.erro.length > 0)
    const r1 = rodar([csv, '--meses', 'abc'])
    assert.equal(r1.codigo, 2)
    assert.ok(r1.erro.includes('--meses'))
    const temas = join(dir, 'temas.json')
    writeFileSync(temas, JSON.stringify({ temas: [{ id: 'x', padroes: ['(aberto'] }] }))
    const r2 = rodar([csv, '--temas', temas])
    assert.equal(r2.codigo, 2)
    assert.ok(r2.erro.includes('x'))
    const outro = join(dir, 'outro.json')
    writeFileSync(outro, JSON.stringify({ itens: [] }))
    const r3 = rodar(['--de-espionagem', outro])
    assert.equal(r3.codigo, 2)
    assert.ok(r3.erro.includes('espionar-concorrente'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--temas app usa o arquivo de app', () => comFixture(({ caminho }) => {
  const r = rodar([caminho, '--temas', 'app', '--json', '--hoje', HOJE])
  assert.equal(r.codigo, 0, r.erro)
  const dados = JSON.parse(r.saida)
  assert.ok(dados.temas.some(t => t.rotulo === 'Preço e parte paga'))
}))

// Canario dos dois arquivos de tema: cada tema casa a frase dele e nao casa a outra
for (const nome of ['marketplace', 'app']) {
  test(`canario de cada tema em temas-${nome}.json`, () => {
    const { temas, pedidos } = carregarTemas(nome)
    assert.ok(temas.length >= 14, `poucos temas em ${nome}: ${temas.length}`)
    assert.ok(pedidos.length > 0)
    const falhas = []
    for (const t of temas) {
      if (!t.exemplo_casa || !t.exemplo_nao_casa) { falhas.push(`${t.id}: sem exemplo`); continue }
      if (!casaTema(t, t.exemplo_casa)) falhas.push(`${t.id}: nao casou "${t.exemplo_casa}"`)
      if (casaTema(t, t.exemplo_nao_casa)) falhas.push(`${t.id}: casou "${t.exemplo_nao_casa}"`)
    }
    assert.deepEqual(falhas, [])
  })
}
