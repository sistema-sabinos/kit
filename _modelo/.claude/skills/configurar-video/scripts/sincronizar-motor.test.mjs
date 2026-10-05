import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { sincronizarMotor, motorSincronizado } from './sincronizar-motor.mjs'
import { instalarMotor } from './instalar-motor.mjs'

function pasta() {
  const d = mkdtempSync(join(tmpdir(), 'sincmotor-'))
  return { d, kit: join(d, 'kit'), dest: join(d, 'video', 'motor'), limpar: () => rmSync(d, { recursive: true, force: true }) }
}
function grava(raiz, rel, texto) {
  const p = join(raiz, ...rel.split('/'))
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, texto)
}

test('copia o motor sem node_modules, out e public, e avisa que o lock e novo', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package.json', '{}')
    grava(t.kit, 'package-lock.json', 'lock1')
    grava(t.kit, 'src/index.ts', 'a')
    grava(t.kit, 'node_modules/x/y.js', 'nao')
    grava(t.kit, 'out/v.mp4', 'nao')
    grava(t.kit, 'public/p.png', 'nao')
    const r = sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.equal(readFileSync(join(t.dest, 'src', 'index.ts'), 'utf8'), 'a')
    assert.equal(existsSync(join(t.dest, 'node_modules')), false)
    assert.equal(existsSync(join(t.dest, 'out')), false)
    assert.equal(existsSync(join(t.dest, 'public')), false)
    assert.equal(r.lockMudou, true)
    assert.equal(r.copiados.length, 3)
  } finally { t.limpar() }
})

test('segunda rodada sem mudanca nao copia nada e o lock nao mudou', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    grava(t.kit, 'src/a.ts', 'a')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    const r = sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.deepEqual(r.copiados, [])
    assert.deepEqual(r.apagados, [])
    assert.equal(r.lockMudou, false)
  } finally { t.limpar() }
})

test('preserva src/videos do aluno e node_modules, apaga o que sumiu do kit', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    grava(t.kit, 'src/velho.ts', 'v')
    grava(t.kit, 'src/videos/index.ts', 'kit')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    grava(t.dest, 'src/videos/aluno.tsx', 'meu')
    grava(t.dest, 'src/videos/aluno.dados.json', '{}')
    grava(t.dest, 'node_modules/x/y.js', 'dep')
    rmSync(join(t.kit, 'src', 'velho.ts'))
    const r = sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.equal(existsSync(join(t.dest, 'src', 'velho.ts')), false)
    assert.deepEqual(r.apagados, ['src/velho.ts'])
    assert.equal(readFileSync(join(t.dest, 'src', 'videos', 'aluno.tsx'), 'utf8'), 'meu')
    assert.equal(existsSync(join(t.dest, 'src', 'videos', 'aluno.dados.json')), true)
    assert.equal(existsSync(join(t.dest, 'node_modules', 'x', 'y.js')), true)
  } finally { t.limpar() }
})

test('lock mudado no kit pede npm ci; lock igual com a marca de npm ci completo nao pede', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    grava(t.dest, 'node_modules/x/y.js', 'dep')
    instalarMotor({ motor: t.dest, plat: 'darwin', executar: () => ({ status: 0 }) })
    assert.equal(sincronizarMotor({ origem: t.kit, destino: t.dest }).precisaNpmCi, false)
    grava(t.kit, 'package-lock.json', 'lock2')
    const r = sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.equal(r.lockMudou, true)
    assert.equal(r.precisaNpmCi, true)
    assert.deepEqual(r.copiados, ['package-lock.json'])
  } finally { t.limpar() }
})

test('sem node_modules no destino pede npm ci mesmo com lock igual', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.equal(sincronizarMotor({ origem: t.kit, destino: t.dest }).precisaNpmCi, true)
  } finally { t.limpar() }
})

test('node_modules existindo sem a marca (npm ci que caiu no meio) pede npm ci de novo', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    grava(t.dest, 'node_modules/remotion/pela-metade.js', 'x')
    assert.equal(sincronizarMotor({ origem: t.kit, destino: t.dest }).precisaNpmCi, true)
  } finally { t.limpar() }
})

test('a marca do npm ci sobrevive ao sincronizar e nao deixa o motor diferente', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    instalarMotor({ motor: t.dest, plat: 'darwin', executar: () => ({ status: 0 }) })
    const r = sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.deepEqual(r.apagados, [])
    assert.equal(existsSync(join(t.dest, '.lock-instalado')), true)
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), true)
  } finally { t.limpar() }
})

test('.DS_Store nao vai pro motor nem conta como diferenca; .gitignore do motor vai', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    grava(t.kit, '.gitignore', 'node_modules')
    grava(t.kit, '.DS_Store', 'lixo')
    grava(t.kit, 'src/.DS_Store', 'lixo')
    const r = sincronizarMotor({ origem: t.kit, destino: t.dest })
    assert.deepEqual(r.copiados.sort(), ['.gitignore', 'package-lock.json'])
    grava(t.dest, '.DS_Store', 'lixo do aluno')
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), true)
    assert.deepEqual(sincronizarMotor({ origem: t.kit, destino: t.dest }).apagados, [])
  } finally { t.limpar() }
})

test('motorSincronizado: igual passa, arquivo mudado ou faltando reprova, video do aluno e ignorado', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    grava(t.kit, 'src/a.ts', 'a')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    grava(t.dest, 'src/videos/aluno.tsx', 'meu')
    grava(t.dest, 'node_modules/x/y.js', 'dep')
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), true)
    grava(t.kit, 'src/a.ts', 'b')
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), false)
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    grava(t.kit, 'src/novo.ts', 'n')
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), false)
  } finally { t.limpar() }
})

test('motorSincronizado ignora o src/videos/index.ts reescrito pelo render, mas pega mudanca em outra pasta', () => {
  const t = pasta()
  try {
    grava(t.kit, 'package-lock.json', 'lock1')
    grava(t.kit, 'src/a.ts', 'a')
    grava(t.kit, 'src/videos/index.ts', 'vazio')
    sincronizarMotor({ origem: t.kit, destino: t.dest })
    grava(t.dest, 'src/videos/index.ts', "import * as v0 from './peca'")
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), true)
    grava(t.dest, 'src/a.ts', 'mudado')
    assert.equal(motorSincronizado({ origem: t.kit, destino: t.dest }), false)
  } finally { t.limpar() }
})
