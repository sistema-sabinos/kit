// Testes da publicacao de verdade (o --confirmar). Sem rede: deposito e Buffer sao falsos que registram a ordem,
// e cada gravacao do publicacao.md fica guardada pra conferir o registro passo a passo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { argumentos, publicar, conferirFila } from './publicar-social.mjs'
import { linhasValidas, gravarPublicacao } from './plano.mjs'
import { ErroIncerto } from '../../midia-social/scripts/lib/agendador-buffer.mjs'

const QUANDO = '2026-10-10 11:30'
const DUE = '2026-10-10T14:30:00.000Z'
const CONFIG = { canal_instagram: 'canal-ig', canal_tiktok: 'canal-tt', canal_youtube: 'canal-yt' }
const agora = () => new Date('2026-10-04T12:00:00Z')
const post = (rede, canal) => ({ rede, channelId: canal, text: 't', midia: 'video', metadata: {} })
const planoVideo = (redes = ['instagram', 'tiktok']) => ({ tipo: 'video', arquivos: ['producao/p/final/v.mp4'], dueAt: DUE, capaMs: 2500, posts: redes.map(r => post(r, CONFIG[`canal_${r}`])) })
const linha = (rede, id, status = 'scheduled') => ({ rede, id, quando: QUANDO, status })
const registro = linhas => gravarPublicacao('', { linhas, evento: 'antes', agora: agora() })

function falsos({ criarFalhaEm, criarIncertoEm, apagarFalha, subirFalha, achado = null, acharFalha, pendentes = {}, consulta } = {}) {
  const log = [], gravacoes = []
  let n = 0
  return { log, gravacoes, deps: {
    subir: async (arq, chave) => { log.push(['subir', chave]); if (subirFalha) throw new Error('Cloudinary recusou'); return `https://dep/${chave}` },
    criarPost: async p => {
      log.push(['criar', p.channelId, p.videoUrl || p.imagensUrls, p.capaMs])
      if (p.channelId === criarIncertoEm) throw new ErroIncerto('caiu, conferir')
      if (p.channelId === criarFalhaEm) throw new Error('recusou')
      return { id: `novo-${++n}`, status: 'scheduled' }
    },
    apagarPost: async id => { log.push(['apagar', id]); if (apagarFalha && apagarFalha[id]) throw apagarFalha[id] },
    consultarPost: async id => { log.push(['consultar', id]); if (consulta instanceof Error) throw consulta; return consulta || { id, status: 'scheduled' } },
    pendentes: async ids => Object.fromEntries(ids.map(c => [c, pendentes[c] || 0])),
    acharPost: async (canal, due) => { log.push(['achar', canal, due]); if (acharFalha) throw new Error('Buffer fora'); return achado },
    gravar: texto => gravacoes.push(texto),
  } }
}

const base = (extra = {}) => ({ quando: QUANDO, substituir: false, slug: 'p', config: CONFIG, agora, ...extra })

test('argumentos', () => {
  assert.deepEqual(argumentos(['p', '--quando', QUANDO, '--capa', '2', '--redes', 'instagram, tiktok', '--confirmar']),
    { pasta: 'p', quando: QUANDO, capa: '2', redes: ['instagram', 'tiktok'], confirmar: true, substituir: false, apagar: null })
  assert.deepEqual(argumentos(['--apagar', 'a,b']).apagar, ['a', 'b'])
  assert.throws(() => argumentos(['p', '--redes']), /--redes/)
})

test('caminho feliz: sobe uma vez, cria um post por rede e grava o registro depois de cada um', async () => {
  const f = falsos()
  const r = await publicar({ ...base(), plano: planoVideo(), textoPub: '', deps: f.deps })
  assert.equal(r.falha, null)
  assert.equal(f.log.filter(x => x[0] === 'subir').length, 1)
  assert.deepEqual(f.log[1], ['criar', 'canal-ig', 'https://dep/sabinos/p/v.mp4', 2500])
  assert.equal(f.gravacoes.length, 2)
  assert.deepEqual(linhasValidas(f.gravacoes[0]).map(l => l.id), ['novo-1'])
  assert.deepEqual(linhasValidas(f.gravacoes[1]).map(l => l.id), ['novo-1', 'novo-2'])
})

