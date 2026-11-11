---
name: atualizar
description: >
  Fecha a sessão e mantém a memória do sistema em dia: passa o que aconteceu pela
  tabela de destinos (decisão, diário, contexto, onde paramos) e audita a memória
  do projeto. Use quando o usuário chamar /atualizar, disser "fecha a sessão", "encerra
  por hoje", "registra o que fizemos" ou "arruma o contexto", ou quando aceitar a
  oferta de fechar; nunca sem gente na frente (tarefa agendada). Versão nova do
  SabinOS é com o /atualizar-sabinos.
---

# /atualizar, Manutenção de contexto

Duas funções em uma: fechar a sessão (passar o que aconteceu nesta conversa pela tabela de destinos do `AGENTS.md`) e conferir que o que a sessão tocou ficou coerente com os arquivos de contexto. A auditoria da pasta inteira é da `/faxina`.

## Passo 1: Levantar o estado real

A fonte do fechamento é a conversa: o que foi feito, decidido e criado nela. O inventário da pasta inteira (pastas soltas, skills, MCPs, backup) é da `/faxina` e do `/checar`, que rodam quando a pessoa pede ou uma vez por mês, nunca aqui em todo fim de sessão.

1. **Ponte do Codex**, se `.agents/skills` existir como pasta comum (cópia, não link ou junction): levar `.claude/skills` pra lá pra skill nova aparecer no Codex. Cópia calada só pro arquivo que ainda não existe em `.agents/skills`. Arquivo que já existe lá com conteúdo diferente do de `.claude/skills` nunca se copia calado, porque não dá pra saber se quem mexeu foi o Codex ou a fonte: fica de fora da cópia, entra no plano do Passo 5 com a diferença e só se copia com o sim
2. **Pasta ou skill nova desta sessão**: se a conversa criou pasta de primeiro nível ou skill, conferir que ela tem linha no `AGENTS.md` (Estrutura de pastas) e anotar pro plano do Passo 3

## Passo 2: Ler os arquivos de contexto

Esta skill roda em todo fim de sessão, então lê pouco. O `AGENTS.md` e os cinco do começo de conversa já estão na conversa: não reler, a não ser que outro computador tenha mudado algum deles nesta sessão (veio no pull do `/iniciar` ou do `/syncar`) ou que o plano mexa nele (releitura abaixo). Ler o diário de hoje e, dos outros, só os que esta sessão vai tocar (o destino sai da Tabela, no Passo 3). Auditoria da memória inteira é da `/faxina`. A lista de onde mora cada coisa:

1. `AGENTS.md` (conteúdo real do projeto; `CLAUDE.md` é só o ponteiro `@AGENTS.md`), estrutura de pastas, regras
2. `_contexto/empresa.md`, negócio, ferramentas, equipe
3. `_contexto/estrategia.md`, prioridade e fase
4. `_contexto/preferencias.md`, tom (raramente muda)
5. `_contexto/agora.md`, contexto vivo
6. `_contexto/ferramentas.md`, o que está conectado
7. `_contexto/automacoes.md` e `_contexto/infra.md`
8. `_memoria/decisoes.md` (as últimas 20 linhas) e o diário de hoje
9. A marca (Mapa do `AGENTS.md`): o visual e a voz com o cliente

**Reler do disco o que o plano toca**, duas vezes: antes de montar o plano e de novo logo antes de aplicar, no Passo 5. Entram o `agora.md`, o `tarefas.md`, o `licoes.md`, a ficha de contato, as linhas do `decisoes.md` dos dias desta sessão (por busca) e o diário de cada dia que a sessão tocou, de todas as origens. Outra sessão ou outro computador pode ter gravado no meio: arquivo que mudou entre as duas leituras tem a parte dele refeita e mostrada de novo antes de gravar. Conversa que virou resumo ou passou por `/clear` (o começo da conversa avisa): o fechamento parte do disco, e uma linha diz à pessoa que pode faltar detalhe da parte resumida.

