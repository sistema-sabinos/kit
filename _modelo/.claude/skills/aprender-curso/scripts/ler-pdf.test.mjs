// Testes do ler-pdf com pdftotext e pdfinfo falsos: cada codigo de saida, o pdfinfo com copy:no,
// o pdftotext ausente e a gravacao do .txt. O teste com pdftotext de verdade mora na bancada.
// Rodar: node --test ler-pdf.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lerPdf, candidatos } from './ler-pdf.mjs'

// Ambiente falso: o teste nao depende da pasta de programas desta maquina
const CANDIDATOS = candidatos({ ProgramFiles: join('PF') })

const FF = String.fromCharCode(12)
const acao = 'a' + String.fromCharCode(0xE7) + String.fromCharCode(0xE3) + 'o'
const cheia = `O metodo do curso diz que a ${acao} diaria vem antes do resultado e que o caixa manda na decisao. `.repeat(3)
const ENOENT = { error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), status: null, stdout: '', stderr: '' }

// rodar falso: pdfinfo ausente por padrao; pdftotext devolve o que o caso pedir e guarda as chamadas.
function falso({ info = ENOENT, texto = { status: 0, stdout: `${cheia}${FF}${cheia}${FF}`, stderr: '' } } = {}) {
  const chamadas = []
  const rodar = (cmd, args) => {
    chamadas.push({ cmd, args })
    return cmd === 'pdfinfo' ? info : texto
  }
  return { rodar, chamadas }
}

function pasta() {
  return mkdtempSync(join(tmpdir(), 'ler-pdf-'))
}

