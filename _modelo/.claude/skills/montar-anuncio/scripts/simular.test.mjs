// Testes do simulador de custos. Sem Chrome: a leitura do resumo roda sobre um HTML gravado aqui.
// Rodar: node --test simular.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numero, precoParaDigitar, custoInformado, tipoDeAnuncio, argumentos, textoDeHtml, lerResumo, categoriaDoTexto, freteNaTela, lucro } from './simular.mjs'

test('numero le real brasileiro com milhar, negativo e vazio', () => {
  assert.equal(numero('R$ 1.234,56'), 1234.56)
  assert.equal(numero('-R$ 7,95'), -7.95)
  assert.equal(numero('15'), 15)
  assert.equal(numero(''), null)
  assert.equal(numero(null), null)
})

test('precoParaDigitar aceita ponto ou virgula e devolve com virgula e dois decimais', () => {
  assert.equal(precoParaDigitar('39.9'), '39,90')
  assert.equal(precoParaDigitar('39,90'), '39,90')
  assert.equal(precoParaDigitar('40'), '40,00')
  assert.throws(() => precoParaDigitar('caro'), /39,90/)
  assert.throws(() => precoParaDigitar(''), /preco invalido/)
})

test('custoInformado aceita ponto ou virgula como decimal, e recusa negativo e nao numero', () => {
  assert.equal(custoInformado('30.00'), 30)
  assert.equal(custoInformado('22,5'), 22.5)
  assert.equal(custoInformado('15'), 15)
  assert.throws(() => custoInformado('caro'), /custo invalido/)
  assert.throws(() => custoInformado('-1'), /custo invalido/)
  assert.throws(() => custoInformado(''), /custo invalido/)
  assert.throws(() => custoInformado('  '), /custo invalido/)
})

test('tipoDeAnuncio aceita sem acento e sem maiuscula, e recusa o resto', () => {
  assert.equal(tipoDeAnuncio('classico'), 'Clássico')
  assert.equal(tipoDeAnuncio('CLÁSSICO'), 'Clássico')
  assert.equal(tipoDeAnuncio('Premium'), 'Premium')
  assert.equal(tipoDeAnuncio(undefined), 'Clássico')
  assert.throws(() => tipoDeAnuncio('ouro'), /classico ou premium/)
})

test('argumentos monta o pedido do jeito que o auditor chama, e explica o que falta', () => {
  const a = argumentos(['--termo', 'bala de coco', '--preco', '39,90', '--tipo', 'premium', '--frete', 'gratis', '--custo', '15'])
  assert.deepEqual(a, { termo: 'bala de coco', preco: '39,90', tipo: 'Premium', frete: 'gratis', custo: 15 })
  assert.equal(argumentos(['--termo', 'x', '--preco', '10']).custo, null)
  assert.throws(() => argumentos(['--preco', '10']), /--termo/)
  assert.throws(() => argumentos(['--termo', 'x']), /faltou --preco/)
  assert.throws(() => argumentos(['--termo', 'x', '--preco', '10', '--frete', 'talvez']), /gratis ou comprador/)
  assert.equal(argumentos(['--termo', 'x', '--preco', '10', '--custo', '30.00']).custo, 30)
  assert.throws(() => argumentos(['--termo', 'x', '--preco', '10', '--custo']), /--custo/)
})

// Pagina do simulador gravada: o script no topo repete o rotulo em JSON, o rodape repete em frase.
// Nenhum dos dois pode contaminar a leitura.
const HTML_GRAVADO = `<!doctype html><html><head><title>Simulador</title><style>.x{display:none}</style></head><body>
<script>window.__dados = {"Você recebe": "nada"}</script>
<nav><span>Envios no Mercado Livre</span></nav>
<section class="resumo">
  <div><span>Tarifa de venda</span><span>R$ 6,79</span></div>
  <div><span>Custo de envio</span><span>R$ 7,95</span></div>
  <div><h3>Você recebe</h3><p>R$ 25,16</p></div>
</section>
<footer><p>Você recebe o pagamento em até 14 dias.</p></footer>
</body></html>`

test('lerResumo tira tarifa, envio e "Voce recebe" do HTML gravado, ignorando script e rodape', () => {
  const r = lerResumo(textoDeHtml(HTML_GRAVADO))
  assert.deepEqual(r, { tarifa_venda: 6.79, custo_envio: 7.95, voce_recebe: 25.16 })
})

