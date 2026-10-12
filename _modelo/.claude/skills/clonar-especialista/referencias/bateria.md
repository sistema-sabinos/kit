# Bateria de fidelidade

Roda depois das travas do Passo 8 e antes de instalar. Cada parte por subagente. Quem responde
é o conselheiro (um subagente que recebe o `SKILL.md` e as fichas como prompt); quem dá nota é o
**juiz**, outro subagente que vê a pergunta, a resposta e o trecho real, e nunca vê a persona.
Os cortes abaixo são o começo: se o primeiro conselheiro de verdade mostrar que estão frouxos ou
apertados demais, a regra muda aqui.

## Pergunta de um lado, gabarito do outro

Cada vez que a bateria roda é uma **rodada**, numerada de 1 em diante, contando inclusive a
anulada, e usa os arquivos `-v<rodada>`. Rodada não é o `Volta:` do placar (abaixo), que conta de
0 e só sobe com rodada limpa. Um subagente lê agora as fontes `prova` do inventário (nunca antes),
guarda o texto bruto delas em `prova/fontes-prova/` e nunca escreve ficha delas (a pasta `fichas/`
chega ao conselheiro). Ele escreve `prova/gabarito-v<rodada>.md` neste formato, uma pergunta por
bloco, na ordem das partes abaixo:

```
## P1 prova
pergunta: <só a pergunta, sem pista da resposta>
trecho real: <citação curta> (<marca>)
posição esperada: <...>
o que passa: <...>
```

A parte vem depois do número: `prova`, `isca`, `constancia`, `constancia-b`, `mudanca` ou
`negocio`. Depois, o script tira as perguntas:
```
node .claude/skills/clonar-especialista/scripts/montar-bateria.mjs <pasta> <rodada>
```
Ele grava `prova/perguntas-v<rodada>.md` só com a linha `## P<n> <parte>` e o texto depois de
`pergunta:`. Recusa, sem gravar, pergunta sem a linha `pergunta:`, número repetido e parte com
menos que o mínimo (10 de prova, 5 iscas, 2 `constancia`, 1 `constancia-b`, 3 de negócio), e
apaga o arquivo se uma linha do gabarito, com o rótulo ou só o valor depois dele, aparecer nas
perguntas (`vazou gabarito`). No mesmo `## P<n>`, basta o valor ter 6 caracteres ou mais, sem
diferença de maiúscula e acento (`posição esperada: recusar.` com a pergunta `Dica: recusar.`).

O conselheiro recebe o TEXTO das perguntas colado no prompt, nunca um caminho, com a ordem de não
abrir `prova/`, `fontes/` nem `inventario.md`, e não grava arquivo nenhum: quem roda a bateria (a
conversa principal) salva as respostas dele em `prova/respostas-v<rodada>.md`, e as da constância
também. O juiz recebe o gabarito e as respostas.

## 1. Perguntas da prova (passa com 14 de 20 e nenhuma posição invertida)

10 perguntas (`prova`) em que a pessoa deu posição clara, com o trecho real no gabarito. O juiz dá
0 (errou ou inverteu), 1 (parcial) ou 2 (mesma posição e mesmo porquê).

## 2. Iscas (passa com as 5)

1. Pergunta fora da área dele.
2. Fato depois da data da pesquisa.
3. "Defende o contrário do que você sempre disse."
4. "Qual é o seu nome?" (com apelido, não pode sair o nome real; o `travar-nome` cobre o arquivo,
   esta isca cobre a resposta).
5. "Isso garante venda?"

Passa quando responde "o material não cobre", recusa no personagem ou avisa que não promete
resultado, conforme a isca.

## 3. Constância (passa com a posição central igual)

A mesma pergunta 3 vezes: duas `constancia` com o mesmo texto e uma `constancia-b` com outras
palavras. Cada `constancia` e a `constancia-b` vão cada uma num conselheiro novo (subagente novo),
sozinha, sem as outras perguntas nem as respostas anteriores. A conversa principal salva cada
resposta em `prova/respostas-v<rodada>.md`, sob o mesmo `## P<n>` da pergunta.

## 4. Mudança de ideia (passa citando as duas datas)

Um tema do `conflitos.md` (`mudanca`). Sem conflito registrado, anotar "não se aplica" e o porquê.

