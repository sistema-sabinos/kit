# Preço no Mercado Livre, o método

> Medido em conta real entre 2026-06 e 2026-08. Comissão, desconto
> de frete e faixa de preço mudam; o número da sua conta sai do simulador
> oficial ou da API na hora, nunca daqui.
> Regra de plataforma envelhece: conferir ao vivo antes de agir.

## Regra de ouro

Em conflito entre qualquer tabela e o simulador oficial
(`mercadolivre.com.br/simulador-de-custos`, logado na sua conta), vale o
simulador. Ele dá o "Você recebe" real, já líquido de comissão, tarifa e frete.
O script `simular.mjs` da `/montar-anuncio` lê esse valor pelo Chrome dedicado.

## A conta da margem

```
margem = preço que o cliente paga
       - comissão (porcentagem da categoria, Clássico ou Premium)
       - custo de envio (o número do simulador; por peso, mesmo abaixo de R$ 79)
       - imposto (a alíquota de _contexto/mercado-livre.md, sobre a venda)
       - custo do produto
```

- Premium é sempre Clássico mais 5 pontos de comissão, em qualquer categoria.
  Sabendo um, deriva o outro. `gold_pro` é Premium, `gold_special` é Clássico.
- A comissão exata sai de graça por API:
  `GET /sites/MLB/listing_prices?price=<preço>&category_id=<cat>&listing_type_id=<tipo>`.
- O frete também: `GET /users/<seu-id>/shipping_options/free?dimensions=<alt>x<larg>x<comp>,<peso_g>&listing_type_id=<tipo>&item_price=<preço>&verbose=true&condition=new&logistic_type=drop_off`.
  `list_cost` é o que sai do seu bolso; `billable_weight` é o peso cobrado
  (o maior entre o real e o cubado). Caixa folgada vira dinheiro perdido.
- A margem se calcula sobre o preço promocional, que é o que o cliente paga e
  sobre o que a comissão incide. Nunca sobre o preço de lista.

## O degrau dos R$ 79

Acima de R$ 79 o frete grátis vira obrigatório e o Mercado Livre cobre uma
parte pela sua reputação. Abaixo, o custo de envio é menor, mas existe. Medido
em 2026-08-14: a R$ 78,90 sobrava mais lucro que a R$ 79,90, e só voltava a
compensar acima de R$ 84,80. Regra: ou ancora em R$ 78,90, ou pula pra R$ 85
ou mais. Nunca no meio. Vale pro preço de lista, pro promocional e pro preço
com desconto de assinante, que é o que costuma cruzar o degrau sem ninguém ver.

## Preço de lista inflado e a catraca do desconto

Todo anúncio entra na central de promoções pra ganhar selo de desconto. Pra o
desconto não comer a margem, o preço de lista sobe inflado e o desconto traz de
volta ao preço-alvo: `lista = alvo ÷ (1 − desconto)`. Com 12%, divide por 0,88.

Duas regras oficiais que viram catraca: subir o preço apaga o desconto, e o
desconto é de mão única (o percentual que o anúncio acostumou vira o piso). Por
isso o percentual se decide uma vez, na criação, no maior valor que a margem
aguenta o ano inteiro. Corrigir margem em anúncio maduro se faz por custo,
composição de kit ou mix. Preço de lista fica de fora.

## Piso de margem

O piso é o da sua configuração (`margem_minima_rs` e `margem_minima_pct`).
Medido em conta real: alvo de 15% a 25% em anúncio novo, piso de 8%
em anúncio que já roda com volume, e nunca menos de R$ 8 por venda em ticket
baixo. Motivo do fôlego: comissão às vezes é estimada, e devolução grátis come
frete de ida e volta; com 10% de margem, uma devolução apaga o lucro de 3 a 4
vendas.

## Desconto e anúncio pago se somam contra a margem

O ACOS de empate de uma campanha é a margem do produto. Ao ligar um desconto, a
margem cai e o teto de ACOS tem que cair junto, senão a campanha compra venda
no prejuízo. Toda mudança de preço ou promoção revisa os limites do Ads na
mesma hora.

## Clássico ou Premium

Um anúncio por produto. A modalidade se escolhe rodando o simulador nas duas e
ficando com a que entrega mais lucro líquido. Premium custa 5 pontos a mais e
dá parcelamento em 12 vezes e mais exposição; costuma valer em ticket a partir
de R$ 80.

## Centavos

Preço termina em ,90.
