import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { lerArgumentos, conferirModelo, pastaDoWhisper, instalar } from './instalar-whisper.mjs'

test('lerArgumentos: padrao small, aceita small e medium', () => {
  assert.deepEqual(lerArgumentos([]), { modelo: 'small' })
  assert.equal(lerArgumentos(['--modelo', 'medium']).modelo, 'medium')
  assert.equal(lerArgumentos(['--modelo=small']).modelo, 'small')
})

test('lerArgumentos: modelo fora de small e medium recusa', () => {
  assert.throws(() => lerArgumentos(['--modelo', 'large']), /small|medium/)
  assert.throws(() => lerArgumentos(['--modelo']), /small|medium/)
})

test('conferirModelo exige arquivo com tamanho maior que zero', () => {
  const d = mkdtempSync(join(tmpdir(), 'whisper-'))
  try {
    assert.throws(() => conferirModelo(d, 'small'), /modelo/)
    writeFileSync(join(d, 'ggml-small.bin'), '')
    assert.throws(() => conferirModelo(d, 'small'), /vazio|zero/)
    writeFileSync(join(d, 'ggml-small.bin'), 'x')
    assert.doesNotThrow(() => conferirModelo(d, 'small'))
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('pastaDoWhisper: sem WHISPER_DIR usa <_video>/ferramentas/whisper.cpp, a partir da pasta do script', () => {
  const video = join(tmpdir(), 'v-teste')
  const aqui = join(video, 'motor', 'scripts')
  assert.equal(pastaDoWhisper({ env: {}, aqui }), join(video, 'ferramentas', 'whisper.cpp'))
  assert.equal(pastaDoWhisper({ env: { WHISPER_DIR: '' }, aqui }), join(video, 'ferramentas', 'whisper.cpp'))
  assert.equal(pastaDoWhisper({ env: { WHISPER_DIR: join(tmpdir(), 'outra') }, aqui }), join(tmpdir(), 'outra'))
})

// a pasta temporaria do sistema pode ter espaco (TEMP apontando pra uma pasta com espaco); a do whisper nao pode
function baseSemEspaco() {
  const candidata = [tmpdir(), dirname(fileURLToPath(import.meta.url))].find(p => !/\s/.test(p))
  assert.ok(candidata, 'nenhuma pasta sem espaco pra montar o teste (temporaria e a do proprio teste)')
  return mkdtempSync(join(candidata, 'whisper-'))
}

// Remotion falso: guarda de onde rodou e pra onde mandaram instalar, e grava o modelo
function remotionFalso(registro) {
  return async () => ({
    installWhisperCpp: async ({ to }) => { registro.visto = process.cwd(); registro.to = to },
    downloadWhisperModel: async ({ folder }) => { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'ggml-small.bin'), 'x') },
  })
}

test('instalar com WHISPER_DIR relativo instala no mesmo lugar que ele aponta', async () => {
  const original = process.cwd()
  const base = baseSemEspaco()
  try {
    process.chdir(base)
    const registro = {}
    await instalar({ modelo: 'small', whisperDir: join('v', 'ferramentas', 'whisper.cpp'), carregar: remotionFalso(registro) })
    const esperado = join(base, 'v', 'ferramentas', 'whisper.cpp')
    assert.equal(registro.to, esperado, 'o Remotion recebeu outro caminho')
    assert.ok(existsSync(join(esperado, 'ggml-small.bin')), 'o modelo nao caiu na pasta que o WHISPER_DIR aponta')
  } finally {
    process.chdir(original)
    rmSync(base, { recursive: true, force: true })
  }
})

test('instalar roda o Remotion da pasta-mae do whisper, mesmo chamado de pasta com espaco', async () => {
  const original = process.cwd()
  const base = baseSemEspaco()
  try {
    const comEspaco = join(base, 'proj com espaco')
    mkdirSync(comEspaco)
    const whisperDir = join(base, 'v', 'ferramentas', 'whisper.cpp')
    assert.ok(!/\s/.test(whisperDir), `canario: a pasta do whisper ${whisperDir} nao pode ter espaco`)
    process.chdir(comEspaco)
    assert.ok(/\s/.test(process.cwd()), 'canario: o comando roda de pasta com espaco')
    let visto = null
    let erro = null
    try {
      await instalar({
        modelo: 'small',
        whisperDir,
        carregar: async () => ({
          installWhisperCpp: async () => { visto = process.cwd() },
          downloadWhisperModel: async ({ folder }) => { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, 'ggml-small.bin'), 'x') },
        }),
      })
    } catch (e) { erro = e }
    assert.equal(erro, null, `instalar recusou: ${erro && erro.message}`)
    assert.equal(visto, dirname(whisperDir))
    assert.ok(!/\s/.test(visto), 'o Remotion rodou de pasta com espaco')
    assert.equal(process.cwd(), comEspaco, 'o cwd nao voltou pra pasta de onde o comando roda')
  } finally {
    process.chdir(original)
    rmSync(base, { recursive: true, force: true })
  }
})
