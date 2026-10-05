// Refaz o ranking do garimpo a partir dos JSON ja gravados, com outra janela e outro piso.
// Nao abre navegador e nao raspa nada. Junta varias levas num arquivo so (perfil repetido entra uma vez) e
// separa carrossel de Reel.
// Uso: node .claude/skills/pauta/scripts/refiltrar.mjs --dias 7 --piso 300 --tag 7dias aberto-2026-10-01 aberto-2026-10-02
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { opcoes } from './lib/pagina.mjs'
import { ranquear } from './lib/instagram-publico.mjs'
import { PASTA, tabela, LEGENDA_DO_RANKING } from './garimpo.mjs'

const USO = 'uso: node .claude/skills/pauta/scripts/refiltrar.mjs [--dias 7] [--piso 300] [--tag 7dias] <aberto-AAAA-MM-DD> [...]'

export function juntarLevas(levas) {
  const vistos = new Set(), perfis = []
  for (const j of levas) for (const pf of j.perfis) if (!vistos.has(pf.user)) { vistos.add(pf.user); perfis.push(pf) }
  return perfis
}

function main(argv) {
  const o = opcoes(argv)
  if (o.help) { console.log(USO); return }
  const dias = Number(o.dias || 7), piso = Number(o.piso || 300), tag = o.tag || `${dias}dias`
  if (!o._.length) throw new Error('faltou o nome dos arquivos de garimpo. ' + USO)
  const perfis = juntarLevas(o._.map(f => JSON.parse(readFileSync(join(PASTA, f.replace(/\.json$/, '') + '.json'), 'utf8'))))
  const { lista } = ranquear(perfis, { dias, piso })
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const nome = `aberto-${hoje}-${tag}.md`
  const carrossel = lista.filter(p => p.tipo === 'post'), reels = lista.filter(p => p.tipo === 'reel')
  writeFileSync(join(PASTA, nome), [
    `# Garimpo aberto, janela de ${dias} dias (refeito em ${hoje})`, '',
    `Refeito sem raspar nada, a partir de: ${o._.join(', ')}. Perfis unicos: ${perfis.length}. Piso de ${piso} curtidas.`,
    LEGENDA_DO_RANKING, '',
    `## Carrossel e imagem (${carrossel.length})`, tabela(carrossel), '',
    `## Reels (${reels.length})`, tabela(reels), '',
  ].join('\n'))
  console.error(`ok: inteligencia/base-ideias/${nome}, ${lista.length} posts de ${perfis.length} perfis`)
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) { try { main(process.argv.slice(2)) } catch (e) { console.error('ERRO:', e.message); process.exit(1) } }
