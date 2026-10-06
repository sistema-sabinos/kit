#!/usr/bin/env node
// Backup automatico no GitHub ao fim de cada resposta (hook Stop do Claude Code).
// Manda primeiro e so puxa se o GitHub recusar porque o outro lado (socio, outro
// computador) mandou antes: quem trabalha sozinho nao paga nada a mais. Em conflito
// nao forca e nao junta sozinho: desfaz o rebase, deixa o trabalho intacto num commit
// local, e escreve um recado em _memoria/recados/ mais o .backup-falhou, que o /syncar
// resolve junto com a pessoa. O recado so sai pela mao do /syncar ("tratou, apaga").
// Antes do commit segura o que nao pode subir (cara de chave, arquivo grande): o resto
// sobe e um recado diz o que ficou. Sem internet fica quieto por um dia antes de avisar.
// Sai sempre com codigo 0: hook de Stop que falha nao pode travar a conversa.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const REDE_MS = 60000
// GitHub avisa acima de 50 MiB e recusa acima de 100 MiB (docs.github.com, "About large
// files on GitHub", conferido em 2026-10-05). Segura no aviso: o que entra no historico
// nao sai mais, e um so arquivo recusado trava todo envio seguinte.
const LIMITE_BYTES = 50 * 1024 * 1024
const TRAVA_VELHA_MS = 10 * 60 * 1000
const SEM_INTERNET_TOLERA_MS = 24 * 60 * 60 * 1000
// Lista unica de cara de chave do kit: a /faxina, o /compartilhar e o verificar-kit
// importam daqui. So assinatura forte: falso positivo segura arquivo bom do backup.
// Formatos conferidos em 2026-10-05, a partir das regras do gitleaks (github.com/gitleaks/
// gitleaks, config/gitleaks.toml) pra Meta EAA, Google AIza, Telegram, Slack e Stripe, mas
// nao iguais a elas: aqui sao mais largas (a Meta aceita qualquer EAA com 80+, o Telegram
// nao exige a palavra telegram perto). Instagram IGQV (curto) e IGAA (longo) pela doc da
// Meta; Mercado Livre e Mercado Pago APP_USR- pela doc de autenticacao do Mercado Livre.
// Cada item: [tipo, regex por linha, confere(grupo 1)]. O ultimo pega o resto: palavra de
// chave e, logo depois, sequencia longa com maiuscula, minuscula e digito. Hash hexadecimal
// fica de fora pela falta de maiuscula; linha com codigo Pix copia e cola (br.gov.bcb, que e
// publico de proposito) ou com imagem embutida (;base64,) fica de fora pelo comeco da regex.
export const CHAVES = [
  ['chave de API', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['token do GitHub', /\b(?:ghp|gho|ghs)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['chave da AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['chave privada', new RegExp('-----BEGIN [A-Z ]*PRIVATE ' + 'KEY-----')],
  ['token da Meta', /\bEAA[A-Za-z0-9]{80,}/],
  ['token do Instagram', /\bIG(?:QV|AA)[A-Za-z0-9_-]{80,}/],
  ['chave do Google', /\bAIza[A-Za-z0-9_-]{35}/],
  ['token do Telegram', /\b\d{5,16}:A[A-Za-z0-9_-]{34}(?![A-Za-z0-9_-])/],
  ['token do Slack', /\bxox[abeprs]-[A-Za-z0-9-]{10,}/],
  ['chave do Stripe', /\b(?:sk|rk)_(?:live|prod)_[A-Za-z0-9]{10,}/],
  ['token do Mercado Livre', /\bAPP_USR-\d+-\d{6}-[0-9a-f]{20,}-\d+/],
  ['token ou chave colada', /^(?!.*(?:br\.gov\.bcb|;base64,))[^\n]*?\b(?:[A-Za-z0-9]+_)*(?:token|chave|senha|secret|key|password|bearer)\b[^\n]{0,40}?(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{60,})/i,
    v => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v)],
]

// Primeira cara de chave numa linha, ou null.
export function caraDeChave(linha) {
  for (const [tipo, re, confere] of CHAVES) {
    const m = re.exec(linha)
    if (m && (!confere || confere(m[1]))) return tipo
  }
  return null
}

// Pela mensagem do git (LC_ALL=C fixa o idioma) so se escolhe o texto do aviso,
// nunca se decide conflito.
// O tempo esgotado do proprio spawn (push grande em rede lenta) fica de fora de proposito:
// nao e falta de rede, e calar um dia esconderia um envio que nunca termina.
export function semInternet(err) {
  return /could not resolve host|could not resolve proxy|failed to connect|connection timed out|connection refused|connection was reset|connection reset by peer|recv failure|network is unreachable|operation timed out|failed to receive handshake/i.test(err)
}
// "Repository not found" o GitHub devolve tambem pra repositorio privado sem acesso
export function semLogin(err) {
  return /authentication failed|could not read username|terminal prompts disabled|invalid username or password|permission denied|error: 403|returned error: 403|repository not found/i.test(err)
}

// cru: saida com -z nao leva trim, senao nome que comeca com espaco perde o espaco
function git(dir, args, ms = 30000, cru = false) {
  // LC_ALL=C e GIT_TERMINAL_PROMPT=0: mensagem sempre igual e nunca um prompt de senha
  // esperando quem nao esta olhando o terminal
  const r = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', timeout: ms, windowsHide: true,
    // GCM_INTERACTIVE: "To disable interactivity set this to false or 0" (Git Credential
    // Manager, github.com/git-ecosystem/git-credential-manager/blob/main/docs/environment.md,
    // conferido em 2026-10-05): sem janela de login vinda de hook sem ninguem olhando
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'false', LC_ALL: 'C' },
  })
  const err = (r.stderr || '').trim() || (r.error ? r.error.message : '')
  return { ok: r.status === 0, out: cru ? (r.stdout || '') : (r.stdout || '').trim(), err }
}

