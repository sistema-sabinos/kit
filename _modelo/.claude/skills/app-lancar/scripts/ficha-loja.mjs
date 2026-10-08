#!/usr/bin/env node
// Revisao da ficha de loja (App Store e Google Play) antes de mandar o app: confere o limite
// de cada campo e os erros que fazem a loja recusar um app feito a partir de outro, como o
// nome do app original na ficha, alegacao de ranking ou de preco no titulo e letra gasta a
// toa nas palavras-chave.
// Uso, da raiz do projeto:
//   node .claude/skills/app-lancar/scripts/ficha-loja.mjs app/ficha.json
//   node .claude/skills/app-lancar/scripts/ficha-loja.mjs app/ficha.json --evitar "Nome do App,Empresa Dele"
//   node .claude/skills/app-lancar/scripts/ficha-loja.mjs app/ficha.json --json
// Modelo do arquivo: .claude/skills/app-lancar/ficha-exemplo.json. Deixe de fora a loja onde
// o app nao vai entrar. O --evitar troca a lista "evitar" do arquivo.
// Conta: tudo em caractere como gente conta (emoji feito de pedacos vale 1), menos as
// palavras-chave da App Store, que a Apple conta em byte (letra com acento vale 2).
// Saida: 0 sem erro (aviso pode ter); 1 algum erro; 2 arquivo ruim ou uso errado.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerArgs } from '../../app-estudar/scripts/lib/args.mjs'
import { dobrar, escapar } from '../../app-estudar/scripts/lib/texto.mjs'

