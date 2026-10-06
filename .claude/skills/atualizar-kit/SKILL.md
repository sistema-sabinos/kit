---
name: atualizar-kit
description: >
  Traz pra esta pasta-mãe uma versão nova do SabinOS (o zip novo) sem tocar nas
  pastas de projeto: atualiza o `_modelo/`, as skills da pasta-mãe, as ferramentas e
  os guias, mostra o que mudou e só substitui o que o usuário aprovar. Depois oferece
  levar as skills novas pra cada projeto. Use quando o usuário chamar /atualizar-kit,
  disser "chegou versão nova do kit", "atualiza o SabinOS", "baixei o zip novo, e
  agora", ou disser onde está o zip novo.
---

# /atualizar-kit, Versão nova sem perder nada

## O problema que resolve

O kit instalado é uma foto do dia em que foi baixado. Toda melhoria nova (skill corrigida, template novo, ferramenta) ficaria só na versão nova, e refazer a instalação apagaria os projetos. Esta skill separa o que é **do kit** (pode ser substituído) do que é **da pessoa** (nunca se toca).

## O que é da pessoa e nunca se toca

- Toda pasta de projeto (as que têm `_contexto/` dentro) e tudo dentro delas
- `RESPONDA-AQUI.txt` preenchido
- `.git/`, `.env`, `.agents/`
- `~/.claude/CLAUDE.md` (identidade global)

## O que é do kit e pode ser atualizado

`_modelo/` inteiro, `.claude/skills/` da pasta-mãe, `_ferramentas/`, `docs/`, `VERSAO`, `README.md`, `COMECE-AQUI.md`, `AGENTS.md` e `CLAUDE.md` da pasta-mãe, e o texto do `RESPONDA-AQUI.txt` **só se ainda estiver em branco**.

O `.gitignore` e o `.claude/settings.json` da pasta-mãe são metade do kit e metade da pessoa: seguem o passo "Arquivos misturados da pasta-mãe", logo depois do Passo 3.

## Passo 1, onde está o zip novo

Oferecer os dois caminhos, nessa ordem:

1. **Baixar a última do GitHub** (o normal): seguir os Passos 1 e 2 da skill
   `_modelo/.claude/skills/atualizar-sabinos/SKILL.md`. A versão nova é a pasta
   `kit-<versão>` extraída.
2. **Zip que a pessoa já baixou:** perguntar onde está (formato de 4 partes) e
   extrair numa pasta temporária fora da pasta-mãe:
   no Windows `"C:/Windows/System32/tar.exe" -xf "<zip>" -C "<temp>"`, no Mac `unzip -q "<zip>" -d "<temp>"`.
   No Windows vai o caminho completo porque, no terminal do Git, o `tar` comum é
   outro programa e não abre zip. A versão nova é a pasta `SabinOS-Sistema/` extraída.

Se a versão nova não tiver `_modelo/AGENTS.md` e `.claude/skills/setup/SKILL.md`, parar: não é um kit SabinOS.

## Passo 2, comparar e mostrar

Comparar arquivo por arquivo as áreas "do kit" (acima) entre a pasta-mãe atual e a versão nova. Classificar:

- **Novo:** existe só na versão nova (skill nova, template novo)
- **Mudou:** existe nos dois com conteúdo diferente
- **Sumiu:** existe só na atual (foi removido do kit)
- **Igual:** sem diferença (não listar)

Apresentar num resumo curto, agrupado por área, em linguagem de gente:

> "Versão nova encontrada. O que muda:
>
> **Comandos novos no molde de projeto:** `/checar` (check-up do sistema)
> **Templates novos:** financeiro, copy de venda
> **Comandos que mudaram:** `/mapear` (ganhou plano antes de criar e delegação pra skill-creator), `/novo-projeto` (rota leve pra cliente pequeno)
> **Guias:** README e roadmap atualizados
> **Nada foi removido.**
>
> Quer aplicar tudo, escolher item por item, ou só ver o detalhe de algum?"

Se a pessoa pedir detalhe, mostrar o diff daquele arquivo resumido em prosa (o que entrou, o que saiu), não o diff bruto.

## Passo 3, aplicar (só o aprovado)

