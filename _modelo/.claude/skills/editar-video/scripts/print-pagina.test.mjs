// Prova o print de pagina da inserção no Chrome de verdade, em modo sem janela, com uma pagina local. O Playwright vem
// do projeto ou, na bancada, da pasta em SABINOS_PLAYWRIGHT; sem nenhum dos dois os testes aparecem como PULADOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { acharPlaywright, INSTALAR } from '../../gerar-imagens/scripts/lib/render.mjs'
import { lerEnv } from '../../conectar/scripts/lib/env.mjs'
import { printar, main, identidadeCelular, conferirResposta, agulhasDoAluno, degrausDe, borrarCabecalho, temDadoPessoal, dadoPessoalNaTela, paginaVazia, TELA, ESCALA } from './print-pagina.mjs'

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

// 5.58 C: print em degraus. Os testes de mentira usam um Playwright falso: cada goto devolve o proximo da fila
// (numero e o status, null e sem resposta, 'tempo' e o prazo estourado) e toda chamada vai pro registro. Sem rede e
// sem janela. O degrau logado entra pelo conectarLogado falso, com uma aba do aluno que nunca pode fechar.
const VERSAO = '157.0.8103.51'
// o texto visivel que o falso devolve por padrao (textos: a fila, um por degrau)
const TEXTO_PRODUTO = 'Garrafa termica Lumora 500 ml com medidor de temperatura. Frete gratis.'
// quadros: o resultado programado de cada iframe da pagina (true achou, false limpo, 'erro' nao deixa avaliar);
// { erro: 'mensagem' } na fila de respostas faz o goto lancar essa mensagem
function mundo({ respostas = [], dado = false, cookies = [{ name: 'sessao' }], conectarFalha = false, textos = [], quadros = [] } = {}) {
  const reg = []
  const fila = [...respostas], filaTexto = [...textos]
  const contexto = (dono) => ({ newCDPSession: async () => ({ send: async (m, p) => { reg.push(['cdp', dono, m, p]) } }) })
  const quadro = (dono, i, q) => ({
    evaluate: async (fn) => {
      reg.push(['evaluate', `${dono}:quadro${i}`, fn.name])
      if (q === 'erro') throw new Error('frame.evaluate: Frame was detached')
      return q
    },
  })
  const pagina = (dono) => ({
    frames() { return [this, ...quadros.map((q, i) => quadro(dono, i, q))] },
    goto: async (u, op) => {
      reg.push(['goto', dono, u, op])
      const r = fila.shift()
      if (r === 'tempo') throw Object.assign(new Error('page.goto: Timeout 45000ms exceeded.'), { name: 'TimeoutError' })
      if (r?.erro) throw new Error(`page.goto: ${r.erro}`)
      return r === null ? null : { status: () => r }
    },
    evaluate: async (fn) => {
      reg.push(['evaluate', dono, fn.name])
      if (fn.name === 'textoVisivel') return filaTexto.length ? filaTexto.shift() : TEXTO_PRODUTO
      return { esconderAvisos: 0, marcarNaPagina: 0.5, borrarCabecalho: 1, temDadoPessoal: dado }[fn.name]
    },
    screenshot: async (op) => { reg.push(['screenshot', dono, op]); return Buffer.from('foto ' + dono) },
    close: async () => { reg.push(['fecharAba', dono]) },
    context: () => contexto(dono),
    isClosed: () => false,
  })
  const chromium = {
    launch: async (op) => {
      reg.push(['launch', op])
      const dono = op.headless === false ? 'com-janela' : 'sem-janela'
      return {
        newPage: async (op2) => { reg.push(['newPage', dono, op2]); return pagina(dono) },
        version: () => VERSAO,
        close: async () => { reg.push(['fecharNavegador', dono]) },
      }
    },
  }
  const abaDoAluno = pagina('aba-do-aluno')
  const ctx = {
    ...contexto('logado'),
    cookies: async (u) => { reg.push(['cookies', u]); return cookies },
    newPage: async () => { reg.push(['newPage', 'logado']); return pagina('logado') },
    pages: () => [abaDoAluno],
  }
  const conectarLogado = async () => {
    reg.push(['conectar'])
    if (conectarFalha) throw new Error('o Chrome dedicado nao esta aberto (porta 29300).')
    return { contexts: () => [ctx], version: () => VERSAO, close: async () => { reg.push(['desligar']) } }
  }
  return { reg, carregar: async () => ({ chromium }), conectarLogado }
}
const nomes = (reg, tipo) => reg.filter((x) => x[0] === tipo)
const LOJA = 'https://loja.exemplo.com/produto/1'
const COM_NOME = { ALUNO_NOME: 'Lumora Vexto' }

