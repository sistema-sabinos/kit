// Monta a coleta do /video-produto a partir do bruto da /espionar-concorrente.
// Existe porque a API do Mercado Livre recusa (403) o anuncio de outro vendedor:
// quem quer as perguntas e opinioes de um CONCORRENTE le pelo navegador (a skill
// de espionagem) e entrega o arquivo aqui. A saida tem o mesmo formato da coleta
// pela API, porque passa pelo mesmo normalizador.
import fs from 'node:fs'
import { normalizarAnuncio } from './normalizar.mjs'

// A aba de perguntas chega como o texto da pagina, uma linha por elemento. Formato
// conferido nos brutos reais (28 abas, 222 pares, nenhum fora do padrao):
//
//   Perguntas neste anúncio
//   <pergunta>            Denunciar   Vai abrir em uma nova janela
//   <resposta>  <data>    Denunciar   Vai abrir em uma nova janela
//   ...
//   Mais informações      (rodape: fim da secao)
//
// Cada "Denunciar" fecha um trecho. Trecho cuja ultima linha e so a data
// (dd/mm/aaaa) e resposta do vendedor e nunca vira duvida, mesmo terminando em
// "?". O outro trecho e pergunta, com ou sem interrogacao ("Qual a voltagem").
// Pergunta sem resposta aparece como dois trechos de pergunta seguidos. Sobra no
// fim sem "Denunciar" (bruto antigo, cortado no primeiro) so vale se terminar em
// "?"; o resto conta como linha descartada, que alimenta o aviso de formato.
const DATA = /^\d{2}\/\d{2}\/\d{4}$/
const NOVA_JANELA = /^Vai abrir em uma nova janela$/i
function perguntasDoTexto(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const ini = linhas.findIndex((l) => /^(Perguntas neste an[uú]ncio|[UÚ]ltimas feitas)/i.test(l))
  let corpo = linhas.slice(ini + 1)
  const fim = corpo.findIndex((l) => /^(Mais informa[cç][oõ]es|Termos mais procurados)$/i.test(l))
  if (fim >= 0) corpo = corpo.slice(0, fim)

  const trechos = []
  let atual = []
  for (const l of corpo) {
    if (l === 'Denunciar') { if (atual.length) trechos.push(atual); atual = [] }
    else if (!NOVA_JANELA.test(l)) atual.push(l)
  }
  const perguntas = []
  for (const t of trechos) {
    if (DATA.test(t[t.length - 1])) continue // resposta do vendedor
    perguntas.push({ text: t.join(' ') })
  }
  let descartadas = 0
  if (atual.length) {
    if (atual.length === 1 && atual[0].endsWith('?')) perguntas.push({ text: atual[0] })
    else descartadas = atual.length
  }
  return { perguntas, descartadas }
}

export function coletaDeEspionagem(bruto, mlb) {
  const lista = Array.isArray(bruto?.anuncios) ? bruto.anuncios : null
  if (!lista) throw new Error('o arquivo nao parece um _raw-concorrentes-*.json da /espionar-concorrente (falta a lista "anuncios")')
  const a = lista.find((x) => x?.id === mlb)
  if (!a) {
    const ids = lista.map((x) => x?.id).filter(Boolean).join(', ')
    throw new Error(`o anuncio ${mlb} nao esta nesse arquivo. Os que estao: ${ids || 'nenhum'}. Passe um deles em --mlb.`)
  }
  if (a.erro) {
    throw new Error(`a espionagem nao conseguiu ler o anuncio ${mlb} (${a.erro}). Rode a /espionar-concorrente de novo (com --retomar) ou escolha outro anuncio do arquivo.`)
  }

  const avisos = []
  if (!a.perguntas && a.perguntas_erro) {
    avisos.push(`perguntas: a pagina deu erro ao ler as perguntas desse anuncio (${a.perguntas_erro}). Rode a /espionar-concorrente de novo com --retomar, ou escolha outro anuncio do arquivo`)
  } else if (!a.perguntas) {
    avisos.push(`perguntas: a espionagem so le as perguntas dos anuncios que mais vendem e esse ficou sem. Rode a /espionar-concorrente de novo com mais perguntas, ou escolha outro anuncio do arquivo`)
  }
  const av = a.avaliacoes ?? {}
  if (av.erro) avisos.push(`avaliacoes: ${av.erro}`)

  const lidas = perguntasDoTexto(a.perguntas)
  if (a.perguntas && !lidas.perguntas.length) {
    avisos.push('perguntas: o campo existe mas nenhuma pergunta foi reconhecida nele. Confira o texto em _raw-concorrentes-*.json, ou escolha outro anuncio do arquivo')
  } else if (lidas.perguntas.length && lidas.descartadas > lidas.perguntas.length * 3) {
    avisos.push(`perguntas: aproveitei ${lidas.perguntas.length} pergunta(s) e descartei ${lidas.descartadas} linha(s) do texto. Confira o texto em _raw-concorrentes-*.json`)
  }

  const normal = normalizarAnuncio({
    item: {
      id: a.id,
      title: a.titulo,
      category_id: '',
      pictures: (a.fotos ?? []).map((u) => ({ secure_url: u })),
      attributes: Object.entries(a.atributos ?? {}).map(([id, value_name]) => ({ id, value_name })),
    },
    descricao: { plain_text: a.descricao ?? '' },
    perguntas: { questions: lidas.perguntas },
    reviews: { reviews: (av.avaliacoes ?? []).map((r) => ({ rate: r.nota, content: r.texto || r.titulo })) },
  })
  // a pasta de categoria da espionagem nao e um id do ML: fica em campo proprio.
  // `origem` avisa as fases seguintes que as fotos sao de um concorrente (a fase 2
  // exige foto propria nesse caminho).
  return { ...normal, categoriaDaEspionagem: bruto.categoria ?? '', origem: 'espionagem', avisos }
}

export function coletarDeEspionagem(caminho, mlb) {
  let texto
  try { texto = fs.readFileSync(caminho, 'utf8') } catch {
    throw new Error(`nao achei o arquivo ${caminho}. Passe o caminho do _raw-concorrentes-*.json que a /espionar-concorrente gravou.`)
  }
  let bruto
  try { bruto = JSON.parse(texto) } catch {
    throw new Error(`${caminho} nao e um JSON valido. Passe o _raw-concorrentes-*.json que a /espionar-concorrente gravou.`)
  }
  return coletaDeEspionagem(bruto, mlb)
}
