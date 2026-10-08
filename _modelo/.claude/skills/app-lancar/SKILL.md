---
name: app-lancar
description: >
  Prepara o lançamento do app: a página de venda montada em cima do conserto que
  o cliente da referência pede, o preço comparado com o da referência e com as
  reclamações de cobrança, os planos criados no pagamento em modo de teste, a ficha
  da App Store e do Google Play revisada contra os limites e as regras de cópia, e o
  plano dos primeiros clientes. Tudo que cria conta, manda e-mail ou publica espera
  o "pode ir". É a etapa 10 do pacote criar app. Use quando o usuário chamar
  /app-lancar, disser "faz a página de venda do app", "quanto eu cobro pelo app",
  "monta os planos", "escreve a ficha da App Store", "descrição pro Google Play",
  "como eu lanço o app", "lista de espera", ou depois da /app-marca.
---

# /app-lancar, a página de venda, o preço e a ficha de loja

## O que essa skill faz

Lançar é preparar tudo que o cliente vê antes de pagar. Esta etapa escreve
quatro coisas, cada uma num arquivo de `app/`:

```
app/pagina-venda.md       a página de venda, bloco a bloco, depois montada no código
app/precos.md             a comparação de preço e os planos do app
app/ficha.json            a ficha da App Store e do Google Play (só se for pro celular)
app/plano-lancamento.md   lista de espera, onde divulgar e os 10 primeiros clientes
```

Página de venda (o nome técnico é landing page) é a página de entrada do site,
a que explica o app e leva a pessoa a assinar. Ficha de loja é o texto que
aparece na App Store e no Google Play: nome, subtítulo, descrição e
palavras-chave.

## Dependências

- O `app/consertos.md` da `/ler-avaliacoes`: as três listas (o que o cliente
  da referência odeia, o que falta, o que ninguém resolve), com as citações e
  as contagens, o plano de conserto e o ângulo. É dele que sai o ângulo da
  página. O `app/avaliacoes.md`, da mesma etapa, traz a conta por tema e as
  fontes lidas.
- `app/marca.json` e `app/marca.md` (com a voz da marca), da `/app-marca`: o
  nome novo, as cores e o jeito de falar com o cliente. Sem marca própria, parar e rodar a `/app-marca`.
- `app/funcoes.csv` e `app/arquitetura.md`: o que o app faz e qual pagamento
  (Stripe ou Mercado Pago) o aluno escolheu.
- `.claude/skills/app-planejar/referencias/fatos.md`: todo preço, taxa, limite e
  regra desta skill sai de lá, pelo id.
- `.claude/skills/app-lancar/ficha-exemplo.json`: o modelo da ficha de loja.

## As regras

- **Prova só verdadeira.** Nada de depoimento inventado, número de usuários,
  nota em estrelas, logo de jornal ou faixa de "quem confia em nós" que não
  existam. Enquanto não houver cliente real, a seção de prova fica de fora da
  página. Depoimento de quem testou o app de verdade entra com a autorização
  por escrito dessa pessoa.
- **Avaliação da referência é pesquisa.** As frases que a `/ler-avaliacoes`
  juntou servem pra entender o problema e ficam fora da página, da ficha e
  dos anúncios. Na página, o problema aparece com palavras do aluno.
- **O nome da referência fica fora** do nome do app, da ficha, das
  palavras-chave e dos anúncios. A Apple recusa cópia de outro app e uso do
  nome ou do ícone dele (`app-apple-regras`), o Google recusa app que se passa
  por outro (`app-google-imitacao`), e no Brasil reproduzir marca registrada de
  outro ou imitar o
  sinal de propaganda de outra empresa a ponto de confundir cai na Lei de
  Propriedade Industrial (`app-lpi-189-190`, `app-lpi-195`).
- **Valor que muda se confere antes.** Antes de dizer qualquer preço, taxa,
  limite ou regra ao aluno, achar a linha no `fatos.md` pelo id e olhar o
  `conferido_em`. Mais de 60 dias: abrir a fonte da linha hoje (e buscar na
  web em português e inglês), atualizar fato e data no `fatos.md` e só então
  falar.
