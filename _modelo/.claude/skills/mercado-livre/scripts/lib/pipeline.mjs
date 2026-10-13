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

// Marca na ficha (decisao de 2026-10-12): a marca real do produto, gravada em decisao.marca, e
// `Genérica` so quando o produto nao tem marca. O Mercado Livre pede "Informe sempre a marca real"
// e "Se não tiver marca, digite Genérica" (ajuda/como-preencher-caracteristicas_3147, lida em
// 2026-10-12). Decisao de antes da 5.12 traz a marca em marca_autorizada e segue valendo.
export const SEM_MARCA = 'Genérica'
// `marca` presente manda, mesmo null (produto sem marca); marca_autorizada so em decisao sem ela
function marcaDaDecisao(decisao) {
  return String((decisao && Object.hasOwn(decisao, 'marca') ? decisao.marca : decisao?.marca_autorizada) ?? '').trim()
}
export function marcaDaFicha({ copy, decisao }) {
  const marca = String(copy?.ficha?.Marca ?? '').trim()
  const real = marcaDaDecisao(decisao)
  const esperada = real || SEM_MARCA
  const igual = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0
  const corrigir = 'Corrija no copy.json, rode o ml-auditor de novo e monte outra vez'
  if (!marca) return `a ficha do copy.json nao tem Marca: use "${esperada}"${real ? ' (a marca da decisao.json)' : ''}`
  if (igual(marca, esperada)) return null
  if (real) return `Marca "${marca}" fora da regra: a decisao.json diz que o produto e da marca "${real}", e o Mercado Livre pede a marca real na ficha (${SEM_MARCA} so em produto sem marca). ${corrigir}`
  return `Marca "${marca}" fora da regra: a decisao.json diz que o produto nao tem marca, entao a ficha leva "${SEM_MARCA}". Se o produto tem marca na embalagem, grave o nome em "marca" na decisao.json; nunca o nome da loja. ${corrigir}`
}

// Marca no titulo (decisao de 2026-10-12): produto com marca leva ela no titulo, na ordem
// produto + marca + modelo. O ML pede "No título: Informe a marca real do produto que você
// oferece" (Central de Vendedores, propriedade intelectual, lida em 2026-10-12). Sem marca na
// decisao (sem marca ou kit que mistura marcas) nao confere: marca de outro fabricante no
// titulo nao tem lista pra conferir, isso fica com o ml-auditor.
export function marcaNoTitulo({ copy, decisao }) {
  const real = marcaDaDecisao(decisao)
  if (!real) return null
  // palavra inteira, sem caixa, acento nem pontuacao: "Elo" nao casa dentro de "Modelo"
  const solto = t => ` ${String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
  if (solto(copy?.titulo).includes(solto(real))) return null
  return `o titulo do copy.json nao tem a marca "${real}" da decisao.json: produto com marca leva ela no titulo, na ordem produto + marca + modelo. Corrija no copy.json, rode o ml-auditor de novo e monte outra vez`
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
