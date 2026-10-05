// Instala as bibliotecas do motor de video ("npm ci" dentro de <_video>/motor) e so
// depois de terminar sem erro grava a marca .lock-instalado com o hash do
// package-lock.json. Um npm ci que caiu no meio deixa o node_modules pela metade, e
// so a marca diz que a instalacao chegou ao fim. O sincronizar e o conferir comparam
// com ela.
// Uso: node .claude/skills/configurar-video/scripts/instalar-motor.mjs
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { caminhos, pastaVideo } from './lib/pasta-video.mjs'

export const MARCA = '.lock-instalado'

export function hashLock(motor) {
  const lock = join(motor, 'package-lock.json')
  if (!existsSync(lock)) return null
  return createHash('sha256').update(readFileSync(lock)).digest('hex')
}

export function marcaEmDia(motor) {
  const marca = join(motor, MARCA)
  const h = hashLock(motor)
  if (!h || !existsSync(marca)) return false
  return readFileSync(marca, 'utf8').trim() === h
}

// No Windows o npm e um .cmd, que o Node so chama por shell.
export function instalarMotor({ motor, plat = process.platform, executar = spawnSync }) {
  const marca = join(motor, MARCA)
  rmSync(marca, { force: true })
  const r = executar('npm', ['ci'], { cwd: motor, stdio: 'inherit', shell: plat === 'win32' })
  const ok = Boolean(r) && r.status === 0
  if (ok) writeFileSync(marca, hashLock(motor) + '\n')
  return { ok, codigo: r ? r.status : null }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const motor = caminhos(pastaVideo()).motor
  if (!existsSync(join(motor, 'package.json'))) {
    console.error(`Nao achei o motor em ${motor}. Rode antes node .claude/skills/configurar-video/scripts/sincronizar-motor.mjs`)
    process.exit(1)
  }
  if (marcaEmDia(motor)) {
    console.log('As bibliotecas do motor ja estao instaladas nesta versao, nada a fazer.')
    process.exit(0)
  }
  console.log(`Instalando as bibliotecas do motor em ${motor} (leva uns minutos)...`)
  const r = instalarMotor({ motor })
  if (!r.ok) {
    console.error('A instalacao das bibliotecas parou no meio. Confira a internet e rode este comando de novo.')
    process.exit(1)
  }
  console.log('Pronto: bibliotecas do motor instaladas.')
}
