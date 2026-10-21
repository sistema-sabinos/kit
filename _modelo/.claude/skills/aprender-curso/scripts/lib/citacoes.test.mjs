// Testes da busca e da conferencia de citacoes (aula N, marca).
// Rodar: node --test lib/citacoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharCitacoes, acharForaDoFormato, conferir, citacoesDe, citacoesComCurso } from './citacoes.mjs'

test('acha citacao de minuto, de hora e de pagina com a linha certa', () => {
  const c = acharCitacoes('Intro\nO caixa manda (aula 2, 6:15).\nRevisao (aula 10, 1:02:03) e apostila (aula 1, p. 41).')
  assert.ok(c.length > 0, 'saida veio vazia')
  assert.deepEqual(c, [
    { aula: 2, marca: '6:15', linha: 2 },
    { aula: 10, marca: '1:02:03', linha: 3 },
    { aula: 1, marca: 'p. 41', linha: 3 },
  ])
})

test('varias citacoes na mesma linha saem separadas', () => {
  const c = acharCitacoes('Isso aparece (aula 3, 9:00), (aula 4, 12:40) e (aula 5, p. 2).')
  assert.deepEqual(c.map(x => `${x.aula}|${x.marca}`), ['3|9:00', '4|12:40', '5|p. 2'])
})

test('ignora texto parecido fora do formato', () => {
  const texto = 'Na aula 3 ele fala disso. (aula 3) (aula 3,6:15) (Aula 3, 6:15) (aula 3, minuto 6) (aula x, 6:15)'
  assert.deepEqual(acharCitacoes(texto), [])
  // canario: o mesmo texto com uma citacao valida acha so ela
  assert.equal(acharCitacoes(`${texto} (aula 3, 6:15)`).length, 1)
})

test('citacao quase no formato vira problema em vez de sumir', () => {
  const quase = ['(aula 3, 6:5)', '(Aula 3, 6:15)', '(aula 3, p.41)', '(aula 3,  6:15)', '(aula  3, 6:15)',
    '(aula 3, 12:40 a 13:10)', '(aula 3, p. 41-42)', '(aulas 3 e 4, 6:15)', '(aula 3, 6:15; aula 4, 1:00)', '(aula 3, 6:15']
  const texto = `Na aula 3 ele fala disso. Valida (aula 3, 6:15) e (aula 1, p. 4).\n${quase.join(' x ')}`
  const fora = acharForaDoFormato(texto)
  assert.ok(fora.length > 0, 'saida veio vazia')
  assert.deepEqual(fora.map(f => f.trecho), quase)
  assert.ok(fora.every(f => f.linha === 2))
})

test('citacao valida passa', () => {
  const r = conferir([{ aula: 3, marca: '6:15', linha: 1 }, { aula: 3, marca: 'p. 4', linha: 2 }],
    [{ nome: '03-metodo.md', texto: '[6:15] fala\n[p. 4] apostila' }])
  assert.deepEqual(r, { ok: true, problemas: [] })
})

