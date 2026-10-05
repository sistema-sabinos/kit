// A bateria de testes e a analise da rodada: tudo funcao pura sobre o que a coleta gravou.
// Cada anuncio lido chega assim:
//   { id, titulo, preco, vendidos, tipo, grupo, fotos: [url], video, descricao,
//     perguntas: [{ pergunta, resposta }], capa: { fundo, respiro, densidade_borda } | { erro },
//     fichas: [{ ordem, papel, rosto, texto_grande, texto, escala, valida }] (so com --ver) }
import { compararPadrao, diagnosticoDeAmostra, CAMPEOES_MIN, CONTROLE_MIN } from './lift.mjs'
import { mediana, composicao } from './grupos.mjs'
import { analisarCatalogo } from './catalogo.mjs'
import { objecoesNaoRespondidas, coberturaDePerguntas } from './objecoes.mjs'
import { PAPEIS } from './ver.mjs'

const fichasEmOrdem = a => (a.fichas ?? []).filter(f => f.valida).sort((x, y) => x.ordem - y.ordem)

// Gratis, sempre. Respiro e poluicao usam a mediana da propria rodada (campeao e controle
// juntos): corte fixo fica fora da faixa de algum nicho e o teste morre dando zero pra sempre.
export const TESTES_GRATIS = [
  ['fundo branco puro na capa', a => a.capa?.fundo?.branco_puro === true],
  ['8 ou mais fotos', a => (a.fotos?.length ?? 0) >= 8],
  ['video do vendedor no anuncio', a => a.video === true],
  ['capa com mais respiro que a mediana', (a, ctx) => (a.capa?.respiro ?? -1) > ctx.mediana_respiro],
  ['capa mais poluida que a mediana', (a, ctx) => (a.capa?.densidade_borda ?? -1) > ctx.mediana_densidade],
]

// So com --ver, sobre as fichas do Gemini.
export const TESTES_VER = [
  ['rosto humano em alguma foto', a => fichasEmOrdem(a).some(f => f.rosto === true)],
  ['texto grande na capa', a => { const c = fichasEmOrdem(a)[0]; return Boolean(c && c.ordem === 1 && c.texto_grande) }],
  ['quebra de objecao ate a foto 3', a => fichasEmOrdem(a).filter(f => f.ordem <= 3).some(f => f.papel === 'quebra-de-objecao')],
  ['prova social em alguma foto', a => fichasEmOrdem(a).some(f => f.papel === 'prova-social')],
  ['escala ou tamanho real mostrado', a => fichasEmOrdem(a).some(f => f.escala === true || f.papel === 'escala-tamanho-real')],
]

export function limiaresDaRodada(anuncios) {
  const respiros = anuncios.map(a => a.capa?.respiro).filter(n => typeof n === 'number')
  const densidades = anuncios.map(a => a.capa?.densidade_borda).filter(n => typeof n === 'number')
  return { mediana_respiro: mediana(respiros), mediana_densidade: mediana(densidades), capas_medidas: respiros.length }
}

// Papel mais comum em cada posicao do carrossel campeao. O denominador e quem tem foto ali.
export function anatomia(campeoes) {
  const seqs = campeoes.map(a => fichasEmOrdem(a).map(f => f.papel).filter(Boolean)).filter(s => s.length)
  if (!seqs.length) return null
  const maior = Math.max(...seqs.map(s => s.length))
  const posicoes = []
  for (let p = 0; p < maior; p++) {
    const ali = seqs.map(s => s[p]).filter(Boolean)
    const conta = new Map()
    for (const papel of ali) conta.set(papel, (conta.get(papel) || 0) + 1)
    const [papel, n] = [...conta].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]
    posicoes.push({ posicao: p + 1, papel, de: ali.length, quantos: n })
  }
  const usados = new Set(seqs.flat())
  return { anuncios: seqs.length, posicoes, papeis_que_nenhum_campeao_usa: PAPEIS.filter(p => !usados.has(p)) }
}

export function placar(padroes) {
  const p = { regra: 0, 'anti-padrao': 0, 'custo-de-entrada': 0, irrelevante: 0, ruido: 0 }
  for (const x of padroes) p[x.veredito]++
  return p
}

// lidos: os anuncios escolhidos ja com pagina (os que falharam vem em `falharam`).
// listas: [{ id, ofertas, sem_dado? }] dos catalogos /p/ escolhidos.
export function analisar({ termo, data, amostra, grupos, lidos, falharam = [], listas = [], comVer = false }) {
  const campeoes = lidos.filter(a => a.grupo === 'campeao')
  const controle = lidos.filter(a => a.grupo === 'controle')
  const ctx = limiaresDaRodada(lidos)
  const padroes = TESTES_GRATIS.map(([nome, t]) => compararPadrao(nome, campeoes, controle, a => t(a, ctx)))
  if (comVer) {
    // So conta quem o Gemini leu: anuncio sem ficha valida e "nao sei", nunca "nao faz".
    const lido = a => fichasEmOrdem(a).length > 0
    const cV = campeoes.filter(lido)
    const kV = controle.filter(lido)
    for (const [nome, t] of TESTES_VER) {
      const p = compararPadrao(nome, cV, kV, a => t(a, ctx))
      padroes.push(cV.length < CAMPEOES_MIN || kV.length < CONTROLE_MIN ? { ...p, veredito: 'ruido', bloqueio: 'sem-ficha' } : p)
    }
  }
  const diagnostico = diagnosticoDeAmostra(campeoes.length, controle.length, padroes)
  const porId = new Map(lidos.map(a => [a.catalogo_id ?? a.id, a]))
  const escada = listas.map(l => ({ id: l.id, titulo: porId.get(l.id)?.titulo ?? null, grupo: porId.get(l.id)?.grupo ?? null, sem_dado: l.sem_dado ?? null, ...analisarCatalogo(l.ofertas) }))
  const comTexto = lidos.map(a => ({ ...a, textos_fotos: fichasEmOrdem(a).map(f => f.texto).filter(Boolean) }))
  return {
    termo,
    data,
    com_ver: comVer,
    amostra: { ...amostra, campeoes: campeoes.length, controle: controle.length, lidos: lidos.length, falharam },
    controle_diagnostico: grupos.diagnostico,
    composicao: composicao(campeoes, controle),
    inconclusivo: diagnostico.inconclusivo,
    diagnostico,
    limiares: ctx,
    padroes,
    placar: placar(padroes),
    escada,
    objecoes: objecoesNaoRespondidas(comTexto),
    cobertura_perguntas: coberturaDePerguntas(lidos),
    anatomia: comVer ? anatomia(campeoes) : null,
    anuncios: lidos.map(a => ({ id: a.id, grupo: a.grupo, titulo: a.titulo, preco: a.preco, vendidos: a.vendidos, tipo: a.tipo, url: a.url, fotos: a.fotos?.length ?? 0, video: a.video ?? null })),
  }
}