**Worktree:** rodar `git rev-parse --path-format=absolute --git-dir --git-common-dir` (sai um caminho absoluto por linha; o texto cru de cada um sozinho difere numa subpasta mesmo sem worktree). As duas linhas diferentes querem dizer que a sessão roda numa cópia do projeto que o backup não sobe. Avisar em uma linha e fechar na pasta do projeto (a que guarda a `.git` do `--git-common-dir`), gravando lá. Antes de gravar, listar o que ficou só na cópia separada: `git -C <worktree> status --short` e os commits que a pasta do projeto ainda não tem, `git -C <pasta do projeto> log --oneline HEAD..<branch da cópia>`, com o branch saído de `git -C <worktree> branch --show-current` (o backup automático costuma já ter commitado na cópia, e aí só o segundo mostra o trabalho). No resumo do Passo 5, e também na sessão trivial, entram em palavras simples a linha "o trabalho desta conversa ficou numa cópia separada do projeto, fora do backup, até ser trazido pra pasta do projeto", com o que as duas listas mostraram (quando não vêm vazias), a rota pra trazer ("abrir uma conversa nova escolhendo a pasta do projeto, sem a opção de cópia separada, e pedir pra trazer o trabalho da cópia `<branch da cópia>`") e o pedido de rodar o `/syncar` na pasta do projeto, porque o backup automático desta conversa não sobe o que foi gravado lá.

## Passo 3: Passar a sessão pela tabela de destinos

A fonte aqui é **esta conversa**. Listar o que aconteceu e dar a cada item um destino pela seção "Tabela de destinos" do `AGENTS.md`, numa passada só:

- **Decisão:** decisão e fato do negócio já entram na hora, pela Tabela do `AGENTS.md`; aqui só entra a que escapou (conferir as linhas de hoje do `decisoes.md` antes, pra nunca duplicar). Linha nova no `_memoria/decisoes.md`, no formato do cabeçalho dele, com o motivo que apareceu na conversa. Muda uma decisão anterior: linha nova com `substitui: <data da velha> "<começo da velha>"`; a velha fica onde está.
- **Diário:** o que foi feito e ainda não tem linha em nenhum diário dos dias desta sessão entra agora, no diário do dia do fechamento, uma linha por tarefa fechada.
- **`_contexto/`:** rumo, jeito, ferramenta, automação e hospedagem vão pro arquivo que a tabela manda, e o fato do negócio que escapou do "na hora".
- **`agora.md`:** "Onde paramos" é a última coisa em andamento, com a data no fim, `(AAAA-MM-DD)` (substitui a anterior; o de outra sessão gravado depois do começo desta fica ao lado, até 2 linhas, uma por frente); "Pendências" ganha só o que abriu esperando alguém de fora (fornecedor, cliente, contador, plataforma), como o molde diz, e perde o que fechou; "Quente agora" se ajusta. Higiene: pendência fechada e prazo vencido saem, cada uma com o motivo dito à pessoa e anotado no diário (feito, virou projeto, mandaram soltar), nunca em silêncio; data relativa que sobrou ("sexta", "semana que vem") vira AAAA-MM-DD.
- **Tarefa pra depois:** o que a própria pessoa (ou o sistema) vai fazer mais tarde vai pro `tarefas.md`, uma linha por tarefa. As Pendências do `agora.md` ficam só com o que espera alguém de fora.
- **Bastão:** existe `.claude/bastao.md` e esta sessão fechou o último dos Próximos passos dele: propor apagar, no plano do Passo 5. Fechou só parte dos passos: propor atualizar o Ponto exato de parada e os Próximos passos do bastão, sem apagar.
- **Erro corrigido:** vai pro `licoes.md`, com data, se ainda não entrou na hora.
- **Contato:** fornecedor, parceiro ou outra pessoa que não é cliente nem equipe, citado nesta sessão com telefone, email ou preço, ou já presente num diário anterior (buscar o nome em `_memoria/diario/`): propor a ficha `_contexto/pessoas/<nome>.md` (nome em minúscula, sem acento, com hífen), com quem é, como fala com ele e o que já se combinou, cada linha com data. Preço entra com a data em que foi dito, porque envelhece.
- **Memória automática:** o que a IA anotou nesta sessão na memória automática do Claude (`~/.claude/projects/<projeto>/memory/`) e vale pro projeto vai pro destino da Tabela, porque lá fica só neste computador e fora do backup.
- **Trivial:** não salva; decisão de boca nunca é trivial. **Não coube:** perguntar, nunca inventar gaveta.
- **Fechamento:** a última linha do diário do dia do fechamento é `- HH:MM, sessão fechada pelo /atualizar`, gravada depois de todas as outras, no Passo 5. A mesma marca vai como última linha do diário de cada dia anterior desta sessão que ainda não termina na marca (conversa que atravessou a meia-noite, ou conversa antiga reaberta pela lista de conversas: no VS Code, o botão de histórico no alto do painel; no app do Claude, a lateral): sem ela, o aviso da próxima conversa segue apontando aquele dia.