async function emTemp(fazer) {
  const d = mkdtempSync(join(tmpdir(), 'print-'))
  try { return await fazer(d) } finally { rmSync(d, { recursive: true, force: true }) }
}

test('5.58 C: identidadeCelular sai sem Headless, de celular e com a versao do Chrome aberto', () => {
  for (const v of [VERSAO, 'HeadlessChrome/157.0.8103.51']) {
    const id = identidadeCelular(v)
    assert.doesNotMatch(id.userAgent, /headless/i)
    assert.match(id.userAgent, /Android.*Chrome\/157\.0\.0\.0 Mobile Safari/)
    assert.equal(id.userAgentMetadata.mobile, true)
    assert.ok(id.userAgentMetadata.brands.some((b) => b.brand === 'Google Chrome' && b.version === '157'))
    assert.doesNotMatch(JSON.stringify(id.userAgentMetadata), /headless/i)
  }
})

test('5.58 C: conferirResposta barra 400 ou mais e o sem resposta em http, e deixa o sem resposta em file:', () => {
  const st = (n) => ({ status: () => n })
  assert.equal(conferirResposta(st(200), LOJA).barrado, false)
  assert.equal(conferirResposta(st(399), LOJA).barrado, false)
  assert.deepEqual(conferirResposta(st(400), LOJA), { barrado: true, status: 400 })
  assert.deepEqual(conferirResposta(st(403), LOJA), { barrado: true, status: 403 })
  assert.equal(conferirResposta(null, LOJA).barrado, true)
  assert.equal(conferirResposta(null, 'file:///tmp/x/p.html').barrado, false)
})

test('5.58 C: agulhasDoAluno le nome, email e o usuario que e email, sem acento e minusculo', () => {
  const a = agulhasDoAluno({ ALUNO_NOME: 'JOÃO Vexto', ALUNO_EMAIL: 'contato@lumora.com.br', ML_USUARIO: 'joao.v@lumora.com', BLING_USUARIO: 'nao-e-email' })
  for (const x of ['joao vexto', 'joao', 'vexto', 'contato@lumora.com.br', 'contato', 'joao.v@lumora.com', 'joao.v']) assert.ok(a.includes(x), x)
  assert.ok(!a.includes('nao-e-email'))
  assert.deepEqual(agulhasDoAluno({}), [])
  assert.deepEqual(agulhasDoAluno({ ML_USUARIO: 'so-apelido' }), [])
})

test('5.58 C: 403 sem --marcar nao grava o print e sai 2 pedindo o print ao aluno', () => emTemp(async (d) => {
  const m = mundo({ respostas: [403, 403] })
  const sai = join(d, 'p.png'), saidas = []
  const codigo = await main([LOJA, sai], { carregar: m.carregar, conectarLogado: m.conectarLogado, env: {}, log: (s) => saidas.push(s), erro: (s) => saidas.push(s) })
  assert.equal(nomes(m.reg, 'goto').length, 2, 'canario: os dois degraus navegaram')
  assert.equal(codigo, 2)
  assert.equal(existsSync(sai), false)
  assert.match(saidas.join('\n'), /Peca ao aluno o print/)
  assert.ok(!nomes(m.reg, 'screenshot').length)
}))

