---
name: syncar
description: >
  Salva o estado atual do workspace no GitHub (commit + push). Configura o git e o
  repositório na primeira vez, guiando quem nunca usou GitHub. Use quando o usuário
  chamar /syncar, disser "salva no github", "faz backup", "synca", "salva tudo".
  Também resolve, junto com a pessoa, quando o envio automático parou porque dois computadores mexeram no mesmo trecho de um arquivo ("o backup parou", recado auto-sync-parado), e liga o projeto num segundo computador.
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
5. Guiar a criação do repositório **privado** no github.com (passo a passo com cliques, sem jargão). No fim o GitHub mostra o endereço do repositório (`https://github.com/<conta>/<nome>.git`): pedir pra copiar e colar aqui, e ligar a pasta a ele com `git remote add origin <endereço>` (se `git remote -v` já mostrar um `origin` apontando pra outro lugar, `git remote set-url origin <endereço>`). Sem esse passo o push do passo 7 falha com "'origin' does not appear to be a git repository".
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
7. `git add -A` (com a conferência do passo 1 de "Vezes seguintes"), primeiro commit, `git branch -M main` (o Git de algumas máquinas nasce com o branch `master`, e aí o push pra `main` falha com "src refspec main does not match any"), `git push -u origin main`

## Vezes seguintes

1. `git add -A`, e conferir o que vai subir antes do commit rodando `node .claude/hooks/auto-sync.mjs --conferir`: ele lista, sem commitar nada, cada arquivo preparado com cara de chave (a mesma lista do backup automático: OpenAI, GitHub, AWS, Meta, Instagram, Google, Telegram, Mercado Livre e outros) ou acima de 50 MB, e sai 1 quando acha. Cada arquivo da lista, e cada um citado num recado `_memoria/recados/*-auto-sync-segurou.md`, sai com `git reset -q -- <arquivo>`, e a pessoa ouve o porquê em uma frase. Nunca procurar prefixo de chave com `grep` à mão: os próprios arquivos do kit citam os prefixos e sairiam do backup por engano. Nunca sobe: é a mesma trava do backup automático, e o `/syncar` não passa por cima dela
2. Commit com mensagem curta descrevendo o que mudou de verdade (não "updates"), com a origem na frente: `<origem>: <o que mudou>`. A origem é a palavra do arquivo `.origem` da raiz; sem o arquivo, `dono`.
3. `git push`. Recusado porque o outro computador mandou antes: `git pull --rebase` e `git push` de novo, e dizer em uma linha o que veio de lá ("trouxe 2 arquivos mudados no outro computador: agora.md e diário de hoje", pela lista `git diff --name-only ORIG_HEAD HEAD`). Conflito no pull: seguir "O envio automático parou", abaixo.
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

1. Ler o `.backup-falhou` e o recado, se existir, e dizer em uma frase o que houve, sem jargão. Só quando existe o recado `*-auto-sync-parado.md` dizer: "o outro computador (ou o seu sócio) mudou o mesmo pedaço de arquivo que você, e eu nunca escolho entre duas versões do mesmo pedaço sem você olhar. Nada se perdeu." (Linha diferente do mesmo arquivo, e diário e decisões, o backup junta sozinho: o recado só aparece quando os dois mexeram no mesmo ponto.) Sem o recado, ler a causa no `.backup-falhou` e dizer em uma frase simples, pela tabela:

   | o git diz | pra pessoa |
   |---|---|
   | `Authentication failed`, `could not read Username` | "o GitHub não reconheceu este computador; vamos refazer o login" |
   | `Could not resolve host`, `Failed to connect` | "sem internet agora; o trabalho está salvo aqui e sobe quando a conexão voltar" |
   | `Repository not found` | "o GitHub não achou o cofre: foi apagado, renomeado, ou este login não tem acesso a ele" |
   | `Please tell me who you are`, `empty ident name` | "falta o seu nome e email no Git deste computador" |
   | `does not appear to be a git repository` | "esta pasta ainda não está ligada ao cofre; me passa o endereço do repositório" (passo 5 da "Primeira vez") |
   | `rejected`, `fetch first` | "o outro computador mandou antes; vou trazer e juntar" |
   | `exceeds`, `larger than 100` | "tem um arquivo grande demais pro GitHub; ele precisa sair da pasta" |
2. Motivo sem conflito (senha, internet, repositório apagado ou renomeado, ou `user.name` e `user.email` do Git vazios, comum num segundo computador recém-clonado, onde o commit do hook falha): resolver pelo passo 2 (identidade) ou pelo passo 6 (autenticação) da "Primeira vez" e testar com `git push`. Rebase pela metade (o `.backup-falhou` diz isso): não rodar `git pull --rebase` de novo (com rebase em andamento ele falha), começar pela lista de conflitos do passo 3 (`git diff --name-only --diff-filter=U`) e seguir até o 6, ou desfazer com `git rebase --abort`, que volta tudo como estava.
3. No rebase os lados do git vêm invertidos: o bloco de cima dos marcadores (HEAD) é o que veio do GitHub, ou seja o de lá, e o de baixo é o commit daqui; confirmar pelo `git log` (as mensagens `auto-sync <origem>`) antes de mostrar as duas versões pra pessoa. Conflito sem rebase em andamento: antes, commitar o que estiver pendente (`git add -A` com a conferência do passo 1 de "Vezes seguintes", e commit `<origem>: <o que mudou>`), porque o pull recusa pasta com mudança solta, e depois `git pull --rebase`. Arquivo segurado continua solto e o pull recusaria por causa dele: resolver o segurado com a pessoa primeiro (chave pro `.env`, arquivo grande pra fora da pasta), como o recado `*-auto-sync-segurou.md` explica. Rebase já em andamento (o caminho do passo 2): nada de commitar nem de puxar, começar direto pela lista. Pra cada arquivo da lista `git diff --name-only --diff-filter=U`, mostrar em linguagem simples o que cada lado escreveu (o daqui e o de lá), sem os marcadores do git na frente da pessoa, e perguntar: fica o daqui, fica o de lá, ou junta os dois. Em diário, decisões e anotações o normal é juntar, porque os dois lados só acrescentaram: fica tudo, em ordem de data. Arquivo de contexto (`_contexto/`, `andamento.md`, `contexto.md`) é diferente, porque os dois lados reescrevem: antes de juntar, copiar o arquivo como está pra `<arquivo>.antes-de-juntar` (o `.gitignore` deixa a cópia fora do backup), juntar com cada seção aparecendo uma vez só, e apagar a cópia quando a pessoa confirmar que ficou certo. Juntar "Onde paramos" do `agora.md` nunca deixa duas frases que se contradizem ("sinal pago" e "falta o sinal"): mostrar as duas e pedir a frase que vale agora, que fica sozinha no lugar. Nunca escolher sozinho e nunca apagar o lado de ninguém.
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
- Nunca `git reset --hard`, `git checkout -- .` nem `git clean`: apagam o trabalho que ainda não subiu. Pra voltar atrás no meio de uma junção, só `git rebase --abort`
- O repositório se cria no github.com junto com a pessoa (passo 5 da "Primeira vez"), nunca por comando: ela precisa saber onde o cofre dela está e que ele é privado
- Se o auto-sync (hook) estiver ligado, o /syncar manual serve pra commit com mensagem descritiva; não duplicar avisos sobre salvar