test('PDF de texto com --medir imprime a medida, nao grava e chama o pdftotext com -eol unix', () => {
  const dir = pasta()
  try {
    const pdf = join(dir, 'apostila.pdf')
    const { rodar, chamadas } = falso()
    const r = lerPdf(pdf, { medir: true, rodar })
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0)
    assert.equal(r.erro, null)
    assert.ok(r.linhas.includes('pdftotext: pdftotext'))
    assert.ok(r.linhas.includes('paginas: 2'))
    assert.ok(r.linhas.some(l => /^tokens: \d+$/.test(l)), 'tokens sem numero')
    assert.ok(r.linhas.includes('veredito: texto'))
    assert.ok(r.linhas.some(l => /^palavras: \d+$/.test(l)))
    assert.equal(existsSync(join(dir, 'apostila.txt')), false)
    const ext = chamadas.find(c => c.cmd === 'pdftotext')
    assert.deepEqual(ext.args, ['-layout', '-enc', 'UTF-8', '-eol', 'unix', pdf, '-'])
    assert.ok(!chamadas.some(c => c.args.some(a => /^-[uo]pw$/.test(a))), 'nunca passa senha')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sem --medir grava o .txt ao lado do PDF com as marcas de pagina e o acento', () => {
  const dir = pasta()
  try {
    const pdf = join(dir, 'livro.pdf')
    const r = lerPdf(pdf, { rodar: falso().rodar })
    assert.equal(r.codigo, 0)
    const txt = join(dir, 'livro.txt')
    assert.equal(r.arquivo, txt)
    assert.ok(r.linhas.includes(`arquivo: ${txt}`))
    const conteudo = readFileSync(txt, 'utf8')
    assert.ok(conteudo.length > 0, 'txt veio vazio')
    assert.deepEqual(conteudo.match(/\[p\. \d+\]/g), ['[p. 1]', '[p. 2]'])
    assert.ok(conteudo.includes(acao))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('codigo 1 com password no stderr para e diz que o PDF tem senha', () => {
  const r = lerPdf('x.pdf', { rodar: falso({ texto: { status: 1, stdout: '', stderr: 'Command Line Error: Incorrect Password' } }).rodar })
  assert.equal(r.codigo, 1)
  assert.match(r.erro, /tem senha/)
})

test('sem permissao de copia para e avisa', () => {
  const r = lerPdf('x.pdf', { rodar: falso({ texto: { status: 3, stdout: '', stderr: 'Permission Error: copying of text from this document is not allowed.' } }).rodar })
  assert.equal(r.codigo, 1)
  assert.match(r.erro, /sem permissao de copia/)
  assert.equal(r.arquivo, null)
})

test('outro codigo 1 diz que o PDF nao abriu', () => {
  const r = lerPdf('x.pdf', { rodar: falso({ texto: { status: 1, stdout: '', stderr: "Syntax Error: Couldn't find trailer dictionary" } }).rodar })
  assert.equal(r.codigo, 1)
  assert.match(r.erro, /Nao consegui abrir o PDF/)
  assert.doesNotMatch(r.erro, /senha|permissao/)
})

test('candidatos: o do PATH sempre, o do Git so com a pasta de programas no ambiente', () => {
  assert.deepEqual(candidatos({}), ['pdftotext'])
  assert.deepEqual(CANDIDATOS, ['pdftotext', join('PF', 'Git', 'mingw64', 'bin', 'pdftotext.exe')])
})

test('pdftotext ausente nos dois candidatos manda instalar o Git completo ou o poppler', () => {
  const tentados = []
  const r = lerPdf('x.pdf', {
    rodar: (cmd) => { tentados.push(cmd); return ENOENT },
    existe: () => true,
    lista: CANDIDATOS,
  })
  assert.equal(r.codigo, 1)
  assert.match(r.erro, /git-scm\.com/)
  assert.match(r.erro, /brew install poppler/)
  assert.deepEqual(tentados, ['pdfinfo', ...CANDIDATOS])
})

test('pdftotext fora do PATH cai no do Git e diz qual usou', () => {
  const r = lerPdf('x.pdf', {
    medir: true,
    rodar: (cmd) => cmd === CANDIDATOS[1] ? { status: 0, stdout: `${cheia}${FF}`, stderr: '' } : ENOENT,
    existe: (p) => p === CANDIDATOS[1],
    lista: CANDIDATOS,
  })
  assert.equal(r.codigo, 0)
  assert.ok(r.linhas.includes(`pdftotext: ${CANDIDATOS[1]}`))
})

test('pdfinfo com copy:no para antes de extrair', () => {
  const info = { status: 0, stdout: 'Pages:          3\nEncrypted:      yes (print:yes copy:no change:no addNotes:no algorithm:AES)\n', stderr: '' }
  const { rodar, chamadas } = falso({ info })
  const r = lerPdf('x.pdf', { medir: true, rodar })
  assert.equal(r.codigo, 1)
  assert.match(r.erro, /sem permissao de copia/)
  assert.ok(!chamadas.some(c => c.cmd !== 'pdfinfo'), 'extraiu mesmo com copy:no')
})

test('PDF misto avisa, lista as paginas sem texto e sai 0', () => {
  const r = lerPdf('x.pdf', { medir: true, rodar: falso({ texto: { status: 0, stdout: `${cheia}${FF}${FF}${FF}`, stderr: '' } }).rodar })
  assert.equal(r.codigo, 0)
  const aviso = r.linhas.findIndex(l => l.startsWith('AVISO: '))
  assert.ok(aviso >= 0, 'faltou o AVISO')
  assert.ok(aviso < r.linhas.indexOf('veredito: misto'))
  assert.ok(r.linhas.includes('sem texto: p. 2, 3'))
})

test('PDF escaneado sai 1, diz escaneado e nao grava', () => {
  const dir = pasta()
  try {
    const pdf = join(dir, 'scan.pdf')
    const r = lerPdf(pdf, { rodar: falso({ texto: { status: 0, stdout: `${FF}${FF}`, stderr: '' } }).rodar })
    assert.equal(r.codigo, 1)
    assert.match(r.erro, /escaneado/)
    assert.ok(r.linhas.includes('veredito: escaneado'))
    assert.equal(existsSync(join(dir, 'scan.txt')), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
