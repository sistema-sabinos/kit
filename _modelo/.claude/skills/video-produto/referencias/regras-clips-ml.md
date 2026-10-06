# Regras de vídeo (Mercado Clips) do Mercado Livre

> Levantado em 2026-08-08. Fonte oficial: [Central de Vendedores, requisitos de clips](https://vendedores.mercadolivre.com.br/nota/confira-os-requisitos-para-que-seus-clips-sejam-aprovados). A página pode devolver erro 403 pra leitura automática; abra pelo navegador. Complementado com o que foi visto ao vivo no painel de envio em 2026-08-08.
>
> Este arquivo é a fonte da verdade do gate da skill `/video-produto`. Ao mudar algo aqui, mude o checklist da skill junto. Regra de plataforma muda: confira a página oficial antes de confiar nesta cópia.

## O que deve ser feito (texto oficial)

- Grave no formato **vertical (9:16)**, nem quadrado nem horizontal.
- O vídeo deve ter duração de **10 segundos a 1 minuto**, no máximo.
- Inclua **voz ou música de fundo**. (Na variante de veículos o ML diz que, se não houver, ele mesmo adiciona uma faixa sem direitos autorais.)
- Envie o vídeo apenas 1 vez. **Ver ressalva abaixo:** o painel contradiz isso.
- Mostre um produto que **esteja vinculado ao anúncio**. Caso seja um **kit**, é necessário mencioná-lo e **mostrar todos os produtos incluídos**.
- **Respeite as zonas seguras.** Não inclua textos ou elementos nos quais o produto ou os botões de "Compartilhar" e "Adicionar a favoritos" são exibidos.
- Cumpra as regras de publicidade e marketing aplicadas ao produto. Ex.: bebida alcoólica exige a legenda "Venda proibida a menores de 18 anos" e é proibido mostrar consumo de álcool.
- Grave em **local silencioso e bem iluminado**.

## O que não deve ser feito (texto oficial)

- Não reenvie vídeos que já foram anunciados.
- Não inclua **marcas d'água com informações pessoais ou de contato**.
- Não compartilhe **dados de contato**: telefone, endereço, redes sociais.
- Não mencione **preços, ofertas, condições de venda, cupons ou promoções por tempo limitado**.
- Não realize concursos, sorteios ou jogos de azar.
- Não mostre imagens da **página de produto ou seções do Mercado Livre**.
- Não faça comparações ou referências infundadas à concorrência.
- **Não mostre nem se refira a menores de idade.**
- Não use vídeos, imagens, música, itens ou notícias **de propriedade de terceiros**.
- **Não inclua imagens estáticas no vídeo.**

## O que a tela de upload acrescenta (visto no painel, 2026-08-08)

A própria tela `vendedores.mercadolivre.com.br/video/creator/upload` traz 3 avisos e 2 limites que não estão na página de ajuda:

- **Grave na vertical:** o vídeo tem que ocupar a tela toda, **sem bordas** (nada de letterbox nem pillarbox).
- **Exclua marcas d'água:** sem logotipos ou selos **de outros aplicativos** (ex.: marca de editor de vídeo ou de rede social).
- **Foque no produto: "não divulgue seu negócio nem outras marcas".** Consequência dura: o vídeo não leva a marca da sua loja nem a identidade visual das suas peças. Nada de logo no clipe. As fotos do anúncio seguem a mesma regra: estilo da categoria do produto, sem a marca da loja.
- **Tamanho máximo: 280 MB.**
- O upload **exige o link do anúncio** que será mostrado no vídeo.

## Onde se envia

**Dá pra enviar pelo computador** e pelo celular, mesmo que a ajuda dê a entender que só o celular serve. Dois caminhos:

1. Central de Vendedores, menu lateral **Marketing**, depois **Clips**, botão **"Enviar um vídeo"**.
2. Direto em **https://vendedores.mercadolivre.com.br/video/creator/upload**.

O celular serve pro fluxo com IA do próprio ML (ver abaixo), que é outra coisa.

## Ressalva: reaproveitar o mesmo vídeo em vários anúncios

A ajuda diz que não dá ("não será possível enviá-lo para outros anúncios"), mas o painel de **Meus vídeos** mostra, em cada vídeo publicado, a opção **"Exiba este vídeo em outros anúncios"**, seguida de **"Escolher anúncios"**. Visto ao vivo em 2026-08-08. **Vale o painel**, que é o comportamento vivo.

## O gerador de Clips com IA do ML

O gerador do ML não cria vídeo do zero. O passo a passo oficial é: pelo **celular**, "Criar clip", escolher o anúncio, "Criar com ajuda da IA", **escolher um roteiro sugerido**, **gravar o produto seguindo o roteiro** e publicar. A IA entra depois, pondo **voz, legenda e trilha** em cima da filmagem feita por você. É grátis, mas **exige o produto na mão pra filmar**, o que não serve pra quem vende em dropshipping e nunca tem a mercadoria em casa.

## Regra da casa: vídeo não fala de nada variável

Além do que o ML proíbe, **o vídeo não menciona preço, promoção, desconto, parcelamento, frete, garantia, prazo, validade nem qualquer número que mude com o tempo.** Nem em fala, nem em cena, nem em legenda.

**Por quê:** o Clips é permanente. Ele fica no anúncio pra sempre e o painel ainda deixa exibir o mesmo vídeo em outros anúncios. Preço, condição de pagamento, garantia e prazo mudam. Um vídeo que cita qualquer um deles nasce com data de validade e vira mentira no dia da primeira reprecificação, sem ninguém perceber, porque ninguém reassiste vídeo antigo.

**O que PODE aparecer:** especificação do produto (168 canetas, 80 cores, ponta dupla, 1600 ml, à prova d'água), o que o produto faz e como é usar (a tinta não borra, seca rápido, o traço sai igual do começo ao fim, cabe na mochila), e a resposta às dúvidas reais do cliente.

**O que NÃO pode, mesmo que o ML permitisse:** qualquer valor em dinheiro (em símbolo, por extenso ou só o número), qualquer forma de parcelamento, porcentagem, desconto, cupom, frete, brinde, garantia, troca, devolução, prazo de entrega, validade, e qualquer afirmação de durabilidade contada em tempo ("dura 3 anos"), que é variável e não dá pra provar.

**Efeito colateral bom:** com essa regra, o gate não precisa distinguir "garantia de 2 anos" (que seria legítimo) de "sobrinho de 8 anos" (proibido). Os dois são proibidos, um pela regra do ML e outro pela da casa. Falso positivo deixa de custar caro, então o gate pode ser rígido e simples, que é o que dá pra testar de verdade.

## A regra de publicidade da categoria, e o que ela pede na prática

A linha oficial é genérica:

> "Cumpra as regras de publicidade e marketing aplicadas ao produto. Por exemplo, para a categoria de bebidas alcoólicas, é necessário incluir a legenda: 'Venda proibida a menores de 18 anos' e é proibido mostrar o consumo de álcool."

**O exemplo é a especificação, e ele responde "o que exatamente eu tenho que fazer": legenda na tela.** Um Clips foi recusado por isso, com o motivo escrito "Não informa as regras de publicidade e marketing aplicáveis à categoria do produto".

Em **suplemento alimentar**, as legendas equivalentes são as advertências obrigatórias do art. 14 da RDC 243/2018, que já vêm impressas no rótulo do fabricante. A lista e a conferência na norma estão em `referencias/advertencias-categoria.md`.

O texto vai **literal**, copiado do rótulo. É texto de lei: copie sem reescrever nem encurtar. Na skill, `advertencias` é campo obrigatório do `roteiro.json` (com `[]` como resposta válida pra categoria sem advertência) e a montagem queima as frases no topo do quadro.

**Isso não conflita com "não mostre nem se refira a menores de idade".** A legenda que o próprio ML exige em bebida cita "menores de 18 anos". Legenda legal obrigatória não conta como referência a menor, e advertência não se omite por medo dessa regra.

## Como a moderação do Clips se comporta (medido em 2026-09-04, 2 recusas e 1 aprovação no mesmo anúncio)

- **Ela entrega UM problema por vez.** A 1ª recusa trouxe dois motivos e nenhuma palavra sobre advertência, e a advertência já faltava desde aquele envio. Consertar o que foi citado não garante passar: antes de reenviar, varra a lista inteira de requisitos.
- **Motivo que SOME entre uma recusa e outra prova que o conserto anterior funcionou.** Cada reenvio é um teste com resposta.
- **O estado aparece no painel de Clips**, com o rótulo RECUSADO, os motivos em texto e o link "Enviar novo vídeo". Não precisa adivinhar.
- **Teto de 3 tentativas.** Se a 3ª cair, a leitura da regra está errada na raiz e insistir só queima o anúncio.

## Leitura prática

- **Legenda na tela é permitida** (o próprio gerador do ML põe). O que não pode é texto invadindo a zona segura ou virando marca d'água de contato.
- **A pessoa do vídeo tem que ser adulta**, casada com o público real de quem compra (mãe, professora, artista, quem cozinha). Criança não pode nem aparecer nem ser citada.
- **O A de AIDA não pode ser preço.** A chamada de ação tem que ser sem oferta: "olha a ficha completa na descrição", "salva nos favoritos", "vê as 80 cores".
- **Slideshow de imagem parada reprova.** Precisa de movimento real, que é o que o image-to-video entrega.
- **Áudio gerado por você resolve o "música de terceiro"**, a pegadinha que derruba quem põe trilha de rede social.
- **Número de vídeos no ar e retenção envelhecem.** A API do ML não expõe Clips (o `video_id` volta nulo mesmo em anúncio com vídeo), então a contagem e o desempenho se conferem abrindo as páginas dos anúncios e o painel de Clips.
