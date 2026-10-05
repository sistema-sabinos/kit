// Poe o motor de video do kit (projeto Remotion) na pasta _video do aluno, e so mexe no que mudou.
// Nunca leva node_modules, out nem public; nunca apaga node_modules nem os videos do proprio aluno
// (src/videos/*.tsx e *.dados.json). Diz se precisa instalar as bibliotecas: quando o lock mudou ou
// quando falta a marca de um "npm ci" que terminou (instalar-motor.mjs), que a skill roda depois do sim do aluno.
// Uso: node .claude/skills/configurar-video/scripts/sincronizar-motor.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { caminhos, oculto, pastaVideo } from './lib/pasta-video.mjs'
import { marcaEmDia } from './instalar-motor.mjs'

const NAO_LEVA = ['node_modules', 'out', 'public']
const barra = String.fromCharCode(92)

function listar(raiz, { ignorar = NAO_LEVA } = {}) {
  const achados = []
  const andar = (d) => {
    if (!existsSync(d)) return
    for (const nome of readdirSync(d).sort()) {
      if (oculto(nome)) continue
      const p = join(d, nome)
      const rel = p.slice(raiz.length + 1).split(barra).join('/')
      if (!rel.includes('/') && ignorar.includes(nome)) continue
      if (statSync(p).isDirectory()) andar(p)
      else achados.push(rel)
    }
  }
  andar(raiz)
  return achados
}

const igual = (a, b) => existsSync(b) && statSync(a).size === statSync(b).size && readFileSync(a).equals(readFileSync(b))
const doAluno = (rel) => /^src\/videos\/(?!index\.ts$)/.test(rel)

export function sincronizarMotor({ origem, destino }) {
  const lockNovo = join(origem, 'package-lock.json')
  const lockAntigo = join(destino, 'package-lock.json')
  const lockMudou = existsSync(lockNovo) && !igual(lockNovo, lockAntigo)

  const copiados = []
  const doKit = listar(origem)
  for (const rel of doKit) {
    const de = join(origem, ...rel.split('/'))
    const para = join(destino, ...rel.split('/'))
    if (igual(de, para)) continue
    mkdirSync(dirname(para), { recursive: true })
    copyFileSync(de, para)
    copiados.push(rel)
  }

  const apagados = []
  const noKit = new Set(doKit)
  for (const rel of listar(destino)) {
    if (noKit.has(rel) || doAluno(rel)) continue
    rmSync(join(destino, ...rel.split('/')), { force: true })
    apagados.push(rel)
  }

  const precisaNpmCi = !marcaEmDia(destino)
  return { copiados, apagados, lockMudou, precisaNpmCi }
}

// Mesma regra do sincronizar: o motor de destino tem os mesmos arquivos e bytes do kit (fora o que e do aluno).
export function motorSincronizado({ origem, destino }) {
  // src/videos/index.ts o render de camadas reescreve a cada peca: nao conta como motor diferente
  const indice = (rel) => rel === 'src/videos/index.ts'
  const doKit = listar(origem).filter((rel) => !indice(rel))
  const noDestino = listar(destino).filter((rel) => !doAluno(rel) && !indice(rel))
  if (doKit.length !== noDestino.length || doKit.some((rel, i) => rel !== noDestino[i])) return false
  return doKit.every((rel) => igual(join(origem, ...rel.split('/')), join(destino, ...rel.split('/'))))
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const aqui = fileURLToPath(new URL('.', import.meta.url))
    const origem = resolve(aqui, '..', '..', 'editar-video', 'motor')
    if (!existsSync(origem)) throw new Error(`nao achei o motor do kit em ${origem}. Atualize o SabinOS e tente de novo.`)
    const destino = caminhos(pastaVideo()).motor
    const r = sincronizarMotor({ origem, destino })
    console.log(`Motor sincronizado em ${destino}: ${r.copiados.length} arquivo(s) atualizado(s), ${r.apagados.length} removido(s).`)
    if (r.precisaNpmCi) console.log('Proximo passo: instalar as bibliotecas com node .claude/skills/configurar-video/scripts/instalar-motor.mjs (a skill roda depois do seu sim).')
    else console.log('As bibliotecas do motor continuam as mesmas, nao precisa instalar de novo.')
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
