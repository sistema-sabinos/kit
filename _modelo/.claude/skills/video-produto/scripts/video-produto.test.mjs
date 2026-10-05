// Testes do orquestrador das 3 fases. Nenhum chama API paga: as pecas puras rodam
// importadas, as travas de gasto rodam pelo CLI de verdade (spawn) em cima de uma
// pasta de producao falsa, e o que precisa de chamada falsa roda em processo com
// as pecas injetadas. Roda com: node --test video-produto.test.mjs
import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validarEstruturaDoRoteiro, podeGastar, compararFala, conferirNarracao, palavrasCanonicas, conferirVozPorBloco, explicarFalhaDoVeo,
  acharPastaDoProduto, roteiroParaMarkdown, hashDoRoteiro, SEGUNDOS_POR_BLOCO, SAIDA_INCOMPLETA,
  conferirArgumentos, avisosDoRoteiro, conferirRoteiro, main,
} from './video-produto.mjs'
import { usd } from './lib/dinheiro.mjs'

const CLI = fileURLToPath(new URL('./video-produto.mjs', import.meta.url))
const EXEMPLO = fileURLToPath(new URL('../referencias/roteiro-exemplo.json', import.meta.url))
// o id de anuncio e montado em partes: o Gate 1 do kit acusa qualquer MLB inteiro no texto
const MLB = 'MLB' + '1234567890'
const SLUG = 'produto-de-teste'

// roteiro que passa em TODOS os gates de conteudo: 4 etapas AIDA na ordem, ator
// adulto, 30 a 38 silabas por fala, sem preco/menor/marca/contato.
const roteiroValido = () => ({
  produto: 'maleta de canetas de ponta dupla',
  voz: 'Aoede',
  musica: { estilo: 'animada' },
  advertencias: [],
  marcasProprias: ['Acme'],
  marcasDeTerceiro: ['Marca Teste'],
  ator: { quem: 'professora de artes', idade: 34, cenario: 'uma mesa de trabalho em casa' },
  blocos: [
    { etapa: 'atencao', tipo: 'pessoa', cena: 'ela abre a maleta na mesa', fala: 'Olha, eu abri essa maleta aqui em casa e fiquei impressionada com o tanto de cor que veio' },
    { etapa: 'interesse', tipo: 'produto', cena: 'macro da ponta fina riscando o papel', fala: 'A ponta fina risca leve e a ponta grossa preenche bem rapido, sem falhar em nenhum cantinho' },
    { etapa: 'desejo', tipo: 'produto', cena: 'macro do papel virado mostrando o verso', fala: 'A tinta seca rapidinho e o desenho nao borra quando a mao passa por cima da folha inteira' },
    { etapa: 'acao', tipo: 'pessoa', cena: 'ela fecha a maleta e sorri', fala: 'Olha a ficha completa la na descricao e ja salva ai nos favoritos pra nao perder de vista' },
  ],
})

// mesmo carimbo que o `--fase=1 --aprovar` grava: data + impressao digital do
// conteudo aprovado. Carimbo sem hash nao vale mais como aprovacao.
const carimbado = (roteiro) => {
  const r = { ...roteiro, aprovadoEm: '2026-08-08T12:00:00Z' }
  return { ...r, aprovadoHash: hashDoRoteiro(r) }
}

let raiz
let pasta

function preparar(roteiro, { comMusica = true, mlb = MLB } = {}) {
  fs.mkdirSync(pasta, { recursive: true })
  fs.writeFileSync(path.join(pasta, 'coleta.json'), JSON.stringify({
    mlb, slug: SLUG, titulo: 'maleta de canetas', fotos: ['https://exemplo.invalido/foto.jpg'], duvidas: [],
  }))
  if (roteiro) fs.writeFileSync(path.join(pasta, 'roteiro.json'), JSON.stringify(roteiro, null, 2))
  // a cama de musica e obrigatoria: entra uma faixa MUDA de verdade, porque a
  // montagem manda ela pro ffmpeg pra valer.
  if (comMusica) {
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '30', path.join(pasta, 'musica.mp3')], { encoding: 'utf8' })
  }
}

// Os 4 precos de voz e o da musica e do clipe, mais o "pode ir". Valores de teste.
const PRECOS = [
  '--preco-usd=0.05', '--preco-musica-usd=0.08',
  '--preco-tts-entrada=1', '--preco-tts-saida=10',
  '--preco-transcricao-entrada=1', '--preco-transcricao-saida=10',
]
const PRECOS_AUTORIZADO = [...PRECOS, '--autorizado']

// GEMINI_SEM_API=1 e a TRAVA DURA: o filho herda o ambiente e o carregarChave se
// recusa a devolver chave, entao nenhum caminho deste arquivo gasta dinheiro,
// nem quando o teste falha. A protecao nao pode ser a mesma linha que o teste checa.
function rodar(args) {
  const r = spawnSync(process.execPath, [CLI, `--producao=${raiz}`, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GEMINI_SEM_API: '1' },
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// Roda o main() no proprio processo, com as pecas pagas trocadas por falsas, e
// devolve o que ele imprimiu.
async function chamar(args, deps = {}) {
  const out = []
  const err = []
  const log = console.log
  const error = console.error
  console.log = (...a) => out.push(a.join(' '))
  console.error = (...a) => err.push(a.join(' '))
  try {
    const status = await main([`--producao=${raiz}`, ...args], deps)
    return { status, stdout: out.join('\n'), stderr: err.join('\n') }
  } finally {
    console.log = log
    console.error = error
  }
}

beforeEach(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'video-produto-'))
  pasta = path.join(raiz, SLUG)
})
afterEach(() => { fs.rmSync(raiz, { recursive: true, force: true }) })

// 4 clipes sinteticos no perfil canonico do Veo (720x1280, 24fps, 8s, aac 48k
// estereo), gerados uma vez so com lavfi. Servem pra rodar a fase 3 de verdade.
let modelosDeClipe
before(() => {
  modelosDeClipe = fs.mkdtempSync(path.join(os.tmpdir(), 'video-produto-clipes-'))
  for (let i = 1; i <= 4; i++) {
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
      '-i', `testsrc2=size=720x1280:rate=24:duration=${SEGUNDOS_POR_BLOCO}`,
      '-f', 'lavfi', '-i', `sine=frequency=${400 + i * 20}:duration=${SEGUNDOS_POR_BLOCO}`,
      '-ar', '48000', '-ac', '2', '-c:v', 'libx264', '-c:a', 'aac',
      '-pix_fmt', 'yuv420p', '-shortest', path.join(modelosDeClipe, `bloco-${i}.mp4`)])
  }
})
after(() => { fs.rmSync(modelosDeClipe, { recursive: true, force: true }) })

function copiarClipes() {
  for (let i = 1; i <= 4; i++) fs.copyFileSync(path.join(modelosDeClipe, `bloco-${i}.mp4`), path.join(pasta, `bloco-${i}.mp4`))
}

// narracao sintetica no formato do Gemini TTS (24kHz mono). Duracao escolhida de
// proposito diferente dos 8s do clipe: e a costura que a montagem tem que medir.
function criarNarracoes(blocos = { 2: 6.4, 3: 9.4 }) {
  for (const [n, seg] of Object.entries(blocos)) {
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
      '-i', `sine=frequency=300:duration=${seg}`, '-ar', '24000', '-ac', '1',
      path.join(pasta, `narracao-${n}.wav`)])
  }
}

// --- pecas puras -----------------------------------------------------------

test('validarEstruturaDoRoteiro aprova roteiro completo e aponta o que falta no incompleto', () => {
  assert.equal(validarEstruturaDoRoteiro(roteiroValido()).ok, true)

  const { ok, erros } = validarEstruturaDoRoteiro({ blocos: [{ etapa: 'atencao' }] })
  assert.equal(ok, false)
  assert.match(erros.join('\n'), /produto/)
  assert.match(erros.join('\n'), /voz/)
  assert.match(erros.join('\n'), /ator\.idade/)
  assert.match(erros.join('\n'), /lista de 4/)
})

test('a mensagem de voz faltando e generica, sem voz de uma categoria so', () => {
  const { erros } = validarEstruturaDoRoteiro({ blocos: [] })
  const msg = erros.find((e) => /"voz"/.test(e))
  assert.ok(msg, erros.join(' | '))
  assert.match(msg, /Aoede/)
  assert.match(msg, /Gacrux/)
  // a escolha e pela lista descrita na SKILL: gerar amostra seria chamada paga sem ferramenta
  assert.doesNotMatch(msg, /amostra/i)
  assert.match(msg, /lista de vozes/)
})

test('validarEstruturaDoRoteiro exige que a advertencia de categoria seja DECLARADA', () => {
  const r = roteiroValido()
  delete r.advertencias
  const { ok, erros } = validarEstruturaDoRoteiro(r)
  assert.equal(ok, false, 'campo ausente reprova: a ausencia de advertencia se declara com lista vazia')
  assert.match(erros.join('\n'), /advertencias/)
})

test('validarEstruturaDoRoteiro aceita lista vazia de advertencia e as literais de suplemento', () => {
  assert.equal(validarEstruturaDoRoteiro({ ...roteiroValido(), advertencias: [] }).ok, true)
  const lit = { ...roteiroValido(), advertencias: ['Este produto não é um medicamento', 'Mantenha fora do alcance de crianças'] }
  assert.equal(validarEstruturaDoRoteiro(lit).ok, true)
})

