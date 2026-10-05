import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidir, lerGpus, GPU_DEDICADA, discoNecessarioGb } from './medir-maquina.mjs'

test('maquina forte: whisper medium e 3D ligado', () => {
  const r = decidir({ sistema: 'win32', memoriaGb: 16, discoLivreGb: 50, gpus: ['NVIDIA GeForce GTX 1650'] })
  assert.equal(r.whisper, 'medium'); assert.equal(r.extras3d, true); assert.deepEqual(r.falta, [])
})

test('notebook sem placa, 8 GB: whisper small, 3D desligado, sem pergunta', () => {
  const r = decidir({ sistema: 'win32', memoriaGb: 8, discoLivreGb: 30, gpus: ['Intel(R) UHD Graphics'] })
  assert.equal(r.whisper, 'small'); assert.equal(r.extras3d, false); assert.deepEqual(r.falta, [])
})

test('pouco disco ou pouca memoria vira pergunta com numero', () => {
  const r = decidir({ sistema: 'darwin', memoriaGb: 4, discoLivreGb: 1, gpus: [] })
  assert.equal(r.falta.length, 2)
  assert.match(r.falta[0], /so 1 GB/); assert.match(r.falta[1], /4 GB/)
})

test('Apple Silicon conta como placa; Intel e AMD integradas nao', () => {
  assert.ok(GPU_DEDICADA.test('Apple M2'))
  assert.ok(!GPU_DEDICADA.test('AMD Radeon(TM) Graphics'))
  assert.ok(GPU_DEDICADA.test('AMD Radeon RX 6600'))
})

test('lerGpus le a saida do Windows e do Mac', () => {
  const win = lerGpus('win32', () => ({ status: 0, stdout: 'Intel(R) UHD Graphics\r\nNVIDIA GeForce RTX 3050\r\n' }))
  assert.deepEqual(win, ['Intel(R) UHD Graphics', 'NVIDIA GeForce RTX 3050'])
  const mac = lerGpus('darwin', () => ({ status: 0, stdout: 'Graphics/Displays:\n\n    Apple M1:\n\n      Chipset Model: Apple M1\n' }))
  assert.deepEqual(mac, ['Apple M1'])
  assert.deepEqual(lerGpus('win32', () => ({ status: 1, stdout: '' })), [])
})

test('3D com relevo fica desligado quando o modelo de profundidade nao esta instalado, e o aviso diz isso', () => {
  const r = decidir({ sistema: 'win32', memoriaGb: 16, discoLivreGb: 50, gpus: ['NVIDIA GeForce GTX 1650'], temModeloProfundidade: false })
  assert.equal(r.extras3d, false)
  assert.match(r.nota3d, /3D com relevo/)
  assert.match(r.nota3d, /nao esta instalado nesta versao/)
  const com = decidir({ sistema: 'win32', memoriaGb: 16, discoLivreGb: 50, gpus: ['NVIDIA GeForce GTX 1650'], temModeloProfundidade: true })
  assert.equal(com.extras3d, true)
})

test('disco: o limite e o pico da instalacao (motor + whisper + folga de render), sem biblioteca de midia', () => {
  assert.equal(discoNecessarioGb({ modelo: 'small' }), 2.3)
  assert.equal(discoNecessarioGb({ modelo: 'medium' }), 3.4)
  const apertado = decidir({ sistema: 'win32', memoriaGb: 8, discoLivreGb: 2, gpus: [] })
  assert.equal(apertado.falta.length, 1)
  assert.match(apertado.falta[0], /2\.3 GB/)
  assert.doesNotMatch(apertado.falta[0], /biblioteca|musica/)
  assert.deepEqual(decidir({ sistema: 'win32', memoriaGb: 8, discoLivreGb: 3, gpus: [] }).falta, [])
  // memoria pra medium, mas disco so pro small: fica small sem pergunta
  const r = decidir({ sistema: 'win32', memoriaGb: 16, discoLivreGb: 3, gpus: [] })
  assert.equal(r.whisper, 'small'); assert.deepEqual(r.falta, [])
  assert.equal(decidir({ sistema: 'win32', memoriaGb: 16, discoLivreGb: 4, gpus: [] }).whisper, 'medium')
})
