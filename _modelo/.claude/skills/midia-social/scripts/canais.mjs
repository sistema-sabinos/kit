// Descobre a organizacao e os canais ligados no Buffer e grava os ids no _contexto/midia-social.md.
// So leitura no Buffer. Uso: node .claude/skills/midia-social/scripts/canais.mjs [--gravar] [--organizacao <id>]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'
import { lerConfig, exigir } from './lib/config.mjs'
import { organizacoes, canais } from './lib/agendador-buffer.mjs'
import { gravarNoConfig } from './iniciar.mjs'

const REDES = ['instagram', 'tiktok', 'youtube']

export function escolherCanais(lista) {
  const out = { avisos: [] }
  for (const rede of REDES) {
    const daRede = lista.filter(c => c.service === rede)
    for (const c of daRede.filter(c => c.isDisconnected)) out.avisos.push(`${rede} "${c.name}" esta desconectado no Buffer: reconectar no painel`)
    const ativos = daRede.filter(c => !c.isDisconnected)
    if (ativos.length === 1) out[`canal_${rede}`] = ativos[0].id
    else if (ativos.length > 1) out.avisos.push(`${rede} tem ${ativos.length} canais (${ativos.map(c => c.name).join(', ')}): dizer qual e gravar canal_${rede} a mao`)
    else out.avisos.push(`nenhum canal de ${rede} ligado no Buffer (secao "Buffer" do guia)`)
  }
  return out
}

async function main(v) {
  const { config, env } = lerConfig()
  exigir({ config, env }, ['BUFFER_API_KEY'])
  const orgs = await organizacoes(env.BUFFER_API_KEY)
  const i = v.indexOf('--organizacao')
  const org = i >= 0 ? orgs.find(o => o.id === v[i + 1]) : orgs.length === 1 ? orgs[0] : null
  if (!org) { console.log('Mais de uma organizacao no Buffer, escolher com --organizacao <id>:\n' + orgs.map(o => `  ${o.id}  ${o.name}`).join('\n')); return }
  const r = escolherCanais(await canais(env.BUFFER_API_KEY, org.id))
  const patch = { organizacao_buffer: org.id, ...Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith('canal_'))) }
  console.log(`Organizacao: ${org.name}\n` + Object.entries(patch).map(([k, x]) => `  ${k}: ${x}`).join('\n'))
  for (const a of r.avisos) console.log('AVISO: ' + a)
  if (!v.includes('--gravar')) { console.log('\nPra gravar no _contexto/midia-social.md: repetir com --gravar'); return }
  const arq = join(RAIZ, '_contexto', 'midia-social.md')
  writeFileSync(arq, gravarNoConfig(readFileSync(arq, 'utf8'), patch))
  console.log('gravado em _contexto/midia-social.md')
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) main(process.argv.slice(2)).catch(e => { console.error('ERRO:', e.message); process.exit(1) })
