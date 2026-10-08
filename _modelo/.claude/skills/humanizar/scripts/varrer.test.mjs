import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { REGRAS, normalizar, fatos, ocorrencias, compararFatos, mostrarComparacao, principal } from './varrer.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const LIB = join(AQUI, '..', '..', 'ler-avaliacoes', 'scripts', 'lib')
const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const TRAVESSAO = String.fromCharCode(0x2014)
const MEIA_RISCA = String.fromCharCode(0x2013)
const LARGURA_ZERO = String.fromCharCode(0x200b)
const ZWJ = String.fromCharCode(0x200d)
const BOM = String.fromCharCode(0xfeff)
const AGUDO = String.fromCharCode(0x301)
const CRASE = String.fromCharCode(0x300)
const TIL = String.fromCharCode(0x303)
const CEDILHA = String.fromCharCode(0x327)
const NBSP = String.fromCharCode(0xa0)
const NNBSP = String.fromCharCode(0x202f)
const SHY = String.fromCharCode(0xad)
const SUP2 = String.fromCharCode(178)
const SUP3 = String.fromCharCode(179)
const EURO = String.fromCharCode(0x20ac)

// pasta temporaria propria de cada teste, apagada no finally mesmo quando um assert falha
function comPasta(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'humanizar-'))
  try {
    return fn(raiz)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
}

function rodar(argv, cwd) {
  const saida = []
  const avisos = []
  const codigo = principal(argv, s => saida.push(s), s => avisos.push(s), cwd)
  return { codigo, saida: saida.join(LF), avisos: avisos.join(LF) }
}

const ids = texto => ocorrencias(texto).map(o => o.id)
const chaves = texto => fatos(texto).map(f => f.tipo + ' ' + f.valor)

// ---------- B1: normalizacao e fatos ----------

test('canario NFD: acento solto casa depois da normalizacao', () => {
  // "fico à disposição" com cada acento solto (forma NFD), montado por codigo
  const nfd = 'Fico a' + CRASE + ' disposic' + CEDILHA + 'a' + TIL + 'o.'
  assert.equal(nfd.length, 'Fico à disposição.'.length + 3)
  assert.notEqual(nfd, nfd.normalize('NFC'))
  assert.ok(ids(nfd).includes('C-1'))
  assert.equal(normalizar(nfd), 'Fico à disposição.')
})

test('normalizar tira BOM, invisivel e bidi, troca CRLF e CR por LF e mantem o ZWJ', () => {
  const bidi = String.fromCharCode(0x202e) + String.fromCharCode(0x2066) + String.fromCharCode(0x200f)
  const entrada = BOM + 'a' + LARGURA_ZERO + 'b' + CR + LF + 'c' + CR + 'd' + bidi + String.fromCharCode(0x2060) + 'e' + ZWJ + 'f'
  assert.equal(normalizar(entrada), 'ab' + LF + 'c' + LF + 'de' + ZWJ + 'f')
})

test('R$ escondido por largura zero vira fato', () => {
  const texto = 'R$' + LARGURA_ZERO + ' 10,00'
  assert.ok(texto.includes(LARGURA_ZERO))
  const f = fatos(texto)
  assert.equal(f.length, 1)
  assert.equal(f[0].tipo, 'dinheiro')
  assert.equal(f[0].valor, '10')
})

test('Entrega amanha e Entrega na proxima semana dao fatos diferentes', () => {
  const a = chaves('Entrega amanhã')
  const b = chaves('Entrega na próxima semana')
  assert.deepEqual(a, ['prazo amanha'])
  assert.deepEqual(b, ['prazo proxima semana'])
  assert.equal(compararFatos('Entrega amanhã', 'Entrega na próxima semana').iguais, false)
})

test('numero canonico: 1.500 igual a 1500 e 1,5 igual a 1.5', () => {
  assert.deepEqual(chaves('1.500 peças'), chaves('1500 peças'))
  assert.deepEqual(chaves('1.500 peças'), ['medida 1500 peca'])
  assert.deepEqual(chaves('nota 1,5'), chaves('nota 1.5'))
  assert.deepEqual(chaves('R$ 1.500,00'), ['dinheiro 1500'])
})

test('R$ com mil, prazo com algarismo, prazo por palavra e medida', () => {
  assert.deepEqual(chaves('R$ 2 mil ou R$ 1,5 mil'), ['dinheiro 2000', 'dinheiro 1500'])
  assert.deepEqual(chaves('Chega em 5 dias úteis, ou 24h no expresso, ou 2 semanas'), ['prazo 5 dias uteis', 'prazo 24 horas', 'prazo 2 semanas'])
  assert.deepEqual(chaves('Sai hoje, chega depois de amanhã ou na sexta-feira'), ['prazo hoje', 'prazo depois de amanha', 'prazo sexta'])
  assert.deepEqual(chaves('Envio no mesmo dia, retirada na hora, troca em dez dias'), ['prazo mesmo dia', 'prazo na hora', 'prazo 10 dias'])
  assert.deepEqual(chaves('Garrafa de 750 ml, 30 cm, 1,2 kg, tela de 6,5 polegadas, 5000 mAh, 20 W'),
    ['medida 750 ml', 'medida 30 cm', 'medida 1.2 kg', 'medida 6.5 polegada', 'medida 5000 mah', 'medida 20 w'])
})

// ---------- B2: ocorrencias por ID ----------

