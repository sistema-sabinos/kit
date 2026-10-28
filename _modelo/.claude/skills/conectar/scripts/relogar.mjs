#!/usr/bin/env node
// Refaz o login da conta no Chrome dedicado do projeto quando a sessao caiu, so na conta em que a
// pessoa ligou o relogin automatico (referencias/relogar.md): <CONTA>_USUARIO, <CONTA>_SENHA e
// <CONTA>_TOTP no .env. Quem le o .env e este script; a IA nunca ve os valores.
// Uso, da raiz do projeto:
//   node .claude/skills/conectar/scripts/relogar.mjs <CONTA> [--raiz <pasta>] [--env <arquivo>] [--receita <arquivo.json>]
// Sem flag: a raiz e a do projeto, o .env e o da raiz e a receita sai do receitas-login.json.
// --receita usa uma receita candidata fora da lista (a prova ao vivo, antes de ela entrar na lista);
// --env le so o arquivo dado e recusa arquivo dentro de repositorio git.
// Imprime so uma palavra: relogou, sem-receita, falta-variavel, captcha ou falhou (o porque vai no
// erro, sem valor nenhum). Sai 0 com relogou, 1 com o resto e 2 em erro de uso.
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { abrirChrome, abaDoSite, relogar, receitaValida, perfilDedicado, tentouHaPouco, marcarTentativa, desmarcarTentativa, travarRelogin, estadoDaUrl, JANELA_RELOGIN_MS } from './lib/navegador.mjs'
import { RAIZ } from './lib/raiz.mjs'
import { CONTA, lerEnv } from './totp.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))

function sair(codigo, palavra, recado) {
  if (palavra) console.log(palavra)
  if (recado) console.error(recado)
  process.exit(codigo)
}

const argv = process.argv.slice(2)
const a = { conta: null, raiz: RAIZ, env: null, receita: null }
for (let i = 0; i < argv.length; i++) {
  const f = argv[i]
  if (['--raiz', '--env', '--receita'].includes(f)) {
    const v = argv[++i]
    if (!v) sair(2, null, `${f} pede um caminho`)
    a[f.slice(2)] = resolve(v)
  } else if (a.conta === null) a.conta = f
  else sair(2, null, `argumento a mais: ${f}`)
}
if (!CONTA.test(a.conta || '')) sair(2, null, 'uso: relogar.mjs <CONTA> [--raiz <pasta>] [--env <arquivo>] [--receita <arquivo.json>], com a conta em maiuscula (ML, por exemplo)')

// o .env de prova fica fora de repositorio: dentro de um, um git add -A leva a senha pro GitHub
if (a.env) {
  const g = spawnSync('git', ['-C', dirname(a.env), 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' })
  if (g.error) sair(2, null, '--env: nao deu pra conferir pelo git se o arquivo esta fora de repositorio')
  if (g.status === 0 && g.stdout.trim() === 'true') sair(2, null, '--env recusa arquivo dentro de repositorio git: ponha o .env de prova numa pasta fora dele')
}
let texto = ''
try { texto = readFileSync(a.env || join(a.raiz, '.env'), 'utf8') } catch {}
const env = lerEnv(texto)
const faltam = ['USUARIO', 'SENHA', 'TOTP'].map(s => `${a.conta}_${s}`).filter(n => !env.get(n))
if (faltam.length) sair(1, 'falta-variavel', `falta no .env: ${faltam.join(', ')}`)

let receitas
try {
  const lido = JSON.parse(readFileSync(a.receita || join(AQUI, 'receitas-login.json'), 'utf8'))
  receitas = a.receita ? [lido] : lido
} catch {
  sair(2, null, `nao deu pra ler a receita em ${a.receita || 'receitas-login.json'} (JSON quebrado ou arquivo ausente)`)
}
if (!Array.isArray(receitas)) sair(2, null, 'receitas-login.json tem de ser uma lista')
for (const r of receitas) {
  const motivo = receitaValida(r)
  if (motivo) sair(2, null, `receita invalida: ${motivo}`)
}
if (a.receita && receitas[0].conta !== a.conta) sair(2, null, `a receita e da conta ${receitas[0].conta}, nao de ${a.conta}`)
// so as receitas desta conta: a senha de uma conta nunca vai pro site de outra
receitas = receitas.filter(r => r.conta === a.conta)
if (receitas.length === 0) sair(1, 'sem-receita', `nenhuma receita de login testada ainda pra ${a.conta}: o robo para e avisa, e o login e com voce`)

const perfil = perfilDedicado(a.raiz)
// um relogin por conta de cada vez: dois disparos juntos passariam os dois pela marca abaixo
const soltar = travarRelogin({ perfil, conta: a.conta })
if (!soltar) sair(1, 'falhou', `outro relogin de ${a.conta} esta rodando agora: espere ele terminar e rode de novo`)
process.on('exit', soltar)
if (tentouHaPouco({ perfil, conta: a.conta })) sair(1, 'falhou', `a sessao de ${a.conta} caiu de novo menos de ${JANELA_RELOGIN_MS / 60_000} minutos depois de um relogin: o robo para aqui. Entre na conta pela janela do Chrome dedicado`)

// so Chrome com perfil que ja existe: perfil novo nao tem sessao pra recuperar
let chrome
try {
  chrome = await abrirChrome({ raiz: a.raiz, soExistente: true, log: m => console.error(m) })
} catch (e) {
  sair(1, 'falhou', e.message)
}
if (!chrome.perfilConferido) sair(1, 'falhou', `na porta ${chrome.porta} responde um Chrome que nao e o deste projeto (perfil em ${perfil})`)
// sem aba do site (o script que viu a queda ja fechou a dele), abre a entrada da receita da conta
const r0 = receitas.length === 1 ? receitas[0] : null
const aba = await abaDoSite({
  porta: chrome.porta, hosts: receitas.map(r => r.host), abrir: r0 ? r0.entrada || `https://${r0.host}/` : null,
  naFrente: u => receitas.some(r => estadoDaUrl(u, r) === 'sessao-caida'), log: m => console.error(m),
})
if (!aba) sair(1, 'falhou', 'nenhuma aba do Chrome dedicado esta no site da receita, e nao deu pra abrir uma')
const receita = receitas.find(r => r.host === aba.host)
let r
try {
  r = await relogar({ pagina: aba, conta: a.conta, receita, env, aoTentar: () => marcarTentativa({ perfil, conta: a.conta }), aoDesistir: () => desmarcarTentativa({ perfil, conta: a.conta }), log: m => console.error(m) })
} finally {
  aba.fechar()
}
sair(r.resultado === 'relogou' ? 0 : 1, r.resultado, r.motivo)
