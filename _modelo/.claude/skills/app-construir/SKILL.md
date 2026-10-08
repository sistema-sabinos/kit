---
name: app-construir
description: >
  Monta o app tela a tela a partir do estudo, do plano e do visual: primeiro a casca com
  todas as telas, depois o caminho principal funcionando de ponta a ponta com dado de
  mentira, depois cada tela com todos os estados, marcando na lista de funções o que ficou
  pronto. Todo código, texto e imagem nasce aqui, sem nada copiado do app de referência.
  Etapa 5 de 11 do pacote criar app, sem gasto. Use quando o usuário chamar /app-construir,
  disser "começa a construir o app", "monta o app", "constrói a tela T07", "refaz essa
  tela", "faz a página de agendamento", "quanto falta pra terminar o app", ou depois da
  /app-visual.
---

# /app-construir, o app montado tela a tela

## O que essa skill faz

Escreve o código do app dentro de `app/codigo/` seguindo três passos: a casca (todas as
telas existem e se ligam), a fatia inteira (o caminho pelo qual o cliente paga funcionando
do começo ao fim) e o acabamento tela a tela. A cada tela pronta, marca a função na
lista de funções, tira o print pra `/app-comparar` e anota no diário de construção o que
ficou faltando. Quem escreve o código é a IA; o aluno olha, testa e decide.

Termos que aparecem aqui:

- **Tela:** cada página do app (T01, T02...), com o código que a `/app-estudar` deu.
- **Caminho:** a sequência de telas que o cliente percorre pra conseguir uma coisa (C01,
  C02...), também com o código do mapa.
- **Estado da tela:** como ela aparece em cada situação: vazia, carregando, cheia, com
  erro, sem permissão, no celular.
- **Rota:** o endereço de cada tela dentro do app (`/agenda`, `/clientes`).
- **Componente:** peça reaproveitada em várias telas (botão, campo, cartão, menu).
- **Token:** o valor de cor, letra e espaço com nome de papel (`texto`, `fundo`,
  `superficie`), definido uma vez na `/app-visual` e usado em todo lugar.
- **Dado de mentira:** clientes, horários e pedidos inventados, pra tela não nascer vazia.
- **Camada de dados:** a parte do código que busca e grava as fichas. Aqui ela começa de
  mentira, e a `/app-servidor` troca pela de verdade.
- **Servidor de desenvolvimento:** o app rodando só no seu computador, aberto no navegador
  pelo endereço `localhost` (quer dizer "esta máquina"). Ninguém de fora enxerga.
- **Console:** a área do navegador onde o app avisa erro escondido; tela bonita com erro
  no console está quebrada por dentro.

## Dependências

- `app/mapa.md` e `app/funcoes.csv` (a `/app-estudar` rodou): telas, caminhos e a lista
  de funções com a prioridade de cada uma.
- `app/arquitetura.md` (a `/app-planejar` rodou): ferramentas escolhidas e ordem de
  construção.
- `app/visual/` (a `/app-visual` rodou): tokens, letras e componentes, com contraste já
  conferido.
- Node instalado (o kit já instala) e o Playwright (o navegador que a IA controla sozinha)
  ligado pelo `/conectar`, pra tirar os prints. Sem Playwright a construção anda, e os prints ficam pra depois.
- `.claude/skills/app-planejar/referencias/fatos.md`, os fatos datados do pacote. Fato com
  mais de 60 dias em `conferido_em` se confere na web antes de afirmar ao aluno, e a linha
  se atualiza lá com a data nova.

Faltou algum desses: parar e indicar a skill que cria o que falta, na ordem do pacote.

## Antes de começar: o tamanho e o plano Claude

Ler o tamanho que a `/app-estudar` deu (P, M, G ou GG) e dizer ao aluno em uma frase:
app G ou GG leva muitas sessões do plano Claude, e construir consome bastante da cota.
Vale combinar quantas telas por sessão, e fechar cada sessão com o diário em dia (passo 4)
pra próxima pegar do ponto certo.

## As regras da construção

