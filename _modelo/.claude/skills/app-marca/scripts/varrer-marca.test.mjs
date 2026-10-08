import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { varrer, principal } from './varrer-marca.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'varrer-marca.mjs')
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)

function por(raiz, rel, conteudo) {
  const p = join(raiz, ...rel.split('/'))
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, conteudo)
  return p
}

// pasta temporaria apagada no finally, mesmo quando um assert falha
function comPasta(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'varrer-marca-'))
  try {
    return fn(raiz)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
}

// mesmo cenario do teste original: raiz do projeto, planejamento em app/
function montar(r) {
  por(r, 'src/app/page.tsx', 'export default function Page() {' + LF + '  return <h1>Slotwise</h1>' + LF + '}' + LF)
  por(r, 'src/components/CalendlyEmbed.tsx', '// sobrou' + LF)
  por(r, 'src/lib/copy.ts', "export const hero = 'The calendly alternative'" + LF)
  por(r, 'src/styles/tokens.css', ':root { --accent: #006BFF; --bg: #fff; }' + LF)
  por(r, 'src/lib/links.ts', "const help = 'https://help.calendly.com/x'" + LF)
  por(r, 'src/lib/team.ts', 'export const AcuitySchedulingSync = 1' + LF)
  por(r, 'app/mapa.md', '# Mapa: Calendly' + LF)
  por(r, 'node_modules/x/index.js', 'calendly' + LF)
  por(r, 'public/logo.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]), Buffer.from('calendly')]))
  por(r, 'public/dados.dat', Buffer.concat([Buffer.from('calendly'), Buffer.from([0])]))
  por(r, 'package-lock.json', '{"calendly": 1}' + LF)
}

const padrao = (r, extra = {}) => varrer(r, { evitar: ['Calendly', 'Acuity Scheduling'], dominios: ['calendly.com'], cores: ['#006bff'], ...extra })

function rodar(argv, cwd, leitor) {
  const saida = []
  const avisos = []
  const codigo = principal(argv, s => saida.push(s), s => avisos.push(s), cwd, leitor)
  return { codigo, saida: saida.join(LF), avisos: avisos.join(LF) }
}

// leitor de verdade, com uma operacao que falha num caminho escolhido, sem depender de permissao do Windows
function leitorQueFalha(op, terminaEm) {
  const leitor = { readdirSync, readFileSync, statSync, openSync, readSync, closeSync }
  const orig = leitor[op]
  leitor[op] = (p, ...resto) => {
    if (String(p).endsWith(terminaEm)) throw Object.assign(new Error(`EACCES: permission denied, ${op} '${p}'`), { code: 'EACCES' })
    return orig(p, ...resto)
  }
  return leitor
}

test('acha nome, caminho, dominio, cor e identificador colado', () => comPasta(r => {
  montar(r)
  const achados = padrao(r)
  assert.ok(achados.length > 0)
  const tipos = new Set(achados.map(h => h.tipo + ' ' + h.arquivo.replace(/\/$/, '').split('/').pop()))
  assert.ok(tipos.has('caminho CalendlyEmbed.tsx'))
  assert.ok(tipos.has('nome copy.ts'))
  assert.ok(tipos.has('dominio links.ts'))
  assert.ok(tipos.has('cor tokens.css'))
  assert.ok(tipos.has('nome team.ts')) // AcuitySchedulingSync
}))

test('pula planejamento, node_modules, lockfile e binario', () => comPasta(r => {
  montar(r)
  const arquivos = new Set(padrao(r).map(h => h.arquivo))
  assert.ok(arquivos.size > 0)
  assert.ok(![...arquivos].some(f => f.startsWith('app/')))
  assert.ok(![...arquivos].some(f => f.includes('node_modules')))
  assert.ok(!arquivos.has('package-lock.json'))
  assert.ok(!arquivos.has('public/logo.png'))
  assert.ok(!arquivos.has('public/dados.dat'))
  assert.ok(!arquivos.has('src/app/page.tsx'))
}))

test('inclui o planejamento com --incluir-planejamento', () => comPasta(r => {
  montar(r)
  const arquivos = new Set(padrao(r, { incluirPlanejamento: true }).map(h => h.arquivo))
  assert.ok(arquivos.has('app/mapa.md'))
}))

test('hex curto casa com o longo', () => comPasta(r => {
  por(r, 'src/a.css', 'a { color: #06f }' + LF)
  const achados = varrer(r, { cores: ['#0066FF'] })
  assert.ok(achados.some(h => h.arquivo === 'src/a.css' && h.achado === '#0066ff'))
}))

test('linha de comando: config sai 1, pasta limpa sai 0, sem alvo sai 2', () => comPasta(r => {
  montar(r)
  const cfg = por(r, 'marca.json', JSON.stringify({ evitar: ['Calendly'] }))
  assert.equal(rodar([r, '--config', cfg]).codigo, 1)
  const limpa = join(r, 'limpa')
  por(limpa, 'index.html', '<h1>Slotwise</h1>')
  const ok = rodar([limpa, '--evitar', 'Calendly'])
  assert.equal(ok.codigo, 0)
  assert.match(ok.saida, /Limpo/)
  const vazio = rodar([limpa])
  assert.equal(vazio.codigo, 2)
  assert.match(vazio.avisos, /--evitar/)
}))

test('nome com acento casa sem acento, em caixa alta e colado', () => comPasta(r => {
  por(r, 'src/CafeFacilBotao.tsx', '// sobrou' + LF)
  por(r, 'src/a.ts', "const slug = 'cafe-facil'" + LF + 'const t = "CAFÉ FÁCIL"' + LF + 'const ok = 1' + LF)
  const achados = varrer(r, { evitar: ['Café Fácil'] })
  const locais = achados.map(h => h.tipo + ' ' + h.arquivo + ':' + h.linha)
  assert.ok(locais.includes('caminho src/CafeFacilBotao.tsx:0'))
  assert.ok(locais.includes('nome src/a.ts:1'))
  assert.ok(locais.includes('nome src/a.ts:2'))
  assert.equal(achados.length, 3)
  // a citacao sai do texto original, com o acento
  assert.equal(achados.find(h => h.linha === 2).texto, 'const t = "CAFÉ FÁCIL"')
}))

test('quebra de linha CRLF, CR sozinho e LF dao a linha certa', () => comPasta(r => {
  por(r, 'crlf.txt', 'a' + CR + LF + 'b' + CR + LF + 'Calendly' + CR + LF)
  por(r, 'cr.txt', 'a' + CR + 'b' + CR + 'Calendly' + CR)
  por(r, 'lf.txt', 'a' + LF + 'b' + LF + 'Calendly' + LF)
  const achados = varrer(r, { evitar: ['Calendly'] })
  assert.deepEqual(achados.map(h => h.arquivo + ':' + h.linha), ['cr.txt:3', 'crlf.txt:3', 'lf.txt:3'])
  assert.ok(achados.every(h => h.texto === 'Calendly'))
}))

test('pasta app do Next.js dentro de app/codigo e varrida; da raiz do projeto, so app/codigo entra', () => comPasta(r => {
  por(r, 'app/mapa.md', 'Calendly' + LF)
  por(r, 'app/codigo/package.json', '{}' + LF)
  por(r, 'app/codigo/app/page.tsx', '<h1>Calendly</h1>' + LF)
  const doCodigo = varrer(join(r, 'app', 'codigo'), { evitar: ['Calendly'] }).map(h => h.arquivo)
  assert.deepEqual(doCodigo, ['app/page.tsx'])
  const daRaiz = varrer(r, { evitar: ['Calendly'] }).map(h => h.arquivo)
  assert.deepEqual(daRaiz, ['app/codigo/app/page.tsx'])
}))

test('sem raiz, varre app/codigo a partir da pasta atual; sem a pasta, sai 2', () => comPasta(r => {
  por(r, 'app/codigo/src/x.ts', 'calendly' + LF)
  por(r, 'outro/y.ts', 'calendly' + LF)
  const res = rodar(['--evitar', 'Calendly', '--json'], r)
  assert.equal(res.codigo, 1)
  assert.deepEqual(JSON.parse(res.saida).map(h => h.arquivo), ['src/x.ts'])
  const sem = rodar(['--evitar', 'Calendly'], join(r, 'outro'))
  assert.equal(sem.codigo, 2)
  assert.match(sem.avisos, /app\/codigo/)
}))

test('cor sem # sai 2, pra nao dar limpo sem ter procurado', () => comPasta(r => {
  por(r, 'a.css', 'a { color: #006bff }' + LF)
  const res = rodar([r, '--cores', '006bff'])
  assert.equal(res.codigo, 2)
  assert.match(res.avisos, /006bff/)
}))

test('pasta que nao abre sai 2 com aviso, nunca Limpo', () => comPasta(r => {
  por(r, 'src/a.ts', 'const ok = 1' + LF)
  por(r, 'src/trancada/b.ts', 'calendly' + LF)
  const res = rodar([r, '--evitar', 'Calendly'], r, leitorQueFalha('readdirSync', 'trancada'))
  assert.equal(res.codigo, 2)
  assert.ok(res.avisos.length > 0)
  assert.match(res.avisos, /src\/trancada/)
  assert.match(res.avisos, /EACCES/)
  assert.doesNotMatch(res.saida, /Limpo/)
}))

test('arquivo que nao le sai 2 com aviso; binario, lockfile e pasta pulada nao contam', () => comPasta(r => {
  montar(r)
  assert.deepEqual(padrao(r).falhas, [])
  const limpa = join(r, 'limpa')
  por(limpa, 'a.ts', 'const ok = 1' + LF)
  por(limpa, 'b.ts', 'const ok = 2' + LF)
  const res = rodar([limpa, '--evitar', 'Calendly'], r, leitorQueFalha('readFileSync', 'b.ts'))
  assert.equal(res.codigo, 2)
  assert.ok(res.avisos.length > 0)
  assert.match(res.avisos, /b\.ts/)
  assert.doesNotMatch(res.saida, /Limpo/)
}))

test('roda pela linha de comando de verdade, com --incluir-planejamento antes da raiz', () => comPasta(r => {
  por(r, 'app/mapa.md', 'Calendly' + LF)
  const res = spawnSync(process.execPath, [SCRIPT, '--evitar', 'Calendly', '--incluir-planejamento', r], { encoding: 'utf8' })
  assert.equal(res.status, 1)
  assert.match(res.stdout, /app\/mapa\.md:1/)
  assert.match(res.stdout, /1 achado/)
}))
