---
name: syncar
description: >
  Salva o estado atual do workspace no GitHub (commit + push). Configura o git e o
  repositório na primeira vez, guiando quem nunca usou GitHub. Use quando o usuário
  chamar /syncar, disser "salva no github", "faz backup", "synca", "salva tudo".
---

# /syncar, Backup no GitHub

## O que faz

Garante que todo o trabalho da pasta está salvo num repositório GitHub **privado** do usuário. Na primeira vez, configura tudo do zero. Nas seguintes, é um commit com mensagem descritiva e push.

## Primeira vez (sem git configurado)

Explicar em uma frase antes de começar:

> "Vou criar um cofre na nuvem pro seu trabalho (chama GitHub, é grátis). Se o computador quebrar, nada se perde. Preciso que você crie uma conta, eu te guio."

1. Verificar se `git` está instalado; se não, orientar a instalação do Git for Windows/Mac com o link oficial
2. Configurar `user.name` e `user.email` se estiverem vazios (perguntar nome e email)
3. `git init` se a pasta não for repositório ou for pedaço de um repositório de fora (`git rev-parse --show-prefix` não vazio)
4. Se a pasta ainda não tiver `.gitignore`, criar com pelo menos: `.env`, `.env.*`,
   `node_modules/`, `*.log` e os formatos de vídeo e áudio (o GitHub recusa arquivo
   acima de 100 MB, e um vídeo baixado dentro da pasta derruba o backup inteiro).
   Se já existir, conferir que cobre isso e completar o que faltar, nunca sobrescrever
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

1. `git add -A`, e conferir o que vai subir antes do commit rodando `node _modelo/.claude/hooks/auto-sync.mjs --conferir` daqui da pasta-mãe: é a mesma conferência do backup automático dos projetos, lista sem commitar nada cada arquivo preparado com cara de chave ou acima de 50 MB, e sai 1 quando acha. Cada arquivo da lista sai com `git reset -q -- <arquivo>`, e a pessoa ouve o porquê em uma frase. Nunca procurar prefixo de chave com `grep` à mão: os próprios arquivos do kit citam os prefixos e sairiam do backup por engano. Nunca sobe
2. Commit com mensagem curta descrevendo o que mudou de verdade (não "updates")
3. `git push`
4. Confirmar: "Salvo. [resumo de uma linha do que subiu]"

Conferir que o push **realmente** subiu (`git status` sem "ahead of origin"), nunca
supor pelo comando não ter reclamado. Se o push falhou, dizer o que aconteceu em
português e resolver junto: backup que falha calado é pior que backup nenhum, porque
a pessoa para de fazer cópia acreditando que está coberta.

Quando o push completa, apagar o arquivo `.backup-falhou` da raiz, se existir: é a
marca que o auto-sync deixa quando não conseguiu subir, e é ela que dispara o aviso
no começo das sessões seguintes.

## Regras

- **Nunca** commitar `.env` nem arquivo com chave ou senha. Se aparecer chave em arquivo rastreado, avisar e ajudar a mover pro `.env` antes de commitar
- Repositório sempre privado por padrão
- Nunca `git reset --hard`, `git checkout -- .` nem `git clean`: apagam o trabalho que ainda não subiu
- Se o auto-sync (hook) estiver ligado, o /syncar manual serve pra commit com mensagem descritiva; não duplicar avisos sobre salvar
