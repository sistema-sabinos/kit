#!/usr/bin/env node
// Engenharia reversa de um nicho do Mercado Livre: compara os anuncios que mais faturam com
// anuncios fracos do MESMO produto e diz o que separa os dois, quanto custa entrar no
// catalogo e que duvida de cliente ninguem responde.
// Uso, da raiz do projeto (Chrome dedicado aberto e logado):
//   node .claude/skills/engenharia-reversa/scripts/rx.mjs --termo "<busca>" [--so-tradicional]
//   node .claude/skills/engenharia-reversa/scripts/rx.mjs --termo "<busca>" --ver          (estima e para)
//   node .claude/skills/engenharia-reversa/scripts/rx.mjs --termo "<busca>" --ver --sim    (gasta)
// A rodada gratis grava tudo em dados/engenharia-reversa/<termo>/; o --ver trabalha so sobre
// o que ja esta la. Saida: 0 ok; 1 falhou; 2 uso errado; 3 parou antes de gastar.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { conectar } from '../../mercado-livre/scripts/lib/chrome.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { mlGet } from '../../mercado-livre/scripts/lib/ml-api.mjs'
import { lerEnv } from '../../mercado-livre/scripts/lib/env.mjs'
import { carregarConfiguracao, PADROES } from '../../mercado-livre/scripts/lib/config.mjs'
import { slugDe, lerJson, gravarJson, dataLocal } from '../../mercado-livre/scripts/lib/pipeline.mjs'
import { coletarBusca, tipoDoLink } from '../../pesquisar-tendencia/scripts/coletar-cdp.mjs'
import { lerPagina, fotosUnicas, urlParaAbrir } from '../../espionar-concorrente/scripts/espionar.mjs'
import { lerArgs } from '../../gerar-imagens/scripts/lib/args.mjs'
import { separarGrupos } from './lib/grupos.mjs'
import { listaDeVendedores, emLotes, tirarDuplicatas } from './lib/catalogo.mjs'
import { abrirMedidor } from './lib/medir.mjs'
import { analisar } from './lib/bateria.mjs'
import { montarRelatorio, recibo } from './lib/relatorio.mjs'
import { descobrirModelo, estimar, precoDoDia, verFotos } from './lib/ver.mjs'

export function argumentos(argv) {
  const a = lerArgs(argv)
  const termo = typeof a.termo === 'string' ? a.termo.trim() : ''
  if (!termo) throw new Error('uso: --termo "<o que o comprador digita na busca>" [--so-tradicional] [--ver [--sim]]')
  // chave pura: "--sim nao" viraria sim e gastaria
  for (const chave of ['sim', 'ver', 'so-tradicional']) if (a[chave] !== undefined && a[chave] !== true) throw new Error(`--${chave} nao leva valor: escreva so --${chave}`)
  if (a.sim && !a.ver) throw new Error('--sim so vale junto com --ver')
  const soTradicional = Boolean(a['so-tradicional'])
  // a rodada tradicional grava em pasta e relatorio proprios, senao apaga a outra do mesmo dia
  return { termo, slug: slugDe(termo) + (soTradicional ? '-tradicional' : ''), soTradicional, ver: Boolean(a.ver), sim: Boolean(a.sim) }
}

export const caminhos = (slug, data, raiz = RAIZ) => ({
  pasta: join(raiz, 'dados', 'engenharia-reversa', slug),
  coleta: join(raiz, 'dados', 'engenharia-reversa', slug, 'coleta.json'),
  fichas: join(raiz, 'dados', 'engenharia-reversa', slug, 'fichas.json'),
  resultado: join(raiz, 'dados', 'engenharia-reversa', slug, 'resultado.json'),
  fotos: join(raiz, 'dados', 'engenharia-reversa', slug, 'fotos'),
  relatorio: join(raiz, 'relatorios', `engenharia-reversa-${slug}-${data}.md`),
})

