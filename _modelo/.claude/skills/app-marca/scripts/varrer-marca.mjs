#!/usr/bin/env node
// Varredura de marca: procura no codigo do app tudo que ainda e do app de referencia, o nome,
// o dominio e as cores. Rode antes de todo lancamento. Sai 1 quando acha alguma coisa, entao
// serve de trava antes de publicar.
// Uso, da raiz do projeto:
//   node .claude/skills/app-marca/scripts/varrer-marca.mjs --evitar "Calendly"
//   node .claude/skills/app-marca/scripts/varrer-marca.mjs --evitar "Calendly,Calendly LLC" --dominios calendly.com --cores "#006bff,#0ae8f0"
//   node .claude/skills/app-marca/scripts/varrer-marca.mjs --config app/marca.json --json
// Sem pasta, varre app/codigo. --config le {"evitar": [...], "dominios": [...], "cores": [...]}
// (aceita tambem avoid, domains e colors).
// O nome casa em qualquer lugar, sem ligar pra maiuscula nem pra acento, inclusive colado em
// identificador (CalendlyBotao, calendly_sync, cafe-facil pra "Cafe Facil"), porque isso
// tambem vai pro ar. Cor casa em qualquer caixa e na forma curta (#06f casa #0066ff). Nome de
// pasta e de arquivo tambem conta.
// Pula: .git, node_modules, pastas de build, lockfile, arquivo binario, arquivo acima de 2 MB
// e, quando a pasta varrida e a raiz do projeto (sem package.json), a pasta de planejamento
// app/ (onde o nome da referencia mora de proposito), varrendo so o app/codigo dentro dela.
// --incluir-planejamento varre o planejamento tambem.
// Saida: 0 limpo; 1 achou alguma coisa; 2 nada pra procurar, pasta ou config ruim, ou alguma
// pasta ou arquivo que nao deu pra ler (listado no aviso; a varredura ficou incompleta).
import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerArgs } from '../../app-estudar/scripts/lib/args.mjs'
import { dobrar, escapar } from '../../app-estudar/scripts/lib/texto.mjs'

const PULAR_PASTAS = new Set(['.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', 'dist', 'build',
  'out', '.vercel', '.wrangler', '.open-next', '.turbo', '.cache', 'coverage', '__pycache__', '.venv',
  'venv', 'Pods', '.expo', 'DerivedData', '.gradle'])
const PULAR_ARQUIVOS = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', 'bun.lock', 'Podfile.lock', 'Cargo.lock', 'poetry.lock'])
const BINARIO = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.pdf', '.zip',
  '.gz', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.mov', '.mp3',
  '.wav', '.avif', '.heic', '.psd', '.sketch', '.fig', '.jar', '.so', '.dylib'])
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g
const HEX_INTEIRO = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/
const QUEBRA = /\r\n|\r|\n/
const BOM = String.fromCharCode(0xfeff)
const PLANEJAMENTO = 'app'
const MAX_BYTES = 2_000_000

