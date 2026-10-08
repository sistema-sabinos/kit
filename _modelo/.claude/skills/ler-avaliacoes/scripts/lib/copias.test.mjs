// Trava das duas copias: a lib da /ler-avaliacoes (nucleo) e a da /app-estudar (pacote
// criar-app) precisam ser iguais byte a byte, porque o nucleo nao pode importar do pacote.
// Mudou uma, copie pra outra.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PACOTE = resolve(AQUI, '..', '..', '..', 'app-estudar', 'scripts', 'lib')
const ESTE = 'copias.test.mjs'

const mjs = dir => readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== ESTE).sort()

test('lib da ler-avaliacoes igual byte a byte a da app-estudar', t => {
  if (!existsSync(PACOTE)) { t.skip('pacote criar-app nao instalado neste projeto'); return }
  const daqui = mjs(AQUI)
  const dele = mjs(PACOTE)
  assert.ok(daqui.length >= 6, `esperava ao menos 6 arquivos .mjs em ${AQUI}, achei ${daqui.length}`)
  assert.deepEqual(daqui, dele, 'as duas pastas lib tem arquivos diferentes')
  const diferentes = daqui.filter(f => !readFileSync(join(AQUI, f)).equals(readFileSync(join(PACOTE, f))))
  assert.deepEqual(diferentes, [], `copias divergentes: ${diferentes.join(', ')}`)
})
