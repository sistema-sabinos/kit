// CLI fino pra skill rodar os scripts do motor (os .py e o transcrever.mjs) sem escrever o comando do interpretador
// na mao: quem escolhe o lancador do sistema ou o ambiente do video e o modulo de plataforma. O script e procurado so em
// <_video>/motor/scripts/ (a copia que tem os node_modules); nome com pasta ou ".." e recusado.
// Tambem entrega aos scripts as pastas das ferramentas (WHISPER_DIR, DEEP_FILTER, DEPTH_MODELO), que moram em
// <_video>/ferramentas/.
//
// uso: node .claude/skills/editar-video/scripts/py.mjs <nome-do-script.py|.mjs> [argumentos...]
// Saida: a do script. 2 = nome invalido. 3 = o motor ainda nao esta no _video (rodar /configurar-video).
import { existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { caminhos, pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'
import { exe, rodarPython } from '../../configurar-video/scripts/lib/plataforma.mjs'

export class ErroPy extends Error {
  constructor(mensagem, codigo = 1) { super(mensagem); this.codigo = codigo }
}

const NOME_VALIDO = /^[A-Za-z0-9_-]+\.(py|mjs)$/

// Argumento que parece caminho (tem ponto ou barra) e nao e opcao: vira absoluto, porque o .mjs roda em outra pasta.
const pareceCaminho = (a) => !String(a).startsWith('-') && /[./]/.test(String(a)) && !/^\d+([.,]\d+)?$/.test(String(a))

export function rodarScript({ nome, args = [], raiz = RAIZ, base, plat = process.platform, executar = spawnSync, env = process.env, existe = existsSync }) {
  if (!nome || !NOME_VALIDO.test(nome)) {
    throw new ErroPy(`nome de script invalido: "${nome ?? ''}". Use so o nome do arquivo (como blocos.py), sem pasta.`, 2)
  }
  const bas = base ?? pastaVideo({ raiz })
  const c = caminhos(bas)
  const script = join(c.motor, 'scripts', nome)
  if (!existe(script)) {
    throw new ErroPy(`nao achei ${script}. O motor de video ainda nao esta instalado nesta maquina: rode /configurar-video.`, 3)
  }
  const modeloProfundidade = join(c.ferramentas, 'depth', 'model.onnx')
  mkdirSync(c.tmp, { recursive: true })
  const ambiente = {
    ...env,
    PYTHONUTF8: '1',            // acento certo no console do Windows (cp1252 por padrao)
    PYTHONIOENCODING: 'utf-8',
    // arquivo temporario no _video: a pasta temporaria do usuario pode ter espaco no caminho
    TEMP: c.tmp,
    TMP: c.tmp,
    WHISPER_DIR: env.WHISPER_DIR || join(c.ferramentas, 'whisper.cpp'),
    DEEP_FILTER: env.DEEP_FILTER || join(c.ferramentas, 'deep-filter', exe('deep-filter', plat)),
    ...(env.DEPTH_MODELO || !existe(modeloProfundidade) ? {} : { DEPTH_MODELO: modeloProfundidade }),
  }
  if (nome.endsWith('.py')) {
    return rodarPython(script, args, { plat, base: bas, executar, env: ambiente, stdio: 'inherit' })
  }
  // O Remotion grava uma pasta "tmp" no lugar de onde roda: por isso o .mjs roda em <_video>/tmp (sem espaco).
  const absolutos = args.map((a) => (pareceCaminho(a) && !isAbsolute(a) ? resolve(raiz, a) : a))
  return executar(process.execPath, [script, ...absolutos], { cwd: c.tmp, env: ambiente, stdio: 'inherit', encoding: 'utf8' })
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const [nome, ...args] = process.argv.slice(2)
    const r = rodarScript({ nome, args })
    if (typeof r.stdout === 'string') process.stdout.write(r.stdout)
    if (typeof r.stderr === 'string') process.stderr.write(r.stderr)
    if (r.error) throw new ErroPy(`nao consegui rodar o script: ${r.error.message}`)
    process.exit(r.status ?? 1)
  } catch (e) {
    console.error(e.message)
    process.exit(e.codigo ?? 1)
  }
}