export function normalizarHex(h) {
  let s = h.trim().toLowerCase().replace(/^#/, '')
  if (s.length === 3) s = [...s].map(c => c + c).join('')
  return '#' + s
}

// "Acuity Scheduling" casa tambem AcuityScheduling e acuity-scheduling. Tudo passa pela
// dobra de acento, entao "Cafe Facil" com acento casa cafe-facil e CAFEFACIL.
export function montarPadroes(evitar = [], dominios = []) {
  const pads = []
  for (const bruto of evitar) {
    const nome = String(bruto).trim()
    if (!nome) continue
    const partes = dobrar(nome).split(/[\s_-]+/).filter(Boolean).map(p => escapar(p))
    if (partes.length) pads.push({ tipo: 'nome', rotulo: nome, rx: new RegExp(partes.join('[\\s_-]?'), 'iu') })
  }
  for (const bruto of dominios) {
    const d = String(bruto).trim().toLowerCase()
    if (d) pads.push({ tipo: 'dominio', rotulo: d, rx: new RegExp(escapar(dobrar(d)), 'iu') })
  }
  return pads
}

const LEITOR = { readdirSync, readFileSync, statSync, openSync, readSync, closeSync }

// erro ao abrir sobe pra quem chamou, que o lista como falha de leitura
function ehBinario(fs, caminho, nome) {
  const i = nome.lastIndexOf('.')
  if (i > 0 && BINARIO.has(nome.slice(i).toLowerCase())) return true
  const fd = fs.openSync(caminho, 'r')
  try {
    const buf = Buffer.alloc(4096)
    const n = fs.readSync(fd, buf, 0, 4096, 0)
    return buf.subarray(0, n).includes(0)
  } finally {
    fs.closeSync(fd)
  }
}

const motivo = e => e.code || e.message

const cortar = s => Array.from(s.trim()).slice(0, 160).join('')

// Devolve a lista de achados com .falhas: pasta ou arquivo que deu erro ao ler (sem permissao,
// sumiu no meio). Com falha a varredura ficou incompleta e nao vale como limpa.
export function varrer(raiz, { evitar = [], dominios = [], cores = [], incluirPlanejamento = false, maxBytes = MAX_BYTES, leitor = LEITOR } = {}) {
  const fs = leitor
  const pads = montarPadroes(evitar, dominios)
  const nomes = pads.filter(p => p.tipo === 'nome')
  const cols = new Set()
  for (const c of cores) {
    if (!HEX_INTEIRO.test(String(c).trim())) throw new Error(`cor "${c}" nao foi entendida: escreva com # e 3 ou 6 digitos, tipo #006bff`)
    cols.add(normalizarHex(c))
  }
  const base = resolve(raiz)
  // a raiz do projeto nao tem package.json; a do codigo tem, e la app/ e codigo do Next.js
  const pularPlanejamento = !incluirPlanejamento && !existsSync(join(base, 'package.json'))
  const achados = []
  const falhas = []

  function andar(dir, rel) {
    let itens
    try {
      itens = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) {
      falhas.push({ caminho: (rel || '.') + '/', erro: motivo(e) })
      return
    }
    itens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    const descer = []
    for (const it of itens) {
      if (!it.isDirectory() || PULAR_PASTAS.has(it.name)) continue
      if (rel === '' && it.name === PLANEJAMENTO && pularPlanejamento) {
        const codigo = join(dir, it.name, 'codigo')
        if (existsSync(codigo)) descer.push([codigo, it.name + '/codigo'])
        continue
      }
      const r = rel ? rel + '/' + it.name : it.name
      for (const p of nomes) if (p.rx.test(dobrar(it.name))) achados.push({ arquivo: r + '/', linha: 0, tipo: 'caminho', achado: p.rotulo, texto: 'nome de pasta' })
      descer.push([join(dir, it.name), r])
    }
    for (const it of itens) {
      if (!it.isFile() || PULAR_ARQUIVOS.has(it.name)) continue
      const caminho = join(dir, it.name)
      const r = rel ? rel + '/' + it.name : it.name
      for (const p of nomes) if (p.rx.test(dobrar(it.name))) achados.push({ arquivo: r, linha: 0, tipo: 'caminho', achado: p.rotulo, texto: 'nome de arquivo' })
      let texto
      try {
        if (fs.statSync(caminho).size > maxBytes || ehBinario(fs, caminho, it.name)) continue
        texto = fs.readFileSync(caminho, 'utf8')
      } catch (e) {
        falhas.push({ caminho: r, erro: motivo(e) })
        continue
      }
      // a dobra mantem cada caractere na mesma posicao, entao as linhas batem uma a uma
      const linhas = texto.split(QUEBRA)
      const dobradas = dobrar(texto).split(QUEBRA)
      for (let i = 0; i < linhas.length; i++) {
        for (const p of pads) {
          if (p.rx.test(dobradas[i])) achados.push({ arquivo: r, linha: i + 1, tipo: p.tipo, achado: p.rotulo, texto: cortar(linhas[i]) })
        }
        if (cols.size) {
          for (const m of linhas[i].matchAll(HEX)) {
            const h = normalizarHex(m[0])
            if (cols.has(h)) achados.push({ arquivo: r, linha: i + 1, tipo: 'cor', achado: h, texto: cortar(linhas[i]) })
          }
        }
      }
    }
    for (const [d, r] of descer) andar(d, r)
  }

  andar(base, '')
  achados.falhas = falhas
  return achados
}

export function mostrar(achados) {
  if (!achados.length) return 'Limpo. Nada do nome, do dominio nem das cores do app de referencia apareceu.'
  const out = []
  const porTipo = {}
  for (const h of achados) {
    porTipo[h.tipo] = (porTipo[h.tipo] || 0) + 1
    const onde = h.linha ? `${h.arquivo}:${h.linha}` : h.arquivo
    out.push(`${h.tipo.padEnd(8)} ${h.achado.slice(0, 18).padEnd(18)} ${onde}  ${h.texto}`)
  }
  const resumo = Object.keys(porTipo).sort().map(k => `${k} ${porTipo[k]}`).join(', ')
  out.push('', `${achados.length} ${achados.length === 1 ? 'achado' : 'achados'} (${resumo}). Troque cada um antes de lancar: nome, dominio ou cor do app de referencia no app publicado e risco de marca (INPI) e de concorrencia desleal (Lei 9.279/96, art. 195).`)
  return out.join('\n')
}

function lista(a, nome) {
  const v = a[nome]
  if (v === undefined) return []
  if (v === true) throw new Error(`--${nome} precisa de valor, tipo --${nome} "A,B"`)
  return v.split(',').map(x => x.trim()).filter(Boolean)
}

function listaDoConfig(cfg, chaves, arquivo) {
  const out = []
  for (const k of chaves) {
    if (cfg[k] === undefined) continue
    if (!Array.isArray(cfg[k])) throw new Error(`em ${arquivo}, "${k}" precisa ser uma lista, tipo ["Nome"]`)
    out.push(...cfg[k].map(String))
  }
  return out
}

export function principal(argv, escrever = console.log, avisar = console.error, cwd = process.cwd(), leitor = LEITOR) {
  const a = lerArgs(argv)
  // chave pura: "--json pasta" nao pode engolir a pasta
  for (const chave of ['json', 'incluir-planejamento']) {
    if (typeof a[chave] === 'string') { a._.push(a[chave]); a[chave] = true }
  }
  let achados
  try {
    const evitar = lista(a, 'evitar')
    const dominios = lista(a, 'dominios')
    const cores = lista(a, 'cores')
    if (a.config !== undefined) {
      if (a.config === true) throw new Error('--config precisa do caminho do arquivo, tipo --config app/marca.json')
      let cfg
      try {
        const bruto = readFileSync(resolve(cwd, a.config), 'utf8')
        cfg = JSON.parse(bruto.startsWith(BOM) ? bruto.slice(1) : bruto)
      } catch (e) {
        throw new Error(`nao consegui ler ${a.config} (${e.message}): confira o caminho a partir da raiz do projeto, virgula e aspas`)
      }
      evitar.push(...listaDoConfig(cfg, ['evitar', 'avoid'], a.config))
      dominios.push(...listaDoConfig(cfg, ['dominios', 'domains'], a.config))
      cores.push(...listaDoConfig(cfg, ['cores', 'colors'], a.config))
    }
    if (!(evitar.length || dominios.length || cores.length)) throw new Error('nada pra procurar. Passe --evitar com o nome do app de referencia.')
    const pasta = a._[0] ?? 'app/codigo'
    const raiz = resolve(cwd, pasta)
    let ehPasta = false
    try { ehPasta = statSync(raiz).isDirectory() } catch {}
    if (!ehPasta) throw new Error(`nao achei a pasta ${pasta}: rode da raiz do projeto (o padrao e app/codigo) ou passe a pasta do codigo`)
    achados = varrer(raiz, { evitar, dominios, cores, incluirPlanejamento: Boolean(a['incluir-planejamento']), leitor })
  } catch (e) {
    avisar(`varrer-marca: ${e.message}`)
    return 2
  }
  const { falhas } = achados
  if (a.json || achados.length) escrever(a.json ? JSON.stringify(achados, null, 2) : mostrar(achados))
  else if (!falhas.length) escrever(mostrar(achados))
  if (falhas.length) {
    for (const f of falhas) avisar(`nao consegui ler ${f.caminho} (${f.erro})`)
    avisar(`varrer-marca: ${falhas.length} ${falhas.length === 1 ? 'item ficou' : 'itens ficaram'} sem ler, entao a varredura nao esta completa e nao vale como limpa. Confira a permissao da pasta ou do arquivo e rode de novo.`)
    return 2
  }
  return achados.length ? 1 : 0
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
