---
name: checar
description: >
  Confere se o sistema deste projeto está inteiro e ligado: backup no GitHub em dia,
  chaves protegidas, memória configurada, comandos carregando, ponte do Codex e
  ferramentas conectadas. Devolve um semáforo simples e o conserto de cada item
  vermelho. Use quando o usuário chamar /checar, disser "está tudo certo aqui?",
  "o backup está funcionando?", "por que o comando não aparece", "faz um check-up",
  ou quando algo parecer quebrado sem motivo claro.
---

# /checar, Check-up do sistema

Só leitura: esta skill não muda nada sozinha. Cada item vermelho vem com o comando ou o passo que resolve, e o conserto só roda com o usuário aprovando.

## O que conferir, nesta ordem

Rodar os comandos de leitura e classificar cada item em verde, amarelo ou vermelho.

### 1. Memória

- `_contexto/empresa.md`, `preferencias.md`, `estrategia.md`, `agora.md`, `licoes.md`, `ferramentas.md` existem?
- Algum ainda traz `<!-- NOT CONFIGURED -->` ou placeholder entre colchetes (`[a última coisa...]`) onde já deveria ter conteúdo?
- `agora.md` foi atualizado nos últimos 30 dias? (data das linhas de "Decisões recentes", ou `git log -1 -- _contexto/agora.md`)
- **Vermelho:** arquivo faltando ou `NOT CONFIGURED`. Conserto: o `/setup` na pasta-mãe (se nunca rodou) ou preencher em conversa agora.
- **Amarelo:** `agora.md` parado há mais de 30 dias. Conserto: rodar `/atualizar` no fim desta sessão.

### 2. Backup

- `git rev-parse --git-dir` (é repositório?), `git remote get-url origin` (tem nuvem?), `git status --short` (tem coisa não salva?), `git log -1 --format=%cd` (último commit), `git status -sb` (está "ahead", ou seja, commit que não subiu?)
- Existe `.backup-falhou` na raiz?
- `.claude/settings.json` tem o hook de auto-sync? (procurar `git push` dentro dele)
- **Vermelho:** sem repositório ou sem remote (o trabalho existe só neste computador), ou `.backup-falhou` presente, ou commits "ahead" sem push. Conserto: `/syncar`.
- **Amarelo:** hook ausente (backup é manual). Conserto: nenhum obrigatório; lembrar de rodar `/syncar` ao fim das sessões.

### 3. Chaves e segredos

- `.gitignore` existe e tem `.env` e `.env.*`?
- `git ls-files | grep -i "\.env"` volta vazio? (nenhum arquivo de chave rastreado)
- `git grep -I -n -E "(API_KEY|ACCESS_TOKEN|CLIENT_SECRET|_PASSWORD)\s*[:=]\s*['\"]?[A-Za-z0-9._-]{12,}"` volta vazio? (nenhuma chave colada em arquivo versionado)
- **Vermelho:** `.env` rastreado ou chave em arquivo. Conserto: mover a chave pro `.env`, tirar do arquivo, `git rm --cached` no `.env` se estiver rastreado, e avisar que a chave exposta deve ser trocada no provedor (uma vez no GitHub, considerar vazada).

### 4. Comandos (skills)

- Listar `.claude/skills/*/SKILL.md`. Cada um tem frontmatter com `name` e `description`?
- Existe algum `.md` solto direto em `.claude/skills/` (fora de pasta)? Esse não carrega.
- O `AGENTS.md` cita alguma skill que não existe na pasta?
- **Vermelho:** skill sem frontmatter ou `.md` solto. Conserto: mover pra `.claude/skills/<nome>/SKILL.md` e completar o frontmatter. Depois recarregar a janela do VS Code (Ctrl+Shift+P no Windows, Cmd+Shift+P no Mac, "Reload Window").

### 5. Ponte do Codex

- `.agents/skills` existe? É link/junction (no Windows, `node -e "console.log(require('fs').lstatSync('.agents/skills').isSymbolicLink()?'link':'copia')"`, que funciona no Git Bash e no PowerShell; no Mac/Linux, `ls -la .agents` mostra `->`) ou pasta comum (cópia)?
- Se for cópia: o conteúdo bate com `.claude/skills` (mesma lista de pastas)?
- **Amarelo:** ponte ausente (só importa pra quem usa Codex) ou cópia desatualizada. Conserto: criar a ponte (comando no `docs/roadmap-avancado.md` da pasta-mãe, seção Rota Codex) ou copiar `.claude/skills` por cima de `.agents/skills`.

