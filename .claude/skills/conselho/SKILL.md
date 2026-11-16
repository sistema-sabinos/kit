---
name: conselho
description: >
  Reúne o Conselho de organização: quatro papéis (Fluxo, Ferramentas e dados, Dono
  e tempo e, por último, Ponto de Falha) leem como as áreas e os processos se
  ligam, dentro de um projeto ou, na pasta-mãe, entre os projetos, e devolvem o que
  está quebrado, sobrando ou dependendo de uma pessoa só. O que é seguro a conversa
  já arruma, guardando uma cópia antes e contando o que mudou; o resto vira
  pergunta. Gasta umas 6 conversas normais, então só roda com o sim,
  depois do aviso. Rodar quando a pessoa chamar /conselho ou disser "chama o
  conselho", "reunião do conselho" ou "como meus projetos se ligam". Pedido de
  conselho ou opinião ("me dá um conselho", "o que você acha") fica na conversa
  normal; conselheiro de uma pessoa famosa é a /clonar-especialista; decisão de
  gastar, contratar ou assinar é a /diretoria.
---

# /conselho, a reunião de organização

O negócio cresce aos pedaços: uma planilha aqui, uma rotina ali, um fornecedor que só o dono
conhece. Um dia ninguém sabe mais quem passa o quê pra quem. O Conselho olha as ligações: cada
papel lê os arquivos procurando o que está quebrado do lado dele, o Ponto de Falha procura o que
quebra junto, e a conversa arruma o que é seguro, pergunta o resto e conta tudo no fim.

A `/diretoria` decide uma coisa cara (gastar, contratar, assinar). O Conselho não decide gasto:
quando a reunião bate num gasto, ela aponta a `/diretoria` e não faz a conta.

Quem conduz é esta conversa. Ela não é um dos papéis e não dá parecer próprio: monta o pacote,
chama os papéis, junta, fecha o nível de cada recomendação pela tabela e grava a ata.

## Passo 0, onde estou

Olhar a raiz da pasta aberta:

- tem `_contexto/empresa.md` e `.claude/skills/conselho/SKILL.md`: é um **projeto**. A reunião
  olha só ele por dentro.
- tem `_modelo/AGENTS.md` e `.claude/skills/conselho/SKILL.md`: é a **pasta-mãe**. A reunião olha
  como os projetos se ligam e não mexe dentro de nenhum.
- nenhum dos dois: parar e dizer "Abra a pasta-mãe do SabinOS ou a pasta de um projeto e me
  chame de novo." Sem ler nem gravar nada.

Robô do `/agendar`, rotina agendada e sessão sem gente na frente nunca rodam a reunião: ela
precisa da pessoa pra dizer sim no aviso e pra decidir o vermelho.

## Passo 1, o aviso

Antes de qualquer leitura, uma mensagem curta:

"Posso chamar o Conselho: quatro leituras dos seus arquivos, cada uma de um ângulo (como o
trabalho passa de mão em mão, ferramentas e dados, o que depende só de você e o que quebra
junto). Gasta umas 6 conversas normais da sua cota. Quer?"

(O número vem do teste de 2026-11-16: a reunião mais cara, a da pasta-mãe, gastou umas 6 vezes
os tokens novos de uma conversa comum com o mesmo pedido; num projeto, de 3 a 5 vezes. Cota é dado
que muda com o plano da pessoa.)

Sem o sim, a conversa segue normal. Com o sim, Passo 2.

## Passo 2, o pacote

No projeto, ler e listar por caminho: `_contexto/empresa.md`, `_contexto/estrategia.md`,
`_contexto/ferramentas.md`, `_contexto/automacoes.md`, `_contexto/infra.md`,
`_contexto/orcamento.md`, os nomes de `_contexto/pessoas/`, `tarefas.md`, o fim do
`_memoria/decisoes.md`, os recados de `_memoria/recados/`, a lista de `.claude/skills/` e as
subpastas que têm `AGENTS.md` (frentes do projeto). O que não existir fica de fora sem aviso.

Na pasta-mãe, os projetos são as pastas da raiz com `_contexto/` dentro (as que começam com `_`
ou `.` e a `docs/` nunca são projeto). De cada projeto entram `_contexto/empresa.md`,
`_contexto/ferramentas.md`, `_contexto/automacoes.md`, `_contexto/estrategia.md` e os nomes de
`_contexto/pessoas/`. Mais de 6 projetos: perguntar quais entram, com opções.

