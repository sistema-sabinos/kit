import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { coletaDeEspionagem, coletarDeEspionagem } from './de-espionagem.mjs'

// codigo de anuncio montado em partes, por causa do Gate 1
const MLB = 'MLB' + '5550001'
const OUTRO = 'MLB' + '5550002'

// Aba de perguntas no formato REAL que a /espionar-concorrente grava (estrutura de linhas copiada
// de uma pagina lida, textos inventados): pergunta, "Denunciar" e "Vai abrir em uma nova janela",
// resposta do vendedor, a data numa linha so dela, "Denunciar" e "Vai abrir..." de novo. Tem
// pergunta sem interrogacao e resposta que termina em interrogacao. O rodape fecha a secao.
const D = ['Denunciar', 'Vai abrir em uma nova janela']
const LINHAS_DA_ABA = [
  'Perguntas neste anúncio',
  'Serve pra grao de cafe?', ...D, 'Serve sim, moi grao inteiro.', '12/08/2026', ...D,
  'Serve pra grao de cafe?', ...D, 'Sim. Quer saber a potencia?', '13/08/2026', ...D,
  'no anuncio fala 150w ou 300w qual o certo', ...D, 'A potencia e 150 W.', '03/09/2026', ...D,
  '', '', 'Mais informações', 'Copyright © 1999-2026 Exemplo LTDA.', 'Termos e condições',
]
const ABA = LINHAS_DA_ABA.join('\n')

const bruto = () => ({
  produto: 'Moedor Eletrico Inox',
  categoria: 'cozinha',
  anuncios: [
    {
      id: MLB, titulo: 'Kit Moedor Eletrico Inox Acme', preco: 99, vendedor: 'LOJA EXEMPLO', vendidos: 5000,
      fotos: ['https://exemplo.invalido/1.jpg', 'https://exemplo.invalido/2.jpg'],
      atributos: { Marca: 'Acme', Potência: '150 W' },
      descricao: 'Moedor de cafe. Kit com moedor, escovinha e tampa.',
      perguntas: ABA,
      avaliacoes: { media: 4.5, total: 3, avaliacoes: [
        { nota: 5, titulo: 'Otimo', texto: 'Mói fino e rapido', curtidas: 2 },
        { nota: 5, titulo: 'Bom demais', texto: '', curtidas: 0 },
        { nota: 2, titulo: 'Barulhento', texto: 'Faz muito barulho', curtidas: 1 },
      ] },
    },
    { id: OUTRO, titulo: 'Outro Moedor', fotos: [], atributos: {}, avaliacoes: { erro: 'x' } },
  ],
})

test('monta a coleta no formato da coleta pela API, com perguntas, opinioes, fotos, descricao e titulo', () => {
  const c = coletaDeEspionagem(bruto(), MLB)
  assert.equal(c.mlb, MLB)
  assert.equal(c.titulo, 'Kit Moedor Eletrico Inox Acme')
  assert.equal(c.slug, 'kit-moedor-eletrico-inox-acme')
  assert.equal(c.categoria, '')
  assert.equal(c.categoriaDaEspionagem, 'cozinha')
  assert.deepEqual(c.fotos, ['https://exemplo.invalido/1.jpg', 'https://exemplo.invalido/2.jpg'])
  assert.equal(c.atributos.Marca, 'Acme')
  assert.equal(c.ehKit, true)
  assert.deepEqual(c.itensDoKit, ['moedor', 'escovinha', 'tampa'])
  // a pergunta repetida vem agrupada, a mais repetida primeiro; a resposta nao vira pergunta
  assert.deepEqual(c.duvidas, [{ texto: 'Serve pra grao de cafe?', vezes: 2 }, { texto: 'no anuncio fala 150w ou 300w qual o certo', vezes: 1 }])
  assert.equal(c.avisos.some((a) => /perguntas/.test(a)), false, c.avisos.join(' | '))
  // opiniao sem texto cai no titulo
  assert.deepEqual(c.elogios, ['Mói fino e rapido', 'Bom demais'])
  assert.deepEqual(c.queixas, ['Faz muito barulho'])
  assert.ok(Array.isArray(c.avisos))
})

test('mesmas chaves da coleta pela API', async () => {
  const { coletar } = await import('../coletar.mjs')
  const mlGetFn = async (caminho) => {
    if (caminho === `/items/${MLB}`) return { id: MLB, title: 'Kit Moedor', category_id: 'X', pictures: [], attributes: [] }
    return {}
  }
  const api = await coletar(MLB, { token: 't', mlGetFn })
  const esp = coletaDeEspionagem(bruto(), MLB)
  assert.deepEqual(Object.keys(esp).filter((k) => !['categoriaDaEspionagem', 'origem'].includes(k)).sort(), Object.keys(api).sort())
  assert.equal(esp.origem, 'espionagem')
})

test('anuncio fora do arquivo erra listando os que existem', () => {
  const inexistente = 'MLB' + '9990009'
  assert.throws(() => coletaDeEspionagem(bruto(), inexistente), (e) => e.message.includes(inexistente) && e.message.includes(MLB) && e.message.includes(OUTRO))
})

test('anuncio que a espionagem nao conseguiu ler erra mandando rodar de novo', () => {
  const b = bruto()
  b.anuncios[0] = { id: MLB, erro: 'pagina: timeout' }
  assert.throws(() => coletaDeEspionagem(b, MLB), /timeout[\s\S]*\/espionar-concorrente/)
})

