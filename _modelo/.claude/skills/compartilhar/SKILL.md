---
name: compartilhar
description: >
  Prepara uma pasta de projeto (cliente, produto, campanha) pra outra pessoa
  abrir fora deste projeto: traz pra dentro a marca resumida e as decisões dela,
  confere que não vai senha junto, fecha o backup por padrão e transforma a
  pasta num repositório próprio no GitHub, com o convite guiado. Use quando o
  usuário chamar /compartilhar, disser "vou mandar a pasta do cliente", "o sócio
  vai trabalhar nessa pasta", "dar acesso a essa pasta", "compartilhar o
  projeto do X".
---

# /compartilhar, a pasta sai de casa

Dentro do projeto, a pasta de um cliente usa o que está em volta: a marca, a
Tabela de destinos e as decisões do projeto, por caminhos com `../`. Fora dele
esses caminhos quebram. Esta skill traz pra dentro o que a pasta usa, resumido,
e faz dela um repositório próprio. O resto do projeto nunca vai junto.

Compartilhar é sempre pelo GitHub, em repositório privado. Zip por e-mail perde
o histórico e vira duas versões que ninguém junta.

## Passo 1, qual pasta e pra quem

Confirmar a pasta. Ela precisa ter `AGENTS.md`, `contexto.md` e `andamento.md`;
se falta algum, rodar antes o modo link do `/novo-projeto` (a skill da
pasta-mãe, `../.claude/skills/novo-projeto/SKILL.md`), que cria só o que falta.

Perguntar, no formato de 4 partes:

> "Quem vai receber essa pasta, e a pessoa vai só olhar ou vai trabalhar nela
> junto com você?
>
> Pergunto porque quem trabalha junto precisa do jeito de salvar e mandar de
> volta, e quem só olha não.
>
> Tipo: 'o cliente, só pra acompanhar', 'minha sócia, vai editar também', ou
> 'um freelancer que vai fazer os posts'."

Se a pasta já tem `.git` (um `/compartilhar` anterior parou no meio do envio):
pedir de novo o "pode ir" do envio e, sem commit ainda (`git -C <pasta> log
--oneline -1` falha), seguir do Passo 5 a partir da identidade; com commit e sem
remoto (`git -C <pasta> remote get-url origin` falha), seguir do Passo 5 a
partir do `remote add`; com remoto, conferir que o push saiu (`git -C <pasta>
status -sb` sem `ahead`; com `ahead`, rodar o `push` do Passo 5) e seguir do
Passo 6.

## Passo 2, senha não viaja

```bash
node .claude/skills/compartilhar/scripts/compartilhar.mjs varrer <pasta>
```

Saída 2 quer dizer que achou: `segredos` (arquivo, linha e tipo, nunca o valor,
inclusive dentro de um `.env.example`) e `envs` (arquivo `.env` dentro da pasta).
Saída 3 é erro de digitação no comando (pasta que não existe, comando errado):
corrigir e rodar de novo. `naoVarridos` e `ilegiveis`
são arquivos que a varredura não conseguiu ler (planilha, PDF, arquivo grande):
mostrar a lista e pedir que a pessoa confirme que não tem senha nem dado de
cliente neles antes de seguir. Parar e mostrar onde está (arquivo e linha, nunca o valor), e oferecer tirar
dali: com o sim, a chave ou senha vai pro `.env` do projeto, que não viaja, e no
arquivo da pasta fica só o nome do serviço. CPF ou dado de cliente não vai pro
`.env`: sai do arquivo que viaja (fica só no projeto, ou some, se não é mais
necessário). Se o arquivo já estava no backup do
projeto (aparece em `git log --oneline -- <arquivo>`), avisar: tirar daqui não
apaga do histórico do GitHub, então a senha tem que ser trocada no serviço. Rodar de novo até sair 0. Sem isso, nada segue.

## Passo 3, completar a pasta

Montar a lista do que vai entrar, passar pela `/segunda-opiniao` e mostrar pra
pessoa. Com o sim:

1. **Marca.** Se a pasta não tem `marca/` própria, criar `marca/design-guide.md`
   com o resumo da marca do projeto que esta pasta usa (cores, fontes) e
   `marca/tom-de-voz.md` com o resumo da voz (tratamento, como soa, o que nunca),
   e copiar o logo pra dentro. Resumo do que serve aqui, nunca a
   marca inteira.
   Se a marca do projeto ainda é o molde em branco, pular e dizer pra pessoa
   que a pasta vai sem marca.