test('5.58 C: 403 no sem janela, logado indisponivel e 200 com janela grava pelo com janela', () => emTemp(async (d) => {
  const m = mundo({ respostas: [403, 200], conectarFalha: true })
  const sai = join(d, 'p.png')
  const r = await printar({ fonte: LOJA, saida: sai, carregar: m.carregar, conectarLogado: m.conectarLogado, env: COM_NOME })
  assert.equal(r.degrau, 'com-janela')
  assert.equal(readFileSync(sai, 'utf8'), 'foto com-janela')
  assert.deepEqual(nomes(m.reg, 'launch').map((x) => x[1]), [{ channel: 'chrome' }, { channel: 'chrome', headless: false }])
  assert.equal(nomes(m.reg, 'conectar').length, 1, 'o logado foi tentado')
  assert.equal(r.motivos.length, 2)
  // tempo estourado tambem sobe
  const t = mundo({ respostas: ['tempo', 200] })
  assert.equal((await printar({ fonte: LOJA, saida: join(d, 't.png'), carregar: t.carregar, conectarLogado: t.conectarLogado, env: {} })).degrau, 'com-janela')
}))

test('5.58 C: logado com o nome do aluno na tela sobe de degrau; sem ele grava, borrando antes de procurar e do print', () => emTemp(async (d) => {
  const comDado = mundo({ respostas: [403, 200, 200], dado: true })
  const r = await printar({ fonte: LOJA, saida: join(d, 'a.png'), carregar: comDado.carregar, conectarLogado: comDado.conectarLogado, env: COM_NOME })
  assert.ok(nomes(comDado.reg, 'evaluate').some((x) => x[1] === 'logado' && x[2] === 'temDadoPessoal'), 'canario: o logado procurou')
  assert.equal(r.degrau, 'com-janela')
  assert.ok(!nomes(comDado.reg, 'screenshot').some((x) => x[1] === 'logado'), 'o logado com dado nao pode fotografar')
  const limpo = mundo({ respostas: [403, 200] })
  const r2 = await printar({ fonte: LOJA, saida: join(d, 'b.png'), carregar: limpo.carregar, conectarLogado: limpo.conectarLogado, env: COM_NOME })
  assert.equal(r2.degrau, 'logado')
  const ordem = limpo.reg.filter((x) => x[1] === 'logado').map((x) => x[0] === 'evaluate' ? x[2] : x[0])
  const i = (n) => ordem.indexOf(n)
  assert.ok(i('borrarCabecalho') >= 0 && i('borrarCabecalho') < i('temDadoPessoal') && i('temDadoPessoal') < i('screenshot'), ordem.join(','))
  assert.ok(i('goto') < i('borrarCabecalho'))
  assert.ok(nomes(limpo.reg, 'cdp').some((x) => x[1] === 'logado' && x[2] === 'Emulation.setDeviceMetricsOverride' && x[3].width === TELA.width && x[3].deviceScaleFactor === ESCALA))
}))

test('5.58 C: sem nome nem email do aluno no .env, o logado nunca liga', () => emTemp(async (d) => {
  for (const env of [{}, { ML_USUARIO: 'so-apelido' }]) {
    const m = mundo({ respostas: [403, 403] })
    await assert.rejects(printar({ fonte: LOJA, saida: join(d, 'p.png'), carregar: m.carregar, conectarLogado: m.conectarLogado, env }), (e) => e.codigo === 2)
    assert.equal(nomes(m.reg, 'goto').length, 2, 'canario: os degraus navegaram')
    assert.equal(nomes(m.reg, 'conectar').length, 0)
  }
}))

