// Cenario VAZIO por IA: fundo de foto (bancada, cozinha, estudio) sem produto,
// sem texto e sem pessoa. O produto real entra depois pelo compor-cena.mjs e o
// texto pelo montar-peca.mjs, porque a IA erra letra e redesenha rotulo.
// Uso:
//   node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau codex --cenas <cenas.json>
//   node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau gemini --cenas <cenas.json> --preco-usd 0.05 --contexto "designer <slug>" [--autorizado]
// cenas.json: [{ "out": "anuncios/<slug>/cenarios/cozinha.png", "descricao": "..." }]
// --preco-usd e o preco por imagem conferido na pagina oficial do Gemini NO DIA.
// Saida: 0 tudo gerado; 1 falhou alguma cena; 2 uso errado; 3 parou antes de gastar.
import { spawnSync } from 'node:child_process'
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { lerEnv } from '../../mercado-livre/scripts/lib/env.mjs'
import { carregarConfiguracao, PADROES } from '../../mercado-livre/scripts/lib/config.mjs'
import { lerArgs, numero } from './lib/args.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'

export const REGRAS = `REGRAS OBRIGATORIAS, valem para TODAS as imagens:
- NENHUM produto, pote, frasco, embalagem, caixa ou objeto a venda na imagem, nem ao fundo, nem desfocado
- NENHUM texto, letra, numero, logo, placa ou rotulo
- NENHUMA pessoa, mao ou parte de corpo
- O CENTRO da imagem fica VAZIO e limpo: o produto real entra por cima depois
- Luz natural suave, profundidade de campo rasa, sem saturacao exagerada
- Formato quadrado 1:1, fotorrealista, qualidade de foto de produto profissional`

const barra = (p) => p.split(String.fromCharCode(92)).join('/')

export function montarPrompt(cenas) {
  const blocos = cenas.map((c, i) => `CENA ${i + 1}, arquivo: ${barra(resolve(c.out))}\n${c.descricao}`).join('\n\n')
  return `Gere ${cenas.length === 1 ? 'UMA imagem' : `${cenas.length} imagens`} quadrada(s) 1:1, fotorrealista(s), para servir de CENARIO DE FUNDO em foto de anuncio.

${REGRAS}

${blocos}

Gere com a sua ferramenta de geracao de imagem e salve exatamente nos caminhos indicados.
Nao escreva codigo, nao crie scripts, nao rode nada alem da geracao e da gravacao do arquivo.
Ao terminar responda apenas os caminhos, um por linha.`
}

export function cotaEstourou(texto) {
  return /usage limit|rate limit|quota|too many requests|\b429\b|limite de uso/i.test(String(texto))
}

export function escolherModeloImagem(ids) {
  const nota = (id) => {
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)-(flash|pro)-image(-preview)?$/)
    return m && { id, versao: parseFloat(m[1]), flash: m[2] === 'flash' ? 1 : 0, estavel: m[3] ? 0 : 1 }
  }
  const lista = ids.map(nota).filter(Boolean).sort((a, b) => b.flash - a.flash || b.versao - a.versao || b.estavel - a.estavel)
  return lista.length ? lista[0].id : null
}

export function estimar({ n, precoUsd, limiteUsd }) {
  const total = Math.round(n * precoUsd * 10000) / 10000
  return { total, cabe: total <= limiteUsd }
}

export async function viaCodex(cenas, { raiz = RAIZ, executar = spawnSync, carimbo = (p) => existsSync(p) ? statSync(p).mtimeMs : null } = {}) {
  for (const c of cenas) {
    const rel = relative(raiz, resolve(c.out))
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`o cenario tem que ser salvo dentro da pasta do projeto, e veio ${c.out}`)
  }
  const antes = cenas.map(c => carimbo(c.out))
  const r = executar('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-'], {
    input: montarPrompt(cenas), cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000,
    shell: process.platform === 'win32',
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
  return { geradas, faltaram, cota_estourada: faltaram.length > 0 && cotaEstourou(`${r?.stdout || ''}\n${r?.stderr || ''}`), custo_usd: 0 }
}