Ficam fora sempre: `.env` e qualquer arquivo de senha, `~/.claude`, pasta de fora deste lugar.
A pergunta da reunião sai com as palavras da pessoa; sem pergunta, vale "como as áreas e os
processos se ligam, e o que arrumar".

## Passo 3, a ata

Antes de chamar os papéis, criar `_memoria/conselho/AAAA-MM-DD-<tema>.md` (tema curto, minúsculas
e hífen) com a pergunta, o lugar (projeto ou pasta-mãe) e a lista do pacote. O nome da ata sem o
`.md` (`AAAA-MM-DD-<tema>`) é o nome da reunião no script de cópia. Cada parecer entra
assim que volta, debaixo de `## <papel>`. Criar e acrescentar sempre pela ferramenta de escrever
e editar arquivo, nunca por comando de terminal (`cat >>`, `echo >>`, `Add-Content`): a trava do
kit pode barrar, e o parecer se perde no meio da reunião.

Reunião que caiu no meio: ler o arquivo do mesmo tema em `_memoria/conselho/` e chamar só o papel
que ainda não tem parecer. Com `## Resposta` gravada, a reunião acabou e não se refaz.

## Passo 4, os papéis

Cada papel vai pelo subagente `conselho-conselheiro` (`subagent_type: conselho-conselheiro`), que
só lê arquivo: não tem terminal, internet nem como gravar. Se ele não aparecer (pasta
`.claude/agents/` criada nesta sessão pede reiniciar o Claude Code), parar e pedir pra pessoa
reiniciar; nunca trocar calado por outro tipo de subagente.

Fluxo, Ferramentas e dados e Dono e tempo rodam juntos. O prompt de cada um é o conteúdo inteiro
de `.claude/skills/conselho/referencias/<papel>.md` (`fluxo`, `ferramentas-dados`, `dono-tempo`),
mais no fim:

```
PAPEL: <nome>
LUGAR: <projeto ou pasta-mãe>
PERGUNTA: <com as palavras da pessoa>
ARQUIVOS: <lista do pacote, por caminho>
```

Depois que os três voltaram, o Ponto de Falha vai pelo mesmo subagente, com
`referencias/ponto-de-falha.md`, o mesmo bloco e, debaixo de `PARECERES:`, os três pareceres
colados inteiros.

O parecer volta com `PAPEL: <nome>` na primeira linha. Sem ele, ou com o nome de outro papel,
despachar de novo uma vez.

## Passo 5, a contestação (só quando há divergência)

Ler os quatro pareceres. Há divergência quando dois papéis falam do mesmo alvo (o mesmo arquivo,
a mesma rotina, a mesma tarefa) e dão nível diferente, recomendam o oposto, ou um diz que há
problema e o outro diz que está ok. Sem divergência, este passo não roda.

Com divergência, uma volta só: cada papel envolvido vai de novo pelo `conselho-conselheiro`, com a
referência dele, o bloco do Passo 4 e, debaixo de `CONTESTAÇÃO:`, só as linhas "O que fazer" e "O
risco" do outro papel sobre aquele alvo. Ele responde se mantém ou muda, com arquivo e linha.
Divergência que ficou entra na resposta como risco, com os dois lados.

A ata registra numa linha: `Contestação: não disparou` ou `Contestação: disparou (<papéis>, <alvo>);
recomendações que mudaram: <quantas>`.

## Passo 6, o nível de cada recomendação

Juntar as recomendações dos pareceres numa lista. Só entra recomendação que conserta um problema
achado, com arquivo e linha: algo quebrado, faltando, repetido ou preso numa pessoa só, que faz
diferença no dia a dia. Ajuste cosmético, "seria bom ter" e tarefa que ninguém pediu ficam de fora,
e não viram pergunta. Tarefa nova no `tarefas.md` só entra pra algo já decidido que falta fazer;
dúvida que só a pessoa responde ("quem faz", "qual vale") vira pergunta na resposta, no máximo 3,
as que mais pesam. Projeto ou pasta-mãe em ordem: a resposta diz isso em uma linha, cita o que
está bem amarrado e não mexe em nada; inventar problema é tão ruim quanto deixar passar.

O nível de cada uma sai desta tabela, pelo alvo e pela ação. O nível que o papel sugeriu só pode **subir** o da tabela, nunca baixar. Alvo que não
está na tabela vale vermelho.

