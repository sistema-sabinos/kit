// Qual estilo vale pras fotos deste anuncio. Le a categoria do produto no
// dados/pipeline/<slug>/status.json e procura a linha dela no bloco estilo-anuncio do
// _contexto/mercado-livre.md; as cores e as letras vem do referencias/estilos.md.
// Categoria sem linha nao cai em estilo nenhum: sai 2 e a pessoa escolhe.
// Uso: node .claude/skills/gerar-imagens/scripts/estilo.mjs --slug <slug>
// Saida 0: { categoria, estilo, cores, letras }. Saida 2: categoria sem estilo, com as
// linhas que existem. Saida 1: erro de uso ou de arquivo.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { lerEstilos } from './lib/estilos-md.mjs'
import { lerArgs } from './lib/args.mjs'

export const ESTILOS = ['Limpo', 'Colorido', 'Natural']

// mesma chave dos dois lados: sem acento, minuscula, espaco e hifen viram um hifen so
export function chave(texto) {
  return String(texto).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/[\s-]+/g, '-')
}

// Devolve null sem o bloco; senao [{ categoria, estilo, cores }]. Lanca dizendo a linha.
export function lerBlocoEstilos(texto) {
  const blocos = [...String(texto).replace(/\r\n/g, '\n').matchAll(/```estilo-anuncio[^\n]*\n([\s\S]*?)```/g)]
  if (!blocos.length) return null
  if (blocos.length > 1) throw new Error(`o _contexto/mercado-livre.md tem ${blocos.length > 2 ? blocos.length : 'dois'} blocos estilo-anuncio; junte num so`)
  const m = blocos[0]
  const linhas = []
  const vistas = new Map()
  for (const bruta of m[1].split('\n')) {
    const linha = bruta.trim()
    if (!linha || linha.startsWith('#')) continue
    const par = linha.match(/^([^:]*):\s*(.*)$/)
    const categoria = par ? par[1].trim() : ''
    if (!categoria) throw new Error(`a linha "${linha}" do bloco estilo-anuncio precisa de "<categoria>: <estilo>" (exemplo: brinquedos: Colorido)`)
    const [nome = '', ...cores] = par[2].split(/\s+/).filter(Boolean)
    const estilo = ESTILOS.find(e => e.toLowerCase() === nome.toLowerCase())
    if (!estilo) throw new Error(`a linha "${linha}" do bloco estilo-anuncio traz o estilo "${nome}"; vale ${ESTILOS.join(', ')}`)
    const errada = cores.find(c => !/^#[0-9a-f]{6}$/i.test(c))
    if (errada) throw new Error(`a linha "${linha}" do bloco estilo-anuncio traz a cor "${errada}"; cor vai no formato #RRGGBB`)
    const antes = vistas.get(chave(categoria))
    if (antes) throw new Error(`as linhas "${antes}" e "${linha}" do bloco estilo-anuncio sao da mesma categoria; deixe uma so`)
    vistas.set(chave(categoria), linha)
    linhas.push({ categoria, estilo, cores: cores.map(c => c.toUpperCase()) })
  }
  return linhas
}

export function resolverEstilo({ slug, raiz = RAIZ, estilos = lerEstilos() }) {
  if (!slug || slug === true) return { codigo: 1, saida: 'faltou --slug' }
  const caminhoStatus = join(raiz, 'dados', 'pipeline', slug, 'status.json')
  if (!existsSync(caminhoStatus)) return { codigo: 1, saida: `nao existe dados/pipeline/${slug}/status.json` }
  const categoria = String(JSON.parse(readFileSync(caminhoStatus, 'utf8')).categoria || '').trim()
  if (!categoria) return { codigo: 1, saida: `o dados/pipeline/${slug}/status.json esta sem categoria` }
  const config = join(raiz, '_contexto', 'mercado-livre.md')
  const bloco = existsSync(config) ? lerBlocoEstilos(readFileSync(config, 'utf8')) : null
  const linha = (bloco || []).find(l => chave(l.categoria) === chave(categoria))
  if (!linha) {
    const existem = (bloco || []).map(l => `${l.categoria}: ${[l.estilo, ...l.cores].join(' ')}`)
    const onde = !existsSync(config) ? 'sem o arquivo _contexto/mercado-livre.md'
      : !bloco ? 'sem o bloco estilo-anuncio no _contexto/mercado-livre.md'
      : existem.length ? `linhas que existem:\n${existem.join('\n')}` : 'o bloco estilo-anuncio esta vazio'
    return { codigo: 2, saida: `categoria "${categoria}" sem estilo\n${onde}` }
  }
  const e = estilos[linha.estilo]
  if (!e) return { codigo: 1, saida: `o estilo ${linha.estilo} nao esta no referencias/estilos.md` }
  const cores = linha.cores.length ? linha.cores : e.cores
  return { codigo: 0, saida: JSON.stringify({ categoria, estilo: linha.estilo, cores, letras: { titulo: e.titulo, texto: e.texto } }) }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const r = resolverEstilo({ slug: lerArgs(process.argv.slice(2)).slug })
    ;(r.codigo === 1 ? console.error : console.log)(r.saida)
    process.exit(r.codigo)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