- **Sala limpa.** Todo código nasce aqui, escrito a partir do mapa e do plano. Fica
  proibido colar HTML, estilo, script, ícone ou imagem do app de referência, carregar
  qualquer arquivo do endereço dele e abrir o código da página dele pra adaptar.
- **Texto próprio.** Todo rótulo, botão, aviso de tela vazia e e-mail se escreve de novo,
  na voz do projeto (`marca/tom-de-voz.md`, quando existe). Fazer o mesmo que o botão da
  referência faz é a meta; a frase dele fica com ele.
- **Só token.** Componente usa o nome do papel (`texto`, `fundo`), sem cor solta nem
  medida solta. Faltou um valor: ele entra nos tokens da `/app-visual` e dali vai pra tela.
- **Dado de mentira com cara de mentira.** Nome, telefone e e-mail inventados. Dado de
  cliente real fica fora do código e do backup.
- **Pacote de código de outra pessoa** (as bibliotecas que o `npm`, o instalador de pacotes que vem com o Node, baixa) só com licença
  aberta, e o aviso de licença dele fica junto, que é a condição que essas licenças pedem.

A régua jurídica por trás, sem promessa de resultado jurídico (caso com dinheiro alto ou
briga com outra empresa vai pra um advogado):

- copiar código de outro sem licença que permita é ilegal; refazer uma função parecida com
  código seu é permitido (`app-lei-software`);
- a ideia do app, o método e o plano de negócio ficam livres pra qualquer um
  (`app-lei-ideia`);
- visual igual a ponto de o cliente confundir os dois apps pode ser julgado concorrência
  desleal, mesmo sem marca registrada (`app-lpi-195`, `app-trade-dress`). Por isso a aparência sai da
  `/app-visual` e da `/app-marca`, com família de cor própria.

Os ids entre crases estão em `.claude/skills/app-planejar/referencias/fatos.md`: ler a
linha antes de citar a lei ao aluno.

## Fluxo

### 1. A casca

Criar o projeto em `app/codigo/` com a ferramenta que o `app/arquitetura.md` escolheu (a
primeira instalação baixa os pacotes pela internet, grátis, e pode levar alguns minutos).
Depois:

- uma rota pra cada tela do mapa, mesmo que só com o título (página provisória);
- a moldura comum: menu, topo, barra lateral, do jeito que o mapa descreve;
- os tokens e os componentes da `/app-visual` ligados;
- a vitrine de componentes (`/vitrine`, Passo 5 da `/app-visual`): se `app/codigo/` não
  existia quando a `/app-visual` rodou, ela é o primeiro item da casca, com o print salvo
  em `app/visual/vitrine.png`;
- dado de mentira suficiente pra cada tela mostrar algo.

Rodar o servidor de desenvolvimento (de dentro de `app/codigo/`, o comando que a
ferramenta escolhida usa, como `npm run dev`) e pedir pro aluno abrir o endereço
`localhost` que aparece no terminal e clicar entre as telas. Casca de pé, `/syncar`.

### 2. A fatia inteira

O caminho principal do mapa (a coisa pela qual o cliente paga), funcionando de ponta a
ponta, antes de qualquer outra tela. Numa agenda de salão: cadastrar um serviço, abrir a
página pública, marcar um horário, ver o horário no painel. Pode sair feio; o que conta
aqui é funcionar. Se a `/app-servidor` ainda não rodou, a camada de dados é de mentira e
tem os mesmos nomes de função que a de verdade vai ter, pra troca não mexer em tela
nenhuma.

Mostrar ao aluno fazendo o caminho no navegador. Fatia de pé, `/syncar`.

### 3. Tela a tela

Na ordem do `app/arquitetura.md`. Pra cada tela:

1. Ler a linha dela no `app/mapa.md`: pra que serve, componentes, estados, por quais
   caminhos (C01, C02...) ela passa.
2. Olhar o print da referência que a `/app-estudar` guardou (`app/prints/T07.png`), só pra entender a ordem das
   coisas na tela e o que chama mais atenção. Cor, medida e texto saem do projeto.