const CASOS = {
  'V-1': ['Este kit é a solução ideal para quem busca praticidade.', 'Essa foi a solução que achei pro seu caso.'],
  'V-3': ['A garrafa transforma sua rotina de treino.', 'O moedor transforma o grão em pó fino.'],
  'P-4': ['O melhor do mercado, com entrega rápida.', 'O melhor jeito de lavar é à mão.'],
  'C-1': ['Qualquer dúvida, estou à disposição.', 'Qualquer dúvida sobre o tamanho, me manda sua medida.'],
  'C-2': ['Ótima pergunta! O tecido é algodão.', 'Boa tarde! O tecido é algodão.'],
  'C-3': ['Claro! Aqui está a descrição do produto.', 'Claro, separo o tamanho M pra você.'],
  'C-5': ['Com base nas informações disponíveis, o prazo é de 5 dias.', 'Com base no seu CEP, o prazo é de 5 dias.'],
  'A-1': ['No mundo atual, todo mundo quer praticidade.', 'O mundo da costura pede tesoura boa.'],
  'A-2': ['Você já se perguntou por que seu café esfria?', 'Você já recebeu o pedido?'],
  'A-4': ['Confira a seguir os detalhes do produto.', 'Confira as medidas na tabela.'],
  'R-1': ['Não é só uma garrafa, é um estilo de vida.', 'Não é preciso lavar antes de usar.'],
  'R-2': ['Leve, prático e bonito. Rápido, seguro e fácil. Forte, macio e durável.', 'Leve, prático e bonito.'],
  'R-3': ['O resultado? Pele macia.', 'O resultado saiu ontem.'],
  'R-4': ['Você compra. Você recebe. Você usa.', 'Você compra. A loja envia. Você usa.'],
  'L-1': ['Vale ressaltar que o produto é bivolt.', 'Vale a pena conferir a voltagem.'],
  'L-2': ['Além disso, é bivolt. Também vem com cabo. Por fim, tem garantia.', 'Também vem com cabo.'],
  'L-3': ['Outrossim, informamos o prazo.', 'Outro modelo chega amanhã.'],
  'M-1': ['Frete grátis ' + TRAVESSAO + ' só hoje.', 'Frete grátis, só hoje.'],
  'M-2': ['**Leve.** Cabe na bolsa. **Forte.** Aguenta queda.', '**Leve.** Cabe na bolsa e aguenta queda.'],
  'F-1': ['Vou estar enviando o código amanhã.', 'Vou enviar o código amanhã.'],
  'F-3': ['O kit conta com três peças.', 'Pode contar com a gente.'],
  'F-4': ['Venho por meio desta informar o envio.', 'Venho avisar do envio.'],
  'F-5': ['O pedido foi enviado. A nota foi emitida. O código será enviado.', 'O pedido foi enviado.'],
}

test('toda regra tem caso de teste e todo caso tem regra', () => {
  assert.ok(REGRAS.length > 0)
  const regras = REGRAS.map(r => r.id).sort()
  assert.deepEqual(Object.keys(CASOS).sort(), regras)
  for (const r of REGRAS) {
    assert.match(r.id, /^[VCPARLMF]-[0-9]+$/)
    assert.match(r.grav, /^S[123]$/)
    assert.equal(r.cat, r.id[0])
  }
})

for (const [id, [casa, vizinho]] of Object.entries(CASOS)) {
  test(`${id} casa no texto e nao casa no vizinho`, () => {
    const achados = ocorrencias(casa)
    assert.ok(achados.length > 0, `${id}: nada achado em "${casa}"`)
    assert.ok(achados.some(o => o.id === id), `${id} nao casou em "${casa}": ${achados.map(o => o.id).join(', ')}`)
    assert.ok(!ids(vizinho).includes(id), `${id} casou no vizinho "${vizinho}"`)
  })
}

test('R-1 nas duas ordens e o FAQ de preco continua contraste', () => {
  assert.ok(ids('É investimento, não gasto.').includes('R-1'))
  assert.ok(ids('Não é caro, é R$ 10.').includes('R-1'))
  assert.ok(ids('Não é um produto. É uma experiência.').includes('R-1'))
  assert.ok(ids('É investimento, não gasto.').length > 0)
  assert.ok(!ids('É leve, não esquenta.').includes('R-1'))
})

test('travessao e meia-risca sempre contam, montados por codigo', () => {
  const texto = 'Frete grátis ' + TRAVESSAO + ' só hoje' + LF + 'De 10' + MEIA_RISCA + '20 cm'
  // canario: o dado de teste carrega mesmo o caractere
  assert.equal(texto.split('').filter(c => c.charCodeAt(0) === 0x2014).length, 1)
  assert.equal(texto.split('').filter(c => c.charCodeAt(0) === 0x2013).length, 1)
  const m1 = ocorrencias(texto).filter(o => o.id === 'M-1')
  assert.deepEqual(m1.map(o => o.linha), [1, 2])
  assert.ok(m1.every(o => o.grav === 'S1'))
})

test('linha da ocorrencia conta CRLF certo e o trecho sai do texto original', () => {
  const texto = 'Oi!' + CR + LF + 'Bom dia.' + CR + LF + 'Fico à disposição para o que precisar.'
  const c1 = ocorrencias(texto).filter(o => o.id === 'C-1')
  assert.equal(c1.length, 1)
  assert.equal(c1[0].linha, 3)
  assert.match(c1[0].trecho, /à disposição/)
})

// ---------- B3: trava antes e depois ----------

test('trava: camiseta e calca com preco trocado reprova', () => {
  const r = compararFatos('Camiseta: R$ 49,90. Calça: R$ 99,90.', 'Camiseta: R$ 99,90. Calça: R$ 49,90.')
  assert.equal(r.iguais, false)
  assert.ok(r.diferencas.length > 0)
  assert.ok(r.diferencas.some(d => d.tipo === 'mudou de lugar'))
})

test('trava: R$ 49,90 trocado por R$ 49,00 reprova', () => {
  const r = compararFatos('Por R$ 49,90 no Pix.', 'Por R$ 49,00 no Pix.')
  assert.equal(r.iguais, false)
  assert.deepEqual(r.diferencas.map(d => d.tipo).sort(), ['apareceu', 'sumiu'])
})

test('trava: 30 dias sumido reprova', () => {
  const r = compararFatos('Garantia de 30 dias e envio em 24h.', 'Garantia boa e envio em 24h.')
  assert.equal(r.iguais, false)
  assert.equal(r.diferencas.length, 1)
  assert.equal(r.diferencas[0].tipo, 'sumiu')
  assert.equal(r.diferencas[0].fato.texto, '30 dias')
})

test('trava: texto igual com acento em NFD de um lado passa', () => {
  const nfc = 'Entrega na próxima semana, 5 dias úteis, R$ 49,90.'
  const nfd = nfc.normalize('NFD')
  assert.notEqual(nfc, nfd)
  assert.ok(nfd.includes(AGUDO))
  const r = compararFatos(nfc, nfd)
  assert.ok(fatos(nfc).length >= 3)
  assert.equal(r.iguais, true)
  assert.deepEqual(r.diferencas, [])
})

test('trava pela linha de comando: igual sai 0, diferente sai 1 e lista', () => comPasta(r => {
  writeFileSync(join(r, 'a.txt'), 'Camiseta: R$ 49,90. Calça: R$ 99,90. Garantia de 30 dias.')
  writeFileSync(join(r, 'b.txt'), 'Camiseta: R$ 99,90. Calça: R$ 49,90.')
  // volta 4: "30 dias de garantia" leva a palavra seguinte, entao a reescrita de estilo deixa o prazo no fim da frase
  writeFileSync(join(r, 'c.txt'), 'A camiseta sai por R$ 49,90 e a calça por R$ 99,90. A garantia é de 30 dias.')
  const dif = rodar(['--antes', 'a.txt', '--depois', 'b.txt'], r)
  assert.equal(dif.codigo, 1)
  assert.match(dif.saida, /mudou de lugar/)
  assert.match(dif.saida, /sumiu: 30 dias/)
  const igual = rodar(['--antes', 'a.txt', '--depois', 'c.txt'], r)
  assert.ok(igual.saida.length > 0)
  assert.equal(igual.codigo, 0)
}))

