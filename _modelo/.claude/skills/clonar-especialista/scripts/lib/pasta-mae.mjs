// Acha a pasta-mae do SabinOS subindo a partir de uma pasta: a primeira (inclusive) que tem
// _modelo/ e VERSAO. Projeto aberto fora da pasta-mae devolve null.
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export function acharPastaMae(inicio = '.') {
  let dir = resolve(inicio)
  for (;;) {
    if (existsSync(join(dir, '_modelo')) && existsSync(join(dir, 'VERSAO'))) return dir
    const cima = dirname(dir)
    if (cima === dir) return null
    dir = cima
  }
}