export async function viaGemini(cenas, {
  chave, precoUsd, contexto,
  buscar = fetch,
  gravar = (p, b) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, b) },
  registrarCusto = (linha) => { mkdirSync(join(RAIZ, 'dados'), { recursive: true }); appendFileSync(join(RAIZ, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n') },
  esperar = (ms) => new Promise(r => setTimeout(r, ms)),
}) {
  const lista = await (await buscar(`${API}/models?key=${chave}&pageSize=300`)).json()
  const ids = (lista.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
  const modelo = escolherModeloImagem(ids)
  if (!modelo) throw new Error('a sua chave do Gemini nao lista nenhum modelo de imagem. Confira no aistudio.google.com se o faturamento esta ligado.')
  const geradas = []
  const faltaram = []
  let pagas = 0
  // Resposta 200 com imagem ja foi cobrada pelo Google: o custo se registra sempre, salvando
  // ou nao o arquivo. Falha no registro so avisa, nunca devolve a cena pra fila.
  const cobrar = (out) => {
    pagas++
    try {
      registrarCusto({ em: new Date().toISOString(), servico: 'gemini-imagem', usd: precoUsd, contexto })
    } catch (e) {
      console.error(`[gemini] ${out}: imagem gerada e cobrada (US$ ${precoUsd}) mas a linha de custo nao foi gravada em dados/custos.jsonl; anote isso a mao. Motivo: ${e.message}`)
    }
  }
  for (const c of cenas) {
    try {
      const corpo = { contents: [{ parts: [{ text: montarPrompt([c]) }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }
      let json = null
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        const r = await buscar(`${API}/models/${modelo}:generateContent?key=${chave}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
        if (r.status === 429 && tentativa < 3) { await esperar(20000 * tentativa); continue }
        if (r.status === 200) json = await r.json()
        else {
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
  return { geradas, faltaram, custo_usd: Math.round(pagas * precoUsd * 10000) / 10000, modelo }
}

function limiteDeGasto() {
  try { return carregarConfiguracao().limite_gasto_usd } catch { return PADROES.limite_gasto_usd }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const a = lerArgs(process.argv.slice(2))
  let cenas
  try {
    if (!['codex', 'gemini'].includes(a.degrau) || !a.cenas) throw new Error('uso: --degrau codex|gemini --cenas <cenas.json> (veja o topo do arquivo)')
    cenas = JSON.parse(readFileSync(a.cenas, 'utf8'))
    if (!Array.isArray(cenas) || !cenas.length || cenas.some(c => !c.out || !c.descricao)) throw new Error('cenas.json e uma lista de { "out", "descricao" }')
  } catch (e) { console.error(e.message); process.exit(2) }
  try {
    if (a.degrau === 'codex') {
      console.error(`[codex] gerando ${cenas.length} cenario(s); sem cobranca por imagem dentro da cota do plano; credito avulso do Codex, se voce comprou, e gasto ao passar dela`)
      const r = await viaCodex(cenas)
      console.log(JSON.stringify(r, null, 2))
      process.exit(r.faltaram.length ? 1 : 0)
    }
    const precoUsd = numero(a, 'preco-usd', undefined, { min: 0.001, max: 5 })
    if (precoUsd === undefined) { console.error('falta --preco-usd: confira o preco por imagem do Gemini na pagina oficial hoje e passe aqui'); process.exit(2) }
    const est = estimar({ n: cenas.length, precoUsd, limiteUsd: limiteDeGasto() })
    if (!est.cabe) { console.log(JSON.stringify({ parou: 'passa do limite_gasto_usd da configuracao', estimativa_usd: est.total })); process.exit(3) }
    if (!a.autorizado) { console.log(JSON.stringify({ parou: 'precisa do pode ir da pessoa', estimativa_usd: est.total, imagens: cenas.length })); process.exit(3) }
    const chave = lerEnv().GEMINI_API_KEY
    if (!chave) { console.error('falta GEMINI_API_KEY no .env (o /conectar ensina a pegar)'); process.exit(2) }
    const r = await viaGemini(cenas, { chave, precoUsd, contexto: a.contexto || 'gerar-imagens' })
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.faltaram.length ? 1 : 0)
  } catch (e) { console.error(e.message); process.exit(1) }
}
