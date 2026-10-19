// Conferencia de densidade do videov2 ANTES do render: le o props.json (tempos ja resolvidos pelo preparar-props.py)
// e a legenda alinhada, e reprova trecho longo sem novidade na tela, dizendo o segundo e o que esta sendo falado.
// Novidade: troca de plano (corte com escala diferente), chave, cartao, insercao (entra e sai), entrada da onda,
// flash, abertura que assenta e inicio do empurrao. Efeito sonoro sozinho NAO conta: so o que se ve quebra o trecho
// parado (decisao 5 da 5.17). Clipe de video por cima se mexe sozinho: o tempo dele nao e vao.
// Limites PROVISORIOS, medidos em 8 Reels reais em cenario proprio: 7 passam e o vmeta reprova (vao de 7,84 s).
// No vao a folga do pior aprovado e de so 0,25 s (vcaneta, 4,75 s). Calibrar no primeiro video.
// Quem chama e o render.mjs, antes de gastar o render.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LIMITES = { vaoMaxSeg: 5, porDezSegMin: 4.5, coberturaMin: 0.4 }
const JUNTA_SEG = 0.1 // dois eventos a menos disso contam como um

function escalaDoBloco(p, bloco) {
  if (p.escalasSeg && p.escalasSeg[bloco] !== undefined) return p.escalasSeg[bloco]
  return bloco % 2 === 1 ? (p.escalaCorte ?? 1.25) : 1.0 // o mesmo padrao do escalaNoCorte do VideoV1.tsx
}

export function eventos(p) {
  const ev = []
  if (p.abertura !== null) ev.push({ seg: 0, tipo: 'abertura' })
  const cortes = [...(p.cortesSeg ?? [])].sort((a, b) => a - b)
  // corte sem troca de escala nao muda o plano (movimento.md, MOV-01): nao e novidade
  cortes.forEach((c, i) => { if (escalaDoBloco(p, i) !== escalaDoBloco(p, i + 1)) ev.push({ seg: c, tipo: 'zoom' }) })
  for (const c of p.chaves ?? []) ev.push({ seg: c.deSeg, tipo: 'chave' })
  for (const c of p.cartoes ?? []) ev.push({ seg: c.deSeg, tipo: 'cartao' })
  for (const s of p.segmentos ?? []) { ev.push({ seg: s.deSeg, tipo: 'insercao' }); ev.push({ seg: s.ateSeg, tipo: 'insercao' }) }
  // so a entrada da onda e novidade: a onda mexendo depois e o mesmo elemento na tela, nao segura o trecho
  for (const o of p.ondas ?? []) ev.push({ seg: o.deSeg, tipo: 'onda' })
  for (const f of p.flashes ?? []) ev.push({ seg: f.seg, tipo: 'flash' })
  // p.sfx fica de fora de proposito: efeito sonoro sozinho nao e novidade
  if (p.empurrao) ev.push({ seg: p.empurrao.deSeg, tipo: 'empurrao' })
  return ev.filter((e) => e.seg >= 0 && e.seg <= p.duracaoSeg).sort((a, b) => a.seg - b.seg)
}

// fracao do video com algo por cima da pessoa (chave, cartao ou insercao)
export function cobertura(p) {
  const iv = [...(p.chaves ?? []), ...(p.cartoes ?? []), ...(p.segmentos ?? [])]
    .map((x) => [Math.max(0, x.deSeg), Math.min(p.duracaoSeg, x.ateSeg)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
  let total = 0, fim = -1
  for (const [a, b] of iv) { if (b <= fim) continue; total += b - Math.max(a, fim); fim = b }
  return p.duracaoSeg > 0 ? total / p.duracaoSeg : 0
}

export function maiorVao(p) {
  const marcos = [0, ...eventos(p).map((e) => e.seg), p.duracaoSeg]
  const vivos = (p.segmentos ?? []).filter((s) => s.tipo === 'video')
  let melhor = { de: 0, ate: 0 }
  for (let i = 1; i < marcos.length; i++) {
    const de = marcos[i - 1], ate = marcos[i]
    if (vivos.some((s) => de >= s.deSeg - 1e-6 && ate <= s.ateSeg + 1e-6)) continue
    if (ate - de > melhor.ate - melhor.de) melhor = { de, ate }
  }
  return melhor
}

export function falado(legendas, de, ate) {
  return legendas.filter((c) => c.startMs / 1000 >= de - 0.05 && c.startMs / 1000 < ate).map((c) => c.text.trim()).join(' ').trim()
}

const um = (x) => x.toFixed(1).replace('.', ',')

export function conferirDensidade(p, legendas, lim = LIMITES) {
  if (!(p.duracaoSeg > 0)) return { ok: false, falhas: ['o props.json nao tem duracaoSeg: gere as props com o preparar-props.py antes.'], medidas: {} }
  const falhas = []
  const unicos = eventos(p).filter((e, i, a) => i === 0 || e.seg - a[i - 1].seg >= JUNTA_SEG)
  const vao = maiorVao(p)
  if (vao.ate - vao.de > lim.vaoMaxSeg) {
    const fala = falado(legendas, vao.de, vao.ate)
    falhas.push(`de ${um(vao.de)} a ${um(vao.ate)} s (${um(vao.ate - vao.de)} s) nada novo entra na tela${fala ? `, so voce falando: "${fala}"` : ''}. Ponha ali uma troca de zoom, uma chave, um cartao ou um flash; efeito sonoro sozinho nao conta (limite ${um(lim.vaoMaxSeg)} s).`)
  }
  const porDez = unicos.length / p.duracaoSeg * 10
  if (porDez < lim.porDezSegMin) falhas.push(`${unicos.length} novidades em ${um(p.duracaoSeg)} s, ${um(porDez)} a cada 10 s (minimo ${um(lim.porDezSegMin)}).`)
  const cob = cobertura(p)
  if (cob < lim.coberturaMin) falhas.push(`so ${Math.round(cob * 100)}% do video tem chave, cartao ou insercao por cima (minimo ${Math.round(lim.coberturaMin * 100)}%).`)
  return { ok: falhas.length === 0, falhas, medidas: { vaoSeg: +(vao.ate - vao.de).toFixed(2), vaoDe: vao.de, porDezSeg: +porDez.toFixed(2), cobertura: +cob.toFixed(3), eventos: unicos.length } }
}

export function conferirPeca(pastaPeca) {
  const p = JSON.parse(readFileSync(join(pastaPeca, 'props.json'), 'utf8'))
  const leg = p.legendas ? JSON.parse(readFileSync(join(pastaPeca, 'public', p.legendas), 'utf8')) : []
  return conferirDensidade(p, leg)
}
