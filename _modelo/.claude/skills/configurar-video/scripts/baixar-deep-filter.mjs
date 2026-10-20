// Baixa o DeepFilterNet (limpador de ruido da voz, roda no computador, gratis) pra <_video>/ferramentas/deep-filter/.
// So Windows x64 e Mac (arm64 e x64) tem programa pronto. Em outro sistema a voz vai pelo filtro afftdn do
// ffmpeg, que limpa menos mas funciona, e o script sai 0.
// Uso: node .claude/skills/configurar-video/scripts/baixar-deep-filter.mjs
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync, createWriteStream, writeFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { exe } from './lib/plataforma.mjs'
import { caminhos, pastaVideo } from './lib/pasta-video.mjs'
import { fetchComTimeout } from '../../mercado-livre/scripts/lib/fetch-timeout.mjs'

const BASE_URL = 'https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/'
export const URLS = {
  'win32-x64': BASE_URL + 'deep-filter-0.5.6-x86_64-pc-windows-msvc.exe',
  'darwin-arm64': BASE_URL + 'deep-filter-0.5.6-aarch64-apple-darwin',
  'darwin-x64': BASE_URL + 'deep-filter-0.5.6-x86_64-apple-darwin',
}
const MINIMO = 1024 * 1024
// Prazo do download inteiro: o programa e grande e a internet do aluno pode ser lenta,
// entao o prazo e longo, mas com fim, pra conexao presa nao pendurar a instalacao.
const PRAZO_DOWNLOAD_MS = 15 * 60_000

export async function baixarDeepFilter({ base, plat = process.platform, arch = process.arch, buscar = fetchComTimeout, avisar = console.log } = {}) {
  const url = URLS[`${plat}-${arch}`]
  if (!url) {
    avisar('Nao ha o limpador de voz DeepFilterNet pronto pra este computador. A voz vai pelo filtro afftdn do ffmpeg: limpa um pouco menos, mas funciona.')
    return { baixou: false, suportado: false }
  }
  const pasta = join(caminhos(base).ferramentas, 'deep-filter')
  const alvo = join(pasta, exe('deep-filter', plat))
  if (existsSync(alvo) && statSync(alvo).size > MINIMO) return { baixou: false, suportado: true, caminho: alvo }

  mkdirSync(pasta, { recursive: true })
  const parcial = alvo + '.parte'
  try {
    const r = await buscar(url, {}, { timeoutMs: PRAZO_DOWNLOAD_MS })
    // corpo do erro sem ler segura a conexao aberta e, sem o process.exit, o processo nao termina
    if (r && !r.ok) await r.body?.cancel()
    if (!r || !r.ok) throw new Error(`o download de ${url} falhou (status ${r ? r.status : 'sem resposta'}). Confira a internet e rode de novo.`)
    if (r.body) await pipeline(Readable.fromWeb(r.body), createWriteStream(parcial))
    else writeFileSync(parcial, Buffer.from(await r.arrayBuffer()))
    const tamanho = statSync(parcial).size
    if (tamanho <= MINIMO) throw new Error(`o arquivo baixado veio pequeno demais (${tamanho} bytes, esperado mais de 1 MB). Rode de novo mais tarde.`)
    renameSync(parcial, alvo)
  } finally {
    rmSync(parcial, { force: true })
  }
  if (plat !== 'win32') chmodSync(alvo, 0o755)
  return { baixou: true, suportado: true, caminho: alvo }
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
if (ehCli) {
  try {
    const r = await baixarDeepFilter({ base: pastaVideo() })
    if (r.baixou) console.log(`Pronto: limpador de voz instalado em ${r.caminho}.`)
    else if (r.suportado) console.log(`O limpador de voz ja esta instalado em ${r.caminho}.`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