// Roda dentro da pagina de perguntas: um elemento por pergunta, o texto dela sozinho. Botao de
// denunciar, data e rodape nao estao nesse no. Conferido ao vivo em 2026-10-04.
export function extrairPerguntas() {
  return [...document.querySelectorAll('.ui-pdp-questions__questions-list__item-questions--others-questions')]
    .map(item => ({
      pergunta: item.querySelector('.ui-pdp-questions__questions-list__question')?.textContent?.trim() || null,
      resposta: item.querySelector('.ui-pdp-questions__questions-list__answer-container__answer')?.textContent?.trim() || null,
    }))
    .filter(q => q.pergunta)
}

const pediuLogin = e => /login/i.test(String(e?.message))

// A parte gratis inteira. Tudo que fala com o mundo entra por parametro.
export async function rodadaGratis({ termo, soTradicional = false, buscar, get, lerAnuncio, lerPerguntas, baixar, medidor, pastaFotos, dormir = ms => new Promise(r => setTimeout(r, ms)), log = () => {}, hoje = dataLocal() }) {
  const busca = await buscar(termo)
  if (busca.erro) throw new Error(busca.erro)
  let pool = busca.itens.filter(i => i.id)
  // so destino conhecido: o patrocinado esconde a pagina atras do link de clique e pode ser
  // catalogo (o ensaio de 2026-10-04 deixou entrar 4 catalogos por ali)
  if (soTradicional) pool = pool.filter(i => i.tipo === 'tradicional' || i.tipo === 'produto')
  const idsCatalogo = [...new Set(pool.filter(i => i.tipo === 'catalogo').map(i => i.id))]
  const listas = await emLotes(idsCatalogo, 5, id => listaDeVendedores(id, get))
  const semDup = tirarDuplicatas(pool, listas)
  const grupos = separarGrupos(semDup.anuncios)
  const escolhidos = [...grupos.campeoes, ...grupos.controle]
  log(`busca: ${busca.itens.length} anuncios; ${grupos.campeoes.length} campeoes e ${grupos.controle.length} fracos escolhidos`)
  const lidos = []
  const falharam = []
  for (const a of escolhidos) {
    try {
      const url = urlParaAbrir(a)
      if (!url) throw new Error('sem endereco pra abrir')
      const p = await lerAnuncio(url)
      const fotos = fotosUnicas(p.fotos)
      const perguntas = p.link_perguntas ? await lerPerguntas(p.link_perguntas).catch(() => []) : []
      // patrocinado chega com link de clique e sem tipo: a pagina aberta diz o destino real
      const destino = a.tipo == null && p.url_final ? { url: p.url_final.split('#')[0].split('?')[0], tipo: tipoDoLink(p.url_final) } : {}
      // catalogo que chegou por patrocinado: o id do anuncio e de um vendedor, o do catalogo esta no link
      if (destino.tipo === 'catalogo') destino.catalogo_id = (p.url_final.match(/\/p\/(MLB\d+)/) || [])[1] ?? null
      lidos.push({ ...a, ...destino, fotos, video: p.video ?? null, descricao: p.descricao ?? null, perguntas })
      log(`${a.id}: ${fotos.length} fotos, ${perguntas.length} perguntas`)
    } catch (e) {
      if (pediuLogin(e)) throw new Error('a pagina pediu login: a sessao do Chrome dedicado caiu. Entre de novo na conta e rode outra vez')
      falharam.push({ id: a.id, erro: `pagina: ${String(e.message).slice(0, 120)}` })
    }
    await dormir(2000 + Math.floor(Math.random() * 2000))
  }
  mkdirSync(pastaFotos, { recursive: true })
  for (const a of lidos) {
    a.fotos_locais = []
    for (const [i, url] of a.fotos.entries()) {
      const ext = ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(new URL(url).pathname).toLowerCase()) ? extname(new URL(url).pathname).toLowerCase() : '.jpg'
      const arquivo = join(pastaFotos, `${a.id}-${String(i + 1).padStart(2, '0')}${ext}`)
      try { await baixar(url, arquivo); a.fotos_locais.push(arquivo) } catch (e) { log(`${a.id}: foto ${i + 1} nao baixou (${e.message})`) }
    }
    a.capa = a.fotos_locais[0] ? await medidor.medir(a.fotos_locais[0]) : { erro: 'sem foto baixada' }
  }
  // catalogo descoberto ao abrir a pagina ganha a lista de vendedores agora
  const jaTem = new Set(listas.map(l => l.id))
  const faltam = [...new Set(lidos.filter(a => a.catalogo_id && !jaTem.has(a.catalogo_id)).map(a => a.catalogo_id))]
  listas.push(...(await emLotes(faltam, 5, cid => listaDeVendedores(cid, get))))
  const usados = new Set(escolhidos.map(a => a.id).concat(lidos.map(a => a.catalogo_id).filter(Boolean)))
  return {
    termo,
    data: hoje,
    so_tradicional: soTradicional,
    amostra: { busca: busca.itens.length, pool: pool.length, duplicatas: semDup.duplicatas },
    busca: busca.itens,
    grupos: { diagnostico: grupos.diagnostico },
    lidos,
    falharam,
    listas: listas.filter(l => usados.has(l.id)),
  }
}

