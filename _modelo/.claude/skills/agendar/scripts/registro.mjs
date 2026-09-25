// Livro de rodadas dos robos (robos/execucoes.jsonl) e trava contra rodada dupla.
//
// O livro e o que torna o robo seguro de disparar duas vezes: o agendador roda no horario
// e roda de novo a rodada perdida quando o computador liga. A chave "nome:data" diz se o
// dia ja fechou. 'feito' e 'pulou:acesso' fecham o dia; 'falhou' nao fecha, e a proxima
// disparada do mesmo dia tenta de novo.
//
// A trava mora na pasta temporaria do sistema (fora do projeto, longe do backup no GitHub)
// e segura a segunda disparada que chega enquanto a primeira ainda roda.
import { appendFileSync, readFileSync, existsSync, mkdirSync, writeFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

export const RESULTADOS_QUE_FECHAM_O_DIA = ['feito', 'pulou:acesso']

export function dataLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function chaveDa(nome, data) {
  return `${nome}:${data}`
}

export function lerRegistro(caminho) {
  if (!existsSync(caminho)) return []
  const linhas = []
  for (const l of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    if (!l.trim()) continue
    // linha cortada por queda no meio da gravacao nao pode derrubar o robo
    try { linhas.push(JSON.parse(l)) } catch {}
  }
  return linhas
}

export function jaRodou(caminho, chave) {
  return lerRegistro(caminho).some((l) => l.chave === chave && RESULTADOS_QUE_FECHAM_O_DIA.includes(l.resultado))
}

export function registrar(caminho, linha) {
  mkdirSync(dirname(caminho), { recursive: true })
  appendFileSync(caminho, JSON.stringify(linha) + '\n')
}

export function ultimaDe(caminho, nome) {
  const doRobo = lerRegistro(caminho).filter((l) => l.robo === nome)
  return doRobo.length ? doRobo[doRobo.length - 1] : null
}

export function caminhoTrava(raiz, nome, pasta = tmpdir()) {
  const h = createHash('sha1').update(`${raiz}|${nome}`).digest('hex').slice(0, 12)
  return join(pasta, `sabinos-robo-${h}.lock`)
}

// Trava com mais que o dobro do prazo e de rodada que morreu sem soltar (PC desligado no
// meio, processo morto): sai, e a rodada nova entra.
export function travar(caminho, prazoMs, agora = Date.now()) {
  let removeuVelha = false
  try {
    writeFileSync(caminho, String(process.pid), { flag: 'wx' })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
    if (agora - statSync(caminho).mtimeMs <= 2 * prazoMs) return { ok: false }
    unlinkSync(caminho)
    removeuVelha = true
    writeFileSync(caminho, String(process.pid), { flag: 'wx' })
  }
  return { ok: true, removeuVelha, soltar: () => { try { unlinkSync(caminho) } catch {} } }
}
