#!/usr/bin/env node
// Porta de entrada da /mercado-ads. So le: coleta, diagnostica e escreve o relatorio.
//
// Uso, da raiz do projeto:
//   node .claude/skills/mercado-ads/scripts/rodar.mjs [--dias 30]     raio-X: snapshot + relatorios/ads-<data>.md
//   node .claude/skills/mercado-ads/scripts/rodar.mjs --anunciante    setup de uma vez: grava ML_ADVERTISER_ID no .env
//   node .claude/skills/mercado-ads/scripts/rodar.mjs --promocoes     campanhas de desconto abertas pra conta, com prazo
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { lerEnv, gravarEnv } from '../../mercado-livre/scripts/lib/env.mjs'
import { tokenMl } from '../../mercado-livre/scripts/lib/tokens.mjs'
import { mlGet } from '../../mercado-livre/scripts/lib/ml-api.mjs'
import { lerDecisoes } from '../../mercado-livre/scripts/lib/decisoes.mjs'
import { coletar, descobrirAnunciante, PASTA_SNAPSHOTS } from './ads.mjs'
import { carregarFreio } from './estrategia.mjs'
import { diagnosticar } from './diagnosticar.mjs'

export function argumentos(argv) {
  if (argv.includes('--anunciante')) return { acao: 'anunciante' }
  if (argv.includes('--promocoes')) return { acao: 'promocoes' }
  const i = argv.indexOf('--dias')
  const dias = i >= 0 ? Number(argv[i + 1]) : 30
  if (!Number.isInteger(dias) || dias < 1 || dias > 90) throw new Error('--dias vai de 1 a 90')
  return { acao: 'raio-x', dias }
}

// Uma linha por campanha de desconto; `candidate` e o que a conta pode entrar e ainda nao entrou.
export function linhasDePromocao(resultados) {
  return (resultados || []).map(p => `${p.id ?? '?'} | ${p.type ?? '?'} | ${p.status ?? '?'} | ${p.name ?? ''} | adesao ate ${String(p.deadline_date ?? p.finish_date ?? '?').slice(0, 10)}`)
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = argumentos(process.argv.slice(2))
    const token = await tokenMl()
    const get = (caminho, o = {}) => mlGet(caminho, { token, ...o })
    if (a.acao === 'anunciante') {
      const patch = await descobrirAnunciante(get)
      gravarEnv(patch)
      console.log(`gravado no .env: ML_ADVERTISER_ID ${patch.ML_ADVERTISER_ID} (${patch.ML_ADVERTISER_SITE_ID})`)
    } else if (a.acao === 'promocoes') {
      const uid = lerEnv().ML_USER_ID
      if (!uid) throw new Error('falta ML_USER_ID no .env. Rode a autorizacao do Mercado Livre pelo /conectar.')
      const d = await get(`/seller-promotions/users/${uid}?app_version=v2`)
      const linhas = linhasDePromocao(d.results)
      console.log(linhas.length ? linhas.join('\n') : 'nenhuma campanha de desconto aberta pra conta agora')
    } else {
      const snap = await coletar({ get, env: lerEnv(), dias: a.dias, log: m => console.error(m) })
      mkdirSync(PASTA_SNAPSHOTS, { recursive: true })
      writeFileSync(join(PASTA_SNAPSHOTS, `${snap.data}.json`), JSON.stringify(snap, null, 2) + '\n')
      const r = diagnosticar(snap, carregarFreio(), { decisoes: lerDecisoes(undefined, { log: m => console.error(m) }) })
      mkdirSync(join(RAIZ, 'relatorios'), { recursive: true })
      writeFileSync(join(RAIZ, 'relatorios', `ads-${snap.data}.md`), r.relatorioMd)
      console.log(`${r.ativas} campanha(s) ativa(s), ${r.acoes.length} acao(oes) na fila, ${r.emVigor.length} decisao(oes) em vigor`)
      console.log(`relatorios/ads-${snap.data}.md`)
    }
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