// .origem: uma palavra com o nome desta maquina; sem arquivo, "dono"
export function lerOrigem(dir) {
  let bruto = ''
  try { bruto = readFileSync(join(dir, '.origem'), 'utf8') } catch { return 'dono' }
  const palavra = bruto.trim().split(/\s+/)[0] || ''
  const limpa = palavra.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  return limpa || 'dono'
}

// data de calendario pelo fuso local (toISOString e UTC: as 22h no Brasil ja seria amanha)
export function carimbo(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return { dia: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

// rebase, merge, revert ou cherry-pick pela metade: alguem (o /syncar, a pessoa) esta resolvendo, nao mexer
function emAndamento(dir) {
  const g = git(dir, ['rev-parse', '--absolute-git-dir']).out
  return ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'sequencer'].some(n => existsSync(join(g, n)))
}

function contar(dir, intervalo) {
  return Number(git(dir, ['rev-list', '--count', intervalo]).out) || 0
}

function marcarFalha(dir, dia, hora, linhas) {
  const texto = [`O backup automatico no GitHub falhou em ${dia} ${hora}.`,
    'O trabalho esta salvo no computador, mas NAO subiu pra nuvem.',
    'Rode /syncar pra resolver.', ...linhas].join('\n') + '\n'
  try { writeFileSync(join(dir, '.backup-falhou'), texto) } catch {}
}

// Se o abort falha (arquivo preso por editor ou planilha aberta no Windows), o repositorio
// fica no meio do rebase e as proximas rodadas sairiam quietas: avisa na hora.
function desfazerRebase(dir, dia, hora) {
  const a = git(dir, ['rebase', '--abort'])
  if (a.ok) return true
  marcarFalha(dir, dia, hora, ['Ficou um rebase pela metade e o sistema nao conseguiu desfazer.',
    'Rode /syncar pra terminar ou desfazer esse rebase.', 'Erro do git:', a.err])
  return false
}

function deixarRecado(dir, origem, dia, hora, conflitos) {
  const pasta = join(dir, '_memoria', 'recados')
  mkdirSync(pasta, { recursive: true })
  const fim = `-${origem}-auto-sync-parado.md`
  // um recado aberto por maquina: enquanto ninguem resolve, o primeiro continua valendo
  if (readdirSync(pasta).some(n => n.endsWith(fim))) return
  const lista = conflitos.length ? conflitos.join(', ') : 'nao identificado'
  writeFileSync(join(pasta, `${dia}${fim}`), [
    `de: ${origem}`,
    `quando: ${dia} ${hora}`,
    'precisa de ação: sim',
    '',
    `O envio automático parou porque o outro lado mudou o mesmo trecho antes (${lista}), e o sistema nunca escolhe sozinho entre duas versões do mesmo trecho. Linhas diferentes do mesmo arquivo, e diário e decisões, ele junta sozinho.`,
    'Nada se perdeu: o trabalho daqui está salvo neste computador, num commit que ainda não subiu.',
    'Rodar /syncar, que resolve junto com a pessoa e apaga este recado no fim.',
    '',
  ].join('\n'))
}

// O que esta preparado (git add) e nao pode subir: cara de chave ou acima do limite.
// So lista; o /syncar manual usa isto pela linha de comando (--conferir).
export function conferirPreparados(dir, limite = LIMITE_BYTES) {
  const lista = git(dir, ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], 30000, true)
  // sem git, ou o git falhou: nunca devolver lista vazia, que pareceria "nada a segurar"
  if (!lista.ok) throw new Error(`nao consegui listar o que esta preparado: ${lista.err || 'pasta sem git'}`)
  const preparados = lista.out.split('\0').filter(Boolean)
  const segurados = []
  for (const rel of preparados) {
    let st
    try { st = statSync(join(dir, rel)) } catch { continue }
    if (st.size > limite) { segurados.push({ rel, motivo: `passa de ${Math.round(limite / 1024 / 1024)} MB` }); continue }
    // .env nunca chega aqui (o .gitignore barra), mas o .env.example sobe e e onde chave
    // de verdade costuma ficar esquecida; teste traz chave falsa de proposito. Texto de
    // qualquer tamanho abaixo do limite e lido: so o que mudou passa por aqui.
    const nome = basename(rel)
    if ((nome.startsWith('.env') && nome !== '.env.example') || rel.endsWith('.test.mjs')) continue
    let buf
    try { buf = readFileSync(join(dir, rel)) } catch { continue }
    if (buf.subarray(0, 8000).includes(0)) continue
    let achou = null
    for (const linha of buf.toString('utf8').split(/\r?\n/)) if ((achou = caraDeChave(linha))) break
    if (achou) segurados.push({ rel, motivo: `tem cara de ${achou}` })
  }
  return segurados
}