// ---------- linha de comando ----------

test('linha de comando: sujo sai 1 agrupado, limpo sai 0, erro de uso ou leitura sai 2', () => comPasta(r => {
  writeFileSync(join(r, 'sujo.txt'), 'Ótima pergunta!' + LF + 'Espero ter ajudado. Além disso, também. Por fim.')
  writeFileSync(join(r, 'limpo.txt'), 'Chega em 3 dias. O tecido é algodão.')
  const sujo = rodar(['sujo.txt'], r)
  assert.equal(sujo.codigo, 1)
  assert.match(sujo.saida, /C-2 1: /)
  assert.match(sujo.saida, /C-1 2: /)
  assert.match(sujo.saida, /S1 2/)
  const limpo = rodar(['limpo.txt'], r)
  assert.ok(limpo.saida.length > 0)
  assert.equal(limpo.codigo, 0)
  assert.match(limpo.saida, /Limpo/)
  assert.equal(rodar([], r).codigo, 2)
  const sumido = rodar(['nao-existe.txt'], r)
  assert.equal(sumido.codigo, 2)
  assert.match(sumido.avisos, /nao-existe\.txt/)
  assert.equal(rodar(['--antes', 'limpo.txt'], r).codigo, 2)
  assert.equal(rodar(['sujo.txt', '--qualquer'], r).codigo, 2)
}))

test('sem flag, de dentro de um projeto, do jeito que a SKILL manda chamar', () => comPasta(r => {
  const scripts = join(r, '.claude', 'skills', 'humanizar', 'scripts')
  mkdirSync(scripts, { recursive: true })
  cpSync(join(AQUI, 'varrer.mjs'), join(scripts, 'varrer.mjs'))
  cpSync(LIB, join(r, '.claude', 'skills', 'ler-avaliacoes', 'scripts', 'lib'), { recursive: true })
  writeFileSync(join(r, 'texto.txt'), 'Oi, tudo bem?' + LF + 'Qualquer dúvida, é só chamar!')
  writeFileSync(join(r, 'limpo.txt'), 'Oi, tudo bem? Chega amanhã.')
  const opcoes = { cwd: r, encoding: 'utf8' }
  const sujo = spawnSync(process.execPath, ['.claude/skills/humanizar/scripts/varrer.mjs', 'texto.txt'], opcoes)
  assert.equal(sujo.stderr, '')
  assert.ok(sujo.stdout.length > 0)
  assert.equal(sujo.status, 1)
  assert.match(sujo.stdout, /C-1 2: /)
  const limpo = spawnSync(process.execPath, ['.claude/skills/humanizar/scripts/varrer.mjs', 'limpo.txt'], opcoes)
  assert.ok(limpo.stdout.length > 0)
  assert.equal(limpo.status, 0)
  assert.match(limpo.stdout, /Limpo/)
}))

// B4 (fixture pt-BR de 20 textos) mora em bancada/humanizar-fixture.test.mjs, fora do zip do aluno

// ---------- volta 1 da revisao adversarial: trava ----------

// reprova com pelo menos uma diferenca listada, nunca com saida vazia
function reprova(antes, depois) {
  const r = compararFatos(antes, depois)
  assert.equal(r.iguais, false, `passou: "${antes}" -> "${depois}" (${chaves(antes).join(' | ')})`)
  assert.ok(r.diferencas.length > 0)
}

// passa so valendo se havia fato pra comparar
function passa(antes, depois) {
  assert.ok(fatos(antes).length > 0, `nenhum fato em "${antes}"`)
  const r = compararFatos(antes, depois)
  assert.equal(r.iguais, true, `reprovou: "${antes}" -> "${depois}": ${chaves(antes).join(' | ')} contra ${chaves(depois).join(' | ')}`)
}

test('D1: decimal com ponto no preco nao some', () => {
  reprova('R$ 1.5', 'R$ 1.9')
  reprova('R$ 10.50', 'R$ 10.90')
})

test('D2: milhao e milhoes multiplicam o preco', () => {
  assert.deepEqual(chaves('R$ 1,5 milhão'), ['dinheiro 1500000'])
  reprova('R$ 1,5 milhão', 'R$ 1,50')
  reprova('R$ 2 milhões', 'R$ 2')
})

test('D3: mil multiplica fora do preco', () => {
  reprova('Mais de 10 mil vendidos.', 'Mais de 10 vendidos.')
})

test('D4: medida com NBSP entre numero e unidade', () => {
  const a = 'Pesa 2' + NBSP + 'kg.'
  assert.ok(a.includes(NBSP))
  reprova(a, 'Pesa 2' + NBSP + 'g.')
})

test('D5: prazo com NBSP e com U+202F entre numero e unidade', () => {
  const a = 'Chega em 5' + NBSP + 'dias.'
  const b = 'Prazo 5' + NNBSP + 'dias'
  assert.ok(a.includes(NBSP) && b.includes(NNBSP))
  reprova(a, 'Chega em 5' + NBSP + 'semanas.')
  reprova(b, 'Prazo 5' + NNBSP + 'meses')
})

test('D6: litros contra metros', () => {
  reprova('Capacidade de 2 litros.', 'Capacidade de 2 metros.')
})

test('D7: quilos contra gramas', () => {
  reprova('Pesa 2 quilos.', 'Pesa 2 gramas.')
})

test('D8: minutos contra segundos', () => {
  reprova('Pronto em 30 minutos.', 'Pronto em 30 segundos.')
})

test('D9: um ano contra dois anos', () => {
  assert.deepEqual(chaves('Garantia de um ano.'), ['prazo 1 anos'])
  reprova('Garantia de um ano.', 'Garantia de dois anos.')
})

test('D10: noventa dias contra sessenta dias', () => {
  reprova('Garantia de noventa dias.', 'Garantia de sessenta dias.')
})

test('D11: vinte e quatro horas contra quarenta e oito horas', () => {
  assert.deepEqual(chaves('Despacho em vinte e quatro horas.'), ['prazo 24 horas'])
  reprova('Despacho em vinte e quatro horas.', 'Despacho em quarenta e oito horas.')
})

test('D12: numero por extenso solto', () => {
  reprova('Possui duas portas.', 'Possui três portas.')
})

