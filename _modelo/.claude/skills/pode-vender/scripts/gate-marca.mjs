// Gate de marca, o passo 0 do /pode-vender: "essa marca pode ser anunciada?", respondido de
// graca antes de gastar pesquisa num produto. Mede a marca no Mercado Livre e, quando a
// categoria e da ANVISA, nos dossies de fiscalizacao e nas notificacoes. Roda sempre com uma
// marca de controle (que sabidamente vende): se o controle falha, quem quebrou foi a leitura,
// nao a marca, e a rodada inteira sai INCONCLUSIVA.
//
// Uso, da raiz do projeto:
//   node .claude/skills/pode-vender/scripts/gate-marca.mjs --categoria suplemento --marca "Nome"
//   node .claude/skills/pode-vender/scripts/gate-marca.mjs --categoria cosmetico --marcas fornecedores/x/marcas.json
import { readFileSync, existsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { abrirChrome, conectar } from '../../mercado-livre/scripts/lib/chrome.mjs'
import { slugDe, dataLocal, gravarJson } from '../../mercado-livre/scripts/lib/pipeline.mjs'
import { norm } from './lib/texto.mjs'
import { CATEGORIAS, gatesDaCategoria, tiposDaCategoria, decidir } from './lib/veredito.mjs'
import { PAGINA, naPagina, criarConsulta, irregulares, regularizados } from './lib/anvisa.mjs'
import { presencaNoML } from './lib/ml.mjs'

// Marca grande, com venda farta no Mercado Livre, por categoria. Se o controle sair
// ausente, conferir primeiro se a marca ainda vende antes de desconfiar do script.
export const CONTROLES = {
  suplemento: 'Max Titanium',
  alimento: 'Nestlé',
  cosmetico: 'Nivea',
  saneante: 'Ypê',
  outra: 'Tramontina',
}

const CONHECIDAS = ['categoria', 'marca', 'aliases', 'marcas', 'controle', 'nome', 'data']

function lerLista(texto, caminho) {
  let j
  try {
    j = JSON.parse(texto)
  } catch {
    throw new Error(`${caminho} nao e um JSON valido`)
  }
  const lista = Array.isArray(j) ? j : j && j.marcas
  if (!Array.isArray(lista) || !lista.length) throw new Error(`${caminho} precisa ter uma lista "marcas" com pelo menos uma marca`)
  return lista.map((m, i) => {
    const marca = typeof m === 'string' ? m : m && m.marca
    if (!marca || !String(marca).trim()) throw new Error(`a marca ${i + 1} de ${caminho} esta sem nome`)
    const aliases = m && typeof m === 'object' && Array.isArray(m.aliases) ? m.aliases.map(String) : []
    return { marca: String(marca).trim(), aliases }
  })
}

export function argumentos(argv, { ler = p => readFileSync(p, 'utf8'), hoje = dataLocal } = {}) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) throw new Error(`argumento solto "${k}": use --nome valor`)
    let nome = k.slice(2)
    let valor
    const igual = nome.indexOf('=')
    if (igual >= 0) {
      valor = nome.slice(igual + 1)
      nome = nome.slice(0, igual)
    }
    if (!CONHECIDAS.includes(nome)) throw new Error(`opcao desconhecida --${nome}. As que existem: ${CONHECIDAS.map(c => `--${c}`).join(' ')}`)
    if (valor === undefined) {
      valor = argv[i + 1]
      if (valor === undefined || valor.startsWith('--')) throw new Error(`--${nome} precisa de um valor`)
      i++
    }
    a[nome] = valor
  }
  if (!a.categoria) throw new Error(`falta --categoria. Use uma destas: ${CATEGORIAS.join(', ')}`)
  gatesDaCategoria(a.categoria)
  if (!a.marca && !a.marcas) throw new Error('diga qual marca: --marca "Nome" (uma marca) ou --marcas arquivo.json (lista do fornecedor)')
  if (a.marca && a.marcas) throw new Error('use --marca ou --marcas, uma das duas')
  const lista = a.marca
    ? [{ marca: a.marca.trim(), aliases: a.aliases ? a.aliases.split(',').map(s => s.trim()).filter(Boolean) : [] }]
    : lerLista(ler(a.marcas), a.marcas)
  const controle = a.controle || CONTROLES[a.categoria]
  const vistas = new Set([norm(controle)])
  const marcas = lista.filter(m => {
    const k = norm(m.marca)
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
  const data = a.data || hoje()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`--data precisa ser AAAA-MM-DD, e veio "${data}"`)
  const nomeDoAquivoDeMarcas = () => {
    const arquivo = basename(a.marcas).replace(/\.json$/i, '')
    const pasta = basename(dirname(a.marcas))
    return pasta && pasta !== '.' ? `${pasta}-${arquivo}` : arquivo
  }
  const nome = a.nome || (a.marca ? a.marca.trim() : nomeDoAquivoDeMarcas())
  return { marcas, categoria: a.categoria, controle, nome, data }
}

export function nomeDoArquivo(nome, categoria, data) {
  return `${slugDe(nome) || 'marcas'}-${categoria}-${data}.json`
}