// Tira do commit o que nao pode subir. O arquivo continua no disco, intacto; so fica
// fora do backup ate a pessoa resolver.
function segurar(dir, limite) {
  const segurados = conferirPreparados(dir, limite)
  for (const s of segurados) git(dir, ['reset', '-q', '--', s.rel])
  return segurados
}

// Um recado por maquina, reescrito so quando a lista muda (senao cada resposta viraria
// commit novo onde o .gitignore nao barra) e apagado quando nao sobra nada segurado.
function avisarSegurados(dir, origem, dia, segurados) {
  const pasta = join(dir, '_memoria', 'recados')
  const fim = `-${origem}-auto-sync-segurou.md`
  const existente = existsSync(pasta) ? readdirSync(pasta).find(n => n.endsWith(fim)) : undefined
  if (!segurados.length) {
    if (!existente) return null
    rmSync(join(pasta, existente), { force: true })
    return `_memoria/recados/${existente}`
  }
  const nome = existente || `${dia}${fim}`
  const texto = [
    `de: ${origem}`,
    `quando: ${nome.slice(0, 10)}`,
    'precisa de ação: sim',
    '',
    'Estes arquivos ficaram fora do backup no GitHub (o resto subiu normal):',
    ...segurados.map(s => `- ${s.rel}: ${s.motivo}`),
    '',
    'Cara de chave: tirar a chave do arquivo e guardar no `.env`, deixando no texto só o nome dela. Se esse arquivo já tinha subido antes com a chave, trocar a chave no serviço: apagar o arquivo não apaga o histórico do GitHub.',
    'Arquivo grande: guardar fora da pasta do projeto (Drive, HD) e deixar aqui só o link.',
    'Este recado some sozinho quando não sobrar nada segurado.',
    '',
  ].join('\n')
  mkdirSync(pasta, { recursive: true })
  const caminho = join(pasta, nome)
  if (!existsSync(caminho) || readFileSync(caminho, 'utf8') !== texto) writeFileSync(caminho, texto)
  return `_memoria/recados/${nome}`
}

