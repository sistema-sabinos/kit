// Testes do plano de publicacao. Sem rede e sem disco: ls, mtime e leitura injetados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brasiliaParaUTC, utcDeBrasilia, lerTextoDoPost, acharMidia, montarPlano, idsValidosAgora, linhasValidas, gravarPublicacao, tirarIds } from './plano.mjs'

const agora = new Date('2026-10-04T12:00:00Z')
const POST = ['# Post: teste', '', 'ia: sim', '', '## Legenda', 'Linha 1', 'Linha 2', '', '## YouTube título', 'Titulo do Short', '', '## YouTube Descrição', 'Desc do Short'].join('\r\n')
const CONFIG = { canal_instagram: 'canal-ig-1', canal_tiktok: 'canal-tt-1', canal_youtube: 'canal-yt-1', categoria_youtube: '22' }

test('brasiliaParaUTC soma 3 horas e confere o formato', () => {
  assert.equal(brasiliaParaUTC('2026-10-10 11:30', agora), '2026-10-10T14:30:00.000Z')
  assert.equal(brasiliaParaUTC('2026-10-10T23:30', agora), '2026-10-11T02:30:00.000Z')
})

test('brasiliaParaUTC recusa formato sem zero, data que nao existe e horario em menos de 5 minutos', () => {
  assert.throws(() => brasiliaParaUTC('2026-10-1 9:30', agora), /AAAA-MM-DD HH:MM/)
  assert.throws(() => brasiliaParaUTC('2026-02-31 10:00', agora), /nao existe/)
  assert.throws(() => brasiliaParaUTC('2026-10-10 25:00', agora), /nao existe/)
  assert.throws(() => brasiliaParaUTC('2026-10-04 09:03', agora), /5 minutos/)
})

test('lerTextoDoPost le as secoes sem ligar pra acento e caixa', () => {
  assert.deepEqual(lerTextoDoPost(POST), { legenda: 'Linha 1\nLinha 2', tituloYoutube: 'Titulo do Short', descricaoYoutube: 'Desc do Short', ia: true })
  assert.equal(lerTextoDoPost('## Legenda\nx').ia, false)
  assert.throws(() => lerTextoDoPost('# nada'), /Legenda/)
})

test('lerTextoDoPost recusa post.md com o texto do molde ainda no lugar', () => {
  const molde = ['# Post: <titulo curto>', '', 'ia: nao', '', '## Legenda', '<texto do Instagram e do TikTok>', '', '## YouTube titulo', '<titulo do Short>'].join('\n')
  assert.throws(() => lerTextoDoPost(molde), /molde/)
  assert.throws(() => lerTextoDoPost('## Legenda\nCompre ja\n\n## YouTube titulo\n<titulo do Short>'), /youtube titulo/i)
  assert.equal(lerTextoDoPost('## Legenda\nPreco < R$ 50 no link').legenda, 'Preco < R$ 50 no link')
})

test('acharMidia pega o mp4 mais novo sem -preview', () => {
  const ls = () => ['a.mp4', 'b.mp4', 'b-preview.mp4']
  const mtime = f => ({ 'a.mp4': 2, 'b.mp4': 1, 'b-preview.mp4': 9 })[f.split(/[\\/]/).pop()]
  assert.equal(acharMidia('fin', { ls, mtime }).video.split(/[\\/]/).pop(), 'a.mp4')
})

test('acharMidia de carrossel ordena os slides e pega final-916 quando existe', () => {
  const ls = d => d.endsWith('916') ? ['slide-02.png', 'slide-01.png'] : ['slide-02.png', 'slide-01.png', 'legenda.txt']
  const m = acharMidia('fin', { ls, mtime: () => 1 })
  assert.equal(m.tipo, 'carrossel')
  assert.deepEqual(m.slides.map(s => s.split(/[\\/]/).pop()), ['slide-01.png', 'slide-02.png'])
  assert.equal(m.slides916.length, 2)
})

test('acharMidia recusa pasta com mp4 e slides juntos, e pasta vazia', () => {
  assert.throws(() => acharMidia('fin', { ls: () => ['v.mp4', 'slide-01.png'], mtime: () => 1 }), /deixar so um/)
  assert.throws(() => acharMidia('fin', { ls: () => ['nota.txt'], mtime: () => 1 }), /nenhum mp4 nem slide/)
})

const base = { dir: 'producao/p', quando: '2026-10-10 11:30', config: CONFIG, agora, mtime: () => 1, lerTexto: () => POST }

test('montarPlano de video: tres redes, YouTube com titulo e categoria, rotulo de IA, capa em ms', () => {
  const p = montarPlano({ ...base, capa: '2,5', ls: () => ['v.mp4'] })
  assert.equal(p.tipo, 'video')
  assert.deepEqual(p.posts.map(x => x.rede), ['instagram', 'tiktok', 'youtube'])
  assert.deepEqual(p.posts[0].metadata, { instagram: { type: 'reel', shouldShareToFeed: true, isAiGenerated: true } })
  assert.deepEqual(p.posts[2].metadata.youtube, { title: 'Titulo do Short', categoryId: '22', privacy: 'public', notifySubscribers: true, madeForKids: false, embeddable: true, isAiGenerated: true })
  assert.equal(p.posts[2].text, 'Desc do Short')
  assert.equal(p.capaMs, 2500)
})

