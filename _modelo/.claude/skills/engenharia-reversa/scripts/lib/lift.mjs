// Nada vira achado sem passar pelo contraste campeao contra controle. Se todo anuncio do
// nicho usa fundo branco, fundo branco nao explica venda nenhuma: e obrigacao da categoria.
// Numeros portados de um motor que ja rodou com dado real; nao mexer sem dado novo.

export const LIFT_MIN = 1.8
export const LIFT_ANTI = 1 / LIFT_MIN
export const AMOSTRA_MIN = 8
export const CAMPEOES_MIN = 3
export const CONTROLE_MIN = 3
export const FREQ_MIN = 0.2
// Infinity vira null no JSON, e null aqui quer dizer "nao deu pra apurar". So campeao fazendo
// e o sinal mais forte que existe, entao vira um numero ordenavel mais a flag.
export const LIFT_SO_CAMPEOES = 999
export const DECISIVOS = ['regra', 'anti-padrao', 'custo-de-entrada']

// Maioria estrita: empate nao e maioria. Com 5 testes, exige 3; com 10, exige 6.
export const exigeMaioria = total => Math.floor(total / 2) + 1

// Teste que lanca excecao e bug, e conta separado: zero e achado, erro e defeito do codigo.
export function medir(itens, teste) {
  let contagem = 0
  let erros = 0
  for (const x of itens) { try { if (teste(x)) contagem++ } catch { erros++ } }
  return { contagem, erros, total: itens.length, freq: itens.length ? contagem / itens.length : 0 }
}

export function calcularLift(freqCampeoes, freqControle) {
  if (freqControle === 0) return freqCampeoes === 0 ? 0 : Infinity
  return freqCampeoes / freqControle
}

// Cada lado so sustenta veredito com frequencia E contagem acima do piso do seu grupo.
export function classificar({ freqCampeoes, freqControle, amostra, numCampeoesFazendo = 0, numControleFazendo = 0 }) {
  if (amostra < AMOSTRA_MIN) return 'ruido'
  const lift = calcularLift(freqCampeoes, freqControle)
  const campeoesFalam = freqCampeoes >= FREQ_MIN && numCampeoesFazendo >= CAMPEOES_MIN
  const controleFala = freqControle >= FREQ_MIN && numControleFazendo >= CONTROLE_MIN
  if (campeoesFalam && lift >= LIFT_MIN) return 'regra'
  if (controleFala && lift <= LIFT_ANTI) return 'anti-padrao'
  if (campeoesFalam) return 'custo-de-entrada'
  return 'irrelevante'
}

// Por que o teste NAO decidiu: separa "nao achou padrao" de "nao pode testar".
// Teste com veredito decisivo nunca sai bloqueado.
export function bloqueioDoTeste(e) {
  const { freqCampeoes, freqControle, amostra, numCampeoesFazendo = 0, numControleFazendo = 0 } = e
  if (DECISIVOS.includes(classificar(e))) return null
  if (amostra < AMOSTRA_MIN) return 'amostra-pequena'
  if (freqCampeoes >= FREQ_MIN && numCampeoesFazendo < CAMPEOES_MIN) return 'piso-de-campeoes'
  if (freqControle >= FREQ_MIN && numControleFazendo < CONTROLE_MIN && calcularLift(freqCampeoes, freqControle) <= LIFT_ANTI) return 'piso-de-controle'
  return null
}

export function compararPadrao(nome, campeoes, controle, teste) {
  const c = medir(campeoes, teste)
  const k = medir(controle, teste)
  const bruto = calcularLift(c.freq, k.freq)
  const entrada = { freqCampeoes: c.freq, freqControle: k.freq, amostra: c.total + k.total, numCampeoesFazendo: c.contagem, numControleFazendo: k.contagem }
  return {
    nome,
    freq_campeoes: c.freq,
    freq_controle: k.freq,
    lift: bruto === Infinity ? LIFT_SO_CAMPEOES : bruto,
    lift_so_campeoes: bruto === Infinity,
    amostra: entrada.amostra,
    campeoes_total: c.total,
    campeoes_fazendo: c.contagem,
    controle_total: k.total,
    controle_fazendo: k.contagem,
    erros_no_teste: c.erros + k.erros,
    veredito: classificar(entrada),
    bloqueio: bloqueioDoTeste(entrada),
  }
}

// A rodada inteira vale? Grupos acima do piso E maioria estrita da bateria decidindo.
export function diagnosticoDeAmostra(nCampeoes, nControle, padroes = []) {
  const motivos = []
  if (nCampeoes < CAMPEOES_MIN) motivos.push(`so ${nCampeoes} campeoes, e o minimo e ${CAMPEOES_MIN}: com menos que isso nada pode virar regra`)
  if (nControle < CONTROLE_MIN) motivos.push(`so ${nControle} anuncios de controle, e o minimo e ${CONTROLE_MIN}: sem grupo de comparacao nao existe contraste`)
  if (nCampeoes + nControle < AMOSTRA_MIN) motivos.push(`amostra de ${nCampeoes + nControle} anuncios, abaixo do minimo de ${AMOSTRA_MIN}`)
  const bloqueados = padroes.filter(p => p.bloqueio)
  const decididos = padroes.length - bloqueados.length
  const exigidos = exigeMaioria(padroes.length)
  const bateriaNaoDecidiu = padroes.length > 0 && decididos < exigidos
  if (bateriaNaoDecidiu) motivos.push(`so ${decididos} de ${padroes.length} testes conseguiram decidir, e o minimo e ${exigidos} (a maioria); os outros ${bloqueados.length} ficaram sem amostra pra decidir, o que e diferente de dar negativo`)
  return {
    campeoes: nCampeoes,
    controle: nControle,
    testes: { total: padroes.length, decididos, bloqueados: bloqueados.length, exigidos },
    inconclusivo: motivos.length > 0,
    motivos,
  }
}
