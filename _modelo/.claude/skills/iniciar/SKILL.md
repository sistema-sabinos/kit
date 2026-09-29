---
name: iniciar
description: >
  Inicia a sessão de trabalho carregando o contexto do negócio e mostrando onde o
  usuário parou. Use no começo de cada sessão nova, quando o usuário chamar /iniciar,
  disser "bom dia, vamos trabalhar", "o que ficou pendente" ou "onde paramos".
---

# /iniciar, Começo de sessão

## O que fazer

1. Verificar se existe `.backup-falhou` na raiz. Se existir, ler o arquivo: o backup
   automático não subiu pra nuvem, e isso entra no resumo como primeira linha
2. Verificar se existe `robos/avisos-pendentes.md`. Se existir, são avisos de robô
   que não chegaram no Telegram: entram no resumo logo depois do backup. Se existir
   a pasta `robos/` com receitas (`.mjs`), rodar
   `node .claude/skills/agendar/scripts/agendador.mjs atrasados`: robô que parou de
   rodar entra no mesmo campo
3. Verificar se `_contexto/empresa.md` está configurado (sem `<!-- NOT CONFIGURED -->`)
4. Ler `_contexto/empresa.md`, `_contexto/preferencias.md`, `_contexto/estrategia.md`, `_contexto/agora.md` e `_contexto/trilha.md` (se existir)
5. Ler `AGENTS.md` (o conteúdo real do projeto; `CLAUDE.md` é só o ponteiro `@AGENTS.md`) e, se existir, `tarefas.md`
6. Apresentar o resumo e perguntar o que o usuário quer fazer
7. Se `_contexto/empresa.md` estiver com NOT CONFIGURED, esta pasta é o `_modelo/` ou uma cópia crua: avisar que o lugar de começar é a pasta-mãe, com `primeiro projeto`

## Se está configurado

Apresentar um resumo curto:

```
Contexto carregado.

**Backup:** [só aparece se `.backup-falhou` existir: "o último backup no GitHub
falhou, seu trabalho está só neste computador. Rode /syncar pra resolver"]
**Robôs:** [só aparece se `robos/avisos-pendentes.md` existir ou se o `atrasados`
apontar robô: quantos avisos não chegaram no celular e o mais recente, e o nome
de cada robô parado desde quando. Depois do resumo, perguntar se pode apagar o
arquivo de avisos]
**Negócio:** [nome e o que faz, em uma linha]
**Foco agora:** [prioridade principal do estrategia.md]
**Trilha:** [só aparece se `_contexto/trilha.md` existir e `etapa_atual` for menor que 10: "etapa N de 10, <nome da etapa>", e o que espera o contador se houver]
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
