#!/usr/bin/env node
// Consulta de leitura na API do Mercado Livre pela IA, sem ela ver o token. O .env fica em deny
// desde a 5.28: o mlGet le e renova o token sozinho, e aqui sai so o JSON da resposta.
// Uso, da raiz do projeto: node .claude/skills/mercado-livre/scripts/consultar-ml.mjs "<caminho>"
//   ex.: "/sites/MLB/listing_prices?price=100&category_id=MLB1234&listing_type_id=gold_special"
// Saida: 0 com o JSON; 1 quando a API recusa; 2 sem caminho ou com endereco que nao e da API.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mlGet } from './lib/ml-api.mjs'

// so caminho que comeca com uma barra: endereco inteiro ou // levaria o token pra outro site
export async function consultar(caminho, { get = mlGet } = {}) {
  const c = String(caminho ?? '')
  if (!c.startsWith('/') || c.startsWith('//')) {
    throw Object.assign(new Error('use um caminho da API comecando com /, ex.: /sites/MLB/listing_prices?...'), { codigo: 2 })
  }
  return get(c)
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  try {
    console.log(JSON.stringify(await consultar(process.argv[2]), null, 2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = e.codigo || 1
  }
}