test('validarEstruturaDoRoteiro recusa advertencia vazia no meio da lista', () => {
  const r = { ...roteiroValido(), advertencias: ['Este produto não é um medicamento', '   '] }
  const { ok, erros } = validarEstruturaDoRoteiro(r)
  assert.equal(ok, false)
  assert.match(erros.join('\n'), /item vazio/)
})

test('validarEstruturaDoRoteiro recusa tipo de bloco que a fase 2 nao sabe tratar', () => {
  const r = roteiroValido()
  r.blocos[1].tipo = 'closeup'
  const { ok, erros } = validarEstruturaDoRoteiro(r)
  assert.equal(ok, false)
  assert.match(erros.join('\n'), /bloco 2.*pessoa ou produto/)
})

// o campo `produto` vai LITERAL dentro do prompt do Veo; a marca de terceiro que
// vale e a que o proprio roteiro declara em marcasDeTerceiro, nao uma lista fixa.
test('validarEstruturaDoRoteiro barra no campo produto a marca que o roteiro declarou como de terceiro', () => {
  const r = roteiroValido()
  r.produto = 'Kit 168 Caneta Estilo Marca Teste para colorir'
  const { ok, erros } = validarEstruturaDoRoteiro(r)
  assert.equal(ok, false)
  assert.match(erros.join('\n'), /marca de terceiro.*prompt do Veo/s)

  // sem marca declarada, nada a barrar nesse campo
  const livre = { ...roteiroValido(), marcasDeTerceiro: [] }
  livre.produto = 'Kit 168 Caneta Estilo Marca Teste para colorir'
  assert.equal(validarEstruturaDoRoteiro(livre).ok, true)
})

test('podeGastar barra roteiro sem aprovacao e libera o aprovado', () => {
  const sem = podeGastar(roteiroValido())
  assert.equal(sem.ok, false)
  assert.match(sem.motivo, /aprovadoEm/)
  assert.equal(podeGastar(carimbado(roteiroValido())).ok, true)
})

test('podeGastar libera dry-run, que nao gasta nada', () => {
  assert.equal(podeGastar(roteiroValido(), { dryRun: true }).ok, true)
})

// A aprovacao vale pro CONTEUDO aprovado, nao pro arquivo.
test('podeGastar recusa roteiro que mudou depois do carimbo de aprovacao', () => {
  const aprovado = carimbado(roteiroValido())
  assert.equal(podeGastar(aprovado).ok, true)

  const trocado = structuredClone(aprovado)
  trocado.blocos[0].fala = 'Olha, essa maleta aqui em casa virou a minha companheira de trabalho de todo santo dia'
  const r = podeGastar(trocado)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /mudou depois da aprovacao/i)
  assert.match(r.motivo, /--aprovar/)
})

test('hashDoRoteiro cobre tudo que a pessoa le no roteiro.md, e ignora o resto', () => {
  const base = roteiroValido()
  const mesmo = { ...base, aprovadoEm: 'qualquer', aprovadoHash: 'outro', comentario: 'nota minha' }
  assert.equal(hashDoRoteiro(base), hashDoRoteiro(mesmo))

  for (const mexer of [
    (r) => { r.produto = 'outra coisa' },
    (r) => { r.voz = 'Kore' },
    (r) => { r.ehKit = true; r.itensDoKit = ['168 canetas', 'maleta'] },
    (r) => { r.ator.idade = 41 },
    (r) => { r.ator.cenario = 'uma sala de aula vazia' },
    (r) => { r.blocos[2].cena = 'macro de outra coisa' },
    (r) => { r.blocos[3].fala = 'Olha a ficha completa la na descricao e ja salva ai nos favoritos pra ver' },
  ]) {
    const r = structuredClone(base)
    mexer(r)
    assert.notEqual(hashDoRoteiro(r), hashDoRoteiro(base))
  }
})

// Carimbo: um caso por campo que o roteiro.md mostra e que muda o video ou o gasto.
test('o carimbo cai quando muda a musica', () => {
  const r = structuredClone(roteiroValido())
  r.musica = { estilo: 'calma' }
  assert.notEqual(hashDoRoteiro(r), hashDoRoteiro(roteiroValido()))
})

test('o carimbo cai quando muda a voz unica', () => {
  const r = structuredClone(roteiroValido())
  r.vozUnica = true
  assert.notEqual(hashDoRoteiro(r), hashDoRoteiro(roteiroValido()))
})

test('o carimbo cai quando mudam as advertencias', () => {
  const r = structuredClone(roteiroValido())
  r.advertencias = ['Mantenha fora do alcance de crianças']
  assert.notEqual(hashDoRoteiro(r), hashDoRoteiro(roteiroValido()))
})

test('o carimbo cai quando mudam as marcas proprias', () => {
  const r = structuredClone(roteiroValido())
  r.marcasProprias = ['Acme', 'Outra Marca']
  assert.notEqual(hashDoRoteiro(r), hashDoRoteiro(roteiroValido()))
})

test('o carimbo cai quando mudam as marcas de terceiro', () => {
  const r = structuredClone(roteiroValido())
  r.marcasDeTerceiro = []
  assert.notEqual(hashDoRoteiro(r), hashDoRoteiro(roteiroValido()))
})

test('carimbo antigo sem hash do conteudo nao vale como aprovacao', () => {
  const r = podeGastar({ ...roteiroValido(), aprovadoEm: '2026-08-08T12:00:00Z' })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /aprovar/)
})

