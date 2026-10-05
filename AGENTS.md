# SabinOS, sala de controle

Esta pasta cria e gerencia projetos. O trabalho do dia a dia acontece
dentro da pasta de cada projeto, aberta como workspace próprio no VS Code.
Regra de bolso pro usuário: pasta-mãe é a recepção, pasta do projeto é a sua sala.

## Início de conversa (onboarding)

Esta seção só vale com a pasta-mãe aberta. Se a pasta aberta é um projeto (tem
`_contexto/` dentro), este arquivo chegou por herança da pasta de cima: ignorar
esta seção e seguir o `AGENTS.md` do projeto.

Ao abrir conversa aqui, ANTES de qualquer coisa:

1. Listar as pastas desta raiz. Pasta de projeto é a que tem `_contexto/`
   dentro (ex: `loja-de-bolos/`). As que começam com `_` ou com `.` e a
   `docs/` desta pasta-mãe não são projeto: a `docs/` já vem no kit e passa
   por projeto num filtro que só olha o nome.
2. Se NÃO existe pasta de projeto: assumir primeira vez e perguntar,
   confirmando: "Primeiro projeto? Vou ler o RESPONDA-AQUI.txt e montar
   tudo pra você. (Se você já usa o SabinOS e quer outro projeto, me diga
   adicionar projeto.)"
3. Se JÁ existem pastas de projeto: "Adicionar projeto novo? (Se quiser
   refazer ou ajustar um que já existe, me diga qual.)"
4. Primeiro projeto: seguir a skill `setup`. Adicionar: seguir a skill
   `novo-projeto` (que primeiro pergunta se é sala própria ou pasta dentro
   de um projeto que já existe). Não improvisar o fluxo: as skills são o
   roteiro.
5. Se o usuário falar de versão nova do kit, de zip novo ou de atualizar pelo
   GitHub: seguir a skill `atualizar-kit`. Ela nunca toca nas pastas de
   projeto sem aprovação nominal.

## Regras de operação

1. Usuário leigo: falar como se estivesse explicando pra uma criança,
   palavra fácil e frase curta, um passo de cada vez. Palavra técnica só
   com a explicação colada nela. Quando precisar que ele faça algo fora
   do chat (abrir pasta, colar chave), dar o passo a passo de clique em
   clique, cobrindo Windows e Mac. Só falar mais técnico se ele pedir.
2. Pesquisa mundial: toda pesquisa, análise ou investigação na internet
   busca em qualquer idioma, principalmente inglês. Conteúdo só em
   português limita a conhecimento nacional; o objetivo é conhecimento
   mundial. A entrega sai sempre em português.
3. Economia de conversa: processo fechado, conversa nova. Ao concluir o
   setup ou a criação de um projeto, avisar: "esse processo fechou, pra
   economizar abre uma conversa nova na pasta do projeto".
4. Loop de lições: erro corrigido durante o onboarding vira linha datada
   no `_contexto/licoes.md` do projeto criado.
5. Gate humano: nada que gasta dinheiro, envia mensagem pra fora ou
   altera conta de terceiros roda sem aprovação explícita na hora.
6. Chave e senha só em arquivo `.env`, nunca no chat nem em outro arquivo.
7. Nunca editar `_modelo/`: ele é o molde dos próximos projetos. Skill
   nova ou correção que valha pra todo projeto futuro entra no `_modelo/`
   só com o usuário pedindo explicitamente.

## Compatibilidade com outros agentes

Este workspace segue o padrão AGENTS.md e funciona tanto com Claude Code quanto com Codex (CLI da OpenAI). A regra é cada informação existir UMA vez: o conteúdo real mora neste `AGENTS.md`, e o `CLAUDE.md` é só um ponteiro (`@AGENTS.md`) pro Claude Code carregar o mesmo texto.

A ponte que deixa o Codex enxergar as skills é a junction `.agents/skills`, apontando pra `.claude/skills`. Ela é criada pelas próprias skills durante a configuração, nunca sobe pro GitHub nem vai dentro do kit.

Essa mesma junction é um dos caminhos que o Hermes Agent (Nous Research) procura por skill de projeto, e o formato `SKILL.md` é o mesmo padrão aberto. Na prática, a pasta montada aqui tende a servir pra ele sem trabalho extra. A rota, com o alerta de custo que ela carrega, está no `docs/roadmap-avancado.md`.

O que é só do Claude Code e não roda no Codex: o hook de auto-sync (no Codex o backup é manual, rodando `/syncar` no fim da sessão) e a memória persistente entre conversas. O login do Codex é feito pela conta ChatGPT.

## Estrutura desta pasta

- `RESPONDA-AQUI.txt`, o questionário que o usuário preenche antes do primeiro projeto
- `_modelo/`, o molde de projeto (skills, contexto, templates). Não é lugar de trabalhar
- `_ferramentas/`, verificador do kit e biblioteca antitrava pra automações
- `docs/`, guias de apoio
- `<projeto>/`, uma pasta por projeto criado (cada uma se abre como workspace próprio)
