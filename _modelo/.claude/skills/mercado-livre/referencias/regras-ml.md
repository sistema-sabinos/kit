# Regras do Mercado Livre que mudam a conta

> Medidas em conta real entre 2026-03 e 2026-09. Regra de
> plataforma envelhece: antes de agir sobre qualquer item daqui, conferir ao vivo
> na Central de Vendedores ou na API, e anotar a data nova ao lado.

- **Custo de envio por peso, mesmo sem frete grátis (desde 2026-03-02).** A
  tarifa fixa por faixa de preço acabou. Virou custo operacional por peso,
  dimensão e cubagem, e abaixo de R$ 79 sai do vendedor mesmo escolhendo "não
  oferecer frete grátis". Nunca lançar zero de envio nessa faixa. Peso e
  dimensão errados no cadastro custam dinheiro em toda venda.
- **A descrição ranqueia (desde 2026-04-05)**, com o mesmo peso do título e da
  ficha. O título trava depois da primeira venda; a descrição segue editável.
  É nela que entram as palavras-chave que não couberam no título.
- **Título não se edita depois da primeira venda**, e marca de terceiro que
  entrar no título ou em atributo não sai mais: o Mercado Livre transforma o
  texto em produto de catálogo e passa a defender esse texto. Nunca pôr marca
  de terceiro em título nem em atributo de anúncio novo.
- **Título com até 60 caracteres** (conferido em 2026-09-24). O que não
  coube vai pra descrição, que também ranqueia.
- **Campos do Bling que chegam no anúncio** (conferido em 2026-09-24). A
  descrição que o Bling manda pro Mercado Livre é a do campo de descrição
  curta, com `<br>` nas quebras de linha; a condição vai marcada como
  "Novo" (valor 1 do campo `condicao`); o custo só grava pelo vínculo do
  produto com o fornecedor. Categoria de alimento recusa anúncio sem a
  condição "Novo" (não conferido ao vivo em 2026-09-24: ajuda.bling.com.br
  e api.mercadolibre.com devolvem 403 pro robô; vem da operação de origem,
  conferir na fumaça do plano D).
- **A busca é, em grande parte, página de catálogo** (medido em 2026-08-14:
  85% dos resultados). Em catálogo, a venda mostrada soma todos os vendedores
  e a foto é a mesma pra todos, então a alavanca é preço e reputação, e o
  criativo pesa pouco. O que mostra a disputa real é
  `GET /products/<id-do-catalogo>/items?limit=100`.
- **Anúncio de terceiro não se lê por API** (`GET /items/<id>` de outro
  vendedor devolve 403). O que funciona é a página aberta no Chrome dedicado.
  `GET /reviews/item/<id>` (avaliações) só responde pra anúncio da própria conta:
  medido em 2026-10-08, 403 em 5 anúncios de concorrente com token válido e 200 no
  anúncio próprio.
- **A paginação da busca só anda clicando em "Seguinte"** e conferindo que a
  URL mudou. Os links da barra vêm com `href` vazio, e montar a URL na mão volta
  pra página 1.
- **GTIN inválido derruba o anúncio.** Faltando só reduz visibilidade; errado
  pausa ou exclui. Kit montado por você: marcar "não tem", nunca reaproveitar o
  código de um componente.
- **Vídeo do anúncio (Clips):** a API não expõe; só dá pra ver abrindo a página.
  Requisitos em `clips.md`.
- **Campanha cofinanciada disponível é dinheiro parado.**
  `GET /seller-promotions/users/<id>?app_version=v2` lista o que está aberto;
  nas SMART o Mercado Livre banca parte (`meli_percentage` contra
  `seller_percentage`). Entrar em campanha é decisão de chat, com o "pode ir".
- **Mercado Ads fala em ROAS** (desde 2025-10). ACOS é 1 dividido por ROAS.
- **Full endureceu (2026-05-20):** bloqueio de item acima de 20 kg, lado acima
  de 80 cm ou 125 L, preço mínimo por categoria, armazenagem cobrada, item
  parado 90 dias paga penalidade. Só vale pra quem gira.
- **Moderação de produto regulado (política 1072):** descrição precisa do número
  de registro ou da observação de que o órgão foi comunicado, e três quedas do
  mesmo anúncio queimam o anúncio. Detalhe na `/pode-vender`.