### 6. Ferramentas

- `_contexto/ferramentas.md` lista o que está ligado. Conferir com `/mcp` (o usuário roda e cola a lista, ou perguntar "aparece playwright conectado?"). Essa leitura mostra o que aparece listado, mas não prova que a ferramenta responde: fica `(só configurado)`.
- Em cada ferramenta que o `/mcp` mostrar conectada e que tiver alguma leitura sem custo (listar canais, listar rótulos, tirar um snapshot), rodar essa leitura agora. Só essas entram como `(testado agora)`; ferramenta sem leitura barata disponível fica `(só configurado)`, com o que o `/mcp` mostrou.
- Skill ativa que depende de ferramenta ainda pendente (a própria skill diz o que precisa)?
- **Amarelo:** skill esperando conexão. Conserto: `/conectar`.
- **Amarelo:** ferramenta conectada sem leitura barata feita agora. Texto: "não dá pra testar daqui, nada a consertar"; nunca "Conserto: /conectar", porque ela já está ligada.

### 7. Padrão AGENTS.md

- `CLAUDE.md` tem só a linha `@AGENTS.md`? `AGENTS.md` existe e tem o contexto do negócio na abertura (não o título genérico "Projeto SabinOS")?
- **Vermelho:** `CLAUDE.md` com conteúdo próprio (vai divergir do `AGENTS.md`). Conserto: mover o conteúdo pro `AGENTS.md` e deixar o ponteiro.

### 8. Mesa (o que entra em toda conversa)

- Rodar `node <pasta-mãe>/_ferramentas/medir-mesa.mjs .` (o script mora na `_ferramentas/` da pasta-mãe). Ele lista três camadas, com tokens estimados por arquivo e o total antes da primeira palavra do usuário: o `CLAUDE.md` global, a cadeia de `CLAUDE.md`/`AGENTS.md` desta pasta até a raiz, e os quatro arquivos do `_contexto/` que o `AGENTS.md` manda ler sempre (marcados `[contexto]`).
- **Arquivo de regra** (`CLAUDE.md`, `AGENTS.md`), **vermelho** acima de 6.000 tokens, **amarelo** acima de 2.000. Conserto: manter só regra nele; história, lista de comandos e nota de ferramenta vão pro `_contexto/` (no global, pra `~/.claude/contexto/`) e entram só quando a tarefa pede. Regra 11 do `AGENTS.md`.
- **Arquivo do `_contexto/`**, limiar mais apertado porque os quatro carregam juntos: **vermelho** acima de 1.500 tokens, **amarelo** acima de 800. Conserto: `/atualizar`, que consolida e manda o que virou história pro `_contexto/arquivo/`. Memória que só cresce é o jeito mais silencioso de encarecer toda conversa.

### 9. Travas de segurança

Um hook que não roda (Node não instalado, script apagado) vira erro não bloqueante e o comando roda normal, com um aviso pequeno: a trava pode estar morta sem ninguém perceber. Por isso a única checagem que prova de verdade é rodar a trava com um comando perigoso de mentira.

