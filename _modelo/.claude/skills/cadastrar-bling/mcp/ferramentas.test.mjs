// Testes das ferramentas do MCP do Bling. Sem SDK e sem rede: o req e falso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ferramentas, acharFerramenta } from './ferramentas.mjs'

function reqFalso() {
  const feitas = []
  return { feitas, req: async (metodo, caminho, opcoes = {}) => { feitas.push({ metodo, caminho, ...opcoes }); return { data: [] } } }
}

test('toda ferramenta tem nome unico, descricao e esquema de objeto', () => {
  const nomes = ferramentas.map(f => f.name)
  assert.ok(nomes.length > 0)
  assert.equal(new Set(nomes).size, nomes.length)
  for (const f of ferramentas) {
    assert.ok(f.description.length > 10, f.name)
    assert.equal(f.inputSchema.type, 'object', f.name)
    assert.equal(typeof f.handler, 'function', f.name)
  }
})

test('o MCP so le: toda chamada de toda ferramenta e GET', async () => {
  const { req, feitas } = reqFalso()
  const exemplos = { id: 1, idsProdutos: [1], caminho: '/pedidos/vendas' }
  for (const f of ferramentas) await f.handler(req, Object.fromEntries(Object.keys(f.inputSchema.properties).filter(k => k in exemplos).map(k => [k, exemplos[k]])))
  assert.equal(feitas.length, ferramentas.length)
  assert.ok(feitas.every(f => f.metodo === 'GET'))
})

test('listar passa os filtros na query e ver monta o caminho com o id', async () => {
  const { req, feitas } = reqFalso()
  await acharFerramenta('bling_listar_produtos').handler(req, { pesquisa: 'LOJA-DOC-', pagina: 2 })
  await acharFerramenta('bling_ver_produto').handler(req, { id: '55' })
  assert.deepEqual(feitas[0], { metodo: 'GET', caminho: '/produtos', query: { pesquisa: 'LOJA-DOC-', pagina: 2 } })
  assert.equal(feitas[1].caminho, '/produtos/55')
})

test('bling_consultar recusa caminho sem barra e nome desconhecido devolve undefined', async () => {
  const { req } = reqFalso()
  assert.throws(() => acharFerramenta('bling_consultar').handler(req, { caminho: 'produtos' }), /comecar com/)
  assert.equal(acharFerramenta('bling_apagar_tudo'), undefined)
})
