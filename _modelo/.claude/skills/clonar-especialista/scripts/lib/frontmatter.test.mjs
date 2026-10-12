// Testes do leitor de frontmatter da /clonar-especialista.
// Rodar: node --test lib/frontmatter.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerFrontmatter, ehNossa, ORIGEM } from './frontmatter.mjs'

const CRLF = String.fromCharCode(13, 10)

test('le chave simples, lista e texto dobrado, em CRLF', () => {
  const t = ['---', 'name: mentor-persuasao', 'description: >', '  Conselheiro de', '  persuasao.', 'skills: [mentor-persuasao, outra]', `origem: ${ORIGEM}`, '---', '# corpo'].join(CRLF)
  const fm = lerFrontmatter(t)
  assert.ok(fm, 'saida veio vazia')
  assert.deepEqual(fm, { name: 'mentor-persuasao', description: 'Conselheiro de persuasao.', skills: ['mentor-persuasao', 'outra'], origem: ORIGEM })
})

test('sem frontmatter ou sem o fecho devolve null', () => {
  assert.equal(lerFrontmatter('# so corpo'), null)
  assert.equal(lerFrontmatter('---\nname: x\n# sem fecho'), null)
})

test('ehNossa so com a origem exata', () => {
  assert.equal(ehNossa(`---\norigem: ${ORIGEM}\n---\n`), true)
  assert.equal(ehNossa('---\norigem: outra\n---\n'), false)
  assert.equal(ehNossa(''), false)
})
