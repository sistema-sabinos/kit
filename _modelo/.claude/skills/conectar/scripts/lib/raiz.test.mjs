// A raiz da lib comum e a do ML (que hoje reexporta a comum) resolvem a mesma pasta num
// projeto montado de verdade, fora do kit. Mover a lib de altura mudaria a conta de niveis e
// gravaria na pasta errada sem erro. Rodar: node --test raiz.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, copyFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SKILLS = fileURLToPath(new URL('../../../', import.meta.url))

test('RAIZ do conectar e do mercado-livre apontam pra raiz do projeto montado', async () => {
  const projeto = realpathSync(mkdtempSync(join(tmpdir(), 'raiz-')))
  try {
    for (const skill of ['conectar', 'mercado-livre']) {
      const lib = join(projeto, '.claude', 'skills', skill, 'scripts', 'lib')
      mkdirSync(lib, { recursive: true })
      copyFileSync(join(SKILLS, skill, 'scripts', 'lib', 'raiz.mjs'), join(lib, 'raiz.mjs'))
    }
    const lib = s => pathToFileURL(join(projeto, '.claude', 'skills', s, 'scripts', 'lib', 'raiz.mjs')).href
    const comum = (await import(lib('conectar'))).RAIZ
    const doMl = (await import(lib('mercado-livre'))).RAIZ
    assert.equal(comum, projeto)
    assert.equal(doMl, comum)
  } finally { rmSync(projeto, { recursive: true, force: true }) }
})