test('montarPlano de video sem capa avisa que a capa vira o primeiro quadro', () => {
  assert.ok(montarPlano({ ...base, ls: () => ['v.mp4'] }).avisos.some(a => /primeiro quadro/.test(a)))
})

test('montarPlano so usa as redes com canal configurado, e --redes com canal faltando aponta o guia', () => {
  const p = montarPlano({ ...base, config: { canal_instagram: 'canal-ig-1' }, ls: () => ['v.mp4'] })
  assert.deepEqual(p.posts.map(x => x.rede), ['instagram'])
  assert.throws(() => montarPlano({ ...base, config: { canal_instagram: 'c' }, redes: ['tiktok'], ls: () => ['v.mp4'] }), /canal_tiktok/)
  assert.throws(() => montarPlano({ ...base, redes: ['facebook'], ls: () => ['v.mp4'] }), /facebook/)
  assert.throws(() => montarPlano({ ...base, config: {}, ls: () => ['v.mp4'] }), /nenhuma rede/)
})

test('montarPlano de carrossel: Instagram post, TikTok sem rotulo e com aviso na legenda, YouTube fora', () => {
  const ls = d => d.endsWith('916') ? [] : ['slide-01.png', 'slide-02.png', 'slide-03.png', 'slide-04.png']
  const p = montarPlano({ ...base, ls })
  assert.equal(p.tipo, 'carrossel')
  assert.deepEqual(p.posts.map(x => x.rede), ['instagram', 'tiktok'])
  assert.deepEqual(p.posts[0].metadata, { instagram: { type: 'post', shouldShareToFeed: true, isAiGenerated: true } })
  assert.deepEqual(p.posts[1].metadata, { tiktok: { title: 'Linha 1' } })
  assert.match(p.posts[1].text, /gerad[ao]s? com IA/)
  assert.ok(p.avisos.some(a => /YouTube/.test(a)))
})

test('carrossel com menos de 4 slides tira o TikTok, e com mais de 10 recusa', () => {
  const tres = montarPlano({ ...base, ls: d => d.endsWith('916') ? [] : ['slide-01.png', 'slide-02.png', 'slide-03.png'] })
  assert.deepEqual(tres.posts.map(x => x.rede), ['instagram'])
  const onze = Array.from({ length: 11 }, (_, i) => `slide-${String(i + 1).padStart(2, '0')}.png`)
  assert.throws(() => montarPlano({ ...base, ls: d => d.endsWith('916') ? [] : onze }), /10/)
})

test('carrossel com final-916 de tamanho diferente recusa', () => {
  const ls = d => d.endsWith('916') ? ['slide-01.png'] : ['slide-01.png', 'slide-02.png', 'slide-03.png', 'slide-04.png']
  assert.throws(() => montarPlano({ ...base, ls }), /remontar/)
})

test('idsValidosAgora le so a secao VALIDO AGORA', () => {
  const t = '# Publicacao\n\n## VALIDO AGORA\n\n| Rede | Post ID |\n|---|---|\n| instagram | p1 |\n| tiktok | p2 |\n\n## Historico\n\n| instagram | velho |\n'
  assert.deepEqual(idsValidosAgora(t), ['p1', 'p2'])
  assert.deepEqual(idsValidosAgora(''), [])
})

test('utcDeBrasilia converte sem exigir horario no futuro', () => {
  assert.equal(utcDeBrasilia('2026-01-01 10:00'), '2026-01-01T13:00:00.000Z')
})

test('gravarPublicacao reescreve o VALIDO AGORA a partir das linhas e acumula o historico', () => {
  const linha = (rede, id, status = 'scheduled') => ({ rede, id, quando: '2026-10-10 11:30', status })
  const t1 = gravarPublicacao('', { linhas: [linha('instagram', 'p1')], evento: 'agendado instagram p1', agora })
  assert.deepEqual(linhasValidas(t1), [linha('instagram', 'p1')])
  assert.match(t1, /--apagar p1/)
  const t2 = gravarPublicacao(t1, { linhas: [linha('instagram', 'p1'), linha('tiktok', '?', 'incerto')], evento: 'tiktok incerto', agora })
  assert.deepEqual(idsValidosAgora(t2), ['p1'])
  assert.equal(linhasValidas(t2)[1].status, 'incerto')
  const t3 = gravarPublicacao(t2, { linhas: [], evento: 'apagado instagram p1', agora })
  assert.deepEqual(linhasValidas(t3), [])
  assert.match(t3, /nada agendado/)
  for (const ev of ['agendado instagram p1', 'tiktok incerto', 'apagado instagram p1']) assert.ok(t3.includes(ev), ev)
})

test('tirarIds tira do VALIDO AGORA so os ids pedidos e diz quais achou', () => {
  const t = gravarPublicacao('', { linhas: [{ rede: 'instagram', id: 'p1', quando: 'q', status: 'scheduled' }, { rede: 'tiktok', id: 'p2', quando: 'q', status: 'scheduled' }], evento: 'x', agora })
  const r = tirarIds(t, ['p2', 'p9'], agora)
  assert.deepEqual(r.tirados, ['p2'])
  assert.deepEqual(idsValidosAgora(r.texto), ['p1'])
  assert.equal(tirarIds('', ['p1'], agora).tirados.length, 0)
})
