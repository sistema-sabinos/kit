---
name: app-comparar
description: >
  Mede o quanto o seu app já faz do que o app de referência faz: placar de paridade a partir
  da lista de funções (peso maior pra obrigatória), lista do que falta na ordem de construir,
  comparação dos prints de tela que olha a disposição e ignora a cor, comparação de
  comportamento caminho a caminho e o veredito (ainda não dá pra lançar, dá pra lançar ou
  melhor que a referência). Etapa 8 de 11 do pacote criar app, custo zero. Use quando o
  usuário chamar /app-comparar, disser "quanto falta pro meu app", "compara com o original",
  "o que ainda falta", "meu app já tá pronto?", "dá pra lançar?", "compara as telas", "qual a
  nota do meu app", ou depois da /app-testar.
---

# /app-comparar, quanto do trabalho o seu app já faz

## O que essa skill faz

Responde "o meu app já está pronto pra ir pro ar?" com número. Primeiro o placar de
**paridade**, que é o quanto o seu app já faz das funções do app de referência (o app que a
`/app-estudar` estudou): sai uma nota de 0 a 100, a nota de cada área e a lista do que falta,
na ordem em que vale construir. Depois compara os prints das telas principais, pra ver se a
informação está nos mesmos lugares. Depois anda pelos caminhos nos dois apps e anota o que os
números não enxergam. No fim, junta tudo num relatório com o veredito.

Paridade mede se o seu app faz o mesmo trabalho. A aparência muda de propósito na
`/app-marca`, que troca toda cor, nome e logo. Por isso a comparação de telas ignora cor, e
ninguém persegue o visual exato da referência: o visual do conjunto de outro app (o que a lei
chama de trade dress) é dele, e copiar a ponto de confundir o cliente é concorrência desleal
(ids `app-trade-dress` e `app-lpi-195` do `fatos.md`, ver "O que a lei diz" abaixo).

## Dependências

Caminhos que começam em `app/` são da raiz do projeto.

- `app/funcoes.csv`, a lista de funções que a `/app-estudar` montou e a `/app-construir` foi
  marcando. Colunas: `funcao`, `area`, `prioridade` (`obrigatoria`, `importante` ou
  `desejavel`), `original` (a referência tem a função: `sim`, `parcial` ou `nao`; `nao` é
  função que só o seu app tem), `minha` (o seu app:
  `sim`, `parcial`, `nao` ou `pular`) e `notas`.
- `app/prints/`, os prints do app de referência que a `/app-estudar` guardou, um por tela,
  com o código da tela no nome (`T07.png`).
- `app/telas-minhas/`, os prints do seu app que a `/app-construir` tirou, com o mesmo código
  (`T07.png`).
- `app/defeitos.md`, da `/app-testar`, pra saber se tem defeito grave aberto.
- `app/consertos.md`, da `/ler-avaliacoes`, quando existe: o que o cliente da referência
  odeia e o seu app resolve.
- O app rodando no seu computador (o servidor local, o app ligado só na sua máquina), pra
  comparar o comportamento no passo 3.

Grava `app/paridade.md` (o relatório), as imagens de diferença em `app/diferencas/` e os
resultados de cada tela em `app/comparacoes/`.

## Fluxo

### 1. O placar de funções

Antes de rodar, conferir com o aluno que o `app/funcoes.csv` está em dia: toda linha com a
coluna `minha` preenchida. `parcial` leva uma nota do que falta. `pular` leva o motivo (uma
função que fica de fora de propósito, como a rede de parceiros que é da referência). Função
que só o seu app tem entra com `original` igual a `nao`.

```bash
node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv
```

Como a conta é feita: obrigatória pesa 3, importante pesa 2, desejável pesa 1; `sim` vale
inteiro, `parcial` vale metade e `nao` vale zero. As linhas `pular` e as funções que só o seu
app tem ficam fora da nota e aparecem em listas à parte, assim o número mede só o que a
referência faz. A função só sua continua contando nas obrigatórias prontas e no que falta:
obrigatória só sua sem fazer segura o lançamento igual a qualquer outra. O script mostra:

