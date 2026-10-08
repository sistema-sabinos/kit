# Cardápio de pedidos

Seis pares de pedido vago e pedido bom, no jeito de quem vende em marketplace. O pedido
bom diz o que você quer, pra quê, e como sabe que ficou bom. O produto do exemplo é a
garrafa térmica 1L; na conversa, ele vira o produto do seu projeto. A skill do lado só
vale se a pasta dela existir no projeto; sem ela, o pedido bom funciona na conversa.

## 1. Anúncio

- Vago: "faz um anúncio"
- Bom: "monta o anúncio da garrafa térmica 1L pro Mercado Livre, quero título, descrição e ficha"
- Skill: `/montar-anuncio`

## 2. Preço

- Vago: "quanto cobro?"
- Bom: "quanto cobro na garrafa 1L no Mercado Livre pra sobrar 20% depois das taxas"
- Skill: `/montar-anuncio` (simulador de custos)

## 3. Cliente

- Vago: "responde esse cliente"
- Bom: "responde esse cliente que reclamou do atraso, com educação, mandando o código de rastreio"
- Skill: `/atendimento`

## 4. Vendas

- Vago: "a IA consegue ver minhas vendas?"
- Bom: "quanto vendi em setembro no Mercado Livre e qual anúncio puxou mais"
- Skill: `/conectar` liga o Mercado Livre, se ainda não estiver ligado

## 5. Fotos

- Vago: "faz umas fotos melhores"
- Bom: "faz a capa e as fotos de clima da garrafa 1L a partir das fotos reais que estão em fotos/garrafa, capa com fundo branco"
- Skill: `/gerar-imagens`

## 6. Concorrente

- Vago: "vê o que a concorrência tá fazendo"
- Bom: "analisa os anúncios que dominam a busca de garrafa térmica 1L no Mercado Livre: preço, título e o que os clientes perguntam"
- Skill: `/espionar-concorrente`
