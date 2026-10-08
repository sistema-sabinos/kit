// Le o texto de um PDF (apostila, ebook, livro) pelo pdftotext e grava ao lado dele um .txt com a
// marca [p. N] no comeco de cada pagina. Com --medir so mede: paginas, palavras, tokens e se o PDF
// tem texto, e misto (parte escaneada) ou e todo escaneado. Nada de OCR, nada de senha.
// Uso (da raiz do projeto):
//   node .claude/skills/aprender-curso/scripts/ler-pdf.mjs <arquivo.pdf> [--medir]
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cortarPaginas, marcarPaginas, medir, veredito, tokensEstimados } from './lib/paginas.mjs'

// O do PATH primeiro; no Windows, o que vem no Git completo costuma ficar fora do PATH. A pasta
// de programas vem do ambiente (ProgramFiles), nunca com a letra do disco escrita aqui.
export function candidatos(env = process.env) {
  const git = env.ProgramFiles ? [join(env.ProgramFiles, 'Git', 'mingw64', 'bin', 'pdftotext.exe')] : []
  return ['pdftotext', ...git]
}
export const CANDIDATOS = candidatos()

const SEM_PDFTOTEXT = 'Nao achei o pdftotext, o programa que tira o texto do PDF. No Windows: instale o Git completo de git-scm.com (o pdftotext vem junto). No Mac: brew install poppler.'
const SEM_COPIA = 'O PDF esta sem permissao de copia: o dono travou a extracao do texto. Peca ao autor uma versao liberada.'
const COM_SENHA = 'O PDF tem senha. Abra no leitor de PDF, salve uma copia sem senha e mande essa copia.'
const ESCANEADO = 'O PDF e escaneado (so imagem, sem texto pra ler). Peca a versao digital ao autor; OCR fica de fora.'

const rodarPadrao = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const ausente = r => r.error?.code === 'ENOENT'

export function lerPdf(pdf, { medir: soMedir = false, rodar = rodarPadrao, existe = existsSync, lista = CANDIDATOS } = {}) {
  const falha = erro => ({ codigo: 1, linhas: [], erro, arquivo: null })

  // pdfinfo antes, quando existe: o Poppler do Mac extrai PDF sem permissao de copia sem avisar.
  const info = rodar('pdfinfo', [pdf])
  if (!ausente(info) && info.status === 0 && /^Encrypted:.*copy:no/m.test(info.stdout ?? '')) return falha(SEM_COPIA)

  const args = ['-layout', '-enc', 'UTF-8', '-eol', 'unix', pdf, '-']
  let usado = null
  let r = null
  for (const cand of lista) {
    if (cand !== 'pdftotext' && !existe(cand)) continue
    r = rodar(cand, args)
    if (ausente(r)) continue
    usado = cand
    break
  }
  if (!usado) return falha(SEM_PDFTOTEXT)
  if (r.status === 1 && /password/i.test(r.stderr ?? '')) return falha(COM_SENHA)
  if (r.status === 3) return falha(SEM_COPIA)
  if (r.status !== 0) return falha(`Nao consegui abrir o PDF (arquivo corrompido, incompleto ou fora do lugar). Detalhe: ${String(r.stderr ?? r.error?.message ?? '').trim().split('\n')[0]}`)

  const paginas = cortarPaginas(r.stdout)
  const medida = medir(paginas)
  const v = veredito(medida)
  const tokens = tokensEstimados(medida.palavras)
  const linhas = [
    `pdftotext: ${usado}`,
    `paginas: ${medida.paginas}`,
    `palavras: ${medida.palavras}`,
    `tokens: ${tokens ?? 'sem medida'}`,
  ]
  if (v.rotulo === 'misto') linhas.push(`AVISO: ${v.semTexto.length} de ${medida.paginas} paginas sem texto (escaneadas); elas ficam de fora do estudo`)
  linhas.push(`veredito: ${v.rotulo}`)
  if (v.semTexto.length) linhas.push(`sem texto: p. ${v.semTexto.join(', ')}`)
  if (v.rotulo === 'escaneado') return { codigo: 1, linhas, erro: ESCANEADO, arquivo: null }

  let arquivo = null
  if (!soMedir) {
    arquivo = join(dirname(pdf), `${basename(pdf, extname(pdf))}.txt`)
    writeFileSync(arquivo, marcarPaginas(paginas), 'utf8')
    linhas.push(`arquivo: ${arquivo}`)
  }
  return { codigo: 0, linhas, erro: null, arquivo }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const pdf = process.argv[2]
  if (!pdf || pdf.startsWith('--')) {
    console.error('Uso: node .claude/skills/aprender-curso/scripts/ler-pdf.mjs <arquivo.pdf> [--medir]')
    process.exit(1)
  }
  const r = lerPdf(pdf, { medir: process.argv.includes('--medir') })
  for (const l of r.linhas) console.log(l)
  if (r.erro) console.error(r.erro)
  process.exit(r.codigo)
}
