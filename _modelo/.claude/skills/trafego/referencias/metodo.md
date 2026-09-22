# O método do /trafego, por extenso

Este arquivo é carregado pela skill só quando a conversa precisa entrar em detalhe. O resumo do
dia a dia mora na própria conversa; aqui fica o método completo, pra quem quer entender o porquê
de cada número.

## As quatro faixas, sempre no anúncio

O `/trafego` nunca decide olhando a campanha inteira. Ele olha anúncio por anúncio, e cada anúncio
cai numa de quatro faixas:

| Faixa | Quando acontece | O que a régua propõe |
|---|---|---|
| RONDA | Gastou menos de 1 ticket (o que é um ticket está explicado abaixo), ou ainda não deu pra provar nem reprovar. | Deixar rodar. |
| AVISO | O CTR (quantas pessoas clicaram depois de ver o anúncio) caiu 20% ou mais, com o CPM (custo de mostrar o anúncio pra mil pessoas) variando menos de 15%. Ou, só em negócio local, a frequência (quantas vezes em média a mesma pessoa já viu o anúncio) passou de 3. | Preparar um ângulo novo, sem mexer na verba. |
| CRÍTICO | Gastou mais de 1 ticket sem nenhum resultado. Ou já gastou mais da metade da fatia diária dele com retorno abaixo do piso de empate, com 5 resultados ou mais (as três proteções da seção seguinte entram antes de qualquer corte). | Pausar. |
| PASSE | 5 resultados ou mais com retorno acima do ponto de aprovação da régua. | Liberar mais verba. |

Se mais de 10 anúncios caírem em CRÍTICO na mesma rodada, a régua não entrega a lista de corte. Ela
avisa que o ticket provavelmente está errado, porque uma rodada com mais de dez cortes de uma vez é
sinal de régua errada, não de dia ruim.

São quatro faixas, e não três, porque criativo cansando e criativo queimando pedem coisas opostas.
Um anúncio cansando ainda merece confiança: as pessoas continuam vendo, só pararam de clicar, e a
resposta certa é trocar o ângulo do criativo sem tirar a verba dele. Um anúncio queimando dinheiro
pede o oposto: tirar a verba, pausar. Se as duas situações caíssem na mesma faixa amarela genérica,
a régua não saberia qual das duas respostas dar, e o dono receberia uma proposta errada pra um dos
dois casos.

## Por que sempre anúncio por anúncio

Campanha é a pasta que agrupa vários anúncios competindo pelo mesmo público e pela mesma verba.
Olhar o número da campanha inteira esconde o que está acontecendo dentro dela, porque campanha é
soma, e soma esconde: um anúncio bom paga a conta de um anúncio ruim, e o resultado somado parece
razoável mesmo com um anúncio péssimo lá dentro, sangrando verba sem que ninguém perceba qual é.
Por isso o método classifica sempre no nível do anúncio, nunca no da campanha.

## O ticket

Ticket é quanto vale, em reais, um resultado: uma venda, um lead, uma conversa que virou cliente.

Quando o objetivo é compra, o ticket é o preço do produto, direto.

Quando o objetivo é lead ou conversa, não existe um preço de prateleira pra usar, então o ticket
sai desta conta:

`(fecham_em_10 / 10) × valor_do_cliente × fatia_pro_anuncio`

- `fecham_em_10`: de cada 10 pessoas que entram em contato, quantas de fato viram cliente pagante.
- `valor_do_cliente`: quanto esse cliente paga.
- `fatia_pro_anuncio`: que fatia dessa receita pode, com folga, ir pra pagar o anúncio, depois de
  custo, imposto e o resto da operação.

Dois exemplos:

Uma consultoria de ticket alto: de cada 10 contatos, 2 fecham. Cada cliente paga R$ 5.000, e 20%
dessa receita pode ir pra anúncio. Dois décimos de 5.000 são 1.000, e um quinto disso são R$ 200. O
ticket desse negócio é R$ 200.

Um consultório: de cada 10 conversas, 3 viram paciente. Cada paciente paga R$ 800, e 25% pode ir
pra anúncio. Três décimos de 800 são 240, e um quarto disso são R$ 60. O ticket desse negócio é
R$ 60.

Todo limite do método é múltiplo do ticket, nunca um valor fixo em reais. Quando o preço muda, a
régua acompanha sozinha, sem precisar editar número nenhum.

## O ponto de empate

Retorno é quanto voltou pra cada real gasto em anúncio: receita dividida por gasto. O ponto de
empate é o retorno a partir do qual o anúncio já se pagou.

Não existe campo pra digitar esse número, de propósito. Se desse pra digitar, alguém digitaria
1,00, e a régua perderia o sentido: retorno 1,00 só seria mesmo o empate se cada real que entra no
caixa apontasse pra um anúncio específico. Na prática, parte da receita vem de outro lugar (cliente
antigo, indicação, busca orgânica, link sem rastreio), nunca aparece na tela de resultado de nenhum
anúncio, e contar com retorno 1,00 pra decidir corte julgaria o anúncio pela receita que ele não
gerou.

A régua olha o campo `origem_do_resultado` da régua do negócio pra escolher entre duas rotas:

- Só o valor exato `checkout` liga a conta pelo caixa. Quando existe export do checkout com o
  identificador do anúncio na UTM, dá pra medir a cobertura: quanto da receita paga realmente
  aponta pra um anúncio. Esse número vira o piso, e a aprovação fica no meio do caminho entre o
  piso e 1,00. Quando a margem mínima declarada empurra esse piso pra 1,00 ou mais, a média
  cairia em cima do próprio piso, e aí vale o mesmo multiplicador da outra rota.
