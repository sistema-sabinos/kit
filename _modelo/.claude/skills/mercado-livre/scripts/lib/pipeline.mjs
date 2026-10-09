// Estado da esteira em arquivo: o slug de um produto e o arquivo de cada categoria
// (contrato 1 de referencias/contratos.md). JSON se grava inteiro, num temporario que
// depois troca de nome, pra um processo que cai no meio nunca deixar meio arquivo.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
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

// Carimbo da auditoria: sha256 do que o auditor leu. Hash e nao data de arquivo, porque checkout
// e sync em outra maquina mexem na data sem mexer no conteudo. Arquivo que nao existe vale null.
export const ARQUIVOS_AUDITADOS = ['copy', 'imagens', 'decisao']
const hashDe = p => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null)
export function carimbosDoAnuncio(pasta) {
  const saida = {}
  for (const n of ARQUIVOS_AUDITADOS) saida[n] = hashDe(join(pasta, `${n}.json`))
  // o auditor abre cada foto do mapa (capa de fundo branco, sem texto): o arquivo dela entra no
  // carimbo, senao trocar a foto mantendo o imagens.json passaria. Caminho relativo a raiz.
  const raiz = join(pasta, '..', '..', '..')
  let mapa = null
  try { mapa = lerJson(join(pasta, 'imagens.json')) } catch { mapa = null }
  saida.fotos = {}
  for (const i of mapa?.imagens || []) if (i?.arquivo) saida.fotos[i.arquivo] = hashDe(join(raiz, i.arquivo))
  return saida
}

// O que mudou depois da auditoria: lista dos arquivos, [] em dia, ['sem carimbo'] quando a
// auditoria nao tem carimbo (feita antes da 5.7 ou sem o carimbar-auditoria.mjs).
export function auditoriaEmDia(pasta, auditoria) {
  const c = auditoria?.carimbos
  if (!c || typeof c !== 'object') return ['sem carimbo']
  const agora = carimbosDoAnuncio(pasta)
  const mudou = ARQUIVOS_AUDITADOS.filter(n => (c[n] ?? null) !== agora[n]).map(n => `${n}.json`)
  const antes = c.fotos && typeof c.fotos === 'object' ? c.fotos : {}
  for (const f of new Set([...Object.keys(antes), ...Object.keys(agora.fotos)])) if ((antes[f] ?? null) !== (agora.fotos[f] ?? null)) mudou.push(f)
  return mudou
}

// Auditoria sem carimbo feita antes do carimbo existir (5.7) passa uma vez, com aviso: ela e
// carimbada ali mesmo, entao a proxima montagem ja barra se algo mudar. Sem data, ou de depois, barra.
export const INICIO_DO_CARIMBO = '2026-10-08'
export function conferirAuditoria(pasta, auditoria) {
  const mudou = auditoriaEmDia(pasta, auditoria)
  if (!mudou.length) return { aviso: null }
  if (mudou[0] === 'sem carimbo') {
    const em = String(auditoria?.em ?? '')
    if (/^\d{4}-\d{2}-\d{2}/.test(em) && em < INICIO_DO_CARIMBO) {
      gravarJson(join(pasta, 'auditoria.json'), { ...auditoria, carimbos: carimbosDoAnuncio(pasta) })
      return { aviso: 'auditoria de antes do carimbo (versao 5.7): passa desta vez e ficou carimbada agora; se mexer no copy, nas imagens ou na decisao, rode o ml-auditor de novo' }
    }
    throw new Error('a auditoria nao tem carimbo: rode o ml-auditor de novo (ele carimba no fim) antes de montar')
  }
  throw new Error(`o ${mudou.join(', ')} mudou depois da auditoria: rode o ml-auditor de novo antes de montar`)
}

// Marca na ficha (decisao 1 da 5.7): `Genérica` (o valor que o Mercado Livre pede pra produto sem
// marca, conferido em 2026-10-08) em kit, revenda e dropshipping; o nome do fabricante so quando
// a pessoa e dona da marca ou revendedora autorizada por escrito (decisao.marca_autorizada).
export const SEM_MARCA = 'Genérica'
export function marcaDaFicha({ copy, decisao }) {
  const marca = String(copy?.ficha?.Marca ?? '').trim()
  const autorizada = String(decisao?.marca_autorizada ?? '').trim()
  const igual = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0
  if (!marca) return `a ficha do copy.json nao tem Marca: use "${SEM_MARCA}"${autorizada ? ` ou "${autorizada}" (marca_autorizada da decisao)` : ''}`
  if (igual(marca, SEM_MARCA) || (autorizada && igual(marca, autorizada))) return null
  return `Marca "${marca}" fora da regra: use "${SEM_MARCA}" em kit, revenda e dropshipping; o nome do fabricante so entra quando voce e a dona da marca ou revendedora autorizada por escrito, gravado em marca_autorizada na decisao.json. Corrija no copy.json, rode o ml-auditor de novo e monte outra vez`
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