test('5.58 C: o degrau logado fecha so a propria aba e nunca o Chrome do aluno', () => emTemp(async (d) => {
  const m = mundo({ respostas: [403, 200] })
  assert.equal((await printar({ fonte: LOJA, saida: join(d, 'p.png'), carregar: m.carregar, conectarLogado: m.conectarLogado, env: COM_NOME })).degrau, 'logado')
  assert.ok(m.reg.length > 0, 'canario: o registro tem chamadas')
  assert.deepEqual(nomes(m.reg, 'fecharAba').map((x) => x[1]), ['logado'])
  assert.ok(!m.reg.some((x) => x[0] === 'cdp' && /^Browser\./.test(x[2])), 'nada de comando Browser.* pelo CDP')
  const ia = m.reg.findIndex((x) => x[0] === 'fecharAba'), id = m.reg.findIndex((x) => x[0] === 'desligar')
  assert.ok(ia >= 0 && ia < id, 'a aba fecha antes de desligar a conexao')
  // sem a sessao do site no Chrome dedicado: nem abre aba, sobe de degrau
  const s = mundo({ respostas: [403, 200], cookies: [] })
  assert.equal((await printar({ fonte: LOJA, saida: join(d, 's.png'), carregar: s.carregar, conectarLogado: s.conectarLogado, env: COM_NOME })).degrau, 'com-janela')
  assert.ok(!s.reg.some((x) => x[0] === 'newPage' && x[1] === 'logado'))
  assert.equal(nomes(s.reg, 'desligar').length, 1)
}))

test('5.58 C: nome e email do .env nunca aparecem na saida do print', () => emTemp(async (d) => {
  // isca montada por pedacos: o texto do teste nao carrega a isca inteira
  const nome = ['Qorv', 'anel ', 'Zibr', 'etto'].join(''), email = ['qorv', 'anel', '@', 'zibretto', '.com'].join('')
  writeFileSync(join(d, '.env'), `ALUNO_NOME=${nome}\nALUNO_EMAIL=${email}\n`)
  const env = lerEnv(join(d, '.env'))
  assert.equal(env.ALUNO_NOME, nome, 'canario: o .env foi lido')
  const saidas = []
  const pega = { log: (s) => saidas.push(String(s)), erro: (s) => saidas.push(String(s)) }
  // logado acha o nome e todo o resto barra: a mensagem de erro lista os motivos
  const m = mundo({ respostas: [403, 200, 403], dado: true })
  assert.equal(await main([LOJA, join(d, 'p.png')], { carregar: m.carregar, conectarLogado: m.conectarLogado, env, ...pega }), 2)
  const r = mundo({ respostas: [403, 200] })
  assert.equal(await main([LOJA, join(d, 'q.png')], { carregar: r.carregar, conectarLogado: r.conectarLogado, env, ...pega }), 0)
  const tudo = saidas.join('\n').toLowerCase()
  assert.ok(saidas.length >= 2 && tudo.length > 20, 'canario: a saida nao veio vazia')
  for (const x of ['qorvanel', 'zibretto']) assert.ok(!tudo.includes(x), 'a saida mostrou dado do .env')
}))

