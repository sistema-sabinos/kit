// Cenario VAZIO por IA: fundo de foto (bancada, cozinha, estudio) sem produto,
// sem texto e sem pessoa. O produto real entra depois pelo compor-cena.mjs e o
// texto pelo montar-peca.mjs, porque a IA erra letra e redesenha rotulo.
// Com --uso video o cenario e fundo de video vertical (a /editar-video): sai em pe, 9:16, com o
// assunto do lugar no centro, porque o que sobrar nas bordas e cortado.
// Uso:
//   node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau codex --cenas <cenas.json> [--uso video]
//   node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau gemini --cenas <cenas.json> --preco-usd 0.05 --contexto "designer <slug>" [--autorizado] [--acima-do-teto <valor do pode ir>] [--uso video] [--video <slug>]
// cenas.json: [{ "out": "anuncios/<slug>/cenarios/cozinha.png", "descricao": "..." }]
// --preco-usd e o preco por imagem conferido na pagina oficial do Gemini NO DIA.
// --video <slug>: o video em que o cenario entra, anotado na linha de custo pra media do orcamento do mes.
// O gasto passa pela trava unica (liberarGasto do conectar): orcamento do mes ou, sem ele, teto por lote.
// Saida: 0 tudo gerado; 1 falhou alguma cena; 2 uso errado; 3 parou antes de gastar.
import { rodarComPrazo } from './motor.mjs'
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../conectar/scripts/lib/raiz.mjs'
import { lerEnv } from '../../conectar/scripts/lib/env.mjs'
import { liberarGasto, fecharReserva, registrarCusto as registrarComum } from '../../conectar/scripts/lib/orcamento.mjs'
import { fetchComTimeout } from '../../conectar/scripts/lib/fetch-timeout.mjs'
import { lerArgs, numero } from './lib/args.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'
// Prazo curto pra listar os modelos; longo pra gerar a imagem, que demora mais.
export const PRAZO_LISTA_MS = 30_000
export const PRAZO_GERAR_MS = 5 * 60_000

export const REGRAS = `REGRAS OBRIGATORIAS, valem para TODAS as imagens:
- NENHUM produto, pote, frasco, embalagem, caixa ou objeto a venda na imagem, nem ao fundo, nem desfocado
- NENHUM texto, letra, numero, logo, placa ou rotulo
- NENHUMA pessoa, mao ou parte de corpo
- O CENTRO da imagem fica VAZIO e limpo: o produto real entra por cima depois
- Luz natural suave, profundidade de campo rasa, sem saturacao exagerada
- Formato quadrado 1:1, fotorrealista, qualidade de foto de produto profissional`

export const REGRAS_VIDEO = `REGRAS OBRIGATORIAS, valem para TODAS as imagens:
- NENHUM produto, pote, frasco, embalagem, caixa ou objeto a venda na imagem, nem ao fundo, nem desfocado
- NENHUM texto, letra, numero, logo, placa ou rotulo
- NENHUMA pessoa, mao ou parte de corpo
- O assunto principal do lugar fica no CENTRO, numa faixa vertical: a imagem vira fundo de video vertical e o que sobrar nas bordas e cortado
- Luz natural suave, profundidade de campo rasa, sem saturacao exagerada
- Formato vertical 9:16 (em pe), fotorrealista`

const barra = (p) => p.split(String.fromCharCode(92)).join('/')

export function montarPrompt(cenas, { uso = 'anuncio' } = {}) {
  const regras = uso === 'video' ? REGRAS_VIDEO : REGRAS
  const destino = uso === 'video' ? 'CENARIO DE FUNDO de video vertical, atras de uma pessoa gravada no fundo verde' : 'CENARIO DE FUNDO em foto de anuncio'
  const blocos = cenas.map((c, i) => `CENA ${i + 1}, arquivo: ${barra(resolve(c.out))}\n${c.descricao}`).join('\n\n')
  const formato = uso === 'video' ? 'vertical(is) 9:16' : 'quadrada(s) 1:1'
  return `Gere ${cenas.length === 1 ? 'UMA imagem' : `${cenas.length} imagens`} ${formato}, fotorrealista(s), para servir de ${destino}.

${regras}

${blocos}

Gere com a sua ferramenta de geracao de imagem e salve exatamente nos caminhos indicados.
Nao escreva codigo, nao crie scripts, nao rode nada alem da geracao e da gravacao do arquivo.
Ao terminar responda apenas os caminhos, um por linha.`
}

export function cotaEstourou(texto) {
  return /usage limit|rate limit|quota|too many requests|\b429\b|limite de uso/i.test(String(texto))
}

