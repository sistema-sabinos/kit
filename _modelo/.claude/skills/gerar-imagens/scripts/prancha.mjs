// Prancha: uma pagina so com todas as imagens do anuncio, numeradas, pra pessoa
// aprovar ou reprovar de uma vez. Mora na mesma pasta das imagens.
// Uso: node .claude/skills/gerar-imagens/scripts/prancha.mjs --imagens dados/pipeline/<slug>/imagens.json
// Grava anuncios/<slug>/imagens/prancha.html e imprime o caminho.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerArgs } from './lib/args.mjs'

const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const dinheiro = (usd) => `US$ ${Number(usd || 0).toFixed(2).replace('.', ',')}`
const MOTOR = { foto: 'foto real, sem IA', codex: 'cenário pelo Codex', gemini: 'cenário pelo Gemini', 'zero-ia': 'fundo liso, sem IA' }

export function montarPrancha({ slug, imagens, custo_usd_total }, { existe = existsSync } = {}) {
  const ordem = [...imagens].sort((a, b) => a.n - b.n)
  const faltando = ordem.filter(i => !existe(i.arquivo)).map(i => i.arquivo)
  const cartoes = ordem.map(i => `<figure${i.papel === 'capa' ? ' class="capa"' : ''}>
<div class="n">${escapar(i.n)}</div>
${faltando.includes(i.arquivo) ? '<div class="falta">falta o arquivo</div>' : `<img src="${escapar(basename(i.arquivo))}" alt="">`}
<figcaption><b>${escapar(i.papel)}</b><br>${escapar(MOTOR[i.motor] || i.motor || '')}</figcaption>
</figure>`).join('\n')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Imagens do anúncio ${escapar(slug)}</title>
<style>
body{margin:0;padding:24px;font:16px/1.4 system-ui,sans-serif;background:#f4f4f4;color:#222}
h1{font-size:22px;margin:0 0 4px}
p{margin:0 0 20px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;position:relative}
figure.capa{border:3px solid #222}
.n{position:absolute;top:18px;left:18px;background:#222;color:#fff;font-weight:700;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center}
img{width:100%;height:auto;display:block;border:1px solid #eee}
.falta{aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:#fee;color:#a00;font-weight:700}
figcaption{margin-top:8px;font-size:14px}
.resposta{margin-top:24px;padding:16px;background:#fff;border-radius:8px;border:1px solid #ddd}
</style></head><body>
<h1>Imagens do anúncio ${escapar(slug)}</h1>
<p>${ordem.length} imagens. Custo desta rodada: ${dinheiro(custo_usd_total)}.</p>
<div class="grade">
${cartoes}
</div>
<div class="resposta">Responda no chat: <b>aprova tudo</b>, ou <b>refaz a 3: o que mudar</b> (pode citar mais de uma).</div>
</body></html>
`
  return { html, faltando }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = lerArgs(process.argv.slice(2))
    if (!a.imagens) throw new Error('uso: --imagens dados/pipeline/<slug>/imagens.json')
    const dados = JSON.parse(readFileSync(a.imagens, 'utf8'))
    if (!dados.imagens?.length) throw new Error('o imagens.json nao tem nenhuma imagem')
    const { html, faltando } = montarPrancha(dados)
    const destino = resolve(dirname(dados.imagens[0].arquivo), 'prancha.html')
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, html)
    console.log(JSON.stringify({ ok: faltando.length === 0, prancha: destino, faltando }))
    process.exit(faltando.length ? 1 : 0)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