test('5.58 C: no Mercado Livre a escada nao tem o logado (sem janela, com janela, pedir ao aluno)', () => emTemp(async (d) => {
  for (const host of ['www.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'mercadolibre.com', 'articulo.mercadolibre.com.ar']) {
    assert.deepEqual(degrausDe({ host, temAgulhas: true }), ['sem-janela', 'com-janela'], host)
  }
  // canario: fora do ML, com agulha, o logado entra
  assert.deepEqual(degrausDe({ host: 'loja.exemplo.com', temAgulhas: true }), ['sem-janela', 'logado', 'com-janela'])
  assert.deepEqual(degrausDe({ host: 'mercadolivre.com.br.exemplo.com', temAgulhas: true }), ['sem-janela', 'logado', 'com-janela'])
  const m = mundo({ respostas: [403, 403] })
  const codigo = await main(['https://www.mercadolivre.com.br/produto/MLB1', join(d, 'p.png')], { carregar: m.carregar, conectarLogado: m.conectarLogado, env: COM_NOME, log: () => {}, erro: () => {} })
  assert.equal(codigo, 2)
  assert.equal(nomes(m.reg, 'conectar').length, 0)
  assert.deepEqual(nomes(m.reg, 'launch').map((x) => x[1].headless), [undefined, false])
}))

test('5.58 C: o Mercado Livre de todo pais fica sem o logado, e o host parecido nao', () => {
  for (const host of ['mercadolibre.cl', 'www.mercadolibre.co.cr', 'articulo.mercadolibre.com.ar', 'listado.mercadolibre.com.mx',
    'mercadolibre.com.uy', 'mercadolibre.com.co', 'mercadolibre.com.pe', 'mercadolibre.com.ve', 'mercadolibre.com.ec', 'MercadoLivre.COM.BR']) {
    assert.deepEqual(degrausDe({ host, temAgulhas: true }), ['sem-janela', 'com-janela'], host)
  }
  // canario: o que so parece Mercado Livre continua com o logado
  for (const host of ['mercadolivrex.com', 'fakemercadolivre.com', 'mercadolibre-cl.com', 'mercadolivre.com.br.exemplo.com', 'mercadolivre.exemplo.com.br.lumora.com']) {
    assert.deepEqual(degrausDe({ host, temAgulhas: true }), ['sem-janela', 'logado', 'com-janela'], host)
  }
})

test('5.58 C: nome do aluno dentro de iframe no logado sobe de degrau; iframe que nao deixa conferir tambem', () => emTemp(async (d) => {
  for (const quadros of [[false, true], ['erro']]) {
    const m = mundo({ respostas: [403, 200, 200], quadros })
    const r = await printar({ fonte: LOJA, saida: join(d, 'a.png'), carregar: m.carregar, conectarLogado: m.conectarLogado, env: COM_NOME })
    assert.ok(nomes(m.reg, 'evaluate').some((x) => x[1] === `logado:quadro${quadros.length - 1}` && x[2] === 'temDadoPessoal'), 'canario: o iframe foi conferido')
    assert.equal(r.degrau, 'com-janela', JSON.stringify(quadros))
    assert.match(r.motivos.join(';'), /logado: o nome ou o email do aluno apareceu na tela/)
    assert.ok(!nomes(m.reg, 'screenshot').some((x) => x[1] === 'logado'), 'o logado com dado no iframe nao pode fotografar')
  }
  // canario: iframes limpos gravam pelo logado
  const limpo = mundo({ respostas: [403, 200], quadros: [false, false] })
  assert.equal((await printar({ fonte: LOJA, saida: join(d, 'b.png'), carregar: limpo.carregar, conectarLogado: limpo.conectarLogado, env: COM_NOME })).degrau, 'logado')
}))

test('5.58 C: conexao cortada pelo site sobe de degrau; erro que nao e de rede segue saindo 1', () => emTemp(async (d) => {
  const m = mundo({ respostas: [{ erro: 'net::ERR_EMPTY_RESPONSE at https://loja.exemplo.com/produto/1' }, 200] })
  const r = await printar({ fonte: LOJA, saida: join(d, 'a.png'), carregar: m.carregar, conectarLogado: m.conectarLogado, env: {} })
  assert.equal(r.degrau, 'com-janela')
  assert.deepEqual(r.motivos, ['sem-janela: o site cortou a conexao (ERR_EMPTY_RESPONSE)'])
  assert.equal(readFileSync(join(d, 'a.png'), 'utf8'), 'foto com-janela')
  // todos cortando: saida 2 pedindo o print
  const t = mundo({ respostas: [{ erro: 'net::ERR_CONNECTION_RESET at x' }, { erro: 'net::ERR_CONNECTION_REFUSED at x' }] })
  await assert.rejects(printar({ fonte: LOJA, saida: join(d, 't.png'), carregar: t.carregar, conectarLogado: t.conectarLogado, env: {} }),
    (e) => e.codigo === 2 && /ERR_CONNECTION_RESET/.test(e.message) && /ERR_CONNECTION_REFUSED/.test(e.message))
  // canario: URL invalida segue lancando no primeiro degrau, sem subir
  const u = mundo({ respostas: [{ erro: 'Protocol error (Page.navigate): Cannot navigate to invalid URL' }, 200] })
  const saidas = []
  const codigo = await main([LOJA, join(d, 'u.png')], { carregar: u.carregar, conectarLogado: u.conectarLogado, env: {}, log: (s) => saidas.push(s), erro: (s) => saidas.push(s) })
  assert.equal(codigo, 1)
  assert.match(saidas.join('\n'), /invalid URL/)
  assert.equal(nomes(u.reg, 'goto').length, 1)
}))

test('5.58 C: paginaVazia conta letra visivel: sem texto ou quase sem e branco, texto de produto nao', () => {
  for (const t of ['', '   ', '\n\n\t', null, undefined, 'oi', '123 456 789 000 111 222 333 444', '...  |  ...']) assert.equal(paginaVazia(t), true, JSON.stringify(t))
  for (const t of [TEXTO_PRODUTO, 'Hubo un error accediendo a esta pagina', 'Não possui a cobertura direta do FGC']) assert.equal(paginaVazia(t), false, t)
})

test('5.58 C: no Mercado Livre, 200 com a pagina em branco sobe de degrau e termina em saida 2 sem gravar o print', () => emTemp(async (d) => {
  const m = mundo({ respostas: [200, 200], textos: ['', '  \n '] })
  const sai = join(d, 'p.png'), saidas = []
  const codigo = await main(['https://www.mercadolivre.com.br/garrafa/p/MLB1', sai, '--marcar', 'medidor de temperatura'],
    { carregar: m.carregar, conectarLogado: m.conectarLogado, env: COM_NOME, log: (s) => saidas.push(s), erro: (s) => saidas.push(s) })
  assert.equal(nomes(m.reg, 'evaluate').filter((x) => x[2] === 'textoVisivel').length, 2, 'canario: os dois degraus mediram o texto')
  assert.equal(codigo, 2)
  assert.equal(existsSync(sai), false)
  assert.ok(!nomes(m.reg, 'screenshot').length)
  // nem marca nem esconde aviso em pagina em branco: o erro e o do degrau, nunca o "nao achei a frase"
  assert.ok(!nomes(m.reg, 'evaluate').some((x) => x[2] === 'marcarNaPagina' || x[2] === 'esconderAvisos'))
  const tudo = saidas.join('\n')
  assert.match(tudo, /sem-janela: a pagina veio em branco; com-janela: a pagina veio em branco/)
  assert.match(tudo, /Peca ao aluno o print/)
  assert.doesNotMatch(tudo, /nao achei a frase/)
}))

test('5.58 C: pagina em branco no sem janela e com texto no com janela grava pelo com janela; com texto grava como antes', () => emTemp(async (d) => {
  const m = mundo({ respostas: [200, 200], textos: [''] })
  const r = await printar({ fonte: LOJA, saida: join(d, 'a.png'), carregar: m.carregar, conectarLogado: m.conectarLogado, env: {} })
  assert.equal(r.degrau, 'com-janela')
  assert.deepEqual(r.motivos, ['sem-janela: a pagina veio em branco'])
  assert.equal(readFileSync(join(d, 'a.png'), 'utf8'), 'foto com-janela')
  // canario: pagina com texto grava no primeiro degrau
  const c = mundo({ respostas: [200] })
  const r2 = await printar({ fonte: LOJA, saida: join(d, 'b.png'), carregar: c.carregar, conectarLogado: c.conectarLogado, env: {} })
  assert.equal(r2.degrau, 'sem-janela')
  assert.equal(readFileSync(join(d, 'b.png'), 'utf8'), 'foto sem-janela')
}))

// Chrome de verdade, sem janela, com servidor local
async function servidor(responder) {
  const vistos = []
  const srv = createServer((q, r) => { vistos.push(q.headers); responder(q, r) })
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  return { url: `http://127.0.0.1:${srv.address().port}`, vistos, fechar: () => new Promise((ok) => srv.close(ok)) }
}
const html = (r, status, corpo) => { r.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); r.end(corpo) }