test('dinheiro e escrito de um jeito so na skill inteira', () => {
  assert.equal(usd(0.8), 'US$ 0,80')
  assert.equal(usd(3.2), 'US$ 3,20')
  assert.equal(usd(0), 'US$ 0,00')
  // os arquivos que imprimem custo usam o mesmo helper, nenhum formata na mao
  const fontes = ['video-produto.mjs', 'clipe.mjs']
    .map((f) => fs.readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8'))
  for (const [i, src] of fontes.entries()) {
    assert.doesNotMatch(src, /US\$ \$\{/, `${['video-produto.mjs', 'clipe.mjs'][i]} formata dinheiro na mao em vez de usar o usd()`)
  }
})

test('kit sem itensDoKit nao passa fingindo que o gate rodou', () => {
  const r = { ...roteiroValido(), ehKit: true, itensDoKit: [] }
  const { ok, erros } = validarEstruturaDoRoteiro(r)
  assert.equal(ok, false)
  assert.match(erros.join('\n'), /itensDoKit/)
})

test('compararFala aceita transcricao fiel e reprova audio improvisado', () => {
  const fala = 'A ponta fina risca leve e a grossa preenche rapido sem falhar'
  assert.equal(compararFala(fala, 'a ponta fina risca leve, e a grossa preenche rápido sem falhar').ok, true)

  const ruim = compararFala(fala, 'olha que legal esse produto maravilhoso demais')
  assert.equal(ruim.ok, false)
  assert.ok(ruim.faltando.includes('risca'))
})

// Transcricao de verdade do teste pago da 3.13: o TTS leu a direcao inteira
// antes da fala. A fala estava toda la, entao so medir o que faltou aprovava.
const FALA_313 = 'Olha, eu vivia sem paciência de desenhar, e essas canetas mudaram meu fim de semana'
const LEU_A_DIRECAO = 'Idioma português brasileiro, sotaque brasileiro neutro. Você não é locutor de propaganda. É mulher que gosta de pintar, quarenta anos, gravando um áudio de WhatsApp pra uma amiga. Não projete a voz, não faça entonação de comercial. Fale. ' + FALA_313

test('conferirNarracao reprova a voz que leu a direcao antes da fala, que o compararFala aprovava', () => {
  assert.equal(compararFala(FALA_313, LEU_A_DIRECAO).ok, true, 'canario: so o que falta nao pega o defeito')
  const r = conferirNarracao(FALA_313, LEU_A_DIRECAO)
  assert.equal(r.ok, false)
  assert.ok(r.sobrando.includes('locutor'), JSON.stringify(r.sobrando))
  assert.ok(r.proporcaoSobra > 0.3)
})

// Numero falado por extenso contra algarismo na transcricao: antes reprovava a
// voz certa e, na fase 2, apagava o wav e pedia pra pagar de novo, em loop.
test('conferirNarracao entende numero composto e preco por extenso', () => {
  assert.equal(conferirNarracao('São trinta e seis cores', 'São 36 cores').ok, true)
  assert.equal(conferirNarracao('Sai por vinte e nove e noventa', 'Sai por R$ 29,90').ok, true)
  assert.equal(conferirNarracao('Sai por vinte e nove reais e noventa centavos', 'Sai por R$ 29,90').ok, true)
  assert.equal(conferirNarracao('Vem com cento e vinte e cinco peças', 'Vem com 125 peças').ok, true)
  assert.equal(conferirNarracao('Vinte e uma cores', '21 cores').ok, true)
  // numero errado continua reprovando
  const errado = conferirNarracao('São trinta e seis cores', 'São 24 cores')
  assert.equal(errado.ok, false)
  assert.ok(errado.faltando.includes('36'))
  // e a voz que leu a direcao tambem
  assert.equal(conferirNarracao(FALA_313, LEU_A_DIRECAO).ok, false)
})

test('palavrasCanonicas junta o composto e deixa um/uma soltos como artigo', () => {
  assert.deepEqual(palavrasCanonicas('trinta e seis'), ['36'])
  assert.deepEqual(palavrasCanonicas('R$ 29,90'), ['r', '29', '90'])
  assert.deepEqual(palavrasCanonicas('uma mesa e duas cadeiras'), ['uma', 'mesa', 'e', '2', 'cadeiras'])
  assert.deepEqual(palavrasCanonicas('novecentos e noventa e nove'), ['999'])
})

test('conferirNarracao aprova a fala fiel e reprova a fala cortada', () => {
  assert.equal(conferirNarracao(FALA_313, 'olha eu vivia sem paciencia de desenhar e essas canetas mudaram meu fim de semana').ok, true)
  const cortada = conferirNarracao(FALA_313, 'olha eu vivia sem paciencia')
  assert.equal(cortada.ok, false)
  assert.ok(cortada.faltando.includes('canetas'))
})

// A mensagem do Veo e generica: serve a qualquer produto e nao prescreve imagem
// de um catalogo especifico.
test('explicarFalhaDoVeo traduz o bloqueio de conteudo em recado acionavel e generico', () => {
  const texto = explicarFalhaDoVeo(new Error('Veo terminou sem vídeo: {"raiMediaFilteredReasons":["third-party content"]}'))
  assert.match(texto, /marca de terceiro/i)
  assert.match(texto, /--foto=/)
  assert.match(texto, /sem texto/i)
  assert.match(texto, /fundo claro/i)
  assert.match(texto, /fotos cruas do fornecedor/i)
  assert.match(texto, /\/gerar-imagens/)
  assert.doesNotMatch(texto, /01-hero/)
  assert.doesNotMatch(texto, /at .*\.mjs:\d+/) // recado, nao stack trace
})

test('explicarFalhaDoVeo manda a chave faltando pro .env do projeto', () => {
  const texto = explicarFalhaDoVeo(new Error('falta GEMINI_API_KEY no .env do projeto'))
  assert.match(texto, /\.env do projeto/)
  assert.match(texto, /\/conectar/)
})

test('gate de voz pega bloco inteiro perdido, que a comparacao global aprovava', () => {
  const blocos = [
    { fala: 'Olha, eu abri essa maleta aqui em casa e fiquei impressionada com o tanto de cor' },
    { fala: 'A ponta fina risca leve e a ponta grossa preenche bem rapido sem falhar' },
    { fala: 'A tinta seca rapidinho e o desenho nao borra quando a mao passa por cima' },
    { fala: 'Olha a ficha completa la na descricao e ja salva ai nos favoritos' },
  ]
  const dito = [blocos[0].fala, blocos[2].fala, blocos[3].fala].join(' ')
  assert.equal(compararFala(blocos.map((b) => b.fala).join(' '), dito).ok, true)

  const r = conferirVozPorBloco(blocos, dito)
  assert.equal(r.ok, false)
  assert.equal(r.piores[0].bloco, 2, `esperava o bloco 2 apontado: ${JSON.stringify(r.piores)}`)
  assert.ok(r.piores[0].faltando.includes('grossa'))
})

test('explicarFalhaDoVeo nao fantasia causa em erro comum nem casa dentro de palavra', () => {
  assert.match(explicarFalhaDoVeo(new Error('fetch failed')), /^\[veo\] fetch failed/)
  for (const msg of ['training constraint violated', 'quota exceeded for this project', 'connect ETIMEDOUT', 'unblocked after retry', 'model safetynet warmup failed']) {
    assert.match(explicarFalhaDoVeo(new Error(msg)), /^\[veo\]/, `"${msg}" nao e bloqueio de conteudo`)
  }
  for (const msg of ['{"promptFeedback":{"blockReason":"SAFETY"}}', 'PROHIBITED_CONTENT', 'request was blocked by the content filter']) {
    assert.match(explicarFalhaDoVeo(new Error(msg)), /marca de terceiro/i, `"${msg}" e bloqueio de conteudo`)
  }
})

test('acharPastaDoProduto casa pelo MLB salvo na coleta', () => {
  preparar(null)
  assert.equal(acharPastaDoProduto(raiz, MLB), pasta)
  assert.equal(acharPastaDoProduto(raiz, 'MLB' + '9999999999'), null)
  assert.equal(acharPastaDoProduto(path.join(raiz, 'nao-existe'), MLB), null)
})

test('roteiroParaMarkdown entrega o texto do gate 1 com ator, cena, fala e silabas', () => {
  const md = roteiroParaMarkdown(roteiroValido(), { mlb: MLB })
  assert.match(md, /professora de artes, 34 anos/)
  assert.match(md, /Bloco 1, atencao/)
  assert.match(md, /Bloco 4, acao/)
  assert.match(md, /sílabas/)
  assert.match(md, /32s/) // 4 blocos de 8s
})

// O que a pessoa aprova tem que ser o que o carimbo cobre: voz unica, musica e
// advertencias aparecem no texto que ela le.
test('roteiroParaMarkdown mostra voz unica, musica e advertencias', () => {
  const r = { ...roteiroValido(), vozUnica: true, advertencias: ['Mantenha fora do alcance de crianças', 'Este produto não é um medicamento'] }
  const md = roteiroParaMarkdown(r)
  assert.match(md, /Voz única: sim/)
  assert.match(md, /Música: animada/)
  assert.match(md, /Advertências na tela: Mantenha fora do alcance de crianças \| Este produto não é um medicamento/)

  const sem = roteiroParaMarkdown({ ...roteiroValido(), vozUnica: false })
  assert.match(sem, /Voz única: não/)
  assert.match(sem, /Advertências na tela: nenhuma/)
})

// --- argumentos e travas de gasto, pelo CLI ---------------------------------

test('sem --mlb o CLI mostra o uso e sai com 2', () => {
  const r = rodar([])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--fase=1\|2\|3/)
})

test('flag malformada ou desconhecida ABORTA, em vez de virar rodada de verdade em silencio', () => {
  preparar(carimbado(roteiroValido()))
  for (const flag of ['--dry-run=1', '--dry-run=true', '--dryrun', '--dry_run', '--aprovar=sim', '--foto', '-dry-run', '--autorizado=1', '--preco-usd']) {
    const r = rodar([`--mlb=${MLB}`, '--fase=2', flag])
    assert.equal(r.status, 2, `"${flag}" tinha que abortar com 2, veio ${r.status}: ${r.stderr.slice(0, 200)}`)
    assert.match(r.stderr, /desconhecid|nao leva valor|precisa de|invalid/i, `"${flag}": ${r.stderr.slice(0, 200)}`)
    assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
  }
})

test('conferirArgumentos aceita as flags de verdade e recusa o resto', () => {
  assert.deepEqual(conferirArgumentos([
    `--mlb=${MLB}`, '--fase=2', '--dry-run', '--foto=a.jpg', '--producao=x', '--slug=s', '--recoletar', '--aprovar',
    '--autorizado', '--preco-usd=0.05', '--preco-musica-usd=0.08', '--preco-tts-entrada=1', '--preco-tts-saida=10',
    '--preco-transcricao-entrada=1', '--preco-transcricao-saida=10', '--modelo-musica=algum',
  ]), [])
  assert.equal(conferirArgumentos(['--mlb=MLB1', '--dry-run=1']).length, 1)
  assert.equal(conferirArgumentos(['--mlb=MLB1', 'fase=2']).length, 1)
  assert.equal(conferirArgumentos(['--anuncios=x']).length, 1) // o nome antigo da pasta nao existe mais
})

test('preco que nao e numero positivo sai 2, antes de qualquer coisa', () => {
  preparar(carimbado(roteiroValido()))
  for (const v of ['abc', '0', '-1']) {
    const r = rodar([`--mlb=${MLB}`, '--fase=2', `--preco-usd=${v}`])
    assert.equal(r.status, 2, `--preco-usd=${v}: ${r.stderr.slice(0, 200)}`)
  }
})

test('fase 2 RECUSA gastar enquanto o roteiro nao for aprovado', () => {
  preparar(roteiroValido())
  const r = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO])
  assert.equal(r.status, 3)
  assert.match(r.stderr, /gate 1/)
  assert.match(r.stderr, /aprovadoEm/)
  assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
})

test('fase 2 recusa roteiro que fura a regra da casa, mesmo aprovado', () => {
  const r = roteiroValido()
  r.aprovadoEm = '2026-08-08T12:00:00Z'
  r.blocos[3].fala = 'Olha o preco la na descricao porque hoje ele sai com bastante desconto pra voce aproveitar'
  preparar(r)

  const saida = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO])
  assert.equal(saida.status, 1)
  assert.match(saida.stderr, /gate de conteudo/)
  assert.match(saida.stderr, /termo comercial/)
  assert.match(saida.stderr, /nao gasto nada/)
})

test('fase 2 recusa roteiro sem a lista de marcas declarada', () => {
  const r = roteiroValido()
  delete r.marcasProprias
  preparar(carimbado(r))
  const saida = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO])
  assert.equal(saida.status, 1)
  assert.match(saida.stderr, /marcasProprias/)
})

// --- gasto: preco, pode ir e teto -------------------------------------------

test('fase 2 fora do dry-run sem --preco-usd sai 2 e nao gasta', () => {
  preparar(carimbado(roteiroValido()))
  const r = rodar([`--mlb=${MLB}`, '--fase=2', '--autorizado'])
  assert.equal(r.status, 2, r.stderr.slice(0, 300))
  assert.match(r.stderr, /--preco-usd/)
  assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
})