- **Texto pro cliente passa pela voz da marca.** Página, ficha, e-mail e post
  se releem contra a voz da `/app-marca` antes de mostrar ao aluno, e fecham
  com o que foi suposto e o que conferir antes de usar, em até 2 linhas.

### Como funciona cada gate

Gate é o ponto em que a skill para e pede autorização. Todo passo marcado
**(conta)** (cria ou mexe em conta de outro serviço), **(publica)** (manda
pra fora: e-mail, post, envio pra loja) ou **(gasta)** segue esta ordem:

1. Mostrar o que vai acontecer, o custo pelo id do `fatos.md` (ou zero) e a
   data em que o valor foi conferido.
2. Passar a proposta pela `/segunda-opiniao`.
3. Esperar o "pode ir" do aluno naquele momento, mesmo que um passo parecido
   já tenha sido aprovado antes.
4. Quando há custo, acrescentar uma linha no fim de `dados/custos.jsonl`
   (criar o arquivo se não existir), uma por gasto, sem editar as antigas:
   ```
   {"em":"2026-10-07T14:30:00.000Z","servico":"<serviço>","usd":0,"brl":0,"contexto":"app <nome>, <pra quê>"}
   ```
   `em` é a data e hora em UTC. Gasto em dólar vai em `usd`, com ponto;
   gasto em reais vai com `"usd":0` e o valor em `brl`.

## Fluxo

### 1. Página de venda

Escrever `app/pagina-venda.md` bloco a bloco, mostrar ao aluno e, com o ok
dele, montar a página no código do app (`app/codigo/`), na tela inicial.

1. **Chamada principal** (o topo da página, a primeira coisa que a pessoa
   lê): o ângulo em uma frase, dizendo o que o app faz e pra quem. Uma linha
   embaixo e um botão só (o botão de ação, que leva a assinar ou testar).
   Imagem: print real do app do aluno.
2. **O problema**: os dois temas mais fortes da lista "odeiam" da
   `/ler-avaliacoes`, contados com palavras simples, sem citar quem avaliou.
3. **Como funciona**: três passos, tirados do caminho principal do app.
4. **Funções**: cada uma ligada a um conserto da `/ler-avaliacoes`. Os
   consertos vêm primeiro. As funções que a referência também tem
   (paridade, o quanto o app faz do que a referência faz) são o mínimo pra
   entrar no jogo e vêm depois.
5. **Preço**: a tabela do passo 2.
6. **Perguntas frequentes**: as dúvidas reais de quem ainda não comprou,
   inclusive "dá pra trazer meus dados do app que eu uso hoje?", se o app
   importa dados.
7. **Chamada final**: o mesmo botão do topo.

Rodapé da página, pela lei do comércio eletrônico (`app-decreto-7962`, art.
2º): nome e CNPJ (ou CPF) de quem vende, endereço, contato, preço com tudo
incluído e as condições da assinatura. Links pros termos de uso e pra
política de privacidade, que a `/app-servidor` deixou prontos (`app-lgpd`).
Se a página usa cookie que não é essencial (contador de visita, pixel de
anúncio), o aviso de cookie sai sem opção já marcada (`app-anpd-cookies`).

Comparar o app com a referência pelo nome, na página, é propaganda
comparativa: o código do CONAR (o conselho que regula a publicidade no Brasil) permite dentro de limites (`app-conar-32`).
Antes de pôr, passar o texto pela `/segunda-opiniao` e mostrar ao aluno o
risco. O visual da página é o da marca nova: cores, letras e montagem iguais
às da referência a ponto de confundir podem ser concorrência desleal mesmo
sem marca registrada (`app-trade-dress`).

Depois de montada, rodar o contraste das cores da página:

```bash
node .claude/skills/app-visual/scripts/contraste.mjs app/visual/tokens.json
```

Saiu 1: algum texto está difícil de ler no fundo dele. Ajustar a cor na
`/app-visual` e rodar de novo.

