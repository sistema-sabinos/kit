// Cadastro dos robos no agendador do sistema: Agendador de Tarefas no Windows (PowerShell,
// modulo ScheduledTasks) e launchd no Mac. Linux fica de fora por enquanto.
//
// No Windows: roda a tarefa perdida quando o PC liga (StartWhenAvailable), limite de execucao
// = prazo do cao de guarda + espera de boot do motor + 5 min (sem isso o padrao do Windows e
// 3 dias, e sem contar a espera de boot o Windows podia matar o processo antes de o cao de
// guarda proprio entrar em cena na rodada perdida), nao empilha instancia (IgnoreNew) e roda
// na bateria. Sem senha guardada: roda com a sessao aberta.
// No Mac o launchd so roda a rodada perdida se a maquina estava dormindo; desligada na hora,
// a rodada daquele dia se perde.
//
// Uso: node agendador.mjs registrar <robos/nome.mjs> | remover <nome> | listar | atrasados
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, resolve, posix } from 'node:path'
import { homedir, userInfo } from 'node:os'
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'
import { carregarReceita } from './receita.mjs'
import { lerRegistro, registrar, chaveDa, dataLocal } from './registro.mjs'
import { MINUTOS_BOOT } from './motor.mjs'

const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor.mjs')
const DIAS_WINDOWS = { dom: 'Sunday', seg: 'Monday', ter: 'Tuesday', qua: 'Wednesday', qui: 'Thursday', sex: 'Friday', sab: 'Saturday' }
const DIAS_LAUNCHD = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 }
const FOLGA_MIN = 5
const FS_PADRAO = { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync }

const limpar = (s) => String(s).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
// O PowerShell trata as aspas curvas (U+2018 e U+2019) como aspa simples: todas se dobram.
const ASPAS_SIMPLES = new RegExp(`['${String.fromCharCode(0x2018)}${String.fromCharCode(0x2019)}]`, 'g')
const aspasPs = (s) => `'${String(s).replace(ASPAS_SIMPLES, (a) => a + a)}'`
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function nomeTarefa(raiz, nome) {
  // Hifen duplo separa a pasta do projeto do nome do robo: limpar() reduz qualquer sequencia
  // de nao-alfanumerico a um hifen e apara as pontas, e nome sai kebab da receita, entao "--"
  // nunca aparece dentro de nenhum dos dois lados. Sem isso, "SabinOS-Loja-" tambem casava com
  // as tarefas do projeto "Loja-Nova" na hora de listar.
  return `SabinOS-${limpar(basename(raiz))}--${nome}`
}

export function rotuloMac(raiz, nome) {
  return `com.sabinos.${limpar(basename(raiz)).toLowerCase()}.${nome}`
}

export function scriptWindows({ tarefa, node, motor, receita, raiz, quando, prazoMinutos }) {
  const gatilho = quando.tipo === 'semanal'
    ? `New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${DIAS_WINDOWS[quando.dia]} -At ${aspasPs(quando.hora)}`
    : `New-ScheduledTaskTrigger -Daily -At ${aspasPs(quando.hora)}`
  // conhost --headless roda o node sem abrir janela; chamando o node direto, cada rodada
  // abria a janela preta na cara do usuario.
  const argumento = `--headless "${node}" "${motor}" "${receita}" --agendado`
  return [
    `$ErrorActionPreference = 'Stop'`,
    `$acao = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ${aspasPs(argumento)} -WorkingDirectory ${aspasPs(raiz)}`,
    `$gatilho = ${gatilho}`,
    `$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes ${prazoMinutos + MINUTOS_BOOT + FOLGA_MIN}) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`,
    `Register-ScheduledTask -TaskName ${aspasPs(tarefa)} -Action $acao -Trigger $gatilho -Settings $ajustes -Force | Out-Null`,
  ].join('\n')
}