test('fase 2 com a musica faltando e sem --preco-musica-usd sai 2', () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const r = rodar([`--mlb=${MLB}`, '--fase=2', '--preco-usd=0.05', '--autorizado'])
  assert.equal(r.status, 2, r.stderr.slice(0, 300))
  assert.match(r.stderr, /--preco-musica-usd/)
})

test('fase 2 com preco e sem --autorizado sai 3, pedindo o pode ir e mostrando a estimativa', () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const r = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS])
  assert.equal(r.status, 3, r.stderr.slice(0, 300))
  const j = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.match(j.parou, /precisa do pode ir/)
  // 4 clipes de 8s a 0,05 + musica 0,08 + folga de voz 0,01 por bloco que falta
  assert.ok(j.estimativa_usd > 1.6 && j.estimativa_usd < 2, `estimativa fora do esperado: ${j.estimativa_usd}`)
  assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
})

test('fase 2 com estimativa acima de limite_gasto_usd sai 3 dizendo que passa do limite', async () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const nada = async () => { throw new Error('nao devia chamar nada pago') }
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 1 }),
    gerarClipe: nada, narrar: nada, transcrever: nada, gerarMusica: nada,
  })
  assert.equal(r.status, 3, r.stderr)
  const j = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.match(j.parou, /passa do limite/)
  assert.ok(j.estimativa_usd > 1)
})

test('sem configuracao no projeto o teto cai no padrao da skill de Mercado Livre', async () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const nada = async () => { throw new Error('nao devia chamar nada pago') }
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS], {
    carregarConfiguracao: () => { throw new Error('sem arquivo') },
    gerarClipe: nada, narrar: nada, transcrever: nada, gerarMusica: nada,
  })
  // com preco e sem pode ir, ela chega no pode ir (estimativa ~1,7 cabe no padrao de 4)
  assert.equal(r.status, 3)
  assert.match(r.stdout, /precisa do pode ir/)
})

test('fase 3 sem dry-run e sem --autorizado sai 3, porque a transcricao e paga', () => {
  preparar(carimbado(roteiroValido()))
  const r = rodar([`--mlb=${MLB}`, '--fase=3'])
  assert.equal(r.status, 3, r.stderr.slice(0, 300))
  assert.match(r.stdout, /precisa do pode ir/)
})

test('fase 3 autorizada mas sem os precos da transcricao sai 2', () => {
  preparar(carimbado(roteiroValido()))
  const r = rodar([`--mlb=${MLB}`, '--fase=3', '--autorizado'])
  assert.equal(r.status, 2, r.stderr.slice(0, 300))
  assert.match(r.stderr, /--preco-transcricao-entrada/)
})

// --- repeticao e reaproveitamento -------------------------------------------

test('fase 2 repetida com tudo pronto nao chama a API nem grava custo, e a estimativa da segunda e 0', async () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  fs.writeFileSync(path.join(pasta, 'referencia.jpg'), 'foto de mentira')
  const n = { clipe: 0, narrar: 0, transcrever: 0, musica: 0, custo: 0 }
  let ultimoTexto = ''
  const deps = {
    registrarCusto: () => { n.custo++; return true },
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    gerarClipe: async ({ saida, registrarCusto }) => {
      n.clipe++
      fs.copyFileSync(path.join(modelosDeClipe, path.basename(saida)), saida)
      registrarCusto({ servico: 'gemini-video', usd: 0.4, contexto: 'falso' })
      return { arquivo: saida, custoUsd: 0.4 }
    },
    narrar: async ({ texto, saida, registrarCusto }) => {
      n.narrar++
      ultimoTexto = texto
      fs.writeFileSync(saida, 'wav de mentira')
      registrarCusto({ servico: 'gemini-tts', usd: 0.001, contexto: 'falso' })
      return { arquivo: saida, segundos: 6 }
    },
    transcrever: async (_wav, { registrarCusto }) => {
      n.transcrever++
      registrarCusto({ servico: 'gemini-transcricao', usd: 0.001, contexto: 'falso' })
      return ultimoTexto
    },
    gerarMusica: async ({ saida, registrarCusto }) => {
      n.musica++
      fs.writeFileSync(saida, 'mp3 de mentira')
      registrarCusto({ servico: 'gemini-musica', usd: 0.08, contexto: 'falso' })
      return { arquivo: saida, custoUsd: 0.08 }
    },
  }

  const primeira = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO], deps)
  assert.equal(primeira.status, 0, primeira.stderr)
  assert.equal(n.clipe, 4)
  assert.equal(n.musica, 1)
  assert.ok(n.custo >= 5, `custos gravados: ${n.custo}`)
  const estimativaPrimeira = JSON.parse(primeira.stdout.trim().split('\n').pop()).estimativa_usd
  assert.ok(estimativaPrimeira > 0)

  const antes = { ...n }
  const segunda = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO], deps)
  assert.equal(segunda.status, 0, segunda.stderr)
  assert.deepEqual(n, antes, 'a segunda rodada nao pode chamar nem gravar nada')
  assert.equal(JSON.parse(segunda.stdout.trim().split('\n').pop()).estimativa_usd, 0)
  assert.match(segunda.stderr, /0 clipe/)
})

test('fase 2 passa o preco do dia, o registro de custo e o contexto pro clipe', async () => {
  preparar(carimbado(roteiroValido()))
  fs.writeFileSync(path.join(pasta, 'referencia.jpg'), 'foto de mentira')
  let visto = null
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO.filter((p) => !p.startsWith('--preco-usd=')), '--preco-usd=0.07'], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    registrarCusto: () => true,
    gerarClipe: async (o) => {
      visto ??= o
      fs.copyFileSync(path.join(modelosDeClipe, path.basename(o.saida)), o.saida)
      return { arquivo: o.saida, custoUsd: 0.56 }
    },
    narrar: async ({ texto, saida }) => { fs.writeFileSync(saida, texto); return { arquivo: saida, segundos: 6 } },
    // a fase 2 confere a fala: a transcricao falsa devolve o que foi narrado
    transcrever: async (wav) => fs.readFileSync(wav, 'utf8'),
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(visto.precoUsdPorSegundo, 0.07)
  assert.equal(typeof visto.registrarCusto, 'function')
  assert.match(visto.contexto, new RegExp(`video-produto ${SLUG} bloco-1`))
  assert.equal(visto.pastaVideo, pasta)
})

test('fase 2 avisa no comeco da operacao do Veo que a rodada anterior deixou aberta', () => {
  preparar(carimbado(roteiroValido()))
  fs.writeFileSync(path.join(pasta, '_operacoes-abertas.json'), JSON.stringify(['models/veo/operations/abc123']))
  const r = rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run'])
  assert.equal(r.status, 0, r.stderr.slice(0, 300))
  assert.match(r.stderr, /operations\/abc123/)
  assert.match(r.stderr, /pode ter sido cobrada; confira no painel do Google antes de refazer/)
  assert.ok(r.stderr.indexOf('abc123') < r.stderr.indexOf('clipe(s) a gerar'), 'o aviso vem antes do resto')
})

test('fase 2 em dry-run roda o caminho inteiro sem gerar nem gastar, e sem exigir preco', () => {
  preparar(carimbado(roteiroValido()))
  const r = rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run'])
  assert.equal(r.status, 0)
  assert.match(r.stderr, /DRY-RUN/)
  assert.match(r.stderr, /4 clipe/)
  assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
  assert.equal(fs.existsSync(path.join(pasta, 'referencia.jpg')), false)
})

// O reaproveitamento e por ARTEFATO: narracao que faltou se gera sozinha, sem
// pagar clipe de novo.
test('fase 2 gera so a narracao que faltou quando o clipe do bloco ja esta pago e salvo', () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()

  const r = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO])
  // a trava de teste corta a chamada paga do TTS, e e isso que prova que a
  // narracao FOI tentada em vez do bloco ser pulado inteiro
  assert.equal(r.status, 1)
  assert.match(r.stderr, /narra/i)
  assert.match(r.stderr, /GEMINI_SEM_API/)
  assert.doesNotMatch(r.stderr, /bloco 2 ja existe, pulando/i)
})

// Defeito do teste pago da 3.13: o TTS leu a direcao de voz antes da fala. A
// fase 2 tem que apagar o wav ruim e parar ali, sem gerar o resto.
test('fase 2 apaga a narracao que leu a direcao e para sem gerar mais nada', async () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()
  fs.writeFileSync(path.join(pasta, 'referencia.jpg'), 'foto de mentira')
  const narrados = []
  let transcritos = 0
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    registrarCusto: () => true,
    gerarClipe: async () => { throw new Error('clipe ja esta salvo, nao pode gerar') },
    narrar: async ({ texto, saida }) => { narrados.push(texto); fs.writeFileSync(saida, 'wav'); return { arquivo: saida, segundos: 6 } },
    transcrever: async () => { transcritos++; return LEU_A_DIRECAO.replace(FALA_313, roteiroValido().blocos[1].fala) },
  })
  assert.ok(r.stderr.length > 0, 'saida vazia: o teste nao provou nada')
  assert.equal(r.status, 1, r.stderr)
  assert.equal(narrados.length, 1, `so o bloco 2 podia ser narrado: ${narrados.length}`)
  assert.equal(transcritos, 1)
  assert.equal(fs.existsSync(path.join(pasta, 'narracao-2.wav')), false, 'o wav ruim ficou na pasta')
  assert.equal(fs.existsSync(path.join(pasta, 'narracao-3.wav')), false)
  assert.match(r.stderr, /a voz leu algo alem da fala/)
  assert.match(r.stderr, /nada mais foi gerado/)
  assert.match(r.stderr, /locutor/)
})