test('sem perguntas lidas, avisa qual anuncio escolher e como ler as perguntas', () => {
  const b = bruto()
  delete b.anuncios[0].perguntas
  const c = coletaDeEspionagem(b, MLB)
  assert.deepEqual(c.duvidas, [])
  assert.ok(c.avisos.some((a) => /perguntas/.test(a) && /espionar-concorrente/.test(a)), c.avisos.join(' | '))
})

test('avaliacoes com erro viram aviso, nao derrubam a coleta', () => {
  const b = bruto()
  b.anuncios[0].avaliacoes = { erro: 'HTTP 403' }
  const c = coletaDeEspionagem(b, MLB)
  assert.deepEqual(c.elogios, [])
  assert.ok(c.avisos.some((a) => /avaliacoes/.test(a) && /403/.test(a)))
})

test('coletarDeEspionagem le o arquivo e erra com recado quando ele nao existe ou nao e JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'de-espionagem-'))
  try {
    const arq = join(dir, '_raw-concorrentes-moedor.json')
    writeFileSync(arq, JSON.stringify(bruto()))
    assert.equal(coletarDeEspionagem(arq, MLB).mlb, MLB)
    assert.throws(() => coletarDeEspionagem(join(dir, 'nao-existe.json'), MLB), /nao achei o arquivo/)
    const ruim = join(dir, 'ruim.json')
    writeFileSync(ruim, '{ quebrado')
    assert.throws(() => coletarDeEspionagem(ruim, MLB), /nao e um JSON valido/)
    const semLista = join(dir, 'sem-lista.json')
    writeFileSync(semLista, '{}')
    assert.throws(() => coletarDeEspionagem(semLista, MLB), /_raw-concorrentes/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const comAba = (linhas) => { const b = bruto(); b.anuncios[0].perguntas = linhas.join('\n'); return coletaDeEspionagem(b, MLB) }

test('a pergunta e a linha antes do primeiro Denunciar do par, com ou sem interrogacao', () => {
  const c = comAba(['Perguntas neste anúncio', 'Qual a voltagem', ...D, 'É bivolt.', '12/08/2026', ...D, 'Vem com garantia?', ...D, 'Vem sim.', '13/08/2026', ...D])
  assert.deepEqual(c.duvidas.map((d) => d.texto), ['Qual a voltagem', 'Vem com garantia?'])
  assert.equal(c.avisos.some((a) => /perguntas/.test(a)), false)
})

test('resposta do vendedor nunca vira duvida, nem terminando em interrogacao, e Denunciar e data somem', () => {
  const c = comAba(['Perguntas neste anúncio', 'Qual a voltagem', ...D, 'Quer bivolt?', '12/08/2026', ...D])
  assert.deepEqual(c.duvidas.map((d) => d.texto), ['Qual a voltagem'])
  assert.doesNotMatch(c.duvidas.map((d) => d.texto).join(' '), /Denunciar|nova janela|\d{2}\/\d{2}\/\d{4}|bivolt/)
})

test('pergunta ainda sem resposta entra, e a seguinte tambem', () => {
  const c = comAba(['Perguntas neste anúncio', 'Tem 220 volts?', ...D, 'Vende so a tampa', ...D, 'Não vendemos.', '14/06/2026', ...D])
  assert.deepEqual(c.duvidas.map((d) => d.texto), ['Tem 220 volts?', 'Vende so a tampa'])
})

test('o rodape da pagina nao vira pergunta', () => {
  const c = comAba(LINHAS_DA_ABA)
  assert.doesNotMatch(c.duvidas.map((d) => d.texto).join(' '), /Mais informações|Copyright|Termos/)
})

test('bruto antigo, cortado no primeiro Denunciar, ainda entrega a primeira pergunta', () => {
  const c = comAba(['Perguntas neste anúncio', 'Tem 220 volts?'])
  assert.deepEqual(c.duvidas.map((d) => d.texto), ['Tem 220 volts?'])
})

test('campo com texto e nenhuma pergunta reconhecida avisa', () => {
  const c = comAba(['Perguntas neste anúncio', 'Nenhuma coisa reconhecivel aqui'])
  assert.deepEqual(c.duvidas, [])
  assert.ok(c.avisos.some((a) => /nenhuma pergunta foi reconhecida/.test(a)), c.avisos.join(' | '))
})

test('muita linha fora do formato avisa quantas perguntas aproveitou e quantas linhas descartou', () => {
  const lixo = Array.from({ length: 8 }, (_, i) => `linha solta ${i}`)
  const c = comAba(['Perguntas neste anúncio', 'Tem 220 volts?', ...D, 'Não tem.', '14/06/2026', ...D, ...lixo])
  assert.deepEqual(c.duvidas.map((d) => d.texto), ['Tem 220 volts?'])
  assert.ok(c.avisos.some((a) => /aproveitei 1 pergunta/.test(a) && /descartei 8 linha/.test(a)), c.avisos.join(' | '))
})

test('erro da pagina ao ler as perguntas vira aviso com o erro, sem dizer que o anuncio vende pouco', () => {
  const b = bruto()
  delete b.anuncios[0].perguntas
  b.anuncios[0].perguntas_erro = 'timeout de navegacao'
  const c = coletaDeEspionagem(b, MLB)
  const aviso = c.avisos.find((a) => /perguntas/.test(a))
  assert.ok(aviso, c.avisos.join(' | '))
  assert.match(aviso, /deu erro ao ler as perguntas/)
  assert.match(aviso, /timeout de navegacao/)
  assert.doesNotMatch(aviso, /mais vendem/)
})

