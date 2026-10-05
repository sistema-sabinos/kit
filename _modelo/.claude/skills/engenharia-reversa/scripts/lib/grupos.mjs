// Campeao e controle: quem vende muito e quem vende pouco do MESMO produto.
// A comparacao so vale se o controle for de verdade o mesmo tipo de produto vendendo pouco.
// Por isso as travas abaixo (receita, teto de vendas, faixa de preco, numero do titulo), e
// o que nao der pra cumprir vira texto no relatorio, nunca trava afrouxada em silencio.
// Receita, e nao vendas: produto de R$ 20 com 500 vendas e de R$ 90 com 200 sao negocios
// diferentes. Quem manda e preco vezes vendas.

export const CAMPEOES_POR_RODADA = 10
export const CONTROLE_POR_RODADA = 10
export const FRACAO_CONTROLE = 0.1
export const CONTROLE_VENDAS_MAX = 200
export const CONTROLE_PRECO_MIN_FATOR = 0.5
export const CONTROLE_PRECO_MAX_FATOR = 2

const ehNum = v => typeof v === 'number' && Number.isFinite(v)

export function receitaEstimada(a) {
  return (ehNum(a?.preco) ? a.preco : 0) * (ehNum(a?.vendidos) ? a.vendidos : 0)
}

export function mediana(valores) {
  const r = valores.filter(ehNum).sort((x, y) => x - y)
  if (!r.length) return null
  const meio = Math.floor(r.length / 2)
  return r.length % 2 ? r[meio] : (r[meio - 1] + r[meio]) / 2
}

// Sorteio com semente fixa: a mesma busca da o mesmo controle, e o teste nao vira loteria.
export function embaralhadorFixo(semente = 'engenharia-reversa') {
  return lista => {
    let estado = 0
    for (const ch of String(semente)) estado = (estado * 31 + ch.charCodeAt(0)) >>> 0
    const proximo = () => { estado = (estado * 1664525 + 1013904223) >>> 0; return estado / 0x100000000 }
    const copia = [...lista]
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(proximo() * (i + 1))
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
    }
    return copia
  }
}

// O numero do titulo e a especificacao em muito nicho (80 cores, 60 capsulas, 500 ml): kit de
// 12 e kit de 80 custam parecido e sao produtos diferentes.
export function numerosDoTitulo(titulo) {
  return [...String(titulo ?? '').matchAll(/\d{1,4}/g)].map(m => Number(m[0]))
}

// A especificacao da rodada e o numero que a maioria dos campeoes carrega.
export function especificacaoDosCampeoes(campeoes, { minFracao = 0.5 } = {}) {
  const titulos = campeoes.map(c => c?.titulo).filter(Boolean)
  if (!titulos.length) return []
  const conta = new Map()
  for (const t of titulos) for (const n of new Set(numerosDoTitulo(t))) conta.set(n, (conta.get(n) ?? 0) + 1)
  return [...conta].filter(([, n]) => n >= titulos.length * minFracao).map(([v]) => v).sort((a, b) => a - b)
}

// Titulo sem numero passa: falta de numero nao prova produto diferente.
export function especCompativel(titulo, especificacao) {
  if (!especificacao?.length) return true
  const nums = new Set(numerosDoTitulo(titulo))
  return !nums.size || especificacao.some(n => nums.has(n))
}

export function separarGrupos(anuncios, {
  nCampeoes = CAMPEOES_POR_RODADA, nControle = CONTROLE_POR_RODADA, fracaoControle = FRACAO_CONTROLE,
  vendasMax = CONTROLE_VENDAS_MAX, precoMinFator = CONTROLE_PRECO_MIN_FATOR, precoMaxFator = CONTROLE_PRECO_MAX_FATOR,
  embaralhar = embaralhadorFixo(),
} = {}) {
  const ordenados = [...anuncios].sort((x, y) => receitaEstimada(y) - receitaEstimada(x))
  // Campeao precisa ter vendido alguma coisa: receita zero no topo e falta de dado, nao campeao.
  const campeoes = ordenados.filter(x => receitaEstimada(x) > 0).slice(0, nCampeoes).map(x => ({ ...x, grupo: 'campeao' }))
  const tetoReceita = (mediana(campeoes.map(receitaEstimada)) ?? 0) * fracaoControle
  const precoMediano = mediana(campeoes.map(c => c.preco))
  const faixaPreco = precoMediano ? { min: precoMediano * precoMinFator, max: precoMediano * precoMaxFator } : null
  const especificacao = especificacaoDosCampeoes(campeoes)
  const ids = new Set(campeoes.map(c => c.id))
  const descartados = { receita_alta: 0, vendas_desconhecidas: 0, vendas_altas: 0, fora_da_faixa_de_preco: 0, especificacao_diferente: 0 }
  const elegiveis = ordenados.filter(x => {
    if (ids.has(x.id)) return false
    // venda null e "o selo nao apareceu", nunca "nao vende": fica fora e e contada
    if (!ehNum(x?.vendidos)) { descartados.vendas_desconhecidas++; return false }
    if (receitaEstimada(x) > tetoReceita) { descartados.receita_alta++; return false }
    if (x.vendidos > vendasMax) { descartados.vendas_altas++; return false }
    if (faixaPreco && (!ehNum(x.preco) || x.preco < faixaPreco.min || x.preco > faixaPreco.max)) { descartados.fora_da_faixa_de_preco++; return false }
    if (!especCompativel(x.titulo, especificacao)) { descartados.especificacao_diferente++; return false }
    return true
  })
  const controle = embaralhar(elegiveis).slice(0, nControle).map(x => ({ ...x, grupo: 'controle' }))
  return {
    campeoes,
    controle,
    diagnostico: {
      pedidos: nControle,
      elegiveis: elegiveis.length,
      sorteados: controle.length,
      teto_receita: tetoReceita,
      teto_vendas: vendasMax,
      faixa_preco: faixaPreco,
      especificacao,
      // campeao nao sai por criterio tirado dos proprios campeoes, mas fica nomeado
      campeoes_fora_da_especificacao: campeoes.filter(c => !especCompativel(c.titulo, especificacao)).map(c => ({ id: c.id, titulo: c.titulo })),
      descartados,
      restricao_nao_cumprida: controle.length < nControle,
    },
  }
}

// Maioria dos campeoes em pagina de catalogo (/p/) = a rodada explica o PRODUTO: la a foto e
// a mesma pra todo vendedor e a briga e preco e reputacao.
export function composicao(campeoes, controle) {
  const conta = lista => ({
    catalogo: lista.filter(x => x.tipo === 'catalogo').length,
    produto: lista.filter(x => x.tipo === 'produto').length,
    tradicional: lista.filter(x => x.tipo === 'tradicional').length,
    desconhecido: lista.filter(x => !x.tipo).length,
    total: lista.length,
  })
  const c = conta(campeoes)
  return { campeoes: c, controle: conta(controle), escopo: c.total && c.catalogo > c.total / 2 ? 'produto' : 'anuncio' }
}