test('D13: percentual contra parcela', () => {
  assert.deepEqual(chaves('Leve com 10% off.'), ['percentual 10%'])
  assert.deepEqual(chaves('Leve com 10 por cento off.'), ['percentual 10%'])
  reprova('Leve com 10% off.', 'Leve em 10x sem juros.')
  reprova('Leve com 10% off.', 'Leve com 10 off.')
})

test('D14: metro quadrado contra metro cubico', () => {
  const a = 'Cobre 10 m' + SUP2
  assert.equal(a.charCodeAt(a.length - 1), 178)
  reprova(a, 'Cobre 10 m' + SUP3)
})

test('D15: dolar contra euro', () => {
  reprova('US$ 10', EURO + ' 10')
  reprova('US$ 10', 'R$ 10')
})

test('D16: terceira casa decimal no preco conta', () => {
  reprova('R$ 12,999', 'R$ 12,99')
})

test('limites resolvidos: reais, NBSP no R$, separador de milhar fino ou invisivel, extenso igual ao algarismo', () => {
  passa('Custa R$ 10.', 'Custa 10 reais.')
  passa('R$' + NBSP + '10', 'R$ 10')
  passa('R$ 1' + NNBSP + '234', 'R$ 1234')
  passa('R$ 1' + SHY + '000', 'R$ 1000')
  passa('Chega em dois dias.', 'Chega em 2 dias.')
})

test('controle: so estilo mudando passa e preco mudando reprova', () => {
  assert.deepEqual(ids('Possui 2 portas e 3 prateleiras.'), [])
  passa('Possui 2 portas e 3 prateleiras.', 'Tem 2 portas e 3 prateleiras.')
  reprova('Possui 2 portas por R$ 300.', 'Possui 2 portas por R$ 350.')
})

test('troca de dois precos lista os dois lados que mudaram de lugar', () => comPasta(r => {
  const res = compararFatos('Camiseta: R$ 49,90. Calça: R$ 99,90.', 'Camiseta: R$ 99,90. Calça: R$ 49,90.')
  const mudou = res.diferencas.filter(d => d.tipo === 'mudou de lugar').map(d => d.fato.texto).sort()
  assert.deepEqual(mudou, ['R$ 49,90', 'R$ 99,90'])
  writeFileSync(join(r, 'a.txt'), 'Camiseta: R$ 49,90. Calça: R$ 99,90.')
  writeFileSync(join(r, 'b.txt'), 'Camiseta: R$ 99,90. Calça: R$ 49,90.')
  const cli = rodar(['--antes', 'a.txt', '--depois', 'b.txt'], r)
  assert.equal(cli.codigo, 1)
  assert.match(cli.saida, /mudou de lugar: R\$ 49,90/)
  assert.match(cli.saida, /mudou de lugar: R\$ 99,90/)
}))

// ---------- volta 1: regras ----------

test('normalizar: soft hyphen sai, NBSP e U+202F viram espaco', () => {
  assert.equal(normalizar('a' + SHY + 'b' + NBSP + 'c' + NNBSP + 'd'), 'ab c d')
})

test('regra de frase fixa casa com quebra de linha, espaco duplo, NBSP e soft hyphen, na linha onde comeca', () => {
  const quebra = ocorrencias('Oi.' + LF + 'Espero ter' + LF + 'ajudado.').filter(o => o.id === 'C-1')
  assert.equal(quebra.length, 1)
  assert.equal(quebra[0].linha, 2)
  for (const texto of ['Espero  ter ajudado.', 'Espero' + NBSP + 'ter ajudado.', 'Espe' + SHY + 'ro ter ajudado.']) {
    assert.ok(ids(texto).includes('C-1'), `C-1 nao casou em ${JSON.stringify(texto)}`)
  }
  assert.ok(!ids('Espero ter' + LF + LF + 'ajudado.').includes('C-1'), 'linha em branco fecha o paragrafo')
})

test('R-1 nas variantes e sim, mas sim e nao se trata de', () => {
  for (const texto of ['Não é caro, e sim acessível.', 'Não é só bonito, mas sim resistente.', 'Não se trata de luxo, mas de conforto.']) {
    assert.ok(ids(texto).includes('R-1'), `R-1 nao casou em "${texto}"`)
  }
  assert.ok(!ids('Não se trata de defeito.').includes('R-1'))
})

// ---------- volta 2 da revisao adversarial: trava ----------

const GRAU = String.fromCharCode(176)
const MEIO = String.fromCodePoint(189)
const QUARTO = String.fromCodePoint(188)

test('N1: unidade de dado GB contra TB', () => {
  reprova('SSD de 128 GB.', 'SSD de 128 TB.')
})

test('N2: sufixo k multiplica', () => {
  assert.deepEqual(chaves('Mais de 10k vendidos.'), ['numero 10000'])
  reprova('Mais de 10k vendidos.', 'Mais de 10 vendidos.')
  passa('Mais de 10k vendidos.', 'Mais de 10 mil vendidos.')
})

test('N3: fracao unicode vira numero', () => {
  const a = 'Pote de ' + MEIO + ' kg.'
  assert.equal(a.charCodeAt(8), 189)
  assert.deepEqual(chaves(a), ['medida 0.5 kg'])
  reprova(a, 'Pote de ' + QUARTO + ' kg.')
  passa('Pote de 1' + MEIO + ' kg.', 'Pote de 1,5 kg.')
})

test('N4: periodo depois da barra entra no preco', () => {
  reprova('Assinatura por R$ 10/mês.', 'Assinatura por R$ 10/ano.')
  passa('Assinatura por R$ 10/mês.', 'Assinatura por R$ 10 por mês.')
})

test('N5: unidade depois da barra entra no preco', () => {
  reprova('Sai a R$ 10/kg.', 'Sai a R$ 10/g.')
})

test('N6: hora e meia', () => {
  reprova('Entrega em uma hora e meia.', 'Entrega em uma hora.')
})

test('N7: litros e meio', () => {
  reprova('Garrafa de 2 litros e meio.', 'Garrafa de 2 litros.')
  passa('Garrafa de 2 litros e meio.', 'Garrafa de 2,5 litros.')
})

test('N8: meia duzia contra uma duzia', () => {
  assert.deepEqual(chaves('Kit com meia dúzia de copos.'), ['numero 6'])
  reprova('Kit com meia dúzia de copos.', 'Kit com uma dúzia de copos.')
  assert.deepEqual(chaves('Meia de algodão, no meio da caixa.'), [])
})

test('N9: dezena contra centena', () => {
  reprova('Caixa com uma dezena de unidades.', 'Caixa com uma centena de unidades.')
})