1. Antes de substituir qualquer coisa, guardar cópia da versão atual em `_kit-anterior-<AAAA-MM-DD>/` dentro da pasta-mãe, só das áreas que vão mudar. Adicionar essa pasta ao `.gitignore` da pasta-mãe, uma linha.
2. Copiar os arquivos aprovados por cima. Arquivo "sumiu" só se apaga com aprovação explícita e nominal.
3. `RESPONDA-AQUI.txt`: substituir só se o atual estiver em branco (nenhuma resposta escrita).
4. Rodar `node _ferramentas/verificar-kit.mjs .` (obrigatório, não pular: em teste real este passo ficou pra trás) e mostrar ao usuário a última linha da saída, a que começa com `Resultado:` (quantas conferências ficaram verdes, quantas falharam e quantas não rodaram inteiras). Na pasta-mãe é normal o Gate 1 sair `parcial` (a lista de termos só existe na bancada de quem faz o kit) e o Gate 7 sair `n/a` (sem zip ao lado): dizer isso em uma frase, sem tratar como problema. Gate 11 `n/a` (git não encontrado) fica fora desse normal: o backup não foi conferido; ligar o git pelo passo de primeira vez do `/syncar` e rodar de novo. Se algum gate falhar, dizer qual e o que fazer; não desfazer sozinho. Gate 11, Gate 9 ou Gate 3 (linha que falta no `.gitignore`) vermelho na pasta-mãe: fazer o passo dos arquivos misturados (abaixo) e rodar de novo.

## Arquivos misturados da pasta-mãe

O `.gitignore` e o `.claude/settings.json` da pasta-mãe têm parte do kit e parte da pessoa. Cada um se mostra antes e depois, e só se grava com o sim.

1. **`.gitignore`:** mostrar o atual e o da versão nova, lado a lado. Trocar pelo do kit, mantendo no fim as linhas que a pessoa acrescentou por conta própria (pastas de projeto, `_kit-anterior-*`). Depois rodar `git ls-files -ci --exclude-standard`, que lista o que já está no backup e agora ficaria de fora. Se aparecer `.env` ou arquivo de chave, avisar: tirar o arquivo do backup não apaga o histórico do GitHub, a chave vazou e precisa ser trocada no serviço (gerar uma nova, guardar no `.env`, apagar a velha), e ajudar a pessoa a fazer isso. Tirar do backup (`git rm --cached`, com `-r` pra pasta) só o que for segredo ou arquivo pesado, nunca a lista inteira.
2. **`.claude/settings.json`:** juntar ao atual o que falta das listas `permissions.ask` e `permissions.deny` e dos hooks do kit, sem tirar nada que a pessoa já tinha.

## Passo 4, levar pros projetos (opcional, um projeto de cada vez)

O `_modelo/` atualizado só vale pra projetos **futuros**. Projeto existente se
atualiza pelo motor, que já sabe o que é do kit e o que é da pessoa.

1. Listar as pastas de projeto (as que têm `_contexto/` dentro) aqui dentro **e ao
   lado** desta pasta-mãe, e perguntar se tem alguma em outro lugar.
2. Pra cada projeto que a pessoa escolher, seguir os Passos 3 a 6 da skill
   `_modelo/.claude/skills/atualizar-sabinos/SKILL.md`, usando como `<kit>` esta
   pasta-mãe já atualizada:
   `node _ferramentas/atualizar-projeto.mjs plano <caminho-do-projeto>`.
   Os passos seguintes (aplicar, registrar, conferir) rodam com o caminho do
   projeto no lugar do `.`.
3. Projeto antigo nasceu sem o `/atualizar-sabinos`: ele vem no componente
   `nucleo`, então depois desta primeira vez o projeto se atualiza sozinho, de
   dentro dele.

## Passo 5, registrar e encerrar

1. Cada projeto tocado já ganhou a linha no diário de hoje (`_memoria/diario/`) pelo Passo 6 da `/atualizar-sabinos`.
2. Apagar a pasta temporária da extração.
3. Fechar com a economia de conversa: "Kit atualizado. As pastas `_kit-anterior-*` guardam a versão de antes; pode apagar quando tiver certeza de que está tudo bem. Esse processo fechou, abre uma conversa nova."

## Regras

- Nada dentro de pasta de projeto muda sem aprovação nominal, projeto por projeto
- Sempre cópia de segurança antes de substituir
- Nunca rodar `git reset`, `git checkout --` ou apagar `.git/`
- A versão do kit está no arquivo `VERSAO` na raiz (e no topo do `README.md`). Comparar a da pasta-mãe com a do zip e dizer no resumo: "você está na 3.0, o zip é a 4.0". Se a do zip for **mais antiga ou igual**, avisar e perguntar se é isso mesmo antes de seguir