test('aula inexistente reprova', () => {
  const r = conferir([{ aula: 7, marca: '1:00', linha: 1 }], [{ nome: '03-metodo.md', texto: '[1:00]' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, ['aula 7 nao existe em aulas/'])
})

test('marca ausente no arquivo da aula reprova', () => {
  const r = conferir([{ aula: 3, marca: '9:99', linha: 1 }], [{ nome: '03-metodo.md', texto: '[6:15] fala\n9:99 sem colchete' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, ['aula 3 sem a marca [9:99]'])
})

test('aula em dois arquivos lista os dois em ordem', () => {
  const r = conferir([{ aula: 3, marca: '1:00', linha: 1 }],
    [{ nome: '03-b.md', texto: '[1:00]' }, { nome: '03-a.md', texto: '[1:00]' }])
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, ['aula 3 em dois arquivos: 03-a.md, 03-b.md'])
})

test('numero com zero a esquerda no arquivo casa com a aula', () => {
  const r = conferir([{ aula: 3, marca: '2:00', linha: 1 }, { aula: 12, marca: 'p. 1', linha: 1 }],
    [{ nome: '003-x.md', texto: '[2:00]' }, { nome: '12-y.md', texto: '[p. 1]' }, { nome: '30-z.md', texto: '' }])
  assert.deepEqual(r, { ok: true, problemas: [] })
})

const fonte = citacoesDe('fonte', 'fichas')

test('fonte: acha minuto, pagina e trecho de pagina web', () => {
  const c = fonte.acharCitacoes('Regra (fonte 2, 6:15) e (fonte 10, p. 41).\nPost (fonte 3, §4).')
  assert.ok(c.length > 0, 'saida veio vazia')
  assert.deepEqual(c, [
    { fonte: 2, marca: '6:15', linha: 1 },
    { fonte: 10, marca: 'p. 41', linha: 1 },
    { fonte: 3, marca: '§4', linha: 2 },
  ])
})

test('aula nao aceita trecho de pagina web: vira fora do formato', () => {
  assert.deepEqual(acharCitacoes('(aula 3, §4)'), [])
  assert.deepEqual(acharForaDoFormato('(aula 3, §4)').map(f => f.trecho), ['(aula 3, §4)'])
})

test('fonte quase no formato vira problema', () => {
  const quase = ['(Fonte 3, 6:15)', '(fonte 3, § 4)', '(fontes 3 e 4, 6:15)', '(fonte 3, p.41)']
  const fora = fonte.acharForaDoFormato(`Valida (fonte 1, §2).\n${quase.join(' x ')}`)
  assert.ok(fora.length > 0, 'saida veio vazia')
  assert.deepEqual(fora.map(f => f.trecho), quase)
})

test('fonte: conferir fala em fonte e em fichas/', () => {
  const r = fonte.conferir([{ fonte: 7, marca: '1:00', linha: 1 }, { fonte: 1, marca: '§9', linha: 2 }],
    [{ nome: '01-livro.md', texto: '[§2] x' }])
  assert.deepEqual(r.problemas, ['fonte 7 nao existe em fichas/', 'fonte 1 sem a marca [§9]'])
})

test('rotulo desconhecido quebra na hora', () => {
  assert.throws(() => citacoesDe('capitulo', 'x'), /rotulo desconhecido/)
})

// 5.21, tarefa 3.3: mais de um curso, com o curso dentro da citacao
const comCurso = citacoesComCurso('inteligencia/cursos')

test('com curso: acha minuto, hora e pagina com o curso e a linha', () => {
  const c = comCurso.acharCitacoes('A (aula 3, 12:40, curso-ml-gemarket).\nB (aula 10, 1:02:03, b) e (aula 2, p. 41, apostila-x).')
  assert.ok(c.length > 0, 'saida veio vazia')
  assert.deepEqual(c, [
    { aula: 3, marca: '12:40', curso: 'curso-ml-gemarket', linha: 1 },
    { aula: 10, marca: '1:02:03', curso: 'b', linha: 2 },
    { aula: 2, marca: 'p. 41', curso: 'apostila-x', linha: 2 },
  ])
})

test('com curso: citacao sem o curso vira problema proprio, e o resto fora do formato', () => {
  const quase = ['(aula 3, 6:15)', '(aula 1, p. 4)', '(aula 3, 6:15, Curso-X)', '(aula 3, 6:15, curso x)', '(aula 3, 6:15,b)', '(aulas 3 e 4, 6:15, b)']
  const fora = comCurso.acharForaDoFormato(`Valida (aula 3, 6:15, b).\n${quase.join(' x ')}`)
  assert.ok(fora.length > 0, 'saida veio vazia')
  assert.deepEqual(fora.map(f => [f.trecho, f.semCurso]), quase.map((q, i) => [q, i < 2]))
  assert.ok(fora.every(f => f.linha === 2))
})

test('com curso no modo de um curso so: vira fora do formato, nunca passa calada', () => {
  const texto = 'Regra (aula 3, 12:40, curso-x).'
  assert.deepEqual(acharCitacoes(texto), [])
  assert.deepEqual(acharForaDoFormato(texto).map(f => f.trecho), ['(aula 3, 12:40, curso-x)'])
})

test('com curso: conferir acusa curso, aula e marca que faltam, dizendo o curso', () => {
  const cursos = new Map([
    ['a', [{ nome: '01-a.md', texto: '[1:00] fala de a' }]],
    ['b', [{ nome: '01-b.md', texto: '[2:00] fala de b' }, { nome: '03-x.md', texto: '' }, { nome: '03-y.md', texto: '' }]],
  ])
  const citacoes = comCurso.acharCitacoes('(aula 1, 1:00, a) (aula 1, 2:00, b) (aula 1, 1:00, b) (aula 7, 1:00, a) (aula 3, 1:00, b) (aula 1, 1:00, z)')
  const r = comCurso.conferir(citacoes, cursos)
  assert.equal(r.ok, false)
  assert.deepEqual(r.problemas, [
    'aula 7 nao existe em a/aulas/',
    'aula 1 sem a marca [1:00] em b',
    'aula 3 em dois arquivos em b: 03-x.md, 03-y.md',
    'curso z nao existe em inteligencia/cursos/',
  ])
  // canario: so as certas passam
  assert.deepEqual(comCurso.conferir(citacoes.slice(0, 2), cursos), { ok: true, problemas: [] })
})
