---
name: atualizar-sabinos
description: >
  Traz pra este projeto as melhorias da versão nova do SabinOS, direto do GitHub,
  sem mexer no que é seu: mostra o que muda, só aplica o que você aprovar, guarda
  cópia de segurança e desfaz com um comando. Use quando o usuário chamar
  /atualizar-sabinos, disser "atualiza o SabinOS", "tem versão nova?", "puxa as
  melhorias", "atualiza o sistema".
---

# /atualizar-sabinos, versão nova sem perder nada

## O que faz

Dentro do projeto tem duas coisas misturadas: o que veio do SabinOS (os comandos,
as regras de segurança) e o que é seu (o contexto, a marca, as skills que você
criou, o trabalho feito). Esta skill troca só a primeira parte.

Pra saber se você mexeu num arquivo, ela usa a impressão digital dele: um código
tirado do conteúdo, que muda se muda uma vírgula. Bateu com alguma versão do
SabinOS, ninguém mexeu e dá pra trocar. Não bateu, você personalizou, e ela
pergunta antes.

## Passo 1, tem versão nova?

1. Versão deste projeto: campo `versao` do `.sabinos/instalado.json`. Sem esse
   arquivo, dizer "ainda sem registro de versão".
2. Última versão publicada:
   `curl -fsSL https://raw.githubusercontent.com/sistema-sabinos/kit/main/VERSAO`