test('5.58 C: Chrome de verdade: servidor que responde 403 nao vira print', { skip: pular }, () => emTemp(async (d) => {
  const s = await servidor((q, r) => html(r, q.url === '/barra' ? 403 : 200, '<p>Hubo un error accediendo a esta pagina</p>'))
  try {
    const sai = join(d, 'p.png')
    await assert.rejects(printar({ fonte: s.url + '/barra', saida: sai, carregar, env: {}, degraus: ['sem-janela'] }), (e) => e.codigo === 2 && /403/.test(e.message))
    assert.equal(existsSync(sai), false)
    // canario: a mesma pagina com 200 grava
    await printar({ fonte: s.url + '/ok', saida: sai, carregar, env: {}, degraus: ['sem-janela'] })
    assert.equal(existsSync(sai), true)
  } finally { await s.fechar() }
}))

test('5.58 C: Chrome de verdade: servidor que responde 200 com a pagina em branco nao vira print', { skip: pular }, () => emTemp(async (d) => {
  // o vazio e o esqueleto de hoje: so script e caixa sem texto; o texto escondido nao conta
  const vazio = '<!doctype html><body><div id="raiz"></div><div hidden>Texto escondido que nao aparece na tela de jeito nenhum</div><script>var x = 1</script></body>'
  const s = await servidor((q, r) => html(r, 200, q.url === '/vazia' ? vazio : '<p>Garrafa termica Lumora com medidor de temperatura</p>'))
  try {
    const sai = join(d, 'p.png')
    await assert.rejects(printar({ fonte: s.url + '/vazia', saida: sai, carregar, env: {}, degraus: ['sem-janela'] }), (e) => e.codigo === 2 && /em branco/.test(e.message))
    assert.equal(existsSync(sai), false)
    assert.ok(s.vistos.length > 0, 'canario: o servidor recebeu o pedido')
    // canario: a pagina com texto grava
    await printar({ fonte: s.url + '/ok', saida: sai, carregar, env: {}, degraus: ['sem-janela'] })
    assert.equal(existsSync(sai), true)
  } finally { await s.fechar() }
}))

