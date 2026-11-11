// Leitor do arquivo de permissao: o bloco ```autonomia``` de _contexto/autonomia.md (5.52, chat 3).
// So le texto, nunca toca em disco; quem le o arquivo passa o texto. Molde do bloco ```orcamento``` do
// orcamento.mjs: pares chave: valor. Aqui cada registro comeca numa linha `area: <nome>` e leva as linhas
// seguintes ate o proximo `area:`; a ULTIMA vez que a area aparece vale, o registro inteiro (nao mistura campos).
//
// CONTRATO (quem consome, como o liberarGasto da 3b, le isto):
// - Area ausente de `areas` = sem permissao: o kit pede o "pode ir" de sempre. O leitor nunca lanca e nunca
//   barra um gasto que tem o sim explicito.
// - Dois tipos de defeito. ESTRUTURAL (linha-ilegivel, campo-sem-area, campo-repetido, bloco-aberto,
//   bloco-repetido): o arquivo inteiro vira vazio, todas as areas somem, o kit pede de novo. De VALIDACAO
//   dentro de um registro (teto-invalido, acao-invalida e afins): so aquela area some. Registro final
//   quebrado derruba a area mesmo havendo um bom antes dele.
// - Valor vazio conta como presente. `pode:` vazio = permissao tirada (entrada com pode: []). Campo repetido
//   no mesmo registro e defeito estrutural. Os outros campos vazios (teto, por_vez, definido_em, definido_por,
//   frase) valem como ausentes.
// - Acoes fechadas: gasto-ia e verba-* = ['gastar']; apagar = ['apagar']; anuncio-ml = decidir, fotos,
//   criar-pausado; atendimento-ml = responder-pergunta.
// - Area de dinheiro (gasto-ia, verba-*) com `pode` nao vazio EXIGE `teto` ("valor MOEDA periodo", ex.: 20 USD mes).
//   gasto-ia aceita so USD (o codigo compara em dolar; o valor em reais vai so na `frase`); verba-* aceita so BRL
//   (o cofrinho da verba e em reais; um "10 USD mes" seria lido como R$ 10).
//   `por_vez` usa a moeda do teto e nao pode passar do teto. `definido_em` e data real AAAA-MM-DD.
// - Area de nao-dinheiro nao leva teto nem por_vez. trafego e mercado-ads nunca recebem `pode`.
//
// lerAutonomia(texto) devolve:
//   { areas: { [area]: { area, pode: string[], teto: {valor, moeda, periodo} | null, por_vez: number | null,
//                         definido_em: string | null, definido_por: string | null, frase: string | null } },
//     problemas: [{ area: string | null, codigo: string, mensagem: string }] }

export const AREAS_AUTONOMIA = ['gasto-ia', 'verba-meta', 'verba-google', 'verba-ml-ads', 'anuncio-ml', 'atendimento-ml', 'apagar']
// areas de dinheiro: so elas aceitam teto e por_vez
export const AREAS_DE_DINHEIRO = ['gasto-ia', 'verba-meta', 'verba-google', 'verba-ml-ads']
// areas que existem como nome mas nunca recebem permissao escrita (decisoes 6 e 7 do plano)
export const AREAS_SEM_PERMISSAO = ['trafego', 'mercado-ads']
export const ACOES_POR_AREA = {
  'gasto-ia': ['gastar'],
  'verba-meta': ['gastar'],
  'verba-google': ['gastar'],
  'verba-ml-ads': ['gastar'],
  apagar: ['apagar'],
  'anuncio-ml': ['decidir', 'fotos', 'criar-pausado'],
  'atendimento-ml': ['responder-pergunta'],
}
export const MOEDAS_AUTONOMIA = ['USD', 'BRL']
export const PERIODOS_AUTONOMIA = ['dia', 'semana', 'mes']
const CAMPOS = new Set(['area', 'pode', 'teto', 'por_vez', 'definido_em', 'definido_por', 'frase'])

