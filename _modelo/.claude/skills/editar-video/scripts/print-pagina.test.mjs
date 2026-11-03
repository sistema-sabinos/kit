// Prova o print de pagina da inserção no Chrome de verdade, em modo sem janela, com uma pagina local. O Playwright vem
// do projeto ou, na bancada, da pasta em SABINOS_PLAYWRIGHT; sem nenhum dos dois os testes aparecem como PULADOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { acharPlaywright, INSTALAR } from '../../gerar-imagens/scripts/lib/render.mjs'
import { printar } from './print-pagina.mjs'

async function carregarPlaywright() {
  const caminhos = []
  try { caminhos.push(acharPlaywright()) } catch {}
  if (process.env.SABINOS_PLAYWRIGHT) {
    try { caminhos.push(createRequire(join(process.env.SABINOS_PLAYWRIGHT, 'package.json')).resolve('playwright')) } catch {}
  }
  for (const c of caminhos) { try { return await import(pathToFileURL(c).href) } catch {} }
  return null
}
const pw = await carregarPlaywright()
const pular = pw ? false : `sem Playwright. Rode na raiz do projeto: ${INSTALAR}`
const carregar = async () => pw

// largura e altura do PNG pelo cabecalho IHDR
const tamanhoPng = (arq) => { const b = readFileSync(arq); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

const PAGINA = '<!doctype html><meta name="viewport" content="width=device-width"><body style="font:18px sans-serif">'
  + '<p>' + 'Texto de enchimento. '.repeat(200) + '</p><p id="alvo">O dinheiro   na conta não possui a cobertura direta do FGC.</p>'
  + '<p>' + 'Mais texto. '.repeat(200) + '</p></body>'

test('5.48: print-pagina sai em 1080 por 1920 com a frase marcada no meio da tela', { skip: pular }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'print-'))
  try {
    writeFileSync(join(d, 'p.html'), PAGINA)
    const sai = join(d, 'print.png')
    // espaco repetido na pagina e maiuscula na frase pedida nao atrapalham
    const { centro } = await printar({ fonte: join(d, 'p.html'), saida: sai, marcar: 'na conta NÃO possui a cobertura direta', carregar })
    const [w, h] = tamanhoPng(sai)
    assert.ok(Math.abs(w - 1080) <= 2 && Math.abs(h - 1920) <= 3, `${w}x${h}`)
    assert.ok(centro > 0.35 && centro < 0.65, `a frase ficou em ${centro} da altura`)
    // canario: sem marcar, a pagina abre no topo, e a frase (depois de 200 linhas) fica fora da tela
    const sem = await printar({ fonte: join(d, 'p.html'), saida: join(d, 'topo.png'), carregar })
    assert.equal(sem.centro, null)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('5.48: print-pagina esconde o aviso fixo de cookie e deixa o cabecalho fixo da pagina', { skip: pular }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'print-'))
  try {
    const fixo = (txt) => `<div style="position:fixed;left:0;right:0;bottom:0;height:300px;background:#111;color:#fff">${txt}</div>`
    writeFileSync(join(d, 'c.html'), PAGINA.replace('</body>', '<header style="position:fixed;top:0;height:50px">Produto</header>' + fixo('Usamos cookies. Aceitar') + '</body>'))
    const r = await printar({ fonte: join(d, 'c.html'), saida: join(d, 'c.png'), marcar: 'possui a cobertura direta', carregar })
    assert.equal(r.avisos, 1)
    // canario: caixa fixa que nao fala de cookie fica
    writeFileSync(join(d, 's.html'), PAGINA.replace('</body>', fixo('Baixe o app') + '</body>'))
    assert.equal((await printar({ fonte: join(d, 's.html'), saida: join(d, 's.png'), carregar })).avisos, 0)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('5.48: print-pagina marca frase que atravessa negrito e link', { skip: pular }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'print-'))
  try {
    writeFileSync(join(d, 'n.html'), PAGINA.replace('<p id="alvo">', '<p>Não possui a <strong>cobertura direta</strong> do <a href="#">FGC</a> no app.</p><p id="alvo">'))
    const { centro } = await printar({ fonte: join(d, 'n.html'), saida: join(d, 'n.png'), marcar: 'Não possui a cobertura direta do FGC no app.', carregar })
    assert.ok(centro > 0.3 && centro < 0.7, `a frase ficou em ${centro} da altura`)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('5.48: print-pagina marca a frase que aparece, nunca a copia escondida', { skip: pular }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'print-'))
  try {
    // a copia escondida vem antes, no topo; a visivel vem depois do enchimento
    writeFileSync(join(d, 'h.html'), PAGINA.replace('<p>', '<div hidden>Frase de prova</div><p style="visibility:hidden">Frase de prova</p><p>')
      .replace('<p id="alvo">', '<p>Frase de prova</p><p id="alvo">'))
    const { centro } = await printar({ fonte: join(d, 'h.html'), saida: join(d, 'h.png'), marcar: 'Frase de prova', carregar })
    assert.ok(centro > 0.3 && centro < 0.7, `a frase ficou em ${centro} da altura`)
    // so escondida: recusa
    writeFileSync(join(d, 's.html'), PAGINA.replace('<p>', '<div hidden>Frase de prova</div><p>'))
    await assert.rejects(printar({ fonte: join(d, 's.html'), saida: join(d, 's.png'), marcar: 'Frase de prova', carregar }), /nao achei a frase/)
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('5.48: print-pagina recusa frase que nao esta na pagina e nao grava o print', { skip: pular }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'print-'))
  try {
    writeFileSync(join(d, 'p.html'), PAGINA)
    const sai = join(d, 'print.png')
    await assert.rejects(printar({ fonte: join(d, 'p.html'), saida: sai, marcar: 'frase que ninguem escreveu', carregar }), /nao achei a frase/)
    assert.throws(() => readFileSync(sai))
  } finally { rmSync(d, { recursive: true, force: true }) }
})