test('5.58 C: Chrome de verdade: User-Agent e Sec-CH-UA chegam sem Headless e de celular', { skip: pular }, () => emTemp(async (d) => {
  const s = await servidor((q, r) => html(r, 200, '<p>Garrafa termica Lumora com medidor de temperatura</p>'))
  try {
    await printar({ fonte: s.url + '/', saida: join(d, 'p.png'), carregar, env: {}, degraus: ['sem-janela'] })
    const h = s.vistos.find((x) => x['user-agent'])
    assert.ok(h, 'canario: o servidor recebeu o pedido')
    assert.doesNotMatch(h['user-agent'], /headless/i)
    assert.match(h['user-agent'], /Mobile/)
    assert.ok(h['sec-ch-ua'], 'o Chrome mandou o Sec-CH-UA')
    assert.doesNotMatch(h['sec-ch-ua'], /headless/i)
    assert.equal(h['sec-ch-ua-mobile'], '?1')
  } finally { await s.fechar() }
}))

test('5.58 C: Chrome de verdade: temDadoPessoal acha JOÃO pela agulha joao na tela e no campo, fora do borrado e da tela nao', { skip: pular }, async () => {
  const navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
  try {
    const pagina = await navegador.newPage({ viewport: TELA })
    const procurar = async (corpo) => {
      await pagina.setContent(`<!doctype html><body style="margin:0;font:18px sans-serif">${corpo}</body>`)
      await pagina.evaluate(borrarCabecalho)
      return pagina.evaluate(temDadoPessoal, ['joao'])
    }
    assert.equal(await procurar('<p>Olá, JOÃO! Seu pedido chegou.</p>'), true)
    assert.equal(await procurar('<p>Seu pedido</p><input value="João Vexto">'), true)
    assert.equal(await procurar('<header>Olá, JOÃO</header><p>Seu pedido chegou.</p>'), false)
    assert.equal(await procurar(`<p>Seu pedido</p><div style="height:5000px"></div><p>JOÃO</p>`), false)
    assert.equal(await procurar('<p>Seu pedido chegou.</p>'), false)
  } finally { await navegador.close() }
})

