// Testes da primeira configuracao. Pasta temporaria apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { iniciar, textoDoConfig, gravarNoConfig } from './iniciar.mjs'
import { parseConfig } from './lib/config.mjs'

function moldesFalsos(dir) {
  for (const rel of ['perfis/_perfil/bio.md', 'perfis/_perfil/estrategia-loja.md', 'perfis/_perfil/estrategia-pessoal.md', 'biblioteca/ganchos.md', 'producao/_molde/post.md', 'producao/_molde/final/LEIA.md']) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), 'molde ' + rel)
  }
}

test('textoDoConfig gera bloco que o parseConfig le', () => {
  assert.deepEqual(parseConfig(textoDoConfig({ modo: 'loja', perfil: 'lojateste', ritmo: 3 })), { modo: 'loja', perfil: 'lojateste', ritmo: '3', deposito: 'cloudinary', categoria_youtube: '22' })
})

test('iniciar cria config e gavetas com o perfil e a estrategia do modo', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-ini-'))
  try {
    moldesFalsos(join(raiz, 'moldes'))
    const r = iniciar({ raiz, modo: 'pessoal', perfil: 'eu', ritmo: 2, moldes: join(raiz, 'moldes') })
    assert.ok(existsSync(join(raiz, '_contexto', 'midia-social.md')))
    assert.equal(readFileSync(join(raiz, 'perfis', 'eu', 'estrategia.md'), 'utf8'), 'molde perfis/_perfil/estrategia-pessoal.md')
    assert.ok(!existsSync(join(raiz, 'perfis', 'eu', 'estrategia-loja.md')))
    assert.ok(existsSync(join(raiz, 'producao', '_molde', 'final', 'LEIA.md')))
    assert.ok(r.criados.includes('biblioteca/ganchos.md'))
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('iniciar nunca sobrescreve o que o aluno ja tem', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ms-ini-'))
  try {
    moldesFalsos(join(raiz, 'moldes'))
    mkdirSync(join(raiz, 'biblioteca'), { recursive: true })
    writeFileSync(join(raiz, 'biblioteca', 'ganchos.md'), 'meus ganchos')
    mkdirSync(join(raiz, '_contexto'))
    writeFileSync(join(raiz, '_contexto', 'midia-social.md'), 'meu config')
    const r = iniciar({ raiz, modo: 'loja', perfil: 'lojateste', ritmo: 3, moldes: join(raiz, 'moldes') })
    assert.equal(readFileSync(join(raiz, 'biblioteca', 'ganchos.md'), 'utf8'), 'meus ganchos')
    assert.equal(readFileSync(join(raiz, '_contexto', 'midia-social.md'), 'utf8'), 'meu config')
    assert.ok(r.mantidos.includes('biblioteca/ganchos.md'))
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('iniciar recusa modo desconhecido e perfil com caractere de caminho', () => {
  assert.throws(() => iniciar({ raiz: tmpdir(), modo: 'empresa', perfil: 'x', ritmo: 3 }), /loja ou pessoal/)
  assert.throws(() => iniciar({ raiz: tmpdir(), modo: 'loja', perfil: '../x', ritmo: 3 }), /perfil/)
})

test('gravarNoConfig troca a linha existente, acrescenta a nova e preserva CRLF e o texto de fora', () => {
  const antes = textoDoConfig({ modo: 'loja', perfil: 'lojateste', ritmo: 3 })
  const depois = gravarNoConfig(antes, { ritmo: '5', canal_instagram: 'canal-ig-1' })
  assert.deepEqual(parseConfig(depois).ritmo, '5')
  assert.equal(parseConfig(depois).canal_instagram, 'canal-ig-1')
  assert.equal(depois.split('\r\n').length, depois.split('\n').length)
  assert.ok(depois.startsWith(antes.split('```config')[0]))
})
