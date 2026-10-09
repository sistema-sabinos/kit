---
name: mei
description: >
  Cuida das obrigações do MEI com data: o DAS de todo dia 20 com o valor certo, a
  declaração anual até 31 de maio e o faturamento do ano contra o teto, com aviso antes
  de estourar. Use quando o usuário chamar /mei, perguntar "quando vence o DAS?",
  "quanto é o DAS?", "já declarei o MEI?", "quanto falta pro teto do MEI?", "estou perto
  do limite?", "preciso emitir nota?", ou quando o /iniciar avisar de data do MEI.
---

# /mei, DAS, declaração e teto

Esta skill é só pra quem é MEI. Quem ainda não tem CNPJ usa o `/caixa` sem ela; no
Simples Nacional e nos outros regimes o imposto sai de cada venda, e quem faz a conta é o
contador.

Todo valor e prazo vem do `referencias/fatos.md`, com a fonte oficial e o dia em que foi
conferido. O faturamento do ano vem do `/caixa` e do total de fora que a pessoa anota
(Mercado Livre, Shopee, loja virtual). Comandos rodam da raiz do projeto, com
`node .claude/skills/mei/scripts/mei.mjs <comando>`.

## Primeira vez

Se `dados/mei.json` não existe, perguntar três coisas, uma por vez:

1. Em que dia o MEI foi aberto? (está no cartão do CNPJ; muda o teto no primeiro ano)
2. Vende produto, presta serviço ou os dois? (muda o valor do DAS)
3. Vende também fora do /caixa (Mercado Livre, Shopee, loja virtual)? Se sim, qual o
   total vendido no ano até hoje, no painel de cada um? Se o MEI abriu este ano,
   pedir o total só desde o dia da abertura (o painel filtra por período): venda
   de antes do CNPJ não entra no teto, e o script soma o valor de fora inteiro.

E gravar: `configurar --abertura AAAA-MM-DD --tipo comercio|servico|misto` e, pra cada
lugar da pergunta 3, `externo --ano AAAA --valor X --origem "Mercado Livre"`. No
`_contexto/empresa.md`, a linha **Registro:** fica `MEI (<tipo>), aberto em <data>`:
completar a que o setup deixou, ou criar se não existir.

## No dia a dia

`proximos` responde as três perguntas de uma vez: quando vence o próximo DAS e quanto é,
quanto falta pra declaração anual, e onde está o faturamento do ano contra o teto.
Apresentar em três linhas, em linguagem de gente.

Antes de repassar número, rodar `vencidos`: fato com mais de 60 dias se confere na web,
em fonte oficial (gov.br, Receita), e a linha do `fatos.md` se atualiza com a data nova.
O teto do MEI está em discussão no Congresso (fato `mei-teto-projeto`): quando a lei
mudar, o `mei-teto` muda junto.

## O teto

O script compara o maior entre o que foi **vendido** e o que **entrou** no ano, porque a
regra fala em receita do ano sem dizer qual das duas contas: assim o aviso nunca chega
tarde. Ele soma o que está no `/caixa` com o total de fora anotado pelo `externo`; venda
que não passou por nenhum dos dois não conta, e isso se diz junto do número. O `externo`
guarda o total do ano até aquele dia, então rodar de novo com a mesma origem troca o
valor. O `proximos` mostra a data de cada valor de fora; passou de 30 dias, perguntar o
total novo. No ano em que o MEI abriu, só conta o que veio depois da
abertura; pedido feito antes e pago depois entra pelo recebido, e esse caso vai pro
contador decidir.

- A partir de 70%: sugerir conversar com um contador sobre o próximo passo
- A partir de 90%: falar com o contador antes de fechar pedido grande
- Passou: o script diz o que vale pela faixa (fato `mei-excesso`), e o caminho é o
  contador, porque desenquadramento tem prazo

Esta skill avisa e explica, e não dá parecer fiscal. Dúvida de imposto vai pro contador,
com os números do `/caixa` prontos.

## Lembrete no celular

Projeto com o `/agendar`: oferecer um robô que roda `mei.mjs alertas` todo dia de manhã
e avisa no Telegram quando tem DAS a 5 dias, declaração a 30 ou teto acima de 70%. A
receita do robô chama o script e devolve cada linha da saída como aviso; saída vazia,
nenhum aviso.

## Pagar o DAS e declarar

- DAS: pelo app MEI ou pelo PGMEI, no Portal do Simples Nacional, com o CNPJ. Pagou
  atrasado: a guia nova já sai com multa e juros pelo mesmo lugar
- Declaração anual (DASN-SIMEI): no mesmo portal, com o faturamento do ano anterior, que
  é o `caixa.mjs ano <ano>` mais o que veio de fora. Multa por atraso: fato `mei-dasn-multa`.
  Entregou a DASN-SIMEI: `declarei <ano>`, e o aviso para
- Abrir o MEI é grátis e só pelo gov.br (fato `mei-abrir`). Site que cobra pela abertura é golpe

## Nota fiscal

Quando precisa: fato `mei-nota` (pra cliente pessoa física o MEI está dispensado; pra
quem tem CNPJ é obrigado, salvo quando esse cliente emite a nota de entrada). Como:
serviço pelo emissor nacional do gov.br (fato `mei-nfse`); produto pelo sistema de nota
da Secretaria da Fazenda do estado, cuja página oficial se busca na hora. Emitir nota
por aqui não faz parte desta skill.
