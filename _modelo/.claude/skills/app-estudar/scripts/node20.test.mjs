// Trava do Node 20: o /setup aceita Node 20 ou mais, entao nenhum script do pacote criar
// app (e da /ler-avaliacoes, que divide a lib) pode usar API que o Node 20.0 nao tem.
// A lista saiu de uma sonda rodada no Node 20.0.0 de verdade (typeof de cada uma deu
// undefined). Cada termo se monta por partes, pra este arquivo nao casar com ele mesmo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SKILLS = resolve(AQUI, '..', '..')
const ESTE = fileURLToPath(import.meta.url)

const p = (...partes) => partes.join('')
const PROIBIDOS = [
  p('RegExp', '.escape'), p('zlib', '.crc32'), p('glob', 'Sync'), p('Object', '.groupBy'),
  p('Map', '.groupBy'), p('Promise', '.withResolvers'), p('Array', '.fromAsync'),
  p('AbortSignal', '.any'), p('import.meta', '.dirname'), p('import.meta', '.filename'),
  p('getBuiltin', 'Module'), p('loadEnv', 'File'), p('Iterator', '.from'),
  p('.union', '('), p('.intersection', '('), p('.symmetric', 'Difference('),
  p('.isSubset', 'Of('), p('.isSuperset', 'Of('), p('.isDisjoint', 'From('),
]

function achar(texto) {
  return PROIBIDOS.filter(t => texto.includes(t))
}

function mjsDe(dir, saida = []) {
  for (const nome of readdirSync(dir).sort()) {
    if (nome === 'node_modules') continue
    const c = join(dir, nome)
    if (statSync(c).isDirectory()) mjsDe(c, saida)
    else if (nome.endsWith('.mjs') && c !== ESTE) saida.push(c)
  }
  return saida
}

test('canario: o detector acha termo do Node novo', () => {
  assert.deepEqual(achar('const r = ' + p('RegExp', '.escape') + '(s)'), [p('RegExp', '.escape')])
  assert.deepEqual(achar('const r = escapar(s)'), [])
})

test('nenhum script do pacote usa API que o Node 20.0 nao tem', () => {
  const pastas = readdirSync(SKILLS).filter(n => n.startsWith('app-') || n === 'ler-avaliacoes').sort()
  const arquivos = []
  for (const n of pastas) {
    const s = join(SKILLS, n, 'scripts')
    try { if (statSync(s).isDirectory()) mjsDe(s, arquivos) } catch {}
  }
  assert.ok(arquivos.length >= 20, `esperava ao menos 20 .mjs no pacote, achei ${arquivos.length}`)
  const ruins = []
  for (const a of arquivos) {
    const t = achar(readFileSync(a, 'utf8'))
    if (t.length) ruins.push(a.slice(SKILLS.length + 1) + ': ' + t.join(', '))
  }
  assert.deepEqual(ruins, [])
})
