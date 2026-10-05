// Onde mora a parte pesada do video (motor, ferramentas, biblioteca de midia): uma
// pasta _video na pasta-mae, que serve a todos os projetos. SABINOS_VIDEO no .env
// troca o lugar (por exemplo, quando o caminho padrao tem espaco e o whisper nao aceita).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { RAIZ } from '../../../mercado-livre/scripts/lib/raiz.mjs'
import { lerEnv } from '../../../mercado-livre/scripts/lib/env.mjs'

export function pastaVideo({ raiz = RAIZ, env } = {}) {
  const e = env ?? { ...lerEnv(join(raiz, '.env')), ...(process.env.SABINOS_VIDEO ? { SABINOS_VIDEO: process.env.SABINOS_VIDEO } : {}) }
  const v = e.SABINOS_VIDEO
  if (v) return isAbsolute(v) ? v : resolve(raiz, v)
  return resolve(raiz, '..', '_video')
}

export function caminhos(base) {
  return {
    base, motor: join(base, 'motor'), midia: join(base, 'midia'), ferramentas: join(base, 'ferramentas'),
    tmp: join(base, 'tmp'), py: join(base, 'py'), maquina: join(base, 'maquina.json'), pronto: join(base, 'pronto.json'),
  }
}

// Arquivo que comeca com ponto e do sistema ou da instalacao (.DS_Store do Mac, a marca
// .lock-instalado do npm ci): fica fora da comparacao e da copia. O .gitignore e a excecao,
// porque faz parte do motor do kit.
export const oculto = (nome) => nome.startsWith('.') && nome !== '.gitignore'

export function hashPasta(dir, { ignorar = ['node_modules', 'out', '.git'] } = {}) {
  const h = createHash('sha256')
  const andar = (d) => {
    for (const nome of readdirSync(d).sort()) {
      if (ignorar.includes(nome) || oculto(nome)) continue
      const p = join(d, nome)
      if (statSync(p).isDirectory()) andar(p)
      else { h.update(relative(dir, p).split(String.fromCharCode(92)).join('/')); h.update(readFileSync(p)) }
    }
  }
  andar(dir)
  return h.digest('hex').slice(0, 16)
}

export function lerJsonSe(caminho) {
  if (!existsSync(caminho)) return null
  try { return JSON.parse(readFileSync(caminho, 'utf8')) } catch { return null }
}

export function conferirPronto({ base, motorKit }) {
  const pronto = lerJsonSe(join(base, 'pronto.json'))
  if (!pronto) return { ok: false, motivo: 'o video ainda nao foi configurado nesta maquina: rode /configurar-video' }
  if (pronto.versaoMotor !== hashPasta(motorKit)) return { ok: false, motivo: 'o motor de video foi atualizado: rode /configurar-video de novo (so atualiza o que mudou)' }
  return { ok: true }
}
