// Gemini assistindo o cru (passo 3.2b do /editar-video, opcional e PAGO): ouve o video inteiro e diz, por trecho do
// bordas.md, se a frase saiu com tropeco, sem energia ou com tom errado, e qual take de frase repetida foi mais bem
// dito. O Claude ve as folhas mas nao ouve; o Gemini ouve, mas ve 1 quadro por segundo, entao nao serve pra borda.
// Modelo fixo, o da tabela de preco da custo.mjs: com --model a API recusa nome que nao existe, sem cobrar e sem
// trocar por outro (o --barato do ver-video troca). Resolucao baixa (cerca de 100 tokens por segundo de video).
//
// uso: node gemini-cru.mjs <bruto> <trab/cru/bordas.md> <trab/cru/gemini.md> [--preco-usd N [--autorizado]] [--video slug]
// Sem --preco-usd, ou sem --autorizado e sem permissao de gasto no _contexto/autonomia.md, so estima o custo e sai 3
// ("parou"), sem rede. Com o sim ou com a permissao, passa pela trava do gasto (liberar-gasto-cli, que confere a
// permissao de novo sob a trava), chama o ver-video e grava a resposta e uma linha de custo (registrar-custo-cli).
// 5.52 (chat 3): sem --autorizado a trava vai sem ele, e o gasto que foi pela permissao sai numa linha [permissao].
// Saida: 0 gravou, 3 parou antes de gastar, 1 o ver-video falhou (pode ter cobrado: a mensagem diz o que conferir) ou
// o custo nao foi anotado (a resposta fica gravada e a mensagem diz o valor a anotar a mao).
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PRECOS, dataLocal } from '../../assistir-video/custo.mjs'
import { permissaoDeGasto, avisoDaPermissao } from '../../conectar/scripts/lib/orcamento.mjs'
import { RAIZ } from '../../conectar/scripts/lib/raiz.mjs'

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const MODELO = 'gemini-3.8-flash'
const TOKENS_POR_SEG = 100, TOKENS_PERGUNTA = 3000, TOKENS_RESPOSTA = 4000

export function estimarUsd(segundos, hoje = dataLocal(), p = PRECOS[MODELO]) {
  const preco = p.promocional_ate && hoje > p.promocional_ate ? p.depois : p
  const usd = ((segundos * TOKENS_POR_SEG + TOKENS_PERGUNTA) * preco.entrada + TOKENS_RESPOSTA * preco.saida) / 1e6
  return Math.ceil(usd * 1000) / 1000
}

export function pergunta(bordas) {
  const trechos = bordas.split(/\r?\n/).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 6 && /^\d+$/.test(c[0])).map((c) => `${c[0]} | ${c[1]} | ${c[5]}`)
  return 'Voce e um editor de video assistindo o material cru de uma pessoa falando pra camera, antes de cortar. Ouca o '
    + 'video inteiro. Abaixo vai a lista de trechos de fala (numero | inicio:fim em segundos | texto que o whisper ouviu). '
    + 'Pra cada trecho, diga se a frase saiu bem dita ou nao: tropeco, palavra trocada, hesitacao, voz sem energia, tom '
    + 'que nao combina com o resto, risada ou respiracao no meio. Quando a mesma frase foi gravada mais de uma vez, diga '
    + 'qual take foi o mais bem dito e por que. Nao fale de enquadramento nem do ponto exato do corte. Responda SO neste '
    + 'formato, uma linha por trecho:\nTRECHO | numero | ok ou problema | o que ouviu\nREPETIDO | numeros dos takes | o '
    + 'melhor | por que\n\nTRECHOS:\n' + trechos.join('\n')
}

function segundos(arquivo) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo], { encoding: 'utf8' })
  return Number(r.stdout.trim()) || 0
}

