import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tamanho, revisar, principal } from './ficha-loja.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const EXEMPLO = join(AQUI, '..', 'ficha-exemplo.json')

function boa() {
  return {
    evitar: ['Marcafácil'],
    app_store: {
      nome: 'Horário Certo: Agenda',
      subtitulo: 'Mande o link, o cliente marca',
      texto_promocional: 'Lembrete por WhatsApp chegou.',
      descricao: 'Mande um link. O cliente escolhe um horário livre.',
      palavras_chave: 'cabeleireiro,manicure,barbearia,lembrete,clientes',
      novidades: 'Lembrete por WhatsApp.'
    },
    google_play: {
      titulo: 'Horário Certo: Agenda',
      descricao_curta: 'Mande um link e o cliente marca um horário livre.',
      descricao_completa: 'Mande um link. O cliente escolhe um horário livre.'
    }
  }
}

function rodar(argv) {
  const saida = []
  const avisos = []
  const codigo = principal(argv, s => saida.push(s), s => avisos.push(s))
  return { codigo, saida: saida.join('\n'), avisos: avisos.join('\n') }
}

function comArquivo(dados, fn) {
  const pasta = mkdtempSync(join(tmpdir(), 'ficha-'))
  try {
    const arq = join(pasta, 'ficha.json')
    writeFileSync(arq, typeof dados === 'string' ? dados : JSON.stringify(dados))
    return fn(arq)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}

const erros = lista => lista.filter(i => i.nivel === 'erro')

test('ficha limpa nao tem erro', () => {
  const lista = revisar(boa())
  assert.deepEqual(erros(lista), [])
})

test('campo que estoura o limite diz quanto passou', () => {
  const f = boa()
  f.app_store.subtitulo = 'x'.repeat(31)
  const lista = revisar(f)
  assert.ok(lista.some(i => i.campo === 'subtitulo' && i.nivel === 'erro' && i.mensagem.includes('passou 1')))
})

test('nome do app original vira erro em qualquer campo, sem olhar caixa nem acento', () => {
  const f = boa()
  f.google_play.descricao_completa = 'Uma alternativa melhor ao marcafacil.'
  const lista = revisar(f)
  assert.ok(lista.length > 0)
  assert.ok(erros(lista).some(i => i.campo === 'descricao_completa' && i.mensagem.includes('Marcafácil')))
  // palavra maior que contem o nome nao acusa
  const g = boa()
  g.google_play.descricao_completa = 'Nada a ver com marcafacilidade.'
  assert.deepEqual(erros(revisar(g)), [])
})

test('alegacao de ranking e desperdicio nas palavras-chave', () => {
  const f = boa()
  f.google_play.titulo = '#1 Best Booking App'
  f.app_store.palavras_chave = 'horario, agenda,lembrete,lembrete'
  const msgs = revisar(f).map(i => i.mensagem).join(' | ')
  assert.ok(msgs.length > 0)
  assert.ok(msgs.includes('alegacao de ranking ou de preco'))
  assert.ok(msgs.includes('espaco depois da virgula'))
  assert.ok(msgs.includes('repetida: lembrete'))
  assert.ok(msgs.includes('ja esta no nome'))
})

test('emoji feito de pedacos conta como 1', () => {
  const pessoaNoPc = String.fromCodePoint(0x1f468, 0x200d, 0x1f4bb)
  assert.equal(tamanho('a' + pessoaNoPc + 'b'), 3)
  assert.equal(tamanho('café'), 4)
  // o mesmo cafe com o acento solto (NFD) tambem conta 4
  assert.equal(tamanho('cafe' + String.fromCharCode(0x301)), 4)
})

test('a ficha de exemplo que vai no kit passa', () => {
  const r = rodar([EXEMPLO])
  assert.ok(r.saida.length > 0)
  assert.equal(r.codigo, 0, r.saida + r.avisos)
})

test('--evitar muda a saida de 0 pra 1', () => {
  const f = boa()
  delete f.evitar
  f.app_store.descricao += ' Igual ao Agendex, mas simples.'
  comArquivo(f, arq => {
    const sem = rodar([arq])
    assert.ok(sem.saida.length > 0)
    assert.equal(sem.codigo, 0, sem.saida)
    const com = rodar([arq, '--evitar', 'Agendex'])
    assert.equal(com.codigo, 1)
    assert.ok(com.saida.includes('Agendex'))
  })
})

test('palavras-chave da App Store contam em byte, letra com acento vale 2', () => {
  assert.equal(tamanho('relógio'), 7)
  assert.equal(Buffer.byteLength('relógio'), 8)
  const f = boa()
  // 50 letras com acento: 50 caracteres e 100 bytes, no limite
  f.app_store.palavras_chave = 'ó'.repeat(50)
  assert.deepEqual(erros(revisar(f)).filter(i => i.campo === 'palavras_chave'), [])
  // 60 letras com acento: 60 caracteres (cabe em caractere) e 120 bytes (estoura)
  f.app_store.palavras_chave = 'ó'.repeat(60)
  const lista = erros(revisar(f)).filter(i => i.campo === 'palavras_chave')
  assert.equal(lista.length, 1)
  assert.ok(lista[0].mensagem.includes('120 bytes'))
  assert.ok(lista[0].mensagem.includes('passou 20'))
})

test('alegacao em portugues e caixa alta com acento', () => {
  const f = boa()
  f.google_play.titulo = 'O melhor app GRÁTIS'
  f.app_store.subtitulo = 'PROMOÇÃO de agenda'
  const lista = revisar(f)
  const titulo = lista.filter(i => i.campo === 'titulo').map(i => i.mensagem).join(' | ')
  assert.ok(titulo.includes("'melhor'"), titulo)
  const sub = lista.filter(i => i.campo === 'subtitulo').map(i => i.mensagem).join(' | ')
  assert.ok(sub.includes("'PROMOÇÃO'") && sub.includes('alegacao'), sub)
  assert.ok(sub.includes('caixa alta: PROMOÇÃO'), sub)
  // gratis sem acento tambem pega
  const g = boa()
  g.google_play.descricao_curta = 'Agenda gratis pro seu salao'
  assert.ok(revisar(g).some(i => i.campo === 'descricao_curta' && i.mensagem.includes("'gratis'")))
})

test('campo obrigatorio vazio e erro, opcional vazio e aviso', () => {
  const f = boa()
  f.google_play.titulo = ''
  f.app_store.novidades = ''
  const lista = revisar(f)
  assert.ok(lista.some(i => i.campo === 'titulo' && i.nivel === 'erro' && i.mensagem === 'vazio'))
  assert.ok(lista.some(i => i.campo === 'novidades' && i.nivel === 'aviso'))
})

test('ficha sem loja nenhuma reprova', () => {
  comArquivo({ evitar: [] }, arq => {
    const r = rodar([arq])
    assert.equal(r.codigo, 1)
    assert.ok(r.saida.includes('app_store ou google_play'))
  })
})

test('--json devolve a lista de achados', () => {
  const f = boa()
  f.app_store.subtitulo = 'x'.repeat(31)
  comArquivo(f, arq => {
    const r = rodar([arq, '--json'])
    assert.equal(r.codigo, 1)
    const lista = JSON.parse(r.saida)
    assert.ok(lista.length > 0)
    assert.ok(lista.some(i => i.loja === 'app_store' && i.campo === 'subtitulo'))
  })
})

test('arquivo ruim e argumento ruim saem com 2', () => {
  comArquivo('{ isso nao e json', arq => {
    const r = rodar([arq])
    assert.equal(r.codigo, 2)
    assert.ok(r.avisos.includes('JSON'))
  })
  const sumiu = rodar([join(tmpdir(), 'nao-existe-ficha-loja.json')])
  assert.equal(sumiu.codigo, 2)
  assert.ok(sumiu.avisos.includes('nao achei'))
  assert.equal(rodar([]).codigo, 2)
  comArquivo(boa(), arq => {
    const r = rodar([arq, '--evitar'])
    assert.equal(r.codigo, 2)
    assert.ok(r.avisos.includes('--evitar'))
  })
})