test('5.58 C: Chrome de verdade: nome do aluno dentro de iframe srcdoc e achado em todos os frames', { skip: pular }, async () => {
  const navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
  try {
    const pagina = await navegador.newPage({ viewport: TELA })
    await pagina.setContent('<!doctype html><body style="margin:0;font:18px sans-serif"><p>Seu pedido chegou.</p>'
      + '<iframe srcdoc="&lt;p&gt;Ol&aacute;, JO&Atilde;O Vexto&lt;/p&gt;"></iframe></body>')
    assert.equal(pagina.frames().length, 2, 'canario: o iframe carregou')
    assert.equal(await pagina.evaluate(temDadoPessoal, ['joao']), false, 'canario: so o documento principal nao ve o iframe')
    assert.equal(await dadoPessoalNaTela(pagina, ['joao']), true)
    assert.equal(await dadoPessoalNaTela(pagina, ['lumora']), false)
  } finally { await navegador.close() }
})

test('5.58 C: Chrome de verdade: nome do aluno dentro de Shadow DOM aberto e achado, e o borrado no host vale pra sombra', { skip: pular }, async () => {
  const navegador = await (pw.chromium || pw.default.chromium).launch({ channel: 'chrome' })
  try {
    const pagina = await navegador.newPage({ viewport: TELA })
    const procurar = async (corpo, sombra, borrar = false) => {
      await pagina.setContent(`<!doctype html><body style="margin:0;font:18px sans-serif">${corpo}<div id="h"></div></body>`)
      await pagina.evaluate(([html, b]) => {
        const h = document.getElementById('h')
        h.attachShadow({ mode: 'open' }).innerHTML = html
        if (b) h.setAttribute('data-sabinos-borrado', '')
      }, [sombra, borrar])
      return pagina.evaluate(temDadoPessoal, ['joao'])
    }
    assert.equal(await procurar('<p>Seu pedido chegou.</p>', '<p>Garrafa termica</p>'), false, 'canario: sombra limpa')
    assert.equal(await procurar('<p>Seu pedido chegou.</p>', '<p>Olá, JOÃO</p>'), true, 'texto na sombra')
    assert.equal(await procurar('<p>Seu pedido chegou.</p>', '<span><i id="x"></i></span><input value="João Vexto">'), true, 'campo na sombra')
    assert.equal(await procurar('<p>Seu pedido chegou.</p>', '<p>Olá, JOÃO</p>', true), false, 'host borrado esconde a sombra')
    assert.equal(await procurar('<p>Seu pedido chegou.</p>', 'Olá, JOÃO'), true, 'texto solto na raiz da sombra')
  } finally { await navegador.close() }
})

test('5.58 C: Chrome de verdade: servidor que corta a conexao sobe de degrau e nao vira print', { skip: pular }, () => emTemp(async (d) => {
  const s = await servidor((q, r) => (q.url === '/corta' ? q.socket.destroy() : html(r, 200, '<p>Garrafa termica Lumora com medidor de temperatura</p>')))
  try {
    const sai = join(d, 'p.png')
    await assert.rejects(printar({ fonte: s.url + '/corta', saida: sai, carregar, env: {}, degraus: ['sem-janela'] }),
      (e) => e.codigo === 2 && /cortou a conexao \(ERR_[A-Z_]+\)/.test(e.message))
    assert.equal(existsSync(sai), false)
    assert.ok(s.vistos.length > 0, 'canario: o servidor recebeu o pedido')
    // canario: a pagina que responde grava
    await printar({ fonte: s.url + '/ok', saida: sai, carregar, env: {}, degraus: ['sem-janela'] })
    assert.equal(existsSync(sai), true)
  } finally { await s.fechar() }
}))