| Alvo | Ação | Nível |
|---|---|---|
| a ata e o registro de `_memoria/conselho/` | criar e acrescentar | verde |
| `_memoria/recados/` | acrescentar recado | verde |
| `_contexto/empresa.md`, `_contexto/estrategia.md`, `_contexto/ferramentas.md`, `_contexto/automacoes.md`, `_contexto/pessoas/<nome>.md` do projeto aberto | acrescentar ou trocar linha | amarelo |
| `tarefas.md` do projeto aberto | acrescentar tarefa | amarelo |
| `_contexto/autonomia.md` | qualquer mudança | vermelho |
| skill, agente ou qualquer coisa em `.claude/` | criar ou mudar | vermelho |
| rotina do `/agendar` ou automação nova | criar, ligar ou mudar | vermelho |
| qualquer arquivo ou pasta | apagar ou mover | vermelho |
| dinheiro, mensagem pra fora, publicação, conta de terceiro | qualquer | vermelho |
| arquivo de outro projeto (reunião na pasta-mãe) | qualquer escrita que não seja recado | vermelho |

Na pasta-mãe não há amarelo: o que um projeto precisa mudar vira recado no `_memoria/recados/`
dele (`AAAA-MM-DD-conselho-<assunto>.md`, começando com `de: conselho`, `quando:` e `precisa de
ação: sim`), e a mudança se faz numa conversa aberta na pasta daquele projeto.

## Passo 7, aplicar o verde e o amarelo

Verde se aplica direto. Amarelo se aplica sozinho, com volta garantida, menos quando a linha
`Modo:` do `_contexto/preferencias.md` diz Consultivo: aí o amarelo vira pergunta, um por vez.

Antes de criar ou mexer em cada arquivo fora da ata (amarelo e recado), guardar a cópia pelo
script, que copia byte a byte e anota o registro antes da mudança:

`node .claude/skills/conselho/scripts/copia.mjs antes <arquivo> [<arquivo>...] --reuniao <AAAA-MM-DD-tema>`

Uma chamada só, com todos os arquivos da vez, sem laço nem fila de comandos (`for`, `&&`, `;`):
no teste, o laço e a fila quebraram no terminal do Windows.

Arquivo que ainda não existe (recado, tarefa nova) também passa pelo `antes`: o registro anota
"novo", e a volta apaga.
Depois, mudar o arquivo pela ferramenta de editar, seguindo a tabela de destinos do `AGENTS.md`
(linha nova, data absoluta, a velha trocada mostrando o antes e o depois).

## Passo 8, o vermelho

O vermelho vai pra pessoa, uma pergunta por vez, com o que muda, o porquê e o risco em duas
linhas. Gasto, contrato ou assinatura: oferecer a `/diretoria`. Vermelho de risco alto (lista do
`.claude/detalhe-regras.md`) passa pela `/segunda-opiniao` antes do ok, como manda o `AGENTS.md`.
Sem o sim, fica anotado na ata como "não feito".

## Passo 9, a resposta e a ata

Uma resposta só, em linguagem simples, sem citar papel nem parecer:

- **Como está ligado:** o desenho de hoje, em poucas linhas.
- **O que eu arrumei:** cada mudança do verde e do amarelo, com o antes e o depois.
- **O que precisa de você:** o vermelho, se ainda faltar resposta.
- **Pra desfazer:** "é só pedir: volta o que o conselho mudou".

Gravar a resposta debaixo de `## Resposta` na ata, mais a tabela das recomendações:

`| Recomendação | Papel | Nível | Feito | Cópia | Voltou |`

E uma linha no diário.

## Volta o que o conselho mudou

Quando a pessoa pede pra desfazer (nesta conversa ou em outra):

`node .claude/skills/conselho/scripts/copia.mjs voltar --reuniao <AAAA-MM-DD-tema>`

Sem `--reuniao`, volta a última reunião do registro. O script devolve cada arquivo como estava,
apaga o que a reunião criou e anota a volta no registro. Antes, ele guarda o que está em cada
arquivo naquela hora (com o que a pessoa mexeu depois da reunião) e diz onde ficou: contar isso
à pessoa, pra ela pegar de volta o que quiser. Depois, marcar `sim` na coluna Voltou da
ata e dizer o que voltou, arquivo por arquivo. Se o script pedir pra voltar antes outra reunião,
ou as duas juntas, perguntar à pessoa antes: a outra reunião ela não pediu pra desfazer.

## No Codex, ou onde não houver subagente

A conversa faz os papéis uma por vez, no próprio chat, seguindo cada referência como se fosse a
primeira vez que lê o pacote, e o Ponto de Falha por último. Avisar numa linha: "a reunião foi
feita aqui mesmo, sem leituras separadas, então é menos independente". A ata, a tabela e a cópia
valem igual.