### 2. Preço

Escrever `app/precos.md`:

- **Comparação.** O preço público da referência e de 2 ou 3 alternativas,
  numa tabela, com o endereço da página de preço e a data em que foi lida.
  Preço muda, por isso a data vai junto. Ler a página pública como cliente
  comum, uma por vez.
- **O que o cliente reclama de preço e cobrança**: os temas preço e cobrança
  do `app/avaliacoes.md`, com as contagens.
- **O modelo de cobrança**: plano grátis ou período de teste (dias de uso
  sem pagar antes da primeira cobrança); preço por usuário ou preço fixo;
  mensal e anual. Desconto no anual se decide olhando o que a referência e
  as alternativas da tabela fazem.
- **No máximo 3 planos**, cada um com o nome de quem ele serve ("Autônomo",
  "Salão com equipe"), pra pessoa se achar sem ler a tabela inteira.
- **A taxa do pagamento na conta.** Pra cada plano, quanto fica com o
  provedor por venda e quanto sobra: Stripe em `app-stripe-taxas`, Mercado
  Pago em `app-mp-checkout`. Se a cobrança é por assinatura, lembrar: no
  Mercado Pago a cobrança automática todo mês só funciona no cartão, e Pix e
  boleto vão por link a cada parcela (`app-mp-assinatura`); no Stripe o Pix
  depende de convite (`app-stripe-taxas`).
- **Consertar a reclamação de cobrança no próprio app**: cancelar a um
  clique, de dentro do app, pela mesma ferramenta em que a pessoa assinou
  (`app-decreto-7962`, arts. 4º, V, e 5º); e-mail avisando antes de cada
  renovação; nenhum salto de preço surpresa quando entra mais um usuário.
  Na compra pela internet o cliente tem 7 dias pra desistir com o dinheiro de
  volta (`app-cdc-49`), e isso aparece na página e nos termos.

**Criar os planos no pagamento** **(conta)**. Com a tabela aprovada, o aluno
cria no painel do Stripe ou do Mercado Pago, no modo de teste (o modo em que
tudo funciona com cartão de mentira e nenhum dinheiro passa), um produto e um
preço pra cada plano. O Claude escreve a lista (nome, valor, mensal ou anual)
e guia clique a clique; quem clica é o aluno. Os produtos no modo real se
criam na `/app-publicar`, junto com as chaves reais.

### 3. Ficha de loja (só se o app vai pro celular)

Só quando a `/app-planejar` previu app de celular. Copiar o modelo e
preencher com o nome e a voz da marca nova:

```bash
cp .claude/skills/app-lancar/ficha-exemplo.json app/ficha.json
```

Na lista `evitar` vão o nome da referência e o da empresa dela (os mesmos
do `app/marca.json`). A parte da loja onde o app não vai entrar sai do
arquivo. Depois:

```bash
node .claude/skills/app-lancar/scripts/ficha-loja.mjs app/ficha.json
```

O script confere o limite de cada campo (`app-apple-ficha`,
`app-google-ficha`), conta caractere como gente conta e conta as
palavras-chave da App Store em byte (a medida de tamanho que a Apple usa
ali: letra com acento vale 2). Também acusa nome da referência em qualquer
campo, alegação de ranking ou de preço no campo curto ("o melhor", "nº 1",
"grátis", "promoção"), emoji, palavra em caixa alta e palavra-chave
desperdiçada (repetida ou que já está no nome). Sai 0 sem erro (aviso pode
ter), 1 com algum erro e 2 com arquivo ruim. Só segue com 0.

A regra de texto do Google Play pra título, ícone e nome do desenvolvedor
(emoji, caixa alta, ranking, preço, programa do Google) está em
`app-google-metadados`. Os avisos do script pegam mais palavra do que ela
(um "melhor" ou um "grátis" solto também acusa): ler a linha antes de dizer
ao aluno o que a loja proíbe.

A revisão da loja é decisão da Apple e do Google e nada garante a aprovação.
O que mais ajuda é o conserto e a marca própria aparecendo nos prints e nas
primeiras linhas da descrição, longe da cara de cópia (`app-apple-regras`).