test('fase 2 apaga o wav quando a transcricao falha, pra proxima rodada gerar de novo', async () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()
  fs.writeFileSync(path.join(pasta, 'referencia.jpg'), 'foto de mentira')
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    registrarCusto: () => true,
    gerarClipe: async () => { throw new Error('clipe ja esta salvo, nao pode gerar') },
    narrar: async ({ texto, saida }) => { fs.writeFileSync(saida, texto); return { arquivo: saida, segundos: 6 } },
    transcrever: async () => { throw new Error('transcricao caiu') },
  })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /transcricao caiu/)
  assert.equal(fs.existsSync(path.join(pasta, 'narracao-2.wav')), false, 'wav nao conferido ficou na pasta')
})

test('fase 2 aceita a narracao fiel e segue pro bloco seguinte', async () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()
  fs.writeFileSync(path.join(pasta, 'referencia.jpg'), 'foto de mentira')
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    registrarCusto: () => true,
    gerarClipe: async () => { throw new Error('clipe ja esta salvo, nao pode gerar') },
    narrar: async ({ texto, saida }) => { fs.writeFileSync(saida, texto); return { arquivo: saida, segundos: 6 } },
    transcrever: async (wav) => fs.readFileSync(wav, 'utf8'),
  })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(fs.existsSync(path.join(pasta, 'narracao-2.wav')))
  assert.ok(fs.existsSync(path.join(pasta, 'narracao-3.wav')))
})

test('extrai o ultimo frame do bloco 1 mesmo quando o clipe dele e reaproveitado', () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()
  assert.equal(fs.existsSync(path.join(pasta, 'ultimo-frame-b1.jpg')), false)

  rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO]) // para na narracao do bloco 2 (trava de teste)
  assert.ok(
    fs.existsSync(path.join(pasta, 'ultimo-frame-b1.jpg')),
    'sem o frame do bloco 1, o bloco 4 nasce com outra pessoa e o clipe pago vai fora',
  )
})

test('dry-run conta a verdade do que esta no disco, sem dizer que a narracao ja existe', () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()

  const r = rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run'])
  assert.equal(r.status, 0, r.stderr.slice(0, 300))
  assert.doesNotMatch(r.stderr, /bloco 2 ja esta pronto \(clipe e narracao\)/, 'mentiu: nao tem wav nenhum na pasta')
  assert.match(r.stderr, /bloco 2.*falta a narra/i)
})

test('fase 2 nao faz nada quando clipe E narracao do bloco ja existem', () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()
  criarNarracoes()

  const r = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO])
  assert.equal(r.status, 0, r.stderr.slice(0, 300))
  assert.match(r.stderr, /0 clipe/)
})

test('fase 2 sem coleta manda rodar a fase 1 em vez de estourar', () => {
  const r = rodar(['--mlb=' + 'MLB' + '7777777777', '--fase=2', ...PRECOS_AUTORIZADO])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /fase 1 primeiro/)
})

test('fase 2 recusa gastar quando o roteiro mudou depois do sim', () => {
  preparar(roteiroValido())
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar']).status, 0)

  const aprovado = JSON.parse(fs.readFileSync(path.join(pasta, 'roteiro.json'), 'utf8'))
  aprovado.blocos[0].fala = 'Olha, essa maleta aqui em casa virou a minha companheira de trabalho de todo santo dia'
  fs.writeFileSync(path.join(pasta, 'roteiro.json'), JSON.stringify(aprovado, null, 2))

  const r = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO])
  assert.equal(r.status, 3)
  assert.match(r.stderr, /mudou depois da aprovacao/i)
  assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
})

test('--slug aponta a pasta sem varrer a producao', () => {
  preparar(carimbado(roteiroValido()))
  const r = rodar(['--mlb=' + 'MLB' + '0000000000', '--slug=' + SLUG, '--fase=2', '--dry-run'])
  assert.equal(r.status, 0, r.stderr.slice(0, 300))
})

test('fase 1 reprova roteiro marcado como kit sem os itens declarados', () => {
  preparar({ ...roteiroValido(), ehKit: true, itensDoKit: [] })
  const r = rodar([`--mlb=${MLB}`, '--fase=1'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /itensDoKit/)
  assert.equal(fs.existsSync(path.join(pasta, 'roteiro.md')), false)
})

// --- fase 3 ------------------------------------------------------------------

test('fase 3 cobra a narracao que faltou apontando a fase 2, em vez de montar bloco mudo', () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()

  const r = rodar([`--mlb=${MLB}`, '--fase=3', '--dry-run'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /narracao-2\.wav/)
  assert.match(r.stderr, /fase 2/)
  assert.equal(fs.existsSync(path.join(pasta, 'final')), false)
})

test('fase 3 passa pelo gate 1 igual a fase 2, porque a transcricao e paga', () => {
  preparar(roteiroValido()) // sem aprovadoEm
  for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(pasta, `bloco-${i}.mp4`), 'clipe de mentira')

  const r = rodar([`--mlb=${MLB}`, '--fase=3', ...PRECOS_AUTORIZADO])
  assert.equal(r.status, 3)
  assert.match(r.stderr, /gate 1/)
  assert.equal(fs.existsSync(path.join(pasta, 'final')), false)
})

test('fase 3 com clipe quebrado explica o que fazer e lembra que o clipe ja foi pago', () => {
  preparar(roteiroValido())
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar']).status, 0)
  for (let i = 1; i <= 4; i++) fs.writeFileSync(path.join(pasta, `bloco-${i}.mp4`), 'isso aqui nao e video')
  criarNarracoes()

  const r = rodar([`--mlb=${MLB}`, '--fase=3', ...PRECOS_AUTORIZADO])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /montagem falhou/i)
  assert.match(r.stderr, /J[ÁA] EST[ÃA]O PAGOS/i)
  assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/) // recado, nao stack trace
})

// A trava que impede a suite de gastar: mesmo mandando a fase 3 rodar sem
// dry-run (o caminho que transcreve, que e pago), nada sai da maquina.
test('a trava de teste impede gasto mesmo quando o caminho pago e chamado de proposito', () => {
  preparar(roteiroValido())
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar']).status, 0)
  copiarClipes()
  criarNarracoes()

  const r = rodar([`--mlb=${MLB}`, '--fase=3', ...PRECOS_AUTORIZADO]) // sem --dry-run: iria transcrever
  assert.equal(r.status, 1)
  assert.match(r.stderr, /GEMINI_SEM_API/)
  assert.match(r.stderr, /tentou GASTAR/)
})

test('fase 3 em dry-run monta em producao/<slug>/_tmp/<slug>.mp4, deixa final/ vazia e NAO transcreve', () => {
  preparar(roteiroValido())
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar']).status, 0)
  copiarClipes()
  criarNarracoes()
  assert.equal(fs.existsSync(path.join(pasta, 'final')), false)

  const r = rodar([`--mlb=${MLB}`, '--fase=3', '--dry-run'])
  // 3 e nao 0: ficou um video na pasta que nenhum gate de voz olhou
  assert.equal(r.status, SAIDA_INCOMPLETA, r.stderr.slice(0, 500))
  assert.ok(fs.existsSync(path.join(pasta, '_tmp', `${SLUG}.mp4`)), 'a montagem e local e gratis, tem que acontecer no dry-run')
  // final/ so recebe video que passou nos dois gates
  assert.equal(fs.existsSync(path.join(pasta, 'final', `${SLUG}.mp4`)), false)
  assert.equal(fs.existsSync(path.join(pasta, 'final.mp4')), false)
  assert.match(r.stderr, /_tmp/)
  assert.match(r.stderr, /gate tecnico\] aprovado/)
  assert.match(r.stderr, /gate de voz.*PULADO/is)
  assert.match(r.stderr, /NAO PUBLICAR/i)
})

test('fase 3 nao monta sem os clipes da fase 2', () => {
  preparar(carimbado(roteiroValido()))
  const r = rodar([`--mlb=${MLB}`, '--fase=3', '--dry-run'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /faltam clipes.*bloco-1\.mp4/)
})

// --- gate 1, pelo CLI --------------------------------------------------------

test('fase 1 valida o roteiro ANTES de escrever o texto que vai pra aprovacao', () => {
  const r = roteiroValido()
  r.blocos[0].fala = 'Comprei essa maleta pro meu sobrinho de oito anos e ele adorou demais viu, brincou o dia todo'
  preparar(r)

  const saida = rodar([`--mlb=${MLB}`, '--fase=1'])
  assert.equal(saida.status, 1)
  assert.match(saida.stderr, /menor de idade/)
  assert.equal(fs.existsSync(path.join(pasta, 'roteiro.md')), false)
})

test('fase 1 com roteiro limpo escreve o roteiro.md e cobra a aprovacao', () => {
  preparar(roteiroValido())
  const r = rodar([`--mlb=${MLB}`, '--fase=1'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /# Roteiro do vídeo/)
  assert.match(r.stderr, /falta voce aprovar/)
  assert.ok(fs.existsSync(path.join(pasta, 'roteiro.md')))
})

test('--aprovar carimba o gate 1 no roteiro.json e destrava a fase 2', () => {
  preparar(roteiroValido())
  const r = rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar'])
  assert.equal(r.status, 0)

  const salvo = JSON.parse(fs.readFileSync(path.join(pasta, 'roteiro.json'), 'utf8'))
  assert.ok(salvo.aprovadoEm)
  assert.equal(podeGastar(salvo).ok, true)
})

test('--aprovar nao carimba roteiro reprovado no gate de conteudo', () => {
  const r = roteiroValido()
  r.blocos[1].fala = 'Essa maleta sai por trinta e nove reais e ainda parcela em tres vezes sem juros pra voce hoje'
  preparar(r)

  const saida = rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar'])
  assert.equal(saida.status, 1)
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'roteiro.json'), 'utf8')).aprovadoEm, undefined)
})