- A pasta `.claude/hooks/` existe e o `barrar-perigoso.mjs` está dentro dela?
- O `settings.json` tem o bloco `hooks.PreToolUse` apontando pra `barrar-perigoso.mjs`, com o `matcher` cobrindo **as duas** ferramentas (`"Bash|PowerShell"` ou `"Bash, PowerShell"`, nunca só `"Bash"` sozinho, senão a trava do PowerShell morre em silêncio e ninguém percebe)?
- O `settings.json` tem as regras de permissão do `.env` (`ask` pra `Read(./.env)` e `Read(./.env.*)`, `deny` pra `Read(./secrets/**)`)?
- A trava responde de verdade: rodar `node -e "process.stdout.write(JSON.stringify({tool_input:{command:'rm -r'+'f /'}}))" | node .claude/hooks/barrar-perigoso.mjs` (o `node -e` monta o JSON sem depender de aspas do terminal do usuário, Windows ou Mac; a receita perigosa vai partida em duas pontas, `'rm -r'+'f /'`, pra esse comando de teste não carregar o próprio texto que a trava barra e acabar bloqueado por ela mesma antes de rodar) e conferir que o comando sai com código de erro e imprime o motivo do bloqueio. Só essa prova que a trava está viva; as outras três só provam que o arquivo existe.
- **Vermelho:** pasta ou script faltando, hook não referenciado no `settings.json`, matcher cobrindo só uma ferramenta, regra de permissão do `.env` ausente, ou a trava não bloqueou o comando de teste. Conserto: copiar `.claude/hooks/barrar-perigoso.mjs` de `../_modelo/` (sem o `.test.mjs`, que é só de desenvolvimento) e reaplicar o bloco `PreToolUse` (matcher `"Bash|PowerShell"`) e as regras do `.env` no `settings.json`.

### 10. Agendador

- Se `.claude/skills/agendar/` existir no projeto: rodar `node .claude/skills/agendar/scripts/agendador.mjs atrasados`.
- **Amarelo:** algum robô atrasado (parado). Mostrar quais e desde quando. `(testado agora)`.
- Sem a skill `agendar` no projeto, o item não entra no semáforo.

## Como apresentar

Um semáforo, uma linha por item, sem jargão, cabendo numa tela. Cada linha
termina dizendo como foi conferido: ler o conteúdo real da própria coisa
(os arquivos de memória, a lista de skills carregando, o ponteiro do
AGENTS.md, a medição da mesa, a junção ou a cópia da ponte do Codex) ou exercitar a ação de verdade (a trava
recebeu o comando de mentira, o robô rodou o `atrasados`) conta como
`(testado agora)`; conexão, ferramenta ou hook que não foi exercitado agora
(existe no arquivo, mas isso não prova que funciona) conta como `(só
configurado)`. Item só configurado nunca sai verde: no máximo amarelo, com
o que testaria de verdade.

```
Check-up do sistema

Memória        verde    6 arquivos preenchidos, agora.md de 3 dias atrás (testado agora)
Backup         VERMELHO último push há 12 dias e 2 commits presos. Conserto: /syncar (testado agora)
Chaves         verde    .env protegido, nada colado em arquivo (testado agora)
Comandos       verde    9 comandos carregando (testado agora)
Ponte Codex    amarelo  não existe (só importa se você usar o Codex) (testado agora)
Ferramentas    amarelo  Playwright e Gmail lidos agora (testado agora); Buffer só aparece no /mcp, não dá pra testar daqui, nada a consertar (só configurado)
Padrão         verde    CLAUDE.md e AGENTS.md no formato certo (testado agora)
Mesa           amarelo  AGENTS.md com 2.100 tokens e empresa.md com 950 (total 4.900 antes da sua primeira palavra) (testado agora, medir-mesa.mjs rodou). Conserto: só regra fica no AGENTS.md, e /atualizar consolida o _contexto/
Travas         verde    barrar-perigoso responde ao comando de teste, .env em ask e secrets em deny (testado agora)
Agendador      verde    nenhum robô atrasado (testado agora)

Quer que eu resolva os vermelhos agora?
```

Depois do semáforo, esperar. Cada conserto aprovado roda um de cada vez, mostrando o que fez. Item que continuar vermelho depois do conserto vira linha em `tarefas.md`.

## Regras

- Só leitura até o usuário aprovar um conserto
- Toda checagem se roda de fato, nunca se deduz. Linha do semáforo com "não confirmei" ou "não verifiquei" não existe: se um comando não puder rodar, dizer qual e por quê, e marcar amarelo com esse motivo (em teste real a ponte do Codex saiu como "não confirmei se é link ou cópia" com o comando de conferir escrito logo acima)
- Nunca mostrar o valor de uma chave, nem parcialmente; dizer só o nome da variável e o arquivo
- Não inventar estado: cada linha do semáforo vem de um comando rodado nesta sessão
- Toda linha fecha com `(testado agora)` ou `(só configurado)`. Item só configurado nunca vira verde
- Se tudo estiver verde, dizer em uma linha e parar