Preparar também, pra entregar à `/app-publicar`:

- prints do app nos tamanhos que a loja pede no dia do envio (conferir na
  App Store Connect e no Play Console, os painéis em que o dono do app
  cadastra a ficha na Apple e no Google, na hora, porque mudam);
- rótulo de privacidade da Apple e formulário de segurança de dados do
  Google: o que o app coleta e pra quê, igual à política de privacidade;
- endereço da política de privacidade e da página de suporte;
- classificação etária;
- recado pro revisor da loja com uma conta de demonstração que funcione, e a
  exclusão de conta dentro do app pronta (`app-apple-regras`).

Mandar pra loja é da `/app-publicar`. As contas de desenvolvedor
(`app-apple-conta`, `app-google-conta`) também se pagam lá.

### 4. Plano de lançamento

Escrever `app/plano-lancamento.md`:

- **Lista de espera** (cadastro de quem quer ser avisado quando o app abrir):
  um campo de e-mail na página de venda, com a frase dizendo pra que o e-mail
  serve, e o aviso na política de privacidade (`app-lgpd`). Mandar o e-mail
  de abertura pra lista é **(publica)**, só pra quem se cadastrou. No Resend
  (o serviço que manda os e-mails do app) grátis, o limite por dia e por mês está em `app-resend-free`.
- **Medição no ar antes de abrir**: contador de visitas (quantas pessoas
  chegam e de onde) e monitor de erro (avisa quando o app quebra na mão de um
  cliente). Abrir conta em cada um deles é **(conta)**, mesmo no plano
  grátis. Contador que usa cookie não essencial pede o aviso de cookie do
  passo 1. Plano pago de qualquer um deles é **(gasta)**, com o preço da
  página oficial conferido no dia.
- **Onde o cliente insatisfeito da referência conversa**: os lugares que a
  `/ler-avaliacoes` achou, na coluna `fonte` do `app/avaliacoes.csv` (grupo de lojistas, comunidade de vendedor,
  Instagram, YouTube). Post de lançamento que abre pelo conserto. Postar em
  rede social é **(publica)**: se o pacote de mídia social estiver instalado,
  sai pela `/publicar-social`; sem ele, o Claude entrega o texto e quem posta
  é o aluno. Em grupo e comunidade, quem posta é sempre o aluno, seguindo a
  regra do lugar. Anúncio pago é **(gasta)**: se o pacote de tráfego estiver
  instalado, vai pela `/trafego`, com o gate dela; sem ele, segue o gate
  desta skill.
- **Os 10 primeiros clientes**, um a um: lista de nomes que o aluno conhece
  e que têm o problema, conversa por mensagem ou ligação, e o que cada um
  disse anotado no arquivo. É dessa conversa que sai o primeiro depoimento
  real, com autorização.

## Saída

Os quatro arquivos em `app/`, a página montada em `app/codigo/` com o
contraste passando, os planos criados no modo de teste e, se for pro celular,
o `ficha-loja.mjs` saindo com 0.

No chat, só o resumo: o ângulo da página em uma linha, os planos com preço, o
que sobra por venda depois da taxa (com a data do fato), o resultado da ficha
e o que ficou pendente.

## Depois

Próxima etapa: `/app-publicar`, que roda a checagem que barra, liga a
produção e o domínio e coloca o app no ar com o seu nome.

## Regras

- Nada de prova inventada. Seção de prova só com cliente real e autorização.
- Frase de avaliação da referência nunca vira depoimento.
- Nome da referência fora do nome, da ficha, das palavras-chave e dos anúncios.
- Todo gate passa pela `/segunda-opiniao` e espera o "pode ir" na hora.
- Valor sempre pelo id do `fatos.md`, conferido se passou de 60 dias.
- A régua legal aqui é informação pra decidir, sem garantia de resultado
  jurídico. Caso com dinheiro alto ou briga com outra empresa vai pra um
  advogado.
