// Monta a pasta public da peca por COPIA: so a midia de biblioteca que o video cita (efeitos sonoros, overlays),
// de <_video>/midia pra producao/<slug>/public/. Nunca link: junção em public dá erro de permissao no Windows, e o
// render copia o public inteiro pra pasta temporaria, entao ele precisa ser pequeno.
//
// uso: node preparar-public.mjs --slug <slug> [--tipo videov2|camadas]
// Sai 1 se faltar algum arquivo, listando quais.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { caminhos, pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'

// So conta caminho que termina em arquivo de verdade: comentario ("biblioteca/sfx/.") e modelo ("<nome>", "${x}") ficam de fora.
const EXTENSAO = /\.(wav|mp3|m4a|aac|ogg|mp4|mov|webm|png|jpg|jpeg|json)$/i

// Toda string "biblioteca/..." citada no texto (JSON de props ou codigo da composicao), sem repetir, em ordem.
export function refsBiblioteca(texto) {
  const achados = (texto.match(/biblioteca\/[^"'`\s,)\]}<>$]+/g) ?? []).filter((r) => EXTENSAO.test(r))
  return [...new Set(achados)].sort()
}

export function prepararPublic({ pastaPeca, midia, refs }) {
  const copiados = []
  const faltando = []
  const origemBase = resolve(midia)
  const destinoBase = resolve(pastaPeca, 'public')
  for (const ref of refs) {
    const origem = resolve(origemBase, ...ref.split('/'))
    const destino = resolve(destinoBase, ...ref.split('/'))
    const dentro = origem.startsWith(origemBase + sep) && destino.startsWith(destinoBase + sep)
    if (!dentro || !existsSync(origem) || !statSync(origem).isFile()) { faltando.push(ref); continue }
    if (existsSync(destino) && statSync(destino).size === statSync(origem).size) continue
    mkdirSync(dirname(destino), { recursive: true })
    copyFileSync(origem, destino)
    copiados.push(ref)
  }
  return { copiados, faltando }
}

// Texto onde procurar as referencias da peca, conforme o tipo.
export function textoDaPeca(pastaPeca, tipo) {
  const arquivos = tipo === 'camadas' ? ['composicao.tsx', 'dados.json'] : ['props.json']
  return arquivos.map((a) => join(pastaPeca, a)).filter((p) => existsSync(p)).map((p) => readFileSync(p, 'utf8')).join('\n')
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const { values } = parseArgs({ options: { slug: { type: 'string' }, tipo: { type: 'string', default: 'videov2' } } })
    if (!values.slug) throw new Error('uso: node preparar-public.mjs --slug <slug> [--tipo videov2|camadas]')
    if (!['videov2', 'camadas'].includes(values.tipo)) throw new Error('tipo invalido: use videov2 ou camadas')
    const pastaPeca = join(RAIZ, 'producao', values.slug)
    if (!existsSync(pastaPeca)) throw new Error(`nao achei a pasta ${pastaPeca}`)
    const c = caminhos(pastaVideo())
    const r = prepararPublic({ pastaPeca, midia: c.midia, refs: refsBiblioteca(textoDaPeca(pastaPeca, values.tipo)) })
    console.log(`Public pronto: ${r.copiados.length} arquivo(s) copiado(s).`)
    if (r.faltando.length) {
      console.error(`Faltam na midia: ${r.faltando.join(', ')}. Confira o nome no registro da biblioteca, ou tire esse som do video: a biblioteca e do aluno e o kit nao traz som (ver referencias/som.md).`)
      process.exit(1)
    }
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