test('fase 1 sem coleta usa a coleta injetada, grava producao/<slug>/coleta.json e entrega a materia-prima', async () => {
  const coleta = { mlb: MLB, slug: 'moedor-de-teste', titulo: 'Moedor Eletrico Inox', ehKit: false, itensDoKit: [], duvidas: [{ texto: 'moi cafe?', vezes: 2 }], fotos: ['https://exemplo.invalido/1.jpg'], avisos: [] }
  const r = await chamar([`--mlb=${MLB}`, '--fase=1'], { coletar: async (mlb) => ({ ...coleta, mlb }) })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(fs.existsSync(path.join(raiz, 'moedor-de-teste', 'coleta.json')))
  const j = JSON.parse(r.stdout)
  assert.equal(j.slug, 'moedor-de-teste')
  assert.equal(j.duvidasMaisRepetidas.length, 1)
})

// --- roteiro de 4 a 7 blocos --------------------------------------------------

const roteiroDe = (n) => {
  const base = roteiroValido()
  const etapas = ['atencao', 'interesse', 'desejo', 'acao']
  const blocos = Array.from({ length: n }, (_, i) => ({
    ...base.blocos[Math.min(i, 3)],
    etapa: i === 0 ? 'atencao' : i === n - 1 ? 'acao' : etapas[Math.min(1 + Math.floor((i - 1) / Math.max(1, (n - 2) / 2)), 2)],
  }))
  return { ...base, blocos }
}

test('validarEstruturaDoRoteiro aceita de 4 a 7 blocos e recusa 3 ou 8', () => {
  for (const n of [4, 5, 6, 7]) {
    const { ok, erros } = validarEstruturaDoRoteiro(roteiroDe(n))
    assert.equal(ok, true, `${n} blocos reprovaram: ${erros.join(' | ')}`)
  }
  for (const n of [3, 8]) {
    const { ok, erros } = validarEstruturaDoRoteiro(roteiroDe(n))
    assert.equal(ok, false, `${n} blocos passaram e nao deviam`)
    assert.ok(erros.some((e) => /de 4 a 7/.test(e)), erros.join(' | '))
  }
})

test('o aviso de gasto conta os clipes do roteiro, nao sempre 4', () => {
  const r = podeGastar(roteiroDe(7))
  assert.equal(r.ok, false)
  assert.match(r.motivo, /7 clipes/)
})

// --- gate de voz x numero -------------------------------------------------------

test('gate de voz nao reprova numero dito por extenso e transcrito em algarismo', () => {
  const r = compararFala(
    'São quarenta miligramas do tipo dois, que é exatamente a dose usada nos estudos com ele.',
    'É, são 40 mg do tipo 2, que é exatamente a dose usada nos estudos com ele.',
  )
  assert.equal(r.ok, true, `reprovou com ${r.proporcao} de divergencia, faltando: ${r.faltando.join(', ')}`)
})

test('gate de voz continua pegando numero TROCADO e bloco improvisado', () => {
  const r = compararFala('São quarenta miligramas do tipo dois na dose dos estudos.', 'São quatro miligramas do tipo nove na dose dos estudos.')
  assert.equal(r.ok, false)
  assert.ok(r.faltando.includes('40'))
  assert.equal(compararFala('São seis ativos num pote só e o mais raro deles é a vitamina.', 'compra logo que ta acabando o estoque').ok, false)
})

test('artigo "uma" nao vira numero e nao cria divergencia falsa', () => {
  assert.equal(compararFala('ela abre uma maleta grande na mesa', 'ela abre a maleta grande na mesa').ok, true)
})

// --- musica obrigatoria ---------------------------------------------------------

test('roteiro sem estilo de musica nao passa, e o erro lista as opcoes', () => {
  const r = roteiroValido()
  delete r.musica
  const { ok, erros } = validarEstruturaDoRoteiro(r)
  assert.equal(ok, false)
  assert.ok(erros.some((e) => /musica\.estilo/.test(e) && /calma/.test(e) && /animada/.test(e)), erros.join(' | '))
})

test('estilo de musica inventado nao passa', () => {
  const { ok, erros } = validarEstruturaDoRoteiro({ ...roteiroValido(), musica: { estilo: 'forrozao' } })
  assert.equal(ok, false)
  assert.ok(erros.some((e) => /forrozao/.test(e)), erros.join(' | '))
})

// --- aviso de cena contraditoria --------------------------------------------------

test('avisa quando a cena diz que ela fala e o vozUnica manda ela calar', () => {
  const r = { ...roteiroValido(), vozUnica: true }
  r.blocos[0] = { ...r.blocos[0], tipo: 'pessoa', cena: 'ela fala olhando pra câmera na cozinha' }
  const avisos = avisosDoRoteiro(r)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /bloco 1/)
  assert.match(avisos[0], /contradiz/i)
})

test('cena de boca fechada nao gera aviso, e sem vozUnica nao gera aviso nenhum', () => {
  const limpo = { ...roteiroValido(), vozUnica: true }
  limpo.blocos[0] = { ...limpo.blocos[0], tipo: 'pessoa', cena: 'ela olha as cápsulas de boca fechada' }
  assert.deepEqual(avisosDoRoteiro(limpo), [])

  const comFala = { ...roteiroValido(), vozUnica: false }
  comFala.blocos[0] = { ...comFala.blocos[0], tipo: 'pessoa', cena: 'ela fala olhando pra câmera' }
  assert.deepEqual(avisosDoRoteiro(comFala), [])
})

test('aviso nao confunde palavra parecida nem olha bloco de produto', () => {
  const r = { ...roteiroValido(), vozUnica: true }
  r.blocos[1] = { ...r.blocos[1], tipo: 'produto', cena: 'macro dela falando' }
  r.blocos[0] = { ...r.blocos[0], tipo: 'pessoa', cena: 'a falésia ao fundo, ela de boca fechada' }
  assert.deepEqual(avisosDoRoteiro(r), [])
})

// --- o roteiro de exemplo e o caminho inteiro sem gastar -----------------------------

test('o roteiro-exemplo.json passa em todos os gates de conteudo, com produto inventado e marcas vazias', () => {
  const exemplo = JSON.parse(fs.readFileSync(EXEMPLO, 'utf8'))
  assert.match(exemplo.produto, /Moedor Eletrico Inox/i)
  assert.deepEqual(exemplo.marcasProprias, [])
  assert.deepEqual(exemplo.marcasDeTerceiro, [])
  assert.deepEqual(conferirRoteiro(exemplo), [])
})


test('ponta a ponta sem gasto: fase 1, aprovar, fase 2 dry-run, fase 3 dry-run', () => {
  const exemplo = JSON.parse(fs.readFileSync(EXEMPLO, 'utf8'))
  preparar(exemplo)

  const f1 = rodar([`--mlb=${MLB}`, '--fase=1'])
  assert.equal(f1.status, 0, f1.stderr.slice(0, 400))
  assert.ok(fs.existsSync(path.join(pasta, 'roteiro.md')))

  // sem o sim, a fase paga nao anda
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS_AUTORIZADO]).status, 3)

  assert.equal(rodar([`--mlb=${MLB}`, '--fase=1', '--aprovar']).status, 0)
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run']).status, 0)
  // aprovado, com preco e sem o pode ir: para antes de gastar
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS]).status, 3)

  // fase 3 sem os clipes da fase 2 reprova; com eles, o dry-run monta e sai "incompleto"
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=3', '--dry-run']).status, 1)
  copiarClipes()
  criarNarracoes(Object.fromEntries(exemplo.blocos
    .map((b, i) => [i + 1, b.tipo === 'produto' || exemplo.vozUnica === true ? 6.4 : null])
    .filter(([, s]) => s)))
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=3', '--dry-run']).status, SAIDA_INCOMPLETA)
  assert.ok(fs.existsSync(path.join(pasta, '_tmp', `${SLUG}.mp4`)))
  assert.equal(fs.existsSync(path.join(pasta, 'final', `${SLUG}.mp4`)), false)
  assert.equal(rodar([`--mlb=${MLB}`, '--fase=3']).status, 3)
})

// --- rodada de correcao 1 ----------------------------------------------------

// Gate 1: o custo mostrado sai de comando, com a mesma conta da fase 2 real, e
// funciona ANTES do carimbo (so estima, nao gera nem chama nada pago).
test('fase 2 dry-run com precos e sem carimbo imprime a estimativa e sai 0 sem chamar nada pago', async () => {
  preparar(roteiroValido(), { comMusica: false }) // sem aprovadoEm
  const proibido = async () => { throw new Error('nao devia chamar nada pago') }
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', '--dry-run', ...PRECOS], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    gerarClipe: async ({ dryRun }) => { if (!dryRun) throw new Error('clipe pago chamado'); return { arquivo: null, custoUsd: 0 } },
    narrar: proibido, transcrever: proibido, gerarMusica: proibido,
  })
  assert.equal(r.status, 0, r.stderr)
  const j = JSON.parse(r.stdout.trim().split('\n').pop())
  // 4 clipes de 8s a 0,05 + musica 0,08 + folga de voz 0,01 x 4 blocos
  assert.equal(j.estimativa_usd, 1.72)
  assert.equal(j.dry_run, true)
  assert.match(r.stderr, /Nada foi gerado nem gasto/)
  assert.equal(fs.existsSync(path.join(pasta, 'bloco-1.mp4')), false)
})