function marcaSemInternet(dir) {
  return join(git(dir, ['rev-parse', '--absolute-git-dir']).out, 'sabinos-sem-internet-desde')
}

function enviouTudo(dir) {
  rmSync(join(dir, '.backup-falhou'), { force: true })
  rmSync(marcaSemInternet(dir), { force: true })
}

// Envio que falhou sem ser conflito. Sem internet e passageiro: so vira aviso depois de
// um dia, e o commit sobe sozinho na primeira resposta com rede.
function falhaDeEnvio(dir, agora, dia, hora, err) {
  if (semInternet(err)) {
    const marca = marcaSemInternet(dir)
    if (!existsSync(marca)) writeFileSync(marca, String(agora.getTime()))
    const desde = Number(readFileSync(marca, 'utf8')) || agora.getTime()
    if (agora.getTime() - desde < SEM_INTERNET_TOLERA_MS) return 'sem-internet'
    marcarFalha(dir, dia, hora, ['Faz mais de um dia que este computador não alcança o GitHub (sem internet ou rede bloqueando).',
      'Tudo continua salvo aqui e sobe sozinho quando a conexão voltar.', 'Erro do git:', err])
    return 'falhou'
  }
  if (semLogin(err)) {
    marcarFalha(dir, dia, hora, ['O GitHub recusou este computador: login vencido, sem permissão no repositório, ou o repositório foi apagado ou renomeado.',
      'O /syncar refaz o login e confere o repositório.', 'Erro do git:', err])
    return 'falhou'
  }
  marcarFalha(dir, dia, hora, ['Erro do git:', err])
  return 'falhou'
}

// Duas janelas do Claude no mesmo projeto disparam dois Stop ao mesmo tempo: a segunda
// rodada sai quieta (a primeira leva tudo). Trava esquecida por queda some em 10 minutos.
function travar(dir, agora) {
  const trava = join(git(dir, ['rev-parse', '--absolute-git-dir']).out, 'sabinos-auto-sync.trava')
  try { mkdirSync(trava); return trava } catch {}
  try {
    if (agora.getTime() - statSync(trava).mtimeMs < TRAVA_VELHA_MS) return null
    rmSync(trava, { recursive: true, force: true })
    mkdirSync(trava)
    return trava
  } catch { return null }
}

// Devolve o que aconteceu, pra teste e pra quem chamar: sem-repo, sem-remoto, ocupado,
// em-andamento, nada, enviado, puxado-e-enviado, parado (conflito), sem-internet ou falhou.
export function autoSync(dir, agora = new Date(), { limiteBytes = LIMITE_BYTES } = {}) {
  if (!git(dir, ['rev-parse', '--git-dir']).ok) return 'sem-repo'
  if (!git(dir, ['remote', 'get-url', 'origin']).ok) return 'sem-remoto'
  const trava = travar(dir, agora)
  if (!trava) return 'ocupado'
  try { return rodada(dir, agora, limiteBytes) } finally { rmSync(trava, { recursive: true, force: true }) }
}

