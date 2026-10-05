// Frequencia de post de perfis publicos do Instagram, sem login: seguidores pelo og:description da pagina e
// a data de cada post da grade pelo codigo do link. Os fixados antigos vem no topo da grade e distorcem o
// ritmo: quem le a saida tira da conta o post com data fora da janela dos outros.
// Uso: node .claude/skills/pauta/scripts/frequencia.mjs --perfis a,b,c
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirPagina, ogDaPagina, opcoes, lista } from './lib/pagina.mjs'
import { gradeDosLinks, seguidoresDoOg, ritmo } from './lib/instagram-publico.mjs'

const USO = 'uso: node .claude/skills/pauta/scripts/frequencia.mjs --perfis a,b,c'

async function main(argv) {
  const o = opcoes(argv)
  if (o.help) { console.log(USO); return }
  const perfis = lista(o.perfis)
  if (!perfis.length) throw new Error('faltou --perfis. ' + USO)
  const { page, fechar } = await abrirPagina()
  const saida = []
  try {
    for (const u of perfis) {
      const og = await ogDaPagina(page, `https://www.instagram.com/${u}/`, 6000)
      const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].map(a => a.getAttribute('href')))])
      const grade = gradeDosLinks(links)
      saida.push({ user: u, seguidores: seguidoresDoOg(og), og, posts: grade.map(p => ({ tipo: p.tipo, codigo: p.codigo, data: p.data.toISOString() })) })
      console.log(`\n=== @${u}\nseguidores: ${seguidoresDoOg(og) ?? 'nao lido'}\ngrade: ${grade.length} posts`)
      for (const p of grade) console.log('  ', p.data.toISOString().slice(0, 16).replace('T', ' '), p.tipo, p.codigo)
      const r = ritmo(grade)
      if (r != null) console.log(`ritmo: ${r} posts por semana (com os fixados; tirar os fora da janela antes de confiar)`)
      await page.waitForTimeout(3000)
    }
  } finally { await fechar() }
  console.log('\nJSON:' + JSON.stringify(saida))
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) main(process.argv.slice(2)).catch(e => { console.error('ERRO:', e.message); process.exit(1) })
