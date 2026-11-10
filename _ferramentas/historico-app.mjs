#!/usr/bin/env node
// Historico de 30 dias do app (5.54, C4, decisao 6): grava desktopSessionCleanupPeriodDays: 30 no
// ~/.claude/settings.json do usuario, nunca no do projeto (a chave vale so no settings do usuario
// ou no gerenciado). Sem ela o app guarda as conversas sem prazo. Chamado no fim do /setup e do
// /atualizar-kit e no aplicar do atualizar-projeto.mjs (depois do sim do /atualizar-sabinos).
// Preserva as outras chaves; valor diferente de 30 vira 30; com 30 ja gravado o arquivo fica como
// estava. JSON quebrado sai 2 sem gravar.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CHAVE = 'desktopSessionCleanupPeriodDays'
export const DIAS = 30

// Devolve { codigo, caminho, estado }: estado gravado, igual ou quebrado
export function gravarHistorico(home = homedir()) {
  const caminho = join(home, '.claude', 'settings.json')
  let atual = {}
  if (existsSync(caminho)) {
    try {
      const t = readFileSync(caminho, 'utf8')
      const sem = t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t
      // vazio nao tem configuracao a preservar: vale como {}
      atual = sem.trim() === '' ? {} : JSON.parse(sem)
    } catch { atual = null }
    if (!atual || typeof atual !== 'object' || Array.isArray(atual)) return { codigo: 2, caminho, estado: 'quebrado' }
    if (atual[CHAVE] === DIAS) return { codigo: 0, caminho, estado: 'igual' }
  }
  const novo = { ...atual, [CHAVE]: DIAS }
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(caminho, JSON.stringify(novo, null, 2) + '\n')
  return { codigo: 0, caminho, estado: 'gravado' }
}

const FRASE = {
  gravado: c => `Historico do app: 30 dias, gravado em ${c}`,
  igual: c => `Historico do app: ja estava em 30 dias em ${c}`,
  quebrado: c => `Historico do app: o ${c} tem JSON quebrado, nada foi gravado`,
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (chamadoDireto()) {
  try {
    const r = gravarHistorico()
    console.log(FRASE[r.estado](r.caminho))
    process.exitCode = r.codigo
  } catch (e) {
    console.log(`Historico do app: nao deu pra gravar (${e.code || e.message})`)
    process.exitCode = 1
  }
}
