---
name: syncar
description: >
  Salva o estado atual do workspace no GitHub (commit + push). Configura o git e o
  repositório na primeira vez, guiando quem nunca usou GitHub. Use quando o usuário
  chamar /syncar, disser "salva no github", "faz backup", "synca", "salva tudo".
  Também resolve, junto com a pessoa, quando o envio automático parou porque dois computadores mexeram no mesmo arquivo ("o backup parou", recado auto-sync-parado), e liga o projeto num segundo computador.
---

# /syncar, Backup no GitHub

## O que faz

Garante que todo o trabalho da pasta está salvo num repositório GitHub **privado** do usuário. Na primeira vez, configura tudo do zero. Nas seguintes, é um commit com mensagem descritiva e push.

## Primeira vez (sem git configurado)

Explicar em uma frase antes de começar:

> "Vou criar um cofre na nuvem pro seu trabalho (chama GitHub, é grátis). Se o computador quebrar, nada se perde. Preciso que você crie uma conta, eu te guio."

1. Verificar se `git` está instalado; se não, orientar a instalação do Git for Windows/Mac com o link oficial
2. Configurar `user.name` e `user.email` se estiverem vazios (perguntar nome e email)
3. `git init` se a pasta não for repositório
4. `.gitignore`: projeto criado pelo `/setup` já nasce com o do molde, fechado por padrão (tudo fica fora do backup e só entra o tipo liberado: texto, planilha, imagem, PDF, script). Pasta sem `.gitignore`: copiar o `../_modelo/.gitignore` da pasta-mãe; sem pasta-mãe por perto, criar com pelo menos `.env`, `.env.*`, `.origem`, `.backup-falhou`, `node_modules/`, `*.log` e os formatos de vídeo e áudio (o GitHub recusa arquivo acima de 100 MB). Já existe: nunca sobrescrever.
5. Guiar a criação do repositório **privado** no github.com (passo a passo com cliques, sem jargão)
6. Resolver a autenticação **antes** do primeiro push, porque é aqui que trava. Senha
   de conta do GitHub não funciona mais desde 2021, e a mensagem de erro do git não
   explica isso:
   - **Windows:** o Git for Windows já instala o Git Credential Manager. O primeiro
     `git push` abre o navegador sozinho e a pessoa só clica em autorizar. Não pedir
     senha nem token.
   - **Mac:** o git que vem com o macOS **não** traz gerenciador de credencial. Antes
     do push, instalar o GitHub CLI (`brew install gh`, ou o instalador de
     cli.github.com pra quem não tem Homebrew) e rodar `gh auth login`, escolhendo
     GitHub.com, HTTPS e login pelo navegador. Sem esse passo o push pede senha,
     recusa a senha certa e a pessoa acha que errou a conta.
7. `git add -A`, primeiro commit, `git branch -M main` (o Git de algumas máquinas nasce com o branch `master`, e aí o push pra `main` falha com "src refspec main does not match any"), `git push -u origin main`

## Vezes seguintes

1. `git add -A`
2. Commit com mensagem curta descrevendo o que mudou de verdade (não "updates"), com a origem na frente: `<origem>: <o que mudou>`. A origem é a palavra do arquivo `.origem` da raiz; sem o arquivo, `dono`.
3. `git push`. Recusado porque o outro computador mandou antes: `git pull --rebase` e `git push` de novo. Conflito no pull: seguir "O envio automático parou", abaixo.
4. Confirmar: "Salvo. [resumo de uma linha do que subiu]"

Conferir que o push **realmente** subiu (`git status` sem "ahead of origin"), nunca
supor pelo comando não ter reclamado. Se o push falhou, dizer o que aconteceu em
português e resolver junto: backup que falha calado é pior que backup nenhum, porque
a pessoa para de fazer cópia acreditando que está coberta.

Quando o push completa, apagar o arquivo `.backup-falhou` da raiz, se existir: é a
marca que o auto-sync deixa quando não conseguiu subir, e é ela que dispara o aviso
no começo das sessões seguintes.

## O envio automático parou

Quando existe `.backup-falhou` na raiz, ou um recado `_memoria/recados/*-auto-sync-parado.md`, ou a pessoa diz que o backup parou.

