// Carimbo da persona testada: sha256 sobre SKILL.md, agente.md e cada ficha (em ordem de
// nome), com CRLF virado LF pra o carimbo nao mudar so por final de linha. O Passo 9 grava
// "Persona: <carimbo>" em prova/resultado.md e o instalar.mjs so instala se bater: mexeu na
// persona depois do teste de fidelidade, o carimbo muda e o teste tem que rodar de novo.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const ler = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
const fichas = dir => { try { return readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name).sort() } catch { return [] } }

export function carimboPersona(pasta) {
  const nomes = ['SKILL.md', 'agente.md', ...fichas(join(pasta, 'fichas')).map(n => `fichas/${n}`)]
  const h = createHash('sha256')
  for (const n of nomes) h.update(n + LF + ler(join(pasta, n)).split(CR + LF).join(LF) + LF)
  return h.digest('hex')
}