export function plistMac({ rotulo, node, motor, receita, raiz, quando, nome }) {
  const [h, m] = quando.hora.split(':').map(Number)
  const dia = quando.tipo === 'semanal' ? `\n    <key>Weekday</key><integer>${DIAS_LAUNCHD[quando.dia]}</integer>` : ''
  const log = posix.join(raiz, 'robos', `${nome}.log`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(rotulo)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(motor)}</string>
    <string>${xml(receita)}</string>
    <string>--agendado</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(raiz)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${h}</integer>
    <key>Minute</key><integer>${m}</integer>${dia}
  </dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`
}

function rodarPs(executar, script) {
  const r = executar('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' })
  // status null e falha ao disparar o processo (powershell.exe nao existe, por exemplo): sem
  // isso a mensagem de erro saia vazia, porque nao ha stdout nem stderr desse jeito.
  const saida = r.status === null ? (r.error?.message || 'powershell nao rodou') : `${r.stdout || ''}${r.stderr || ''}`.trim()
  return { ok: r.status === 0, saida }
}

function dependencias(deps = {}) {
  return {
    raiz: RAIZ,
    plataforma: process.platform,
    executar: spawnSync,
    node: process.execPath,
    casa: homedir(),
    uid: () => userInfo().uid,
    agora: () => new Date(),
    ...deps,
    fs: { ...FS_PADRAO, ...(deps.fs || {}) },
  }
}

const pastaAgentes = (casa) => posix.join(casa, 'Library', 'LaunchAgents')
const caminhoLivro = (raiz) => join(raiz, 'robos', 'execucoes.jsonl')

// Agendar e remover tambem vao pro livro: e dali que o "atrasados" sabe desde quando o robo
// devia estar rodando e que um robo tirado nao esta mais atrasado. Nenhum dos dois fecha o dia.
function anotarNoLivro(d, nome, resultado) {
  const inicio = d.agora()
  registrar(caminhoLivro(d.raiz), { chave: chaveDa(nome, dataLocal(inicio)), robo: nome, resultado, inicio: inicio.toISOString() })
}

// A consulta passa pelo Where-Object em vez de Get-ScheduledTask -TaskName: com o nome de uma
// tarefa que nao existe, o Windows em portugues sai com erro mesmo com -ErrorAction
// SilentlyContinue. Assim, nada achado e saida vazia com codigo 0.
const consultaTarefas = (filtro) => `Get-ScheduledTask | Where-Object { $_.TaskName ${filtro} } | ForEach-Object { $_.TaskName }`

export async function registrarRobo(caminhoReceita, deps) {
  const d = dependencias(deps)
  const receitaAbs = resolve(d.raiz, caminhoReceita)
  const receita = await carregarReceita(receitaAbs)
  const base = { node: d.node, motor: MOTOR, receita: receitaAbs, raiz: d.raiz, quando: receita.quando, prazoMinutos: receita.prazoMinutos, nome: receita.nome }

  if (d.plataforma === 'win32') {
    const tarefa = nomeTarefa(d.raiz, receita.nome)
    const r = rodarPs(d.executar, scriptWindows({ ...base, tarefa }))
    if (!r.ok) throw new Error(`o agendador do Windows recusou: ${r.saida}`)
    if (!rodarPs(d.executar, `Get-ScheduledTask -TaskName ${aspasPs(tarefa)} | Out-Null`).ok) {
      throw new Error('a tarefa nao apareceu no agendador depois de cadastrada')
    }
    anotarNoLivro(d, receita.nome, 'agendado')
    return { tarefa }
  }

  if (d.plataforma === 'darwin') {
    const rotulo = rotuloMac(d.raiz, receita.nome)
    const pasta = pastaAgentes(d.casa)
    const plist = posix.join(pasta, `${rotulo}.plist`)
    d.fs.mkdirSync(pasta, { recursive: true })
    d.fs.writeFileSync(plist, plistMac({ ...base, rotulo }))
    const alvo = `gui/${d.uid()}`
    d.executar('launchctl', ['bootout', alvo, plist], { encoding: 'utf8' }) // recadastro: tira o antigo, erro aqui e normal
    const r = d.executar('launchctl', ['bootstrap', alvo, plist], { encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`o launchd recusou: ${(r.stderr || '').trim()}`)
    if (d.executar('launchctl', ['print', `${alvo}/${rotulo}`], { encoding: 'utf8' }).status !== 0) {
      throw new Error('a tarefa nao apareceu no launchd depois de cadastrada')
    }
    anotarNoLivro(d, receita.nome, 'agendado')
    return { tarefa: rotulo }
  }

  throw new Error('por enquanto o /agendar funciona so no Windows e no Mac')
}

export async function removerRobo(nome, deps) {
  const d = dependencias(deps)
  if (d.plataforma === 'win32') {
    // Confere antes se a tarefa existe, em vez de ler a mensagem de erro do Unregister, que
    // muda com o idioma do Windows. Existe so se alguma linha for exatamente o nome da tarefa
    // (mesmo criterio do listar): aviso no stderr vem junto na saida e nao conta.
    const nomeDaTarefa = nomeTarefa(d.raiz, nome)
    const tarefa = aspasPs(nomeDaTarefa)
    const achou = rodarPs(d.executar, consultaTarefas(`-eq ${tarefa}`))
    if (!achou.ok) throw new Error(`nao consegui ler o agendador do Windows: ${achou.saida}`)
    if (!achou.saida.split(/\r?\n/).some((l) => l.trim() === nomeDaTarefa)) return { removido: false }
    const r = rodarPs(d.executar, `Unregister-ScheduledTask -TaskName ${tarefa} -Confirm:$false`)
    if (!r.ok) throw new Error(`o agendador do Windows recusou: ${r.saida}`)
    anotarNoLivro(d, nome, 'removido')
    return { removido: true }
  }
  if (d.plataforma === 'darwin') {
    const rotulo = rotuloMac(d.raiz, nome)
    const plist = posix.join(pastaAgentes(d.casa), `${rotulo}.plist`)
    const r = d.executar('launchctl', ['bootout', `gui/${d.uid()}`, plist], { encoding: 'utf8' })
    const existia = d.fs.existsSync(plist)
    if (existia) d.fs.unlinkSync(plist)
    const removido = r.status === 0 || existia
    if (removido) anotarNoLivro(d, nome, 'removido')
    return { removido }
  }
  throw new Error('por enquanto o /agendar funciona so no Windows e no Mac')
}

export async function listarRobos(deps) {
  const d = dependencias(deps)
  let tarefas = []
  let prefixo
  if (d.plataforma === 'win32') {
    prefixo = nomeTarefa(d.raiz, '')
    const r = rodarPs(d.executar, consultaTarefas(`-like ${aspasPs(prefixo + '*')}`))
    // Projeto sem robo nenhum sai 0 com saida vazia: so falha aqui quem nao conseguiu nem
    // chamar o powershell.
    if (!r.ok) throw new Error(`nao consegui ler o agendador do Windows: ${r.saida}`)
    tarefas = r.saida.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith(prefixo))
  } else if (d.plataforma === 'darwin') {
    prefixo = rotuloMac(d.raiz, '')
    const pasta = pastaAgentes(d.casa)
    tarefas = d.fs.existsSync(pasta)
      ? d.fs.readdirSync(pasta).filter((f) => f.startsWith(prefixo) && f.endsWith('.plist')).map((f) => f.slice(0, -'.plist'.length))
      : []
  } else {
    throw new Error('por enquanto o /agendar funciona so no Windows e no Mac')
  }
  const linhas = lerRegistro(caminhoLivro(d.raiz))
  return tarefas.map((tarefa) => {
    const nome = tarefa.slice(prefixo.length)
    // agendar e remover nao sao rodada: mostra a ultima rodada de verdade
    const ultima = linhasDo(linhas, nome).filter((l) => !MARCAS_DO_AGENDADOR.includes(l.resultado)).at(-1) || null
    return { nome, tarefa, ultima }
  })
}

const MARCAS_DO_AGENDADOR = ['agendado', 'removido']
const RODADAS = ['feito', 'pulou:acesso', 'falhou']
const linhasDo = (linhas, nome) => linhas.filter((l) => l.robo === nome)
const dataDa = (linha) => linha.chave.split(':')[1]

const DIA_MS = 24 * 60 * 60_000
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS)

// Robo que parou de rodar sem ninguem perceber: PC trocado, pasta renomeada, sessao fechada.
// O agendador nao avisa disso, entao o /iniciar pergunta aqui. Tudo sai do livro: robo tirado
// (ultima linha 'removido') nao conta, e o prazo corre da rodada ou do agendamento mais
// recente. Receita sem nenhuma das duas nunca foi agendada pelo /agendar e fica de fora.
export async function robosAtrasados({ raiz = RAIZ, agora = new Date() } = {}) {
  const pasta = join(raiz, 'robos')
  if (!existsSync(pasta)) return []
  const linhas = lerRegistro(caminhoLivro(raiz))
  const hoje = dataLocal(agora)
  const lista = []
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.mjs')).sort()) {
    let receita
    try {
      receita = await carregarReceita(join(pasta, arquivo))
    } catch (e) {
      const nome = basename(arquivo, '.mjs')
      const doRobo = linhasDo(linhas, nome)
      if (doRobo.at(-1)?.resultado === 'removido') continue
      const rodada = doRobo.filter((l) => RODADAS.includes(l.resultado)).at(-1)
      lista.push({ nome, desde: rodada ? dataDa(rodada) : 'nunca rodou', motivo: `receita com erro: ${e.message}` })
      continue
    }
    const doRobo = linhasDo(linhas, receita.nome)
    if (doRobo.at(-1)?.resultado === 'removido') continue
    const referencia = doRobo.filter((l) => RODADAS.includes(l.resultado) || l.resultado === 'agendado').at(-1)
    if (!referencia) continue
    const desde = dataDa(referencia)
    const limite = receita.quando.tipo === 'semanal' ? 7 : 1
    if (diasEntre(desde, hoje) <= limite) continue
    const rodou = doRobo.some((l) => RODADAS.includes(l.resultado))
    lista.push(rodou ? { nome: receita.nome, desde } : { nome: receita.nome, desde, nuncaRodou: true })
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome))
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const [cmd, arg] = process.argv.slice(2)
  try {
    if (cmd === 'registrar' && arg) {
      console.log(`agendado: ${(await registrarRobo(arg)).tarefa}`)
    } else if (cmd === 'remover' && arg) {
      console.log((await removerRobo(arg)).removido ? `removido: ${arg}` : `nao achei o robo ${arg} no agendador`)
    } else if (cmd === 'listar') {
      const lista = await listarRobos()
      if (!lista.length) console.log('nenhum robo agendado neste projeto')
      for (const i of lista) {
        const ultima = i.ultima ? `${i.ultima.resultado} em ${i.ultima.chave.split(':')[1]}` : 'ainda nao rodou'
        console.log(`${i.nome}: ultima rodada ${ultima}`)
      }
    } else if (cmd === 'atrasados') {
      const lista = await robosAtrasados()
      if (!lista.length) console.log('nenhum robo atrasado')
      for (const i of lista) {
        if (i.motivo) console.log(`${i.nome}: ${i.motivo}`)
        else console.log(i.nuncaRodou ? `${i.nome}: agendado em ${i.desde} e ainda não rodou` : `${i.nome}: não roda desde ${i.desde}`)
      }
    } else {
      console.error('uso: node agendador.mjs registrar <robos/nome.mjs> | remover <nome> | listar | atrasados')
      process.exitCode = 2
    }
  } catch (e) {
    console.error(`agendador: ${e.message}`)
    process.exitCode = 1
  }
}
