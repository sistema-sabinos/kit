// Comando de cada sistema num lugar so. No Windows o Python e o lancador "py -3.12"
// (o "python3" de la e um atalho falso da Microsoft Store); no Mac e o python3 do
// ambiente proprio do video, quando a instalacao criou um. Binario com .exe so no
// Windows. Sem o ambiente proprio, o Mac usa python3.12, o nome que o
// "brew install python@3.12" poe no PATH (o python3 de la pode ser outra versao).
// Nenhum outro script do video escolhe comando por conta propria.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function python(plat = process.platform, base) {
  if (plat === 'win32') return { cmd: 'py', base: ['-3.12'] }
  const proprio = base ? join(base, 'py', 'bin', 'python3') : null
  if (proprio && existsSync(proprio)) return { cmd: proprio, base: [] }
  return { cmd: plat === 'darwin' ? 'python3.12' : 'python3', base: [] }
}

export function exe(nome, plat = process.platform) {
  return plat === 'win32' ? `${nome}.exe` : nome
}

// No Git Bash, "tar" sem caminho e o GNU tar, que grava tar puro com nome .zip e nao
// le zip. O do Windows (bsdtar) mora em System32. No Mac, o bsdtar do sistema mora em
// /usr/bin, e um gnu-tar instalado pelo brew pode vir antes dele no PATH.
export function tarDoSistema(plat = process.platform, env = process.env) {
  if (plat === 'darwin') return '/usr/bin/tar'
  if (plat !== 'win32') return 'tar'
  const raiz = env.SystemRoot || env.windir
  if (!raiz) throw new Error('nao achei a pasta do Windows (variavel SystemRoot vazia)')
  return join(raiz, 'System32', 'tar.exe')
}

export function rodarPython(script, args = [], { plat = process.platform, base, executar = spawnSync, ...op } = {}) {
  const p = python(plat, base)
  return executar(p.cmd, [...p.base, script, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...op })
}
