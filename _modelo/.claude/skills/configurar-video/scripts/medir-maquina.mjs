// Mede a maquina do aluno antes de instalar o video: disco livre, memoria e placa de
// video. Daqui sai o tamanho do whisper (o "cerebro" que escuta e escreve a legenda) e
// se os efeitos 3D ficam ligados. So vira pergunta o que impede de verdade.
// Uso: node .claude/skills/configurar-video/scripts/medir-maquina.mjs
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { statfsSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pastaVideo, caminhos } from './lib/pasta-video.mjs'
import { BYTES_MODELO } from './conferir.mjs'

export const GPU_DEDICADA = /nvidia|geforce|quadro|rtx|gtx|radeon rx|radeon pro|apple m\d/i

export function lerGpus(plat, executar = spawnSync) {
  const r = plat === 'win32'
    ? executar('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], { encoding: 'utf8' })
    : executar('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8' })
  if (!r || r.status !== 0) return []
  const linhas = String(r.stdout).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (plat === 'win32') return linhas
  return linhas.filter(l => l.startsWith('Chipset Model:')).map(l => l.slice('Chipset Model:'.length).trim())
}

const NOTA_3D = 'o 3D com relevo nao esta instalado nesta versao do kit (falta o modelo de profundidade): o cenario fica parado, que tambem fica bom.'

const MOTOR_BYTES = 0.8e9
const FOLGA_RENDER_BYTES = 1e9

// Pico de disco da instalacao: o motor, o modelo do whisper e a folga pra gerar o video.
// Musica e efeito nao entram: sao do aluno (licenca nao deixa o kit redistribuir).
// Arredonda pra cima, em GB com uma casa.
export function discoNecessarioGb({ modelo }) {
  return Math.ceil((MOTOR_BYTES + BYTES_MODELO[modelo] + FOLGA_RENDER_BYTES) / 1e8) / 10
}

export function decidir({ sistema, memoriaGb, discoLivreGb, gpus, temModeloProfundidade }) {
  const gpuDedicada = gpus.some(n => GPU_DEDICADA.test(n))
  const precisa = (modelo) => discoNecessarioGb({ modelo })
  const whisper = memoriaGb >= 16 && discoLivreGb >= precisa('medium') ? 'medium' : 'small'
  const falta = []
  if (discoLivreGb < precisa(whisper)) falta.push(`disco: so ${discoLivreGb} GB livres. A instalacao do video precisa de uns ${precisa(whisper)} GB livres (programas e folga pra gerar o video); depois de pronta ocupa menos. Libere espaco (o /otimizar-pc ajuda) ou escolha outra pasta com SABINOS_VIDEO.`)
  if (memoriaGb < 8) falta.push(`memoria: ${memoriaGb} GB. Gerar o video pede 8 GB; funciona, mas fica lento e pode travar com outros programas abertos. Quer seguir assim?`)
  return {
    sistema, memoriaGb, discoLivreGb, gpus, gpuDedicada,
    whisper,
    extras3d: gpuDedicada && temModeloProfundidade !== false, falta,
    ...(temModeloProfundidade === false ? { nota3d: NOTA_3D } : {}),
  }
}

function existente(p) { let d = p; while (!existsSync(d)) d = dirname(d); return d }

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const c = caminhos(pastaVideo())
  const s = statfsSync(existente(c.base))
  const r = decidir({
    sistema: process.platform,
    memoriaGb: Math.round(os.totalmem() / 1e9),
    discoLivreGb: Math.round(Number(s.bavail) * Number(s.bsize) / 1e9),
    gpus: lerGpus(process.platform),
    temModeloProfundidade: existsSync(join(c.ferramentas, 'depth', 'model.onnx')),
  })
  mkdirSync(c.base, { recursive: true })
  writeFileSync(c.maquina, JSON.stringify({ ...r, medidoEm: new Date().toISOString() }, null, 2) + '\n')
  console.log(JSON.stringify(r, null, 2))
}