// innerText ao vivo pode por rotulo e valor na mesma linha, e o rodape traz outros R$.
test('lerResumo le rotulo e valor na mesma linha e nao pega R$ do rodape', () => {
  const linhas = ['Tarifa de venda R$ 6,79', 'Custo de envio R$ 7,95', 'Você recebe R$ 25,16', 'Frete grátis a partir de R$ 79,00']
  assert.deepEqual(lerResumo(linhas.join('\n')), { tarifa_venda: 6.79, custo_envio: 7.95, voce_recebe: 25.16 })
  const comAviso = [...linhas.slice(0, 3), 'Você recebe o pagamento em até 14 dias.', 'Frete grátis a partir de R$ 79,00']
  assert.deepEqual(lerResumo(comAviso.join('\n')), { tarifa_venda: 6.79, custo_envio: 7.95, voce_recebe: 25.16 })
})

test('lerResumo deixa o envio nulo quando o rotulo vem sem valor, sem pegar o numero do "Voce recebe"', () => {
  const t = ['Tarifa de venda', 'R$ 6,79', 'Custo de envio', 'Você recebe', 'R$ 25,16'].join('\n')
  assert.deepEqual(lerResumo(t), { tarifa_venda: 6.79, custo_envio: null, voce_recebe: 25.16 })
  const t2 = ['Tarifa de venda R$ 6,79', 'Envio grátis por sua conta', 'Você recebe R$ 25,16'].join('\n')
  assert.deepEqual(lerResumo(t2), { tarifa_venda: 6.79, custo_envio: null, voce_recebe: 25.16 })
})

test('pagina sem resumo devolve texto (nao vazio) e valores nulos, nunca numero inventado', () => {
  const t = textoDeHtml('<html><body><h1>Simulador de custos</h1><p>Escolha uma categoria para começar.</p></body></html>')
  assert.ok(t.trim().length > 0)
  assert.deepEqual(lerResumo(t), { tarifa_venda: null, custo_envio: null, voce_recebe: null })
})

// Tela real do simulador, conferida ao vivo em 2026-09-24 (Chrome dedicado, conta logada), gravada
// sem o cabecalho que tinha o nome da conta. Os valores de tarifa e envio ficam varias linhas abaixo
// do rotulo, com texto explicativo no meio: e o caso que a leitura por linha seguinte nao pegava.
// Copia byte-exata do texto gravado, inclusive o espaco fixo (NBSP, U+00A0) entre "R$" e o numero
// que a pagina real usa.
const TELA_2026_09_24 = `Simulador de custos
Calcule os custos do seu anúncio para ter uma estimativa do quanto você receberá por cada venda. Observe que o resultado dependerá das condições de venda selecionadas.
A categoria escolhida
Criar nova simulação
Cadernos e cadernetas
Arte
Papelaria e Armarinho
Materiais Escolares
Escolar
Cadernos
Qual é a condição do produto?
Novo
Preço do anúncio
R$
Custos estimados
Conferir tudo sobre custos
Tarifa de venda
Tipo de anúncio:
Clássico
-R$ 3,67
Você pagará 11,5% por cada venda.
Custo de envio
Forma de envio:
Envios no Mercado Livre
Você não oferece frete grátis
-R$ 7,15
Por conta do comprador.
Preço do anúncio
R$ 31,90
Custos estimados
-R$ 10,82
Você recebe
R$ 21,08`

test('lerResumo tira tarifa, envio e "Voce recebe" da tela real de 2026-09-24, com o valor varias linhas abaixo do rotulo', () => {
  assert.deepEqual(lerResumo(TELA_2026_09_24), { tarifa_venda: 3.67, custo_envio: 7.15, voce_recebe: 21.08 })
})

test('categoriaDoTexto pega a primeira linha depois de "Criar nova simulacao", e null sem o bloco', () => {
  assert.equal(categoriaDoTexto(TELA_2026_09_24), 'Cadernos e cadernetas')
  assert.equal(categoriaDoTexto('Simulador de custos\nPreço do anúncio'), null)
})

