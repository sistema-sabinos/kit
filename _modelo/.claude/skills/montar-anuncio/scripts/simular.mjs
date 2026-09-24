#!/usr/bin/env node
// Simulador de custos oficial do Mercado Livre, lido pelo Chrome dedicado do pacote.
// O "Voce recebe" que ele devolve e o numero da verdade do preco: ja liquido de comissao,
// tarifa e custo de envio da sua conta. Tabela envelhece; o simulador nao.
//
// Uso, da raiz do projeto (Chrome dedicado aberto e logado, ver /mercado-livre):
//   node .claude/skills/montar-anuncio/scripts/simular.mjs --termo "bala de coco" --preco 39,90 --tipo classico --frete comprador --custo 15
//   --termo  o que digitar na busca de categoria do simulador; o primeiro card sugerido e o escolhido
//   --preco  preco do anuncio, com virgula ou ponto (39,90 ou 39.90)
//   --tipo   classico | premium (padrao classico)
//   --frete  gratis | comprador (padrao comprador; acima de R$ 79 o frete gratis e obrigatorio)
//   --custo  custo do produto, opcional, com virgula ou ponto: com ele sai o lucro liquido, usando o imposto_pct de _contexto/mercado-livre.md
// Saida: JSON com a categoria escolhida (texto do card), tarifa_venda, custo_envio, voce_recebe e, com --custo, lucro (imposto, lucro_liquido, margem_pct).
//
// Tela do simulador conferida ao vivo em 2026-09-24 com conta logada, em dois cenarios: classico
// com frete por conta do comprador a R$ 31,90, e premium com frete gratis a R$ 89,90. Tarifa de
// venda, custo de envio, "Você recebe" e a categoria escolhida batem com o que a pagina mostra de
// verdade nos dois. Acima de R$ 79 o frete gratis e obrigatorio (sem dropdown nem cartao pra
// escolher por conta do comprador) e o Mercado Livre da um desconto no envio por reputacao, entao
// o bloco do custo de envio mostra dois valores e o que vale e o segundo (depois do desconto). Se
// o Mercado Livre mudar a pagina, os seletores de simularNaPagina sao o que precisa de ajuste; a
// leitura do resumo e da categoria e por texto e aguenta mais.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conectar } from '../../mercado-livre/scripts/lib/chrome.mjs'
import { carregarConfiguracao, exigir } from '../../mercado-livre/scripts/lib/config.mjs'

export const URL_SIMULADOR = 'https://www.mercadolivre.com.br/simulador-de-custos'

// 'R$ 1.234,56' -> 1234.56; '-R$ 7,95' -> -7.95; nada -> null
export function numero(s) {
  if (s === undefined || s === null) return null
  const limpo = String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return limpo && Number.isFinite(n) ? n : null
}