test('N10: sinal de menos na temperatura', () => {
  reprova('Suporta até -20 ' + GRAU + 'C.', 'Suporta até 20 ' + GRAU + 'C.')
  assert.deepEqual(chaves('De 10-20 cm'), ['numero 10', 'medida 20 cm'])
})

test('N11: mi contra bi', () => {
  reprova('Faturou R$ 2 mi.', 'Faturou R$ 2 bi.')
  passa('Faturou R$ 2 mi.', 'Faturou R$ 2 milhões.')
})

test('N12: pares contra unidades', () => {
  reprova('Kit com 3 pares de meia.', 'Kit com 3 unidades de meia.')
})

test('N13: dobro contra triplo', () => {
  reprova('Rende o dobro.', 'Rende o triplo.')
})

test('N14: Celsius contra Fahrenheit', () => {
  const a = 'Aguenta 200 ' + GRAU + 'C.'
  assert.equal(a.charCodeAt(12), 176)
  reprova(a, 'Aguenta 200 ' + GRAU + 'F.')
})

// N16 mudou na volta 3: milhar com espaco comum nao junta mais (senao "R$ 5 300 ml" vira R$ 5300),
// entao "R$ 1 234" contra "R$ 1234" reprova, que e o lado seguro
test('N15 e N16: parcela com espaco antes do x passa e milhar com espaco comum no preco reprova', () => {
  passa('10 x de R$ 9,90', '10x de R$ 9,90')
  reprova('R$ 1 234', 'R$ 1234')
})

// ---------- volta 3 da revisao adversarial: palavra seguinte, prazo por palavra, milhar e ordinal ----------

const VOLTA3 = [
  ['Plano por R$ 29,90 mensais.', 'Plano por R$ 29,90 anuais.'],
  ['Tecido a R$ 39,90 o metro.', 'Tecido a R$ 39,90 o rolo.'],
  ['Aluguel R$ 50 diários.', 'Aluguel R$ 50 semanais.'],
  ['Motor de 1 cv.', 'Motor de 1 hp.'],
  ['Pressão de 15 bar.', 'Pressão de 15 psi.'],
  ['Carregador de 2 A.', 'Carregador de 2 mA.'],
  ['Cada porção tem 100 kcal.', 'Cada porção tem 100 cal.'],
  ['Entrega em uma quinzena.', 'Entrega em um bimestre.'],
  ['Garantia de um semestre.', 'Garantia de um trimestre.'],
  ['Suco R$ 5 300 ml.', 'Suco R$ 5 300 g.'],
  ['10% off na primeira compra.', '10% off na terceira compra.'],
]

VOLTA3.forEach(([antes, depois], k) => {
  test(`V3-${k + 1}: ${antes} -> ${depois} reprova`, () => reprova(antes, depois))
})

test('V3 palavra seguinte: entra no fato pulando artigo e preposicao, para em pontuacao e em "e"', () => {
  const p = texto => fatos(texto).map(f => f.palavra)
  assert.deepEqual(p('Plano por R$ 29,90 mensais.'), ['mensais'])
  assert.deepEqual(p('Tecido a R$ 39,90 o metro.'), ['metro'])
  assert.deepEqual(p('Motor de 1 cv.'), ['cv'])
  assert.deepEqual(p('Possui duas portas.'), ['portas'])
  assert.deepEqual(p('Custa R$ 10, com frete.'), [''])
  assert.deepEqual(p('Sai R$ 49,90 e a calça R$ 99,90.'), ['', ''])
  passa('Plano por R$ 29,90 mensais.', 'Plano de R$ 29,90 mensais.')
  passa('Possui 2 portas.', 'Tem 2 portas.')
})

test('V3 prazo por palavra: um e uma antes de quinzena, bimestre, trimestre, semestre e decada viram 1', () => {
  assert.deepEqual(chaves('Entrega em uma quinzena.'), ['prazo 1 quinzena'])
  assert.deepEqual(chaves('Garantia de um semestre ou dois bimestres.'), ['prazo 1 semestre', 'prazo 2 bimestre'])
  assert.deepEqual(chaves('Uma década de mercado.'), ['prazo 1 decada'])
  passa('Garantia de um trimestre.', 'Garantia de 1 trimestre.')
})

test('V3 milhar: espaco comum separa, ponto e U+202F juntam', () => {
  assert.deepEqual(chaves('Suco R$ 5 300 ml.'), ['dinheiro 5', 'medida 300 ml'])
  assert.deepEqual(chaves('R$ 5.300'), ['dinheiro 5300'])
  const fino = 'R$ 5' + NNBSP + '300'
  assert.ok(fino.includes(NNBSP))
  assert.deepEqual(chaves(fino), ['dinheiro 5300'])
})

// volta 4: ordinal sozinho tambem vira fato ("Frete gratis na terceira compra" contra "na decima")
test('V3 ordinal: depois de numero ou percentual e sozinho vira fato', () => {
  assert.deepEqual(chaves('10% off na primeira compra.'), ['percentual 10%', 'ordinal 1'])
  assert.deepEqual(chaves('Frete de R$ 10 na décima compra.'), ['dinheiro 10', 'ordinal 10'])
  assert.deepEqual(chaves('10% off. Na terceira compra, nada.'), ['percentual 10%', 'ordinal 3'])
})

// ---------- volta 4 da revisao adversarial: palavra antes e depois de todo fato ----------

const VOLTA4 = [
  ['Frete grátis em compras acima de R$ 99.', 'Frete grátis em compras abaixo de R$ 99.'],
  ['Pedido mínimo de 6 unidades.', 'Pedido máximo de 6 unidades.'],
  ['Atacado a partir de 12 peças.', 'Atacado até 12 peças.'],
  ['Plano mensal por R$ 30.', 'Plano anual por R$ 30.'],
  ['O metro sai a R$ 39,90.', 'O rolo sai a R$ 39,90.'],
  ['Prateleira com 40 cm de largura.', 'Prateleira com 40 cm de altura.'],
  ['Vem 2 kg por pacote.', 'Vem 2 kg por caixa.'],
  ['Você tem 30 dias de garantia.', 'Você tem 30 dias de teste.'],
  ['Na terceira compra, ganhe 10% de desconto.', 'Na oitava compra, ganhe 10% de desconto.'],
  ['Frete grátis na terceira compra.', 'Frete grátis na décima compra.'],
  ['Pague só um terço do valor na entrada.', 'Pague só um quarto do valor na entrada.'],
  ['Oferta válida só este mês.', 'Oferta válida só esta semana.'],
  ['Retirada na loja às 14h.', 'Retirada na loja em 14h.'],
  ['Frete grátis no 1o pedido.', 'Frete grátis no 1o mês.'],
  ['Brinde na 1' + String.fromCharCode(0xaa) + ' compra.', 'Brinde na 1' + String.fromCharCode(0xaa) + ' troca.'],
]