- a nota das funções e quantas obrigatórias estão prontas de quantas existem;
- a nota de cada área, a mais fraca primeiro;
- o que falta, na ordem de construir (obrigatória antes de importante, `nao` antes de
  `parcial`);
- o que está escrito errado na lista (prioridade ou valor que ele não reconhece), com o número
  da linha. Corrigir no `app/funcoes.csv` e rodar de novo.

O script termina sem erro mesmo faltando obrigatória. O que vale é o texto: a linha
`obrigatorias N de N prontas` com os dois números iguais e a frase do veredito.

### 2. A comparação de telas

Escolher as telas principais (as do caminho pelo qual o cliente paga, mais a tela inicial).
Pra cada uma, os dois prints precisam estar na **mesma largura** (1440 pixels pro computador,
390 pro celular) e no **mesmo estado**: a mesma quantidade de dado na tela, a mesma aba
aberta, logado do mesmo jeito. Print de tela vazia contra print de tela cheia dá nota baixa
por motivo errado.

Os prints da referência vêm das páginas públicas ou da conta do próprio aluno, como a
`/app-estudar` ensinou. Faltou algum: tirar à mão, ou pelo navegador do `/conectar` com o
aluno olhando, uma página por vez, no ritmo de gente. Nunca rodar robô nem script contra o
servidor do app de referência. Os prints do seu app saem pelo Playwright (a ferramenta que
abre um navegador e clica sozinha), na mesma largura, salvos em `app/telas-minhas/`.

Criar as pastas `app/diferencas/` e `app/comparacoes/` se ainda não existem, e rodar uma tela
por vez, da raiz do projeto:

```bash
node .claude/skills/app-comparar/scripts/comparar-telas.mjs app/prints/T07.png app/telas-minhas/T07.png --saida app/diferencas/T07.png
```

O primeiro arquivo é sempre o da referência e o segundo o seu. O modo padrão compara a
**disposição**: transforma as duas telas num desenho só de contornos, corta numa grade e vê
se cada pedaço tem coisa no mesmo lugar. Cor não conta. Margem vazia nas duas também não
conta, pra não inflar a nota. Print de tela de retina (a tela de alta resolução do Mac e do
celular) compara normal com print comum, porque os dois vão pra mesma largura antes.

O que ele devolve:

| nota | quer dizer |
| --- | --- |
| 90 ou mais | bate |
| 75 a 89 | perto |
| 50 a 74 | em parte |
| abaixo de 50 | diferente |

Junto vêm as regiões que mudam (topo, meio, baixo; esquerda, centro, direita), em pixel do
print da referência, a maior primeiro, e o aviso quando a sua tela é bem mais alta ou mais
baixa. A imagem em `app/diferencas/` pinta de vermelho onde muda.

Pra a nota das telas entrar no placar, gerar também o resultado em arquivo (um `.json`, o
formato de texto que o placar lê). O `--json-saida` grava esse arquivo direto, no formato
que o placar lê, em qualquer terminal (PowerShell ou Git Bash):

```bash
node .claude/skills/app-comparar/scripts/comparar-telas.mjs app/prints/T07.png app/telas-minhas/T07.png --saida app/diferencas/T07.png --json-saida app/comparacoes/T07.json
node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --visual app/comparacoes
```

Com telas, a nota geral passa a ser 80% funções e 20% telas.

`--modo pixel` compara pixel a pixel. Serve pro seu app contra ele mesmo (o print de hoje
contra o da semana passada, pra ver se alguma tela mudou sem querer). Contra a referência,
sempre o modo padrão.

### 3. A comparação de comportamento

Andar por cada caminho principal (os C01, C02... do `app/mapa.md`) nos dois apps: na
referência, como cliente comum, com a mão; no seu, no servidor local. Anotar o que os números
não enxergam:

