#!/usr/bin/env node
// Backup automatico no GitHub ao fim de cada resposta (hook Stop do Claude Code).
// Manda primeiro e so puxa se o GitHub recusar porque o outro lado (socio, outro
// computador) mandou antes: quem trabalha sozinho nao paga nada a mais. Em conflito
// nao forca e nao junta sozinho: desfaz o rebase, deixa o trabalho intacto num commit
// local, e escreve um recado em _memoria/recados/ mais o .backup-falhou, que o /syncar
// resolve junto com a pessoa. O recado so sai pela mao do /syncar ("tratou, apaga").
// Sai sempre com codigo 0: hook de Stop que falha nao pode travar a conversa.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REDE_MS = 60000

function git(dir, args, ms = 30000) {
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
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err }
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

// rebase ou merge pela metade: alguem (o /syncar, a pessoa) esta resolvendo, nao mexer
function emAndamento(dir) {
  const g = git(dir, ['rev-parse', '--absolute-git-dir']).out
  return ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'].some(n => existsSync(join(g, n)))
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
    `O envio automático parou porque o outro lado mudou o mesmo arquivo antes (${lista}), e o sistema nunca junta duas versões sozinho.`,
    'Nada se perdeu: o trabalho daqui está salvo neste computador, num commit que ainda não subiu.',
    'Rodar /syncar, que resolve junto com a pessoa e apaga este recado no fim.',
    '',
  ].join('\n'))
}

// Devolve o que aconteceu, pra teste e pra quem chamar: sem-repo, sem-remoto,
// em-andamento, nada, enviado, puxado-e-enviado, parado (conflito) ou falhou.
export function autoSync(dir, agora = new Date()) {
  if (!git(dir, ['rev-parse', '--git-dir']).ok) return 'sem-repo'
  if (!git(dir, ['remote', 'get-url', 'origin']).ok) return 'sem-remoto'
  const { dia, hora } = carimbo(agora)
  if (emAndamento(dir)) {
    // fica quieto, mas se ninguem avisou ainda, avisa uma vez (nao pisa no aviso existente)
    if (!existsSync(join(dir, '.backup-falhou'))) marcarFalha(dir, dia, hora, ['Tem um rebase ou merge em andamento, entao o envio automatico esperou.', 'Rode /syncar pra terminar essa resolucao.'])
    return 'em-andamento'
  }
  const origem = lerOrigem(dir)

  git(dir, ['add', '-A'])
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
    if (temUpstream) rmSync(join(dir, '.backup-falhou'), { force: true })
    return 'nada'
  }

  let envio = git(dir, ['push', '--quiet'], REDE_MS)
  if (envio.ok) { rmSync(join(dir, '.backup-falhou'), { force: true }); return 'enviado' }

  // Recusa sem forcar so acontece quando o outro lado mandou antes. Confere pelo historico,
  // nunca pela mensagem, que muda com a versao do git e com o servidor.
  if (temUpstream && git(dir, ['fetch', '--quiet'], REDE_MS).ok && contar(dir, 'HEAD..@{u}') > 0) {
    const puxa = git(dir, ['pull', '--rebase', '--quiet'], REDE_MS)
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
    if (envio.ok) { rmSync(join(dir, '.backup-falhou'), { force: true }); return 'puxado-e-enviado' }
  }
  marcarFalha(dir, dia, hora, ['Erro do git:', envio.err])
  return 'falhou'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { autoSync(process.env.CLAUDE_PROJECT_DIR || process.cwd()) } catch {}
  process.exitCode = 0
}