// tarifa_venda e custo_envio sao sempre custo (o modulo do que a pagina mostra); "Voce recebe" e o
// que sobra pro vendedor e pode ficar negativo (prejuizo), e isso tem que aparecer no numero.
test('lerResumo mantem o sinal de "Voce recebe" (prejuizo fica negativo); so tarifa e envio saem em modulo', () => {
  const t = ['Tarifa de venda R$ 6,79', 'Custo de envio R$ 7,95', 'Você recebe', '-R$ 1,30'].join('\n')
  assert.deepEqual(lerResumo(t), { tarifa_venda: 6.79, custo_envio: 7.95, voce_recebe: -1.3 })
})

// Na tela real, "Preço do anúncio" e "R$ 31,90" ficam entre "Custo de envio" e "Custos estimados".
// Sem a linha do valor do envio (ex.: a pagina ainda carregando), o bloco do envio nao pode
// atravessar esse rotulo e pegar o preco do anuncio como se fosse o custo do frete.
test('lerResumo deixa o envio nulo (nao pega "Preco do anuncio") quando falta a linha de valor do envio na tela real', () => {
  const semValorDeEnvio = TELA_2026_09_24.split('\n').filter(l => l !== '-R$ 7,15').join('\n')
  assert.deepEqual(lerResumo(semValorDeEnvio), { tarifa_venda: 3.67, custo_envio: null, voce_recebe: 21.08 })
})

// Segunda tela real, premium + frete gratis a R$ 89,90, conferida ao vivo em 2026-09-24. Acima de
// R$ 79 o frete gratis e obrigatorio, e o bloco do envio tem DOIS valores: o custo cheio e o custo
// depois do desconto por reputacao (14,83 + 14,45 = 29,28 = Custos estimados). Copia byte-exata,
// NBSP incluido.
const TELA_PREMIUM_GRATIS_2026_09_24 = `Simulador de custos
Calcule os custos do seu anúncio para ter uma estimativa do quanto você receberá por cada venda. Observe que o resultado dependerá das condições de venda selecionadas.
A categoria escolhida
Criar nova simulação
Cadernos e cadernetas
Arte
Papelaria e Armarinho
Materiais Escolares
Escolar
Cadernos
Qual é a condição do produto?
Novo
Preço do anúncio
R$
Custos estimados
Conferir tudo sobre custos
Tarifa de venda
Tipo de anúncio:
Premium
3x sem acréscimo
-R$ 14,83
Você pagará 16,5% por cada venda.
Custo de envio
Forma de envio:
Envios no Mercado Livre
Você oferece frete grátis
-R$ 28,90
-R$ 14,45
Nós cobrimos o 50% pela sua reputação!
Preço do anúncio
R$ 89,90
Custos estimados
-R$ 29,28
Você recebe
R$ 60,62`

test('lerResumo pega o valor do envio que bate com tarifa + envio = Custos estimados, na tela premium + frete gratis', () => {
  assert.deepEqual(lerResumo(TELA_PREMIUM_GRATIS_2026_09_24), { tarifa_venda: 14.83, custo_envio: 14.45, voce_recebe: 60.62 })
})

test('categoriaDoTexto tambem funciona na tela premium + frete gratis', () => {
  assert.equal(categoriaDoTexto(TELA_PREMIUM_GRATIS_2026_09_24), 'Cadernos e cadernetas')
})

// "Pegar o ultimo valor do bloco" sozinho e fragil: uma linha extra de dinheiro depois do desconto
// (rodape, cross-sell, qualquer coisa que a pagina acrescente) viraria o custo_envio errado. A
// pagina da uma conferencia de verdade: tarifa + envio = Custos estimados (3,67 + 7,15 = 10,82 e
// 14,83 + 14,45 = 29,28 nas duas telas gravadas). Com Custos estimados disponivel, o envio e o
// candidato do bloco que bate essa soma (tolerancia de 1 centavo), nunca "o ultimo que aparecer".
test('lerResumo nao pega uma linha de dinheiro extra depois do desconto do envio: usa a conferencia com Custos estimados', () => {
  const comLinhaExtra = TELA_PREMIUM_GRATIS_2026_09_24.replace(
    '-R$ 14,45\nNós cobrimos',
    '-R$ 14,45\n-R$ 3,00\nNós cobrimos',
  )
  assert.notEqual(comLinhaExtra, TELA_PREMIUM_GRATIS_2026_09_24) // confere que o replace achou a linha
  assert.deepEqual(lerResumo(comLinhaExtra), { tarifa_venda: 14.83, custo_envio: 14.45, voce_recebe: 60.62 })
})

