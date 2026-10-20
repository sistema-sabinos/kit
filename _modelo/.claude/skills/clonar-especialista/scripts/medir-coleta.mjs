// Passo 6 da /clonar-especialista: a coleta acabou? Le a tabela do inventario.md e confere as
// condicoes que tem numero (a sexta, toda fase da carreira com fonte, e julgamento e fica na
// skill): saturacao (Guest, Namey e Chen 2020: base de 4 fontes, janela de 3, no maximo 5% de
// item novo sobre o acumulado), mais da metade de fonte primaria, 2 falas espontaneas, nenhuma
// obra propria pendente e de 10% a 15% das fontes separadas pra prova. Linha torta da tabela
// e acusada, nunca pulada calada. Ficha em fichas/ de fonte com status prova reprova (prova
// intacta), sem aceite do aluno.
// Uso (da raiz do projeto):
//   node .claude/skills/clonar-especialista/scripts/medir-coleta.mjs <pasta-do-conselheiro>
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COLUNAS = ['n', 'camada', 'tipo', 'idioma', 'ano', 'fonte', 'etiqueta', 'status', 'itens', 'novos']
const STATUS = new Set(['pendente', 'feita', 'prova', 'fora'])

const CAMADAS = new Set(['a', 'b', 'c', 'd', 'e'])
const ETIQUETAS = new Set(['verbatim', 'artifact', 'impression'])
const contagem = v => /^\d+$/.test(v)

// Linha torta: coluna faltando ou sobrando, N repetido, camada, etiqueta ou status fora da lista,
// itens ou novos que nao sao inteiro de 0 pra cima. Sai em "tortas" pelo N (ou pelo texto da
// primeira coluna, se nem N tem) e nao conta pra nada.
export function lerInventario(texto) {
  const linhas = []
  const tortas = []
  const vistos = new Set()
  String(texto ?? '').split(/\r?\n/).forEach(l => {
    const t = l.trim()
    if (!t.startsWith('|') || /^\|\s*N\s*\|/i.test(t) || /^\|[\s|:-]+\|$/.test(t)) return
    const cel = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map(c => c.trim())
    const r = Object.fromEntries(COLUNAS.map((c, i) => [c, cel[i] ?? '']))
    r.camada = r.camada.toLowerCase(); r.etiqueta = r.etiqueta.toLowerCase(); r.status = r.status.toLowerCase()
    const n = contagem(r.n) ? Number(r.n) : r.n
    const valida = cel.length === COLUNAS.length && contagem(r.n) && !vistos.has(n) && CAMADAS.has(r.camada) &&
      ETIQUETAS.has(r.etiqueta) && STATUS.has(r.status) && contagem(r.itens) && contagem(r.novos)
    if (!valida) { tortas.push(n); return }
    vistos.add(n)
    linhas.push({ ...r, n, itens: Number(r.itens), novos: Number(r.novos) })
  })
  return { linhas, tortas }
}