VOLTA4.forEach(([antes, depois], k) => {
  test(`V4-${k + 1}: ${antes} -> ${depois} reprova`, () => reprova(antes, depois))
})

test('V4 espaco fino e TAB entre a moeda e o numero: R$ contra US$ reprova', () => {
  for (const cod of [0x2009, 0x9]) {
    const esp = String.fromCharCode(cod)
    const a = 'Sai por R$' + esp + '100'
    assert.equal(a.charCodeAt(10), cod)
    assert.deepEqual(chaves(a), ['dinheiro 100'])
    reprova(a, 'Sai por US$' + esp + '100')
  }
})

test('V4 digito em negrito matematico vira algarismo: 50% contra 70% reprova', () => {
  const negrito = s => [...s].map(c => /[0-9]/.test(c) ? String.fromCodePoint(0x1d7ce + Number(c)) : c).join('')
  const a = 'Hoje ' + negrito('50') + '% OFF em tudo.'
  assert.equal(a.codePointAt(5), 0x1d7d3)
  assert.deepEqual(chaves(a), ['prazo hoje', 'percentual 50%'])
  reprova(a, 'Hoje ' + negrito('70') + '% OFF em tudo.')
  passa(a, 'Hoje 50% OFF em tudo.')
})

test('V4 o que vem antes e depois entra no fato, e reescrita so de estilo passa', () => {
  const f = texto => fatos(texto).map(x => [x.antes, x.palavra])
  assert.deepEqual(f('Frete grátis em compras acima de R$ 99.'), [['acima', '']])
  assert.deepEqual(f('O metro sai a R$ 39,90.'), [['m', '']])
  assert.deepEqual(f('Prateleira com 40 cm de largura.'), [['', 'largura']])
  assert.deepEqual(chaves('Pague só um terço do valor.'), ['numero 0.333333'])
  assert.deepEqual(chaves('Retirada às 14h.'), ['horario 14 horas'])
  assert.deepEqual(chaves('Frete grátis no 1o pedido.'), ['ordinal 1'])
  assert.deepEqual(chaves('Na primeira compra.'), ['ordinal 1'])
  passa('Frete grátis em compras acima de R$ 99.', 'Frete grátis nas compras acima de R$ 99.')
  passa('Você tem 30 dias de garantia.', 'São 30 dias de garantia.')
  passa('Plano mensal por R$ 30.', 'Plano mensal de R$ 30.')
})

test('V4 tabela de 15000 linhas de preco: igual sai 0 e toda trocada sai 1 ou 2 com mensagem, nunca estoura', () => comPasta(r => {
  const linhas = n => Array.from({ length: 15000 }, (_, k) => `Produto ${k}: R$ ${k + n},90`).join(LF)
  writeFileSync(join(r, 'a.txt'), linhas(0))
  writeFileSync(join(r, 'b.txt'), linhas(0))
  writeFileSync(join(r, 'c.txt'), linhas(7))
  const opcoes = { cwd: r, encoding: 'utf8', maxBuffer: 1 << 28 }
  const varrer = join(AQUI, 'varrer.mjs')
  const igual = spawnSync(process.execPath, [varrer, '--antes', 'a.txt', '--depois', 'b.txt'], opcoes)
  assert.ok(igual.stdout.length > 0, igual.stderr)
  assert.equal(igual.status, 0)
  const trocada = spawnSync(process.execPath, [varrer, '--antes', 'a.txt', '--depois', 'c.txt'], opcoes)
  assert.ok([1, 2].includes(trocada.status), `saiu ${trocada.status}: ${trocada.stderr.slice(0, 200)}`)
  if (trocada.status === 2) assert.match(trocada.stderr, /grande demais/)
}))

// ---------- volta 5 da revisao adversarial ----------

const UM_OITAVO = String.fromCharCode(0x215b)
const CINCO_OITAVOS = String.fromCharCode(0x215d)
const LARGO = d => String.fromCharCode(0xff10 + d)
const MAIOR_IGUAL = String.fromCharCode(8805)
const MENOR_IGUAL = String.fromCharCode(8804)
const BOLETO = '23793381286000782713695000063305975520000370000'

const VOLTA5 = [
  ['1 a.m. contra a.a.', 'Juros de 2% a.m. no cartão.', 'Juros de 2% a.a. no cartão.'],
  ['2 USD contra EUR', 'Valor: USD 100.', 'Valor: EUR 100.'],
  ['3 +500 contra 500', 'Mais de 1000 vendidos, +500 avaliações.', 'Mais de 1000 vendidos, 500 avaliações.'],
  ['4 fracao U+215B contra U+215D', 'Broca de ' + UM_OITAVO + ' pol.', 'Broca de ' + CINCO_OITAVOS + ' pol.'],
  ['5 digito de largura cheia 50% contra 70%', 'Hoje ' + LARGO(5) + LARGO(0) + '% OFF.', 'Hoje ' + LARGO(7) + LARGO(0) + '% OFF.'],
  ['6 linha digitavel de 47 digitos', BOLETO, BOLETO.slice(0, -4) + '0001'],
  ['7 CEP 01310-100 contra 1310-100', 'CEP 01310-100', 'CEP 1310-100'],
  ['8 proximo dia util contra proximo dia', 'Envio no próximo dia útil.', 'Envio no próximo dia.'],
  ['9 seg a sex contra seg a sab', 'Atendimento de seg a sex.', 'Atendimento de seg a sáb.'],
  ['10 novembro contra dezembro', 'Promoção válida até novembro.', 'Promoção válida até dezembro.'],
  ['11 ou mais contra ou menos', 'Frete grátis em compras de R$ 99 ou mais.', 'Frete grátis em compras de R$ 99 ou menos.'],
  ['12 antes contra depois das 14h', 'Pedidos feitos antes das 14h saem hoje.', 'Pedidos feitos depois das 14h saem hoje.'],
  ['13 sem juros contra com juros', 'Sem juros em 10x no cartão.', 'Com juros em 10x no cartão.'],
  ['14 > contra <', 'Frete grátis > R$ 99.', 'Frete grátis < R$ 99.'],
  ['15 inferior contra superior', 'Desconto inferior a R$ 50.', 'Desconto superior a R$ 50.'],
  ['16 pra cima contra pra baixo', 'A partir de R$ 99 pra cima.', 'A partir de R$ 99 pra baixo.'],
]

