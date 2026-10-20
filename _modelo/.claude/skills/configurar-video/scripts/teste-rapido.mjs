// Teste curtinho (a duracao da fala do kit, uns 5 segundos): faz de verdade o caminho curto do video (bruto, limpeza da voz, legenda pelo whisper,
// render do Remotion) com uma fala do proprio kit. Se o mp4 sai com a duracao da fala e a legenda acerta o que foi
// dito, grava o pronto.json, que e o "carimbo" que o resto do video confere antes de rodar.
// Uso: node .claude/skills/configurar-video/scripts/teste-rapido.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { caminhos, hashPasta, lerJsonSe, pastaVideo } from './lib/pasta-video.mjs'
import { exe, rodarPython } from './lib/plataforma.mjs'
import { motorSincronizado } from './sincronizar-motor.mjs'
import { render } from '../../editar-video/scripts/render.mjs'

const AQUI = fileURLToPath(new URL('.', import.meta.url))
const MOTOR_KIT = resolve(AQUI, '..', '..', 'editar-video', 'motor')
const VOZ_DO_KIT = resolve(AQUI, '..', 'referencias', 'teste-voz.wav')

export const PALAVRAS = ['teste', 'sistema', 'video', 'ouvindo', 'certo']
const MINIMO_PALAVRAS = 3
const TOLERANCIA_SEG = 0.5

const normalizar = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function conferirResultado({ palavras, duracaoSeg, esperadaSeg }) {
  const ditas = new Set(palavras.map((p) => normalizar(p.text)))
  const achadas = PALAVRAS.filter((p) => ditas.has(p))
  const motivos = []
  if (achadas.length < MINIMO_PALAVRAS) motivos.push(`a legenda acertou so ${achadas.length} das palavras do teste (precisa de ${MINIMO_PALAVRAS}): ${PALAVRAS.join(', ')}`)
  if (!(Math.abs(duracaoSeg - esperadaSeg) <= TOLERANCIA_SEG + 1e-9)) motivos.push(`o video dura ${duracaoSeg.toFixed(2)} s e devia durar entre ${(esperadaSeg - TOLERANCIA_SEG).toFixed(2)} e ${(esperadaSeg + TOLERANCIA_SEG).toFixed(2)} s (a duracao da fala do teste)`)
  return { ok: motivos.length === 0, motivos, achadas }
}

export function gravarPronto({ base, versaoMotor, whisper, sistema, agora = () => new Date() }) {
  mkdirSync(base, { recursive: true })
  writeFileSync(caminhos(base).pronto, JSON.stringify({ em: agora().toISOString(), versaoMotor, whisper, sistema }, null, 2) + '\n')
}

function rodar(executar, cmd, args, op, rotulo) {
  const r = executar(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...op })
  if (!r || r.status !== 0) throw new Error(`${rotulo} falhou. ${String((r && (r.stderr || r.error)) || '').slice(-600)}`)
  return r
}

