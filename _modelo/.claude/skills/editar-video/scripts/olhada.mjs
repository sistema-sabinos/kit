// Quadros de olhada do videov2 ANTES do render: empacota o motor uma vez, tira 3 ou 4 quadros parados (still do
// Remotion) nos instantes que mais erram (plano mais fechado, primeira chave, chave no peito, cartao) e desenha
// por cima a zona segura, o topo da legenda, o rosto e a caixa da chave. Grava em producao/<slug>/olhada/.
// Nao reprova o video: e pra olhar antes de gastar o render inteiro. Mas quadro que nao sai, ou sai sem as guias,
// e falha (saida 1), porque sem ele nao ha o que olhar.
//
// uso: node olhada.mjs --slug <slug>
// Saida 3 = motor nao configurado ou desatualizado (rodar /configurar-video). Saida 1 = qualquer outra falha.
import { existsSync, mkdirSync, readFileSync, rmSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { caminhos, conferirPronto, pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'
import { rodarPython } from '../../configurar-video/scripts/lib/plataforma.mjs'
import { prepararPublic, refsBiblioteca, textoDaPeca } from './preparar-public.mjs'

const MOTOR_KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'motor')
const FPS = 30
const DEPOIS_DA_ENTRADA = 0.45 // videov2.md: antes disso a barra amarela ainda varre o lugar da chave

const escala = (p, bloco) => (p.escalasSeg && p.escalasSeg[bloco] !== undefined ? p.escalasSeg[bloco] : bloco % 2 === 1 ? (p.escalaCorte ?? 1.25) : 1)
const coberto = (p, seg) => (p.segmentos ?? []).some((s) => s.cheia && seg >= s.deSeg && seg < s.ateSeg)

// altura aproximada da chave na tela: apoio (58 px) mais a palavra (tamanho x 1,02, com a folga de 0,14 em do til)
export const alturaChave = (c) => Math.round((c.tamanho ?? 170) * 1.16 + (c.apoio ? 62 : 0))

export function instantesOlhada(p) {
  const lista = []
  const quer = (seg, motivo) => { if (seg >= 0 && seg < p.duracaoSeg) lista.push({ seg: +seg.toFixed(2), motivo }) }
  const cortes = [0, ...[...(p.cortesSeg ?? [])].sort((a, b) => a - b), p.duracaoSeg]
  let fechado = null
  for (let i = 0; i < cortes.length - 1; i++) {
    const meio = (cortes[i] + cortes[i + 1]) / 2
    if (coberto(p, meio)) continue
    if (!fechado || escala(p, i) > fechado.e) fechado = { e: escala(p, i), meio }
  }
  if (fechado) quer(fechado.meio, `plano mais fechado (${fechado.e})`)
  const chaves = (p.chaves ?? []).filter((c) => !coberto(p, c.deSeg + DEPOIS_DA_ENTRADA))
  if (chaves[0]) quer(chaves[0].deSeg + DEPOIS_DA_ENTRADA, `chave "${chaves[0].chave}"`)
  const peito = chaves.find((c) => c.topo >= 900 && c !== chaves[0])
  if (peito) quer(peito.deSeg + DEPOIS_DA_ENTRADA, `chave no peito "${peito.chave}"`)
  const cartao = (p.cartoes ?? [])[0]
  if (cartao) quer(cartao.deSeg + Math.max(0, ...cartao.linhas.map((l) => l.aSeg ?? 0)) + DEPOIS_DA_ENTRADA, 'cartao com todas as linhas')
  if (!lista.length) quer(p.duracaoSeg / 2, 'meio do video')
  const unicos = lista.sort((a, b) => a.seg - b.seg).filter((x, i, a) => i === 0 || x.seg - a[i - 1].seg >= 1)
  return unicos.slice(0, 4).map((x) => ({ ...x, quadro: Math.round(x.seg * FPS) }))
}

export function chavesNaTela(p, seg) {
  return (p.chaves ?? []).filter((c) => seg >= c.deSeg && seg < c.ateSeg).map((c) => `${c.topo},${alturaChave(c)}`)
}

const erro = (mensagem, codigo = 1) => Object.assign(new Error(mensagem), { codigo })

export function olhada({ slug, raiz = RAIZ, base, motorKit = MOTOR_KIT, executar = spawnSync }) {
  const bas = base ?? pastaVideo({ raiz })
  const c = caminhos(bas)
  const pr = conferirPronto({ base: bas, motorKit })
  if (!pr.ok) throw erro(pr.motivo, 3)
  const pastaPeca = join(raiz, 'producao', slug)
  const props = join(pastaPeca, 'props.json')
  if (!existsSync(props)) throw erro(`nao achei ${props}. Gere as props antes da olhada.`)
  const p = JSON.parse(readFileSync(props, 'utf8'))
  // o mesmo public do render.mjs: sem a midia da biblioteca no pacote, o quadro sairia sem a imagem ou nem sairia
  const pubPronto = prepararPublic({ pastaPeca, midia: c.midia, refs: refsBiblioteca(textoDaPeca(pastaPeca, 'videov2')) })
  if (pubPronto.faltando.length) throw erro(`faltam na midia: ${pubPronto.faltando.join(', ')}. Confira o nome no registro da biblioteca e rode a olhada de novo.`)
  const saida = join(pastaPeca, 'olhada')
  rmSync(saida, { recursive: true, force: true })
  mkdirSync(saida, { recursive: true })
  mkdirSync(c.tmp, { recursive: true })
  const cli = join(c.motor, 'node_modules', '@remotion', 'cli', 'remotion-cli.js')
  const pub = join(pastaPeca, 'public')
  const pacote = join(c.tmp, `olhada-${slug}`)
  const op = { cwd: c.motor, env: { ...process.env, TEMP: c.tmp, TMP: c.tmp }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  try {
    // empacota uma vez: cada still sobre o pacote pronto leva uns 5 s, contra 1 a 2 min empacotando de novo
    const b = executar(process.execPath, [cli, 'bundle', 'src/index.ts', `--out-dir=${pacote}`, `--public-dir=${pub}`], op)
    if (!b || b.status !== 0) throw erro(`o motor nao empacotou. ${String(b?.stderr || b?.error || '').slice(-600)}`)
    const linhas = []
    let falhou = 0
    for (const q of instantesOlhada(p)) {
      const png = join(saida, `q${String(q.quadro).padStart(5, '0')}.png`)
      const s = executar(process.execPath, [cli, 'still', pacote, 'VideoV2', png, `--frame=${q.quadro}`, `--props=${props}`, '--gl=angle'], op)
      if (!s || s.status !== 0 || !existsSync(png)) { falhou++; linhas.push(`${q.seg} s (${q.motivo}): o quadro nao saiu. ${String(s?.stderr || '').slice(-300)}`); continue }
      const args = [png, png, '--modelo', join(motorKit, 'scripts', 'modelos', 'face_detection_yunet_2023mar.onnx'),
        '--zona-segura', join(motorKit, 'scripts', 'zona-segura.py'), '--topo-legenda', String(p.topoLegenda ?? 1240),
        ...chavesNaTela(p, q.seg).flatMap((k) => ['--chave', k])]
      const g = rodarPython(join(motorKit, 'scripts', 'guias-olhada.py'), args, { base: bas, executar })
      // quadro sem guia nao tem as conferencias prometidas (rosto, chave, legenda): conta como falha
      if (!g || g.status !== 0) { falhou++; linhas.push(`${q.seg} s (${q.motivo}): as guias nao sairam. ${String(g?.stderr || g?.error || '').slice(-300)}`); continue }
      linhas.push(`${q.seg} s (${q.motivo}): ${png} ${String(g.stdout || g.stderr || '').trim().split(': ').slice(1).join(': ')}`)
    }
    if (falhou) throw Object.assign(erro(`${falhou} quadro(s) de olhada nao sairam ou ficaram sem as guias, e sem eles nao ha o que olhar:\n${linhas.join('\n')}\nLeia o detalhe, corrija e rode a olhada de novo antes do render.`), { linhas })
    return { pasta: saida, linhas }
  } finally {
    rmSync(pacote, { recursive: true, force: true })
  }
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
if (ehCli) {
  try {
    const { values: v } = parseArgs({ options: { slug: { type: 'string' } } })
    if (!v.slug) throw new Error('uso: node olhada.mjs --slug <slug>')
    const r = olhada({ slug: v.slug })
    console.log(`Quadros de olhada em ${r.pasta}:\n${r.linhas.join('\n')}\nAbra cada um antes do render.`)
  } catch (e) {
    console.error(e.message)
    process.exit(e.codigo ?? 1)
  }
}
