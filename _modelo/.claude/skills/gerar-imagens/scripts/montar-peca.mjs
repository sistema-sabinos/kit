// Peca com texto: um HTML vira JPG ou PNG. Texto que precisa estar certo (dose,
// medida, ficha, chamada da foto) se monta aqui e nunca e desenhado pela IA: a
// IA come acento, troca letra e ja inventou codigo de barras de produto real.
// Uso: node .claude/skills/gerar-imagens/scripts/montar-peca.mjs --html <peca.html> --out <saida.jpg> [--largura 1200] [--altura 1200]
// O HTML abre por file://, entao imagem com caminho relativo funciona. Letra: so
// as embutidas (Manrope, Fredoka, Lora), pelo nome e peso, sem caminho; outra
// letra, ou uma que nao carregou, para a peca com aviso.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fotografar } from './lib/render.mjs'
import { cssFontes, conferirFontes } from './lib/fontes.mjs'
import { lerArgs, numero } from './lib/args.mjs'

export async function montarPeca({ html, out, largura = 1200, altura = largura, foto = fotografar }) {
  if (!html || !out) throw new Error('faltou --html ou --out')
  const abs = resolve(html)
  if (!existsSync(abs)) throw new Error(`nao achei o HTML ${abs}`)
  await foto(pathToFileURL(abs).href, { saida: resolve(out), largura, altura, css: cssFontes(), conferir: conferirFontes })
  return { ok: true, out, largura, altura, custo_usd: 0 }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const a = lerArgs(process.argv.slice(2))
    const largura = numero(a, 'largura', 1200, { min: 500, max: 4000 })
    const altura = numero(a, 'altura', largura, { min: 500, max: 4000 })
    console.log(JSON.stringify(await montarPeca({ html: a.html, out: a.out, largura, altura })))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