// Familia nova primeiro (gemini-nano-banana-2.1, a recomendada pelo Google desde 2026-10-06), a
// mais nova dela na frente; o nome antigo (gemini-3.1-flash-image) fica de reserva, pra chave
// que ainda nao lista o novo. O lite fica fora das duas. So entra modelo com preco na tabela
// PRECO_IMAGEM: sem o preco conferido, a trava de gasto (avisoDePreco) nao tem com o que
// comparar o --preco-usd, e o gasto sairia por um preco que ninguem conferiu.
export function escolherModeloImagem(ids, tabela = PRECO_IMAGEM) {
  const nota = (id) => {
    const nova = id.match(/^gemini-nano-banana-(\d+(?:\.\d+)?)(-preview)?$/)
    if (nova) return { id, familia: 1, versao: parseFloat(nova[1]), flash: 1, estavel: nova[2] ? 0 : 1 }
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)-(flash|pro)-image(-preview)?$/)
    return m && { id, familia: 0, versao: parseFloat(m[1]), flash: m[2] === 'flash' ? 1 : 0, estavel: m[3] ? 0 : 1 }
  }
  const lista = ids.map(nota).filter(n => n && tabela[n.id]).sort((a, b) => b.familia - a.familia || b.flash - a.flash || b.versao - a.versao || b.estavel - a.estavel)
  return lista.length ? lista[0].id : null
}

// Sem modelo escolhido, o motivo muda o conselho: a chave que nao lista modelo de imagem nenhum
// aponta pra conta (faturamento); a que lista modelo de imagem de nome que o kit nao conhece
// aponta pro kit velho. O lite o kit conhece e deixa de fora de proposito: atualizar o kit nao
// resolve, entao a chave que so lista o lite volta pro conselho da conta.
export function erroSemModelo(ids) {
  const imagem = ids.filter(id => /image|banana/i.test(id))
  const desconhecidos = imagem.filter(id => !/lite/i.test(id))
  if (desconhecidos.length) {
    return `a sua chave do Gemini lista modelos de imagem, mas nenhum com nome que esta versao do kit conhece (${desconhecidos.join(', ')}). Rode /atualizar-sabinos pra pegar a versao nova do kit e tente de novo.`
  }
  if (imagem.length) {
    return `a sua chave do Gemini so lista o modelo de imagem lite (${imagem.join(', ')}), a versao mais simples, que o kit deixa de fora de proposito. Confira no aistudio.google.com se o faturamento esta ligado e se a chave libera o ${Object.keys(PRECO_IMAGEM).join(' ou o ')}.`
  }
  return 'a sua chave do Gemini nao lista nenhum modelo de imagem. Confira no aistudio.google.com se o faturamento esta ligado.'
}

// Preco por imagem 1K (o tamanho padrao), lido em ai.google.dev/gemini-api/docs/pricing.
// Serve pra parar antes de gastar quando o --preco-usd passado fica abaixo do preco do modelo
// que o script escolheu: a estimativa, o teto de gasto e o "pode ir" foram feitos com o preco
// menor, e a cobranca de verdade sairia maior. Preco muda: conferir na pagina e trocar aqui,
// com a data nova.
export const PRECO_IMAGEM = {
  'gemini-nano-banana-2.1': { usd: 0.0336, conferido_em: '2026-10-20' },
  'gemini-3.1-flash-image': { usd: 0.067, conferido_em: '2026-10-20' },
}

export function avisoDePreco(modelo, precoUsd, tabela = PRECO_IMAGEM) {
  const p = tabela[modelo]
  if (!p || precoUsd >= p.usd) return null
  return `parou antes de gastar: a sua chave libera o ${modelo}, e o preco dele (conferido em ${p.conferido_em}) era US$ ${p.usd} por imagem, acima do --preco-usd ${precoUsd}. Confira o preco desse modelo na pagina oficial e rode de novo com o --preco-usd certo: a estimativa e o pode ir mudam com ele.`
}

export async function viaCodex(cenas, { raiz = RAIZ, uso, executar = rodarComPrazo, carimbo = (p) => existsSync(p) ? statSync(p).mtimeMs : null } = {}) {
  for (const c of cenas) {
    const rel = relative(raiz, resolve(c.out))
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`o cenario tem que ser salvo dentro da pasta do projeto, e veio ${c.out}`)
  }
  const antes = cenas.map(c => carimbo(c.out))
  // rodarComPrazo: no estouro do prazo derruba o codex inteiro, nunca so o cmd.exe (5.25)
  const r = await executar('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-'], {
    input: montarPrompt(cenas, { uso }), cwd: raiz, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000,
  })
  // O texto da IA dizendo "salvei" nao vale: quem manda e o arquivo no disco. E so conta se o
  // arquivo e novo ou mudou de verdade: uma sobra de rodada anterior, com o mesmo carimbo de
  // antes, nao pode passar por gerada nesta.
  const geradas = []
  const faltaram = []
  cenas.forEach((c, i) => {
    const depois = carimbo(c.out)
    const novo = depois !== null && (antes[i] === null || depois > antes[i])
    ;(novo ? geradas : faltaram).push(c.out)
  })
  return { geradas, faltaram, cota_estourada: faltaram.length > 0 && cotaEstourou(`${r?.stdout || ''}\n${r?.stderr || ''}`), custo_usd: 0, ...(r?.error ? { erro: r.error.message } : {}) }
}