export function medirColeta(pasta) {
  let texto
  try { texto = readFileSync(join(pasta, 'inventario.md'), 'utf8') } catch { return { codigo: 1, linhas: [`AVISO: sem inventario.md em ${pasta}`] } }
  const { linhas, tortas } = lerInventario(texto)
  if (!linhas.length) return { codigo: 1, linhas: ['AVISO: nenhuma fonte na tabela do inventario.md'] }
  const feitas = linhas.filter(l => l.status === 'feita').sort((a, b) => a.n - b.n)
  const vivas = linhas.filter(l => l.status !== 'fora')
  const saida = []
  const marca = (ok, nome, detalhe) => saida.push(`${ok ? 'ok' : 'falta'} ${nome}: ${detalhe}`)

  // camada e poe tudo em Fatos e criticas, que o contador nao conta: entraria sempre com 0 novos
  const saturam = feitas.filter(l => l.camada !== 'e')
  const acumulado = saturam.reduce((s, l) => s + l.novos, 0)
  const janela = saturam.slice(-3).reduce((s, l) => s + l.novos, 0)
  const pct = acumulado ? (100 * janela) / acumulado : 100
  marca(saturam.length >= 7 && pct <= 5, 'saturacao', `${saturam.length} fontes lidas das camadas a a d (minimo 7), ultimas 3 delas trouxeram ${pct.toFixed(1)}% de item novo (maximo 5%)`)
  const primarias = feitas.filter(l => l.etiqueta === 'verbatim' || l.etiqueta === 'artifact').length
  marca(feitas.length > 0 && primarias * 2 > feitas.length, 'fonte primaria', `${primarias} de ${feitas.length} lidas sao da propria pessoa (precisa mais da metade)`)
  const espontaneas = feitas.filter(l => l.camada === 'b').length
  marca(espontaneas >= 2, 'fala espontanea', `${espontaneas} lidas da camada b (minimo 2)`)
  const obraPendente = linhas.filter(l => l.camada === 'a' && l.status === 'pendente').map(l => l.n)
  marca(!obraPendente.length, 'obra propria', obraPendente.length ? `pendentes: ${obraPendente.join(', ')}` : 'nenhuma pendente')
  // 10% a 15%, nunca abaixo de 10%: com 10 fontes, 1 (2 seriam 20%); com 14, 2 (1 seria 7%).
  // Quando nao cabe inteiro entre 10% e 15% (11 a 13 fontes), o minimo manda.
  const prova = linhas.filter(l => l.status === 'prova').length
  const min = Math.max(1, Math.ceil(vivas.length * 0.1))
  const max = Math.max(min, Math.floor(vivas.length * 0.15))
  const provaOk = prova >= min && prova <= max
  marca(provaOk, 'prova', `${prova} separadas de ${vivas.length} fontes (${min === max ? `exatamente ${min}` : `entre ${min} e ${max}`})`)
  // prova de terceiro (camada e) nao testa o jeito de pensar da pessoa. Nunca se aceita, igual a faixa
  const provaTerceiro = linhas.filter(l => l.status === 'prova' && l.camada === 'e').map(l => l.n)
  for (const n of provaTerceiro) saida.push(`falta prova primaria: fonte ${n} de prova vem da camada e (terceiros); troque por fonte das camadas a a d`)
  // Livro sem amostra legitima entra como fora (Passo 4): sem nenhuma obra propria lida, a persona
  // tem de dizer isso nos Limites. So avisa, nao muda o codigo de saida
  if (!feitas.some(l => l.camada === 'a')) saida.push('AVISO: nenhuma obra propria lida (camada a): diga isso nos Limites da persona')
  if (tortas.length) saida.push(`AVISO: linha torta na tabela (fonte ${tortas.join(', ')}): conserte e rode de novo`)
  // Passo 6: sem fonte nova pra buscar, o aluno pode aceitar seguir assim. Vale pras 4 primeiras
  // condicoes; prova fora da faixa e linha torta nunca se aceitam.
  const todas = saida.filter(l => l.startsWith('ok ')).length === 5
  // aceite e fases so valem no cabecalho, antes da linha de titulo da tabela
  const titulo = /^[ \t]*\|[ \t]*N[ \t]*\|/im.exec(texto)
  const cabecalho = titulo ? texto.slice(0, titulo.index) : texto
  const aceita = /^coleta-aceita:[ \t]*(.+?)[ \t]*$/m.exec(cabecalho)?.[1]
  // sexta condicao (julgamento): sem a linha fases: ninguem registrou a conferencia. So avisa
  if (!/^fases:[ \t]*\S/m.test(cabecalho)) saida.push('AVISO: fases da carreira sem conferencia registrada (linha fases: no cabecalho do inventario)')
  if (aceita && !todas) saida.push(`AVISO: coleta incompleta aceita pelo aluno: ${aceita}`)
  // fonte de prova com ficha em fichas/ chegou ao conselheiro: a prova deixou de ser cega. Nunca se
  // aceita; o ponto fraco se corrige com fonte nova ou ficha de fonte feita
  const nProva = new Set(linhas.filter(l => l.status === 'prova').map(l => l.n))
  let fichas = []
  try { fichas = readdirSync(join(pasta, 'fichas')) } catch {}
  const vazadas = [...new Set(fichas.map(f => /^(\d+)-.*\.md$/.exec(f)?.[1]).filter(Boolean).map(Number))].filter(n => nProva.has(n)).sort((a, b) => a - b)
  for (const n of vazadas) saida.push(`falta prova intacta: ficha de fonte de prova (fonte ${n})`)
  saida.push(`pendentes: ${linhas.filter(l => l.status === 'pendente').length}`)
  const ok = !tortas.length && provaOk && !provaTerceiro.length && !vazadas.length && (todas || Boolean(aceita))
  return { codigo: ok ? 0 : 1, linhas: saida }
}

function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}
if (chamadoDireto()) {
  const pasta = process.argv[2]
  if (!pasta) {
    console.error('Uso: node .claude/skills/clonar-especialista/scripts/medir-coleta.mjs <pasta-do-conselheiro>')
    process.exit(1)
  }
  const r = medirColeta(pasta)
  for (const l of r.linhas) console.log(l)
  process.exit(r.codigo)
}
