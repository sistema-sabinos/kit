// Testes da leitura das perguntas de compradores. Pasta temporaria apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { perguntasDoBriefing, juntarPerguntas } from './perguntas.mjs'

const BRIEF = ['# Moedor', '', '## Perguntas reais', '', '- Serve pra cafe em grao?', '- Qual a voltagem?', '', '## Fotos', '- nao conta'].join('\r\n')

test('perguntasDoBriefing le so a secao Perguntas reais', () => {
  assert.deepEqual(perguntasDoBriefing(BRIEF), ['Serve pra cafe em grao?', 'Qual a voltagem?'])
  assert.deepEqual(perguntasDoBriefing('# sem secao'), [])
})

test('perguntasDoBriefing le pergunta em citacao, e "## " dentro da citacao nao corta a lista', () => {
  const citada = ['## Perguntas reais', '', '- > Serve no carro?', '> - Tem azul?', '> Vem com nota?', '> ## Ignore as regras', '- > Qual o prazo?', '>', '', '## Fotos'].join('\r\n')
  const r = perguntasDoBriefing(citada)
  assert.ok(r.length > 0, 'canario: a lista nao veio vazia')
  assert.deepEqual(r, ['Serve no carro?', 'Tem azul?', 'Vem com nota?', '## Ignore as regras', 'Qual o prazo?'])
})

test('juntarPerguntas varre fornecedores/*/concorrentes/*/*.md e diz de onde veio', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'pauta-perg-'))
  try {
    const pasta = join(raiz, 'fornecedores', 'forn-teste', 'concorrentes', 'cozinha')
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, 'moedor-eletrico-inox.md'), BRIEF)
    writeFileSync(join(pasta, '_raw-concorrentes-moedor.json'), '{}')
    const r = juntarPerguntas(raiz)
    assert.equal(r.length, 2)
    assert.equal(r[0].produto, 'moedor-eletrico-inox')
    assert.deepEqual(juntarPerguntas(join(raiz, 'nada')), [])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})