function main() {
  const { values: o, positionals: [bruto, bordas, saida] } = parseArgs({
    allowPositionals: true,
    options: {
      'preco-usd': { type: 'string' }, autorizado: { type: 'boolean', default: false }, video: { type: 'string' },
      'raiz-custo': { type: 'string' },
      'ver-video': { type: 'string', default: resolve(SKILLS, 'assistir-video', 'ver-video.mjs') },
      'liberar-gasto': { type: 'string', default: resolve(SKILLS, 'conectar', 'scripts', 'lib', 'liberar-gasto-cli.mjs') },
      'registrar-custo': { type: 'string', default: resolve(SKILLS, 'configurar-video', 'scripts', 'lib', 'registrar-custo-cli.mjs') },
    },
  })
  if (!bruto || !bordas || !saida) { console.error('uso: node gemini-cru.mjs <bruto> <bordas.md> <gemini.md> [--preco-usd N --autorizado] [--video slug]'); return 2 }
  if (!existsSync(bruto) || !existsSync(bordas)) { console.error(`nao achei ${existsSync(bruto) ? bordas : bruto}: rode o assistir-cru.py antes`); return 2 }
  const seg = segundos(bruto)
  const estimativa = estimarUsd(seg)
  // sem o sim, so segue quem tem a permissao escrita; a conferencia de verdade e a da trava, depois da copia leve
  if (o['preco-usd'] === undefined || (!o.autorizado && !permissaoDeGasto({ raiz: o['raiz-custo'] || RAIZ }))) {
    console.log(`parou: o Gemini no cru e pago. Estimativa de hoje: US$ ${estimativa} (${MODELO}, ${Math.round(seg)} s, resolucao baixa, preco conferido em ${PRECOS[MODELO].conferido_em}). Confira o preco na pagina oficial do Gemini, mostre a conta e, com o sim, rode de novo com --preco-usd ${estimativa} --autorizado (com a permissao de gasto do _contexto/autonomia.md, sem o --autorizado).`)
    return 3
  }
  const raiz = o['raiz-custo'] ? ['--raiz', o['raiz-custo']] : []
  const ctx = `gemini no cru: ${bruto.split(/[\\/]/).pop()}`
  // o cru do celular passa de 1 GB e o envio morre calado: vai uma copia leve, com o mesmo tempo e o mesmo audio.
  // Ela sai antes da trava, pra falha do ffmpeg nao deixar reserva de orcamento aberta.
  const tmp = mkdtempSync(join(tmpdir(), 'gemini-cru-'))
  let r, trava
  try {
    const leve = join(tmp, 'leve.mp4')
    const f = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', bruto, '-vf', 'fps=10,scale=-2:480', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
      '-c:a', 'aac', '-b:a', '96k', leve], { encoding: 'utf8' })
    if (f.status !== 0) { console.error(`nao consegui fazer a copia leve do cru (nada foi cobrado nem reservado): ${(f.stderr || '').slice(-500)}`); return 1 }
    const lib = spawnSync('node', [o['liberar-gasto'], '--usd', o['preco-usd'], ...(o.autorizado ? ['--autorizado'] : []), '--pid', String(process.pid), '--contexto', ctx, ...raiz], { encoding: 'utf8' })
    try { trava = JSON.parse(lib.stdout.trim().split(/\r?\n/).pop()) } catch { trava = { codigo: 3, parou: 'a trava de gasto nao respondeu: ' + (lib.stderr || '').slice(0, 200) } }
    if (trava.codigo !== 0) { console.log(`parou: ${trava.parou ?? 'a trava de gasto nao liberou'}${trava.fora_da_permissao ? ` (fora da permissao: ${trava.fora_da_permissao})` : ''}`); return 3 }
    // com orcamento do mes, a reserva da trava (o ver-video confere que e deste processo); no teto por lote, sem
    // reserva, o ver-video passa pela trava com o mesmo sim e so nao anota o custo (a linha e a daqui de baixo)
    const prova = trava.reserva ? ['--reserva', trava.reserva] : ['--usd', o['preco-usd'], '--autorizado', '--sem-registro']
    r = spawnSync('node', [o['ver-video'], leve, '--model', MODELO, '--lowres', ...prova, '--pergunta', pergunta(readFileSync(bordas, 'utf8')), ...(o['raiz-custo'] ? ['--raiz', o['raiz-custo']] : [])],
      { encoding: 'utf8', maxBuffer: 1 << 24 })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (r.status !== 0) {
    const reserva = trava.reserva ? `; depois feche a reserva ${trava.reserva} pelo --saldo do /configurar-video` : ''
    console.error(`o ver-video falhou: pode ter sido cobrado mesmo assim, confira no painel do Gemini e anote a mao em dados/custos.jsonl se tiver cobrado${reserva}\n${(r.stderr || '').slice(-1500)}`)
    return 1
  }
  // primeiro anota o custo (a chamada ja foi paga), depois grava a resposta.
  // O custo e o que o ver-video mediu pelos tokens; a estimativa autorizada so quando ele nao mediu
  const medido = (r.stderr || '').match(/custo: US\$ ([0-9.]+)\)/)
  const usd = medido ? medido[1] : o['preco-usd']
  const reg = spawnSync('node', [o['registrar-custo'], '--servico', 'gemini-cru', '--usd', usd, '--contexto', ctx, '--segundos', String(Math.round(seg)),
    ...(trava.reserva ? ['--reserva', trava.reserva] : []), ...(o.video ? ['--video', o.video] : []), ...raiz], { encoding: 'utf8' })
  // o registrador sai 0 mesmo quando nao grava: o aviso vem no stderr
  const aviso = reg.status !== 0 ? `o registro de custo saiu ${reg.status}` : (reg.stderr || '').trim()
  const texto = `# Gemini no cru (${MODELO}, ${dataLocal()})\n\n${r.stdout.trim()}\n`
  try {
    writeFileSync(saida, texto)
  } catch (e) {
    console.error(`nao consegui gravar ${saida} (${e.message}); a resposta paga vai aqui embaixo, copie pro arquivo:\n${texto}`)
    if (aviso) console.error(`e o custo de US$ ${usd} NAO foi anotado: ${aviso}`)
    return 1
  }
  if (aviso) {
    console.error(`gemini-cru: resposta em ${saida}, mas o custo de US$ ${usd} NAO foi anotado: ${aviso}`)
    return 1
  }
  console.log(`gemini-cru: resposta em ${saida}, US$ ${usd} anotado${medido ? ' (medido pelos tokens)' : ' (estimativa, o ver-video nao mediu)'}`)
  const permissao = avisoDaPermissao(trava)
  if (permissao) console.log(permissao)
  return 0
}

const principal = () => {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}
if (principal()) process.exitCode = main()