function rodada(dir, agora, limiteBytes) {
  const { dia, hora } = carimbo(agora)
  if (emAndamento(dir)) {
    // fica quieto, mas se ninguem avisou ainda, avisa uma vez (nao pisa no aviso existente)
    if (!existsSync(join(dir, '.backup-falhou'))) marcarFalha(dir, dia, hora, ['Tem um rebase ou merge em andamento, entao o envio automatico esperou.', 'Rode /syncar pra terminar essa resolucao.'])
    return 'em-andamento'
  }
  const origem = lerOrigem(dir)

  git(dir, ['add', '-A'])
  const recado = avisarSegurados(dir, origem, dia, segurar(dir, limiteBytes))
  // o recado acabou de ser escrito ou apagado: entra no mesmo commit onde nao e ignorado.
  // So ele, pelo nome: a pasta inteira devolveria ao commit o que o segurar tirou.
  if (recado) git(dir, ['add', '-A', '--', recado])
  let commitou = false
  if (!git(dir, ['diff', '--staged', '--quiet']).ok) {
    const c = git(dir, ['commit', '-q', '-m', `auto-sync ${origem}: ${dia} ${hora}`])
    if (!c.ok) { marcarFalha(dir, dia, hora, ['Erro do git no commit:', c.err]); return 'falhou' }
    commitou = true
  }
  const temUpstream = git(dir, ['rev-parse', '--abbrev-ref', '@{u}']).ok
  // commit que ficou pra tras numa falha anterior tambem sobe, mesmo sem mudanca nova
  if (!(temUpstream ? contar(dir, '@{u}..HEAD') > 0 : commitou)) {
    // tudo ja esta no GitHub: aviso de falha antigo nao vale mais
    if (temUpstream) enviouTudo(dir)
    return 'nada'
  }

  let envio = git(dir, ['push', '--quiet'], REDE_MS)
  if (envio.ok) { enviouTudo(dir); return 'enviado' }

  // Recusa sem forcar so acontece quando o outro lado mandou antes. Confere pelo historico,
  // nunca pela mensagem, que muda com a versao do git e com o servidor.
  if (temUpstream && git(dir, ['fetch', '--quiet'], REDE_MS).ok && contar(dir, 'HEAD..@{u}') > 0) {
    // Arquivo segurado que o outro lado tambem mudou: juntar por cima dele deixaria marca de
    // conflito dentro do arquivo da pessoa. Para como conflito e o /syncar resolve junto.
    const nomes = args => git(dir, ['-c', 'core.quotepath=false', 'diff', '--name-only', '-z', ...args], 30000, true).out.split('\0').filter(Boolean)
    const chegando = nomes(['HEAD...@{u}'])
    const cruzados = nomes([]).filter(f => chegando.includes(f))
    if (cruzados.length) {
      deixarRecado(dir, origem, dia, hora, cruzados)
      marcarFalha(dir, dia, hora, [`Conflito: o outro lado mudou ${cruzados.join(', ')}, que está segurado neste computador. Nada se perdeu.`])
      return 'parado'
    }
    // --autostash: arquivo ja rastreado que ficou segurado deixa a arvore suja, e sem isso
    // o pull recusaria a cada resposta enquanto o outro lado estiver ativo
    const puxa = git(dir, ['pull', '--rebase', '--autostash', '--quiet'], REDE_MS)
    if (!puxa.ok) {
      if (!emAndamento(dir)) { marcarFalha(dir, dia, hora, ['Erro do git ao puxar:', puxa.err]); return 'falhou' }
      const conflitos = git(dir, ['-c', 'core.quotepath=false', 'diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean)
      if (!desfazerRebase(dir, dia, hora)) return 'falhou'
      if (!conflitos.length) { marcarFalha(dir, dia, hora, ['Erro do git ao puxar (nao foi conflito):', puxa.err]); return 'falhou' }
      deixarRecado(dir, origem, dia, hora, conflitos)
      marcarFalha(dir, dia, hora, [`Conflito: o outro lado mudou ${conflitos.join(', ') || 'os mesmos arquivos'} antes. Nada se perdeu.`])
      return 'parado'
    }
    envio = git(dir, ['push', '--quiet'], REDE_MS)
    if (envio.ok) { enviouTudo(dir); return 'puxado-e-enviado' }
  }
  return falhaDeEnvio(dir, agora, dia, hora, envio.err)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  if (process.argv[2] === '--conferir') {
    // /syncar: lista o que nao pode subir do que ja esta preparado, sem commitar nada.
    // Sai 1 quando acha, 2 quando nao conseguiu conferir, pra a skill nao seguir no automatico.
    try {
      const r = conferirPreparados(dir)
      console.log(JSON.stringify(r, null, 1))
      process.exitCode = r.length ? 1 : 0
    } catch (e) { console.error(`erro: ${e.message}`); process.exitCode = 2 }
  } else if (process.argv[2]) {
    // o Stop do Claude Code nunca passa argumento: argumento estranho e digitacao errada,
    // e digitacao errada nunca pode virar backup de verdade
    console.error(`opcao desconhecida: ${process.argv[2]} (a unica e --conferir)`)
    process.exitCode = 3
  } else {
    try { autoSync(dir) } catch {}
    process.exitCode = 0
  }
}
