// Porta de entrada da skill /video-produto. Amarra as pecas nas 3 fases:
//
//   fase 1 (GRATIS): coleta o anuncio no ML, entrega a materia-prima do roteiro
//                    e, quando o roteiro ja existe, roda o gate de conteudo e
//                    escreve o roteiro.md que a pessoa le e aprova.
//   fase 2 (PAGA):   os clipes no Veo + a narracao no Gemini TTS + a musica.
//   fase 3:          emenda, queima a legenda, gate tecnico e gate de voz.
//
// DOIS GATES DE VERDADE. Toda fase que gasta (a 2 inteira, e a transcricao do
// gate de voz na 3) se RECUSA a rodar enquanto o roteiro.json nao tiver o
// carimbo `aprovadoEm` + `aprovadoHash`, que so e carimbado depois da pessoa
// dizer sim em texto (`--fase=1 --aprovar`). O hash e a impressao digital do
// CONTEUDO aprovado: mexeu na fala, na cena, no ator, na voz, na musica, nas
// advertencias ou nas marcas depois do sim, o carimbo cai.
//
// DINHEIRO. Nenhuma chamada paga sai sem o preco do dia (--preco-usd e os
// outros, conferidos na pagina de precos do Gemini no dia, nunca chumbados) e sem
// --autorizado (o "pode ir" da pessoa). A estimativa da fase 2 soma: clipes que
// faltam x 8 s x preco por segundo, a musica se faltar, e uma folga de US$ 0,01
// por bloco com algo faltando (voz e transcricao de volta de 8 s custam fracoes
// de centavo; a folga so existe pra estimativa nao subestimar). Passou do teto
// `limite_gasto_usd` da configuracao, nao roda.
//
// Codigos de saida: 0 ok; 1 falhou ou reprovou; 2 uso errado (inclui preco
// ausente); 3 parou antes de gastar (sem aprovacao de gasto, sem --autorizado,
// acima do teto) ou, na fase 3 em dry-run, montou mas pulou o gate de voz.
//
// Cada fase e independente de rede a partir da 2: a fase 1 salva `coleta.json`
// em producao/<slug>/ e as seguintes leem esse arquivo.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { coletar } from './coletar.mjs'
import { coletarDeEspionagem } from './lib/de-espionagem.mjs'
import { validarRoteiro, regexDeMarcas, MIN_BLOCOS, MAX_BLOCOS } from './lib/gate.mjs'
import { validarBloco, contarSilabas } from './lib/silabas.mjs'
import { promptDeClipe } from './lib/direcao.mjs'
import { gerarClipe, tierDoBloco } from './clipe.mjs'
import { usd } from './lib/dinheiro.mjs'
import { narrar, transcrever } from './narrar.mjs'
import { montarVideo } from './montar.mjs'
import { gerarMusica, ESTILOS } from './lib/musica.mjs'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { carregarConfiguracao, PADROES } from '../../mercado-livre/scripts/lib/config.mjs'
import { registrarCusto, estimar, liberarGasto } from '../../configurar-video/scripts/lib/custos.mjs'

export const SEGUNDOS_POR_BLOCO = 8
// folga de voz por bloco com artefato faltando, em dolar (ver o cabecalho)
export const FOLGA_VOZ_USD = 0.01

// acima disso a gente considera que o audio nao e o roteiro: o Veo improvisou a
// fala dos blocos com rosto e a legenda (que sai do roteiro) estaria mentindo.
// A tolerancia vale POR BLOCO, nunca no video inteiro: com 4 blocos, um bloco
// inteiro mudo derruba so ~25% das palavras do video e passava folgado nos 30%
// globais. Por bloco, bloco perdido da 100% de divergencia e reprova.
export const TOLERANCIA_DIVERGENCIA_VOZ = 0.3

const TIPOS = ['pessoa', 'produto']

// codigo de saida proprio pra "fez o que dava, mas o resultado NAO esta
// liberado": a fase 3 em dry-run monta o arquivo e pula o gate de voz. Sair 0
// ali seria mentir pra quem le codigo de saida, que veria sucesso e um video na
// pasta sem gate de voz nenhum em cima.
export const SAIDA_INCOMPLETA = 3

const CAMINHO_CLI = '.claude/skills/video-produto/scripts/video-produto.mjs'

// ---------------------------------------------------------------------------
// pecas puras (testaveis sem gastar 1 centavo de API)
// ---------------------------------------------------------------------------

// O validarRoteiro (lib/gate.mjs) cuida das REGRAS (ML + regra da casa). Aqui e
// so o esqueleto: campo que falta vira mensagem dizendo o que escrever, em vez
// de estourar la na frente com "cannot read property of undefined".
export function validarEstruturaDoRoteiro(roteiro) {
  const erros = []
  if (!roteiro || typeof roteiro !== 'object') return { ok: false, erros: ['roteiro.json vazio ou nao e um objeto'] }
  if (!roteiro.produto) erros.push('falta "produto" (o que o Veo tem que manter fiel a imagem de referencia)')
  else {
    // o `produto` nao e falado nem encenado, entao o validarRoteiro nao olha pra
    // ele, mas ele vai LITERALMENTE dentro do prompt do Veo. Titulo de anuncio
    // costuma vir cheio de marca de terceiro, e copiar isso pro prompt e pedir
    // pra tomar bloqueio de conteudo depois de ja ter aberto a operacao paga. A
    // lista de marcas e a que o proprio roteiro declara.
    const marcas = regexDeMarcas(roteiro.marcasDeTerceiro)
    const achou = marcas ? String(roteiro.produto).match(marcas) : null
    if (achou) {
      erros.push(`"produto" tem marca de terceiro ("${achou[0]}") e esse campo vai inteiro dentro do prompt do Veo, que barra marca de terceiro. Descreva o produto sem marca nenhuma (ex: "moedor eletrico de cafe em inox")`)
    }
  }
  if (!roteiro.voz) erros.push('falta "voz" (nome de uma voz do Gemini TTS, ex.: Aoede, Kore, Gacrux; escolha pela lista de vozes descrita na SKILL.md)')
  // todo video leva musica de fundo, e o ESTILO depende do produto. Nao existe
  // padrao silencioso: escolher entre calma e animada e decisao de produto.
  if (!roteiro.musica?.estilo) {
    erros.push(`falta "musica.estilo" (todo video leva cama de musica). Opcoes: ${Object.entries(ESTILOS).map(([k, v]) => `${k} (${v.quando})`).join('; ')}`)
  } else if (!ESTILOS[roteiro.musica.estilo]) {
    erros.push(`"musica.estilo" e ${JSON.stringify(roteiro.musica.estilo)}, que nao existe. Opcoes: ${Object.keys(ESTILOS).join(', ')}`)
  }
  // ADVERTENCIA OBRIGATORIA DA CATEGORIA: o ML recusa Clips que "nao informam as
  // regras de publicidade e marketing aplicaveis a categoria do produto". O campo
  // e OBRIGATORIO de declarar, e `[]` e resposta valida: produto sem advertencia
  // declara a ausencia, e essa ausencia fica escrita no roteiro. O
  // texto sai LITERAL do rotulo (ver referencias/advertencias-categoria.md).
  if (!Array.isArray(roteiro.advertencias)) {
    erros.push('falta "advertencias" como lista. E a legenda legal que o ML exige por categoria (o exemplo dele e "Venda proibida a menores de 18 anos" em bebida). Suplemento leva as do rotulo, LITERAIS. Produto sem advertencia nenhuma declara "advertencias": [], e isso registra a decisao no roteiro')
  } else if (roteiro.advertencias.some((t) => typeof t !== 'string' || !t.trim())) {
    erros.push('"advertencias" tem item vazio ou que nao e texto: cada item e uma frase de advertencia inteira, copiada literal do rotulo')
  }
  if (!roteiro.ator?.quem) erros.push('falta "ator.quem"')
  if (typeof roteiro.ator?.idade !== 'number') erros.push('falta "ator.idade" como numero (o ML proibe menor de idade, sempre 18+)')
  if (!roteiro.ator?.cenario) erros.push('falta "ator.cenario"')
  // espelha a trava do gate (lib/gate.mjs): kit sem lista de itens nao tem como
  // ser conferido, entao nao pode passar como se tivesse sido.
  if (roteiro.ehKit && !(roteiro.itensDoKit ?? []).length) {
    erros.push('"ehKit" esta true mas "itensDoKit" esta vazio: sem a lista nao da pra conferir a regra do ML de mostrar todos os itens do kit. Preencher a partir da pagina do produto, ou marcar ehKit false')
  }

  const blocos = roteiro.blocos
  if (!Array.isArray(blocos) || blocos.length < MIN_BLOCOS || blocos.length > MAX_BLOCOS) {
    erros.push(`"blocos" tem que ser uma lista de ${MIN_BLOCOS} a ${MAX_BLOCOS} (AIDA em blocos de ${SEGUNDOS_POR_BLOCO}s, teto de 60s do ML), veio ${Array.isArray(blocos) ? blocos.length : typeof blocos}`)
    return { ok: erros.length === 0, erros }
  }
  blocos.forEach((b, i) => {
    const n = i + 1
    if (!b?.fala) erros.push(`bloco ${n}: falta "fala"`)
    if (!b?.cena) erros.push(`bloco ${n}: falta "cena"`)
    if (!TIPOS.includes(b?.tipo)) erros.push(`bloco ${n}: "tipo" tem que ser ${TIPOS.join(' ou ')}, veio ${JSON.stringify(b?.tipo)}`)
  })
  return { ok: erros.length === 0, erros }
}

