#!/usr/bin/env node
// Item 1 do /checar. Rodar da raiz do projeto:
//   node .claude/skills/checar/scripts/autonomia.mjs
// Le o _contexto/autonomia.md com o mesmo leitor que as skills usam e imprime cada defeito numa
// linha, ou "nenhum problema", ou "sem arquivo", ou "erro ao ler ..." com saida 1. Defeito que diz "todas as permissoes somem" zera o arquivo inteiro;
// os outros derrubam so a area citada.
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerAutonomia } from '../../conectar/scripts/lib/autonomia.mjs'

export function problemasAutonomia(projeto = '.') {
  let texto
  // so "nao existe" e sem arquivo; outro erro (pasta no lugar, arquivo travado) sobe pro chamador
  try { texto = readFileSync(join(projeto, '_contexto', 'autonomia.md'), 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e }
  return lerAutonomia(texto).problemas.map(p => (p.area ? p.area + ': ' : '') + p.codigo + ': ' + p.mensagem)
}

// Compara os caminhos reais, como o skills-repetidas.mjs: chamado por juncao ou link, o argv vem com o atalho.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  let r
  try { r = problemasAutonomia() } catch (e) {
    console.log('erro ao ler o _contexto/autonomia.md: ' + (e.code || e.message))
    process.exit(1)
  }
  console.log(r === null ? 'sem arquivo' : r.length ? r.join('\n') : 'nenhum problema')
}