// Resultado anterior e prova (o vereditos-legais cita o arquivo): nunca sobrescrever.
export function caminhoLivre(pasta, arquivo, { existe = existsSync } = {}) {
  const base = arquivo.replace(/\.json$/, '')
  let caminho = join(pasta, arquivo)
  for (let n = 2; existe(caminho); n++) caminho = join(pasta, `${base}-${n}.json`)
  return caminho
}

export async function rodarGate({ marcas, categoria, controle, medirML, consultar, log = () => {} }) {
  const gates = gatesDaCategoria(categoria)
  const tipos = tiposDaCategoria(categoria)

  async function medir(m) {
    const linha = { marca: m.marca, aliases: m.aliases || [], gates: {} }
    const tentar = async (nome, fazer) => {
      try {
        linha.gates[nome] = await fazer()
      } catch (e) {
        linha.gates[nome] = { erro: e.message }
      }
    }
    if (gates.dossie) await tentar('dossie', () => irregulares(consultar, m.marca, { aliases: linha.aliases, tipos }))
    if (gates.notificacao) await tentar('notificacao', () => regularizados(consultar, m.marca))
    await tentar('ml', () => medirML(m.marca, linha.aliases))
    return linha
  }

  // O controle roda primeiro: e ele que aquece a ANVISA, e se ele falha nao vale gastar
  // consulta com as outras marcas.
  const linhaControle = await medir({ marca: controle, aliases: [] })
  const g = linhaControle.gates
  const ok = !Object.values(g).some(x => x.erro) && g.ml.veredito !== 'AUSENTE'
  log(`controle ${controle}: ${ok ? 'ok' : 'FALHOU'}`)

  const resultados = []
  for (const [i, m] of marcas.entries()) {
    const linha = ok ? await medir(m) : { marca: m.marca, aliases: m.aliases || [], gates: {} }
    linha.veredito = decidir(linha, { categoria, controleOk: ok })
    resultados.push(linha)
    log(`${i + 1}/${marcas.length} ${m.marca}: ${linha.veredito.selo}`)
  }
  return { controle: { ...linhaControle, ok }, resultados }
}

export function tabela({ controle, resultados }) {
  const linhas = [`controle ${controle.marca}: ${controle.ok ? 'ok' : 'FALHOU'}`]
  if (!controle.ok) {
    for (const [nome, g] of Object.entries(controle.gates)) {
      if (g.erro) linhas.push(`    ${nome}: ${g.erro}`)
    }
    if (controle.gates.ml && controle.gates.ml.veredito === 'AUSENTE') {
      linhas.push('    a marca de controle nao apareceu no Mercado Livre: confira se ela ainda vende, ou troque com --controle "Outra Marca"')
    }
  }
  for (const r of resultados) {
    const g = r.gates
    const partes = [`ML:${g.ml?.veredito || '-'}`]
    if (g.dossie) partes.push(`dossies:${g.dossie.confirmados ?? '?'}`)
    if (g.notificacao) partes.push(`notificados:${g.notificacao.notificadosAtivos ?? '?'}`)
    linhas.push(`${r.marca.padEnd(22)} ${partes.join(' ')} => ${r.veredito.selo}`)
    for (const m of r.veredito.motivos) linhas.push(`    ${m}`)
    for (const v of r.veredito.vetados) linhas.push(`    vetado: ${v}`)
    if (r.veredito.rota) linhas.push(`    rota: ${r.veredito.rota}`)
  }
  return linhas.join('\n')
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  let a
  try {
    a = argumentos(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  let browser = null
  try {
    await abrirChrome()
    browser = await conectar()
    const ctx = browser.contexts()[0] || (await browser.newContext())
    // Aba em segundo plano o Chrome freia, e a verificacao anti-robo da ANVISA nao roda nela
    // (medido em 2026-09-29: 4 minutos sem token atras, 2 s na frente). Cada consulta traz a
    // propria aba pra frente antes de rodar.
    const paginaML = await ctx.newPage()
    let consultar = null
    if (gatesDaCategoria(a.categoria).dossie) {
      const paginaAnvisa = await ctx.newPage()
      await paginaAnvisa.bringToFront()
      await paginaAnvisa.goto(PAGINA, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await paginaAnvisa.waitForTimeout(8000)
      consultar = criarConsulta({
        avaliar: async args => {
          await paginaAnvisa.bringToFront()
          return paginaAnvisa.evaluate(naPagina, args)
        },
        log: m => console.error(m),
      })
    }
    const r = await rodarGate({
      ...a,
      medirML: async (marca, aliases) => {
        await paginaML.bringToFront()
        return presencaNoML(paginaML, marca, aliases)
      },
      consultar,
      log: m => console.error(m),
    })
    const saida = caminhoLivre(join(RAIZ, 'dados', 'gate-marca'), nomeDoArquivo(a.nome, a.categoria, a.data))
    gravarJson(saida, { categoria: a.categoria, data: a.data, controle: r.controle, resultados: r.resultados })
    console.log(tabela(r))
    console.log(`\nsalvo em ${saida}`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
