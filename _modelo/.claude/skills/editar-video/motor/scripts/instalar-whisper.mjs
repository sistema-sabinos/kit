// Instala o whisper.cpp (versao 1.5.5, a que o Remotion sabe usar no Windows) e baixa o modelo de voz na pasta
// WHISPER_DIR (sem a variavel, <_video>/ferramentas/whisper.cpp, que e onde o py.mjs e o conferir procuram). Roda uma vez, no /configurar-video. O modelo vem da medicao da maquina: small (rapido) ou medium.
//
// uso: node instalar-whisper.mjs [--modelo small|medium]
// O Remotion baixa o zip na pasta de onde o comando roda, entao ela tambem nao pode ter espaco.
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSAO = '1.5.5'
const MODELOS = ['small', 'medium']

export function lerArgumentos(argv) {
  let modelo = 'small'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--modelo') modelo = argv[++i]
    else if (a.startsWith('--modelo=')) modelo = a.slice('--modelo='.length)
  }
  if (!MODELOS.includes(modelo)) throw new Error(`modelo invalido: use --modelo small ou --modelo medium`)
  return { modelo }
}

// O script mora em <_video>/motor/scripts/, entao a pasta do video sai de 2 niveis acima dele.
export function pastaDoWhisper({ env = process.env, aqui = dirname(fileURLToPath(import.meta.url)) } = {}) {
  return env.WHISPER_DIR || join(resolve(aqui, '..', '..'), 'ferramentas', 'whisper.cpp')
}

export function checarSemEspaco(caminho, rotulo) {
  if (/\s/.test(caminho)) {
    throw new Error(`${rotulo} "${caminho}" tem espaco e o instalador do whisper nao aceita. Ponha SABINOS_VIDEO no .env apontando pra uma pasta sem espaco e rode de novo.`)
  }
}

export function conferirModelo(pasta, modelo) {
  const arq = join(pasta, `ggml-${modelo}.bin`)
  if (!existsSync(arq)) throw new Error(`o modelo ${modelo} nao apareceu em ${arq}. Confira a internet e rode de novo.`)
  if (statSync(arq).size <= 0) throw new Error(`o modelo ${modelo} baixou vazio (tamanho zero). Apague ${arq} e rode de novo.`)
  return arq
}

export async function instalar({ modelo, whisperDir }) {
  const { installWhisperCpp, downloadWhisperModel } = await import('@remotion/install-whisper-cpp')
  checarSemEspaco(whisperDir, 'o caminho')
  checarSemEspaco(process.cwd(), 'a pasta de onde o comando roda')
  // so a pasta-mae: se a do whisper ja existir sem o programa, o Remotion acha que a instalacao ficou pela metade
  mkdirSync(dirname(whisperDir), { recursive: true })
  await installWhisperCpp({ to: whisperDir, version: VERSAO })
  await downloadWhisperModel({ model: modelo, folder: whisperDir })
  return conferirModelo(whisperDir, modelo)
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const { modelo } = lerArgumentos(process.argv.slice(2))
    const whisperDir = pastaDoWhisper()
    const arq = await instalar({ modelo, whisperDir })
    console.log(`Pronto: whisper ${VERSAO} e modelo ${modelo} em ${arq}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
