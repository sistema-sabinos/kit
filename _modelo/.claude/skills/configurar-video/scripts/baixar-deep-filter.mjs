// Baixa o DeepFilterNet (limpador de ruido da voz, roda no computador, gratis) pra <_video>/ferramentas/deep-filter/.
// So Windows x64 e Mac (arm64 e x64) tem programa pronto. Em outro sistema a voz vai pelo filtro afftdn do
// ffmpeg, que limpa menos mas funciona, e o script sai 0.
// Uso: node .claude/skills/configurar-video/scripts/baixar-deep-filter.mjs
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync, createWriteStream, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { exe } from './lib/plataforma.mjs'
import { caminhos, pastaVideo } from './lib/pasta-video.mjs'

const BASE_URL = 'https://github.com/Rikorose/DeepFilterNet/releases/download/v0.5.6/'
export const URLS = {
  'win32-x64': BASE_URL + 'deep-filter-0.5.6-x86_64-pc-windows-msvc.exe',
  'darwin-arm64': BASE_URL + 'deep-filter-0.5.6-aarch64-apple-darwin',
  'darwin-x64': BASE_URL + 'deep-filter-0.5.6-x86_64-apple-darwin',
}
const MINIMO = 1024 * 1024

export async function baixarDeepFilter({ base, plat = process.platform, arch = process.arch, buscar = fetch, avisar = console.log } = {}) {
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
    const r = await buscar(url)
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

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const r = await baixarDeepFilter({ base: pastaVideo() })
    if (r.baixou) console.log(`Pronto: limpador de voz instalado em ${r.caminho}.`)
    else if (r.suportado) console.log(`O limpador de voz ja esta instalado em ${r.caminho}.`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