const problema = (area, codigo, mensagem) => ({ area, codigo, mensagem })
const numero = (s) => {
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function dataReal(s) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

function validar(reg) {
  const area = reg.area
  if (AREAS_SEM_PERMISSAO.includes(area)) {
    if ((reg.pode ?? '').trim() !== '') return { erro: problema(area, 'area-recusada', `a area ${area} nunca recebe permissao escrita; o kit continua pedindo`) }
    return { vazio: true }
  }
  if (!AREAS_AUTONOMIA.includes(area)) {
    return { erro: problema(area, 'area-desconhecida', `a area "${area}" nao esta na lista (${AREAS_AUTONOMIA.join(', ')}); a permissao some e o kit pede de novo`) }
  }
  const pode = (reg.pode ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const permitidas = ACOES_POR_AREA[area]
  for (const acao of pode) {
    if (!permitidas.includes(acao)) {
      return { erro: problema(area, 'acao-invalida', `a acao "${acao}" nao vale na area ${area} (valem ${permitidas.join(', ')})`) }
    }
  }
  const dinheiro = AREAS_DE_DINHEIRO.includes(area)
  const temTeto = reg.teto !== undefined && reg.teto !== ''
  const temPorVez = reg.por_vez !== undefined && reg.por_vez !== ''
  let teto = null
  if (temTeto) {
    if (!dinheiro) return { erro: problema(area, 'teto-fora-de-dinheiro', `a area ${area} nao e de dinheiro e nao leva teto`) }
    const m = reg.teto.trim().match(/^(\S+)\s+(\S+)\s+(\S+)$/)
    const valor = m && numero(m[1])
    const moeda = m && m[2].toUpperCase()
    const periodo = m && m[3].toLowerCase()
    const moedas = area === 'gasto-ia' ? ['USD'] : ['BRL']
    if (!m || valor === null || !(valor > 0) || !moedas.includes(moeda) || !PERIODOS_AUTONOMIA.includes(periodo)) {
      return { erro: problema(area, 'teto-invalido', `o teto da area ${area} precisa ser "valor moeda periodo" (ex.: 20 USD mes; moeda ${moedas.join(' ou ')}, periodo ${PERIODOS_AUTONOMIA.join(', ')}), e veio "${reg.teto}"`) }
    }
    teto = { valor, moeda, periodo }
  }
  if (dinheiro && pode.length > 0 && !teto) {
    return { erro: problema(area, 'teto-faltando', `a area ${area} e de dinheiro e a permissao precisa de teto (ex.: teto: 20 USD mes)`) }
  }
  let por_vez = null
  if (temPorVez) {
    if (!dinheiro) return { erro: problema(area, 'por-vez-fora-de-dinheiro', `a area ${area} nao e de dinheiro e nao leva por_vez`) }
    por_vez = numero(reg.por_vez.trim())
    if (por_vez === null || !(por_vez > 0)) {
      return { erro: problema(area, 'por-vez-invalido', `o por_vez da area ${area} precisa ser um numero maior que zero, e veio "${reg.por_vez}"`) }
    }
    if (teto && por_vez > teto.valor) {
      return { erro: problema(area, 'por-vez-acima-do-teto', `o por_vez (${por_vez}) da area ${area} passa do teto (${teto.valor} ${teto.moeda})`) }
    }
  }
  if (reg.definido_em !== undefined && reg.definido_em !== '' && !dataReal(reg.definido_em)) {
    return { erro: problema(area, 'data-invalida', `o definido_em da area ${area} precisa ser uma data real AAAA-MM-DD, e veio "${reg.definido_em}"`) }
  }
  const ou = (v) => (v === undefined || v === '' ? null : v)
  return {
    entrada: { area, pode, teto, por_vez, definido_em: ou(reg.definido_em), definido_por: ou(reg.definido_por), frase: ou(reg.frase) },
  }
}

export function lerAutonomia(texto) {
  const areas = {}
  const problemas = []
  const t = String(texto ?? '')
  // a abertura tambem so vale como linha propria: citar ```autonomia no meio de uma frase nao abre bloco
  const abre = /^[ \t]*```autonomia[ \t]*\r?\n/m.exec(t)
  if (!abre) return { areas, problemas }
  const resto = t.slice(abre.index + abre[0].length)
  // o fecho so vale como linha propria (so ```, com espaco em volta); ```autonomia dentro do bloco nao fecha nada
  const fecho = /^[ \t]*```[ \t]*\r?$/m.exec(resto)
  if (!fecho) {
    problemas.push(problema(null, 'bloco-aberto', 'o bloco `autonomia` nao fecha; todas as permissoes somem e o kit pede de novo'))
    return { areas, problemas }
  }
  let estrutural = false
  const falha = (area, codigo, mensagem) => { estrutural = true; problemas.push(problema(area, codigo, mensagem)) }
  const corpo = resto.slice(0, fecho.index)
  if (/^[ \t]*```/m.test(corpo)) {
    falha(null, 'bloco-aberto', 'ha uma cerca ``` com texto dentro do bloco `autonomia` (o primeiro nao fechou); todas as permissoes somem e o kit pede de novo')
  }
  if (/^[ \t]*```autonomia[ \t]*\r?\n/m.test(resto.slice(fecho.index + fecho[0].length))) {
    falha(null, 'bloco-repetido', 'o arquivo tem dois blocos `autonomia`; todas as permissoes somem e o kit pede de novo')
  }
  const registros = []
  let atual = null
  for (const linha of corpo.split(/\r?\n/)) {
    if (linha.trim() === '') continue
    const par = linha.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i)
    if (!par) {
      falha(atual ? atual.area : null, 'linha-ilegivel', `linha sem "chave: valor": "${linha.trim()}"; todas as permissoes somem e o kit pede de novo`)
      continue
    }
    const chave = par[1].toLowerCase()
    if (chave === 'area') {
      atual = { area: par[2].toLowerCase(), campos: {} }
      registros.push(atual)
      continue
    }
    if (!atual) {
      falha(null, 'campo-sem-area', `o campo "${chave}" veio antes de qualquer "area:"; todas as permissoes somem e o kit pede de novo`)
      continue
    }
    if (!CAMPOS.has(chave)) {
      problemas.push(problema(atual.area, 'campo-desconhecido', `o campo "${chave}" da area ${atual.area} nao existe`))
      atual.invalido = true
      continue
    }
    if (Object.hasOwn(atual.campos, chave)) {
      falha(atual.area, 'campo-repetido', `o campo "${chave}" aparece duas vezes na area ${atual.area}; todas as permissoes somem e o kit pede de novo`)
      continue
    }
    atual.campos[chave] = par[2]
  }
  if (estrutural) return { areas, problemas }
  // a ultima vez que a area aparece vale; ela decide sozinha, quebrada ou nao
  const ultimo = new Map()
  for (const r of registros) ultimo.set(r.area, r)
  for (const [area, r] of ultimo) {
    if (r.invalido) continue
    const v = validar({ ...r.campos, area })
    if (v.erro) { problemas.push(v.erro); continue }
    if (v.vazio) continue
    areas[area] = v.entrada
  }
  return { areas, problemas }
}