VOLTA5.forEach(([nome, antes, depois]) => {
  test(`V5-${nome}: reprova`, () => {
    // canario: o dado especial carrega mesmo o caractere
    if (nome.startsWith('4')) assert.equal(antes.charCodeAt(9), 0x215b)
    if (nome.startsWith('5')) assert.equal(antes.charCodeAt(5), 0xff15)
    if (nome.startsWith('6')) assert.equal(antes.length, 47)
    reprova(antes, depois)
  })
})

test('V5-14b maior-ou-igual contra menor-ou-igual reprova e qualificador igual passa', () => {
  const a = 'Frete grátis ' + MAIOR_IGUAL + ' R$ 99.'
  assert.equal(a.charCodeAt(13), 8805)
  reprova(a, 'Frete grátis ' + MENOR_IGUAL + ' R$ 99.')
  passa('Frete grátis em compras de R$ 99 ou mais.', 'Frete grátis nas compras de R$ 99 ou mais.')
  passa('Hoje ' + LARGO(5) + LARGO(0) + '% OFF.', 'Hoje 50% OFF.')
  passa('Envio no próximo dia útil.', 'Envio no próximo dia útil!')
})

test('V5-17 antes e depois em UTF-16 com BOM: 10 dias contra 10 meses e R$ contra US$ saem 1', () => comPasta(r => {
  const le = s => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')])
  const be = s => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(s, 'utf16le').swap16()])
  const A = 'Garantia de 10 dias. Sai por R$ 50.'
  const B = 'Garantia de 10 meses. Sai por US$ 50.'
  writeFileSync(join(r, 'a.txt'), le(A))
  writeFileSync(join(r, 'b.txt'), le(B))
  assert.equal(readFileSync(join(r, 'a.txt'))[0], 0xff)
  const dif = rodar(['--antes', 'a.txt', '--depois', 'b.txt'], r)
  assert.equal(dif.codigo, 1, dif.saida + dif.avisos)
  assert.match(dif.saida, /sumiu: 10 dias/)
  assert.match(dif.saida, /apareceu: US\$ 50/)
  writeFileSync(join(r, 'c.txt'), be(A))
  const igual = rodar(['--antes', 'a.txt', '--depois', 'c.txt'], r)
  assert.match(igual.saida, /os 2 fatos/)
  assert.equal(igual.codigo, 0)
}))

test('V5-18 uma linha com 200 mil numeros contra a mesma deslocada sai 2 com mensagem em menos de 10 s', () => comPasta(r => {
  const linha = d => Array.from({ length: 200000 }, (_, k) => String(k + d)).join(' ')
  writeFileSync(join(r, 'a.txt'), linha(0))
  writeFileSync(join(r, 'b.txt'), linha(1))
  const t0 = Date.now()
  const p = spawnSync(process.execPath, [join(AQUI, 'varrer.mjs'), '--antes', 'a.txt', '--depois', 'b.txt'], { cwd: r, encoding: 'utf8', timeout: 60000 })
  const ms = Date.now() - t0
  assert.equal(p.status, 2, `saiu ${p.status} em ${ms} ms: ${String(p.stderr).slice(0, 200)}`)
  assert.match(p.stderr, /texto grande demais pra trava/)
  assert.ok(ms < 10000, `levou ${ms} ms`)
}))

// ---------- revisao Codex do bloco B ----------

test('Codex B1: fato por paragrafo, com quebra de linha e espaco duplo entre numero e unidade', () => {
  const quebra = 'Pesa 2' + LF + 'kg.'
  assert.ok(quebra.includes(LF))
  reprova(quebra, 'Pesa 2' + LF + 'g.')
  reprova('Pesa 2  kg.', 'Pesa 2  g.')
  reprova('Pesa 2' + CR + LF + 'kg.', 'Pesa 2' + CR + LF + 'g.')
  // a linha de origem continua na mensagem
  const f = fatos('Oi.' + LF + 'Pesa 2' + LF + 'kg.')
  assert.equal(f.length, 1)
  assert.equal(f[0].tipo + ' ' + f[0].valor, 'medida 2 kg')
  assert.equal(f[0].linha, 2)
  assert.equal(f[0].texto, '2 kg')
  // linha em branco fecha o paragrafo: a unidade nao gruda
  assert.deepEqual(chaves('Pesa 2' + LF + LF + 'kg.'), ['numero 2'])
  passa('Pesa 2' + LF + 'kg.', 'Pesa 2 kg.')
})

test('Codex B2: enfase de markdown nao interrompe a moeda nem a unidade', () => {
  reprova('Preço: R$ **50**.', 'Preço: US$ **50**.')
  assert.deepEqual(chaves('Preço: R$ **50**.'), ['dinheiro 50'])
  assert.deepEqual(chaves('Preço: R$ __50__.'), ['dinheiro 50'])
  assert.deepEqual(chaves('Sai por R$ *50*.'), ['dinheiro 50'])
  assert.deepEqual(chaves('Sai por R$ _50_.'), ['dinheiro 50'])
  assert.deepEqual(chaves('Pesa **2** kg.'), ['medida 2 kg'])
  passa('Preço: R$ **50**.', 'Preço: R$ 50.')
  // a deteccao de negrito (M-2) continua vendo o texto cru
  assert.ok(ids('**Leve.** Cabe na bolsa. **Forte.** Aguenta queda.').includes('M-2'))
})

test('Codex B3: A, mA, Ah e mAh depois de numero sao ampere; a minusculo continua artigo', () => {
  reprova('Fonte de 2 A.', 'Fonte de 2.')
  reprova('Fonte de 2A.', 'Fonte de 2.')
  reprova('Fonte de 2 A.', 'Fonte de 2 mA.')
  reprova('Bateria de 2 Ah.', 'Bateria de 2 mAh.')
  assert.deepEqual(chaves('Fonte de 2 A.'), ['medida 2 a'])
  assert.deepEqual(chaves('Fonte de 500mA.'), ['medida 500 ma'])
  assert.deepEqual(chaves('Bateria de 7 Ah.'), ['medida 7 ah'])
  assert.deepEqual(chaves('Bateria de 5000 mAh.'), ['medida 5000 mah'])
  assert.ok(!chaves('Leve 2 a 3 peças.').includes('medida 2 a'))
  passa('Leve 2 a 3 peças.', 'Leve 2 a 3 peças!')
})

