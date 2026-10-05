// A configuracao do aluno: o bloco ```mercado-livre``` de _contexto/mercado-livre.md.
// Mesmo padrao da regua do /trafego: o texto em volta e pra pessoa, o bloco e pra maquina.
// Nenhum numero de imposto, margem, deposito ou SKU mora em skill ou script: mora aqui.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from './raiz.mjs'

export const CAMINHO_CONFIG = join(RAIZ, '_contexto', 'mercado-livre.md')
export const NUMERICOS = new Set(['imposto_pct', 'margem_minima_rs', 'margem_minima_pct', 'margem_minima_kit_rs', 'limite_gasto_usd'])
export const LISTAS = new Set(['fornecedores'])
export const PADROES = { erp: 'nenhum', modelo: 'estoque', limite_gasto_usd: 4, loja_oficial: 'nao', full: 'nao', guia_de_marca: 'marca/design-guide.md' }
export const VALORES = { modelo: ['dropshipping', 'estoque'] }

export function lerConfiguracao(texto) {
  const m = String(texto).match(/```mercado-livre\s*\n([\s\S]*?)```/)
  if (!m) {
    throw new Error('nao achei o bloco `mercado-livre` no arquivo.\nO arquivo precisa de um bloco de codigo marcado como mercado-livre. O modelo esta em referencias/configuracao-exemplo.md, e o /mercado-livre monta ele por entrevista.')
  }
  const c = { ...PADROES, fornecedores: [] }
  for (const linha of m[1].split('\n')) {
    const par = linha.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i)
    if (!par) continue
    const chave = par[1].toLowerCase()
    const valor = par[2]
    if (valor === '') continue
    if (LISTAS.has(chave)) c[chave] = valor.split(',').map(x => x.trim()).filter(Boolean)
    else if (NUMERICOS.has(chave)) {
      const n = Number(valor.replace('%', '').replace(',', '.').trim())
      if (!Number.isFinite(n)) throw new Error(`o campo ${chave} precisa ser numero, e veio "${valor}"`)
      c[chave] = n
    } else {
      if (VALORES[chave] && !VALORES[chave].includes(valor.toLowerCase())) {
        throw new Error(`o campo ${chave} aceita ${VALORES[chave].join(' ou ')}, e veio "${valor}"`)
      }
      c[chave] = VALORES[chave] ? valor.toLowerCase() : valor
    }
  }
  return c
}

export function carregarConfiguracao(caminho = CAMINHO_CONFIG) {
  if (!existsSync(caminho)) throw new Error(`nao existe ${caminho}.\nRode /mercado-livre: a primeira conversa monta esse arquivo por entrevista.`)
  return lerConfiguracao(readFileSync(caminho, 'utf8'))
}

export function exigir(config, campos) {
  const faltam = campos.filter(c => config[c] === undefined || config[c] === null || config[c] === '' || (Array.isArray(config[c]) && !config[c].length))
  if (faltam.length) throw new Error(`a configuracao em _contexto/mercado-livre.md esta sem: ${faltam.join(', ')}.\nRode /mercado-livre e responda o que falta.`)
  return config
}
