import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rodarScript } from './py.mjs'
import { python } from '../../configurar-video/scripts/lib/plataforma.mjs'

// Monta uma raiz e um _video com o motor copiado, com um script de mentira de cada tipo.
function cenario({ comScripts = true } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'py-'))
  const raiz = join(d, 'raiz')
  const base = join(d, 'video')
  const scripts = join(base, 'motor', 'scripts')
  mkdirSync(raiz, { recursive: true })
  mkdirSync(scripts, { recursive: true })
  if (comScripts) {
    writeFileSync(join(scripts, 'blocos.py'), '# falso\n')
    writeFileSync(join(scripts, 'transcrever.mjs'), '// falso\n')
  }
  return { d, raiz, base, scripts, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

function falso(status = 0) {
  const chamadas = []
  return { chamadas, executar: (cmd, args, op) => { chamadas.push({ cmd, args, op }); return { status } } }
}

test('script .py roda pelo lancador do sistema, com o script do motor do _video e as ferramentas no ambiente', () => {
  const c = cenario()
  try {
    const f = falso(0)
    const r = rodarScript({ nome: 'blocos.py', args: ['bruto.mp4', 'saida.md', '--modelo', 'small'], raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: {} })
    assert.equal(r.status, 0)
    assert.equal(f.chamadas.length, 1)
    const p = python('win32', c.base)
    assert.equal(f.chamadas[0].cmd, p.cmd)
    assert.deepEqual(f.chamadas[0].args, [...p.base, join(c.scripts, 'blocos.py'), 'bruto.mp4', 'saida.md', '--modelo', 'small'])
    assert.equal(f.chamadas[0].op.env.WHISPER_DIR, join(c.base, 'ferramentas', 'whisper.cpp'))
    assert.match(f.chamadas[0].op.env.DEEP_FILTER, /deep-filter/)
    assert.equal(f.chamadas[0].op.stdio, 'inherit')
  } finally { c.limpar() }
})

test('o codigo de saida do script volta pra quem chamou', () => {
  const c = cenario()
  try {
    const f = falso(7)
    const r = rodarScript({ nome: 'blocos.py', raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: {} })
    assert.equal(r.status, 7)
  } finally { c.limpar() }
})

test('recusa nome com pasta, com .. ou de outro tipo, sem rodar nada', () => {
  const c = cenario()
  try {
    const barra = String.fromCharCode(92)
    for (const nome of ['../x.py', `..${barra}x.py`, 'a/b.py', `a${barra}b.py`, 'x.sh', 'x.cmd', '.py', '']) {
      const f = falso(0)
      assert.throws(
        () => rodarScript({ nome, raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: {} }),
        (e) => e.codigo === 2 && /invalido/.test(e.message),
        `devia recusar "${nome}"`,
      )
      assert.equal(f.chamadas.length, 0)
    }
  } finally { c.limpar() }
})

test('script que nao existe no motor sai 3 mandando rodar o /configurar-video', () => {
  const c = cenario({ comScripts: false })
  try {
    const f = falso(0)
    assert.throws(
      () => rodarScript({ nome: 'blocos.py', raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: {} }),
      (e) => e.codigo === 3 && /configurar-video/.test(e.message),
    )
    assert.equal(f.chamadas.length, 0)
  } finally { c.limpar() }
})

test('.mjs roda pelo node na pasta tmp do _video, com os caminhos relativos a raiz virando absolutos', () => {
  const c = cenario()
  try {
    const f = falso(0)
    rodarScript({ nome: 'transcrever.mjs', args: ['producao/x/voz.wav', 'producao/x/voz.json', 'small'], raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: {} })
    const ch = f.chamadas[0]
    assert.equal(ch.cmd, process.execPath)
    assert.deepEqual(ch.args, [join(c.scripts, 'transcrever.mjs'), join(c.raiz, 'producao', 'x', 'voz.wav'), join(c.raiz, 'producao', 'x', 'voz.json'), 'small'])
    assert.equal(ch.op.cwd, join(c.base, 'tmp'))
  } finally { c.limpar() }
})

test('variavel ja definida no ambiente vence a pasta padrao', () => {
  const c = cenario()
  try {
    const f = falso(0)
    rodarScript({ nome: 'blocos.py', raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: { WHISPER_DIR: 'pasta-do-aluno' } })
    assert.equal(f.chamadas[0].op.env.WHISPER_DIR, 'pasta-do-aluno')
  } finally { c.limpar() }
})

test('o Python roda com UTF-8 no ambiente (acento certo no console do Windows)', () => {
  const c = cenario()
  try {
    const f = falso(0)
    rodarScript({ nome: 'blocos.py', raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: {} })
    assert.equal(f.chamadas[0].op.env.PYTHONUTF8, '1')
    assert.equal(f.chamadas[0].op.env.PYTHONIOENCODING, 'utf-8')
  } finally { c.limpar() }
})

test('TEMP e TMP apontam pra <_video>/tmp (sem espaco), no .py e no .mjs, e a pasta existe', () => {
  const c = cenario()
  try {
    for (const nome of ['blocos.py', 'transcrever.mjs']) {
      const f = falso(0)
      rodarScript({ nome, raiz: c.raiz, base: c.base, plat: 'win32', executar: f.executar, env: { TEMP: 'C-com espaco', TMP: 'C-com espaco' } })
      assert.equal(f.chamadas[0].op.env.TEMP, join(c.base, 'tmp'), nome)
      assert.equal(f.chamadas[0].op.env.TMP, join(c.base, 'tmp'), nome)
    }
    assert.ok(existsSync(join(c.base, 'tmp')))
  } finally { c.limpar() }
})