// Analise e relatorio a partir do que esta em disco. Com fichas, entram os testes do --ver.
export function gerarSaidas(coleta, fichas = null) {
  const lidos = fichas ? coleta.lidos.map(a => ({ ...a, fichas: fichas[a.id] ?? [] })) : coleta.lidos
  const r = analisar({ termo: coleta.termo, data: coleta.data, amostra: coleta.amostra, grupos: coleta.grupos, lidos, falharam: coleta.falharam, listas: coleta.listas, comVer: Boolean(fichas) })
  return { resultado: r, relatorio: montarRelatorio(r) }
}

function gravarSaidas(c, coleta, fichas) {
  const { resultado, relatorio } = gerarSaidas(coleta, fichas)
  gravarJson(c.resultado, resultado)
  mkdirSync(join(c.relatorio, '..'), { recursive: true })
  writeFileSync(c.relatorio, relatorio)
  return resultado
}

// O portao de custo. Devolve o codigo em vez de encerrar o processo: process.exit com a conexao
// do Gemini aberta derruba o Node no Windows (visto no ensaio de 2026-10-04, codigo 127 em vez de 3).
// Codigo 3 = parou antes de gastar (fora da tabela, acima do limite, ou sem o --sim).
export async function passoVer({ porAnuncio, chave, hoje, limite, sim, descobrir = descobrirModelo, ver = verFotos, log = () => {} }) {
  const fotos = porAnuncio.reduce((n, x) => n + x.fotos.length, 0)
  const modelo = await descobrir(chave)
  const est = estimar({ fotos, modelo, hoje })
  if (est.recusado) return { codigo: 3, saida: { parou: est.recusado, modelo, fotos } }
  const resumo = { modelo, fotos, estimativa_usd: est.usd, minutos: est.minutos, preco_conferido_em: est.preco.conferido_em, promocional_ate: est.preco.promocional_ate, limite_gasto_usd: limite }
  if (est.usd > limite) return { codigo: 3, saida: { parou: 'passa do limite_gasto_usd da configuracao', ...resumo } }
  if (!sim) return { codigo: 3, saida: { parou: 'precisa do pode ir da pessoa', ...resumo } }
  const r = await ver(porAnuncio, { modelo, chave, preco: precoDoDia(modelo, hoje) }, { log, limite })
  // Falha em massa (cota, rede) deixa um grupo sem ficha e fabrica "regra": a rodada nao vale.
  const todas = Object.values(r.fichas).flat()
  const comErro = todas.filter(f => f.erro).length
  if (r.parou) return { codigo: 1, fichas: r.fichas, erro: `parei no limite_gasto_usd (US$ ${r.gasto_usd} de US$ ${limite}) antes de ler todas as fotos; o relatorio nao foi refeito` }
  if (todas.length && comErro / todas.length > ERRO_MAX) return { codigo: 1, fichas: r.fichas, erro: `${comErro} de ${todas.length} fotos deram erro no Gemini (cota, rede ou chave); o relatorio nao foi refeito pra nao tirar conclusao de leitura pela metade` }
  return { codigo: 0, fichas: r.fichas }
}
export const ERRO_MAX = 0.2