- Qualquer outro valor quer dizer que quem contou o resultado foi a própria plataforma de anúncio,
  não o caixa. A plataforma conta a conversão na data do clique e credita até quem só viu o
  anúncio sem clicar, o que infla o número. Por isso a régua fica mais rígida: piso 1,00 e
  aprovação 30% acima do piso, que nesse caso dá 1,30. Essa regra vale pra qualquer origem que
  não seja checkout, o que a deixa pronta pra funcionar sem mudar nada no dia em que entrar uma
  segunda plataforma de anúncio no kit.

O piso final é sempre o maior valor entre o que foi medido (ou o piso fixo de 1,00, quando o
resultado vem da plataforma) e a margem mínima que o dono declarar na régua, porque um retorno
empatado num produto de margem apertada já pode dar prejuízo depois de taxa e imposto.

Os 30% de folga são multiplicador do piso, e nunca um número absoluto. Com número absoluto,
qualquer margem mínima declarada a partir de 1,30 fazia piso e aprovação virarem o mesmo valor:
a zona neutra sumia e a régua liberava verba pra um anúncio parado no empate, de lucro zero. A
margem mínima sai de 1 dividido pela margem de contribuição, então margem de 50% empata em 2,00
e margem de 30% empata em 3,33: quem preenche o campo direito passa de 1,30 quase sempre.

## As três proteções contra corte errado

1. Condenar por retorno exige o mesmo volume que aprovar. Com menos de 5 resultados, o retorno é
   pouco confiável: uma venda a mais ou a menos move o número num terço inteiro. Um anúncio com
   menos de 5 resultados e retorno abaixo do piso volta como RONDA vigiada, não CRÍTICO. O caso que
   originou essa proteção: um anúncio foi pausado com retorno 0,7948 sobre só 3 vendas, a milésimos
   do piso, e religado depois fechou em 2,10. A diferença inteira era ruído de amostra pequena, não
   anúncio ruim.

2. Janela curta não apaga resultado acumulado. Se o retorno dos últimos 7 dias está acima do piso
   e teve pelo menos 1 resultado nesse período, o corte de hoje espera. O caso que originou essa
   proteção: um anúncio com retorno 2,51 na semana foi pausado por causa de três dias magros
   seguidos. Um dia ruim sozinho não apaga uma semana inteira que já se pagou.

3. Piso de margem por conta. A cobertura medida diz onde o número vira ruído; a margem mínima que
   o dono declara na régua diz onde a venda vira prejuízo de verdade, depois de taxa e imposto.
   Vale a maior das duas. O caso que originou essa proteção: um produto de R$ 37 onde um retorno de
   1,00 no papel, empatado, já é prejuízo de verdade, porque taxa de cartão e imposto comem parte
   antes de sobrar alguma coisa.

## Os quatro perfis de nicho

Cada perfil é um preset que a entrevista oferece. A estrutura é o desenho sugerido do teste,
escrito como campanhas-conjuntos-anúncios: quantas campanhas, quantos conjuntos de anúncio (que
dividem o público testado) e quantos anúncios entram em cada um. O perfil também sugere o
orçamento diário e diz quantos dias esperar antes de julgar. Os limites de corte, o que vira
RONDA, AVISO, CRÍTICO ou PASSE, são os mesmos em qualquer perfil: só o contexto em volta muda.

| Perfil | Estrutura | Orçamento diário sugerido | Até o Passe |
|---|---|---|---|
| Alto ticket | 1-5-1 | 2 vezes o custo de um checkout iniciado, por conjunto | cerca de 9 dias |
| Low ticket | 1-3-1 | 1,5 vezes o ticket | cerca de 3 dias |
| Leads e serviço | 1-3-1 | meio ticket, mínimo R$ 30 | cerca de 10 dias |
| Negócio local | 1-1-2 | R$ 30 a R$ 50 | pelo menos 14 dias |

No perfil de leads, a otimização mira um evento raso da conversa, não só o fechamento, porque
julgar pelo contrato assinado nos primeiros 30 dias mede tempo de negociação, não qualidade do
anúncio. No negócio local, a régua também lê a frequência: acima de 3, é sinal de que o público de
bairro já saturou, e o anúncio entra em AVISO. Isso vale só pro perfil local, porque só ali o
público é pequeno o bastante pra saturar rápido.

## Monte o seu: as três perguntas

Nem todo negócio cabe nos quatro perfis acima. Pra montar uma régua própria, três perguntas
bastam, e o resto se deduz:

1. O que conta como resultado pra esse negócio? Uma venda, um lead, um agendamento, outra coisa?
2. Quanto vale um resultado desses, em reais? Se o resultado tem preço direto, é ele. Se não tem,
   usa a conta do ticket explicada acima.
3. Quanto tempo, em média, leva entre o clique no anúncio e esse resultado acontecer de verdade? É
   esse prazo que diz quantos dias esperar antes de julgar o anúncio.

## De onde vêm os números

Os limiares desta régua (1 ticket gasto sem resultado pra cortar, 5 resultados pra aprovar ou pra
condenar por retorno, e aprovação 30% acima do piso quando o resultado vem só da plataforma) foram
medidos por fora, em agosto e setembro de 2026, sobre 5.884 linhas de anúncio por dia, em duas
operações reais com ticket de R$ 38 e R$ 319. Nessa mesma medição, o custo médio até chegar no
Passe deu perto de 4,7 tickets nas duas operações, mesmo com o ticket de uma sendo 8 vezes maior
que o da outra, e é essa constância que justifica medir tudo em tickets em vez de em reais.

As réguas de leads e de negócio local são dedução do método, não medição: seguem a mesma lógica das
outras duas, mas ainda não têm dado próprio nem de terceiro por trás. Enquanto o kit não tiver uma
operação própria medida, essa origem continua escrita aqui do lado dos números, e volta a aparecer
no primeiro corte que a skill propõe.