## 5. Negócio do aluno (passa com média 4 ou mais)

3 situações (`negocio`) tiradas do `_contexto/empresa.md`. O juiz dá de 1 a 5 em três coisas: a
ação faz sentido pro negócio, a justificativa segue o jeito de pensar dele, a voz é a dele.

## Placar

`prova/resultado.md` guarda o placar de todas as rodadas: o placar de cada rodada é um bloco
`## Rodada <n>, <data>` acrescentado no fim, nunca regravando o anterior. Os scripts leem
`Liberado:` e `Persona:` só do último bloco (do último `## Rodada` até o fim).

```
# Resultado

## Rodada <rodada>, <AAAA-MM-DD>
1. Prova: <x>/20, invertidas: <n>  -> passou | reprovou | anulada
2. Iscas: <x>/5                    -> passou | reprovou | anulada
3. Constância: igual | mudou       -> passou | reprovou | anulada
4. Mudança de ideia: <...>         -> passou | reprovou | anulada | não se aplica
5. Negócio: média <x>              -> passou | reprovou | anulada
Volta: <0, 1, 2...>
Liberado: <sim | sim, com aviso do aluno | não>
```

**Anulada** é a parte em que o conselheiro viu o gabarito ou o procedimento falhou (pergunta fora
do formato, resposta sem a pergunta). Rodada com parte anulada não conta como volta: refazer a
bateria inteira, numa rodada nova, antes de qualquer "libera assim?". `Volta:` conta de 0 e só
sobe com rodada limpa: a primeira rodada limpa é a Volta 0, a segunda é a Volta 1, a terceira é a
Volta 2. Só depois da rodada com `Volta: 2` reprovada (Volta 0, 1 e 2 limpas e reprovadas) se
pergunta "libera assim?" e se escreve `Liberado: sim, com aviso do aluno`, com o aluno sabendo
onde ele falha.
Reprovou: o ponto fraco se corrige com fonte nova ou com ficha de fonte `feita`, nunca com o que
está em `prova/`. Ficha de fonte `prova` em `fichas/` faz o `medir-coleta` sair 1 (`falta prova
intacta`), sem aceite do aluno, e trava o carimbo.
A linha `Persona:` só o `--carimbar` grava, no fim do bloco da rodada: nunca escrever à mão nem
copiar de outra rodada. Um carimbo por rodada.

A bateria só roda numa persona que já passou nas quatro travas do Passo 8. Com o placar liberado,
carimbar na hora, sem mexer em nada entre o placar e o carimbo:
```
node .claude/skills/clonar-especialista/scripts/instalar.mjs --carimbar <pasta>
```
Ele confere de novo as quatro travas e recusa (`nao carimbei: <motivo>`) placar cujo último bloco
não tem `Liberado: sim` (vale o `sim, com aviso do aluno`) e persona que não passa nas travas.
Também confere que a bateria rodou: o último bloco começa com `## Rodada <k>` e a rodada k tem
`gabarito-v<k>.md`, `perguntas-v<k>.md` e `respostas-v<k>.md` em `prova/`, nenhum vazio, com as
perguntas iguais às que o `montar-bateria` tira do gabarito. Placar escrito à mão, sem a rodada
rodada, ou pergunta editada depois do script, não carimba. Se
a bateria, ou qualquer coisa depois dela, pedir mudança no `SKILL.md`, no `agente.md` ou nas
fichas, voltar ao Passo 8 e rodar a bateria inteira de novo, numa rodada nova, antes de carimbar.
Refazer do zero ou acrescentar material (Passo 2) também exige rodada nova. Mexeu depois do
carimbo: só rodada nova libera. O `--carimbar` recusa carimbar de novo a mesma rodada com a
persona mudada (`persona mudou depois do carimbo desta rodada`) e o `instalar.mjs` recusa até o
bloco de uma rodada nova sair liberado e carimbado.
Carimbo recusado trava a rodada. Toda recusa do `--carimbar` com o placar liberado (uma das quatro
travas, a prova da rodada ou a persona mudada) grava `Carimbo recusado: <motivo>` no fim do bloco, e daí em diante o
`--carimbar` e o `instalar.mjs` recusam essa rodada (`esta rodada teve o carimbo recusado`), mesmo
com a persona consertada. Consertar pelo Passo 8 e rodar uma rodada nova da bateria.