export const LIMITES = {
  app_store: { nome: 30, subtitulo: 30, texto_promocional: 170, descricao: 4000, palavras_chave: 100, novidades: 4000 },
  google_play: { titulo: 30, descricao_curta: 80, descricao_completa: 4000 }
}
const LOJA = { app_store: 'App Store', google_play: 'Google Play' }
const CURTOS = new Set(['nome', 'subtitulo', 'titulo', 'descricao_curta'])
const OBRIGATORIOS = new Set(['nome', 'titulo', 'descricao', 'descricao_completa'])
const EM_BYTE = new Set(['palavras_chave'])
// roda no texto dobrado (sem acento e em minuscula), entao "grátis", "GRATIS" e "gratis" casam
const ALEGACAO = /(#\s?1\b|\bn[oº°]\.? ?1\b|\bnumero (1|um)\b|\bnumber one\b|\bmelhor(es)?\b|\bbest\b|\bmais vendid[oa]s?\b|\btop[- ]rated\b|\btop\b|\b(app|aplicativo|jogo|game) (do|of the) (ano|year)\b|\bgratis\b|\bgratuit[oa]\b|\bfree\b|\bpromocao\b|\bdesconto\b|\boferta\b|\bdiscount\b|\bsale\b|\b\d+% off\b|\bnovo!?$|\bnew!?$)/
const PARADA = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'para', 'pra', 'com', 'em', 'no', 'na', 'seu', 'sua', 'app', 'aplicativo', 'um', 'uma', '&'])
const PALAVRA = /[\p{L}\p{N}']+/gu
const CAIXA_ALTA = /(?<!\p{L})\p{Lu}{4,}(?!\p{L})/gu
const EMOJI = /\p{Extended_Pictographic}/u
const GRAFEMA = new Intl.Segmenter('pt', { granularity: 'grapheme' })

// caracteres como gente conta: emoji feito de pedacos e letra com acento solto valem 1
export function tamanho(texto) {
  return [...GRAFEMA.segment(String(texto ?? '').normalize('NFC'))].length
}

export function medir(campo, texto) {
  return EM_BYTE.has(campo) ? Buffer.byteLength(String(texto ?? '').normalize('NFC')) : tamanho(texto)
}

export function temEmoji(texto) {
  return EMOJI.test(String(texto ?? ''))
}

export function palavras(texto) {
  return (dobrar(texto).match(PALAVRA) ?? []).filter(p => !PARADA.has(p))
}

function achaNome(nome, texto) {
  const padrao = new RegExp('(?<![\\p{L}\\p{N}_])' + escapar(dobrar(nome)) + '(?![\\p{L}\\p{N}_])', 'u')
  return padrao.test(dobrar(texto))
}

export function revisar(ficha, evitar) {
  const lista = []
  const add = (nivel, loja, campo, mensagem) => lista.push({ nivel, loja, campo, mensagem })
  const nomes = (evitar ?? ficha.evitar ?? []).map(n => String(n).trim()).filter(Boolean)
  let achouLoja = false
  for (const [loja, limites] of Object.entries(LIMITES)) {
    const dados = ficha[loja]
    if (!dados || typeof dados !== 'object') continue
    achouLoja = true
    for (const [campo, limite] of Object.entries(limites)) {
      const valor = String(dados[campo] ?? '')
      if (!valor) {
        add(OBRIGATORIOS.has(campo) ? 'erro' : 'aviso', loja, campo, 'vazio')
        continue
      }
      const n = medir(campo, valor)
      if (n > limite) {
        const unidade = EM_BYTE.has(campo) ? 'bytes' : 'caracteres'
        const extra = EM_BYTE.has(campo) ? '. Letra com acento conta 2 bytes aqui' : ''
        add('erro', loja, campo, `${n} ${unidade}, o limite e ${limite} (passou ${n - limite})${extra}`)
      }
      for (const nome of nomes) {
        if (achaNome(nome, valor)) {
          add('erro', loja, campo, `cita '${nome}'. Nome ou marca de outro app na ficha faz a loja recusar o app e abre espaco pra pedido de retirada; se a marca for registrada no INPI, usar ela ainda pode cair na Lei 9.279/96 (Lei de Propriedade Industrial). Descreva o que o seu faz, sem citar o outro.`)
        }
      }
      if (CURTOS.has(campo)) {
        const m = ALEGACAO.exec(dobrar(valor))
        if (m) {
          const trecho = valor.slice(m.index, m.index + m[0].length).trim()
          add('aviso', loja, campo, `'${trecho}' soa como alegacao de ranking ou de preco. O Google Play proibe isso no titulo e na descricao curta, e a Apple recusa alegacao que voce nao consegue provar.`)
        }
        if (temEmoji(valor)) add('aviso', loja, campo, 'emoji em campo curto. O Google Play recusa emoji no titulo, e a revisao da Apple costuma recusar tambem.')
        const caixa = valor.normalize('NFC').match(CAIXA_ALTA)
        if (caixa) add('aviso', loja, campo, `palavra em caixa alta: ${caixa.join(', ')}`)
      }
    }
    if (loja === 'app_store' && dados.palavras_chave) {
      const bruto = String(dados.palavras_chave)
      const partes = bruto.split(',').map(k => k.trim().toLowerCase())
      if (/,\s/.test(bruto)) add('aviso', loja, 'palavras_chave', 'espaco depois da virgula gasta byte. Escreva assim: palavra1,palavra2,palavra3')
      const repetidas = [...new Set(partes.filter((k, i) => k && partes.indexOf(k) !== i))].sort()
      if (repetidas.length) add('aviso', loja, 'palavras_chave', `repetida: ${repetidas.join(', ')}`)
      const noNome = new Set([...palavras(dados.nome), ...palavras(dados.subtitulo)])
      const gastas = [...new Set(partes.flatMap(k => palavras(k)).filter(p => noNome.has(p)))].sort()
      if (gastas.length) add('aviso', loja, 'palavras_chave', `ja esta no nome ou no subtitulo, entao esses bytes vao a toa: ${gastas.join(', ')}`)
      if (partes.some(k => !k)) add('aviso', loja, 'palavras_chave', 'entrada vazia (virgula dobrada ou virgula no fim)')
    }
  }
  if (!achouLoja) add('erro', '-', '-', 'nenhuma parte app_store ou google_play no arquivo')
  return lista
}

export function mostrar(ficha, lista) {
  const out = []
  for (const [loja, limites] of Object.entries(LIMITES)) {
    const dados = ficha[loja]
    if (!dados || typeof dados !== 'object') continue
    out.push(LOJA[loja])
    for (const [campo, limite] of Object.entries(limites)) {
      const n = medir(campo, dados[campo])
      const marca = n > limite ? 'ESTOUROU' : n ? 'ok' : '--'
      const unidade = EM_BYTE.has(campo) ? ' bytes' : ''
      out.push(`  ${campo.padEnd(20)} ${String(n).padStart(5)} / ${String(limite).padEnd(5)} ${marca}${unidade}`)
    }
    out.push('')
  }
  if (!lista.length) out.push('Nada a corrigir.')
  for (const i of lista) out.push(`${i.nivel.toUpperCase().padEnd(5)} ${i.loja}.${i.campo}: ${i.mensagem}`)
  const nErros = lista.filter(i => i.nivel === 'erro').length
  out.push('', `${nErros} erros, ${lista.length - nErros} avisos`)
  return out.join('\n')
}

export function principal(argv, escrever = console.log, avisar = console.error) {
  const a = lerArgs(argv)
  let ficha, evitar
  try {
    if (a._.length === 0) throw new Error('uso: ficha-loja.mjs ficha.json [--evitar "Nome,Empresa"] [--json]')
    if (a.evitar === true) throw new Error('--evitar precisa dos nomes, separados por virgula: --evitar "Nome do App,Empresa Dele"')
    let bruto
    try {
      bruto = readFileSync(a._[0], 'utf8')
    } catch {
      throw new Error(`nao achei o arquivo ${a._[0]}: confira o caminho a partir da raiz do projeto`)
    }
    try {
      // o Bloco de Notas pode gravar com BOM no comeco, e o JSON.parse nao aceita
      ficha = JSON.parse(bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto)
    } catch (e) {
      throw new Error(`${a._[0]} nao e JSON valido (${e.message}): confira virgula e aspas`)
    }
    if (!ficha || typeof ficha !== 'object' || Array.isArray(ficha)) throw new Error(`${a._[0]} precisa ser um objeto JSON, no molde do ficha-exemplo.json`)
    evitar = typeof a.evitar === 'string' ? a.evitar.split(',') : undefined
  } catch (e) {
    avisar(`ficha-loja: ${e.message}`)
    return 2
  }
  const lista = revisar(ficha, evitar)
  escrever(a.json ? JSON.stringify(lista, null, 2) : mostrar(ficha, lista))
  return lista.some(i => i.nivel === 'erro') ? 1 : 0
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    process.exitCode = principal(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 2
  }
}
