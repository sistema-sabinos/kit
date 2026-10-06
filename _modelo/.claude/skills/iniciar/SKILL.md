---
name: iniciar
description: >
  Inicia a sessão de trabalho carregando o contexto do negócio e mostrando onde o
  usuário parou; se existe um bastão salvo (.claude/bastao.md), oferece retomar por ele.
  Use no começo de cada sessão nova, quando o usuário chamar /iniciar, disser "bom dia,
  vamos trabalhar", "o que ficou pendente", "onde paramos" ou "continua de onde paramos".
---

# /iniciar, Começo de sessão

## O que fazer

0. Antes de ler qualquer memória, trazer do GitHub o que outro computador (ou o sócio) mandou, senão a leitura sai velha: com repositório, remote e sem rebase ou merge pela metade, rodar `git pull --ff-only --quiet`. Deu certo ou não tinha nada: seguir calado. Recusou porque os dois lados andaram: uma linha no resumo, "o GitHub tem coisa nova que ainda não juntei com a daqui; o `/syncar` junta com você". Sem internet: uma linha, "sem internet, li a versão deste computador". Sem repositório ou sem remote: calado. Nunca dizer "pull", "rebase" ou "merge" pra pessoa: é "trazer" e "juntar"
1. Verificar se existe `.backup-falhou` na raiz. Se existir, ler o arquivo: o backup
   automático não subiu pra nuvem, e isso entra no resumo como primeira linha
2. Ler os recados: cada arquivo `.md` de `_memoria/recados/` (o `.gitkeep` não conta) é um aviso de robô ou de outra máquina, com `de:`, `quando:` e `precisa de ação:` no topo. Entram no resumo logo depois do backup. Projeto de antes da 4.3 pode ainda ter `robos/avisos-pendentes.md`: entra junto, e depois do resumo oferecer passar cada linha dele pra um recado. Se existir a pasta `robos/` com receitas (`.mjs`), rodar `node .claude/skills/agendar/scripts/agendador.mjs atrasados`: robô que parou de rodar entra no mesmo campo
3. Verificar se `_contexto/empresa.md` está configurado (sem `<!-- NOT CONFIGURED -->`)
4. O `AGENTS.md` e os quatro do começo de conversa (`_contexto/empresa.md`, `preferencias.md`, `estrategia.md`, `agora.md`) já chegaram pela regra do começo de conversa: usar o que está na conversa, sem reler (reler custa mais de 4 mil tokens por sessão e não traz nada novo). Ler só o que ainda não foi lido nesta conversa, e o que o passo 0 trouxe de outro computador (`git diff --name-only ORIG_HEAD HEAD`, quando o pull trouxe alguma coisa)
5. Ler, se existirem, `_contexto/trilha.md` e `tarefas.md`
6. Apresentar o resumo e perguntar o que o usuário quer fazer. Se existir `.claude/bastao.md`
   (ponto salvo pelo `/bastao` numa conversa anterior), a pergunta vira: "Tem uma tarefa salva
   pra continuar: <primeira linha do bastão>. Retomo dela?". Com o sim, seguir a retomada da
   skill `/bastao`
7. Se `_contexto/empresa.md` estiver com NOT CONFIGURED, esta pasta é o `_modelo/` ou uma cópia crua: avisar que o lugar de começar é a pasta-mãe, com `primeiro projeto`
8. Sem `.origem` na raiz e com a linha "Equipe e máquinas" no `_contexto/ferramentas.md`: este é um computador da equipe que ainda não se apresentou. Perguntar na primeira resposta qual nome da linha é este computador e gravar o `.origem` (regra da seção "Outro computador no mesmo projeto" do `/syncar`). Sem isso o diário e o backup saem assinados como `dono`
9. Diário de hoje escrito por outro computador: em `_memoria/diario/`, todo arquivo de hoje cuja origem não é a deste computador (o `AAAA-MM-DD.md` é do `dono`; o `AAAA-MM-DD-<nome>.md`, do computador `<nome>`; a deste computador está no `.origem`, e sem ele é `dono`). Cada um vira uma frase no resumo, no campo "Hoje em outro computador"
10. "Onde paramos" velho: se o último commit que mexeu no `_contexto/agora.md` (`git log -1 --format=%cs -- _contexto/agora.md`; sem git, a data do arquivo) tem mais de 7 dias, o campo "Onde paramos" ganha no fim "(anotado em <data>, pode estar velho)"
11. Projeto com mais de 30 dias e nenhuma menção a `/faxina` no diário dos últimos 30 dias: uma linha no fim do resumo, "faz um mês sem faxina; quer rodar a `/faxina`? ela só mostra, e mexe com o seu sim"

## Se está configurado

Apresentar um resumo curto:

```
Contexto carregado.

**Backup:** [só aparece se `.backup-falhou` existir: "o último backup no GitHub
falhou, seu trabalho está só neste computador. Rode /syncar pra resolver"]
**Recados:** [só aparece se houver recado ou se o `atrasados` apontar robô:
quantos recados, quantos com "precisa de ação: sim", o mais recente em uma
linha, e o nome de cada robô parado desde quando. Depois do resumo, perguntar
quais já foram tratados e apagar só esses]
**Negócio:** [nome e o que faz, em uma linha]
**Foco agora:** [prioridade principal do estrategia.md]
**Trilha:** [só aparece se `_contexto/trilha.md` existir e `etapa_atual` for menor que 10: "etapa N de 10, <nome da etapa>", e o que espera o contador se houver]
**Hoje em outro computador:** [só aparece com diário de hoje de outra origem: uma frase por computador]
**Onde paramos:** [do agora.md, a última coisa em andamento; omitir se vazio]
**Pendências:** [do agora.md, até 2 itens mais relevantes; omitir se não houver]
**Lembretes:** [preferência importante de escrita, se houver]

O que você quer fazer hoje?
```

Até 8 linhas. Não reescrever o que está nos arquivos, só o essencial pra retomar.

## Se não está configurado

> "Essa pasta ainda não é um projeto configurado. O lugar de começar é a pasta-mãe (um nível acima), dizendo `primeiro projeto` por lá, leva uns 10 minutos. Depois disso o /iniciar te mostra onde parou toda vez."

## Comportamento

- Tom direto, sem "Olá! Que bom te ver!"
- Não listar os arquivos lidos, só usar
- Se `tarefas.md` tiver itens em aberto relevantes pro momento, citar até 3
- Depois do resumo, esperar o usuário dizer o que quer
- Não inventar pendência pra parecer útil: campo sem nada some do resumo
