#!/usr/bin/env node
// Servidor MCP (stdio) do Bling, so leitura. Le o token do .env do projeto pela lib do pacote
// e renova sozinho quando vence. Instalar a dependencia uma vez, da raiz do projeto:
//   npm install --prefix .claude/skills/cadastrar-bling/mcp
// Registro no .mcp.json da raiz do projeto (o /conectar faz):
//   { "mcpServers": { "bling": { "command": "node", "args": [".claude/skills/cadastrar-bling/mcp/servidor.mjs"] } } }
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { clienteBling } from '../../mercado-livre/scripts/lib/bling-api.mjs'
import { ferramentas, acharFerramenta } from './ferramentas.mjs'

const req = clienteBling()
const servidor = new Server({ name: 'bling', version: '1.0.0' }, { capabilities: { tools: {} } })

servidor.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ferramentas.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}))

servidor.setRequestHandler(CallToolRequestSchema, async pedido => {
  const { name, arguments: args = {} } = pedido.params
  const f = acharFerramenta(name)
  if (!f) return { isError: true, content: [{ type: 'text', text: `ferramenta desconhecida: ${name}` }] }
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await f.handler(req, args), null, 2) }] }
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ erro: e.message, status: e.status, resposta: e.resposta }, null, 2) }] }
  }
})

await servidor.connect(new StdioServerTransport())
console.error(`bling: ${ferramentas.length} ferramentas de leitura prontas`)
