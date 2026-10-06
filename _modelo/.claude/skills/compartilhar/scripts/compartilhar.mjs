#!/usr/bin/env node
// Partes mecanicas da /compartilhar. Rodar da raiz do projeto.
//   node .claude/skills/compartilhar/scripts/compartilhar.mjs varrer <pasta>
//     segredo dentro da pasta (sai 2 se achou; a skill para)
//   node .claude/skills/compartilhar/scripts/compartilhar.mjs decisoes <pasta> <etiqueta>
//     copia as entradas [etiqueta] do _memoria/decisoes.md pro decisoes.md da pasta
//   node .claude/skills/compartilhar/scripts/compartilhar.mjs conferir <pasta>
//     caminho que sai da pasta (../) ou absoluto (E:/, /Users/) num texto dela (.md, script,
//     configuracao), ou link quebrado: tudo que falha fora do projeto (sai 1 se achou)
//   erro de uso sai 3, pra nunca se confundir com o 2 de "achou segredo"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lerDecisoes, alvosDe, varrerSegredos, dataLocal } from '../../faxina/scripts/faxina.mjs'

const eol = txt => ((txt.match(/\r\n/g) || []).length * 2 > (txt.match(/\n/g) || []).length ? '\r\n' : '\n')

export function varrer(pasta) {
  const envs = readdirSync(pasta, { recursive: true }).map(String).filter(p => /(^|[\\/])\.env/.test(p) && !p.endsWith('.env.example')).map(p => p.split(sep).join('/'))
  const ilegiveis = []
  const naoVarridos = []
  return { segredos: varrerSegredos(pasta, ilegiveis, naoVarridos), envs, ilegiveis, naoVarridos }
}

// etiqueta e o ultimo pedaco do caminho da pasta: "[projeto] clientes/acme", "[acme]" e "acme" viram "acme"
export function nomeDaEtiqueta(etiqueta) {
  const sem = etiqueta.trim().replace(/^\[projeto\]\s*/i, '').replace(/^\[|\]$/g, '')
  return sem.split(/[\\/]/).filter(Boolean).pop() || sem
}

export function extrairDecisoes(raiz, pasta, etiqueta, hoje = dataLocal()) {
  const origem = join(raiz, '_memoria', 'decisoes.md')
  if (!existsSync(origem)) return { copiadas: 0, jaEstavam: 0, paraConferir: [] }
  etiqueta = nomeDaEtiqueta(etiqueta)
  const txt = readFileSync(origem, 'utf8')
  const todas = lerDecisoes(txt)
  const tag = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // [acme], [projeto] acme ou [projeto] clientes/acme, seguido de : espaco , ) ou fim de linha
  // (nunca \b: acme casaria acme-2)
  const tagRe = new RegExp(`\\[${tag}\\]|\\[projeto\\]\\s+(?:[^\\s\\]]*/)?${tag}(?=[:\\s,)]|$)`, 'i')
  const primeira = e => e.texto.split('\n')[0]
  const selecionadas = todas.filter(e => tagRe.test(primeira(e)))
  // decisao de fora da pasta que troca uma da pasta: a pessoa decide se vai junto
  // casa a data e, quando citado, o trecho: decisao de outro assunto do mesmo dia fica de fora
  const paraConferir = todas.filter(e => !selecionadas.includes(e) && e.subs.some(s => alvosDe(todas, s, e).some(a => selecionadas.includes(a)))).map(primeira)
  const destino = join(pasta, 'decisoes.md')
  const atual = existsSync(destino) ? readFileSync(destino, 'utf8') : ''
  const novas = selecionadas.filter(e => !atual.replace(/\r\n/g, '\n').includes(e.texto))
  if (!novas.length) return { copiadas: 0, jaEstavam: selecionadas.length, paraConferir }
  if (!atual) {
    const nl = eol(txt)
    const cabeca = [
      `# Decisões de ${etiqueta}`, '',
      `Trazidas do \`_memoria/decisoes.md\` do projeto em ${hoje}. Só acréscimo: decisão que muda vira entrada nova com \`substitui: AAAA-MM-DD\`.`, '', '',
    ].join(nl)
    writeFileSync(destino, cabeca + novas.map(e => e.texto.split('\n').join(nl)).join(nl + nl) + nl)
  } else {
    const atualNl = eol(atual)
    let atualTrimmed = atual
    if (atualNl === '\r\n') {
      atualTrimmed = atual.replace(/(\r\n)+$/, '')
    } else {
      atualTrimmed = atual.replace(/\n+$/, '')
    }
    const sep2 = atualNl + atualNl
    const content = novas.map(e => e.texto.split('\n').join(atualNl)).join(atualNl + atualNl)
    writeFileSync(destino, atualTrimmed + sep2 + content + atualNl)
  }
  return { copiadas: novas.length, jaEstavam: selecionadas.length - novas.length, paraConferir }
}

export function conferir(pasta) {
  const fora = []
  const andar = dir => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      let st
      // link quebrado (pasta movida no Windows) quebra igual do outro lado: aponta
      try { st = statSync(p) } catch { fora.push({ arquivo: relative(pasta, p).split(sep).join('/'), linha: 0, motivo: 'link quebrado' }); continue }
      if (st.isDirectory()) {
        if (nome === '.git' || nome === 'node_modules') continue
        // de .claude/ so as skills, que viajam com a pasta e podem citar caminho do
        // projeto-pai; a syncar e a copia do kit que a propria /compartilhar traz
        if (nome === '.claude') { if (existsSync(join(p, 'skills'))) andar(join(p, 'skills')); continue }
        if (nome === 'syncar' && dir.endsWith(join('.claude', 'skills'))) continue
        andar(p)
        continue
      }
      // tudo que a skill da pasta pode usar: instrucao, script e configuracao
      if (!/\.(md|mjs|cjs|js|json|ya?ml|txt|sh|ps1|py)$/.test(nome)) continue
      readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
        // ../ sai da pasta; E:/ ou E:\ e /Users/, /home/, /c/Users/ sao caminho absoluto desta maquina
        if (/(^|[\s(`'"])\.\.[\\/]/.test(l) || /(^|[^A-Za-z0-9])[A-Za-z]:[\\/]/.test(l) || /(^|[\s(`'"])(\/c)?\/(Users|home)\//.test(l)) fora.push({ arquivo: relative(pasta, p).split(sep).join('/'), linha: i + 1 })
      })
    }
  }
  andar(pasta)
  return fora
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, pasta, etiqueta] = process.argv.slice(2)
  if (!pasta || !existsSync(pasta)) { console.error('uso: compartilhar.mjs varrer|decisoes|conferir <pasta> [etiqueta]'); process.exitCode = 3 }
  else if (cmd === 'varrer') {
    const r = varrer(pasta)
    console.log(JSON.stringify(r, null, 1))
    if (r.segredos.length || r.envs.length) process.exitCode = 2
  } else if (cmd === 'decisoes' && etiqueta) console.log(JSON.stringify(extrairDecisoes(process.cwd(), pasta, etiqueta)))
  else if (cmd === 'conferir') {
    const r = conferir(pasta)
    console.log(JSON.stringify(r, null, 1))
    if (r.length) process.exitCode = 1
  } else { console.error('comando desconhecido (ou decisoes sem etiqueta)'); process.exitCode = 3 }
}