// vozTeste: so pra prova da bancada (uma fala gerada fora do kit); o aluno sempre usa a do kit.
export async function testeRapido({ base, motorKit = MOTOR_KIT, vozPadrao = VOZ_DO_KIT, vozTeste, executar = spawnSync, agora = () => new Date(), apagar = rmSync }) {
  const voz = vozTeste ?? vozPadrao
  if (!existsSync(voz)) throw new Error('falta referencias/teste-voz.wav (arquivo do kit). Atualize o SabinOS e rode de novo.')
  const c = caminhos(base)
  if (!motorSincronizado({ origem: motorKit, destino: c.motor })) throw new Error('o motor em ' + c.motor + ' esta diferente do motor do kit. Rode node .claude/skills/configurar-video/scripts/sincronizar-motor.mjs (e instalar-motor.mjs, se ele pedir) e depois o teste-rapido de novo.')
  const pasta = join(c.tmp, 'teste-rapido')
  // No Windows o video do teste aberto num player segura a pasta (EPERM, EBUSY): recado, nunca o erro cru
  try { apagar(pasta, { recursive: true, force: true }) } catch (e) {
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e
    throw new Error(`um arquivo de ${pasta} esta aberto em outro programa (em geral o video do teste no player). Feche o video no player e rode de novo.`)
  }
  const raiz = join(pasta, 'raiz')
  const pastaPeca = join(raiz, 'producao', 'teste')
  const pub = join(pastaPeca, 'public')
  mkdirSync(pub, { recursive: true })
  const modelo = lerJsonSe(c.maquina)?.whisper || 'small'
  const deepFilter = join(c.ferramentas, 'deep-filter', exe('deep-filter'))

  // 1. bruto com a duracao da fala (medida pelo ffprobe): tela cinza 1080x1920 com a fala
  const medida = rodar(executar, 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', voz], {}, 'medir a duracao da fala (ffprobe)')
  const esperadaSeg = Number(String(medida.stdout).trim())
  if (!(esperadaSeg > 0)) throw new Error('nao consegui medir a duracao de ' + voz)
  const bruto = join(pasta, 'bruto.mp4')
  rodar(executar, 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=1080x1920:r=30:d=' + esperadaSeg, '-i', voz,
    '-t', String(esperadaSeg), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', bruto], {}, 'montar o video bruto de teste (ffmpeg)')

  // 2. limpeza da voz
  const vozTratada = join(pub, 'voz.wav')
  const env = { ...process.env, ...(existsSync(deepFilter) ? { DEEP_FILTER: deepFilter } : {}) }
  const t = rodarPython(join(motorKit, 'scripts', 'tratar-voz.py'), [bruto, vozTratada], { base, executar, env })
  if (!t || t.status !== 0 || !existsSync(vozTratada)) throw new Error('a limpeza da voz nao gerou o arquivo. Rode o conferir.mjs pra ver o que falta.')
  copyFileSync(bruto, join(pub, 'pessoa.mp4'))

  // 3. legenda pelo whisper (roda a copia do motor em _video, onde moram as bibliotecas)
  const legendas = join(pub, 'voz.alinhado.json')
  rodar(executar, process.execPath, [join(c.motor, 'scripts', 'transcrever.mjs'), vozTratada, legendas, modelo],
    { cwd: pasta, env: { ...process.env, WHISPER_DIR: join(c.ferramentas, 'whisper.cpp') } }, 'a legenda (whisper)')
  const palavras = JSON.parse(readFileSync(legendas, 'utf8'))

  // 4. render pelo mesmo caminho do render.mjs (so este teste pula o carimbo, porque e ele que cria o carimbo)
  writeFileSync(join(pastaPeca, 'props.json'), JSON.stringify({
    pessoa: 'pessoa.mp4', voz: 'voz.wav', legendas: 'voz.alinhado.json', duracaoSeg: esperadaSeg,
    alturaTela: 0, recorteTopoPessoa: 0, cortesSeg: [], segmentos: [],
    // vazios de proposito: o Remotion mistura os props com o exemplo do motor, e o exemplo cita um efeito sonoro da biblioteca
    chaves: [], sfx: [], cartoes: [], flashes: [],
  }, null, 2) + '\n')
  // vazio de proposito: o gate de densidade do render nao vale pro teste do motor
  const r = render({ slug: 'teste', tipo: 'videov2', raiz, base, motorKit, pularPronto: true, executar, semDensidade: true })

  // 5. conferencia
  const sonda = rodar(executar, 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', r.saida], {}, 'medir a duracao (ffprobe)')
  const duracaoSeg = Number(String(sonda.stdout).trim())
  const res = conferirResultado({ palavras, duracaoSeg, esperadaSeg })
  if (res.ok) gravarPronto({ base, versaoMotor: hashPasta(motorKit), whisper: modelo, sistema: process.platform, agora })
  return { ...res, duracaoSeg, saida: r.saida, segundos: r.segundos, palavras: palavras.length }
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
if (ehCli) {
  try {
    const base = pastaVideo()
    console.log(`Teste curtinho em ${base} (leva alguns minutos na primeira vez)...`)
    const r = await testeRapido({ base })
    if (!r.ok) {
      console.error(`O teste NAO passou: ${r.motivos.join('; ')}.`)
      process.exitCode = 1
    } else {
      console.log(`Passou: video de ${r.duracaoSeg.toFixed(1)} s em ${r.saida}, palavras achadas: ${r.achadas.join(', ')}. O video esta pronto pra usar.`)
    }
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