test('repetir sem --substituir e barrado antes de subir qualquer coisa', async () => {
  const f = falsos()
  await assert.rejects(publicar({ ...base(), plano: planoVideo(), textoPub: registro([linha('instagram', 'velho-1')]), deps: f.deps }), /--substituir/)
  assert.deepEqual(f.log, [])
})

test('C2: com --substituir, upload que falha nao apaga nada', async () => {
  const f = falsos({ subirFalha: true })
  await assert.rejects(publicar({ ...base({ substituir: true }), plano: planoVideo(), textoPub: registro([linha('instagram', 'velho-1')]), deps: f.deps }), /nada foi apagado/i)
  assert.equal(f.log.filter(x => x[0] === 'apagar').length, 0)
  assert.equal(f.gravacoes.length, 0)
})

test('C2: horario que venceu durante o upload para antes de apagar', async () => {
  const f = falsos()
  // a primeira hora que o publicar consulta e a reconferencia depois do upload: ja passou do limite
  const relogio = () => new Date('2026-10-10T14:29:00Z')
  await assert.rejects(publicar({ ...base({ substituir: true, agora: relogio }), plano: planoVideo(), textoPub: registro([linha('instagram', 'velho-1')]), deps: f.deps }), /5 minutos/)
  assert.equal(f.log.filter(x => x[0] === 'apagar').length, 0)
})

test('I2: apagar que falha no meio grava o que ja foi apagado e para sem criar nada', async () => {
  const f = falsos({ apagarFalha: { 'velho-2': new ErroIncerto('caiu ao apagar') } })
  const r = await publicar({ ...base({ substituir: true }), plano: planoVideo(), textoPub: registro([linha('instagram', 'velho-1'), linha('tiktok', 'velho-2')]), deps: f.deps })
  assert.equal(r.falha.etapa, 'apagar')
  assert.equal(f.log.filter(x => x[0] === 'criar').length, 0)
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => l.id), ['velho-2'])
})

test('apagar post que nao existe mais no Buffer conta como apagado', async () => {
  const f = falsos({ apagarFalha: { 'velho-1': new Error('Buffer nao apagou velho-1: not found') }, consulta: new Error('Buffer: Post not found') })
  const r = await publicar({ ...base({ substituir: true }), plano: planoVideo(['instagram']), textoPub: registro([linha('instagram', 'velho-1')]), deps: f.deps })
  assert.equal(r.falha, null)
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => l.id), ['novo-1'])
})

test('post antigo que ja foi publicado nao e substituido', async () => {
  const f = falsos({ apagarFalha: { 'velho-1': new Error('cannot delete') }, consulta: { id: 'velho-1', status: 'sent' } })
  const r = await publicar({ ...base({ substituir: true }), plano: planoVideo(['instagram']), textoPub: registro([linha('instagram', 'velho-1')]), deps: f.deps })
  assert.match(r.falha.erro, /ja foi publicado/)
  assert.equal(f.log.filter(x => x[0] === 'criar').length, 0)
})

test('I4: --substituir com --redes so apaga as redes pedidas e mantem as outras no registro', async () => {
  const f = falsos()
  const r = await publicar({ ...base({ substituir: true }), plano: planoVideo(['tiktok']), textoPub: registro([linha('instagram', 'velho-1'), linha('tiktok', 'velho-2')]), deps: f.deps })
  assert.equal(r.falha, null)
  assert.deepEqual(f.log.filter(x => x[0] === 'apagar').map(x => x[1]), ['velho-2'])
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => `${l.rede}:${l.id}`), ['instagram:velho-1', 'tiktok:novo-1'])
})

test('rede que faltou depois de falha parcial entra sem --substituir', async () => {
  const f = falsos()
  const r = await publicar({ ...base(), plano: planoVideo(['tiktok']), textoPub: registro([linha('instagram', 'velho-1')]), deps: f.deps })
  assert.equal(r.falha, null)
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => l.rede), ['instagram', 'tiktok'])
})

