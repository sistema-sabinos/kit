// Renderiza a peca de ponta a ponta: confere que o motor esta pronto, monta o public por copia, roda o CLI do
// Remotion pelo node, confere que o mp4 e NOVO (nao sobra de outra rodada), mixa a musica e grava em
// producao/<slug>/final/<slug>.mp4. Se o render falhar, nada e mixado.
//
// uso: node render.mjs --slug <slug> --tipo videov2|camadas [--musica biblioteca/musica/...] [--musica-db -3] [--duck-ratio 2]
// Saida 3 = motor nao configurado ou desatualizado (rodar /configurar-video). Saida 1 = qualquer outra falha.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { caminhos, conferirPronto, pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'
import { rodarPython } from '../../configurar-video/scripts/lib/plataforma.mjs'
import { prepararPublic, refsBiblioteca, textoDaPeca } from './preparar-public.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MOTOR_KIT = resolve(AQUI, '..', 'motor')
// folga pro relogio do arquivo (o Windows grava a data de arquivo com atraso de alguns milissegundos)
const FOLGA_MS = 250

export class ErroRender extends Error {
  constructor(mensagem, codigo = 1) { super(mensagem); this.codigo = codigo }
}

export function idDaComposicao(slug) {
  return 'Camadas-' + slug.replace(/[^A-Za-z0-9-]/g, '')
}

// Conteudo de src/videos/index.ts: uma linha de import por video, em ordem, e a lista que o Root.tsx registra.
export function gerarIndiceVideos(nomes) {
  const ord = [...nomes].sort()
  const imports = ord.map((n, i) => `import * as v${i} from './${n}'`).join('\n')
  const itens = ord.map((n, i) => `  { id: '${idDaComposicao(n)}', Componente: v${i}.Componente, DURACAO_SEG: v${i}.DURACAO_SEG },`).join('\n')
  return `// Gerado pelo render.mjs: nao edite. Um arquivo por peca em camadas.\n${imports}${imports ? '\n' : ''}export const lista: { id: string, Componente: React.FC, DURACAO_SEG: number }[] = [\n${itens}${itens ? '\n' : ''}]\n`
}

function copiarCamadas({ pastaPeca, slug, motor }) {
  const comp = join(pastaPeca, 'composicao.tsx')
  if (!existsSync(comp)) throw new ErroRender(`nao achei ${comp}. A peca em camadas precisa do composicao.tsx.`)
  const dir = join(motor, 'src', 'videos')
  mkdirSync(dir, { recursive: true })
  copyFileSync(comp, join(dir, `${slug}.tsx`))
  const dados = join(pastaPeca, 'dados.json')
  if (existsSync(dados)) copyFileSync(dados, join(dir, `${slug}.dados.json`))
  // so a peca deste render: o bundler segue os imports, entao composicao quebrada de outra peca nao derruba esta
  writeFileSync(join(dir, 'index.ts'), gerarIndiceVideos([slug]))
}

function fresco(caminho, inicio) {
  return existsSync(caminho) && statSync(caminho).mtimeMs >= inicio - FOLGA_MS
}

