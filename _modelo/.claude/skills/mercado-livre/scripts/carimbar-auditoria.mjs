#!/usr/bin/env node
// Carimba a auditoria aprovada com o sha256 do copy.json, imagens.json e decisao.json que o
// ml-auditor leu. O --montar da /publicar-marketplace e o da /cadastrar-bling recusam quando
// algum deles mudou depois do carimbo.
// Uso, da raiz do projeto: node .claude/skills/mercado-livre/scripts/carimbar-auditoria.mjs <slug>
// Saida: 0 carimbado; 1 sem auditoria aprovada ou slug faltando.
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'
import { lerJson, gravarJson, carimbosDoAnuncio } from './lib/pipeline.mjs'

export function carimbar(slug, raiz = RAIZ) {
  if (!slug) throw new Error('uso: carimbar-auditoria.mjs <slug>')
  const pasta = join(raiz, 'dados', 'pipeline', slug)
  const arquivo = join(pasta, 'auditoria.json')
  const auditoria = lerJson(arquivo)
  if (!auditoria) throw new Error(`nao existe dados/pipeline/${slug}/auditoria.json`)
  if (auditoria.veredito !== 'aprovado') throw new Error('so se carimba auditoria aprovada')
  auditoria.carimbos = carimbosDoAnuncio(pasta)
  gravarJson(arquivo, auditoria)
  return auditoria.carimbos
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const c = carimbar(process.argv[2])
    const { fotos, ...json } = c
    console.log(`auditoria carimbada: ${Object.entries(json).map(([n, h]) => `${n}.json ${h ? h.slice(0, 12) : 'ausente'}`).join(', ')}, ${Object.keys(fotos).length} foto(s) do mapa`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