1. Ler o `.backup-falhou` e o recado, se existir, e dizer em uma frase o que houve, sem jargão. Só quando existe o recado `*-auto-sync-parado.md` dizer: "o outro computador (ou o seu sócio) mudou os mesmos arquivos que você, e eu nunca junto duas versões sem você olhar. Nada se perdeu." Sem o recado, ler a causa no `.backup-falhou` e dizer em uma frase simples (senha, internet, repositório, identidade do Git).
2. Motivo sem conflito (senha, internet, repositório apagado ou renomeado, ou `user.name` e `user.email` do Git vazios, comum num segundo computador recém-clonado, onde o commit do hook falha): resolver pelo passo 2 (identidade) ou pelo passo 6 (autenticação) da "Primeira vez" e testar com `git push`. Rebase pela metade (o `.backup-falhou` diz isso): não rodar `git pull --rebase` de novo (com rebase em andamento ele falha), começar pela lista de conflitos do passo 3 (`git diff --name-only --diff-filter=U`) e seguir até o 6, ou desfazer com `git rebase --abort`, que volta tudo como estava.
3. No rebase os lados do git vêm invertidos: o bloco de cima dos marcadores (HEAD) é o que veio do GitHub, ou seja o de lá, e o de baixo é o commit daqui; confirmar pelo `git log` (as mensagens `auto-sync <origem>`) antes de mostrar as duas versões pra pessoa. Conflito sem rebase em andamento: antes, commitar o que estiver pendente (`git add -A` e commit `<origem>: <o que mudou>`), porque o pull recusa pasta com mudança solta, e depois `git pull --rebase`. Rebase já em andamento (o caminho do passo 2): nada de commitar nem de puxar, começar direto pela lista. Pra cada arquivo da lista `git diff --name-only --diff-filter=U`, mostrar em linguagem simples o que cada lado escreveu (o daqui e o de lá), sem os marcadores do git na frente da pessoa, e perguntar: fica o daqui, fica o de lá, ou junta os dois. Em diário, decisões e anotações o normal é juntar, porque os dois lados só acrescentaram: fica tudo, em ordem de data. Nunca escolher sozinho e nunca apagar o lado de ninguém.
4. Gravar o arquivo resolvido, `git add <arquivo>` e `git -c core.editor=true rebase --continue` (sem abrir editor). Repetir até acabar.
5. `git push` e conferir `git status` sem "ahead of origin".
6. Apagar o recado e o `.backup-falhou`. Os dois ficam só neste computador, fora do backup (o `.gitignore` barra), então apagar não gera commit. Se o `git status` ainda mostrar o recado apagado (`.gitignore` antigo, que deixava ele subir), commit `<origem>: envio automático retomado` e `git push`.

Desistir no meio: `git rebase --abort` volta tudo como estava, sem perder nada. Fechar com uma linha de prevenção: conflito nasce de dois lados mexendo no mesmo arquivo na mesma hora; combinar quem cuida de qual arquivo evita a maioria.

## Outro computador no mesmo projeto

O projeto vive no GitHub; o outro computador baixa de lá. Nele, com o SabinOS instalado, abrir a pasta-mãe no VS Code e pedir "baixa o projeto <pasta> do GitHub": `git clone <endereço do repositório> <pasta>`, a pasta entra numa linha do `.gitignore` da pasta-mãe, e a autenticação segue o passo 6 da "Primeira vez".

Dentro do projeto, no primeiro `/syncar` daquele computador: sem `.origem` na raiz e com a linha "Equipe e máquinas" no `_contexto/ferramentas.md`, perguntar qual dos nomes da linha é este computador e gravar o `.origem` com essa palavra. Nome que não está na linha: perguntar um curto (uma palavra, minúscula, só letras sem acento, números ou hífen) e acrescentar na linha. O `.origem` fica fora do backup de propósito: cada computador tem o seu.

## Chave que já subiu

`git ls-files -ci --exclude-standard` lista o que está no backup e hoje seria barrado pelo `.gitignore`. Com o `.gitignore` fechado por padrão, a lista pode trazer arquivo antigo inofensivo: tirar do backup só o que é segredo ou peso, nunca a lista inteira. Apareceu `.env` ou arquivo com chave: tirar do backup (`git rm --cached <arquivo>`, ou `git rm -r --cached <pasta>` pra uma pasta, e commit) para de mandar daqui pra frente, mas **não apaga o histórico do GitHub**, onde a chave continua legível. Dizer isso com essas palavras e ajudar a trocar a chave no serviço (gerar uma nova, gravar no `.env`, apagar a velha). Só tirar do backup não resolve.

## Regras

- **Nunca** commitar `.env` nem arquivo com chave ou senha. Se aparecer chave em arquivo rastreado, avisar e ajudar a mover pro `.env` antes de commitar
- Repositório sempre privado por padrão
- Nunca forçar o envio (`--force`) nem apagar o lado de lá pra o envio passar: a trava barra, e esse atalho é o que perde o trabalho do sócio
- Se o auto-sync (hook) estiver ligado, o /syncar manual serve pra commit com mensagem descritiva; não duplicar avisos sobre salvar
