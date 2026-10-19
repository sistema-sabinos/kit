// Gera os efeitos sonoros basicos do SabinOS na biblioteca do aluno, por formula (seno e envelope do ffmpeg).
// Nenhum arquivo de terceiro entra: o som nasce aqui, entao nao tem licenca de ninguem pra conferir.
// Nunca sobrescreve: som que ja existe fica como esta, e o registro.md so ganha a linha do que foi gerado agora.
//
// uso: node gerar-sfx.mjs [--pasta <_video>/midia/biblioteca/sfx]
// Sai 1 se o ffmpeg falhar, dizendo em qual som.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { caminhos, pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'

export const FONTE = 'gerado pelo SabinOS (gerar-sfx.mjs)'
export const PICO_DB = -3
const CAB = ['| Arquivo | Nome | Duração | Uso | Fonte |', '|---|---|---|---|---|']

// So os dois que passaram no ouvido (decisao 6 da 5.17); whoosh, impacto, toc e risca sairam estranhos e ficam com a
// biblioteca do aluno. fonte: entrada lavfi do ffmpeg; filtros: o que vem depois. Uso casa com a coluna Momento do som.md.
export const SONS = [
  { arquivo: 'pop.wav', nome: 'Pop', uso: 'Cartão, número ou palavra-chave entrando',
    fonte: "aevalsrc='sin(2*PI*(500*t+700*(1-exp(-60*t))/60))*exp(-30*t)':s=48000:d=0.15",
    filtros: 'afade=t=in:d=0.003,lowpass=f=4000' },
  { arquivo: 'acende.wav', nome: 'Acende (duas notas)', uso: 'Revelação, antes do número que importa (é o ding: no máximo 2 por vídeo)',
    fonte: "aevalsrc='0.5*sin(2*PI*660*t)*exp(-14*t)+0.5*sin(2*PI*990*(t-0.11))*exp(-7*(t-0.11))*gte(t,0.11)':s=48000:d=0.6",
    filtros: 'afade=t=in:d=0.003,lowpass=f=5000,afade=t=out:st=0.5:d=0.1' },
]

function ff(executar, args, rotulo) {
  const r = executar('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8' })
  if (!r || r.status !== 0) throw new Error(`o ffmpeg falhou em ${rotulo}. ${String((r && (r.stderr || r.error)) || '').slice(-400)}`)
  return r
}

export function picoDb(executar, arquivo) {
  const r = ff(executar, ['-i', arquivo, '-af', 'volumedetect', '-f', 'null', '-'], 'medir ' + arquivo)
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr)
  if (!m) throw new Error('nao achei o pico de ' + arquivo)
  return Number(m[1])
}

export function duracaoSeg(executar, arquivo) {
  const r = executar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', arquivo], { encoding: 'utf8' })
  return Number(String(r.stdout).trim())
}

const virgula = (s) => s.toFixed(2).replace('.', ',') + ' s'

export function gerarSfx({ pasta, executar = spawnSync }) {
  mkdirSync(pasta, { recursive: true })
  const gerados = [], pulados = []
  const registro = join(pasta, 'registro.md')
  const linha = (s) => `| ${s.arquivo} | ${s.nome} | ${s.duracao} | ${s.uso} | ${FONTE} |`
  // grava a linha logo que o som nasce: falha no som seguinte nao deixa este sem registro
  const registrar = (s) => {
    const atual = existsSync(registro) ? readFileSync(registro, 'utf8') : null
    if (atual === null) return writeFileSync(registro, [...CAB, linha(s)].join('\n') + '\n')
    if (atual.includes(`| ${s.arquivo} |`)) return
    const fim = atual.includes('\r\n') ? '\r\n' : '\n'
    appendFileSync(registro, (atual.endsWith('\n') ? '' : fim) + linha(s) + fim)
  }
  for (const s of SONS) {
    const alvo = join(pasta, s.arquivo)
    if (existsSync(alvo)) { pulados.push(s.arquivo); continue }
    const bruto = alvo + '.bruto.wav'
    try {
      ff(executar, ['-y', '-v', 'error', '-f', 'lavfi', '-i', s.fonte, '-af', s.filtros, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', bruto], s.arquivo)
      const ganho = (PICO_DB - picoDb(executar, bruto)).toFixed(2)
      ff(executar, ['-y', '-v', 'error', '-i', bruto, '-af', `volume=${ganho}dB`, '-c:a', 'pcm_s16le', alvo + '.tmp.wav'], s.arquivo)
      renameSync(alvo + '.tmp.wav', alvo)
    } finally {
      rmSync(bruto, { force: true })
      rmSync(alvo + '.tmp.wav', { force: true })
    }
    const feito = { ...s, duracao: virgula(duracaoSeg(executar, alvo)) }
    registrar(feito)
    gerados.push(feito)
  }
  return { gerados: gerados.map((s) => s.arquivo), pulados, registro }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const { values } = parseArgs({ options: { pasta: { type: 'string' } } })
    const pasta = values.pasta ?? join(caminhos(pastaVideo()).midia, 'biblioteca', 'sfx')
    const r = gerarSfx({ pasta })
    console.log(`Efeitos em ${pasta}: ${r.gerados.length} gerado(s)${r.gerados.length ? ' (' + r.gerados.join(', ') + ')' : ''}, ${r.pulados.length} que já existia(m) ficaram como estavam. Registro: ${r.registro}`)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
