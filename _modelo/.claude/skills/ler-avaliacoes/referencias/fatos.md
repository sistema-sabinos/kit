# Fatos datados da leitura de avaliações

> Toda regra de loja e todo endereço de leitura que pode mudar mora aqui, com a fonte oficial e
> o dia em que foi conferido. A `/ler-avaliacoes` lê daqui antes de dizer ao aluno onde e como
> juntar avaliação. Fato com mais de 60 dias se confere na web (buscar em português e inglês,
> fonte oficial primeiro), e a linha se atualiza aqui com a data nova. Mantenha as quatro colunas.
> Linha com o mesmo id em outro fatos.md do kit tem que ficar igual nos dois.
> Isto aqui é informação pra decidir, sem garantia de resultado jurídico. Caso que envolve dinheiro alto ou briga com outra empresa vai pra um advogado.

| id | fato | fonte | conferido_em |
|---|---|---|---|
| aval-ml-api | Avaliações do Mercado Livre pela API oficial: `GET /reviews/item/<código do anúncio>` com a autorização de app do vendedor só responde pra anúncio da própria conta; medido em 2026-10-08, deu 403 (acesso negado) em 5 anúncios de concorrente com autorização válida e 200 no anúncio próprio | https://developers.mercadolivre.com.br/pt_br/opinioes-sobre-um-produto | 2026-10-08 |
| aval-ml-termos | Termos do Mercado Livre (cláusula 12): proíbem robô, raspador e qualquer programa que varre o site sem autorização | https://www.mercadolivre.com.br/ajuda/991 | 2026-10-07 |
| aval-amazon-termos | Termos da Amazon.com.br: proíbem coleta de dados e uso de robô no site | https://www.amazon.com.br/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM | 2026-10-07 |
| aval-shopee-termos | Termos da Shopee: proíbem robô e programa que varre o site (itens 3.1 e 6.2(k)) e coletar dado de outro usuário (6.2(o)) | https://help.shopee.com.br/portal/4/article/77113 | 2026-10-07 |
| aval-reclameaqui-termos | Termos do Reclame Aqui: proíbem raspagem do site (item 5.9) | https://www.reclameaqui.com.br/termos-de-uso/ | 2026-10-07 |
| aval-amazon-shopee-api | Amazon e Shopee não têm API que entregue o texto das avaliações de um concorrente: a da Amazon dá só número agregado e fora do Brasil, a da Shopee só as avaliações da própria loja | https://developer-docs.amazon/sp-api/docs/customer-feedback-api-v2024-06-01-use-case-guide e https://open.shopee.com/documents/v2/v2.product.get_comment | 2026-10-07 |
| aval-apple-rss | Avaliações da App Store pelo endereço público `https://itunes.apple.com/br/rss/customerreviews/page=1/id=<número do app>/sortby=mostrecent/json`: respondeu com 50 avaliações por página; é um endereço antigo, sem documentação da Apple, e pode parar sem aviso | https://itunes.apple.com/br/rss/customerreviews/page=1/id=284882215/sortby=mostrecent/json | 2026-10-07 |
| aval-reddit-api | API do Reddit: uso comercial pede um acordo à parte com o Reddit | https://redditinc.com/policies/data-api-terms | 2026-10-07 |
| app-lpi-195 | Concorrência desleal (Lei 9.279, art. 195): desviar cliente de outra empresa por meio fraudulento ou imitar o sinal de propaganda dela a ponto de confundir | https://www.planalto.gov.br/ccivil_03/leis/l9279.htm | 2026-10-07 |
| app-conar-32 | Propaganda comparando com concorrente (CONAR, art. 32): permitida dentro dos limites do código | https://www.conar.org.br/codigos?section=codigo | 2026-10-07 |