3. Montar com os componentes da `/app-visual` e o dado da camada de dados.
4. **Todos os estados:** vazia, carregando (com o esboço cinza da tela, se a referência
   usa), cheia, com erro, sem permissão, com conteúdo comprido (um nome de 60 letras) e
   na largura de celular.
5. **O básico de acesso**, sempre: título e lista marcados como título e lista no código
   (o leitor de tela do cego depende disso), campo com rótulo, tudo alcançável pela tecla
   Tab, destaque visível em quem está selecionado, imagem com descrição em texto.
6. Marcar no `app/funcoes.csv`, na coluna `minha` (a do seu app), `sim` ou `parcial` (com uma nota
   do que falta) em cada função que a tela entrega.
7. Tirar o print pelo Playwright na mesma largura do print da referência, salvo em
   `app/telas-minhas/T07.png` (o código da tela), pra `/app-comparar`.
8. `/syncar` com a tela no nome: `construir: T07 página de agendamento`.

Tela que ficou pronta precisa passar em tudo isto:

- [ ] todos os estados do mapa, mais vazia, carregando e com erro
- [ ] funciona com 390 e com 1440 pixels de largura (celular e computador)
- [ ] dá pra fazer o caminho inteiro só com o teclado
- [ ] nenhum erro no console
- [ ] nenhum texto tirado da referência
- [ ] `app/funcoes.csv` atualizado
- [ ] print salvo em `app/telas-minhas/`

Arquivo de tipo que o backup do projeto não leva (fonte `.ttf`, vídeo, `.zip`) fica de fora
do GitHub; a `/faxina` avisa. Os tipos do app comum (código, estilo, imagem, `.ico`,
`.woff2`) já sobem.

### 4. O diário de construção

`app/diario-construcao.md`, uma linha por tela:

```markdown
| tela | data | pronta ou parcial | o que falta | o que deu mais trabalho que o esperado |
|---|---|---|---|---|
| T07 | AAAA-MM-DD | parcial | lembrete por e-mail (fica pra /app-servidor) | conflito de horário |
```

Função que se mostrou maior do que parecia vai pro diário e pro chat na hora, com o que
falta. Meia função entregue sem aviso é proibida.

## Travou em como algo funciona

Voltar à referência como cliente comum: a central de ajuda dela, o vídeo público de
demonstração, a conta do próprio aluno, se ele tiver. Código da página e as chamadas que
ela faz por baixo ficam fechados. Entendido o comportamento, escrever a versão própria.

## Resumo no chat

Telas prontas sobre o total, funções obrigatórias prontas sobre o total (contadas no
`app/funcoes.csv`), o que ficou parcial e por quê, e o caminho do diário. Fecha dizendo o
próximo passo: `/app-servidor` (etapa 6) se a camada de dados ainda é de mentira; se ela
já é de verdade, `/app-testar` (etapa 7).

## Regras

- Sem gasto nesta etapa. Imagem ou ilustração paga fica fora daqui. Se o aluno tem o
  pacote do Mercado Livre, a `/gerar-imagens` faz, e ela avisa o custo antes e espera o
  "pode ir"; sem ele, a imagem do app sai em SVG (desenho feito em código) ou de banco de
  imagem grátis com licença aberta.
- Conta, login, chave e pagamento de verdade ficam pra `/app-servidor`. Chave nunca entra
  no código; quando chegar a hora, mora no `.env` (o arquivo de segredos que o backup não
  leva).
- Nunca inventar o que a referência faz: o que o mapa não mostrou se pergunta ao aluno ou
  volta pra `/app-estudar`.
- Um app por projeto, sempre em `app/codigo/`. Segundo app vira projeto novo.
- O app de celular (App Store e Google Play) é opcional e só começa depois do site no ar:
  quando o `app/arquitetura.md` prevê celular, a versão pelo Expo (a ferramenta que
  transforma o app em instalável de Android e iPhone) se monta aqui, numa sessão própria,
  e o envio pras lojas é da `/app-publicar`.
