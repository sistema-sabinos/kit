---
name: app-estudar
description: >
  Estuda um app ou sistema que já existe e monta o mapa dele: as telas, os caminhos que o
  cliente percorre, as fichas que o sistema guarda e a lista de funções, tudo a partir de
  página pública, print, loja de app, central de ajuda e da conta da própria pessoa. É a
  primeira etapa do pacote criar app, custo zero. Use quando o usuário chamar
  /app-estudar, disser "quero um app igual ao [app]", "quero fazer meu próprio [sistema]",
  "como o [app] funciona por dentro", "que telas o [app] tem", "dá pra fazer um sistema
  igual ao Bling mais barato?", "quero um app de agenda pro meu salão", ou colar o link
  de um app ou da loja de app querendo construir um parecido.
---

# /app-estudar, o mapa do app de referência

## O que essa skill faz

Antes de construir um app, a gente estuda um que já existe e faz o que você quer.
Esse é o **app de referência**. A skill lê o que ele mostra em público e o que você
vê na sua própria conta, e escreve o mapa dele: que telas tem, por onde o cliente
passa pra resolver o problema dele, que informações o sistema guarda e a lista de
funções que o seu app vai precisar ter.

Tudo que as próximas etapas do pacote fazem sai deste mapa. Mapa fraco dá app
fraco, então aqui vale ir com calma.

Custo zero: só leitura de página e conversa. Um aviso antes de começar, pra dizer à
pessoa logo de cara: construir um app inteiro, nas etapas seguintes, consome bastante
do plano Claude. App grande leva muitas sessões.

Caminhos que começam em `app/` são da raiz do projeto. Os modelos desta etapa moram
em `.claude/skills/app-estudar/`.

O que fica gravado:

```
app/mapa.md        o mapa do app de referência (modelo: mapa-modelo.md desta skill)
app/funcoes.csv    a lista de funções (modelo: funcoes.csv desta skill)
app/prints/        prints do app de referência, um por tela com o código dela no nome (T07.png),
                   só pra comparar; nunca entram no seu app
```

## Regras que valem antes de tudo

A ideia aqui é construir **do zero**: estudar o que o app faz e como o cliente anda
por ele, e escrever tudo de novo, com código, texto e visual próprios. O que é do
outro app (o código, os textos, a marca, os clientes) fica com ele.

- **Só fonte pública e a conta da própria pessoa.** Entrar só na conta que é dela,
  com ela mesma digitando a senha. Nunca pedir senha, nunca aceitar senha colada no
  chat, nunca passar de uma tela de login ou de pagamento por truque.
- **Leitura no ritmo de gente.** Abre a página, lê, anota, vai pra próxima, com a
  pessoa acompanhando. Robô que varre o site sozinho (o que se chama de raspagem),
  download em lote e repetição automática ficam proibidos.
- **Código do outro app fica com ele.** Nada de ler ou salvar o código que o site
  manda pro navegador, abrir o arquivo do app de celular por dentro, ou anotar os
  endereços internos que o app usa pra conversar com o servidor dele. Ler a
  documentação pública da **API** (a porta oficial que uma empresa abre pra outros
  sistemas conversarem com o dela) pode.
- **Conferir os termos de uso.** Tem empresa que proíbe, nos termos, usar a conta
  pra construir um concorrente. Se a conta da pessoa está debaixo de um termo
  assim, avisar e estudar só pelo que é público.
- **Print é só referência.** Fica em `app/prints/`, com o código da tela no nome
  (`T07.png`), serve pra comparar tela com tela depois e nunca vai pro app.

O que a lei brasileira diz, em linguagem simples. Os fatos estão em
`.claude/skills/app-planejar/referencias/fatos.md`; ler a linha antes de citar, e se a
data dela passar de 60 dias, conferir na web (fonte oficial primeiro, em português e em
inglês) e atualizar a linha antes de falar:

- copiar o código de outro programa sem uma licença que deixe é ilegal; já um
  programa escrito do zero, parecido com o outro só porque faz a mesma função, a lei
  não trata como cópia (`app-lei-software`);
- a ideia do negócio e o jeito de trabalhar ficam livres pra qualquer um usar
  (`app-lei-ideia`);
- deixar o visual tão parecido que o cliente confunde um com o outro pode ser
  julgado concorrência desleal, mesmo quando o outro não registrou nada
  (`app-lpi-195`, `app-trade-dress`).

Isso é informação pra decidir, sem garantia de resultado jurídico. Se tem dinheiro
alto em jogo ou briga com outra empresa, o caminho é um advogado.

## Fluxo

### 1. O recorte

Três perguntas, uma por mensagem, ou uma proposta de resposta pra pessoa só dizer
sim:

1. **Qual app e em que formato.** Site (abre no navegador), app de celular
   (iPhone, Android) ou programa de computador.
2. **Qual pedaço.** "O Bling inteiro" é grande demais pra um projeto. "O cadastro
   de produto e o controle de estoque do Bling" cabe. O padrão é começar pelo
   **caminho principal**: a coisa pela qual o cliente paga. Numa agenda de salão,
   é a cliente marcar o horário sozinha.
3. **Pra quem é.** Pro negócio da própria pessoa, pra um nicho, ou pra vender como
   **SaaS** (sistema que o cliente usa pela internet pagando todo mês).

### 2. A lista de fontes

Montar primeiro a tabela de fontes, com o link em toda linha. Na ordem do que mais
rende:

| fonte | o que ela entrega |
| --- | --- |
| central de ajuda | a lista de funções mais completa que existe, e as configurações |
| página de preços | quais funções importam (as que ficam só no plano caro) |
| novidades do app | o que entrou agora e o que a empresa acha importante |
| página na loja de app | print das telas principais, a promessa e as notas |
| vídeo público mostrando o uso | o caminho de verdade, clique a clique |
| site de venda | como a empresa se posiciona e o caminho principal nas palavras dela |
| a conta da própria pessoa | o app de verdade, em todos os estados, com ela no comando |
| documentação pública da API | as fichas que o sistema guarda, quase de graça |

A leitura de página sai pelo navegador que o `/conectar` ligou, com a pessoa olhando.

### 3. As telas

Uma linha por tela. Cada tela ganha um código que não muda mais: T01, T02...
Todo outro arquivo do pacote se refere a ela por esse código.

`código | tela | como se chega nela | pra que serve | peças principais | estados vistos`

**Estado** é cada jeito que a mesma tela pode aparecer: vazia (primeira vez, sem
nada cadastrado), carregando, preenchida, com erro, sem permissão (a pessoa não
pode ver aquilo) e no celular. Estado que não foi anotado aqui é estado que ninguém
vai construir depois.

### 4. Os caminhos

**Caminho** é a sequência de telas que o cliente percorre pra conseguir uma coisa.
C01, C02... Cada um tem o objetivo e as telas por onde passa:

```
C01 Cliente marca um horário no salão
    T07 página de agendamento -> T08 escolhe serviço e horário -> T09 nome e telefone -> T10 confirmado
    cliques no caminho certo: 6
    casos difíceis: nenhum horário na semana, horário ocupado enquanto ela preenchia, cliente de outro fuso
```

Contar os cliques do caminho em que tudo dá certo. Esse número é a meta a bater.

### 5. As peças que se repetem

Lista curta das peças de tela que aparecem em vários lugares: botão, campo de
texto, escolha de data, janela que abre por cima, tabela, aviso que some sozinho,
menu. Nome, em que telas aparece e os estados (normal, desativado, carregando). O
detalhe disso é da `/app-visual`; aqui basta a lista.

### 6. As fichas que o sistema guarda

Todo sistema guarda informação em fichas: a ficha do cliente, a do agendamento, a do
produto. Cada ficha tem campos, e uma ficha se liga na outra (um cliente tem vários
agendamentos). Isso se chama **modelo de dados**. Anotar cada ficha com a prova de
onde ela saiu e o quanto a gente tem certeza:

```
Agendamento  código, serviço, profissional, começa_em, termina_em, nome_cliente, telefone,
             situação (confirmado | cancelado | remarcado), respostas do formulário
             prova: campos da T09, tela T10, artigo da ajuda "Como cancelar um horário"
             certeza: alta
```

Chute se marca como chute. A `/app-planejar` transforma isso no banco de dados de
verdade (o lugar onde o app guarda essas fichas).

### 7. A lista de funções

Gravar `app/funcoes.csv` a partir do modelo desta skill. As colunas são `funcao`,
`area`, `prioridade`, `original`, `minha` e `notas`:

- `prioridade`: `obrigatoria` (sem ela o app não serve), `importante` (o cliente
  sente falta logo) ou `desejavel` (se der tempo);
- `original`: `sim` quando o app de referência tem a função, `parcial` quando tem pela
  metade, `nao` quando só o seu app vai ter (os consertos da `/ler-avaliacoes` entram
  assim);
- `minha`: começa em `nao` em toda linha e vai sendo preenchida na construção (`sim`
  ou `parcial`); `pular` é o que fica de fora de propósito, com o motivo em `notas`.

A `/app-comparar` lê esse arquivo e dá a nota do seu app contra o de referência. Pra
abrir no Excel, tanto faz vírgula ou ponto e vírgula.

### 8. O que fica de fora

Escrever com franqueza o que não dá pra trazer, como linhas `pular` com o motivo:
conteúdo licenciado (um catálogo de música, um banco de fotos), a rede de clientes e
usuários que o app já tem, dado que é dele, acordo com parceiro, aparelho físico,
licença do governo (banco, saúde). O que o pacote reconstrói são as funções e o
caminho; o que o outro app conquistou continua dele.

### 9. O tamanho

Contar telas, caminhos e fichas, e listar as partes difíceis: coisa que atualiza ao
vivo na tela de todo mundo, sincronização entre aparelhos, pagamento, ligação com
agenda ou e-mail, funcionar sem internet. Dar um tamanho:

- **P**: poucas telas e um caminho só;
- **M**: um punhado de caminhos e algumas fichas;
- **G**: muitas telas, pagamento ou ligação com outro sistema;
- **GG**: grande demais pra começar; recortar de novo no passo 1.

Junto do tamanho, o aviso: app G ou GG leva muitas sessões do plano Claude. Nenhuma
promessa de cópia perfeita.

## Fim da etapa

Gravar `app/mapa.md` e `app/funcoes.csv` e mostrar no chat um resumo de cinco linhas:
o caminho principal, quantas telas e quantos caminhos, as três partes mais difíceis, o
que ficou de fora e o tamanho. Sem colar o mapa.

Próxima etapa: `/ler-avaliacoes`, pra ver o que os clientes do app de referência
reclamam e pedem antes de gastar tempo construindo.

## Regras

- Custo zero. Nada desta etapa gasta dinheiro nem publica nada.
- Nunca inventar dado. O que a página não mostrou fica em branco ou marcado como
  chute.
- Mapa que já existe em `app/mapa.md`: perguntar se refaz ou completa o que está lá.
- Um app por projeto. Um segundo app vira projeto novo.