export async function viaGemini(cenas, {
  chave, precoUsd, contexto, uso, video, reserva, raiz = RAIZ,
  buscar = fetchComTimeout,
  gravar = (p, b) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, b) },
  // o registrador comum so avisa quando nao grava; aqui a falha vira erro pro aviso de baixo
  registrarCusto = (linha) => { if (!registrarComum(linha, { raiz, avisar: () => {} })) throw new Error('nao consegui gravar dados/custos.jsonl') },
  esperar = (ms) => new Promise(r => setTimeout(r, ms)),
}) {
  const lista = await (await buscar(`${API}/models?key=${chave}&pageSize=300`, {}, { timeoutMs: PRAZO_LISTA_MS })).json()
  const ids = (lista.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
  const modelo = escolherModeloImagem(ids)
  if (!modelo) throw new Error(erroSemModelo(ids))
  const aviso = avisoDePreco(modelo, precoUsd)
  if (aviso) return { parou: aviso, modelo, preco_modelo_usd: PRECO_IMAGEM[modelo].usd, geradas: [], faltaram: cenas.map(c => c.out), custo_usd: 0 }
  const geradas = []
  const faltaram = []
  let pagas = 0
  let semRegistro = 0
  let incertas = 0
  // Resposta 200 com imagem ja foi cobrada pelo Google: o custo se registra sempre, salvando
  // ou nao o arquivo. Falha no registro so avisa, nunca devolve a cena pra fila.
  const cobrar = (out) => {
    pagas++
    try {
      registrarCusto({ servico: 'gemini-imagem', usd: precoUsd, contexto, cenas: 1, ...(video ? { video } : {}), ...(reserva ? { reserva } : {}) })
    } catch (e) {
      semRegistro++
      console.error(`[gemini] ${out}: imagem gerada e cobrada (US$ ${precoUsd}) mas a linha de custo nao foi gravada em dados/custos.jsonl; anote isso a mao. Motivo: ${e.message}`)
    }
  }
  for (const c of cenas) {
    try {
      const corpo = { contents: [{ parts: [{ text: montarPrompt([c], { uso }) }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: uso === 'video' ? '9:16' : '1:1' } } }
      let json = null
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        const r = await buscar(`${API}/models/${modelo}:generateContent?key=${chave}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }, { timeoutMs: PRAZO_GERAR_MS })
        if (r.status === 429 && tentativa < 3) { await esperar(20000 * tentativa); continue }
        if (r.status === 200) {
          // 200 cujo corpo nao chegou inteiro pode ter sido cobrado: sem linha, a reserva fica aberta
          try { json = await r.json() } catch (e) { incertas++; throw new Error(`resposta 200 que nao chegou inteira, pode ter sido cobrada: ${e.message}`) }
        } else {
          // 400 e 403 costumam ser chave invalida ou faturamento desligado: a pessoa precisa ouvir.
          let msg = ''
          try { msg = (await r.json())?.error?.message || '' } catch { msg = '' }
          console.error(`[gemini] ${c.out}: HTTP ${r.status}${msg ? ` ${msg}` : ''}`)
        }
        break
      }
      const parte = json?.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data)
      if (!parte) { faltaram.push(c.out); continue }
      try {
        gravar(c.out, Buffer.from((parte.inlineData || parte.inline_data).data, 'base64'))
      } catch (e) {
        console.error(`[gemini] ${c.out}: imagem paga (US$ ${precoUsd}) mas nao foi salva no disco. Motivo: ${e.message}`)
        faltaram.push(c.out)
        cobrar(c.out)
        continue
      }
      geradas.push(c.out)
      cobrar(c.out)
    } catch (e) {
      // Erro no meio do lote (rede caiu, gravar falhou) nao pode derrubar o que ja foi
      // gerado e pago nas cenas anteriores: essa cena fica faltando, o resto do lote segue.
      console.error(`[gemini] ${c.out}: ${e.message}`)
      faltaram.push(c.out)
    }
  }
  return { geradas, faltaram, custo_usd: Math.round(pagas * precoUsd * 10000) / 10000, modelo, ...(semRegistro ? { cobradas_sem_registro: semRegistro } : {}), ...(incertas ? { cobranca_incerta: incertas } : {}) }
}

// Codigo de saida do resultado de um degrau: parar antes de gastar (3) vale mais que cena faltando (1).
export function codigoDeSaida(r) {
  return r.parou ? 3 : r.faltaram.length ? 1 : 0
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
// Saida por process.exitCode, nunca process.exit: depois de rede paga, sair na marra pode cortar a
// gravacao do custo no meio (licao 3.12). 0 ok, 1 faltou imagem ou erro, 2 entrada ruim, 3 parou antes de gastar.
// raiz, ler e buscar trocam a raiz do projeto, o .env e a rede nos testes; no CLI vale o padrao.
export async function main(argv = process.argv.slice(2), { raiz = RAIZ, ler = lerEnv, buscar } = {}) {
  const a = lerArgs(argv)
  let cenas
  try {
    if (!['codex', 'gemini'].includes(a.degrau) || !a.cenas || ![undefined, 'video', 'anuncio'].includes(a.uso)) throw new Error('uso: --degrau codex|gemini --cenas <cenas.json> [--uso video|anuncio] (veja o topo do arquivo)')
    cenas = JSON.parse(readFileSync(a.cenas, 'utf8'))
    if (!Array.isArray(cenas) || !cenas.length || cenas.some(c => !c.out || !c.descricao)) throw new Error('cenas.json e uma lista de { "out", "descricao" }')
  } catch (e) { console.error(e.message); process.exitCode = 2; return }
  try {
    if (a.degrau === 'codex') {
      console.error(`[codex] gerando ${cenas.length} cenario(s); sem cobranca por imagem dentro da cota do plano; credito avulso do Codex, se voce comprou, e gasto ao passar dela`)
      const r = await viaCodex(cenas, { uso: a.uso })
      console.log(JSON.stringify(r, null, 2))
      process.exitCode = codigoDeSaida(r)
      return
    }
    const precoUsd = numero(a, 'preco-usd', undefined, { min: 0.001, max: 5 })
    if (precoUsd === undefined) { console.error('falta --preco-usd: confira o preco por imagem do Gemini na pagina oficial hoje e passe aqui'); process.exitCode = 2; return }
    const contexto = a.contexto || 'gerar-imagens'
    const estimativa = Math.round(cenas.length * precoUsd * 10000) / 10000
    // 5.49 (bloco C, 2026-11-03): --acima-do-teto <valor do pode ir> passa o gasto acima do teto por lote
    const acimaDoTetoUsd = a['acima-do-teto'] === undefined ? undefined : Number(String(a['acima-do-teto']).replace(',', '.'))
    const lib = liberarGasto({ estimativaUsd: estimativa, autorizado: a.autorizado === true, acimaDoTetoUsd }, { raiz, contexto })
    if (lib.aviso) console.error(`[aviso] ${lib.aviso}`)
    if (lib.codigo !== 0) { console.log(JSON.stringify({ parou: lib.parou, estimativa_usd: estimativa, imagens: cenas.length })); process.exitCode = 3; return }
    let r = null
    try {
      const chave = ler().GEMINI_API_KEY
      if (!chave) { console.error('falta GEMINI_API_KEY no .env (o /conectar ensina a pegar)'); process.exitCode = 2; return }
      r = await viaGemini(cenas, { chave, precoUsd, contexto, uso: a.uso, video: typeof a.video === 'string' ? a.video : undefined, reserva: lib.reserva, raiz, ...(buscar ? { buscar } : {}) })
      console.log(JSON.stringify(r, null, 2))
      process.exitCode = codigoDeSaida(r)
    } finally {
      // cobranca sem linha ou incerta: a reserva fica contando no orcamento ate a pessoa anotar a linha e fechar pelo --saldo
      if (r?.cobradas_sem_registro && lib.reserva) console.error(`[orcamento] a reserva ${lib.reserva} ficou aberta e conta no orcamento do mes: anote a linha que faltou e feche pelo --saldo do /configurar-video`)
      else if (r?.cobranca_incerta && lib.reserva) console.error(`[orcamento] a reserva ${lib.reserva} ficou aberta e conta no orcamento do mes: o Google respondeu e a resposta caiu no meio, entao a imagem pode ter sido cobrada; confira no painel de faturamento, anote a linha se foi e feche pelo --saldo do /configurar-video`)
      else fecharReserva(lib.reserva, { raiz })
    }
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}

if (ehCli) await main()
