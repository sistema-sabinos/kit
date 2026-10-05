// Transcreve um audio com o whisper.cpp (local, gratis) e grava as palavras com tempo no formato Caption do
// Remotion: [{ text, startMs, endMs, timestampMs, confidence }]. As legendas e o alinhamento do video saem daqui.
//
// uso: node transcrever.mjs <audio> <saida.json> [modelo]      (modelo: small ou medium, padrao small)
// A pasta do whisper vem da variavel WHISPER_DIR (obrigatoria). O idioma e o portugues; WHISPER_IDIOMA troca.
// Este script nunca troca de pasta de trabalho (chdir): o Remotion grava um "tmp" na pasta de onde ele roda.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VERSAO_WHISPER = '1.5.5'
export const MODELOS = ['small', 'medium']
const USO = 'uso: node transcrever.mjs <audio> <saida.json> [modelo]'

export function lerArgumentos(argv) {
  const [audio, saida, modelo = 'small'] = argv
  if (!audio || !saida) throw new Error(USO)
  if (!MODELOS.includes(modelo)) throw new Error(`modelo "${modelo}" desconhecido: use ${MODELOS.join(' ou ')}. ${USO}`)
  return { audio, saida, modelo }
}

// O instalador do whisper chama o Expand-Archive sem aspas, entao caminho com espaco quebra.
export function checarSemEspaco(caminho) {
  if (/\s/.test(caminho)) {
    throw new Error(`o caminho "${caminho}" tem espaco e o whisper nao aceita. Ponha SABINOS_VIDEO no .env apontando pra uma pasta sem espaco e rode /configurar-video de novo.`)
  }
}

// O whisper devolve pedaco de palavra ("Lab", "ub", "u"). Token que comeca com espaco abre palavra nova; o resto
// (inclusive pontuacao) cola na anterior. Marcacao de som ("[Musica]") e vazio saem.
export function juntarPalavras(tokens) {
  const palavras = []
  for (const t of tokens) {
    if (/^\s/.test(t.text) || palavras.length === 0) {
      palavras.push({ ...t })
    } else {
      const ant = palavras[palavras.length - 1]
      ant.text += t.text
      ant.endMs = Math.max(ant.endMs, t.endMs)
      ant.confidence = ant.confidence == null || t.confidence == null ? null : Math.min(ant.confidence, t.confidence)
    }
  }
  return palavras.filter((c) => c.text.trim() && !/^\s*[[(].*[\])]\s*$/.test(c.text))
}

export async function transcrever({ audio, saida, modelo, whisperDir, idioma = 'pt', executar = spawnSync }) {
  checarSemEspaco(whisperDir)
  // importa aqui dentro: o resto do arquivo se testa sem node_modules
  const { transcribe, toCaptions } = await import('@remotion/install-whisper-cpp')
  if (!existsSync(whisperDir)) throw new Error(`nao achei o whisper em ${whisperDir}. Rode o instalar-whisper.mjs (ou /configurar-video).`)
  const origem = resolve(audio)
  if (!existsSync(origem)) throw new Error(`nao achei o audio ${origem}`)
  const nome = basename(origem).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_')
  const wav = join(whisperDir, `${nome}.16k.wav`)
  try {
    const r = executar('ffmpeg', ['-y', '-loglevel', 'error', '-i', origem, '-ar', '16000', '-ac', '1', wav], { encoding: 'utf8' })
    if (r.status !== 0 || !existsSync(wav)) throw new Error(`o ffmpeg nao converteu o audio: ${(r.stderr || r.error || '').toString().slice(-400)}`)
    const bruto = await transcribe({
      model: modelo, whisperPath: whisperDir, whisperCppVersion: VERSAO_WHISPER, inputPath: wav,
      tokenLevelTimestamps: true, language: idioma, printOutput: false,
    })
    const { captions: tokens } = toCaptions({ whisperCppOutput: bruto })
    const palavras = juntarPalavras(tokens)
    mkdirSync(dirname(resolve(saida)), { recursive: true })
    writeFileSync(resolve(saida), JSON.stringify(palavras, null, 2) + '\n')
    return { palavras: palavras.length, tokens: tokens.length }
  } finally {
    rmSync(wav, { force: true })
  }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = lerArgumentos(process.argv.slice(2))
    const whisperDir = process.env.WHISPER_DIR
    if (!whisperDir) throw new Error('falta a variavel WHISPER_DIR (a pasta do whisper.cpp). Rode /configurar-video, que instala e mostra o caminho.')
    const r = await transcrever({ ...a, whisperDir, idioma: process.env.WHISPER_IDIOMA || 'pt' })
    console.log(`Pronto: ${r.palavras} palavras em ${a.saida}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