3. Igual: "Você já está na última versão (X). Nada a fazer." e encerrar.
4. Publicada **mais antiga** que a do projeto: avisar ("o projeto está na X e a
   publicada é a Y, mais antiga") e perguntar se é isso mesmo antes de seguir.
5. Sem internet ou erro: explicar em português o que aconteceu e parar.

## Passo 2, baixar pra uma pasta temporária

Nada é baixado pra dentro do projeto.

1. Pasta temporária do computador: `node -e "console.log(require('os').tmpdir())"`.
   Chamar de `<tmp>`.
2. Baixar a versão marcada (troque `<v>` pelo número do Passo 1):
   `curl -fsSL -o "<tmp>/sabinos-<v>.zip" https://github.com/sistema-sabinos/kit/archive/refs/tags/v<v>.zip`
3. Descompactar: no Windows `"C:/Windows/System32/tar.exe" -xf "<tmp>/sabinos-<v>.zip" -C "<tmp>"`, no Mac `unzip -q -o "<tmp>/sabinos-<v>.zip" -d "<tmp>"`.
   No Windows vai o caminho completo porque, no terminal do Git, o `tar` comum é
   outro programa e não abre zip.
4. O kit baixado é a pasta `<tmp>/kit-<v>`, com o número exato do Passo 1 (pode
   haver pasta `kit-` de download antigo ao lado). Chamar de `<kit>`. Sem
   `_ferramentas/atualizar-projeto.mjs` dentro dela, parar: o download não é um
   kit SabinOS.

Baixar e rodar direto (`curl ... | bash`) é barrado pela trava deste projeto, e
com razão. Aqui o arquivo vem só deste endereço fixo, fica salvo numa pasta e roda
pelo `node`. Nunca usar outro endereço.

## Passo 3, montar o plano e mostrar

1. Da pasta do projeto: `node "<kit>/_ferramentas/atualizar-projeto.mjs" plano .`
2. Traduzir a saída pra linguagem de gente, curto:

   > "Achei a versão 3.6. O que muda aqui:
   > **Troca sem perguntar** (ninguém mexeu): `/iniciar`, `/mapear`
   > **Novo:** um arquivo novo do `/assistir-video`
   > **Você mexeu, preciso que decida:** `/bastao`
   > **Saiu do SabinOS:** `/setup` (sugiro tirar)
   > Nada do que é seu entra na troca. Posso seguir?"

3. "Componentes que o projeto ainda não tem": oferecer cada um numa linha, com o
   que ele faz, e perguntar quais entram. Pergunta no formato de 4 partes (a
   pergunta, uma linha de por que está perguntando, 2 ou 3 exemplos de resposta,
   e repergunta se vier vaga). Com escolha, rodar de novo com
   `--componentes nome1,nome2`. Esse `--componentes` vai em toda rodada nova do
   `plano` daqui pra frente (inclusive se precisar refazer o plano), senão a
   escolha se perde. "Entra junto por dependência": avisar em uma linha.
4. Cada "você mexeu": mostrar em prosa o que a versão da pessoa tem de diferente e
   o que a nova traz. Perguntar por arquivo: "fica a sua" ou "pega a nova".
5. Cada "saiu do SabinOS": perguntar pelo nome. Só sai com sim nominal.

## Passo 4, aplicar

`node "<kit>/_ferramentas/atualizar-projeto.mjs" aplicar . --tambem <caminhos>`

Em `--tambem`, só os caminhos que a pessoa aprovou no Passo 3 (os "pega a nova" e
os "pode tirar"), separados por vírgula. Sem nenhum, rodar sem `--tambem`.

O motor guarda cópia de tudo que vai mudar em `.sabinos/antes-<versão>-<data>/`
antes de mexer. Dizer isso à pessoa.

## Passo 5, mudanças que pedem conversa

Seguir `<kit>/_ferramentas/mudancas.md` do jeito que a seção "Como usar" dele
manda: no máximo 3 por vez, antes e depois na tela, aplicar com o sim, testar e
registrar.

## Passo 6, conferir e fechar

1. `node "<kit>/_ferramentas/atualizar-projeto.mjs" conferir .` precisa dizer
   "Tudo em dia com o kit". Se disser o que falta, mostrar e resolver antes de
   fechar.
2. Se o projeto tem `.claude/settings.json`, conferir que continua JSON válido:
   `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`.
3. Anotar no diário de hoje (`_memoria/diario/AAAA-MM-DD.md`, ou `AAAA-MM-DD-<origem>.md` quando o `.origem` existe e é diferente de `dono`; criando a pasta e o arquivo com `# AAAA-MM-DD` se faltar): `- HH:MM, SabinOS atualizado pra <v>: <o que entrou em uma linha>`. Mudança do `mudancas.md` que a pessoa recusou vira linha no `_memoria/decisoes.md`, no formato do cabeçalho dele, com o motivo dela.
4. Fechar: "Pronto, projeto na versão <v>. Se algo ficou estranho, é só pedir
   'desfaz a atualização' que eu volto tudo como estava. Esse processo fechou,
   abre uma conversa nova." O download fica na pasta temporária do computador
   (uns 300 KB) e pode ser apagado à mão quando quiser.

## Desfazer

Pedido de desfazer: `node .sabinos/atualizar-projeto.mjs desfazer .` (o motor
fica guardado no projeto justamente pra isso). Volta os arquivos de antes, inclusive
`AGENTS.md` e `settings.json`, e apaga o que tinha entrado. Antes de voltar, ele guarda o estado de agora em `.sabinos/antes-desfazer-<data>/`, então até o desfazer tem volta. Mostrar a saída.

Se o `aplicar` falhou no meio e foi rodado de novo, existem duas cópias `antes-`: a volta ao estado original é pela mais antiga, com `node .sabinos/atualizar-projeto.mjs desfazer . --backup <nome-da-mais-antiga>`.

## Regras

- Nada do que é da pessoa muda sem aprovação: só o "troca sem perguntar", que ela
  aprova de uma vez no Passo 3, entra sem pergunta por arquivo
- Endereço fixo, `github.com/sistema-sabinos/kit`; nunca outro
- Nada fora da pasta do projeto, fora a pasta temporária do download
- Falar como gente: "impressão digital", "cópia de segurança", "juntar os dois
  textos"; nunca "hash", "merge", "diff"
- Se a trava barrar algum comando no caminho, parar e explicar, como manda o
  `AGENTS.md`
