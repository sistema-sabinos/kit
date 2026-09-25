// Estado da esteira em arquivo: o slug de um produto e o arquivo de cada categoria
// (contrato 1 de referencias/contratos.md). JSON se grava inteiro, num temporario que
// depois troca de nome, pra um processo que cai no meio nunca deixar meio arquivo.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { RAIZ } from './raiz.mjs'

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

// 'Pão de Açúcar 1 kg' -> 'pao-de-acucar-1-kg'
export function slugDe(texto) {
  return String(texto ?? '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// 'hoje' pelo calendario local, nao pelo UTC de Date#toISOString: 23h30 no Brasil (UTC-3) e
// ainda o dia de hoje aqui, mas ja e amanha em UTC. Usa isso sempre que o codigo carimbar ou
// comparar "hoje" (coletado_em, a data do bruto), senao vira e mexe do meia-noite as 21h local.
export function dataLocal(d = new Date()) {
  const dois = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

export function lerJson(caminho, padrao = null) {
  if (!existsSync(caminho)) return padrao
  return JSON.parse(readFileSync(caminho, 'utf8'))
}

export function gravarJson(caminho, dado) {
  mkdirSync(dirname(caminho), { recursive: true })
  const tmp = `${caminho}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(dado, null, 2) + '\n')
  renameSync(tmp, caminho)
}

export function caminhoDaCategoria(fornecedor, categoria, raiz = RAIZ) {
  return join(raiz, 'dados', 'pipeline', '_categorias', `${fornecedor}-${categoria}.json`)
}

// Grava uma etapa no arquivo da categoria sem tocar nas outras. Os campos listados em
// `acrescentar` somam com o que ja estava (sem repetir), pra espionagem feita em lotes
// nao apagar o que o lote anterior registrou.
export function gravarEtapaDaCategoria({ fornecedor, categoria, etapa, dados, acrescentar = [], raiz = RAIZ }) {
  const caminho = caminhoDaCategoria(fornecedor, categoria, raiz)
  const atual = lerJson(caminho, { fornecedor, categoria, etapas: {} })
  atual.etapas = atual.etapas || {}
  const antes = atual.etapas[etapa] || {}
  const nova = { ...antes, ...dados }
  for (const k of acrescentar) nova[k] = [...new Set([...(antes[k] || []), ...(dados[k] || [])])]
  atual.etapas[etapa] = nova
  gravarJson(caminho, atual)
  return atual
}