test('I3: rede que cai no criar e o post aparece no Buffer conta como criado', async () => {
  const f = falsos({ criarIncertoEm: 'canal-tt', achado: 'achado-9' })
  const r = await publicar({ ...base(), plano: planoVideo(), textoPub: '', deps: f.deps })
  assert.equal(r.falha, null)
  assert.deepEqual(f.log.find(x => x[0] === 'achar'), ['achar', 'canal-tt', DUE])
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => l.id), ['novo-1', 'achado-9'])
})

test('I3: rede que cai e o Buffer nao responde deixa linha incerta e o proximo --confirmar resolve', async () => {
  const f = falsos({ criarIncertoEm: 'canal-tt', acharFalha: true })
  const r = await publicar({ ...base(), plano: planoVideo(), textoPub: '', deps: f.deps })
  assert.equal(r.falha.incerto, true)
  const texto = f.gravacoes.at(-1)
  assert.deepEqual(linhasValidas(texto).map(l => `${l.rede}:${l.id}:${l.status}`), ['instagram:novo-1:scheduled', 'tiktok:?:incerto'])
  const g = falsos({ achado: 'achado-tt' })
  await assert.rejects(publicar({ ...base(), plano: planoVideo(['tiktok']), textoPub: texto, deps: g.deps }), /--substituir/)
  assert.ok(linhasValidas(g.gravacoes[0]).some(l => l.id === 'achado-tt' && l.status === 'scheduled'))
})

test('I3: linha incerta que nao esta no Buffer some e a rede pode ser criada de novo', async () => {
  const texto = registro([linha('instagram', 'novo-1'), linha('tiktok', '?', 'incerto')])
  const f = falsos({ achado: null })
  const r = await publicar({ ...base(), plano: planoVideo(['tiktok']), textoPub: texto, deps: f.deps })
  assert.equal(r.falha, null)
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => `${l.rede}:${l.id}`), ['instagram:novo-1', 'tiktok:novo-1'])
})

test('I5: falha comum na segunda rede deixa a primeira gravada e para', async () => {
  const f = falsos({ criarFalhaEm: 'canal-tt' })
  const r = await publicar({ ...base(), plano: planoVideo(['instagram', 'tiktok', 'youtube']), textoPub: '', deps: f.deps })
  assert.equal(r.falha.rede, 'tiktok')
  assert.equal(f.log.filter(x => x[0] === 'criar').length, 2)
  assert.deepEqual(linhasValidas(f.gravacoes.at(-1)).map(l => l.id), ['novo-1'])
  assert.deepEqual(r.feitos.map(x => x.id), ['novo-1'])
})

test('carrossel sobe cada slide e manda as urls na ordem; TikTok usa o 9:16 quando existe', async () => {
  const plano = { tipo: 'carrossel', dueAt: DUE, slides: ['f/slide-01.png', 'f/slide-02.png'], slides916: ['g/slide-01.png', 'g/slide-02.png'], arquivos: [], posts: [
    { ...post('instagram', 'canal-ig'), midia: 'slides' }, { ...post('tiktok', 'canal-tt'), midia: 'slides916' },
  ] }
  const f = falsos()
  await publicar({ ...base(), plano, textoPub: '', deps: f.deps })
  const criados = f.log.filter(x => x[0] === 'criar')
  assert.deepEqual(criados[0][2], ['https://dep/sabinos/p/slide-01.png', 'https://dep/sabinos/p/slide-02.png'])
  assert.deepEqual(criados[1][2], ['https://dep/sabinos/p/916/slide-01.png', 'https://dep/sabinos/p/916/slide-02.png'])
})

test('conferirFila recusa canal cheio e desconta os antigos que o --substituir vai apagar', () => {
  const posts = [post('tiktok', 'canal-tt')]
  assert.throws(() => conferirFila({ pendentes: { 'canal-tt': 10 }, posts, saem: {} }), /tiktok.*10/)
  assert.doesNotThrow(() => conferirFila({ pendentes: { 'canal-tt': 9 }, posts, saem: {} }))
  assert.doesNotThrow(() => conferirFila({ pendentes: { 'canal-tt': 10 }, posts, saem: { 'canal-tt': 1 } }))
})
