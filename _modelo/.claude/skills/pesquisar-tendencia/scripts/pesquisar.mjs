#!/usr/bin/env node
// Processamento da /pesquisar-tendencia: metricas de preco, nota de oportunidade e os arquivos
// pesquisa-tendencia-<categoria>.md e .csv (contrato 0), mais a etapa pesquisa da categoria.
// Nao coleta nada: quem coleta e o coletar-cdp.mjs, que chama este no fim. Rodar sozinho
// refaz os arquivos a partir do _raw-pesquisa-<categoria>.json que ja existe.
//
// Uso, da raiz do projeto:
//   node .claude/skills/pesquisar-tendencia/scripts/pesquisar.mjs --fornecedor <f> --categoria <c>
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { gravarEtapaDaCategoria } from '../../mercado-livre/scripts/lib/pipeline.mjs'

export const CLASSES = ['oportunidade forte', 'vale considerar', 'desafiador', 'fora', 'sem dado']
export const COLUNAS = 'produto,custo,preco_min,preco_med,preco_max,margem_bruta_med,margem_pct,anuncios_livres,tem_catalogo,buybox_concorrentes,loja_oficial,nota,classificacao'

export function mediana(v) {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Preco fora de 30% a 500% da mediana e erro de leitura ou anuncio de outra coisa; com menos
// de 5 precos nao ha mediana confiavel pra cortar nada.
export function semOutliers(precos) {
  if (precos.length < 5) return precos
  const m = mediana(precos)
  return precos.filter(p => p >= m * 0.3 && p <= m * 5)
}

export function metricas(custo, busca) {
  const precos = semOutliers((busca?.itens || []).map(i => Number(i.preco)).filter(p => p > 0))
  if (!precos.length) return null
  const min = Math.min(...precos)
  const max = Math.max(...precos)
  const med = mediana(precos)
  return {
    min, med, max, n: precos.length,
    margemBruta: med - custo,
    margemPct: ((med - custo) / med) * 100,
    faixa: (max - min) / med,
    top1AbaixoPct: ((med - min) / med) * 100,
  }
}

export const lojaOficialNoTopo = p => (p.buybox?.itens || []).slice(0, 5).some(i => i.loja_oficial_id)
export const anunciosNaBusca = p => p.busca?.total ?? p.busca?.itens?.length ?? 0

// Nota de 0 a 100 a partir de 50. Heuristica: serve pra ordenar a conversa, nunca pra decidir sozinha.
export function nota(p) {
  const m = metricas(p.custo, p.busca)
  if (!m) return { nota: null, classificacao: 'sem dado', metricas: null }
  let n = 50
  if (m.med >= p.custo * 2) n += 10
  if (m.med >= p.custo * 3) n += 10
  if (anunciosNaBusca(p) < 20) n += 10
  if (!lojaOficialNoTopo(p) && p.catalogo?.produtos?.length) n += 5
  if (m.med < p.custo * 1.5) n -= 10
  if (m.top1AbaixoPct > 25) n -= 5
  if (anunciosNaBusca(p) > 50 && m.faixa < 0.2) n -= 15
  n = Math.max(0, Math.min(100, n))
  const classificacao = n >= 70 ? 'oportunidade forte' : n >= 50 ? 'vale considerar' : n >= 30 ? 'desafiador' : 'fora'
  return { nota: n, classificacao, metricas: m }
}

const dinheiro = v => (v === null || v === undefined ? '' : Number(v).toFixed(2))
const aspas = s => `"${String(s).replace(/"/g, '""')}"`

// Campo sem dado fica vazio, nunca inventado (contratos.md): catalogo que nem foi consultado nao
// vira "nao", e buybox que falhou (com catalogo achado) nao vira "0" concorrentes.
export function linhaCsv(p) {
  const { nota: n, classificacao, metricas: m } = nota(p)
  const catalogoErro = Boolean(p.catalogo?.erro)
  const buyboxErro = Boolean(p.buybox?.erro)
  const temCatalogo = catalogoErro ? '' : (p.catalogo?.produtos?.length ? 'sim' : 'nao')
  const buyboxConcorrentes = catalogoErro || buyboxErro ? '' : (p.buybox?.itens?.length ?? 0)
  const lojaOficial = catalogoErro || buyboxErro ? '' : (lojaOficialNoTopo(p) ? 'sim' : 'nao')
  return [
    aspas(p.nome), dinheiro(p.custo), dinheiro(m?.min), dinheiro(m?.med), dinheiro(m?.max),
    dinheiro(m?.margemBruta), m ? m.margemPct.toFixed(1) : '', anunciosNaBusca(p),
    temCatalogo, buyboxConcorrentes, lojaOficial, n ?? '', classificacao,
  ].join(',')
}

export function gerarCsv(lista) {
  return [COLUNAS, ...lista.map(linhaCsv)].join('\n') + '\n'
}

export function gerarMd(lista, { fornecedor, categoria, hoje }) {
  const avaliados = lista.map(p => ({ p, ...nota(p) })).sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1))
  const conta = c => avaliados.filter(x => x.classificacao === c).length
  const L = []
  L.push(`# Pesquisa de tendência: ${categoria}, fornecedor ${fornecedor}`, '')
  L.push(`> Gerado pela /pesquisar-tendencia em ${hoje}. Fonte: catálogo do fornecedor, API do Mercado Livre e a busca aberta no Chrome dedicado.`)
  L.push(`> Produtos analisados: ${lista.length}. Preço fora de 30% a 500% da mediana foi descartado.`, '')
  L.push('## Resumo', '', '| Classificação | Produtos |', '|---|---|')
  for (const c of CLASSES) if (c !== 'sem dado' || conta(c)) L.push(`| ${c} | ${conta(c)} |`)
  L.push('', '> Nota é heurística automática: ordena a conversa, e quem decide é você na /decidir-anuncio.', '', '---', '')
  for (const { p, nota: n, classificacao, metricas: m } of avaliados) {
    L.push(`## ${p.nome}`, '')
    if (p.cuidado) L.push(`> CUIDADO: ${p.cuidado}`, '')
    L.push(`- Custo: R$ ${dinheiro(p.custo)}. Termo de busca: \`${p.termo}\``)
    if (!m) {
      L.push(`- Sem dado: ${p.busca?.erro || 'a busca não trouxe anúncio com preço'}. Tentar outro termo.`, '', '---', '')
      continue
    }
    L.push(`- Faixa de mercado: R$ ${dinheiro(m.min)} (mínimo), R$ ${dinheiro(m.med)} (mediana), R$ ${dinheiro(m.max)} (máximo), sobre ${m.n} preços`)
    L.push(`- Margem bruta na mediana: R$ ${dinheiro(m.margemBruta)} (${m.margemPct.toFixed(0)}% do preço), antes de comissão, envio e imposto`)
    const catalogoTexto = p.catalogo?.erro
      ? `não consultado (${p.catalogo.erro})`
      : p.catalogo?.produtos?.length
        ? p.buybox?.erro
          ? `sim, vendedores não consultados (${p.buybox.erro})`
          : `sim, ${p.buybox?.itens?.length ?? 0} vendedores disputando${lojaOficialNoTopo(p) ? ', com loja oficial' : ''}`
        : 'não'
    L.push(`- Anúncios na busca: ${anunciosNaBusca(p)}. Catálogo unificado: ${catalogoTexto}`)
    if (p.catalogo?.erro) {
      // Sem catalogo, produtos.length fica 0 e o bonus de +5 (nota()) nunca entra: a nota mostrada
      // pode estar ate 5 pontos ABAIXO do que seria com o catalogo consultado.
      L.push('- Atenção: sem a consulta de catálogo, a nota pode estar até 5 pontos abaixo do real.')
    } else if (p.buybox?.erro) {
      // Com o buybox no erro, p.buybox.itens fica [] e lojaOficialNoTopo(p) da falso (sem checar
      // de verdade): nota() concede o bonus de +5 como se "sem loja oficial" fosse confirmado. Se
      // existir loja oficial de verdade, o bonus nao devia ter entrado, entao a nota mostrada pode
      // estar ate 5 pontos ACIMA do real (o oposto do caso de catalogo nao consultado).
      L.push('- Atenção: sem a consulta do buybox, a nota pode estar até 5 pontos acima do real.')
    }
    L.push(`- **Nota ${n} (${classificacao})**`, '', 'Cinco primeiros da busca:', '')
    ;(p.busca.itens || []).slice(0, 5).forEach((it, i) => L.push(`${i + 1}. ${it.titulo} (R$ ${dinheiro(it.preco)}${it.frete_gratis ? ', frete grátis' : ''}${it.patrocinado ? ', patrocinado' : ''})`))
    L.push('', '---', '')
  }
  return L.join('\n')
}

