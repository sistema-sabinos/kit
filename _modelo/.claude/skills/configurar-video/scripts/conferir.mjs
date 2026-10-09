// Confere o que falta instalar pro video e devolve, pra cada item, o comando do
// sistema de quem esta rodando. So le: nao instala nada. Sai 0 se tudo esta pronto
// e 1 se falta algo, pra quem chama (a skill) saber o que mostrar ao aluno.
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { python, exe } from './lib/plataforma.mjs'
import { caminhos, pastaVideo, lerJsonSe } from './lib/pasta-video.mjs'
import { marcaEmDia } from './instalar-motor.mjs'

const LIBS = 'numpy opencv-python pillow scipy onnxruntime'

// Comando oficial do Homebrew (conferido em https://brew.sh em 2026-10-04). Ele pede a senha do Mac
// e, se faltar, baixa as ferramentas de compilar da Apple (Command Line Tools, uns 2 GB).
const BREW = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'

// As mesmas 4 flags do setup: sem elas o winget pode parar perguntando do acordo da fonte num
// shell sem entrada.
const WINGET = (id) => `winget install --id ${id} -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity`

export const ITENS = [
  { id: 'brew', mb: 2000, mac: BREW, soMac: true },
  { id: 'node', mb: 100, win: WINGET('OpenJS.NodeJS.LTS'), mac: 'brew install node' },
  { id: 'python', mb: 100, win: WINGET('Python.Python.3.12'), mac: 'brew install python@3.12' },
  { id: 'python-libs', mb: 150, win: `<py> -m pip install ${LIBS}`, mac: `python3.12 -m venv <_video>/py && <_video>/py/bin/pip install ${LIBS}` },
  { id: 'ffmpeg', mb: 200, win: WINGET('Gyan.FFmpeg'), mac: 'brew install ffmpeg-full && brew link --overwrite --force ffmpeg-full' },
  { id: 'motor', mb: 750, cmd: 'node .claude/skills/configurar-video/scripts/sincronizar-motor.mjs && node .claude/skills/configurar-video/scripts/instalar-motor.mjs' },
  { id: 'whisper', mb: 500, cmd: 'node <_video>/motor/scripts/instalar-whisper.mjs --modelo <modelo>' },
  { id: 'deep-filter', mb: 26, cmd: 'node .claude/skills/configurar-video/scripts/baixar-deep-filter.mjs' },
]
// Musica e efeito sonoro nao sao item: o aluno baixa os dele (a licenca do Mixkit e do Pixabay
// nao deixa o kit redistribuir os arquivos). Ver o passo 5 do /editar-video.

// Tamanho exato de cada modelo do whisper, da tabela modelSizes do @remotion/install-whisper-cpp
// 4.0.527 (a versao do motor). Download que caiu no meio deixa o arquivo menor e o whisper quebra.
export const BYTES_MODELO = { small: 487601967, medium: 1533763059 }

const tamanhoPadrao = (p) => { try { return statSync(p).size } catch { return 0 } }

export function conferir({ plat = process.platform, base, executar = spawnSync, existe = existsSync, tamanho = tamanhoPadrao, env = process.env, modeloWhisper } = {}) {
  const c = caminhos(base)
  const py = python(plat, base)
  const rodar = (cmd, args) => { try { return executar(cmd, args, { encoding: 'utf8' }) } catch { return { status: null, stdout: '' } } }
  const saida = (r) => `${r?.stdout ?? ''}${r?.stderr ?? ''}`
  const modeloMedido = modeloWhisper || lerJsonSe(c.maquina)?.whisper
  const modelo = modeloMedido || 'small'   // so pra achar o arquivo; sem medicao o item nao fica ok

  const brewR = plat === 'darwin' ? rodar('/bin/sh', ['-c', 'command -v brew']) : null
  const nodeR = rodar('node', ['--version'])
  const major = Number(/v?(\d+)/.exec(saida(nodeR))?.[1])
  const pyR = rodar(py.cmd, [...py.base, '--version'])
  const libsR = rodar(py.cmd, [...py.base, '-c', 'import numpy, cv2, PIL, scipy'])
  const ffR = rodar('ffmpeg', ['-hide_banner', '-filters'])
  const binWhisper = join(c.ferramentas, 'whisper.cpp', exe('main', plat))
  const modeloBin = join(c.ferramentas, 'whisper.cpp', `ggml-${modelo}.bin`)

  const estado = {
    brew: [brewR?.status === 0, 'Homebrew, o instalador de programas do Mac. Ele pede a senha do Mac e baixa as ferramentas de compilar da Apple, que o whisper usa'],
    node: [major >= 20, nodeR.status === 0 ? `versao ${saida(nodeR).trim()}` : 'node nao respondeu'],
    python: [pyR.status === 0 && saida(pyR).trim().startsWith('Python 3.12'), saida(pyR).trim() || 'python 3.12 nao respondeu'],
    'python-libs': [libsR.status === 0, libsR.status === 0 ? 'numpy, cv2, PIL e scipy importam' : 'faltam bibliotecas do Python'],
    ffmpeg: [ffR.status === 0 && saida(ffR).includes(' subtitles '), ffR.status === 0 ? 'precisa do filtro subtitles (libass) pra legenda' : 'ffmpeg nao respondeu'],
    motor: [existe(join(c.motor, 'node_modules', 'remotion')) && marcaEmDia(c.motor), 'bibliotecas do motor instaladas ate o fim, na versao do kit'],
    whisper: modeloMedido
      ? (existe(binWhisper) && existe(modeloBin) && tamanho(modeloBin) !== BYTES_MODELO[modelo]
        ? [false, `o modelo ${modelo} esta incompleto (download que caiu no meio): apague o ggml-${modelo}.bin e rode de novo`]
        : [existe(binWhisper) && tamanho(modeloBin) === BYTES_MODELO[modelo], `programa e modelo ${modelo}`])
      : [false, 'rode o medir-maquina antes: e ele que decide se o modelo e small ou medium'],
    'deep-filter': [existe(join(c.ferramentas, 'deep-filter', exe('deep-filter', plat))), 'limpador de ruido'],
  }

  const itens = ITENS.filter((i) => !i.soMac || plat === 'darwin').map((i) => {
    const [ok, detalhe] = estado[i.id]
    const modelo_mb = i.id === 'whisper' && modelo === 'medium' ? 1500 : i.mb
    const bruto = i.cmd ?? (plat === 'win32' ? i.win : i.mac)
    const instalar = (i.id === 'whisper' && !modeloMedido ? 'node .claude/skills/configurar-video/scripts/medir-maquina.mjs' : bruto.split('<modelo>').join(modelo)).replace(/<_video>\/(\S+)/g, (_, resto) => join(base, ...resto.split('/'))).split('<py>').join([py.cmd, ...py.base].join(' '))
    return { id: i.id, mb: modelo_mb, ok, detalhe, instalar }
  })

  const out = { itens, pastaComEspaco: /\s/.test(base ?? '') }
  if (out.pastaComEspaco) out.sugestaoPasta = plat === 'win32' ? join((env.SystemDrive || '') + sep, 'sabinos-video') : join(homedir(), 'sabinos-video')
  return out
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const r = conferir({ base: pastaVideo() })
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.itens.every((i) => i.ok) ? 0 : 1)
}