test('lerResumo devolve custo_envio nulo (nunca chuta) quando nenhum candidato do bloco bate com Custos estimados', () => {
  const t = ['Tarifa de venda', 'R$ 6,79', 'Custo de envio', 'R$ 7,95', 'Custos estimados', '-R$ 99,99', 'Você recebe', 'R$ 25,16'].join('\n')
  assert.deepEqual(lerResumo(t), { tarifa_venda: 6.79, custo_envio: null, voce_recebe: 25.16 })
})

// Com "Custos estimados" na tela, o envio so sai de um candidato que passou na conferencia. Sem
// tarifa nao da pra conferir, entao nada de cair pro "ultimo do bloco".
test('lerResumo devolve custo_envio nulo quando ha Custos estimados mas falta a tarifa pra conferir', () => {
  const t = ['Custo de envio', 'R$ 7,95', '-R$ 3,00', 'Custos estimados', '-R$ 99,99', 'Você recebe', 'R$ 25,16'].join('\n')
  assert.deepEqual(lerResumo(t), { tarifa_venda: null, custo_envio: null, voce_recebe: 25.16 })
})

// Dois candidatos iguais batem a conferencia ao mesmo tempo (7,00 e -7,00 em modulo): escolher um
// seria chute, entao fica nulo.
test('lerResumo devolve custo_envio nulo quando mais de um candidato bate a conferencia', () => {
  const t = ['Tarifa de venda', 'R$ 3,00', 'Custo de envio', 'R$ 7,00', '-R$ 7,00', 'Custos estimados', '-R$ 10,00', 'Você recebe', 'R$ 20,00'].join('\n')
  assert.deepEqual(lerResumo(t), { tarifa_venda: 3, custo_envio: null, voce_recebe: 20 })
})

// Acima de R$ 79 o frete gratis e obrigatorio: nao existe dropdown nem cartao pra escolher, so a
// linha fixa do resumo. freteNaTela confere se a tela ja mostra a opcao pedida sem precisar clicar.
test('freteNaTela acha a linha do frete pedido no bloco do envio, e false quando a tela nao mostra', () => {
  assert.equal(freteNaTela(TELA_PREMIUM_GRATIS_2026_09_24, 'Você oferece frete grátis'), true)
  assert.equal(freteNaTela(TELA_PREMIUM_GRATIS_2026_09_24, 'Você não oferece frete grátis'), false)
  assert.equal(freteNaTela(TELA_2026_09_24, 'Você não oferece frete grátis'), true)
  assert.equal(freteNaTela(TELA_2026_09_24, 'Você oferece frete grátis'), false)
  assert.equal(freteNaTela('', 'Você oferece frete grátis'), false)
  assert.equal(freteNaTela(null, 'Você oferece frete grátis'), false)
})

// Bloco da tarifa com dois candidatos (cheia e com desconto), igual ja acontecia so no bloco do
// envio: com "Custos estimados" na tela, so o candidato de tarifa que fecha a conta com o envio
// sai, nunca o primeiro do bloco sem conferir.
test('lerResumo usa a tarifa com desconto quando so ela fecha a conta com o envio (bloco da tarifa com dois valores)', () => {
  const t = ['Tarifa de venda', 'R$ 9,00', 'R$ 6,79', 'Custo de envio', 'R$ 7,95', 'Custos estimados', '-R$ 14,74', 'Você recebe', 'R$ 25,16'].join('\n')
  assert.deepEqual(lerResumo(t), { tarifa_venda: 6.79, custo_envio: 7.95, voce_recebe: 25.16 })
})

test('lucro tira imposto e custo do "Voce recebe", e exige o imposto da configuracao', () => {
  const l = lucro({ voceRecebe: 25.16, preco: 39.9, custo: 15, impostoPct: 6 })
  assert.deepEqual(l, { imposto: 2.39, custo: 15, lucro_liquido: 7.77, margem_pct: 19.46 })
  assert.throws(() => lucro({ voceRecebe: 25.16, preco: 39.9, custo: 15 }), /imposto_pct/)
})

test('lucro com imposto 0 (MEI) calcula sem erro', () => {
  const r = lucro({ voceRecebe: 80, preco: 100, custo: 50, impostoPct: 0 })
  assert.equal(r.imposto, 0)
  assert.equal(r.lucro_liquido, 30)
})
