// 5.56: o detector do programa e a frase unica de sair de vez. O env vai sempre explicito,
// porque a suite roda dentro da extensao e herdaria o claude-vscode.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { programa, fraseSair } from './programa.mjs'

test('programa: vscode, app, vazio e valor estranho', () => {
  assert.equal(programa({ CLAUDE_CODE_ENTRYPOINT: 'claude-vscode' }), 'vscode')
  assert.equal(programa({ CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' }), 'app')
  assert.equal(programa({ CLAUDE_CODE_ENTRYPOINT: 'claude-desktop-mac' }), 'app')
  assert.equal(programa({}), 'desconhecido')
  assert.equal(programa({ CLAUDE_CODE_ENTRYPOINT: '' }), 'desconhecido')
  assert.equal(programa({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), 'desconhecido')
  assert.equal(programa({ CLAUDE_CODE_ENTRYPOINT: 'claude-vscode-insiders' }), 'desconhecido')
})

test('fraseSair: cada programa fala so do seu, o desconhecido fala dos dois', () => {
  const vs = fraseSair('vscode')
  const app = fraseSair('app')
  const dois = fraseSair('desconhecido')
  assert.ok(vs.includes('VS Code: fecha todas as janelas') && !vs.includes('app do Claude'), vs)
  assert.ok(app.includes('app do Claude: ícone perto do relógio, botão direito, Sair') && !app.includes('VS Code'), app)
  assert.ok(dois.includes('VS Code: fecha todas as janelas; app do Claude: ícone perto do relógio, botão direito, Sair; no Mac, Cmd+Q nos dois'), dois)
  for (const f of [vs, app, dois]) {
    assert.ok(f.startsWith('espera terminar o que roda nas outras conversas e fecha de vez o programa onde você conversa comigo ('), f)
    assert.ok(f.endsWith(') e abre de novo nesta pasta, numa conversa nova. Gerenciador de Tarefas só se não fechar.'), f)
  }
  assert.equal(fraseSair('qualquer'), dois)
})

test('fraseSair: as tres formas do verbo, miolo igual', () => {
  assert.ok(fraseSair('app', 'saia').startsWith('espere terminar') && fraseSair('app', 'saia').includes(' e feche de vez ') && fraseSair('app', 'saia').includes(' e abra de novo '))
  assert.ok(fraseSair('app', 'sair').startsWith('esperar terminar') && fraseSair('app', 'sair').includes(' e fechar de vez ') && fraseSair('app', 'sair').includes(' e abrir de novo '))
  const miolo = f => f.slice(f.indexOf('('), f.indexOf(')') + 1)
  assert.equal(miolo(fraseSair('desconhecido', 'saia')), miolo(fraseSair('desconhecido', 'sai')))
})

test('fraseSair sem argumento le o programa do process.env', () => {
  assert.equal(fraseSair(), fraseSair(programa(process.env)))
})
