// Adaptador do agendador. Hoje e o Buffer (API GraphQL, liberada em todo plano, inclusive o gratis).
// Trocar de agendador e reescrever so este arquivo, mantendo as mesmas funcoes.
// Escrita nunca repete sozinha: rede caindo depois do envio vira ErroIncerto, porque o post pode ter entrado.
// Formato conferido no schema do Buffer em 2026-10-04.
const API = 'https://api.buffer.com'

export class ErroIncerto extends Error {}

// escrita: 'criar' ou 'apagar'. Nas duas, conexao que cai, 5xx ou resposta cortada deixam a duvida se a acao
// aconteceu, e a mensagem diz o que conferir.
const DUVIDA = {
  criar: motivo => `${motivo} durante o envio. O post pode ter entrado: conferir no Buffer antes de repetir`,
  apagar: motivo => `${motivo} ao apagar. Nao da pra saber se apagou: conferir no Buffer`,
}

async function gql(chave, query, variables, { fetchFn = fetch, escrita = null } = {}) {
  let r
  try {
    r = await fetchFn(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` }, body: JSON.stringify({ query, variables }) })
  } catch (e) {
    if (escrita) throw new ErroIncerto(DUVIDA[escrita](`a conexao caiu (${e.message})`))
    throw e
  }
  if (r.status >= 500 && escrita) throw new ErroIncerto(DUVIDA[escrita](`o Buffer respondeu ${r.status}`))
  let j
  try { j = await r.json() } catch (e) {
    if (escrita) throw new ErroIncerto(DUVIDA[escrita]('a resposta do Buffer chegou cortada'))
    throw e
  }
  if (j.errors) throw new Error('Buffer: ' + j.errors.map(e => e.message).join('; '))
  return j.data
}

export function inputDoPost(post) {
  const video = () => ({ video: { url: post.videoUrl, ...(post.capaMs != null ? { metadata: { thumbnailOffset: post.capaMs } } : {}) } })
  return {
    channelId: post.channelId,
    text: post.text,
    assets: post.imagensUrls ? post.imagensUrls.map(url => ({ image: { url } })) : [video()],
    metadata: post.metadata,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: post.dueAt,
    needsApproval: false,
    source: 'sabinos-publicar-social',
  }
}

export async function criarPost(chave, post, opts = {}) {
  const d = await gql(chave, `mutation ($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id dueAt status } }
      ... on MutationError { message }
    }
  }`, { input: inputDoPost(post) }, { ...opts, escrita: 'criar' })
  if (!d.createPost.post) throw new Error(`Buffer recusou: ${d.createPost.message}`)
  return d.createPost.post
}

export async function apagarPost(chave, id, opts = {}) {
  const d = await gql(chave, `mutation ($input: DeletePostInput!) {
    deletePost(input: $input) { ... on DeletePostSuccess { id } ... on MutationError { message } }
  }`, { input: { id } }, { ...opts, escrita: 'apagar' })
  if (d.deletePost.id !== id) throw new Error(`Buffer nao apagou ${id}: ${d.deletePost.message}`)
}

export async function organizacoes(chave, opts = {}) {
  const d = await gql(chave, '{ account { organizations { id name } } }', {}, opts)
  return d.account.organizations
}

export async function canais(chave, organizationId, opts = {}) {
  const d = await gql(chave, `query ($input: ChannelsInput!) {
    channels(input: $input) { id service name isDisconnected }
  }`, { input: { organizationId } }, opts)
  return d.channels
}

export async function pendentesPorCanal(chave, organizationId, channelIds, opts = {}) {
  const conta = Object.fromEntries(channelIds.map(c => [c, 0]))
  let after = null
  do {
    const d = await gql(chave, `query ($input: PostsInput!, $after: String) {
      posts(input: $input, first: 100, after: $after) { edges { node { channelId } } pageInfo { hasNextPage endCursor } }
    }`, { input: { organizationId, filter: { channelIds, status: ['scheduled'] } }, after }, opts)
    for (const e of d.posts.edges || []) conta[e.node.channelId] = (conta[e.node.channelId] || 0) + 1
    after = d.posts.pageInfo.hasNextPage ? d.posts.pageInfo.endCursor : null
  } while (after)
  return conta
}

export async function consultarPost(chave, id, opts = {}) {
  const d = await gql(chave, `query ($input: PostInput!) {
    post(input: $input) { id status externalLink dueAt sentAt }
  }`, { input: { id } }, opts)
  return d.post
}

// Depois de uma escrita incerta: existe post agendado nesse canal exatamente nesse horario? Devolve o id ou null.
export async function acharPost(chave, organizationId, channelId, dueAt, opts = {}) {
  const d = await gql(chave, `query ($input: PostsInput!) {
    posts(input: $input, first: 10) { edges { node { id channelId dueAt } } pageInfo { hasNextPage } }
  }`, { input: { organizationId, filter: { channelIds: [channelId], status: ['scheduled'], dueAt: { start: dueAt, end: dueAt } } } }, opts)
  const achado = (d.posts.edges || []).map(e => e.node).find(n => n.channelId === channelId && new Date(n.dueAt).getTime() === new Date(dueAt).getTime())
  return achado ? achado.id : null
}
