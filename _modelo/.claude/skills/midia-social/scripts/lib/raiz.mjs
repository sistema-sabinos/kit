// Onde fica a raiz do projeto, vista de dentro desta lib.
// A lib mora em <projeto>/.claude/skills/midia-social/scripts/lib/, cinco niveis abaixo da raiz.
// Dentro do kit, a "raiz" e o _modelo/.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const RAIZ = resolve(AQUI, '..', '..', '..', '..', '..')
