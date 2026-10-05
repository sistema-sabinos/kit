// Roda os tres gates no video final (zona segura, loudness e, so no VideoV2, o verificador de sincronia e
// duracao), junta as saidas e reprova se qualquer um reprovar, mostrando o conserto que o proprio gate sugeriu.
//
// uso: node conferir-final.mjs --slug <slug> [--tipo videov2|camadas]     (saida 1 se algum gate reprovar)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'
import { rodarPython } from '../../configurar-video/scripts/lib/plataforma.mjs'

const MOTOR_KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'motor')

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i

// Nome do arquivo (sem a pasta) de cada texto do props: "bruto/ba.mp4" cita ba.mp4 e nunca a.mp4.
function nomesCitados(texto) {
  const nomes = new Set()
  const andar = (v) => {
    if (typeof v === 'string') nomes.add(v.split(/[\\/]/).pop())
    else if (v && typeof v === 'object') Object.values(v).forEach(andar)
  }
  try { andar(JSON.parse(texto)) } catch { /* props ilegivel: nada citado */ }
  return nomes
}

// Bruto = so arquivo de video de verdade (sem pasta, dotfile, Thumbs.db). Com mais de um, vale o que o props cita;
// senao o primeiro em ordem alfabetica, com aviso dizendo qual foi.
export function escolherBruto(dir, propsPath) {
  if (!existsSync(dir)) return { escolhido: null }
  const videos = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.') && VIDEO.test(e.name))
    .map((e) => e.name).sort()
  if (!videos.length) return { escolhido: null }
  if (videos.length === 1) return { escolhido: videos[0] }
  const citados = nomesCitados(existsSync(propsPath) ? readFileSync(propsPath, 'utf8') : '')
  const citado = videos.find((n) => citados.has(n))
  if (citado) return { escolhido: citado }
  return { escolhido: videos[0], aviso: `aviso: ha ${videos.length} videos em bruto/ e o props nao cita nenhum; o verificador usou ${videos[0]}.` }
}

export function conferirFinal({ slug, tipo = 'videov2', raiz = RAIZ, base, motorKit = MOTOR_KIT, executar = spawnSync }) {
  const bas = base ?? pastaVideo({ raiz })
  const pastaPeca = join(raiz, 'producao', slug)
  const final = join(pastaPeca, 'final', `${slug}.mp4`)
  if (!existsSync(final)) throw new Error(`nao achei ${final}. Rode o render.mjs antes de conferir.`)

  const gates = [
    { nome: 'zona-segura', script: 'zona-segura.py', args: [final] },
    { nome: 'loudness', script: 'loudness.py', args: [final] },
  ]
  const avisos = []
  if (tipo === 'videov2') {
    const args = [join(pastaPeca, 'props.json'), final]
    const brutoDir = join(pastaPeca, 'bruto')
    const brutos = escolherBruto(brutoDir, join(pastaPeca, 'props.json'))
    if (brutos.escolhido) {
      args.push('--bruto', join(brutoDir, brutos.escolhido))
      if (brutos.aviso) avisos.push(brutos.aviso)
    }
    args.push('--public-dir', join(pastaPeca, 'public'))
    gates.push({ nome: 'verificar-video', script: 'verificar-video.py', args })
  }

  const partes = []
  const reprovados = []
  for (const g of gates) {
    const r = rodarPython(join(motorKit, 'scripts', g.script), g.args, { base: bas, executar })
    const saida = `${r.stdout || ''}${r.stderr || ''}`.trim()
    const ok = r.status === 0
    if (!ok) reprovados.push(g.nome)
    partes.push(`== ${g.nome}: ${ok ? 'PASSOU' : 'REPROVOU'}\n${saida}`)
  }
  const resumo = reprovados.length ? `REPROVADO em: ${reprovados.join(', ')}. O conserto sugerido esta acima, em cada gate.` : 'Os gates passaram.'
  return { ok: reprovados.length === 0, texto: [...partes, ...avisos, resumo].join('\n\n') }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const { values: v } = parseArgs({ options: { slug: { type: 'string' }, tipo: { type: 'string', default: 'videov2' } } })
    if (!v.slug) throw new Error('uso: node conferir-final.mjs --slug <slug> [--tipo videov2|camadas]')
    const r = conferirFinal({ slug: v.slug, tipo: v.tipo })
    console.log(r.texto)
    process.exit(r.ok ? 0 : 1)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
