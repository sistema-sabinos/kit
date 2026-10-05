---
name: atualizar
description: >
  Fecha a sessão e mantém a memória do sistema em dia: passa o que aconteceu pela
  tabela de destinos (decisão, diário, contexto, onde paramos) e audita a memória
  do projeto. Use quando o usuário chamar /atualizar, disser "fecha a sessão", "encerra
  por hoje", "registra o que fizemos" ou "arruma o contexto", ou ao fim de uma sessão
  longa com muitas mudanças. Versão nova do SabinOS é com o /atualizar-sabinos.
---

# /atualizar, Manutenção de contexto

Duas funções em uma: fechar a sessão (passar o que aconteceu nesta conversa pela tabela de destinos do `AGENTS.md`) e auditar a memória (comparar o estado real das pastas com o que os arquivos de contexto dizem).

## Passo 1: Levantar o estado real

1. **Estrutura de pastas**, listar os diretórios de primeiro nível (ignorar `.git`, `node_modules`, `.claude`, `templates`, `dados`, `_memoria`)
2. **Skills ativas**, listar `.claude/skills/*/`
3. **MCPs configurados**, ler `.mcp.json` na raiz do workspace, se existir
4. **Mudanças recentes**, `git diff --name-only HEAD~5..HEAD` (ou menos commits se não houver 5) e `git status`
5. **Ponte do Codex**, se `.agents/skills` existir como pasta comum (cópia, não link ou junction): copiar `.claude/skills` por cima, em silêncio, pra skill nova aparecer no Codex

## Passo 2: Ler os arquivos de contexto

1. `AGENTS.md` (conteúdo real do projeto; `CLAUDE.md` é só o ponteiro `@AGENTS.md`), estrutura de pastas, regras
2. `_contexto/empresa.md`, negócio, ferramentas, equipe
3. `_contexto/estrategia.md`, prioridade e fase
4. `_contexto/preferencias.md`, tom (raramente muda)
5. `_contexto/agora.md`, contexto vivo
6. `_contexto/ferramentas.md`, o que está conectado
7. `_contexto/automacoes.md` e `_contexto/infra.md`
8. `_memoria/decisoes.md` (as últimas 20 linhas) e o diário de hoje
9. `marca/design-guide.md`, visual

## Passo 3: Passar a sessão pela tabela de destinos

A fonte aqui é **esta conversa**. Listar o que aconteceu e dar a cada item um destino pela seção "Tabela de destinos" do `AGENTS.md`, numa passada só:

- **Decisão:** linha nova no `_memoria/decisoes.md`, no formato do cabeçalho dele, com o motivo que apareceu na conversa. Muda uma decisão anterior: linha nova com `substitui: <data da velha> "<começo da velha>"`; a velha fica onde está.
- **Diário:** o que foi feito e ainda não tem linha no diário de hoje entra agora, uma linha por tarefa fechada.
- **`_contexto/`:** fato do negócio, rumo, jeito, ferramenta, automação e hospedagem vão pro arquivo que a tabela manda.
- **`agora.md`:** "Onde paramos" é a última coisa em andamento (substitui a anterior); "Pendências" ganha o que abriu e perde o que fechou; "Quente agora" se ajusta. Higiene: pendência fechada e prazo vencido saem.
- **Trivial:** não salva. **Não coube:** perguntar, nunca inventar gaveta.

Projeto de antes da 4.3 com a seção "Decisões recentes" no `agora.md`: cada linha dela vai pro `decisoes.md` com a data que tinha (origem `dono`, motivo "não registrado") e a seção sai do `agora.md`.

Montar o plano arquivo por arquivo, com as linhas que vão entrar, sem mostrar aqui: ele se mostra uma vez no Passo 5, junto com o resto, e se aplica com um sim. Sessão trivial (uma pergunta, um email avulso) não mexe em nada.

## Passo 3.5: Lição repetida vira regra na skill

O `licoes.md` registra; este passo é quem fecha o ciclo. Ler o arquivo inteiro e, em cada seção, procurar lições que falam do mesmo erro (mesma skill, mesmo tipo de dado, mesma etapa), mesmo com palavras diferentes. Duas ou mais sobre a mesma coisa é sinal de que a regra ainda não chegou onde precisava.

Pra cada repetição encontrada:

1. Identificar a skill dona (a que roda a etapa onde o erro acontece). Se não houver skill, o dono é o `AGENTS.md` (regra de comportamento) ou o `preferencias.md` (tom).
2. Escrever a regra em uma linha, na linguagem da skill, dentro da seção "Regras" dela (ou na seção certa do arquivo dono).
3. Mostrar ao usuário: "essas duas lições de [data] e [data] falam do mesmo erro em `/[skill]`. Proponho gravar dentro dela a regra: '[texto]'. Aplico?"
4. Com aprovação, gravar e marcar as lições de origem no `licoes.md` com ` → virou regra em /[skill] (AAAA-MM-DD)`, sem apagar a linha.

Só propõe; nunca edita skill sem aprovação. Sem repetição encontrada, não dizer nada sobre este passo.

## Passo 3.6: Memória cheia, consolidar antes de escrever

Memória que só cresce fica cara. Os quatro arquivos lidos em toda conversa (`empresa.md`, `preferencias.md`, `estrategia.md`, `agora.md`) entram inteiros antes da primeira palavra do usuário, e o `licoes.md` entra inteiro no passo acima. Cada um tem teto de 800 tokens, escrito no topo do próprio arquivo.

Rodar `node <pasta-mãe>/_ferramentas/medir-mesa.mjs .` e olhar as linhas marcadas `[contexto]`. Arquivo em amarelo ou vermelho se consolida ANTES de receber linha nova, nunca depois:

1. Ler o arquivo inteiro e separar o que ainda muda uma decisão hoje do que já virou história
2. Fundir linhas que dizem a mesma coisa com palavras diferentes
3. O que virou história vai pro `_contexto/arquivo/<nome>.md` (memória fria, não entra em conversa nenhuma), nunca pro lixo
4. No `licoes.md`, o primeiro corte é sempre a lição já marcada com ` → virou regra em /skill`: a regra mora dentro da skill, e a linha aqui virou duplicata

Mostrar o antes e o depois e só gravar com aprovação. Todos verdes, não dizer nada sobre este passo.

## Passo 4: Diagnóstico

Comparar e apresentar:

```
## Diagnóstico de contexto

### Em dia
- [o que está correto]

### Desatualizado
- **[arquivo]:** [o que está errado e o que deveria ser]

### Não configurado
- [arquivos ainda com template padrão]
```

Se tudo em dia: "Tudo atualizado. Os arquivos refletem o estado real."

## Passo 5: Aplicar (com aprovação)

Mostrar cada mudança proposta (incluindo o plano do Passo 3 e as regras do Passo 3.5) e perguntar se aplica. Se sim, aplicar todas de uma vez e resumir. Se o usuário quiser aprovar uma a uma, respeitar.

## Regras

- Nunca reformatar arquivo inteiro, só as linhas relevantes
- Não inventar: se não dá pra inferir do estado do projeto, perguntar
- Não exagerar em diagnóstico de coisa trivial
- Projeto recém-configurado: dizer que está tudo certo e não forçar atualização
- `_memoria/` só recebe acréscimo: nunca reescrever, consolidar ou apagar linha de lá. A exceção é da `/faxina`, que move diário e decisão substituída com mais de 90 dias pra `_memoria/arquivo/`, com o sim da pessoa (mover não é apagar)