// O campo de preco do simulador e mascarado e se digita com virgula: '39.9' vira '39,90'
export function precoParaDigitar(entrada) {
  const n = Number(String(entrada ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) throw new Error(`preco invalido: "${entrada}". Use algo como 39,90`)
  return n.toFixed(2).replace('.', ',')
}

// --custo vem dos contratos do pipeline, que escrevem decimal com ponto (30.00, 22.5), nunca com
// milhar: diferente do numero() do resumo da pagina, aqui ponto e virgula sao sempre o decimal.
export function custoInformado(entrada) {
  const s = String(entrada ?? '').trim()
  const n = Number(s.replace(',', '.'))
  if (!s || !Number.isFinite(n) || n < 0) throw new Error(`custo invalido: "${entrada}". Use algo como 15,90`)
  return n
}

export function tipoDeAnuncio(t) {
  const s = String(t ?? 'classico').trim().toLowerCase()
  if (s === 'classico' || s === 'clássico') return 'Clássico'
  if (s === 'premium') return 'Premium'
  throw new Error(`tipo invalido: "${t}". Use classico ou premium`)
}

export function argumentos(argv) {
  const pega = (nome, padrao) => {
    const i = argv.indexOf('--' + nome)
    return i >= 0 && argv[i + 1] !== undefined && !String(argv[i + 1]).startsWith('--') ? argv[i + 1] : padrao
  }
  const termo = String(pega('termo', '')).trim()
  if (!termo) throw new Error('faltou --termo: o produto ou a categoria pra buscar no simulador (ex.: --termo "bala de coco")')
  const preco = String(pega('preco', '')).trim()
  if (!preco) throw new Error('faltou --preco: o preco do anuncio (ex.: --preco 39,90)')
  const frete = String(pega('frete', 'comprador')).trim().toLowerCase()
  if (frete !== 'gratis' && frete !== 'comprador') throw new Error(`frete invalido: "${frete}". Use gratis ou comprador`)
  const iCusto = argv.indexOf('--custo')
  let custo = null
  if (iCusto >= 0) {
    const valor = argv[iCusto + 1]
    if (valor === undefined || String(valor).startsWith('--')) throw new Error('faltou o valor de --custo')
    custo = custoInformado(valor)
  }
  return { termo, preco: precoParaDigitar(preco), tipo: tipoDeAnuncio(pega('tipo', 'classico')), frete, custo }
}

// Tira script, style e tags de um HTML e devolve texto com uma linha por elemento,
// pra ler uma pagina gravada nos testes do mesmo jeito que o innerText ao vivo.
export function textoDeHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|span|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

// Le o resumo a partir do texto da pagina. Rotulos conhecidos (usados so pra limitar ate onde um
// bloco vai, nunca lidos por si so): Tarifa de venda, Custo de envio, Custos estimados, Você
// recebe, Preço do anúncio. O valor de um rotulo e um dinheiro do bloco que comeca nele e termina
// no proximo rotulo conhecido (na propria linha do rotulo, ou numa linha adiante que seja so o
// valor: nunca numa frase, senao um R$ de explicacao ou do rodape vira o numero). Tarifa e "Voce
// recebe" usam o primeiro dinheiro do bloco, regra de sempre. Excecao: quando o bloco da tarifa
// tambem tem mais de um candidato (tarifa cheia e com desconto, mesmo padrao do envio) e a pagina
// informa "Custos estimados", tarifa_venda so sai do PAR (tarifa, envio) cuja soma bate essa
// conferencia (tolerancia de 1 centavo) dentre os candidatos dos dois blocos; exatamente um par
// batendo, os dois valores do par saem; nenhum ou mais de um par batendo, tarifa_venda volta a ser
// o primeiro valor do bloco (regra de sempre) e so leva junto um custo_envio que bata sozinho com
// ele, senao os dois saem nulos. O envio, quando a pagina informa "Custos estimados" mas a tarifa
// tem um so candidato, usa o candidato do bloco que bate a conferencia da propria pagina (tarifa +
// envio = Custos estimados, tolerancia de 1 centavo): com frete gratis acima de R$ 79 o bloco
// mostra dois valores (o custo cheio e o custo depois do desconto por reputacao), e pegar "o
// ultimo que aparecer" sem essa conferencia cairia numa linha de dinheiro extra que a pagina
// acrescentasse depois do desconto. Com "Custos estimados" na tela, custo_envio so sai de um
// candidato que passou na conferencia: sem tarifa lida (nao da pra conferir), nenhum candidato
// batendo ou mais de um batendo, custo_envio fica nulo, nunca chutado. So quando a pagina nao tem
// valor de "Custos estimados" (paginas antigas, sem esse rotulo) o envio cai pro ultimo dinheiro
// do bloco. A pagina repete rotulo em ajuda e rodape, entao a procura comeca no ultimo bloco e so
// recua se ele nao tiver valor. Rotulo ausente ou bloco sem valor devolve null: numero inventado
// aqui viraria preco errado no anuncio. "Forma de envio:" tambem casa com /envio/i e nao e rotulo,
// por isso o rotulo do envio e ancorado (^Custo de envio). "Preço do anúncio" entra na lista so
// como fronteira: na tela real ele fica entre "Custo de envio" e "Custos estimados", e sem isso um
// envio sem valor proprio atravessava o rotulo e pegava o preco do anuncio como se fosse o custo
// do frete.
const DINHEIRO = /-?\s*R\$\s*[\d.]+,\d{2}/
const SO_DINHEIRO = new RegExp('^' + DINHEIRO.source + '$')
const ROTULOS_RESUMO = [/^Tarifa de venda/, /^Custo de envio/, /^Custos estimados/, /^Você recebe/, /^Preço do anúncio/]
export function lerResumo(texto) {
  const linhas = String(texto).split('\n').map(s => s.trim()).filter(Boolean)
  const ocorrencias = rotulo => {
    const idx = []
    linhas.forEach((l, i) => { if (rotulo.test(l)) idx.push(i) })
    return idx
  }
  const proximoRotulo = depois => {
    for (let i = depois; i < linhas.length; i++) if (ROTULOS_RESUMO.some(r => r.test(linhas[i]))) return i
    return linhas.length
  }
  const valoresNoBloco = (inicio, fimExclusivo) => {
    const valores = []
    const mesmaLinha = linhas[inicio].match(DINHEIRO)
    if (mesmaLinha) valores.push(numero(mesmaLinha[0]))
    for (let i = inicio + 1; i < fimExclusivo; i++) if (SO_DINHEIRO.test(linhas[i])) valores.push(numero(linhas[i]))
    return valores
  }
  // Os candidatos do primeiro bloco (de tras pra frente) que render algum valor; null sem nenhum.
  const candidatosDoRotulo = rotulo => {
    const idx = ocorrencias(rotulo)
    for (let k = idx.length - 1; k >= 0; k--) {
      const valores = valoresNoBloco(idx[k], proximoRotulo(idx[k] + 1))
      if (valores.length) return valores
    }
    return null
  }
  // tarifa_venda e custo_envio sao sempre custo: a pagina mostra em negativo, e o numero aqui e o
  // modulo. "Voce recebe" e o que sobra pro vendedor, pode dar prejuizo (negativo de verdade), e
  // esse sinal tem que passar adiante.
  const daLista = (valores, { emModulo = true, ultimo = false } = {}) => {
    if (!valores) return null
    const v = ultimo ? valores[valores.length - 1] : valores[0]
    return emModulo ? Math.abs(v) : v
  }
  const candidatosTarifa = candidatosDoRotulo(/^Tarifa de venda/)
  const custosEstimados = daLista(candidatosDoRotulo(/^Custos estimados/))
  const candidatosEnvio = candidatosDoRotulo(/^Custo de envio/)
  let tarifaVenda = daLista(candidatosTarifa)
  let custoEnvio = null
  if (candidatosTarifa && candidatosTarifa.length > 1 && custosEstimados !== null && candidatosEnvio) {
    // Tarifa com mais de um candidato (cheia e com desconto): so o par com a soma certa sai.
    const tarifasAbs = candidatosTarifa.map(v => Math.abs(v))
    const enviosAbs = candidatosEnvio.map(v => Math.abs(v))
    const pares = []
    tarifasAbs.forEach(t => enviosAbs.forEach(e => { if (Math.abs(t + e - custosEstimados) <= 0.01) pares.push([t, e]) }))
    if (pares.length === 1) {
      ;[tarifaVenda, custoEnvio] = pares[0]
    } else {
      const batem = enviosAbs.filter(e => Math.abs(tarifaVenda + e - custosEstimados) <= 0.01)
      if (batem.length === 1) custoEnvio = batem[0]
      else { tarifaVenda = null; custoEnvio = null }
    }
  } else if (candidatosEnvio) {
    if (custosEstimados !== null) {
      const batem = tarifaVenda === null ? [] : candidatosEnvio.map(v => Math.abs(v)).filter(v => Math.abs(tarifaVenda + v - custosEstimados) <= 0.01)
      custoEnvio = batem.length === 1 ? batem[0] : null
    } else {
      custoEnvio = daLista(candidatosEnvio, { ultimo: true })
    }
  }
  return {
    tarifa_venda: tarifaVenda,
    custo_envio: custoEnvio,
    voce_recebe: daLista(candidatosDoRotulo(/^Você recebe/), { emModulo: false }),
  }
}

// Depois de "A categoria escolhida" e "Criar nova simulação", a primeira linha e o nome da
// categoria (as seguintes, ate "Qual é a condição do produto?", sao o caminho, e nao interessam
// aqui). Sem o bloco (pagina ainda sem categoria escolhida), devolve null.
export function categoriaDoTexto(texto) {
  const linhas = String(texto ?? '').split('\n').map(s => s.trim()).filter(Boolean)
  const i = linhas.findIndex(l => l === 'Criar nova simulação')
  if (i < 0 || i + 1 >= linhas.length) return null
  const nome = linhas[i + 1]
  return nome === 'Qual é a condição do produto?' ? null : nome
}

// Confere se a tela ja mostra a opcao de frete pedida, sem precisar clicar em nada: acima de
// R$ 79 o Mercado Livre torna o frete gratis obrigatorio e nao sobra dropdown nem cartao pra
// escolher, so essa linha fixa no bloco do envio.
export function freteNaTela(texto, rotulo) {
  const linhas = String(texto ?? '').split('\n').map(s => s.trim())
  return linhas.some(l => l === rotulo)
}

export function lucro({ voceRecebe, preco, custo, impostoPct }) {
  for (const [k, v] of Object.entries({ voceRecebe, preco, custo, impostoPct })) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`lucro precisa de ${k} numerico (o imposto_pct vem de _contexto/mercado-livre.md; rode /mercado-livre se estiver vazio)`)
  }
  const r2 = x => Math.round(x * 100) / 100
  const imposto = preco * impostoPct / 100
  const liquido = voceRecebe - imposto - custo
  return { imposto: r2(imposto), custo: r2(custo), lucro_liquido: r2(liquido), margem_pct: r2(liquido / preco * 100) }
}

