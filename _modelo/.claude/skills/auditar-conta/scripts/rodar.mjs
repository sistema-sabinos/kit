#!/usr/bin/env node
// Porta de entrada da /auditar-conta. So le a conta: coleta, palavra-chave e diagnostico.
// Mexer em anuncio e no painel, pela pessoa, um de cada vez.
//
// Uso, da raiz do projeto:
//   node .claude/skills/auditar-conta/scripts/rodar.mjs [--dias 30] [--sem-keywords]
// Saida: dados/auditoria/snapshots/<data>.json, relatorios/auditoria-conta-<data>.md e relatorios/keywords-<data>.md
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { lerEnv } from '../../mercado-livre/scripts/lib/env.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { mlGet } from '../../mercado-livre/scripts/lib/ml-api.mjs'
import { clienteBling } from '../../mercado-livre/scripts/lib/bling-api.mjs'
import { carregarConfiguracao, CAMINHO_CONFIG } from '../../mercado-livre/scripts/lib/config.mjs'
import { lerDecisoes } from '../../mercado-livre/scripts/lib/decisoes.mjs'
import { coletar, PASTA_SNAPSHOTS } from './coletar.mjs'
import { diagnosticar } from './diagnosticar.mjs'
import { minerar, relatorio } from './keywords.mjs'

export function argumentos(argv) {
  const i = argv.indexOf('--dias')
  const dias = i >= 0 ? Number(argv[i + 1]) : 30
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) throw new Error('--dias vai de 1 a 90')
  return { dias, semKeywords: argv.includes('--sem-keywords') }
}

// A foto anterior e a mais recente com data menor que a de hoje (rodar duas vezes no dia nao
// compara a conta com ela mesma).
export function snapshotAnterior(pasta, hoje) {
  let arquivos = []
  try { arquivos = readdirSync(pasta).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < hoje).sort() } catch { return null }
  return arquivos.length ? JSON.parse(readFileSync(join(pasta, arquivos.at(-1)), 'utf8')) : null
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = argumentos(process.argv.slice(2))
    const log = m => console.error(m)
    let blingReq = null
    // sem arquivo de configuracao a auditoria sai sem custo, calada; arquivo que existe e nao se le avisa
    try { if (carregarConfiguracao().erp === 'bling') blingReq = clienteBling() } catch (e) { if (existsSync(CAMINHO_CONFIG)) log(`configuracao ilegivel, auditoria sem custo do Bling: ${e.message}`) }
    const token = await tokenMl()
    const get = caminho => mlGet(caminho, { token })
    const atual = await coletar({ get, uid: lerEnv().ML_USER_ID, dias: a.dias, blingReq, log })
    const anterior = snapshotAnterior(PASTA_SNAPSHOTS, atual.data)
    mkdirSync(PASTA_SNAPSHOTS, { recursive: true })
    writeFileSync(join(PASTA_SNAPSHOTS, `${atual.data}.json`), JSON.stringify(atual, null, 2) + '\n')
    const rel = join(RAIZ, 'relatorios')
    mkdirSync(rel, { recursive: true })
    if (!a.semKeywords) {
      try { writeFileSync(join(rel, `keywords-${atual.data}.md`), relatorio(await minerar({ itens: atual.itens, get }), atual.data)); console.log(`relatorios/keywords-${atual.data}.md`) } catch (e) { log(`palavra-chave falhou, o raio-X segue sem: ${e.message}`) }
    }
    const r = diagnosticar({ atual, anterior, decisoes: lerDecisoes(undefined, { log }) })
    writeFileSync(join(rel, `auditoria-conta-${atual.data}.md`), r.md)
    console.log(`${atual.totais.itens} anuncios, ${r.comAcao} com acao${r.reputacaoAcima ? ', REPUTACAO com metrica acima do limite' : ''}${r.naGaveta ? `, ${r.naGaveta} fora da fila por decisao` : ''}`)
    console.log(`relatorios/auditoria-conta-${atual.data}.md`)
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
