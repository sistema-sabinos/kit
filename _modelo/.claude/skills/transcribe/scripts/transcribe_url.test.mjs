// Testes do transcribe_url.py com o faster-whisper e o yt-dlp falsos (PYTHONPATH), rodando o
// Python de verdade com a saida num pipe, como a IA le. N33 e N34 da varredura da 5.19.
// Rodar: node --test transcribe_url.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// O mesmo Python do plataforma.mjs da /configurar-video, escrito aqui: a /transcribe nao depende do
// pacote de video, e import de la quebraria no projeto sem ele (5.20, chat 5)
function python(plat = process.platform) {
  if (plat === 'win32') return { cmd: 'py', base: ['-3.12'] }
  return { cmd: plat === 'darwin' ? 'python3.12' : 'python3', base: [] }
}

const SCRIPT = fileURLToPath(new URL('./transcribe_url.py', import.meta.url))
const NL = String.fromCharCode(10)

// Fala com acento e cedilha, fogo (U+1F525) e nota musical (U+266A), montada por codigo
const FALA = `promo${String.fromCharCode(0xe7, 0xe3)}o de ver${String.fromCharCode(0xe3)}o ${String.fromCodePoint(0x1f525)} ${String.fromCodePoint(0x266a)}`

const WHISPER = [
  'import json, os',
  'class _Seg:',
  '    def __init__(self, start, end, text):',
  '        self.start, self.end, self.text = start, end, text',
  'class _Info:',
  '    language = "pt"',
  '    duration = 5.0',
  'class WhisperModel:',
  '    def __init__(self, *a, **k):',
  '        pass',
  '    def transcribe(self, audio, **k):',
  '        if not os.path.exists(audio):',
  '            raise FileNotFoundError(audio)',
  '        with open(os.environ["FALSO_FALA"], encoding="utf-8") as f:',
  '            fala = f.read()',
  '        return iter([_Seg(0.0, 2.0, fala)]), _Info()',
].join(NL)

// Como o yt-dlp de verdade: link de video dentro de playlist, sem noplaylist, vira a playlist
const YTDLP = [
  'import json, os',
  'class YoutubeDL:',
  '    def __init__(self, opts):',
  '        self.opts = opts',
  '    def __enter__(self):',
  '        return self',
  '    def __exit__(self, *a):',
  '        return False',
  '    def extract_info(self, url, download=True):',
  '        with open(os.environ["FALSO_REGISTRO"], "a", encoding="utf-8") as f:',
  '            f.write(json.dumps({"url": url, "noplaylist": self.opts.get("noplaylist", False)}) + chr(10))',
  '        if "list=" in url and not self.opts.get("noplaylist"):',
  '            return {"_type": "playlist", "id": "PLfalso", "title": "playlist", "entries": []}',
  '        destino = self.opts["outtmpl"].replace("%(id)s", "vid1").replace("%(ext)s", "wav")',
  '        open(destino, "wb").close()',
  '        return {"id": "vid1", "title": "aula", "duration": 5, "extractor": "youtube", "uploader": "canal"}',
].join(NL)

function cenario(fala = FALA) {
  const d = mkdtempSync(join(tmpdir(), 'transcribe-url-'))
  const stubs = join(d, 'stubs')
  mkdirSync(stubs)
  writeFileSync(join(stubs, 'faster_whisper.py'), WHISPER)
  writeFileSync(join(stubs, 'yt_dlp.py'), YTDLP)
  // o check_dependencies procura o ffmpeg no PATH: um arquivo vazio basta pro shutil.which
  writeFileSync(join(stubs, 'ffmpeg.exe'), '')
  writeFileSync(join(stubs, 'ffmpeg'), '')
  chmodSync(join(stubs, 'ffmpeg'), 0o755)
  writeFileSync(join(d, 'fala.txt'), fala)
  writeFileSync(join(d, 'audio.wav'), '')
  const env = { ...process.env }
  // modo UTF-8 ligado por fora esconderia o defeito do cp1252
  for (const k of ['PYTHONUTF8', 'PYTHONIOENCODING', 'PYTHONLEGACYWINDOWSSTDIO']) delete env[k]
  const chavePath = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[chavePath] = `${stubs}${delimiter}${env[chavePath] ?? ''}`
  Object.assign(env, { PYTHONPATH: stubs, FALSO_FALA: join(d, 'fala.txt'), FALSO_REGISTRO: join(d, 'registro.jsonl') })
  const p = python()
  const rodar = alvo => spawnSync(p.cmd, [...p.base, SCRIPT, alvo], { env, cwd: d, timeout: 60000 })
  const registro = () => readFileSync(join(d, 'registro.jsonl'), 'utf8').trim().split(NL).map(l => JSON.parse(l))
  return { d, rodar, registro, limpar: () => rmSync(d, { recursive: true, force: true }) }
}

test('fala com acento, emoji e nota musical sai inteira em UTF-8 pelo pipe, com codigo 0', () => {
  const c = cenario()
  try {
    const r = c.rodar(join(c.d, 'audio.wav'))
    assert.ifError(r.error)
    assert.ok(r.stdout.length > 0, `saida veio vazia: ${r.stderr}`)
    assert.equal(r.status, 0, r.stderr.toString('utf8'))
    assert.ok(r.stdout.includes(Buffer.from(FALA, 'utf8')), `fala nao veio em UTF-8: ${r.stdout.toString('hex')}`)
    // c3 a7 c3 a3 e a cedilha e o til em UTF-8; f0 9f 94 a5 o fogo; e2 99 aa a nota
    for (const hex of ['c3a7c3a3', 'f09f94a5', 'e299aa']) assert.ok(r.stdout.toString('hex').includes(hex), `faltou ${hex}`)
  } finally { c.limpar() }
})

// fala so em ASCII: este teste prova a playlist, nao o UTF-8
test('link de video dentro de playlist (&list=) pede um video so e transcreve ele', () => {
  const c = cenario('aula um')
  try {
    const r = c.rodar('https://www.youtube.com/watch?v=vid1&list=PLfalso')
    assert.ifError(r.error)
    assert.ok(r.stdout.length > 0, `saida veio vazia: ${r.stderr}`)
    assert.equal(r.status, 0, r.stderr.toString('utf8'))
    assert.deepEqual(c.registro(), [{ url: 'https://www.youtube.com/watch?v=vid1&list=PLfalso', noplaylist: true }])
    assert.match(r.stdout.toString('utf8'), /^aula um$/m)
  } finally { c.limpar() }
})

test('todo yt-dlp de uma aula ou video so, na /transcribe e na /aprender-curso, leva --no-playlist', () => {
  const linhas = ['../SKILL.md', '../../aprender-curso/SKILL.md'].flatMap(rel =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').split(/\r?\n/).filter(l => l.includes('yt-dlp --')).map(l => `${rel}: ${l}`))
  // 4 desde a 5.24: a data, a legenda, a legenda da /transcribe e o titulo do link solto
  assert.equal(linhas.length, 4, `canario: comandos yt-dlp achados ${linhas.length}`)
  for (const l of linhas) assert.ok(l.includes('--no-playlist'), `sem --no-playlist: ${l}`)
})
