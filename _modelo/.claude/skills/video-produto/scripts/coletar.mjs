// Puxa da API do ML tudo que o roteiro precisa: ficha, descricao, as perguntas
// reais dos clientes e as opinioes de quem comprou. Usa o token e o cliente de
// API da skill mercado-livre. Se um pedaco falhar (opiniao some em anuncio sem
// venda), segue sem ele e deixa o aviso na lista.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { normalizarAnuncio } from './lib/normalizar.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { mlGet } from '../../mercado-livre/scripts/lib/ml-api.mjs'

// Busca um endpoint e, se falhar, devolve objeto vazio (pra nao derrubar os
// outros 3), mas registra o aviso pra quem chamou saber que faltou pedaco.
async function buscar(nome, caminho, token, avisos, mlGetFn) {
  try {
    return await mlGetFn(caminho, { token })
  } catch (e) {
    avisos.push(`${nome}: HTTP ${e.status ?? 'erro'}`)
    return {}
  }
}

export async function coletar(mlb, { token, mlGetFn = mlGet } = {}) {
  const t = token ?? await tokenMl()
  const avisos = []
  const [item, descricao, perguntas, reviews] = await Promise.all([
    buscar('item', `/items/${mlb}`, t, avisos, mlGetFn),
    buscar('descricao', `/items/${mlb}/description`, t, avisos, mlGetFn),
    buscar('perguntas', `/questions/search?item=${mlb}&limit=50`, t, avisos, mlGetFn),
    buscar('reviews', `/reviews/item/${mlb}`, t, avisos, mlGetFn),
  ])
  if (!item?.id && avisos.some((a) => /^item: HTTP 403/.test(a))) {
    throw new Error(`o Mercado Livre nao deixa ler pela API o anuncio ${mlb} (HTTP 403), porque ele e de outro vendedor. Rode a /espionar-concorrente deste produto (ela le o anuncio pelo navegador) e depois use --de-espionagem=<caminho do _raw-concorrentes-*.json> --mlb=${mlb}. A coleta pela API serve so pra anuncio da sua conta.`)
  }
  if (!item?.id) throw new Error(`anuncio ${mlb} nao voltou da API do ML`)

  // O /questions/search pagina em 50. Se o anuncio tiver mais pergunta do que
  // isso, a duvida mais repetida pode ficar fora da janela sem ninguem notar.
  const totalPerguntas = perguntas?.total ?? perguntas?.questions?.length ?? 0
  const trazidas = perguntas?.questions?.length ?? 0
  if (totalPerguntas > trazidas) {
    avisos.push(`perguntas: trouxe ${trazidas} de ${totalPerguntas}, ${totalPerguntas - trazidas} ficaram de fora da pagina`)
  }

  return { ...normalizarAnuncio({ item, descricao, perguntas, reviews }), avisos }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const mlb = process.argv[2]
  if (!mlb) { console.error('uso: node coletar.mjs <MLB do anuncio>'); process.exit(2) }
  console.log(JSON.stringify(await coletar(mlb), null, 2))
}