test('a estimativa do dry-run e a mesma da fase 2 real parando no pode ir', () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const seco = rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run', ...PRECOS])
  const real = rodar([`--mlb=${MLB}`, '--fase=2', ...PRECOS])
  assert.equal(seco.status, 0, seco.stderr.slice(0, 300))
  assert.equal(real.status, 3)
  assert.equal(JSON.parse(seco.stdout.trim().split('\n').pop()).estimativa_usd, JSON.parse(real.stdout.trim().split('\n').pop()).estimativa_usd)
})

// O pode ir vale sempre que QUALQUER chamada paga vai rodar, nao so quando a
// estimativa arredondada passa de zero.
test('so a musica faltando, com preco minusculo e sem --autorizado, sai 3 e nao chama a musica', async () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  copiarClipes()
  criarNarracoes()
  let chamou = 0
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', '--preco-usd=0.05', '--preco-musica-usd=0.0000001'], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    gerarMusica: async () => { chamou++; return { arquivo: null, custoUsd: 0 } },
  })
  assert.equal(r.status, 3, r.stderr)
  assert.equal(chamou, 0)
  assert.match(r.stdout, /precisa do pode ir/)
})

test('configuracao ilegivel avisa que caiu no padrao, com o valor', async () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const nada = async () => { throw new Error('nao devia chamar nada pago') }
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS], {
    carregarConfiguracao: () => { throw new Error('bloco quebrado') },
    gerarClipe: nada, narrar: nada, transcrever: nada, gerarMusica: nada,
  })
  assert.match(r.stderr, /limite_gasto_usd.*bloco quebrado.*padrao de US\$ 4/)
})

test('o texto do kit nao usa a construcao "nao e X, e Y" nas mensagens de advertencia', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('./video-produto.mjs', import.meta.url)), 'utf8')
  assert.doesNotMatch(src, /nao esquecimento/)
  const ref = fs.readFileSync(fileURLToPath(new URL('../referencias/advertencias-categoria.md', import.meta.url)), 'utf8')
  assert.doesNotMatch(ref, /n[ãa]o um esquecimento/)
})

// --- rodada de correcao 2 ----------------------------------------------------

// Texto que o aluno le: sem construcao de contraste e sem travessao. O canario
// monta o contraste e o travessao no proprio teste e prova que a busca casa.
const CONTRASTE = /,\s*n[aã]o\s/i
const CONTRASTE_NUNCA = new RegExp(',' + String.fromCharCode(92) + 's*nunca' + String.fromCharCode(92) + 's', 'i')
const NAO_E_MAS_E = /n[aã]o é[^.\n]*, é/i

test('a guarda do texto do aluno pega o contraste e o travessao (canario)', () => {
  assert.match('sai do roteiro' + ', ' + 'nao de transcricao', CONTRASTE)
  assert.match('sai do roteiro' + ', ' + 'nunca de biblioteca', CONTRASTE_NUNCA)
  assert.match('Isso ' + 'não é ' + 'um erro' + ', é ' + 'um aviso', NAO_E_MAS_E)
  const travessoes = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)
  assert.match('a' + String.fromCharCode(0x2014) + 'b', travessoes)
})

test('SKILL.md e as referencias nao usam contraste "X, nao Y", "nao e X, e Y" nem travessao', () => {
  const dir = fileURLToPath(new URL('..', import.meta.url))
  const arquivos = ['SKILL.md', ...fs.readdirSync(path.join(dir, 'referencias')).filter((f) => f.endsWith('.md')).map((f) => `referencias/${f}`)]
  assert.ok(arquivos.length >= 3, `achou so ${arquivos.join(', ')}`)
  const travessoes = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)
  for (const f of arquivos) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')
    assert.doesNotMatch(t, CONTRASTE, `${f}: ${(t.match(CONTRASTE) ?? [''])[0]}`)
    assert.doesNotMatch(t, CONTRASTE_NUNCA, `${f}: ${(t.match(CONTRASTE_NUNCA) ?? [''])[0]}`)
    assert.doesNotMatch(t, NAO_E_MAS_E, `${f}: nao e X, e Y`)
    assert.doesNotMatch(t, travessoes, `${f}: travessao`)
  }
})

test('dry-run da fase 2 sem preco diz que a estimativa nao saiu e qual preco falta', () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const sem = rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run'])
  assert.equal(sem.status, 0, sem.stderr.slice(0, 300))
  assert.match(sem.stderr, /a estimativa nao saiu: falta --preco-usd e --preco-musica-usd/)
  const soClipe = rodar([`--mlb=${MLB}`, '--fase=2', '--dry-run', '--preco-usd=0.05'])
  assert.match(soClipe.stderr, /a estimativa nao saiu: falta --preco-musica-usd/)
})

// --- rodada de correcao do ensaio real (3.13) -----------------------------------

// A API do ML recusa anuncio de outro vendedor. A segunda fonte da coleta e o
// bruto da /espionar-concorrente, passado em --de-espionagem.
const MLB_CONCORRENTE = 'MLB' + '5550001'
const brutoDeEspionagem = () => ({
  produto: 'Moedor Eletrico Inox',
  categoria: 'cozinha',
  anuncios: [{
    id: MLB_CONCORRENTE, titulo: 'Moedor Eletrico Inox Acme', vendedor: 'LOJA EXEMPLO', vendidos: 5000,
    fotos: ['https://exemplo.invalido/1.jpg'], atributos: { Marca: 'Acme' }, descricao: 'Moedor de cafe.',
    // formato real da aba: pergunta, Denunciar e nova janela, resposta, data em linha propria
    perguntas: ['Perguntas neste anúncio', 'Serve pra grao?', 'Denunciar', 'Vai abrir em uma nova janela',
      'Serve.', '12/08/2026', 'Denunciar', 'Vai abrir em uma nova janela', 'Mais informações'].join('\n'),
    avaliacoes: { total: 1, avaliacoes: [{ nota: 5, titulo: 'Bom', texto: 'Mói fino', curtidas: 0 }] },
  }],
})

test('--de-espionagem monta a coleta do bruto da espionagem sem chamar a API', async () => {
  const arq = path.join(raiz, '_raw-concorrentes-moedor.json')
  fs.writeFileSync(arq, JSON.stringify(brutoDeEspionagem()))
  const proibido = async () => { throw new Error('a API do ML nao devia ser chamada') }
  const r = await chamar([`--mlb=${MLB_CONCORRENTE}`, '--fase=1', `--de-espionagem=${arq}`, '--slug=moedor-de-cafe'], { coletar: proibido })
  assert.equal(r.status, 0, r.stderr)
  // a pasta e o slug vem do --slug do aluno, nunca do titulo do concorrente (que traz a marca)
  assert.equal(fs.existsSync(path.join(raiz, 'moedor-eletrico-inox-acme')), false)
  const grav = JSON.parse(fs.readFileSync(path.join(raiz, 'moedor-de-cafe', 'coleta.json'), 'utf8'))
  assert.equal(grav.slug, 'moedor-de-cafe')
  assert.equal(JSON.parse(r.stdout).slug, 'moedor-de-cafe')
  assert.equal(grav.mlb, MLB_CONCORRENTE)
  assert.deepEqual(grav.duvidas, [{ texto: 'Serve pra grao?', vezes: 1 }])
  assert.deepEqual(grav.elogios, ['Mói fino'])
  assert.equal(JSON.parse(r.stdout).duvidasMaisRepetidas.length, 1)
})

test('--de-espionagem com anuncio fora do arquivo sai 1 dizendo quais existem', async () => {
  const arq = path.join(raiz, '_raw-concorrentes-moedor.json')
  fs.writeFileSync(arq, JSON.stringify(brutoDeEspionagem()))
  const r = await chamar([`--mlb=${MLB}`, '--fase=1', `--de-espionagem=${arq}`, '--slug=moedor-de-cafe'], {})
  assert.equal(r.status, 1)
  assert.ok(r.stderr.includes(MLB_CONCORRENTE), r.stderr)
})

test('--de-espionagem sem --slug sai 2 pedindo o nome do produto do aluno, sem marca', async () => {
  const arq = path.join(raiz, '_raw-concorrentes-moedor.json')
  fs.writeFileSync(arq, JSON.stringify(brutoDeEspionagem()))
  const r = await chamar([`--mlb=${MLB_CONCORRENTE}`, '--fase=1', `--de-espionagem=${arq}`], {})
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--slug=/)
  assert.match(r.stderr, /sem marca/)
  assert.deepEqual(fs.readdirSync(raiz).filter((n) => !n.endsWith('.json')), [])
})