Projeto de antes da 4.3 com a seção "Decisões recentes" no `agora.md`: cada linha dela vai pro `decisoes.md` com a data que tinha (origem `dono`, motivo "não registrado") e a seção sai do `agora.md`.

Montar o plano arquivo por arquivo, com as linhas que vão entrar, sem mostrar aqui: ele se mostra uma vez no Passo 5, junto com o resto, e se aplica com um sim. Sessão trivial (uma pergunta, um email avulso) não mexe em nada além da marca de fechamento (Passo 5).

## Passo 3.5: Lição repetida vira regra na skill, ou proposta de soltar

O `licoes.md` registra; este passo é quem fecha o ciclo. Roda em todo fechamento, com ou sem lição nova nesta sessão: ler o arquivo inteiro e, em cada seção, procurar lições que falam do mesmo erro (mesma skill, mesmo tipo de dado, mesma etapa), mesmo com palavras diferentes. Duas ou mais sobre a mesma coisa é sinal de que a regra ainda não chegou onde precisava.

Pra cada repetição encontrada:

1. Identificar a skill dona (a que roda a etapa onde o erro acontece). Se não houver skill, o dono é o `AGENTS.md` (regra de comportamento) ou o `preferencias.md` (tom).
2. Escrever a regra em uma linha, na linguagem da skill, dentro da seção "Regras" dela (ou na seção certa do arquivo dono).
3. Mostrar ao usuário: "essas duas lições de [data] e [data] falam do mesmo erro em `/[skill]`. Proponho gravar dentro dela a regra: '[texto]'. Aplico?"
4. Com aprovação, gravar e marcar as lições de origem no `licoes.md` com ` → virou regra em /[skill] (AAAA-MM-DD)`, sem apagar a linha.

O caminho de volta: lição marcada com `[trava X/regra Y]` registra uma vez em que uma trava ou uma regra barrou o que a pessoa queria de fato fazer. Duas lições com a mesma marca (mesma trava e mesma regra), ainda sem a marca ` → proposta de soltar`, viram proposta de soltar:

1. **Regra de texto** (o que o `AGENTS.md`, uma skill ou o `preferencias.md` mandam a IA fazer): mostrar "essas duas lições de [data] e [data] dizem que a regra Y barrou o que você queria fazer. Proponho afrouxar a regra assim: '[texto novo]'. Aplico?" Com o sim, gravar no arquivo dono e marcar as duas lições com ` → proposta de soltar, gravada em [arquivo] (AAAA-MM-DD)`.
2. **Trava de código** (hook ou script do sistema, a que avisa "Barrada pela trava X, regra Y"): essa não se mexe aqui, porque a próxima atualização do sistema traria a trava de volta. Montar o recado pro canal do curso, pronto pra pessoa colar: a trava, a regra, as duas datas e o que ela queria fazer, sem chave, senha nem dado de cliente. Quem manda é a pessoa; a IA nunca envia. Com o sim, marcar as duas lições com ` → proposta de soltar, recado pro curso (AAAA-MM-DD)`.

Só propõe; nunca edita skill nem regra sem aprovação. Sem repetição nem proposta de soltar, não dizer nada sobre este passo.

## Passo 3.6: Memória cheia, consolidar antes de escrever

Memória que só cresce fica cara. Os quatro arquivos lidos em toda conversa que esta skill escreve (`empresa.md`, `preferencias.md`, `estrategia.md`, `agora.md`; o quinto, o `autonomia.md`, só muda pela caixinha de confirmar) entram inteiros antes da primeira palavra do usuário, e o `licoes.md` entra inteiro no passo acima. Cada um tem teto de 800 tokens, escrito no topo do próprio arquivo.

Só roda quando esta sessão vai escrever num desses quatro (ou no `licoes.md`). Aí rodar `node <pasta-mãe>/_ferramentas/medir-mesa.mjs .` e olhar só as linhas marcadas `[contexto]`; a linha do `AGENTS.md` não é deste passo (arquivo de regra do kit, quem mede é o `/checar`). Arquivo em amarelo ou vermelho se consolida ANTES de receber linha nova, nunca depois:

1. Ler o arquivo inteiro e separar o que ainda muda uma decisão hoje do que já virou história
2. Fundir linhas que dizem a mesma coisa com palavras diferentes
3. O que virou história vai pro `_contexto/arquivo/<nome>.md` (memória fria, não entra em conversa nenhuma), nunca pro lixo
4. No `licoes.md`, o primeiro corte é sempre a lição já marcada com ` → virou regra em /skill`: a regra mora dentro da skill, e a linha aqui virou duplicata

Mostrar o antes e o depois e só gravar com aprovação. Todos verdes, não dizer nada sobre este passo.

## Passo 4: Diagnóstico

Comparar o que foi lido no Passo 2 com o que a conversa mostrou e apresentar:

```
## Diagnóstico de contexto

### Em dia
- [o que está correto]

### Desatualizado
- **[arquivo]:** [o que está errado e o que deveria ser]
```

Arquivo ainda com o modelo em branco, entre os lidos, entra em "Desatualizado". A varredura de todos é da `/faxina`. O que está no disco e não veio desta conversa (gravado por outra sessão ou outro computador) fica fora do "Desatualizado".

Se tudo em dia: "Tudo atualizado. Os arquivos refletem o estado real."

## Passo 5: Aplicar (com aprovação)

Mostrar cada mudança proposta (incluindo o plano do Passo 3, as regras e as propostas de soltar do Passo 3.5 e a diferença da ponte do Codex) e perguntar se aplica. Se sim, fazer a segunda leitura do Passo 2, aplicar todas de uma vez, gravar a marca de fechamento por último (no diário de hoje e no de cada dia anterior desta sessão que ainda não termina na marca) e resumir. Se o usuário quiser aprovar uma a uma, respeitar. Fora da sessão trivial, sem o sim nada se grava, nem a marca.

Sessão trivial, sem nada a mudar: dizer "nada a gravar", sem pergunta. Se o diário de hoje teve qualquer linha, gravar a marca de fechamento no fim dele assim mesmo, e também no fim do diário de cada dia anterior desta sessão que ainda não termina na marca: ela muda só o fechamento, então dispensa o sim, e sem ela o aviso da próxima conversa sairia à toa.

Sessão sem gente na frente (tarefa agendada): nada se pergunta e nada se aplica; o plano fica na resposta.

Com `.backup-falhou` na raiz, ou sem `origin` (`git remote get-url origin` falha), o resumo ganha a linha "ficou só neste computador, roda o `/syncar`".

A resposta termina sem pergunta pendente e diz "pode fechar": o backup automático sobe quando a resposta acaba. Sessão num worktree (Passo 2) é a exceção: a resposta termina no pedido do `/syncar` e não diz "pode fechar", porque o backup não sobe sozinho o que ficou na cópia separada nem o que se gravou na pasta do projeto.

## Sessão que ficou sem fechar

Só quando o aviso do começo da conversa apontou dias sem fechar ou a pessoa pede. Duas rotas, com o custo dito antes:

1. Reabrir a conversa antiga pela lista de conversas (no VS Code, o botão de histórico no alto do painel; no app do Claude, a lateral) e rodar o `/atualizar` lá: a marca vai no diário de hoje e no de cada dia anterior desta sessão que ainda não termina na marca, e o aviso some daqueles dias. Gasta uma fatia do limite de uso, e a conversa que virou resumo volta só como resumo.
2. Pedir em palavras, nesta conversa, que a IA leia a conversa antiga e traga o que ficou sem passar pela Tabela. Nada de script lendo o `.jsonl` das conversas, que é formato interno do Claude.

A pessoa diz "dispensar": gravar `- HH:MM, sessão fechada pelo /atualizar (dispensada)` como última linha do diário de cada dia apontado, e o aviso some daqueles dias.

## Regras

- Nunca reformatar arquivo inteiro, só as linhas relevantes
- Não inventar: se não dá pra inferir do estado do projeto, perguntar
- Não exagerar em diagnóstico de coisa trivial
- Projeto recém-configurado (o `agora.md` ainda no molde e o diário vazio): dizer que está tudo certo e não forçar atualização
- `_memoria/` só recebe acréscimo: nunca reescrever, consolidar ou apagar linha de lá. A exceção é da `/faxina`, que move diário e decisão substituída com mais de 90 dias pra `_memoria/arquivo/`, com o sim da pessoa (mover não é apagar)