// Dirige a pagina do simulador e devolve { categoria, texto }: o texto do card escolhido e o da pagina. Os seletores sao os da tela conferida na data do cabecalho.
export async function simularNaPagina(page, { termo, preco, tipo, frete }) {
  const espera = ms => page.waitForTimeout(ms)
  await page.goto(URL_SIMULADOR, { waitUntil: 'domcontentloaded' })
  await espera(1500)

  // 1) categoria: busca e clique de mouse no primeiro card sugerido (e o clique que registra a escolha)
  const busca = page.locator('#search-box')
  await busca.click(); await busca.fill(''); await busca.type(termo, { delay: 50 })
  await espera(800)
  const botao = page.getByRole('button', { name: /^Buscar$/ })
  if (await botao.count()) { await botao.first().click(); await espera(2000) }
  const card = page.locator('button.andes-list__item-actionable, a.andes-list__item-actionable').nth(0)
  const caixa = await card.boundingBox()
  if (!caixa) throw new Error(`o simulador nao sugeriu categoria pra "${termo}". Tente um termo mais parecido com o nome da categoria.`)
  const categoria = await card.innerText().then(t => t.trim()).catch(() => null)
  await page.mouse.click(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await espera(2000)

  // 2) preco: campo mascarado, digitado caractere a caractere
  const campoPreco = page.locator('#selling_price_ML')
  for (let k = 0; k < 25 && (await campoPreco.evaluate(e => e.disabled).catch(() => true)); k++) await espera(300)
  await campoPreco.click()
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Delete')
  for (const ch of preco) { await page.keyboard.type(ch); await espera(40) }
  await page.keyboard.press('Tab')
  await espera(1500)

  // dropdown que nao trava se o Mercado Livre tirou o elemento
  const escolher = async (id, quer) => {
    const gatilho = page.locator('#' + id)
    if (!(await gatilho.count())) return false
    for (let k = 0; k < 25 && (await gatilho.evaluate(e => e.disabled).catch(() => true)); k++) await espera(300)
    await gatilho.click({ timeout: 5000 }).catch(() => {})
    await espera(900)
    const opcao = page.locator('[role=option],.andes-list__item').filter({ hasText: quer }).first()
    if (await opcao.count()) { await opcao.click(); await espera(1500); return true }
    await page.keyboard.press('Escape')
    return false
  }
  const clicarCartao = async quer => {
    const el = page.locator('label,button,[role=radio],.andes-list__item').filter({ hasText: quer }).first()
    if (!(await el.count())) return false
    await el.click({ timeout: 5000 }).catch(() => {})
    await espera(1200)
    return true
  }

  // 3) modalidade, 4) forma de envio, 5) frete gratis ou nao (dropdown antigo, ou cartao do layout novo).
  // Escolha que falha para aqui: seguir daria os numeros do padrao da pagina com o rotulo do pedido.
  const falhou = o => new Error(`nao consegui ${o} no simulador. Olhe a janela do Chrome dedicado: a pagina pode ter mudado.`)
  if (!(await escolher('listing_type_id-trigger', new RegExp('^' + tipo + '$', 'i')))) throw falhou(`escolher a modalidade ${tipo}`)
  if (!(await escolher('shipping_channel-trigger', /Envios no Mercado Livre/i))) throw falhou('escolher o envio "Envios no Mercado Livre"')
  const rotulo = frete === 'gratis' ? 'Você oferece frete grátis' : 'Você não oferece frete grátis'
  const ok = await escolher('shipping_col1_row2-trigger', new RegExp('^' + rotulo + '$', 'i'))
  if (!ok && !(await clicarCartao(new RegExp(rotulo, 'i')))) {
    // Acima de R$ 79 o frete gratis vira obrigatorio: sem dropdown nem cartao, a tela ja mostra a
    // linha fixa "Você oferece frete grátis". Aceita se for isso que o pedido queria; senao, avisa
    // que o preco travou o frete gratis (mensagem clara em vez do erro generico de seletor).
    const textoAtual = await page.evaluate(() => document.body.innerText)
    if (!freteNaTela(textoAtual, rotulo)) {
      if (frete === 'comprador' && freteNaTela(textoAtual, 'Você oferece frete grátis')) {
        throw new Error('nesse preco o Mercado Livre torna o frete gratis obrigatorio (acima de R$ 79): nao da pra marcar frete por conta do comprador. Rode de novo com --frete gratis.')
      }
      throw falhou(`marcar a opcao de frete "${rotulo}"`)
    }
  }
  await espera(1500)

  return { categoria, texto: await page.evaluate(() => document.body.innerText) }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  let browser = null
  try {
    const a = argumentos(process.argv.slice(2))
    const impostoPct = a.custo === null ? null : exigir(carregarConfiguracao(), ['imposto_pct']).imposto_pct
    browser = await conectar()
    const ctx = browser.contexts()[0] || (await browser.newContext())
    const page = ctx.pages().find(p => p.url().includes('simulador')) || ctx.pages()[0] || (await ctx.newPage())
    await page.bringToFront()
    const { categoria, texto } = await simularNaPagina(page, a)
    const resumo = lerResumo(texto)
    if (resumo.voce_recebe === null) throw new Error('o simulador nao mostrou "Voce recebe". A pagina pode ter mudado, ou a categoria nao foi escolhida: olhe a janela do Chrome dedicado e tente outro --termo.')
    const saida = { termo: a.termo, categoria: categoria || categoriaDoTexto(texto), preco: numero(a.preco), tipo: a.tipo, frete: a.frete, ...resumo }
    if (a.custo !== null) saida.lucro = lucro({ voceRecebe: resumo.voce_recebe, preco: saida.preco, custo: a.custo, impostoPct })
    console.log(JSON.stringify(saida, null, 2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