test('--de-espionagem com coleta.json ja existente avisa que usa a coleta que ja existe e como recoletar', async () => {
  const arq = path.join(raiz, '_raw-concorrentes-moedor.json')
  fs.writeFileSync(arq, JSON.stringify(brutoDeEspionagem()))
  const args = [`--mlb=${MLB_CONCORRENTE}`, '--fase=1', `--de-espionagem=${arq}`, '--slug=moedor-de-cafe']
  assert.equal((await chamar(args, {})).status, 0)
  const r = await chamar(args, {})
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /usando a coleta que ja existe/)
  assert.match(r.stderr, /--recoletar/)
  const de = await chamar([...args, '--recoletar'], {})
  assert.doesNotMatch(de.stderr, /usando a coleta que ja existe/)
})

// Foto do concorrente nao vai pro Veo: no caminho da espionagem a foto e do
// fornecedor ou do proprio produto, declarada no roteiro e aprovada no gate 1.
const prepararEspionagem = (roteiro) => {
  preparar(roteiro, { mlb: MLB_CONCORRENTE })
  const c = JSON.parse(fs.readFileSync(path.join(pasta, 'coleta.json'), 'utf8'))
  fs.writeFileSync(path.join(pasta, 'coleta.json'), JSON.stringify({ ...c, origem: 'espionagem' }))
}
const fotoPropria = (nome = 'foto-propria.jpg', conteudo = 'imagem de teste') => {
  const f = path.join(raiz, nome)
  fs.writeFileSync(f, conteudo)
  return f
}

test('hashDoRoteiro inclui a foto declarada, e o carimbo cai quando o arquivo dela muda', () => {
  const f = fotoPropria()
  const base = roteiroValido()
  const comFoto = { ...base, foto: f }
  assert.notEqual(hashDoRoteiro(comFoto), hashDoRoteiro(base))
  const antes = hashDoRoteiro(comFoto)
  fs.writeFileSync(f, 'outra imagem, mesmo nome')
  assert.notEqual(hashDoRoteiro(comFoto), antes)
  assert.notEqual(hashDoRoteiro({ ...base, foto: fotoPropria('outra.jpg') }), hashDoRoteiro(comFoto))
})

test('roteiroParaMarkdown mostra a foto que vai pro Veo', () => {
  const md = roteiroParaMarkdown({ ...roteiroValido(), foto: 'fotos/moedor.jpg' })
  assert.match(md, /Foto que vai pro Veo: fotos\/moedor\.jpg/)
})

test('fase 1 da espionagem reprova roteiro sem foto propria declarada', () => {
  prepararEspionagem(roteiroValido())
  const r = rodar([`--mlb=${MLB_CONCORRENTE}`, '--fase=1'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /"foto"/)
  assert.match(r.stderr, /fornecedor/)
  const ok = { ...roteiroValido(), foto: fotoPropria() }
  fs.writeFileSync(path.join(pasta, 'roteiro.json'), JSON.stringify(ok))
  assert.equal(rodar([`--mlb=${MLB_CONCORRENTE}`, '--fase=1']).status, 0)
})

test('fase 2 da espionagem sem --foto sai 2 e lembra que foto de terceiro fere a regra do ML', () => {
  prepararEspionagem(carimbado({ ...roteiroValido(), foto: fotoPropria() }))
  for (const extra of [['--dry-run'], PRECOS_AUTORIZADO]) {
    const r = rodar([`--mlb=${MLB_CONCORRENTE}`, '--fase=2', ...extra])
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, /--foto=/)
    assert.match(r.stderr, /fornecedor/)
    assert.match(r.stderr, /logo/)
    assert.match(r.stderr, /terceiro/)
  }
})

test('fase 2 da espionagem com --foto diferente da aprovada sai 2; com a aprovada, segue', () => {
  const f = fotoPropria()
  prepararEspionagem(carimbado({ ...roteiroValido(), foto: f }))
  const outra = fotoPropria('outra.jpg')
  const r = rodar([`--mlb=${MLB_CONCORRENTE}`, '--fase=2', '--dry-run', `--foto=${outra}`])
  assert.equal(r.status, 2, r.stderr)
  assert.match(r.stderr, /aprovad/)
  assert.equal(rodar([`--mlb=${MLB_CONCORRENTE}`, '--fase=2', '--dry-run', `--foto=${f}`]).status, 0)
  // trocar o conteudo da foto depois do sim derruba o carimbo
  fs.writeFileSync(f, 'imagem trocada')
  const caiu = rodar([`--mlb=${MLB_CONCORRENTE}`, '--fase=2', ...PRECOS_AUTORIZADO, `--foto=${f}`])
  assert.equal(caiu.status, 3, caiu.stderr)
  assert.match(caiu.stderr, /MUDOU depois da aprovacao/)
})

// final/ so recebe o video que passou no gate tecnico E no gate de voz.
const falasDe = (r) => r.blocos.map((b) => b.fala).join(' ')
const depsDaFase3 = (dito) => ({
  carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
  transcrever: async () => dito,
})

test('fase 3 com o gate de voz reprovado nao deixa nada em final/', async () => {
  preparar(carimbado(roteiroValido()))
  copiarClipes()
  criarNarracoes()
  const r = await chamar([`--mlb=${MLB}`, '--fase=3', ...PRECOS_AUTORIZADO], depsDaFase3('nada a ver com o roteiro'))
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /\[voz\] bloco/)
  assert.equal(fs.existsSync(path.join(pasta, 'final', `${SLUG}.mp4`)), false)
})

test('fase 3 aprovada nos dois gates move o video de _tmp pra final/<slug>.mp4', async () => {
  const roteiro = carimbado(roteiroValido())
  preparar(roteiro)
  copiarClipes()
  criarNarracoes()
  const r = await chamar([`--mlb=${MLB}`, '--fase=3', ...PRECOS_AUTORIZADO], depsDaFase3(falasDe(roteiro)))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(fs.existsSync(path.join(pasta, 'final', `${SLUG}.mp4`)))
  assert.equal(fs.existsSync(path.join(pasta, '_tmp', `${SLUG}.mp4`)), false)
})

test('sem --de-espionagem a coleta continua sendo pela API', async () => {
  let chamou = 0
  const r = await chamar([`--mlb=${MLB}`, '--fase=1'], {
    coletar: async (mlb) => { chamou++; return { mlb, slug: 'moedor-de-teste', titulo: 'Moedor', ehKit: false, itensDoKit: [], duvidas: [], fotos: [], avisos: [] } },
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(chamou, 1)
})

test('--de-espionagem entra na lista de flags e aparece no uso', () => {
  assert.deepEqual(conferirArgumentos([`--mlb=${MLB}`, '--de-espionagem=x.json']), [])
  assert.equal(conferirArgumentos(['--de-espionagem']).length, 1)
  const r = rodar(['--ajuda-que-nao-existe'])
  assert.match(r.stderr, /--de-espionagem=/)
})

test('fase 1 com coleta de kit sem itens avisa pra preencher os itens no roteiro', async () => {
  const coleta = { mlb: MLB, slug: 'kit-de-teste', titulo: 'Kit Moedor Eletrico Inox', ehKit: true, itensDoKit: [], duvidas: [], fotos: [], avisos: [] }
  const r = await chamar([`--mlb=${MLB}`, '--fase=1'], { coletar: async (mlb) => ({ ...coleta, mlb }) })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /preencha os itens do kit no roteiro/)
  const semAviso = await chamar([`--mlb=${MLB}`, '--fase=1', '--recoletar'], { coletar: async (mlb) => ({ ...coleta, mlb, ehKit: true, itensDoKit: ['moedor', 'tampa'] }) })
  assert.doesNotMatch(semAviso.stderr, /preencha os itens do kit/)
  const naoKit = await chamar([`--mlb=${MLB}`, '--fase=1', '--recoletar'], { coletar: async (mlb) => ({ ...coleta, mlb, ehKit: false }) })
  assert.doesNotMatch(naoKit.stderr, /preencha os itens do kit/)
})

test('sem _contexto/mercado-livre.md o aviso do teto diz o padrao e que a configuracao vem da /mercado-livre', async () => {
  preparar(carimbado(roteiroValido()), { comMusica: false })
  const nada = async () => { throw new Error('nao devia chamar nada pago') }
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', ...PRECOS], {
    carregarConfiguracao: () => { throw new Error('nao existe /pasta/_contexto/mercado-livre.md.\nRode /mercado-livre: a primeira conversa monta esse arquivo por entrevista.') },
    gerarClipe: nada, narrar: nada, transcrever: nada, gerarMusica: nada,
  })
  assert.match(r.stderr, /ainda nao existe _contexto\/mercado-livre\.md/)
  assert.match(r.stderr, /padrao de US\$ 4,00/)
  assert.match(r.stderr, /configuracao vem da \/mercado-livre/)
})

test('o dry-run imprime os modelos que vai usar junto da estimativa', async () => {
  preparar(roteiroValido(), { comMusica: false })
  const r = await chamar([`--mlb=${MLB}`, '--fase=2', '--dry-run', ...PRECOS], {
    carregarConfiguracao: () => ({ limite_gasto_usd: 4 }),
    gerarClipe: async () => ({ arquivo: null, custoUsd: 0 }),
  })
  assert.equal(r.status, 0, r.stderr)
  const modelos = r.stderr.split('\n').find((l) => /modelos/i.test(l)) ?? ''
  assert.match(modelos, /Veo/)
  assert.match(modelos, /lite/)
  assert.match(modelos, /TTS/)
  assert.match(modelos, /transcri/i)
  assert.match(modelos, /Lyria/)
  assert.match(modelos, /tabela de precos/)
})
