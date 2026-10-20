// Teste do transcrever.py com o faster-whisper falso (PYTHONPATH): a lingua fica com o whisper e vai
// no topo do .txt. N15 da varredura da 5.19: o language="pt" fixo estragava video gringo calado.
// Rodar: node --test transcrever.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// O mesmo Python do plataforma.mjs da /configurar-video, escrito aqui: a /pauta (midia-social) nao
// depende do pacote de video, e import de la quebraria no projeto sem ele (5.20, chat 5)
function python(plat = process.platform) {
  if (plat === 'win32') return { cmd: 'py', base: ['-3.12'] }
  return { cmd: plat === 'darwin' ? 'python3.12' : 'python3', base: [] }
}

const SCRIPT = fileURLToPath(new URL('./transcrever.py', import.meta.url))
const NL = String.fromCharCode(10)

// Whisper falso: anota os parametros recebidos e devolve a fala em ingles, com a lingua detectada
const WHISPER = [
  'import json, os',
  'class _Seg:',
  '    def __init__(self, text):',
  '        self.text = text',
  'class _Info:',
  '    def __init__(self, language):',
  '        self.language = language',
  'class WhisperModel:',
  '    def __init__(self, *a, **k):',
  '        pass',
  '    def transcribe(self, audio, **k):',
  '        with open(os.environ["FALSO_REGISTRO"], "w", encoding="utf-8") as f:',
  '            json.dump(k, f)',
  '        return iter([_Seg(" Buy one, "), _Seg("get one free. ")]), _Info("en")',
].join(NL)

test('a lingua nao vai fixa: o whisper detecta en e ela sai no topo do .txt, com o texto como veio', () => {
  const d = mkdtempSync(join(tmpdir(), 'pauta-transcrever-'))
  try {
    const stubs = join(d, 'stubs')
    mkdirSync(stubs)
    writeFileSync(join(stubs, 'faster_whisper.py'), WHISPER)
    writeFileSync(join(d, 'reel.mp4'), '')
    const env = { ...process.env, PYTHONPATH: stubs, FALSO_REGISTRO: join(d, 'registro.json') }
    const p = python()
    const r = spawnSync(p.cmd, [...p.base, SCRIPT, join(d, 'reel.mp4')], { env, cwd: d, encoding: 'utf8', timeout: 60000 })
    assert.ifError(r.error)
    assert.ok(r.stdout.length > 0, `saida veio vazia: ${r.stderr}`)
    assert.equal(r.status, 0, r.stderr)
    const parametros = JSON.parse(readFileSync(join(d, 'registro.json'), 'utf8'))
    assert.equal('language' in parametros, false, `language foi fixo: ${JSON.stringify(parametros)}`)
    // write_text do Python grava CRLF no Windows e LF no Mac: compara por linha
    assert.deepEqual(readFileSync(join(d, 'reel.txt'), 'utf8').split(/\r?\n/), ['lingua: en', '', 'Buy one, get one free.'])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})