export function processar({ fornecedor, categoria, raiz = RAIZ, hoje = new Date().toISOString().slice(0, 10) }) {
  const pasta = join(raiz, 'fornecedores', fornecedor)
  const bruto = join(pasta, `_raw-pesquisa-${categoria}.json`)
  if (!existsSync(bruto)) throw new Error(`nao existe ${bruto}. Rode antes a coleta: node .claude/skills/pesquisar-tendencia/scripts/coletar-cdp.mjs --fornecedor ${fornecedor} --categoria ${categoria}`)
  const lista = JSON.parse(readFileSync(bruto, 'utf8'))
  const md = join(pasta, `pesquisa-tendencia-${categoria}.md`)
  const csv = join(pasta, `pesquisa-tendencia-${categoria}.csv`)
  writeFileSync(md, gerarMd(lista, { fornecedor, categoria, hoje }))
  writeFileSync(csv, gerarCsv(lista))
  const distribuicao = Object.fromEntries(CLASSES.map(c => [c, lista.filter(p => nota(p).classificacao === c).length]))
  const rel = f => `fornecedores/${fornecedor}/${f}`
  const arquivos = [rel(`_raw-pesquisa-${categoria}.json`), rel(`pesquisa-tendencia-${categoria}.md`), rel(`pesquisa-tendencia-${categoria}.csv`)]
  gravarEtapaDaCategoria({ fornecedor, categoria, raiz, etapa: 'pesquisa', dados: { status: 'ok', em: hoje, produtos: lista.length, distribuicao, arquivos } })
  return { produtos: lista.length, distribuicao, arquivos }
}

export function argumentos(argv) {
  const pega = nome => {
    const i = argv.indexOf('--' + nome)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
  }
  const fornecedor = pega('fornecedor')
  const categoria = pega('categoria')
  if (!fornecedor || !categoria) throw new Error('uso: --fornecedor <nome da pasta em fornecedores/> --categoria <categoria> (ex.: --fornecedor fornecedor-exemplo --categoria doces)')
  return { fornecedor, categoria }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const r = processar(argumentos(process.argv.slice(2)))
    console.log(`${r.produtos} produtos: ${Object.entries(r.distribuicao).filter(([, n]) => n).map(([c, n]) => `${n} ${c}`).join(', ')}`)
    for (const f of r.arquivos) console.log(f)
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