const fotosEmDisco = coleta => coleta.lidos.map(a => ({ id: a.id, titulo: a.titulo, fotos: (a.fotos_locais ?? []).filter(f => existsSync(f)) }))

async function baixarFoto(url, arquivo) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  writeFileSync(arquivo, Buffer.from(await r.arrayBuffer()))
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  let a
  try { a = argumentos(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(2) }
  const hoje = dataLocal()
  let browser = null
  let medidor = null
  try {
    if (!a.ver) {
      const c = caminhos(a.slug, hoje)
      const token = await tokenMl()
      browser = await conectar()
      const ctx = browser.contexts()[0] || (await browser.newContext())
      const page = await ctx.newPage()
      await page.bringToFront()
      const abrir = async url => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await page.waitForTimeout(2500)
        if (/login|registration/i.test(page.url())) throw new Error('a pagina pediu login')
      }
      medidor = await abrirMedidor()
      const coleta = await rodadaGratis({
        termo: a.termo,
        soTradicional: a.soTradicional,
        buscar: termo => coletarBusca(page, termo, { maxItens: 120, maxPaginas: 2 }),
        get: caminho => mlGet(caminho, { token }),
        lerAnuncio: async url => { await abrir(url); await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(1500); return { ...(await page.evaluate(lerPagina)), url_final: page.url() } },
        lerPerguntas: async url => { await abrir(url); return page.evaluate(extrairPerguntas) },
        baixar: baixarFoto,
        medidor,
        pastaFotos: c.fotos,
        log: m => console.error(m),
        hoje,
      })
      await page.close().catch(() => {})
      gravarJson(c.coleta, coleta)
      const r = gravarSaidas(c, coleta, null)
      console.log(recibo(r, { relatorio: c.relatorio, pasta: c.pasta }))
    } else {
      const base = caminhos(a.slug, hoje)
      const coleta = lerJson(base.coleta)
      if (!coleta) throw new Error(`nao achei ${base.coleta}. Rode antes a parte gratis: --termo "${a.termo}" sem --ver`)
      const c = caminhos(a.slug, coleta.data)
      const chave = lerEnv().GEMINI_API_KEY
      if (!chave) throw Object.assign(new Error('falta GEMINI_API_KEY no .env (o /conectar ensina a pegar)'), { codigo: 2 })
      let limite = PADROES.limite_gasto_usd
      try { limite = carregarConfiguracao().limite_gasto_usd ?? limite } catch {}
      const r = await passoVer({ porAnuncio: fotosEmDisco(coleta), chave, hoje, limite, sim: a.sim, log: m => console.error(m) })
      if (r.codigo === 3) console.log(JSON.stringify(r.saida))
      else if (r.codigo === 1) {
        // o que foi pago fica em disco, pra ninguem pagar de novo sem saber
        gravarJson(c.fichas, r.fichas)
        console.error(`${r.erro}. As fichas lidas ficaram em ${c.fichas}`)
      } else {
        gravarJson(c.fichas, r.fichas)
        const res = gravarSaidas(c, coleta, r.fichas)
        console.log(recibo(res, { relatorio: c.relatorio, pasta: c.pasta }))
      }
      process.exitCode = r.codigo
    }
  } catch (e) {
    console.error(e.message)
    process.exitCode = e.codigo ?? 1
  } finally {
    if (medidor) await medidor.fechar()
    // numa conexao por CDP, close so desconecta: o Chrome dedicado continua aberto
    if (browser) await browser.close().catch(() => {})
  }
}
