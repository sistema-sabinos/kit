// Duvidas de cliente que nenhum concorrente responde. Foi a saida mais util do motor de
// origem, e as regras abaixo nasceram de tres defeitos que ele teve com dado real:
// 1. palavra solta (como "produto") fechava qualquer pergunta: agora a duvida so conta como
//    respondida se UM concorrente cobre 60% das palavras dela;
// 2. palavras espalhadas por descricoes diferentes se somavam: agora e corpus por concorrente;
// 3. "consigo escolher as cores?" e "posso escolher as cores das canecas?" contavam
//    separado: agora variacoes se agrupam por sobreposicao sobre o menor conjunto.
// So entra pergunta lida um elemento por vez da pagina ({ pergunta: texto }). Texto fatiado
// da pagina inteira ja fez rodape do site virar objecao validada; aqui ele nem entra.

export const COBERTURA_MIN = 0.6
export const SOBREPOSICAO_MIN = 0.6
export const MIN_OCORRENCIAS_VALIDADA = 2

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')
export const normalizar = t => String(t ?? '').toLowerCase().normalize('NFD').replace(DIACRITICOS, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'a', 'o', 'as', 'os', 'para', 'pra', 'com', 'sem', 'em', 'no', 'na', 'nos', 'nas', 'por', 'um', 'uma', 'que', 'ao'])
// Interrogativa, modal e cortesia nao sao assunto da pergunta.
const VAZIAS_PERGUNTA = new Set([
  'qual', 'quais', 'quando', 'onde', 'quanto', 'quantos', 'quantas', 'como', 'porque', 'cade',
  'posso', 'pode', 'podem', 'poderia', 'consigo', 'consegue', 'seria', 'tenho', 'temos', 'teria',
  'esta', 'este', 'esse', 'essa', 'isso', 'isto', 'aquele', 'aquela',
  'boa', 'bom', 'tarde', 'noite', 'ola', 'obrigado', 'obrigada', 'favor', 'gostaria', 'queria', 'quero',
  'voces', 'vcs', 'muito', 'mais', 'menos', 'tambem', 'ainda', 'entao', 'agora', 'sempre', 'nunca',
  'algum', 'alguma', 'alguns', 'algumas', 'todos', 'todas', 'coisa',
])
// Palavra curta que e assunto de verdade no marketplace.
const CURTOS = new Set(['dor', 'gel', 'po', 'uv', 'ml', 'kg', 'cor', 'led', 'usb', 'bpa'])

export function palavrasDeConteudo(texto) {
  return [...new Set(normalizar(texto).split(' ').filter(p => p && !VAZIAS.has(p) && !VAZIAS_PERGUNTA.has(p) && (p.length > 3 || CURTOS.has(p))))]
}

// Abertura de pergunta escrita sem "?". Copula (e, sao) fica fora de proposito: abre elogio
// na mesma medida ("Sao otimas, amei").
const ABERTURA = /^(quem|qual|quais|quando|quanto|quanta|quantos|quantas|como|onde|porque|por que|pq|tem|teria|serve|serviria|da|daria|vem|viria|cabe|caberia|pode|poderia|posso|consegue|conseguiria|aceita|aceitaria|envia|enviaria|entrega|entregaria|funciona|funcionaria|precisa|precisaria|faz|faria|dura|duraria|emite|emitiria|manda|mandaria|vcs|voces|gostaria|queria|quero|preciso)\b/
const CUMPRIMENTO = /^(ola|oi|opa|bom dia|boa tarde|boa noite|boa|prezados?|por favor|pfv|desculpa|desculpe)[\s,.!:;-]*/

// Erra pro lado de aceitar: elogio a mais e visivel e barato; objecao perdida some pra sempre.
export function pareceUmaPergunta(texto) {
  if (typeof texto !== 'string') return false
  const limpo = texto.trim()
  if (limpo.length < 5) return false
  if (limpo.includes('?')) return true
  let miolo = normalizar(limpo)
  for (let i = 0; i < 2; i++) miolo = miolo.replace(CUMPRIMENTO, '')
  return ABERTURA.test(miolo)
}

export function mesmaObjecao(a, b) {
  if (!a.length || !b.length) return false
  const emB = new Set(b)
  const comuns = a.filter(p => emB.has(p)).length
  if (comuns < Math.min(2, a.length, b.length)) return false
  return comuns / Math.min(a.length, b.length) >= SOBREPOSICAO_MIN
}

const estruturais = a => (Array.isArray(a?.perguntas) ? a.perguntas : []).filter(q => typeof q?.pergunta === 'string')

// Corpus de UM concorrente: descricao mais o texto que aparece nas fotos dele (com --ver).
const corpusDe = a => new Set(normalizar(`${a?.descricao ?? ''} ${(a?.textos_fotos ?? []).join(' ')}`).split(' ').filter(Boolean))

export function objecoesNaoRespondidas(anuncios) {
  const grupos = []
  for (const a of anuncios) {
    const vistos = new Set()
    for (const { pergunta } of estruturais(a)) {
      if (!pareceUmaPergunta(pergunta)) continue
      const chaves = palavrasDeConteudo(pergunta)
      if (!chaves.length) continue
      let g = grupos.find(x => mesmaObjecao(chaves, x.chaves))
      if (!g) { g = { texto: pergunta.trim(), chaves, variacoes: [], anuncios: 0, ocorrencias: 0 }; grupos.push(g) }
      g.ocorrencias++
      if (!g.variacoes.includes(pergunta.trim())) g.variacoes.push(pergunta.trim())
      if (!vistos.has(g)) { g.anuncios++; vistos.add(g) }
    }
  }
  const corpora = anuncios.map(corpusDe)
  const respondida = g => corpora.some(c => {
    const cobertas = g.chaves.filter(p => c.has(p)).length
    return cobertas >= Math.min(2, g.chaves.length) && cobertas / g.chaves.length >= COBERTURA_MIN
  })
  return grupos.filter(g => !respondida(g))
    .map(({ texto, variacoes, anuncios: n, ocorrencias }) => ({ texto, variacoes, anuncios: n, ocorrencias, validada: ocorrencias >= MIN_OCORRENCIAS_VALIDADA }))
    .sort((x, y) => Number(y.validada) - Number(x.validada) || y.ocorrencias - x.ocorrencias || y.anuncios - x.anuncios)
}

// Sobre quantos concorrentes a lista foi montada, e quais voltaram sem pergunta.
export function coberturaDePerguntas(anuncios) {
  const sem = anuncios.filter(a => !estruturais(a).length)
  return {
    anuncios: anuncios.length,
    com_perguntas: anuncios.length - sem.length,
    perguntas: anuncios.reduce((n, a) => n + estruturais(a).length, 0),
    sem_perguntas: sem.map(a => a.id ?? null),
  }
}