// Avisos: coisa que nao reprova o roteiro, mas que a gente aprendeu que sai cara
// se passar batido. Com `vozUnica`, o prompt manda a pessoa NAO falar (a voz e a
// nossa), mas a `cena` continuava escrita como "fala olhando pra camera". O
// prompt saia se contradizendo, e o filtro de conteudo do Veo barra isso. A
// operacao e cobrada mesmo quando volta filtrada.
const CENA_FALANDO = /(?<![a-zà-ÿ])(fal(?:a|ando|ar)|diz(?:|endo)|explic(?:a|ando)|narra(?:|ndo)|convers(?:a|ando))(?![a-zà-ÿ])/i

export function avisosDoRoteiro(roteiro) {
  const avisos = []
  if (roteiro?.vozUnica === true) {
    (roteiro.blocos ?? []).forEach((b, i) => {
      if (b?.tipo !== 'pessoa') return
      const achou = String(b?.cena ?? '').match(CENA_FALANDO)
      if (achou) {
        avisos.push(`bloco ${i + 1}: "vozUnica" esta ligado (a voz e a NOSSA narracao, e o prompt manda a pessoa nao falar), mas a cena diz "${achou[0]}". O prompt sai se contradizendo. Reescreva a cena com ela de boca fechada, reagindo ou gesticulando.`)
      }
    })
  }
  return avisos
}

// Impressao digital do CONTEUDO aprovado. Entra TUDO que aparece no roteiro.md
// que a pessoa le e que muda o video ou o gasto: produto, voz, voz unica, musica,
// advertencias, marcas, kit e seus itens, ator, e a fala e a cena de cada bloco.
// Campo de controle (aprovadoEm, o proprio hash) e anotacao solta ficam de fora
// de proposito, senao carimbar mudaria o carimbo.
//
// A `foto` (imagem que vai pro Veo, obrigatoria no caminho da espionagem) entra
// com o caminho, o tamanho e a impressao digital do ARQUIVO: trocar a imagem
// depois do sim, mesmo mantendo o nome, derruba o carimbo. Roteiro sem foto
// nao ganha a chave, e o carimbo dos roteiros antigos continua valendo.
function digitalDaFoto(caminho) {
  try {
    const buf = fs.readFileSync(caminho)
    return { caminho, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16) }
  } catch { return { caminho, bytes: null, sha256: null } }
}

export function hashDoRoteiro(roteiro) {
  const essencia = {
    produto: roteiro?.produto ?? null,
    voz: roteiro?.voz ?? null,
    vozUnica: roteiro?.vozUnica === true,
    musica: roteiro?.musica ?? null,
    advertencias: roteiro?.advertencias ?? null,
    marcasProprias: roteiro?.marcasProprias ?? null,
    marcasDeTerceiro: roteiro?.marcasDeTerceiro ?? null,
    ehKit: Boolean(roteiro?.ehKit),
    itensDoKit: roteiro?.itensDoKit ?? [],
    ator: {
      quem: roteiro?.ator?.quem ?? null,
      idade: roteiro?.ator?.idade ?? null,
      cenario: roteiro?.ator?.cenario ?? null,
      genero: roteiro?.ator?.genero ?? null,
      sotaque: roteiro?.ator?.sotaque ?? null,
    },
    blocos: (roteiro?.blocos ?? []).map((b) => ({
      etapa: b?.etapa ?? null, tipo: b?.tipo ?? null, cena: b?.cena ?? null, fala: b?.fala ?? null,
    })),
  }
  if (roteiro?.foto) essencia.foto = digitalDaFoto(roteiro.foto)
  return createHash('sha256').update(JSON.stringify(essencia)).digest('hex').slice(0, 16)
}

// Gate 1 mecanizado. Sem `aprovadoEm` no roteiro.json, a fase 2 nao gasta. Esse
// campo e carimbado por `--fase=1 --aprovar`, que so se roda DEPOIS da pessoa
// aprovar o texto no chat. Dry-run passa sempre porque nao gasta nada.
export function podeGastar(roteiro, { dryRun = false } = {}) {
  if (dryRun) return { ok: true, motivo: null }

  const comoAprovar = [
    'Caminho: mostrar o roteiro.md pra pessoa, e so depois do sim dela rodar',
    `  node ${CAMINHO_CLI} --mlb=<MLB> --fase=1 --aprovar`,
    'Pra ver o que SERIA gerado sem gastar: acrescente --dry-run.',
  ]

  // quantos clipes esse roteiro custaria: o numero de blocos varia de 4 a 7, e
  // dizer "4 clipes" num roteiro de 7 subestimava a conta justo na frase que
  // existe pra avisar do gasto.
  const nClipes = roteiro?.blocos?.length ?? MIN_BLOCOS

  if (!roteiro?.aprovadoEm) {
    return {
      ok: false,
      motivo: [
        'roteiro sem aprovacao: o campo "aprovadoEm" nao esta no roteiro.json.',
        `A fase paga gasta dinheiro de verdade (${nClipes} clipes de ${SEGUNDOS_POR_BLOCO}s no Veo, mais voz e musica, conta Gemini pre-paga),`,
        'entao ela nao roda antes do gate 1.',
        ...comoAprovar,
      ].join('\n'),
    }
  }

  // A aprovacao vale pro CONTEUDO que a pessoa leu, nao pro arquivo. Sem essa
  // comparacao, trocar fala/cena/ator depois do sim gastava num texto que ela
  // nunca viu: os gates de conteudo re-rodam e aprovam de novo, so que um texto
  // diferente do aprovado.
  if (roteiro.aprovadoHash !== hashDoRoteiro(roteiro)) {
    return {
      ok: false,
      motivo: [
        roteiro.aprovadoHash
          ? 'o roteiro MUDOU depois da aprovacao: o texto que esta no roteiro.json agora nao e o que voce leu.'
          : 'o carimbo de aprovacao e antigo e nao guarda a impressao digital do conteudo, entao nao da pra provar que o texto atual e o aprovado.',
        'A aprovacao vale pro texto aprovado (fala, cena, ator, produto, voz, musica, advertencias e marcas), nao pro arquivo.',
        ...comoAprovar,
      ].join('\n'),
    }
  }

  return { ok: true, motivo: null }
}

const querNarracaoDoBloco = (roteiro, bloco) => bloco.tipo === 'produto' || roteiro.vozUnica === true

export function roteiroParaMarkdown(roteiro, { mlb = '' } = {}) {
  const marcas = [
    (roteiro.marcasProprias ?? []).length ? `próprias: ${roteiro.marcasProprias.join(', ')}` : null,
    (roteiro.marcasDeTerceiro ?? []).length ? `de terceiros: ${roteiro.marcasDeTerceiro.join(', ')}` : null,
  ].filter(Boolean)
  const linhas = [
    `# Roteiro do vídeo, ${roteiro.produto}`,
    '',
    mlb ? `Anúncio: ${mlb}` : null,
    `Ator: ${roteiro.ator.quem}, ${roteiro.ator.idade} anos, em ${roteiro.ator.cenario}`,
    `Voz da narração: ${roteiro.voz}`,
    `Voz única: ${roteiro.vozUnica === true ? 'sim (a narração cobre todos os blocos, e a pessoa aparece de boca fechada)' : 'não (nos blocos com pessoa vale a voz do Veo)'}`,
    `Música: ${roteiro.musica?.estilo ?? 'sem estilo'}`,
    roteiro.foto ? `Foto que vai pro Veo: ${roteiro.foto}` : null,
    `Advertências na tela: ${(roteiro.advertencias ?? []).length ? roteiro.advertencias.join(' | ') : 'nenhuma'}`,
    marcas.length ? `Marcas que a fala não pode citar: ${marcas.join('; ')}` : null,
    // sem itens nao imprime a linha do kit: o gate ja reprova esse caso, e uma
    // linha "tem que mostrar tudo: " terminando no vazio faria a pessoa aprovar
    // achando que o gate conferiu alguma coisa.
    roteiro.ehKit && (roteiro.itensDoKit ?? []).length
      ? `Kit, tem que mostrar tudo: ${roteiro.itensDoKit.join(', ')}` : null,
    '',
    `Duração: ${roteiro.blocos.length} blocos de ${SEGUNDOS_POR_BLOCO}s = ${roteiro.blocos.length * SEGUNDOS_POR_BLOCO}s`,
    '',
  ].filter((l) => l !== null)

  roteiro.blocos.forEach((b, i) => {
    const quem = b.tipo === 'pessoa'
      ? (roteiro.vozUnica === true ? 'pessoa em cena, voz da narração' : 'pessoa em cena, voz do Veo')
      : 'macro do produto, narração em off'
    linhas.push(
      `## Bloco ${i + 1}, ${b.etapa} (${quem})`,
      '',
      `**Cena:** ${b.cena}`,
      '',
      `**Fala:** ${b.fala}`,
      '',
      `_${contarSilabas(b.fala)} sílabas (faixa de 30 a 38 pra caber nos ${SEGUNDOS_POR_BLOCO}s)_`,
      '',
    )
  })

  linhas.push(
    '---',
    '',
    'Gate 1: você aprova ou pede ajuste. Nada foi gasto até aqui.',
    '',
  )
  return linhas.join('\n')
}

const soPalavras = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/)
  .filter(Boolean)

