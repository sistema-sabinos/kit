// Garimpo aberto: o que foi melhor que o normal nos ultimos N dias, fora da base de ideias.
// Descobre a lista pelas contas relacionadas que a pagina publica do Instagram mostra sem login, le a grade de
// cada perfil, puxa curtidas e comentarios pelo og:description de cada post e ranqueia pelo proxy
// (curtidas + 10 x comentarios) contra a mediana do proprio perfil. Nunca loga em conta nenhuma.
// Semente boa e perfil de pessoa ou loja do nicho; conta oficial de plataforma devolve relacionado de outro pais.
// Uso:
//   node .claude/skills/pauta/scripts/garimpo.mjs --sementes a,b --dias 4 --posts 9 --teto 18 --piso 300 [--tag x]
//   node .claude/skills/pauta/scripts/garimpo.mjs --perfis a,b,c --dias 4        (pula a descoberta)
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../midia-social/scripts/lib/raiz.mjs'
import { abrirPagina, ogDaPagina, opcoes, lista } from './lib/pagina.mjs'
import { gradeDosLinks, seguidoresDoOg, parseOg, ranquear, mediana, proxy, alertaDosPosts } from './lib/instagram-publico.mjs'

const USO = 'uso: node .claude/skills/pauta/scripts/garimpo.mjs --sementes a,b | --perfis a,b [--dias 4] [--posts 9] [--teto 18] [--piso 300] [--tag x]'
const RESERVADOS = new Set(['explore', 'reels', 'reel', 'accounts', 'directory', 'about', 'p', 'legal', 'privacy', 'terms', 'popular', 'developer', 'meta'])
export const PASTA = join(RAIZ, 'inteligencia', 'base-ideias')

const linha = p => `| ${p.multiplo}x${p.funil ? ' (funil)' : ''} | @${p.user} | ${p.tipo} | ${String(p.data).slice(5, 10)} | ${(p.curtidas || 0).toLocaleString('pt-BR')} / ${(p.comentarios || 0).toLocaleString('pt-BR')} | https://www.instagram.com/${p.tipo === 'reel' ? 'reel' : 'p'}/${p.codigo}/ | ${(p.legenda || '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 160)} |`
export const tabela = l => ['| Multiplo | Perfil | Tipo | Data | Curtidas / Coment | Link | Legenda |', '|---|---|---|---|---|---|---|', ...l.map(linha)].join('\n')
export const LEGENDA_DO_RANKING = 'Metrica: proxy curtidas + 10 x comentarios, multiplo contra a mediana dos ultimos posts do proprio perfil. Multiplo 1,0x e a media do perfil, nao sucesso. "(funil)" = comentario passa de um terco das curtidas, sinal de automacao de funil inflando o proxy.'

async function main(argv) {
  const o = opcoes(argv)
  if (o.help) { console.log(USO); return }
  const dias = Number(o.dias || 4), posts = Number(o.posts || 9), teto = Number(o.teto || 18), piso = Number(o.piso || 300)
  const sementes = lista(o.sementes), fixos = lista(o.perfis)
  if (!sementes.length && !fixos.length) throw new Error('faltou --sementes ou --perfis. ' + USO)
  const { page, fechar } = await abrirPagina()
  const perfis = []
  let watchlist = fixos
  try {
    if (!watchlist.length) {
      const conta = new Map()
      for (const s of sementes) {
        try {
          await ogDaPagina(page, `https://www.instagram.com/${s}/`)
          const rel = await page.evaluate(self => {
            const out = new Set()
            for (const a of document.querySelectorAll('a[href^="/"]')) {
              const m = a.getAttribute('href').match(/^\/([A-Za-z0-9._]{2,30})\/?$/)
              if (m && m[1] !== self) out.add(m[1])
            }
            return [...out]
          }, s)
          for (const r of rel) if (!RESERVADOS.has(r) && !sementes.includes(r)) conta.set(r, (conta.get(r) || 0) + 1)
          console.error(`[lista] @${s} -> ${rel.length} relacionados${rel.length < 5 ? ' (semente fraca: tente perfil de pessoa ou loja do nicho)' : ''}`)
        } catch (e) { console.error(`[lista] @${s} falhou: ${e.message}`) }
      }
      watchlist = [...conta.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, teto)
    }
    console.error(`[lista] ${watchlist.length} perfis: ${watchlist.join(', ')}`)
    for (const u of watchlist) {
      try {
        const og = await ogDaPagina(page, `https://www.instagram.com/${u}/`)
        const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].map(a => a.getAttribute('href')))])
        const grade = gradeDosLinks(links, posts)
        if (!grade.length) { console.error(`[${u}] grade vazia, pulando`); continue }
        for (const p of grade) {
          try { Object.assign(p, parseOg(await ogDaPagina(page, `https://www.instagram.com/${p.tipo === 'reel' ? 'reel' : 'p'}/${p.codigo}/`, 4000))) }
          catch (e) { console.error(`[${u}] ${p.codigo} falhou: ${e.message}`) }
        }
        perfis.push({ user: u, seguidores: seguidoresDoOg(og), mediana: mediana(grade.map(proxy)), posts: grade.map(p => ({ ...p, data: p.data.toISOString() })) })
        console.error(`[${u}] ${grade.length} posts`)
      } catch (e) { console.error(`[${u}] falhou: ${e.message}`) }
    }
  } finally { await fechar() }

  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + (o.tag ? `-${o.tag}` : '')
  mkdirSync(PASTA, { recursive: true })
  writeFileSync(join(PASTA, `aberto-${hoje}.json`), JSON.stringify({ gerado: new Date().toISOString(), dias, sementes, watchlist, perfis }, null, 2))
  const { lista: rank, abaixoDoPiso } = ranquear(perfis, { dias, piso })
  const alerta = alertaDosPosts(perfis.flatMap(pf => pf.posts))
  writeFileSync(join(PASTA, `aberto-${hoje}.md`), [
    `# Garimpo aberto de ${hoje} (janela de ${dias} dias)`, '',
    ...(alerta ? [alerta, ''] : []),
    `Fora da base de ideias. Lista ${sementes.length ? `descoberta pelas contas relacionadas de ${sementes.map(s => '@' + s).join(', ')}` : 'fixa'}.`,
    LEGENDA_DO_RANKING, `Piso de ${piso} curtidas. Perfis lidos: ${perfis.length}. Posts na janela: ${rank.length} (${abaixoDoPiso} abaixo do piso, fora da tabela).`, '',
    tabela(rank), '', '## Perfis e mediana',
    ...perfis.map(pf => `- @${pf.user}, ${pf.seguidores ? pf.seguidores.toLocaleString('pt-BR') + ' seguidores' : 'seguidores nao lidos'}, mediana ${pf.mediana}`), '',
  ].join('\n'))
  console.error(`\nok: inteligencia/base-ideias/aberto-${hoje}.md com ${rank.length} posts na janela de ${dias} dias`)
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) main(process.argv.slice(2)).catch(e => { console.error('ERRO:', e.message); process.exit(1) })