test('Codex B4: segunda, terca, quarta, quinta e sexta antes de substantivo sao ordinal', () => {
  reprova('Frete grátis na segunda compra.', 'Frete grátis na segunda troca.')
  assert.deepEqual(chaves('Frete grátis na segunda compra.'), ['ordinal 2'])
  assert.deepEqual(chaves('Pague a terça parte.'), ['ordinal 3'])
  assert.deepEqual(chaves('Na quinta unidade, desconto.'), ['ordinal 5'])
  // dia continua dia
  assert.deepEqual(chaves('Entrega na segunda-feira.'), ['prazo segunda'])
  assert.deepEqual(chaves('Entrega na segunda.'), ['prazo segunda'])
  assert.deepEqual(chaves('Na segunda, chega tudo.'), ['prazo segunda'])
  assert.deepEqual(chaves('Chega segunda de manhã.'), ['prazo segunda'])
  assert.deepEqual(chaves('Abre sexta à noite.'), ['prazo sexta'])
  reprova('Chega na segunda.', 'Chega na terça.')
})

test('sem o texto.mjs a linha de comando sai 2 com mensagem clara', () => comPasta(r => {
  const scripts = join(r, '.claude', 'skills', 'humanizar', 'scripts')
  mkdirSync(scripts, { recursive: true })
  cpSync(join(AQUI, 'varrer.mjs'), join(scripts, 'varrer.mjs'))
  writeFileSync(join(r, 'texto.txt'), 'Oi.')
  const p = spawnSync(process.execPath, ['.claude/skills/humanizar/scripts/varrer.mjs', 'texto.txt'], { cwd: r, encoding: 'utf8' })
  assert.ok(p.stderr.length > 0)
  assert.equal(p.status, 2)
  assert.match(p.stderr, /texto\.mjs/)
  assert.match(p.stderr, /ler-avaliacoes/)
}))

test('conserto do F-3: conta com 3 bolsos contra tem 3 bolsos passa, sem juros contra com juros reprova', () => {
  assert.equal(compararFatos('A mochila conta com 3 bolsos.', 'A mochila tem 3 bolsos.').iguais, true)
  assert.equal(compararFatos('Vem com 2 pilhas.', 'Tem 2 pilhas.').iguais, true)
  assert.equal(compararFatos('Sem juros em 10x.', 'Com juros em 10x.').iguais, false)
})

test('Codex C1: conta com mais de 3 bolsos contra tem mais de 3 bolsos passa, mais contra menos reprova', () => {
  assert.equal(compararFatos('A mochila conta com mais de 3 bolsos.', 'A mochila tem mais de 3 bolsos.').iguais, true)
  assert.equal(compararFatos('Conta com pelo menos 3 bolsos.', 'Tem pelo menos 3 bolsos.').iguais, true)
  assert.equal(compararFatos('Conta com mais de 3 bolsos.', 'Conta com menos de 3 bolsos.').iguais, false)
})

test('diferenca mostra o qualificador: acima e abaixo de R$ 50 saem em linhas diferentes', () => {
  const r = compararFatos('Frete grátis acima de R$ 50,00.', 'Frete grátis abaixo de R$ 50,00.')
  assert.equal(r.iguais, false)
  const linhas = mostrarComparacao(r).split(String.fromCharCode(10)).slice(1)
  assert.ok(linhas.length >= 2, 'canario: a diferenca tem linhas')
  assert.match(linhas.find(l => l.startsWith('sumiu')), /acima/)
  assert.match(linhas.find(l => l.startsWith('apareceu')), /abaixo/)
})

test('revisao final 1: caixa da sigla de unidade conta, GB contra Gb e mW contra MW reprovam, Kg de titulo passa', () => {
  reprova('Cartao de 64 GB.', 'Cartao de 64 Gb.')
  reprova('Laser de 5 mW.', 'Laser de 5 MW.')
  passa('Kit Com 64 GB.', 'Kit com 64 GB.')
  passa('Saco de 5 Kg.', 'Saco de 5 kg.')
})

test('revisao final 2: zero por extenso e fato, tirar o frete de zero reais reprova', () => {
  reprova('Frete de zero reais. Produto por R$ 50.', 'Frete a combinar. Produto por R$ 50.')
})

test('revisao final 3: zero a esquerda de 3 digitos ou mais fica, 0800 contra 800 reprova e 05 contra 5 passa', () => {
  reprova('Ligue 0800 123 4567.', 'Ligue 800 123 4567.')
  passa('Pegue 05 unidades.', 'Pegue 5 unidades.')
})

test('revisao final volta 2: caixa so conta em bit contra byte e mili contra mega, o resto compara sem caixa', () => {
  for (const [a, b] of [['SACO DE 5 KG.', 'Saco de 5 kg.'], ['FRASCO DE 50 ML.', 'Frasco de 50 ml.'], ['Fita de 2 CM.', 'Fita de 2 cm.'],
    ['Rodou 5 KM.', 'Rodou 5 km.'], ['Leve 3 PCS.', 'Leve 3 pcs.'], ['Leve 3 UND.', 'Leve 3 und.'], ['Frasco de 50 mL.', 'Frasco de 50 ml.'],
    ['Motor de 2 kW.', 'Motor de 2 KW.'], ['Cartao de 64 GB.', 'Cartao de 64 gb.'], ['Arquivo de 5 MB.', 'Arquivo de 5 mb.'],
    ['Tem 2 HDMI.', 'Tem 2 hdmi.'], ['Tem 3 USB.', 'Tem 3 usb.'], ['Bateria de 5000 MAH.', 'Bateria de 5000 mAh.'],
    ['Clock de 2400 MHZ.', 'Clock de 2400 MHz.']]) passa(a, b)
  for (const [a, b] of [['Cartao de 64 GB.', 'Cartao de 64 Gb.'], ['Cartao de 64 gb.', 'Cartao de 64 Gb.'], ['Link de 1 KB.', 'Link de 1 Kb.'],
    ['Laser de 5 mW.', 'Laser de 5 MW.'], ['Pilha de 5 mV.', 'Pilha de 5 MV.'], ['Clock de 5 mHz.', 'Clock de 5 MHz.'],
    ['Bateria de 5 mWh.', 'Bateria de 5 MWh.'], ['Fonte de 5 mA.', 'Fonte de 5 MA.']]) reprova(a, b)
})

test('revisao final volta 2: zero so conta com moeda, unidade ou como valor de cobranca', () => {
  passa('Comece do zero hoje.', 'Comece hoje.')
  passa('Zero estresse na entrega em 2 dias.', 'Entrega tranquila em 2 dias.')
  passa('Zero complicacao pra montar 3 pecas.', 'Facil de montar 3 pecas.')
  reprova('Frete de zero reais.', 'Frete a combinar.')
  reprova('Taxa zero no cartao.', 'Taxa no cartao.')
  reprova('Juros zero no boleto.', 'Juros no boleto.')
  reprova('Carro zero km.', 'Carro novo.')
})