export function render({
  slug, tipo, raiz = RAIZ, base, motorKit = MOTOR_KIT, musica, musicaDb = -3, duckRatio = 2,
  executar = spawnSync, pularPronto = false, agora = Date.now,
}) {
  if (!slug) throw new ErroRender('falta o --slug da peca')
  if (!['videov2', 'camadas'].includes(tipo)) throw new ErroRender('tipo invalido: use videov2 ou camadas')
  const bas = base ?? pastaVideo({ raiz })
  const c = caminhos(bas)
  if (!pularPronto) {
    const p = conferirPronto({ base: bas, motorKit })
    if (!p.ok) throw new ErroRender(p.motivo, 3)
  }
  const pastaPeca = join(raiz, 'producao', slug)
  const props = join(pastaPeca, 'props.json')
  if (tipo === 'videov2' && !existsSync(props)) throw new ErroRender(`nao achei ${props}. Gere as props da peca antes de renderizar.`)
  const musicaAbs = musica ? resolve(c.midia, ...musica.split('/')) : null
  if (musica && !existsSync(musicaAbs)) throw new ErroRender(`a musica ${musica} nao existe na midia (${c.midia}). Escolha uma do registro da biblioteca.`)

  const pub = prepararPublic({ pastaPeca, midia: c.midia, refs: refsBiblioteca(textoDaPeca(pastaPeca, tipo)) })
  if (pub.faltando.length) throw new ErroRender(`faltam na midia: ${pub.faltando.join(', ')}. Confira o nome no registro da biblioteca.`)

  if (tipo === 'camadas') copiarCamadas({ pastaPeca, slug, motor: c.motor })

  const saidaMotor = join(c.motor, 'out', `${slug}.mp4`)
  const final = join(pastaPeca, 'final', `${slug}.mp4`)
  mkdirSync(dirname(saidaMotor), { recursive: true })
  mkdirSync(c.tmp, { recursive: true })
  mkdirSync(dirname(final), { recursive: true })
  rmSync(saidaMotor, { force: true })
  rmSync(final, { force: true })

  const id = tipo === 'camadas' ? idDaComposicao(slug) : 'VideoV2'
  const cli = join(c.motor, 'node_modules', '@remotion', 'cli', 'remotion-cli.js')
  const args = [cli, 'render', 'src/index.ts', id, saidaMotor]
  if (existsSync(props)) args.push(`--props=${props}`)
  args.push(`--public-dir=${join(pastaPeca, 'public')}`, '--gl=angle')
  const inicio = agora()
  const r = executar(process.execPath, args, {
    cwd: c.motor, env: { ...process.env, TEMP: c.tmp, TMP: c.tmp }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  })
  // mp4 novo nao basta: um render que cai depois de gravar arquivo parcial tambem deixa mp4 novo, so o status entrega
  if (!r || r.status !== 0 || !fresco(saidaMotor, inicio)) {
    const dica = r && (r.stderr || r.error) ? ` Detalhe: ${String(r.stderr || r.error).slice(-600)}` : ''
    throw new ErroRender(`o render falhou (status ${r ? r.status : 'sem resposta'}, mp4 novo em ${saidaMotor}: ${fresco(saidaMotor, inicio) ? 'sim' : 'nao'}), e nada foi mixado.${dica}`)
  }

  if (musica) {
    const m = rodarPython(join(motorKit, 'scripts', 'mix-final.py'), [saidaMotor, musicaAbs, final, '--musica-db', String(musicaDb), '--duck-ratio', String(duckRatio)], { base: bas, executar })
    if (m.status !== 0 || !fresco(final, inicio)) {
      // mix que cai no meio pode deixar um final pela metade, que pareceria pronto
      rmSync(final, { force: true })
      throw new ErroRender(`o mix da musica falhou. ${String(m.stderr || m.error || '').slice(-600)}`)
    }
  } else {
    copyFileSync(saidaMotor, final)
  }
  return { saida: final, segundos: Math.round((agora() - inicio) / 1000) }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const { values: v } = parseArgs({ options: {
      slug: { type: 'string' }, tipo: { type: 'string' }, musica: { type: 'string' },
      'musica-db': { type: 'string', default: '-3' }, 'duck-ratio': { type: 'string', default: '2' },
    } })
    const r = render({ slug: v.slug, tipo: v.tipo, musica: v.musica, musicaDb: Number(v['musica-db']), duckRatio: Number(v['duck-ratio']) })
    console.log(`Pronto: ${r.saida} (${r.segundos} s de render e mix). Agora rode o conferir-final.mjs.`)
  } catch (e) {
    console.error(e.message)
    process.exit(e.codigo ?? 1)
  }
}