- quantos cliques pra terminar o caminho principal (menos que a referência é ponto a favor);
- o que acontece quando dá erro (senha errada, campo vazio, sem internet);
- o que o app lembra de uma visita pra outra;
- que e-mails chegam e quando. No seu app, e-mail de teste vai só pro endereço do próprio
  aluno; mandar pra outra pessoa é mensagem pra fora e espera o lançamento.

Cada diferença vira uma linha: caminho, o que a referência faz, o que o seu faz, consertar ou
manter.

### 4. O relatório e o veredito

Gravar `app/paridade.md` com a nota geral, a nota das funções, a nota de cada tela, o que
falta na ordem de construir, as diferenças de comportamento e o veredito. Pra sair a versão
pronta pra arquivo:

```bash
node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --visual app/comparacoes --markdown
```

O veredito junta o placar com o `app/defeitos.md` (gravidade 1 trava tudo, 2 quebra uma
função) e o `app/consertos.md`:

- **Ainda não dá pra lançar:** falta alguma obrigatória, a nota das funções está abaixo de 80,
  ou tem defeito de gravidade 1 ou 2 aberto.
- **Dá pra lançar:** todas as obrigatórias prontas, nota das funções 80 ou mais e nenhum
  defeito de gravidade 1 ou 2 aberto.
- **Melhor que a referência:** dá pra lançar e, além disso, o app resolve pelo menos um dos
  consertos da `/ler-avaliacoes`. Esse é o objetivo: o cliente troca de app pelo que o seu
  resolve e a referência deixa sem resolver.

O script chama de "melhor que a referência" a lista com pelo menos uma função só sua pronta
e todas as suas obrigatórias e importantes feitas; faltando alguma importante só sua, ele fica
em "dá pra lançar".
Conferir no `app/consertos.md` se essas funções são consertos de verdade; se forem só extras,
o veredito fica em "dá pra lançar".

Número honesto. App com 62 está em 62, e o relatório diz 62.

### 5. Resumo no chat

A nota geral, as obrigatórias prontas de quantas, o veredito, as 5 primeiras coisas a
construir e o caminho do `app/paridade.md`. Sem colar o relatório inteiro.

## O que a lei diz

Os fatos estão em `.claude/skills/app-planejar/referencias/fatos.md`. Antes de citar qualquer
um ao aluno, achar a linha pelo id e olhar o `conferido_em`: passou de 60 dias, abrir a fonte
da linha hoje, conferir e atualizar a data antes de falar. Linguagem simples, sem prometer
resultado jurídico:

- refazer uma função parecida com a da referência, escrevendo o seu próprio código, em regra é
  liberado; a lei do software protege o código e deixa livre a semelhança que vem só da função
  (id `app-lei-software`);
- copiar o visual do conjunto a ponto de o cliente confundir um app com o outro pode ser
  concorrência desleal, mesmo sem a referência ter registrado nada (ids `app-trade-dress` e
  `app-lpi-195`). Por isso a nota de telas olha a disposição e ignora cor, e a `/app-marca` vem
  logo depois.

Isso é orientação geral, sem garantia de resultado. Caso com dinheiro alto em jogo ou
notificação de outra empresa vai pra um advogado.

## Regras

- Custo zero: só scripts no seu computador e leitura dos arquivos de `app/`.
- Nenhum robô, teste ou script contra o servidor do app de referência. Lá, só como cliente
  comum, com a mão.
- Print da referência é só referência: fica em `app/prints/` e nunca entra no código do app.
- Nota honesta, sem arredondar pra cima.

## Depois

Com coisa faltando, voltar pra `/app-construir` com a lista do que falta, na ordem do
relatório. Com o veredito "dá pra lançar" ou "melhor que a referência", a próxima etapa é a
`/app-marca`, que dá ao app um nome e uma cara que são seus.