// Numero e unidade ditos por extenso na fala e escritos em algarismo na
// transcricao (ou o contrario) sao A MESMA COISA DITA, mas a comparacao literal
// os trata como palavra faltando. Medido ao vivo: o TTS falou "sao quarenta
// miligramas do tipo dois" e a transcricao voltou "sao 40 mg do tipo 2", 37% de
// divergencia contra o teto de 30%, e o gate reprovaria um audio CORRETO, so que
// na fase 3, depois dos clipes pagos. Canonizar os dois lados mata o falso
// positivo sem afrouxar nada: quem improvisa de verdade continua sendo pego.
//
// "um"/"uma" ficam FORA do mapa de proposito: em portugues sao artigo muito mais
// vezes que numeral, e transforma-los em "1" faria "uma mesa" contra "a mesa"
// virar divergencia.
//
// Numero composto ate 999 e preco em reais: ver palavrasCanonicas, logo abaixo.
// Limite assumido: milhar composto ("dois mil e quinhentos") nao casa com "2500".
const NUMERO_POR_EXTENSO = new Map(Object.entries({
  dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', sete: '7',
  oito: '8', nove: '9', dez: '10', onze: '11', doze: '12', treze: '13',
  quatorze: '14', catorze: '14', quinze: '15', dezesseis: '16', dezessete: '17',
  dezoito: '18', dezenove: '19', vinte: '20', trinta: '30', quarenta: '40',
  cinquenta: '50', sessenta: '60', setenta: '70', oitenta: '80', noventa: '90',
  cem: '100', mil: '1000',
}))

const UNIDADE = new Map(Object.entries({
  miligrama: 'mg', miligramas: 'mg', grama: 'g', gramas: 'g',
  micrograma: 'mcg', microgramas: 'mcg', mililitro: 'ml', mililitros: 'ml',
  quilo: 'kg', quilos: 'kg', quilograma: 'kg', quilogramas: 'kg',
}))

export const canonizarPalavra = (p) => NUMERO_POR_EXTENSO.get(p) ?? UNIDADE.get(p) ?? p

// Numero composto ate 999 ("trinta e seis", "cento e vinte e cinco") vira um
// numero so, nos dois lados. Sem isso "sao trinta e seis cores" contra "sao 36
// cores" dava 67% faltando, e na fase 2 a narracao certa era apagada e paga de
// novo, em loop. "um"/"uma" so contam como numero DEPOIS de "e" dentro do
// composto ("vinte e um"); soltos continuam artigo.
const CENTENA = new Map(Object.entries({
  cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
}))
const valorAte99 = (p) => {
  const n = Number(NUMERO_POR_EXTENSO.get(p))
  return n >= 2 && n <= 90 ? n : null
}
// Dinheiro: "vinte e nove reais e noventa centavos" e "R$ 29,90" sao o mesmo
// preco. A virgula ja separa 29 de 90 no soPalavras; "reais" e "centavos" saem
// dos dois lados porque a transcricao troca por "R$" (que vira "r", curto demais
// pra contar).
const MOEDA = new Set(['real', 'reais', 'centavo', 'centavos'])

export function palavrasCanonicas(texto) {
  const p = soPalavras(texto).filter((x) => !MOEDA.has(x))
  const saida = []
  for (let i = 0; i < p.length; i++) {
    let total = null
    let j = i
    if (CENTENA.has(p[j])) { total = CENTENA.get(p[j]); j++ } else if (p[j] === 'cem') { saida.push('100'); continue }
    // dezena/unidade: direto (sem centena) ou depois de "e" (com centena)
    const podeSeguir = (k) => total === null ? k : (p[k] === 'e' ? k + 1 : -1)
    let k = podeSeguir(j)
    if (k >= 0 && valorAte99(p[k]) !== null) {
      const v = valorAte99(p[k])
      total = (total ?? 0) + v
      j = k + 1
      // dezena redonda (20..90) aceita "e" + unidade (1..9, inclusive um/uma)
      if (v >= 20 && v % 10 === 0 && p[j] === 'e') {
        const u = p[j + 1] === 'um' || p[j + 1] === 'uma' ? 1 : valorAte99(p[j + 1])
        if (u !== null && u >= 1 && u <= 9) { total += u; j += 2 }
      }
    } else if (total !== null && p[j] === 'e' && (p[j + 1] === 'um' || p[j + 1] === 'uma')) {
      total += 1; j += 2
    }
    if (total === null) { saida.push(canonizarPalavra(p[i])); continue }
    saida.push(String(total))
    i = j - 1
  }
  return saida
}

// Gate de voz: o Veo pode improvisar a fala dos blocos com rosto, e ai a legenda
// (que sai do roteiro) diz uma coisa e o audio diz outra. Compara so palavra com
// mais de 3 letras, que e o que carrega sentido; artigo e preposicao somem na
// transcricao sem mudar nada.
export function compararFala(esperado, dito, { tolerancia = TOLERANCIA_DIVERGENCIA_VOZ } = {}) {
  // numero entra na conferencia mesmo tendo 1 ou 2 caracteres: depois de
  // canonizado, "quarenta" vira "40" e o filtro de "mais de 3 letras" jogaria
  // fora justo o que NAO pode divergir (dose, quantidade).
  const relevante = (p) => p.length > 3 || /^\d+$/.test(p)
  const alvo = palavrasCanonicas(esperado).filter(relevante)
  const ouvido = new Set(palavrasCanonicas(dito))
  const faltando = alvo.filter((p) => !ouvido.has(p))
  const proporcao = alvo.length ? faltando.length / alvo.length : 0
  return { ok: proporcao <= tolerancia, faltando, proporcao, total: alvo.length }
}

// Conferencia da narracao recem-gerada, na fase 2. Aqui o audio tem SO a fala de
// um bloco, entao alem do que faltou da pra medir o que SOBROU: palavra ouvida
// que nao esta na fala. Foi o defeito do teste pago da 3.13, o TTS leu a direcao
// de voz inteira antes da fala, e o compararFala sozinho nao pega (a fala estava
// toda la, so que depois da direcao).
export function conferirNarracao(fala, dito, { tolerancia = TOLERANCIA_DIVERGENCIA_VOZ } = {}) {
  const falta = compararFala(fala, dito, { tolerancia })
  const relevante = (p) => p.length > 3 || /^\d+$/.test(p)
  const daFala = new Set(palavrasCanonicas(fala))
  const ouvido = palavrasCanonicas(dito).filter(relevante)
  const sobrando = ouvido.filter((p) => !daFala.has(p))
  const proporcaoSobra = ouvido.length ? sobrando.length / ouvido.length : 0
  return { ok: falta.ok && proporcaoSobra <= tolerancia, faltando: falta.faltando, proporcaoFalta: falta.proporcao, sobrando, proporcaoSobra }
}

// A conferencia de verdade e BLOCO A BLOCO, contra a transcricao do video
// inteiro (uma chamada paga so). Comparar o video todo de uma vez diluia o
// problema: bloco mudo virava 25% e passava.
export function conferirVozPorBloco(blocos, dito, { tolerancia = TOLERANCIA_DIVERGENCIA_VOZ } = {}) {
  const porBloco = blocos.map((b, i) => ({ bloco: i + 1, ...compararFala(b.fala, dito, { tolerancia }) }))
  const piores = porBloco.filter((r) => !r.ok).sort((a, b) => b.proporcao - a.proporcao)
  return { ok: piores.length === 0, porBloco, piores }
}

// Erro do Veo vira recado acionavel, nunca stack trace cru.
export function explicarFalhaDoVeo(erro) {
  const msg = String(erro?.message ?? erro)

  if (/GEMINI_API_KEY/i.test(msg)) {
    return [
      '[chave] GEMINI_API_KEY nao encontrada.',
      'A chave vive no .env do projeto (o /conectar ensina a pegar). Sem ela nada da fase 2 roda.',
    ].join('\n')
  }

  // Falha TRANSITORIA de audio nao e recusa de conteudo e nao se conserta
  // trocando a imagem: o mesmo prompt passa na tentativa seguinte, e a propria
  // API diz "You have not been charged". Tem que ser testada ANTES do bloco de
  // conteudo, senao a pessoa e mandada cacar problema numa imagem que esta boa.
  if (/issue with the audio|falha transitoria de audio/i.test(msg)) {
    return [
      '[falha transitoria do Veo] O gerador de audio dele engasgou e a geracao voltou sem video.',
      'Nao e filtro de conteudo e NAO foi cobrada (a propria resposta diz "You have not been charged").',
      'O clipe.mjs ja repete sozinho ate 4 vezes; se chegou aqui, as 4 falharam seguidas.',
      'O conserto e esperar alguns minutos e rodar a mesma fase 2 de novo: os clipes que ja passaram ficam na pasta e nao sao refeitos.',
    ].join('\n')
  }

  // O Veo diz "recusei por conteudo" de varias formas, e todas levam ao MESMO
  // conserto, entao todas caem aqui. O cuidado e nao casar por pedaco de palavra
  // (`rai` e `policy` soltos casavam dentro de "training" e "constraint"): cada
  // palavra solta leva lookaround de letra, incluindo acentuada, porque o `\b`
  // do JavaScript nao conhece acento. Sigla em MAIUSCULA da API entra inteira.
  const L = '[a-zà-ÿ0-9_]'
  const palavra = (p) => `(?<!${L})${p}(?!${L})`
  const bloqueio = new RegExp([
    'terminou sem v[íi]deo', // a nossa propria mensagem quando volta done sem video
    'raiMediaFilteredReasons', 'raiFilteredReason',
    'PROHIBITED_CONTENT', 'blockReason', 'finishReason":"SAFETY',
    'third[- ]?party',
    palavra('filtrad[oa]'), palavra('blocked'), palavra('prohibited'), palavra('safety'),
    'content[- ]?polic(?:y|ies)',
  ].join('|'), 'i')

  if (bloqueio.test(msg)) {
    return [
      '[bloqueio de conteudo] O Veo aceitou o pedido, cobrou a operacao e devolveu SEM video.',
      'Causas comuns: marca de terceiro ou texto visivel na imagem de entrada, ou uma cena que se contradiz (ex.: pessoa que "fala" com a voz unica ligada).',
      '',
      'O que a "foto" do roteiro (e o --foto=, que so vale igual a ela) espera receber: imagem do PRODUTO, sem texto de venda,',
      'sem logo e sem marca de terceiro, fundo claro e de preferencia ja vertical (a preparacao completa com branco pra',
      'chegar em 9:16, o que so fica invisivel em fundo claro). As imagens da /gerar-imagens levam texto de venda:',
      'prefira as fotos cruas do fornecedor, ou uma imagem limpa feita so pra isso.',
      'Teto de 3 tentativas por video: se a terceira cair, a leitura da regra esta errada na raiz e insistir so gasta.',
      '',
      'Escreva o caminho da imagem limpa em "foto" no roteiro.json, mostre ela pra pessoa, aprove de novo e rode:',
      `  node ${CAMINHO_CLI} --mlb=<MLB> --fase=1 --aprovar`,
      `  node ${CAMINHO_CLI} --mlb=<MLB> --fase=2 --preco-usd=<US$/s> --autorizado`,
      '',
      `Detalhe cru da API: ${msg.slice(0, 300)}`,
    ].join('\n')
  }

  return `[veo] ${msg}`
}

