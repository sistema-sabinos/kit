// Acha a pasta-mae do SabinOS subindo a partir de uma pasta: a primeira (inclusive) que tem
// _modelo/ e VERSAO. Projeto aberto fora da pasta-mae devolve null.
// Tambem guarda a regra de onde mora a copia-mestra do conselheiro, usada pelo checar-apelido
// (onde criar) e pelo instalar (o que pode ir pro ~/.claude): <pasta-mae>/agentes/<apelido> ou,
// fora da pasta-mae, ~/.claude/conselheiros/<apelido>.
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

export function acharPastaMae(inicio = '.') {
  let dir = resolve(inicio)
  for (;;) {
    if (existsSync(join(dir, '_modelo')) && existsSync(join(dir, 'VERSAO'))) return dir
    const cima = dirname(dir)
    if (cima === dir) return null
    dir = cima
  }
}

// onde a copia-mestra do apelido mora, a partir do projeto aberto
export function pastaMestra(apelido, { projeto = '.', casa = homedir() } = {}) {
  const mae = acharPastaMae(projeto)
  return mae ? join(mae, 'agentes', apelido) : join(casa, '.claude', 'conselheiros', apelido)
}

// a pasta e uma copia-mestra: o pai e <pasta-mae>/agentes ou <casa>/.claude/conselheiros (no
// Windows sem diferenca de maiuscula, porque a letra do disco e o nome da pasta podem vir de
// outro jeito e ser a mesma pasta)
const igual = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
export function ehMestra(pasta, casa = homedir()) {
  const pai = dirname(resolve(pasta))
  if (igual(basename(pai), 'agentes') && acharPastaMae(dirname(pai)) === dirname(pai)) return true
  return igual(pai, resolve(casa, '.claude', 'conselheiros'))
}
