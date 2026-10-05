// Primeira configuracao do pacote: grava _contexto/midia-social.md e cria as gavetas do aluno a partir dos moldes.
// Nunca sobrescreve: o que o aluno ja preencheu fica, e o que falta e criado.
// Uso: node .claude/skills/midia-social/scripts/iniciar.mjs --modo loja|pessoal --perfil <nome> [--ritmo 3]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'

const MOLDES = join(dirname(fileURLToPath(import.meta.url)), '..', 'moldes')
const CRASES = '`'.repeat(3)

export function textoDoConfig({ modo, perfil, ritmo }) {
  return [
    '# Midia social, configuracao', '',
    'Quem preenche e o /midia-social. Pode mudar a mao: uma chave por linha, dentro do bloco abaixo.', '',
    CRASES + 'config',
    `modo: ${modo}            # loja | pessoal`,
    `perfil: ${perfil}        # pasta em perfis/`,
    `ritmo: ${ritmo}          # posts por semana que a /pauta sugere`,
    'deposito: cloudinary     # cloudinary | r2',
    'categoria_youtube: 22    # categoria do Short no YouTube',
    CRASES, '',
  ].join('\r\n')
}

export function gravarNoConfig(texto, patch) {
  const fim = texto.includes('\r\n') ? '\r\n' : '\n'
  const m = /```config\r?\n([\s\S]*?)```/.exec(texto)
  if (!m) throw new Error('_contexto/midia-social.md sem o bloco config: rodar /midia-social de novo')
  const vistas = new Set()
  const linhas = m[1].split(/\r?\n/).filter((l, i, a) => i < a.length - 1 || l !== '').map(l => {
    const k = l.replace(/#.*$/, '').split(':')[0].trim()
    if (k in patch) { vistas.add(k); return `${k}: ${patch[k]}` }
    return l
  })
  for (const [k, v] of Object.entries(patch)) if (!vistas.has(k)) linhas.push(`${k}: ${v}`)
  const bloco = '```config' + fim + linhas.join(fim) + fim + '```'
  return texto.slice(0, m.index) + bloco + texto.slice(m.index + m[0].length)
}

function listar(dir, base = dir) {
  return readdirSync(dir).flatMap(n => statSync(join(dir, n)).isDirectory() ? listar(join(dir, n), base) : [relative(base, join(dir, n)).split('\\').join('/')])
}

export function iniciar({ raiz = RAIZ, modo, perfil, ritmo = 3, moldes = MOLDES }) {
  if (!['loja', 'pessoal'].includes(modo)) throw new Error('modo precisa ser loja ou pessoal')
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(perfil || '')) throw new Error('perfil so com letra, numero, ponto, traco ou sublinhado (vira nome de pasta)')
  const criados = [], mantidos = []
  const gravar = (rel, conteudo) => {
    const alvo = join(raiz, rel)
    if (existsSync(alvo)) { mantidos.push(rel); return }
    mkdirSync(dirname(alvo), { recursive: true })
    writeFileSync(alvo, conteudo)
    criados.push(rel)
  }
  gravar('_contexto/midia-social.md', textoDoConfig({ modo, perfil, ritmo }))
  for (const rel of listar(moldes)) {
    let destino = rel.replace(/^perfis\/_perfil\//, `perfis/${perfil}/`)
    const est = /estrategia-(loja|pessoal)\.md$/.exec(rel)
    if (est) { if (est[1] !== modo) continue; destino = destino.replace(/estrategia-(loja|pessoal)\.md$/, 'estrategia.md') }
    gravar(destino, readFileSync(join(moldes, rel)))
  }
  return { criados, mantidos }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const v = process.argv.slice(2)
  const op = n => { const i = v.indexOf(`--${n}`); return i >= 0 ? v[i + 1] : undefined }
  try {
    const r = iniciar({ modo: op('modo'), perfil: op('perfil'), ritmo: Number(op('ritmo') || 3) })
    console.log(`criados: ${r.criados.length}\n${r.criados.map(c => '  ' + c).join('\n')}`)
    if (r.mantidos.length) console.log(`ja existiam e ficaram como estavam: ${r.mantidos.length}\n${r.mantidos.map(c => '  ' + c).join('\n')}`)
  } catch (e) { console.error('ERRO:', e.message); process.exit(1) }
}
