// Testes dos estilos da foto de anuncio: cores e letras por estilo, e nada mandando
// buscar cor ou letra no guia da marca. Rodar: node --test estilos.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { lerEstilosMd, CAMINHO_ESTILOS } from './lib/estilos-md.mjs'
import { acharFonte } from './lib/fontes.mjs'

const ler = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const citaGuia = texto => /guia|design-guide/i.test(texto)
function entre(texto, inicio, fim) {
  const i = texto.indexOf(inicio)
  if (i < 0) return ''
  const j = texto.indexOf(fim, i + inicio.length)
  return j < 0 ? '' : texto.slice(i, j)
}

test('cada estilo tem cores de partida e letras embutidas', () => {
  const estilos = lerEstilosMd(readFileSync(CAMINHO_ESTILOS, 'utf8'))
  const nomes = Object.keys(estilos)
  assert.deepEqual(nomes, ['Limpo', 'Colorido', 'Natural'], 'canario: os 3 estilos lidos')
  for (const nome of nomes) {
    const e = estilos[nome]
    assert.ok(e.titulo && e.texto, `${nome}: sem a linha "- Letras:" com titulo e texto`)
    assert.ok(e.cores.length >= 3, `${nome}: ${e.cores.length} cores de partida, precisa de pelo menos 3`)
    for (const l of [e.titulo, e.texto]) {
      assert.ok(acharFonte(l.familia), `${nome}: a letra "${l.familia}" nao esta em scripts/fontes/`)
      assert.ok(l.peso >= 100 && l.peso <= 900, `${nome}: peso ${l.peso}`)
    }
  }
})

test('estilos.md nao manda buscar cor fora do estilo', () => {
  assert.ok(citaGuia('cores do guia de marca'), 'canario: frase com guia')
  assert.ok(citaGuia('guia_de_marca: x'), 'canario: campo antigo')
  const texto = readFileSync(CAMINHO_ESTILOS, 'utf8')
  assert.ok(texto.length > 500, 'canario: estilos.md lido')
  const linhas = texto.split(/\r?\n/).filter(citaGuia)
  assert.deepEqual(linhas, [])
})

test('o passo 1 da skill roda o estilo.mjs', () => {
  const trecho = entre(ler('../SKILL.md'), '## Antes de começar', '## Fazer')
  assert.ok(trecho.length > 200, 'canario: trecho do Antes de comecar achado')
  assert.ok(trecho.includes('estilo.mjs'), 'o passo 1 precisa rodar o estilo.mjs')
  assert.ok(trecho.includes('status.json'), 'o passo 1 precisa dizer de onde vem a categoria')
})

test('a skill e o agente nao apontam pro guia da marca', () => {
  const entrevista = entre(ler('../../mercado-livre/SKILL.md'), '## Primeiro de tudo', '## Primeira vez')
  assert.ok(entrevista.length > 500, 'canario: entrevista da /mercado-livre achada')
  const alvos = {
    'gerar-imagens/SKILL.md': ler('../SKILL.md'),
    'agents/ml-designer.md': ler('../../../agents/ml-designer.md'),
    'mercado-livre/scripts/lib/config.mjs': ler('../../mercado-livre/scripts/lib/config.mjs'),
    'mercado-livre/referencias/configuracao-exemplo.md': ler('../../mercado-livre/referencias/configuracao-exemplo.md'),
    'entrevista da mercado-livre/SKILL.md': entrevista,
  }
  for (const [nome, texto] of Object.entries(alvos)) {
    assert.ok(texto.length > 100, `canario: ${nome} lido`)
    assert.deepEqual(texto.split('\n').filter(citaGuia), [], nome)
  }
})

test('o item Imagens pendentes roda o estilo.mjs antes do motor', () => {
  const item = entre(ler('../../mercado-livre/SKILL.md'), 'Imagens pendentes', 'Gate de imagens')
  assert.ok(item.length > 200, 'canario: item Imagens pendentes achado')
  const estilo = item.indexOf('estilo.mjs')
  const motor = item.indexOf('motor.mjs')
  assert.ok(estilo >= 0, 'o item precisa rodar o estilo.mjs')
  assert.ok(motor >= 0, 'canario: o item roda o motor.mjs')
  assert.ok(estilo < motor, 'o estilo.mjs vem antes do motor.mjs')
})

test('o design-guide do molde nao tem secao de estilo do anuncio', () => {
  const guia = ler('../../../../marca/design-guide.md')
  assert.ok(guia.includes('## Cores'), 'canario: design-guide do molde lido')
  assert.ok(!guia.includes('## Estilo por ' + 'categoria'))
})

test('regras-clips nao manda a marca pro anuncio', () => {
  const texto = ler('../../video-produto/referencias/regras-clips-ml.md')
  assert.ok(texto.includes('Foque no produto'), 'canario: regras-clips lido')
  const linhas = texto.split('\n').filter(l => /(fotos|imagens) do anúncio/i.test(l))
  assert.ok(linhas.length > 0, 'a regra precisa falar das fotos do anuncio')
  for (const l of linhas) {
    assert.ok(l.includes('sem a marca da loja'), l)
    assert.ok(!/levar identidade/i.test(l), l)
  }
})