2. **`AGENTS.md` da pasta.** Primeira linha: "Quem recebe esta pasta abre esta
   pasta no VS Code, e ela se basta." Trocar todo caminho com `../` pelo que agora
   mora dentro (`marca/`, `decisoes.md`). Acrescentar uma tabela de destinos
   curta: trabalho, aqui; onde está e o que falta, `andamento.md`; o que foi
   combinado e quem é quem, `contexto.md`; decisão, `decisoes.md` desta pasta, só
   acréscimo. E a regra de fim de sessão: "sessão que mexeu aqui atualiza o
   `andamento.md` antes de fechar".
3. **Decisões.** Da raiz do projeto, com a etiqueta, que é só o nome da pasta
   (o último pedaço do caminho, sem colchetes: `clientes/doceria-da-bia` vira
   `doceria-da-bia`). O script acha a decisão escrita como
   `[projeto] doceria-da-bia`, `[projeto] clientes/doceria-da-bia` ou
   `[doceria-da-bia]`:

   ```bash
   node .claude/skills/compartilhar/scripts/compartilhar.mjs decisoes <pasta> <etiqueta>
   ```

   Copia pro `decisoes.md` da pasta só as entradas com a etiqueta. As do projeto
   ficam onde estão. Rodar de novo não duplica. Se a saída traz `paraConferir`,
   são decisões sem etiqueta que trocam uma da pasta: mostrar cada uma e
   perguntar se vai junto. Se `copiadas` der 0 e as decisões citam a pasta,
   desconfiar da etiqueta e conferir antes de seguir.
4. **Comandos.** Skill que mora em `<pasta>/.claude/skills/` já vai junto; caminho
   do projeto-pai dentro dela, a conferência do fim aponta e ele se troca pelo que
   existe na pasta. Se a
   pasta depende de skill do projeto, perguntar: copiar pra dentro, ou tirar a
   dependência. Prometer comando que não vai existir do outro lado é pior que não
   ter. Quem vai trabalhar junto leva também a `syncar` (copiar
   `.claude/skills/syncar/` pra dentro) e o script que ela roda,
   `.claude/hooks/auto-sync.mjs` (só ele, sem o `.test.mjs`), em
   `<pasta>/.claude/hooks/`: é como os dois salvam e mandam.
5. **`CLAUDE.md`** com a linha `@AGENTS.md`, e o **`.gitignore`** fechado (só
   sobe o tipo de arquivo liberado; `.env` nunca): copiar o do projeto se a
   primeira regra dele é `*`; senão, o do molde (`../_modelo/.gitignore`, a
   partir da raiz do projeto), com a mesma conferência. Se nenhum dos dois é
   fechado (kit antigo), avisar a pessoa que o backup da pasta vai pela lista
   antiga e seguir com o do projeto.
6. **`contexto.md` e `andamento.md`.** Reler e trocar o que só faz sentido de
   dentro do projeto ("ver o `empresa.md`") pelo conteúdo em si.
   Dado pessoal de cliente (CPF, telefone pessoal, endereço de casa) fica de
   fora, mesmo quando está num arquivo do projeto que a pasta usa.

Conferir:

```bash
node .claude/skills/compartilhar/scripts/compartilhar.mjs conferir <pasta>
```

Saída 1 lista arquivo e linha com caminho que sai da pasta (`../`) ou que só existe
neste computador (`E:/`, `/Users/`), em `.md`, script (`.mjs`, `.js`, `.py`, `.sh`,
`.ps1`) ou configuração (`.json`, `.yaml`, `.txt`); `linha: 0` é atalho quebrado.
Corrigir até sair 0.

## Passo 4, conferência final

Varrer de novo, porque o Passo 3 trouxe texto novo pra dentro:

```bash
node .claude/skills/compartilhar/scripts/compartilhar.mjs varrer <pasta>
```

Saída 2: parar, como no Passo 2.

O nome do repositório é o último pedaço do caminho da pasta
(`clientes/doceria-da-bia` vira `doceria-da-bia`), o mesmo da etiqueta das
decisões. A pasta ainda não ganha `.git` aqui: o backup do projeto roda no fim
de cada resposta e, numa pasta com `.git` próprio que ele ainda não guardava,
grava só um ponteiro no lugar do conteúdo (ou para de salvar o projeto
inteiro). Por isso o repositório da pasta nasce no Passo 5, já com o envio
liberado.

## Passo 5, o convite

Isso manda a pasta pra fora: só com o "pode ir".
Antes de pedir o "pode ir" do envio, passar pela `/segunda-opiniao` (dose
rápida). Se a pessoa parar aqui, a pasta fica pronta no computador e no backup
do projeto, sem `.git` próprio; a linha do diário de hoje, no formato que o `AGENTS.md` manda, diz "pasta `<pasta>` pronta pra
compartilhar, falta subir pro GitHub", e um `/compartilhar` depois retoma do
Passo 5. Pedir, clique a clique:

> "Entra em github.com/new. Em Repository name, põe `<nome>`. Em Choose
> visibility, escolhe **Private**. Deixa o Add README desligado. Clica em
> Create repository e me manda o link que aparece."

Com o link e o "pode ir", tudo daqui até o `push` na mesma resposta, sem parar
no meio pra perguntar nada (a identidade se pergunta antes, se faltar).

Primeiro, na raiz do projeto, `git ls-files -- <pasta>` tem que listar os
arquivos da pasta: é o backup do projeto guardando ela, e o que segura o
conteúdo se o envio falhar. Projeto com backup e lista vazia: antes, `git add --
<pasta>` e `git commit -m "<origem>: pasta <pasta> antes de compartilhar"`.

A pasta assina com o mesmo nome e e-mail do projeto. Na raiz do projeto,
`git config user.name` e `git config user.email` dão os dois. Se o projeto não
devolve nada, perguntar o nome e o e-mail da conta do GitHub da pessoa antes de
começar.

```bash
git -C <pasta> init -b main
git -C <pasta> config user.name "<nome>"
git -C <pasta> config user.email "<email>"
git -C <pasta> add -A
git -C <pasta> commit -m "início (<origem>): pasta preparada pra compartilhar"
git -C <pasta> remote add origin <link>
git -C <pasta> push -u origin main
```

`<origem>` é o que está no `.origem` do projeto (`dono` se não tiver). Se o
`push` falhar (senha, link errado), dizer o motivo em uma frase e resolver
nesta resposta; não deu, a pasta continua no backup do projeto pelo que o `git
ls-files` mostrou, e o próximo `/compartilhar` retoma pelo Passo 1.

Depois, o convite:

> "Subiu. Pra dar acesso: no repositório, Settings, depois Collaborators, depois
> Add people (o GitHub pode pedir a sua senha de novo antes), e põe o e-mail ou
> o usuário do GitHub de [quem]. A pessoa aceita o convite que chega por e-mail."

O que dizer pra quem recebe:

- **Só vai olhar:** abre o link do repositório no navegador; os arquivos aparecem
  ali mesmo.
- **Vai trabalhar junto:** no VS Code, `Ctrl+Shift+P` (no Mac, `Cmd+Shift+P`),
  digita `Git: Clone`, cola o link e escolhe onde salvar. Baixar como zip não
  serve: a cópia sai sem o jeito de mandar de volta. Depois abre a pasta com o
  Claude Code ou o Codex: o `AGENTS.md` daqui já explica tudo pro assistente
  dela. No fim do dia, cada um roda o `/syncar` dentro da pasta, que manda o seu
  e puxa o do outro.

## Passo 6, o projeto para de guardar a pasta

Só depois que o push do Passo 5 deu certo. O pedido de ok daqui também passa
pela `/segunda-opiniao` (dose rápida). Antes disso, a pasta continua no
backup do projeto e nada se perde se a pessoa parar no meio.

Explicar e pedir o ok:

> "Agora a pasta tem o backup dela no GitHub. Vou tirar ela do backup do projeto
> pra os dois não brigarem. Ela continua aqui no seu computador. Nos outros
> computadores que usam este projeto (o seu notebook, o do sócio), ela some da
> cópia do projeto na próxima vez que eles sincronizarem: lá, é só clonar o
> repositório novo do jeito do Passo 5. Posso?"

Com o sim, na raiz do projeto:

1. Acrescentar `<pasta>/` numa linha no fim do `.gitignore` do projeto, se a
   linha ainda não estiver lá.
2. `git rm -r --cached --ignore-unmatch <pasta>`: o backup do projeto para de
   guardar a pasta; o arquivo continua no lugar. Projeto sem backup (sem git):
   pular este passo.
3. Na Estrutura de pastas do `AGENTS.md` do projeto, a linha da pasta ganha
   "repositório próprio, compartilhada com [quem], salva pelo backup dela".

No fim, uma linha no diário de hoje, no formato que o `AGENTS.md` manda: "pasta
`<pasta>` compartilhada com [quem]".

## Regras

- Senha ou `.env` dentro da pasta: parar antes de qualquer outra coisa.
- Nunca apagar nem mover nada do projeto, fora tirar a senha da pasta (Passo 2):
  só a linha no `.gitignore`, o `git rm --cached` e a linha na Estrutura de
  pastas, e só depois do push e do ok do Passo 6.
- A pasta leva o que usa, resumido. O projeto inteiro nunca vai junto.
- Repositório sempre privado, e o envio só com o "pode ir".