// A fase 1 salva coleta.json dentro de producao/<slug>/. As fases 2 e 3 acham a
// pasta varrendo por MLB, e assim nao precisam de rede nem de token do ML.
export function acharPastaDoProduto(base, mlb) {
  let dirs = []
  try { dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() }
  catch { return null }
  for (const slug of dirs) {
    const arquivo = path.join(base, slug, 'coleta.json')
    try {
      if (JSON.parse(fs.readFileSync(arquivo, 'utf8')).mlb === mlb) return path.join(base, slug)
    } catch { /* pasta sem coleta, segue */ }
  }
  return null
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USO = [
  `uso: node ${CAMINHO_CLI} --mlb=<MLB> [--fase=1|2|3] [opcoes]`,
  '',
  '  --fase=1              coleta (gratis). Roda de novo depois de escrever o roteiro.json pra validar e gerar o roteiro.md',
  '  --fase=1 --aprovar    carimba o gate 1 no roteiro.json (so depois de voce aprovar o texto)',
  '  --fase=2              gera os clipes no Veo, a narracao e a musica (PAGO)',
  '  --fase=3              emenda, legenda, gate tecnico e gate de voz (a transcricao e paga)',
  '',
  '  --dry-run             sem gastar API: na fase 2 so mostra os prompts e o custo; na fase 3 monta e pula o gate de voz (sai 3, "incompleto")',
  '  --autorizado          o "pode ir" da pessoa: sem ele, qualquer rodada paga para (sai 3) e mostra a estimativa',
  '  --preco-usd=<US$/s>   preco do dia do clipe do Veo por segundo (obrigatorio na fase 2 fora do dry-run)',
  '  --preco-musica-usd=<US$>               preco do dia de uma musica (obrigatorio se faltar a musica)',
  '  --preco-tts-entrada=<US$/Mtok> --preco-tts-saida=<US$/Mtok>                   precos do dia da voz',
  '  --preco-transcricao-entrada=<US$/Mtok> --preco-transcricao-saida=<US$/Mtok>   precos do dia da transcricao',
  '  --foto=<caminho>      opcional: so aceito se for igual a "foto" do roteiro, que e a imagem aprovada no gate 1 e a que vai pro Veo (imagem nova entra em "foto" e passa pelo gate 1 de novo)',
  '  --slug=<slug>         pasta do produto em vez do slug da coleta (obrigatorio com --de-espionagem: nome do seu produto, sem marca)',
  '  --producao=<pasta>    raiz das pastas de producao (padrao: producao)',
  '  --modelo-musica=<nome>  modelo de musica, se a descoberta automatica nao achar',
  '  --recoletar           refaz a coleta do ML mesmo ja tendo coleta.json',
  '  --de-espionagem=<arquivo>  coleta de um concorrente: o _raw-concorrentes-*.json da /espionar-concorrente, com --mlb do anuncio dentro dele (a API do ML recusa anuncio de outro vendedor)',
].join('\n')

// Flags que existem. Quem nao esta aqui ABORTA.
const FLAGS_SEM_VALOR = ['dry-run', 'aprovar', 'recoletar', 'autorizado']
const FLAGS_COM_VALOR = [
  'mlb', 'fase', 'foto', 'producao', 'slug', 'modelo-musica',
  'preco-usd', 'preco-musica-usd', 'preco-tts-entrada', 'preco-tts-saida',
  'preco-transcricao-entrada', 'preco-transcricao-saida', 'de-espionagem',
]
const FLAGS_DE_PRECO = FLAGS_COM_VALOR.filter((f) => f.startsWith('preco-'))

// `tem()` comparando argumento EXATO fazia `--dry-run=1`, `--dry-run=true` e
// `--dryrun` passarem sem erro, e a rodada seguia como se fosse de VERDADE. O
// erro de digitacao cai justamente depois do roteiro carimbado, o unico momento
// em que o podeGastar libera. Argumento que a gente nao entende nunca e ignorado.
export function conferirArgumentos(argv) {
  const erros = []
  const lista = `${[...FLAGS_SEM_VALOR.map((f) => `--${f}`), ...FLAGS_COM_VALOR.map((f) => `--${f}=<valor>`)].join(', ')}`
  for (const a of argv) {
    if (!a.startsWith('--')) {
      erros.push(`argumento invalido "${a}": flag se escreve com dois tracos. As que existem: ${lista}`)
      continue
    }
    const [nome, ...resto] = a.slice(2).split('=')
    const temValor = resto.length > 0
    if (FLAGS_SEM_VALOR.includes(nome)) {
      if (temValor) erros.push(`--${nome} nao leva valor, e liga/desliga. Escreva so --${nome} (foi passado "${a}", que o script antigo IGNORAVA em silencio e virava rodada paga de verdade)`)
    } else if (FLAGS_COM_VALOR.includes(nome)) {
      if (!temValor || !resto.join('=')) erros.push(`--${nome} precisa de um valor colado, no formato --${nome}=<valor> (foi passado "${a}")`)
    } else {
      erros.push(`flag desconhecida "${a}". As que existem: ${lista}`)
    }
  }
  return erros
}

function lerJson(caminho) {
  if (!fs.existsSync(caminho)) return null
  try { return JSON.parse(fs.readFileSync(caminho, 'utf8')) }
  catch (e) { throw new Error(`${path.basename(caminho)} nao e JSON valido (${caminho}): ${e.message}`) }
}

// Roda os gates de conteudo em ordem: esqueleto, regras do ML + regra da casa, e
// tamanho de fala. Devolve a lista de erros ja em texto de gente.
export function conferirRoteiro(roteiro) {
  const estrutura = validarEstruturaDoRoteiro(roteiro)
  if (!estrutura.ok) return estrutura.erros

  const erros = [...validarRoteiro(roteiro).erros]
  roteiro.blocos.forEach((b, i) => {
    const v = validarBloco(b.fala)
    if (!v.ok) erros.push(`bloco ${i + 1} (${b.etapa}): ${v.motivo}`)
  })
  return erros
}

// O teto vem da configuracao do projeto; sem o arquivo, o padrao da skill de ML.
function limiteDeGasto(d) {
  try { return d.carregarConfiguracao().limite_gasto_usd } catch (e) {
    const motivo = e.message.split(String.fromCharCode(10))[0]
    if (/^nao existe /.test(e.message)) {
      console.error(`[aviso] ainda nao existe _contexto/mercado-livre.md, entao o teto de gasto usa o padrao de ${usd(PADROES.limite_gasto_usd)}. Essa configuracao vem da /mercado-livre: rode ela pra ajustar o teto.`)
    } else {
      console.error(`[aviso] nao consegui ler limite_gasto_usd da configuracao (${motivo}); usando o padrao de ${usd(PADROES.limite_gasto_usd)}. Rode /mercado-livre pra ajustar.`)
    }
    return PADROES.limite_gasto_usd
  }
}

// Quais modelos a rodada usa, pra quem passa o preco do dia saber qual linha da
// tabela de precos consultar. Os nomes exatos o script descobre pela chave na hora
// de chamar; aqui vai a familia de cada um (as mesmas regras de escolha do codigo).
function modelosDaRodada(roteiro) {
  const tiers = [...new Set(roteiro.blocos.map((b) => tierDoBloco(b)))].join(', ')
  return [
    '[fase 2] modelos que a rodada vai usar (cada um tem a sua linha na tabela de precos):',
    `Veo 3.1 tier ${tiers} (clipe, preco por segundo)`,
    'Gemini Flash TTS (voz, preco por milhao de tokens)',
    'Gemini Flash mais novo que a sua chave enxerga, o que nao e de voz, imagem nem audio ao vivo (transcricao, preco por milhao de tokens)',
    'Lyria Pro (musica, preco por musica)',
  ].join('; ') + '.'
}

const arred = (n) => Math.round(n * 1e4) / 1e4

// Na coleta de concorrente, as fotos sao DELE: foto de terceiro no video fere a
// regra do ML e costuma vir com logo ou texto, que o Veo barra. A imagem do Veo
// e declarada no roteiro (`foto`), aparece no gate 1 e entra no carimbo.
const ehDeEspionagem = (coleta) => coleta?.origem === 'espionagem'
const FOTO_PROPRIA = 'use uma foto do fornecedor ou do seu proprio produto, sem logo e sem texto. A foto do anuncio do concorrente e de terceiro, e usar foto de terceiro fere a regra do Mercado Livre'

// Em qualquer origem, foto declarada tem que existir: o carimbo de uma foto
// ausente guarda impressao digital nula, e aprovar isso nao prova imagem nenhuma.
// Na espionagem a foto e obrigatoria.
function errosDaFoto(roteiro, coleta) {
  if (!roteiro.foto) {
    return ehDeEspionagem(coleta)
      ? [`falta "foto" no roteiro: a coleta veio de um concorrente, entao ${FOTO_PROPRIA}. Escreva o caminho da imagem em "foto" e mostre a imagem no gate 1`]
      : []
  }
  if (!fs.existsSync(roteiro.foto)) return [`"foto" aponta ${roteiro.foto}, que nao existe. Confira o caminho (a partir da pasta do projeto)`]
  return []
}

async function fase1({ mlb, base, slug, a, d }) {
  const arquivoDeEspionagem = a.arg('de-espionagem')
  // o titulo do concorrente traz a marca dele, e a pasta vira o nome do arquivo
  // final: no caminho da espionagem o nome vem do aluno.
  if (arquivoDeEspionagem && !slug) {
    console.error('[uso] com --de-espionagem, passe tambem --slug=<nome do seu produto, sem marca, com hifens> (ex.: --slug=moedor-de-cafe). O titulo do concorrente traz a marca dele e nao serve de nome de pasta.')
    return 2
  }
  let pasta = slug ? path.join(base, slug) : acharPastaDoProduto(base, mlb)
  let coleta = pasta && fs.existsSync(path.join(pasta, 'coleta.json'))
    ? JSON.parse(fs.readFileSync(path.join(pasta, 'coleta.json'), 'utf8')) : null

  if (coleta && arquivoDeEspionagem && !a.tem('recoletar')) {
    console.error(`[fase 1] aviso: estou usando a coleta que ja existe em ${path.join(pasta, 'coleta.json')} e nao li ${arquivoDeEspionagem} de novo. Pra ler o arquivo da espionagem outra vez, acrescente --recoletar.`)
  }

  if (!coleta || a.tem('recoletar')) {
    try { coleta = arquivoDeEspionagem ? d.coletarDeEspionagem(arquivoDeEspionagem, mlb) : await d.coletar(mlb) }
    catch (e) {
      console.error(`[fase 1] nao consegui coletar o anuncio ${mlb}: ${e.message}. Confira o MLB e a conexao com o Mercado Livre (/conectar).`)
      return 1
    }
    if (arquivoDeEspionagem) coleta.slug = slug
    pasta = path.join(base, slug ?? coleta.slug)
    fs.mkdirSync(pasta, { recursive: true })
    fs.writeFileSync(path.join(pasta, 'coleta.json'), JSON.stringify(coleta, null, 2))
    for (const aviso of coleta.avisos ?? []) console.error(`[coleta] aviso: ${aviso}`)
  }
  if (coleta.ehKit && !(coleta.itensDoKit ?? []).length) {
    console.error('[fase 1] aviso: o anuncio e um kit e a coleta nao achou os itens dele: preencha os itens do kit no roteiro (itensDoKit), olhando a pagina do produto.')
  }

  const caminhoRoteiro = path.join(pasta, 'roteiro.json')
  const roteiro = lerJson(caminhoRoteiro)

  // ainda nao existe roteiro: entrega a materia-prima pra escrever no chat
  if (!roteiro) {
    console.log(JSON.stringify({
      mlb: coleta.mlb,
      slug: path.basename(pasta),
      produto: coleta.titulo,
      ehKit: coleta.ehKit,
      itensDoKit: coleta.itensDoKit,
      duvidasMaisRepetidas: (coleta.duvidas ?? []).slice(0, 5),
      queixas: (coleta.queixas ?? []).slice(0, 3),
      elogios: (coleta.elogios ?? []).slice(0, 3),
      fotos: (coleta.fotos ?? []).slice(0, 3),
    }, null, 2))
    if (!(coleta.duvidas ?? []).length) {
      console.error('\n[fase 1] ATENCAO: nao veio nenhuma duvida de cliente. Conferir na pagina do produto antes de aceitar, porque as duvidas repetidas sao o que vira cena.')
    }
    console.error([
      '',
      `[fase 1] Materia-prima coletada em ${path.join(pasta, 'coleta.json')}.`,
      'Agora escreva o roteiro AIDA (4 a 7 blocos de 8s, 30 a 38 silabas cada, duvida repetida vira cena)',
      `e salve em ${caminhoRoteiro}. O roteiro declara tambem voz, musica.estilo, advertencias, marcasProprias e marcasDeTerceiro (listas: [] vale).`,
      'Depois rode esta mesma fase 1 de novo pra validar e gerar o roteiro.md.',
    ].join('\n'))
    return 0
  }

  // roteiro existe: gate de conteudo ANTES de mostrar qualquer coisa pra pessoa
  const erros = conferirRoteiro(roteiro)
  if (!erros.length) erros.push(...errosDaFoto(roteiro, coleta))
  if (erros.length) {
    console.error(`[gate de conteudo] roteiro reprovado (${erros.length}):\n- ${erros.join('\n- ')}`)
    console.error('\nRegras em referencias/regras-clips-ml.md. Consertar o roteiro.json e rodar de novo.')
    return 1
  }

  if (a.tem('aprovar')) {
    roteiro.aprovadoEm = new Date().toISOString()
    // carimba junto a impressao digital do que foi aprovado, senao o carimbo e
    // solto e qualquer edicao posterior passaria batido (ver podeGastar).
    roteiro.aprovadoHash = hashDoRoteiro(roteiro)
    fs.writeFileSync(caminhoRoteiro, JSON.stringify(roteiro, null, 2))
    console.error(`[gate 1] aprovacao carimbada em ${roteiro.aprovadoEm}. A fase 2 ja pode gastar: confira os precos do dia e avise o custo antes.`)
    return 0
  }

  const md = roteiroParaMarkdown(roteiro, { mlb: coleta.mlb })
  const caminhoMd = path.join(pasta, 'roteiro.md')
  fs.writeFileSync(caminhoMd, md)
  console.log(md)
  console.error([
    `[gate de conteudo] roteiro aprovado nas regras do ML e na regra da casa. Texto em ${caminhoMd}.`,
    roteiro.aprovadoEm
      ? `[gate 1] ja aprovado em ${roteiro.aprovadoEm}.`
      : '[gate 1] falta voce aprovar o texto. Depois do sim: --fase=1 --aprovar.',
  ].join('\n'))
  return 0
}

// Acha a pasta do produto pro MLB (ou pelo --slug) e lê coleta e roteiro.
function abrirProduto({ mlb, base, slug, nomeDaFase }) {
  const pasta = slug ? path.join(base, slug) : acharPastaDoProduto(base, mlb)
  if (!pasta || !fs.existsSync(path.join(pasta, 'coleta.json'))) {
    console.error(`[${nomeDaFase}] nao achei coleta.json de ${mlb} em ${base}/*/. Rode a fase 1 primeiro.`)
    return null
  }
  const coleta = lerJson(path.join(pasta, 'coleta.json'))
  const roteiro = lerJson(path.join(pasta, 'roteiro.json'))
  if (!roteiro) { console.error(`[${nomeDaFase}] nao existe roteiro.json em ${pasta}. A fase 1 vem antes.`); return null }
  return { pasta, coleta, roteiro }
}

async function fase2({ mlb, base, slug, a, d, precos }) {
  const aberto = abrirProduto({ mlb, base, slug, nomeDaFase: 'fase 2' })
  if (!aberto) return 1
  const { pasta, coleta, roteiro } = aberto
  const nome = path.basename(pasta)

  // Operacao do Veo que a rodada anterior deixou aberta (o processo morreu no
  // meio): o Google pode ter cobrado. Avisa no comeco e segue.
  const abertas = lerJson(path.join(pasta, '_operacoes-abertas.json')) ?? []
  for (const op of Array.isArray(abertas) ? abertas : []) {
    console.error(`[aviso] a rodada anterior deixou a operacao ${op} aberta no Veo. Ela pode ter sido cobrada; confira no painel do Google antes de refazer.`)
  }

  const erros = conferirRoteiro(roteiro)
  if (erros.length) {
    console.error(`[gate de conteudo] roteiro reprovado (${erros.length}), nao gasto nada:\n- ${erros.join('\n- ')}`)
    return 1
  }

  for (const aviso of avisosDoRoteiro(roteiro)) console.error(`[aviso] ${aviso}`)

  // A foto que vai pro Veo e a aprovada no gate 1 (roteiro.foto), em qualquer
  // origem, e --foto so vale igual a ela. Foto declarada e ausente para aqui,
  // antes de baixar ou gerar qualquer coisa. O conteudo do arquivo entra no
  // carimbo (hashDoRoteiro): trocou a imagem depois do sim, o podeGastar barra.
  // Na coleta de concorrente a foto do anuncio dele nunca vai pro Veo.
  const fotoArg = a.arg('foto')
  if (roteiro.foto) {
    if (fotoArg && path.resolve(fotoArg) !== path.resolve(roteiro.foto)) {
      console.error(`[fase 2] --foto=${fotoArg} nao e a foto aprovada no gate 1 (${roteiro.foto}). Escreva a imagem nova em "foto" no roteiro.json, mostre ela pra pessoa e aprove de novo. Nada foi gasto.`)
      return 2
    }
    if (!fs.existsSync(roteiro.foto)) {
      console.error(`[fase 2] a foto aprovada no gate 1 (${roteiro.foto}) nao existe. Confira o caminho (a partir da pasta do projeto); se a imagem for outra, escreva ela em "foto", mostre pra pessoa e aprove de novo. Nada foi gasto.`)
      return 2
    }
  } else if (fotoArg) {
    console.error(`[fase 2] --foto=${fotoArg} nao passou pelo gate 1: declare a imagem em "foto" no roteiro.json, mostre no gate 1 e aprove de novo. Nada foi gasto.`)
    return 2
  } else if (ehDeEspionagem(coleta)) {
    console.error(`[fase 2] a coleta veio de um concorrente e o roteiro nao declara "foto": ${FOTO_PROPRIA}. Escreva a imagem em "foto" no roteiro.json, mostre no gate 1 e aprove de novo. Nada foi gasto.`)
    return 2
  }

  const dryRun = a.tem('dry-run')
  const liberado = podeGastar(roteiro, { dryRun })
  if (!liberado.ok) { console.error(`[gate 1] ${liberado.motivo}`); return 3 }

  const musica = path.join(pasta, 'musica.mp3')
  const arquivosDoBloco = (i) => ({
    clipe: path.join(pasta, `bloco-${i + 1}.mp4`),
    wav: path.join(pasta, `narracao-${i + 1}.wav`),
  })
  const clipesFaltando = roteiro.blocos.filter((_, i) => !fs.existsSync(arquivosDoBloco(i).clipe)).length
  const narracoesFaltando = roteiro.blocos.filter((b, i) => querNarracaoDoBloco(roteiro, b) && !fs.existsSync(arquivosDoBloco(i).wav)).length
  const blocosComFalta = roteiro.blocos.filter((b, i) => !fs.existsSync(arquivosDoBloco(i).clipe)
    || (querNarracaoDoBloco(roteiro, b) && !fs.existsSync(arquivosDoBloco(i).wav))).length
  const faltaMusica = !fs.existsSync(musica)

  const precisaPagar = clipesFaltando > 0 || narracoesFaltando > 0 || faltaMusica
  const calcularEstimativa = () => {
    const clipes = estimar({ n: clipesFaltando * SEGUNDOS_POR_BLOCO, precoUsd: precos.clipe, limiteUsd: Infinity })
    return arred(clipes.total + (faltaMusica ? precos.musica : 0) + FOLGA_VOZ_USD * blocosComFalta)
  }

  // Precos: fora do dry-run, nada paga sem o preco do dia de cada coisa que vai
  // ser chamada. Falta preco = uso errado (2), antes de abrir qualquer operacao.
  let estimativa = 0
  if (dryRun) console.error(modelosDaRodada(roteiro))
  if (!dryRun) {
    const faltam = []
    if (!precos.clipe) faltam.push('--preco-usd=<US$ por segundo do Veo>')
    if (faltaMusica && !precos.musica) faltam.push('--preco-musica-usd=<US$ por musica>')
    if (narracoesFaltando && !(precos.ttsEntrada && precos.ttsSaida)) faltam.push('--preco-tts-entrada=<US$/Mtok> --preco-tts-saida=<US$/Mtok>')
    if (narracoesFaltando && !(precos.transcricaoEntrada && precos.transcricaoSaida)) faltam.push('--preco-transcricao-entrada=<US$/Mtok> --preco-transcricao-saida=<US$/Mtok>')
    if (faltam.length) {
      console.error(`[fase 2] faltam os precos do dia: ${faltam.join(' ')}. Confira em https://ai.google.dev/gemini-api/docs/pricing e rode de novo. Nada foi gasto.`)
      return 2
    }

    estimativa = calcularEstimativa()
    const limiteUsd = limiteDeGasto(d)
    // o pode ir vale sempre que QUALQUER chamada paga vai rodar, mesmo que a
    // estimativa arredonde pra perto de zero
    if (precisaPagar) {
      const lib = liberarGasto({ totalUsd: estimativa, limiteUsd, autorizado: a.tem('autorizado') })
      if (lib.codigo !== 0) {
        console.log(JSON.stringify({ parou: lib.parou, estimativa_usd: lib.estimativa_usd }))
        console.error(`[fase 2] parei antes de gastar: ${lib.parou}. Estimativa ${usd(estimativa)}.`)
        return 3
      }
    }
    console.log(JSON.stringify({ estimativa_usd: estimativa }))
  } else if (precos.clipe && (!faltaMusica || precos.musica)) {
    // dry-run com os precos: e daqui que sai o custo mostrado no gate 1, com a
    // mesma conta da fase 2 real. Funciona antes do carimbo: nao gera nem chama nada.
    estimativa = calcularEstimativa()
    console.log(JSON.stringify({ estimativa_usd: estimativa, dry_run: true }))
    console.error(`[fase 2] ESTIMATIVA: ${usd(estimativa)} (clipes que faltam, musica se faltar e folga de voz). Nada foi gerado nem gasto.`)
    const limiteUsd = limiteDeGasto(d)
    if (estimativa > limiteUsd) console.error(`[fase 2] ATENCAO: passa do limite_gasto_usd (${usd(limiteUsd)}); a rodada paga vai parar. Divida em partes ou suba o teto.`)
  } else {
    const faltam = []
    if (!precos.clipe) faltam.push('--preco-usd')
    if (faltaMusica && !precos.musica) faltam.push('--preco-musica-usd')
    console.error(`[fase 2] a estimativa nao saiu: falta ${faltam.join(' e ')}. Passe o preco do dia (https://ai.google.dev/gemini-api/docs/pricing) pra ver o custo.`)
  }

  const custoPrevisto = precos.clipe ? `, ~${usd(clipesFaltando * SEGUNDOS_POR_BLOCO * precos.clipe)} de Veo` : ''
  console.error(`[fase 2] ${clipesFaltando} clipe(s) a gerar${custoPrevisto}${dryRun ? ' (DRY-RUN, nao gasta nada)' : ''}.`)

  // imagem de referencia: a foto do roteiro (o --foto, se veio, ja e igual a
  // ela), senao a foto principal do anuncio, baixada uma vez so. Sem clipe a
  // gerar nao se baixa nada: a rodada pode ser so pra completar narracao de
  // bloco cujo clipe ja esta pago.
  const foto = fotoArg ?? roteiro.foto ?? path.join(pasta, 'referencia.jpg')
  console.error(`[fase 2] foto que vai pro Veo: ${foto}`)
  if (clipesFaltando && !fs.existsSync(foto)) {
    if (a.arg('foto')) { console.error(`[fase 2] --foto=${foto} nao existe.`); return 1 }
    if (dryRun) {
      console.error('[fase 2] DRY-RUN: pularia o download da foto de referencia.')
    } else {
      const url = (coleta.fotos ?? [])[0]
      if (!url) { console.error('[fase 2] o anuncio nao tem foto na coleta e nenhum --foto foi passado.'); return 1 }
      let r
      try { r = await fetch(url) }
      catch (e) { console.error(`[fase 2] nao consegui baixar a foto de referencia (${url}): ${e.message}. Aponte uma imagem local com --foto=<caminho>.`); return 1 }
      if (!r.ok) { console.error(`[fase 2] nao consegui baixar a foto de referencia (${url}): HTTP ${r.status}`); return 1 }
      fs.writeFileSync(foto, Buffer.from(await r.arrayBuffer()))
    }
  }

  // Consistencia do ator: o que importa e o PAPEL, nao a posicao. O primeiro
  // bloco com pessoa define quem ela e, e todo bloco com pessoa depois dele parte
  // do ultimo frame desse, senao nasce outra pessoa no meio do video e o clipe
  // pago vai pro lixo. Se so existe um bloco de pessoa, nao ha o que amarrar.
  const indiceAtor = roteiro.blocos.findIndex((b) => b.tipo === 'pessoa')
  const precisaAmarrarAtor = roteiro.blocos.filter((b) => b.tipo === 'pessoa').length > 1
  const ultimoFrame = path.join(pasta, 'ultimo-frame-b1.jpg')

  let total = 0
  for (const [i, bloco] of roteiro.blocos.entries()) {
    const { clipe: saida, wav } = arquivosDoBloco(i)
    const contexto = `video-produto ${nome} bloco-${i + 1}`

    // O reaproveitamento e por ARTEFATO, nao por bloco: se a narracao falhasse
    // depois do clipe salvo e rodar de novo pulasse o bloco inteiro, a unica
    // saida seria apagar o clipe e pagar de novo pela mesma coisa.
    const precisaClipe = !fs.existsSync(saida)
    // vozUnica: o video inteiro fala com a NOSSA voz, inclusive os blocos em que a
    // pessoa aparece. O preco e labio fora de sincronia, entao e escolha declarada
    // no roteiro, nunca padrao silencioso.
    const querNarracao = querNarracaoDoBloco(roteiro, bloco)
    // o que FALTA no disco e uma coisa; o que esta rodada vai fazer e outra. Misturar
    // os dois fazia o dry-run dizer "clipe e narracao prontos" sem wav na pasta.
    const faltaNarracao = querNarracao && !fs.existsSync(wav)
    const precisaNarracao = faltaNarracao && !dryRun
    // o ultimo frame do bloco que define o ator amarra os blocos de pessoa
    // seguintes, e pode faltar mesmo com o clipe salvo (rodada que morreu no meio).
    const precisaFrameDoAtor = precisaAmarrarAtor && i === indiceAtor && !dryRun && !fs.existsSync(ultimoFrame)

    if (!precisaClipe && !precisaNarracao && !precisaFrameDoAtor) {
      console.error(faltaNarracao
        ? `[fase 2] bloco ${i + 1}: clipe salvo, mas falta a narracao, que o DRY-RUN nao gera (rode sem --dry-run pra gerar so ela)`
        : `[fase 2] bloco ${i + 1} ja esta pronto (clipe${querNarracao ? ' e narracao' : ''}), pulando`)
      continue
    }

    if (precisaClipe) {
      const herdaAtor = bloco.tipo === 'pessoa' && i > indiceAtor
      const referencia = (herdaAtor && fs.existsSync(ultimoFrame)) ? ultimoFrame : foto

      let r
      try {
        r = await d.gerarClipe({
          prompt: promptDeClipe(bloco, { ator: roteiro.ator, produto: roteiro.produto, vozUnica: roteiro.vozUnica === true }),
          imagemPath: referencia, segundos: SEGUNDOS_POR_BLOCO, saida, dryRun, tier: tierDoBloco(bloco),
          precoUsdPorSegundo: precos.clipe, registrarCusto: d.registrarCusto, contexto, pastaVideo: pasta,
        })
      } catch (e) {
        console.error(explicarFalhaDoVeo(e))
        console.error(`\n[fase 2] parei no bloco ${i + 1}. Os clipes ja gerados ficam na pasta e nao sao refeitos.`)
        return 1
      }
      total += r.custoUsd
    } else if (precisaNarracao) {
      console.error(`[fase 2] bloco ${i + 1}: o clipe ja esta pago e salvo, gerando so a narracao que faltou (US$ 0,00 de Veo)`)
    }

    // o frame so se extrai do clipe que existe (no dry-run o primeiro nem foi gerado)
    if (precisaFrameDoAtor && fs.existsSync(saida)) {
      if (!precisaClipe) console.error(`[fase 2] bloco ${i + 1}: clipe reaproveitado, tirando o ultimo frame que faltava (e a referencia da pessoa dos blocos seguintes)`)
      const f = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.5', '-i', saida, '-vframes', '1', ultimoFrame], { encoding: 'utf8' })
      if (f.status !== 0) console.error('[fase 2] nao consegui tirar o ultimo frame desse bloco; os blocos de pessoa seguintes vao partir da foto do produto e podem nascer outra pessoa.')
    }

    // blocos de produto sao macro sem rosto: a voz e nossa, no Gemini TTS. Blocos
    // de pessoa ficam com o audio nativo do Veo por causa do lip sync, a menos que
    // o roteiro declare vozUnica.
    if (precisaNarracao) {
      let dito
      try {
        await d.narrar({
          texto: bloco.fala, voz: roteiro.voz, ator: roteiro.ator, saida: wav,
          precos: { entradaUsdMtok: precos.ttsEntrada, saidaUsdMtok: precos.ttsSaida },
          registrarCusto: d.registrarCusto, contexto,
        })
        dito = await d.transcrever(wav, {
          precos: { entradaUsdMtok: precos.transcricaoEntrada, saidaUsdMtok: precos.transcricaoSaida },
          registrarCusto: d.registrarCusto, contexto,
        })
      } catch (e) {
        // wav gravado mas nao conferido (a transcricao falhou) nao pode ficar:
        // a proxima rodada pularia o bloco com uma voz que ninguem ouviu.
        fs.rmSync(wav, { force: true })
        console.error(`[voz] narracao do bloco ${i + 1} falhou: ${e.message}`)
        console.error('[voz] o clipe ja foi pago e esta salvo. Rodar a fase 2 de novo gera SO a narracao que faltou, sem pagar clipe de novo (nao apague o bloco-N.mp4).')
        return 1
      }
      console.error(`[voz] bloco ${i + 1} transcrito: "${dito}"`)
      if (/[[\]]/.test(dito)) console.error('[voz] ATENCAO: parece que o modelo leu marcacao em voz alta. Apagar o wav e regerar esse bloco.')
      // Narracao que nao bate com a fala nao fica na pasta: com o wav la, a
      // proxima rodada pularia o bloco e a fase 3 montaria o audio errado.
      const conf = conferirNarracao(bloco.fala, dito)
      if (!conf.ok) {
        fs.rmSync(wav, { force: true })
        if (conf.proporcaoSobra > TOLERANCIA_DIVERGENCIA_VOZ) console.error(`[voz] bloco ${i + 1}: ${Math.round(conf.proporcaoSobra * 100)}% do que se ouviu nao e da fala (sobrou: ${conf.sobrando.slice(0, 8).join(', ')})`)
        if (conf.faltando.length && conf.proporcaoFalta > TOLERANCIA_DIVERGENCIA_VOZ) console.error(`[voz] bloco ${i + 1}: ${Math.round(conf.proporcaoFalta * 100)}% da fala nao foi dita (faltou: ${conf.faltando.slice(0, 8).join(', ')})`)
        console.error(`[voz] a voz leu algo alem da fala ou deixou fala de fora no bloco ${i + 1}. Apaguei narracao-${i + 1}.wav; nada mais foi gerado. Rode a fase 2 de novo: ela gera so o que falta, sem pagar clipe de novo.`)
        return 1
      }
    }
  }

  // A cama de musica faz parte da fase paga, nao da montagem: ela custa e por
  // isso passa pelo mesmo gate de aprovacao. Reaproveitamento por ARTEFATO, igual
  // ao clipe: se musica.mp3 ja existe, nao gera de novo.
  if (faltaMusica) {
    const segundos = roteiro.blocos.length * SEGUNDOS_POR_BLOCO + 12 // folga pra cortar na montagem
    if (dryRun) {
      console.error(`[fase 2] DRY-RUN: geraria a cama de musica (estilo ${roteiro.musica.estilo}${precos.musica ? `, ${usd(precos.musica)}` : ''}).`)
    } else {
      try {
        const m = await d.gerarMusica({
          estilo: roteiro.musica.estilo, segundos, saida: musica, precoUsd: precos.musica,
          modelo: a.arg('modelo-musica'), registrarCusto: d.registrarCusto, contexto: `video-produto ${nome} musica`,
        })
        total += m.custoUsd
        console.error(`[fase 2] cama de musica gerada (estilo ${roteiro.musica.estilo}, ${usd(m.custoUsd)}).`)
      } catch (e) {
        console.error(`[fase 2] a musica falhou: ${e.message}`)
        console.error('[fase 2] os clipes estao salvos e nao serao refeitos. Rodar a fase 2 de novo gera SO a musica que faltou.')
        return 1
      }
    }
  } else {
    console.error('[fase 2] musica.mp3 ja esta na pasta, nao vou gerar de novo.')
  }

  console.error(`[fase 2] pronto. Clipes e musica desta rodada: ${usd(total)} (voz e transcricao ficam em dados/custos.jsonl).`)
  console.error('[fase 2] proximo passo: --fase=3 pra emendar, legendar e rodar os gates.')
  return 0
}

async function fase3({ mlb, base, slug, a, d, precos }) {
  const aberto = abrirProduto({ mlb, base, slug, nomeDaFase: 'fase 3' })
  if (!aberto) return 1
  const { pasta, roteiro } = aberto
  const nome = path.basename(pasta)

  const erros = conferirRoteiro(roteiro)
  if (erros.length) { console.error(`[gate de conteudo] roteiro reprovado (${erros.length}):\n- ${erros.join('\n- ')}`); return 1 }

  // A montagem e local e gratis, mas o gate de voz transcreve no Gemini, que e
  // chamada PAGA. Chamada paga nao fica fora do gate 1: ou o roteiro esta
  // aprovado, ou roda com --dry-run e o gate de voz e pulado.
  const dryRun = a.tem('dry-run')
  const liberado = podeGastar(roteiro, { dryRun })
  if (!liberado.ok) { console.error(`[gate 1] ${liberado.motivo}`); return 3 }

  if (!dryRun) {
    // a transcricao de um video de ate 1 minuto custa fracoes de centavo: a folga
    // de voz serve de estimativa, e o teto e conferido igual.
    const lib = liberarGasto({ totalUsd: FOLGA_VOZ_USD, limiteUsd: limiteDeGasto(d), autorizado: a.tem('autorizado') })
    if (lib.codigo !== 0) {
      console.log(JSON.stringify({ parou: lib.parou, estimativa_usd: lib.estimativa_usd }))
      console.error(`[fase 3] parei antes de gastar: ${lib.parou}. O gate de voz transcreve o video no Gemini (chamada paga, centavos).`)
      return 3
    }
    if (!(precos.transcricaoEntrada && precos.transcricaoSaida)) {
      console.error('[fase 3] faltam os precos do dia da transcricao: --preco-transcricao-entrada=<US$/Mtok> --preco-transcricao-saida=<US$/Mtok>. Confira em https://ai.google.dev/gemini-api/docs/pricing. Nada foi gasto.')
      return 2
    }
  }

  const blocos = roteiro.blocos.map((b, i) => ({
    arquivo: path.join(pasta, `bloco-${i + 1}.mp4`), fala: b.fala, tipo: b.tipo,
  }))
  const faltando = blocos.filter((b) => !fs.existsSync(b.arquivo)).map((b) => path.basename(b.arquivo))
  if (faltando.length) { console.error(`[fase 3] faltam clipes da fase 2: ${faltando.join(', ')}`); return 1 }

  const narracoes = roteiro.blocos.map((b, i) => {
    const w = path.join(pasta, `narracao-${i + 1}.wav`)
    return querNarracaoDoBloco(roteiro, b) && fs.existsSync(w) ? w : null
  })
  // bloco de produto sem narracao entraria MUDO (o prompt de produto pede "no
  // dialogue") com a legenda por cima dizendo o texto que ninguem falou. O
  // montarVideo tambem barra isso, aqui e pra dizer o que fazer sem gastar nada.
  const semNarracao = roteiro.blocos
    .map((b, i) => (querNarracaoDoBloco(roteiro, b) && !narracoes[i] ? `narracao-${i + 1}.wav` : null))
    .filter(Boolean)
  if (semNarracao.length) {
    console.error(`[fase 3] faltam narracoes: ${semNarracao.join(', ')}`)
    console.error('[fase 3] montar assim entregaria o bloco mudo com a legenda mentindo por cima.')
    console.error('[fase 3] rode a fase 2 de novo: com o clipe ja salvo, ela gera SO a narracao que faltou e nao paga clipe de novo.')
    return 1
  }

  // A montagem sai em _tmp/ e so vai pra final/ depois do gate tecnico E do gate
  // de voz. Assim final/ so tem video liberado pra publicar: dry-run e reprovacao
  // deixam o arquivo em _tmp/, pra inspecionar.
  const trabalho = path.join(pasta, '_tmp')
  const saida = path.join(trabalho, `${nome}.mp4`)
  const pastaFinal = path.join(pasta, 'final')
  const final = path.join(pastaFinal, `${nome}.mp4`)
  // Cama de musica: tem que existir `musica.mp3` na pasta. Ela e GERADA POR NOS,
  // nunca de terceiro: o ML proibe musica de propriedade alheia e e o que mais
  // derruba quem poe trilha de rede social. Todo video leva cama.
  const musica = path.join(pasta, 'musica.mp3')
  if (!fs.existsSync(musica)) {
    console.error('[fase 3] nao achei musica.mp3 na pasta, e a regra da casa e que TODO video leva cama de musica (sem ela o video fica sem animo).')
    console.error('[fase 3] a musica e gerada na fase 2, junto dos clipes. Rode a fase 2 de novo: ela pula o que ja esta pago e gera so a musica que falta.')
    return 1
  }
  console.error('[fase 3] cama de musica na pasta, vai entrar por baixo da narracao.')
  fs.mkdirSync(trabalho, { recursive: true })
  let r
  try {
    r = await d.montarVideo({ blocos, narracoes, saida, musica, advertencias: roteiro.advertencias ?? [], trabalho })
  } catch (e) {
    // Tudo isso acontece DEPOIS dos clipes ja pagos (ffmpeg falhando, clipe
    // corrompido, resolucao ilegivel, legenda que nao coube nem no nivel mais
    // apertado). Sair com stack trace aqui e o pior momento possivel, entao o
    // recado diz o que fazer e lembra que os clipes estao salvos.
    console.error(`[fase 3] a montagem falhou: ${e.message}`)
    console.error([
      '',
      'Os clipes da fase 2 JA ESTAO PAGOS e salvos na pasta, entao a fase 3 pode ser rodada de novo quantas vezes precisar SEM gastar de novo com clipe.',
      'O que costuma causar isso:',
      '  - clipe corrompido ou incompleto: apagar so o bloco-N.mp4 culpado e regerar ele na fase 2',
      '  - ffmpeg ou ffprobe fora do PATH: conferir com "ffmpeg -version" (o /configurar-video instala)',
      '  - legenda que nao coube na zona segura nem no nivel mais apertado: encurtar a fala desse bloco no roteiro (e re-aprovar, porque mexer no texto derruba o carimbo)',
      `Arquivos de trabalho pra inspecionar: ${trabalho}`,
    ].join('\n'))
    return 1
  }
  if (!r.ok) {
    console.error(`[gate tecnico] reprovado:\n- ${r.erros.join('\n- ')}`)
    console.error('Regras em referencias/regras-clips-ml.md. Conserte o bloco culpado e rode a fase 3 de novo.')
    return 1
  }
  console.error(`[gate tecnico] aprovado. Legenda corpo ${r.legenda.corpo}, ${r.legenda.resumo}.`)
  console.error(`[legenda] alinhada com a duracao medida de cada bloco: ${r.duracoes.map((x) => `${x.toFixed(2)}s`).join(' + ')}.`)

  if (dryRun) {
    console.error([
      `[voz] DRY-RUN: gate de voz PULADO (a transcricao e chamada paga). O arquivo saiu em ${saida}, fora de final/ porque nao passou no gate de voz.`,
      '[voz] NAO PUBLICAR assim: sem o gate de voz nao tem prova de que a legenda bate com o que se ouve.',
      `[voz] Rode a fase 3 sem --dry-run pra fechar. Saindo com codigo ${SAIDA_INCOMPLETA} (incompleto), nao 0.`,
    ].join('\n'))
    // nao e sucesso: ficou um video na pasta que nenhum gate de voz olhou.
    return SAIDA_INCOMPLETA
  }

  // Gate de voz no video inteiro: o Veo pode improvisar a fala dos blocos com
  // rosto, e ai a legenda (que sai do roteiro) fica mentindo. O transcrever so
  // aceita WAV, entao extrai o audio antes em vez de mandar o mp4 com mime errado.
  const wav = path.join(trabalho, 'final-audio.wav')
  const ext = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', saida, '-vn', '-ac', '1', '-ar', '24000', wav], { encoding: 'utf8', timeout: 600000 })
  if (ext.status !== 0) {
    const porque = ext.signal ? `o ffmpeg passou de 10 minutos e foi interrompido (maquina carregada?), rode a fase 3 de novo` : (ext.stderr || '').slice(-300)
    console.error(`[voz] nao consegui extrair o audio do video pra conferir: ${porque}`)
    return 1
  }

  let dito
  try {
    dito = await d.transcrever(wav, {
      precos: { entradaUsdMtok: precos.transcricaoEntrada, saidaUsdMtok: precos.transcricaoSaida },
      registrarCusto: d.registrarCusto, contexto: `video-produto ${nome} gate-de-voz`,
    })
  } catch (e) {
    console.error(`[voz] o video saiu em ${saida} e passou no gate tecnico, MAS o gate de voz nao rodou: ${e.message}`)
    console.error('[voz] por isso ele ficou fora de final/. Rode a fase 3 de novo pra fechar o gate de voz antes de publicar.')
    return 1
  }

  // conferencia BLOCO A BLOCO: no video inteiro, um bloco perdido some na media
  // e passava na tolerancia global.
  const conf = conferirVozPorBloco(roteiro.blocos, dito)
  if (!conf.ok) {
    for (const p of conf.piores) {
      console.error(`[voz] bloco ${p.bloco}: ${Math.round(p.proporcao * 100)}% das palavras do roteiro nao foram ditas (faltou: ${p.faltando.slice(0, 8).join(', ')})`)
    }
    console.error('[voz] o que se ouviu no video inteiro: ' + dito.slice(0, 300))
    console.error('[voz] ou regera o bloco apontado, ou ajusta a legenda pra bater com o que se ouve. NAO publicar com legenda mentindo.')
    console.error(`[voz] o video reprovado ficou em ${saida}, fora de final/.`)
    return 1
  }

  fs.mkdirSync(pastaFinal, { recursive: true })
  fs.renameSync(saida, final)
  console.error([
    '',
    `[fase 3] ${final} aprovado nos dois gates tecnicos.`,
    '',
    'Gate 2: mostrar o video pra voce. Aprovado, o upload e NA MAO, pelo computador:',
    '  Central de Vendedores > Marketing > Clips > "Enviar um video"',
    '  A tela pede o arquivo (max 280 MB) e o link do anuncio.',
    'Nao existe API de Clips, entao nao da pra automatizar esse passo hoje.',
  ].join('\n'))
  return 0
}

const DEPS_PADRAO = {
  coletar, coletarDeEspionagem, gerarClipe, narrar, transcrever, gerarMusica, montarVideo, registrarCusto, carregarConfiguracao,
}

// `deps` troca as pecas pagas por falsas nos testes; no CLI vale o padrao.
export async function main(argv = process.argv.slice(2), deps = {}) {
  const d = { ...DEPS_PADRAO, ...deps }
  const errosDeUso = conferirArgumentos(argv)
  if (errosDeUso.length) {
    console.error(`[uso] nao rodei nada, tem argumento que eu nao entendo:\n- ${errosDeUso.join('\n- ')}\n`)
    console.error(USO)
    return 2
  }

  const a = {
    arg: (n, padrao) => {
      const x = argv.find((v) => v.startsWith(`--${n}=`))
      return x ? x.slice(n.length + 3) : padrao
    },
    tem: (n) => argv.includes(`--${n}`),
  }

  // Preco e numero positivo ou nao e preco: erro de digitacao nao vira gasto.
  const numeros = {}
  for (const f of FLAGS_DE_PRECO) {
    const bruto = a.arg(f)
    if (bruto === undefined) continue
    const n = Number(String(bruto).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      console.error(`[uso] --${f}=${bruto} nao e um numero maior que zero. Passe o preco do dia em dolar, com ponto (ex.: --${f}=0.05).`)
      return 2
    }
    numeros[f] = n
  }
  const precos = {
    clipe: numeros['preco-usd'],
    musica: numeros['preco-musica-usd'],
    ttsEntrada: numeros['preco-tts-entrada'],
    ttsSaida: numeros['preco-tts-saida'],
    transcricaoEntrada: numeros['preco-transcricao-entrada'],
    transcricaoSaida: numeros['preco-transcricao-saida'],
  }

  const mlb = a.arg('mlb')
  const fase = Number(a.arg('fase', '1'))
  const base = a.arg('producao', path.join(RAIZ, 'producao'))
  const slug = a.arg('slug')
  if (!mlb || ![1, 2, 3].includes(fase)) { console.error(USO); return 2 }

  const ctx = { mlb, base, slug, a, d, precos }
  if (fase === 1) return fase1(ctx)
  if (fase === 2) return fase2(ctx)
  return fase3(ctx)
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  process.exitCode = await main()
}
