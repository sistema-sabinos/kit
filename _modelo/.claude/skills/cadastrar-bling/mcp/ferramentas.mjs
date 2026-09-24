// As ferramentas do MCP do Bling. So leitura, de proposito: escrever no Bling (criar produto,
// lancar estoque, vincular custo) e trabalho do cadastrar.mjs, que mostra o resumo e espera o
// "pode ir". Aqui o agente consulta: produto, categoria, deposito, canal, contato, saldo.
// Cada handler recebe o `req` de lib/bling-api.mjs e os argumentos da chamada.

const texto = descricao => ({ type: 'string', description: descricao })
const numero = descricao => ({ type: 'number', description: descricao })
const esquema = (props = {}, obrigatorios = []) => ({ type: 'object', properties: props, required: obrigatorios, additionalProperties: false })
const paginacao = { pagina: numero('pagina, comeca em 1'), limite: numero('itens por pagina, ate 100') }

const listar = (caminho, filtros = {}) => ({
  inputSchema: esquema({ ...paginacao, ...filtros }),
  handler: (req, args = {}) => req('GET', caminho, { query: args }),
})
const pegar = caminho => ({
  inputSchema: esquema({ id: numero('id no Bling') }, ['id']),
  handler: (req, args) => req('GET', `${caminho}/${Number(args.id)}`),
})

export const ferramentas = [
  { name: 'bling_listar_produtos', description: 'Lista produtos. Filtros: pesquisa (nome ou codigo), codigo (exato).', ...listar('/produtos', { pesquisa: texto('parte do nome ou do codigo'), codigo: texto('codigo exato (SKU)') }) },
  { name: 'bling_ver_produto', description: 'Um produto inteiro pelo id.', ...pegar('/produtos') },
  { name: 'bling_listar_categorias', description: 'Categorias de produto (id e descricao).', ...listar('/categorias/produtos') },
  { name: 'bling_listar_depositos', description: 'Depositos de estoque. Use pra conferir o deposito_id da configuracao.', ...listar('/depositos') },
  { name: 'bling_saldo_estoque', description: 'Saldo de estoque de produtos por id.', inputSchema: esquema({ idsProdutos: { type: 'array', items: { type: 'number' }, description: 'ids dos produtos' } }, ['idsProdutos']), handler: (req, args) => req('GET', '/estoques/saldos', { query: { 'idsProdutos[]': args.idsProdutos } }) },
  { name: 'bling_listar_canais', description: 'Canais de venda (lojas integradas). Use pra conferir o canal_id da configuracao.', ...listar('/canais-venda') },
  { name: 'bling_listar_contatos', description: 'Contatos. Filtros: pesquisa (nome), numeroDocumento (CNPJ ou CPF so com numeros).', ...listar('/contatos', { pesquisa: texto('parte do nome'), numeroDocumento: texto('CNPJ ou CPF, so numeros') }) },
  { name: 'bling_listar_grupos', description: 'Grupos de produto.', ...listar('/grupos-produtos') },
  {
    name: 'bling_consultar',
    description: 'Qualquer leitura (GET) da API v3 do Bling que nao tenha ferramenta propria. Caminho comeca com /, como /pedidos/vendas.',
    inputSchema: esquema({ caminho: texto('caminho da API, como /pedidos/vendas'), query: { type: 'object', additionalProperties: true, description: 'filtros da query string' } }, ['caminho']),
    handler: (req, args) => {
      if (!String(args.caminho ?? '').startsWith('/')) throw new Error('o caminho precisa comecar com /')
      return req('GET', args.caminho, { query: args.query })
    },
  },
]

export const acharFerramenta = nome => ferramentas.find(f => f.name === nome)
