import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coletar } from './coletar.mjs'

// montado em partes pra o Gate 1 nao confundir o id de teste com um anuncio real
const MLB = 'MLB' + '1234567890'

test('coletar segue sem as opinioes quando /reviews devolve 404, e avisa', async () => {
  const chamadas = []
  const mlGetFn = async (caminho) => {
    chamadas.push(caminho)
    if (caminho.startsWith('/reviews/item/')) throw Object.assign(new Error('nao achou'), { status: 404 })
    if (caminho === `/items/${MLB}`) return { id: MLB, title: 'Moedor Eletrico Inox', category_id: 'MLB0001', pictures: [{ secure_url: 'https://x/1.jpg' }], attributes: [] }
    if (caminho === `/items/${MLB}/description`) return { plain_text: 'Moedor de cafe.' }
    if (caminho.startsWith('/questions/search')) return { total: 1, questions: [{ text: 'Serve pra graos?' }] }
    throw new Error('caminho inesperado ' + caminho)
  }
  const r = await coletar(MLB, { token: 't', mlGetFn })
  assert.equal(r.mlb, MLB)
  assert.equal(r.duvidas.length, 1)
  const aviso = r.avisos.find((a) => /reviews/.test(a))
  assert.ok(aviso, 'tem que avisar que faltou reviews')
  assert.match(aviso, /404/)
  assert.ok(chamadas.length >= 4)
})

test('coletar falha com mensagem clara quando o item nao volta', async () => {
  const mlGetFn = async () => { throw Object.assign(new Error('x'), { status: 404 }) }
  await assert.rejects(() => coletar(MLB, { token: 't', mlGetFn }), new RegExp(MLB))
})

test('coletar explica o 403 de anuncio de outro vendedor e manda pra espionagem', async () => {
  const mlGetFn = async () => { throw Object.assign(new Error('x'), { status: 403 }) }
  await assert.rejects(() => coletar(MLB, { token: 't', mlGetFn }), (e) => {
    assert.match(e.message, /outro vendedor/)
    assert.match(e.message, /\/espionar-concorrente/)
    assert.match(e.message, /--de-espionagem=/)
    assert.ok(e.message.includes(`--mlb=${MLB}`), e.message)
    return true
  })
})
