---
name: bastao
description: Use quando o usuário chamar /bastao ou pedir explicitamente pra salvar o ponto exato de um projeto ou tarefa em andamento pra fechar o chat e continuar em outro chat novo (contexto cheio, chat gigante, "passa o bastão", "salva onde paramos", "vamos dividir em outro chat"). Também no chat novo, pra retomar do ponto salvo ("pega o bastão", "retoma", "continua de onde paramos"). Nunca rodar por conta própria sem o usuário pedir.
---

# Bastão

Divide um projeto ou tarefa grande em 2 ou mais chats sem perder nada: um chat SALVA o estado exato num arquivo fixo do workspace, o chat novo LÊ esse arquivo e continua do ponto.

## Modo: salvar ou retomar?

- Há trabalho em andamento NESTA conversa → SALVAR.
- Chat recém-começado, sem trabalho feito aqui, e existe arquivo de bastão no workspace → RETOMAR.
- Na dúvida, perguntar em uma linha.

## Arquivo

Sempre em `<raiz do workspace>/.claude/bastao.md` (criar a pasta se faltar). Um bastão por workspace, um projeto de cada vez; salvar de novo sobrescreve.

## SALVAR

Preencher TODAS as seções, nesta ordem. Seção sem conteúdo recebe "nada", nunca some.

1. **Objetivo geral** — o que é "pronto" pro projeto inteiro, em 1-3 frases.
2. **Ponto exato de parada** — última coisa concluída + a próxima ação imediata, concreta (arquivo, comando, teste).
3. **Feito / Em andamento / Bloqueado** — estado honesto: teste falhando é falhando, bloqueio é bloqueio. Referenciar arquivo, commit e PR pelo caminho; nunca colar o conteúdo deles.
4. **Decisões tomadas só no chat** — tudo que foi decidido na conversa e não está escrito em arquivo nenhum (escolhas aprovadas, preferências ditas, caminhos descartados e por quê). É a seção mais importante: o que não entrar aqui morre junto com o chat.
5. **Lições e armadilhas da sessão** — erro já cometido e corrigido aqui, pro chat novo não repetir.
6. **Próximos passos em ordem** — numerados; o 1º repete o "Ponto exato de parada".
7. **Arquivos e referências** — caminhos e URLs relevantes.

Regras: nunca gravar segredo (chave, token, senha) no arquivo; citar que ele existe e onde mora (ex.: `.env`), não o valor. Datas sempre absolutas (AAAA-MM-DD), nunca "hoje" ou "ontem".

Depois de salvar, dizer ao usuário: o caminho do arquivo e que ele já pode fechar este chat e chamar `/bastao` no chat novo pra continuar.

## RETOMAR

1. Ler o arquivo de bastão inteiro.
2. Conferir o estado REAL antes de agir: os arquivos citados existem? `git status`/log recente bate? O teste apontado como falhando ainda falha? Se a realidade divergir do bastão, avisar o usuário e perguntar antes de seguir; nunca continuar por cima de estado imaginado.
3. Não relitigar decisão registrada na seção "Decisões tomadas só no chat".
4. Dizer em 2-3 frases de onde está pegando o trabalho e executar o passo 1 dos próximos passos.
5. Acrescentar no topo do arquivo a linha `Retomado em AAAA-MM-DD`. Quando o projeto terminar de vez, apagar o arquivo.
