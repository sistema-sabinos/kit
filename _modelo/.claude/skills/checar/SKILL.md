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

Só leitura: esta skill não muda nada sozinha. Cada item vermelho vem com o conserto em uma frase, sem comando pro usuário digitar: quem roda é a IA, só depois do sim dele.

## O que conferir, nesta ordem

Rodar os comandos de leitura e classificar cada item em verde, amarelo ou vermelho.

### 1. Memória

- `_contexto/empresa.md`, `preferencias.md`, `estrategia.md`, `agora.md`, `licoes.md`, `ferramentas.md` existem?
- Algum ainda traz `<!-- NOT CONFIGURED -->` ou placeholder entre colchetes (`[a última coisa...]`) onde já deveria ter conteúdo?
- `agora.md` foi atualizado nos últimos 30 dias? (`git log -1 -- _contexto/agora.md`, ou a data do arquivo mais novo em `_memoria/diario/`)
- **Vermelho:** arquivo faltando ou `NOT CONFIGURED`. Conserto: o `/setup` na pasta-mãe (se nunca rodou) ou preencher em conversa agora.
- **Amarelo:** `agora.md` parado há mais de 30 dias. Conserto: rodar `/atualizar` no fim desta sessão.
- `_contexto/autonomia.md` (as permissões que a pessoa deu): `node .claude/skills/checar/scripts/autonomia.mjs` imprime cada defeito do arquivo numa linha, ou `nenhum problema` (`sem arquivo` também é verde: ninguém deu permissão ainda), ou `erro ao ler o _contexto/autonomia.md: <código>`.
- **Amarelo:** o script imprimiu defeito. Linha que diz `todas as permissoes somem` faz o arquivo inteiro valer como vazio, e a IA volta a perguntar tudo; nas outras, cai só a área escrita no começo da linha e as demais permissões seguem valendo. Conserto: mostrar a linha como veio e, com o sim da pessoa, corrigir pela mesma caixinha de confirmar que gravou a permissão.
- **Amarelo:** o script imprimiu `erro ao ler`: o arquivo existe mas não abriu (uma pasta com esse nome, arquivo travado por outro programa), e as skills tratam como nenhuma permissão dada. Conserto: mostrar a linha como veio e ver com a pessoa o que tem nesse caminho.

### 2. Backup

- `git rev-parse --git-dir` (é repositório?), `git rev-parse --show-prefix` (vazio: esta pasta é o topo do próprio repositório; com texto, ela é pedaço de um repositório de fora), `git remote get-url origin` (tem nuvem?), `git status --short` (tem coisa não salva?), `git log -1 --format=%cd` (último commit), `git status -sb` (está "ahead", ou seja, commit que não subiu?)
- `node .claude/hooks/auto-sync.mjs --idade`: uma linha com os arquivos fora do backup e há quanto tempo o mais velho foi mexido, os commits sem subir e a data do último envio. Roda sem internet, sem commit e sem envio. Mostrar a linha como veio. Se a resposta for `opcao desconhecida`, o script do projeto é de versão anterior: seguir só pelos comandos de cima.
- Existe `.backup-falhou` na raiz?
- `.claude/settings.json` tem o hook de auto-sync? (procurar `auto-sync.mjs` dentro do bloco `hooks.Stop`) E o arquivo `.claude/hooks/auto-sync.mjs` existe?
- **Vermelho:** `--show-prefix` com texto: "esta pasta está dentro de outro repositório; o backup não roda aqui. Conserto: `/syncar`".
- **Vermelho:** sem repositório ou sem remote (o trabalho existe só neste computador), ou `.backup-falhou` presente, ou commits "ahead" sem push. Conserto: `/syncar`.
- **Vermelho:** a linha do `--idade` começa com `Backup vermelho` (commit sem subir, arquivo fora do backup mexido há mais de 1 dia, ou trabalho só neste computador). Conserto: `/syncar`. `Backup pendente` com menos de 1 dia é o normal: o backup automático manda no fim da resposta.
- **Amarelo:** hook ou script ausente enquanto a regra 5 do `AGENTS.md` diz que o hook salva sozinho. Conserto: copiar `.claude/hooks/auto-sync.mjs` de `../_modelo/` (sem o `.test.mjs`) e reaplicar o bloco `Stop` do `settings.json` do molde. Se a regra 5 diz que não existe backup automático (a pessoa recusou o auto-sync no `/setup`), é o combinado: verde, e o `/syncar` ao fim das sessões é o caminho.

### 3. Chaves e segredos

- `node .claude/skills/checar/scripts/gitignore.mjs`: pergunta ao Git, pelo `.gitignore` do projeto, se o `.env`, a sessão do navegador, o nome da máquina, vídeo, zip e `node_modules` ficam fora do backup e se a memória sobe. Imprime `ok` ou uma linha por caminho que furou. Só olha nome de caminho, nunca abre arquivo.
- `git ls-files | grep -i "\.env"` volta vazio, ou só com `.env.example`? (nenhum arquivo de chave rastreado)
- Rodar `node .claude/skills/faxina/scripts/faxina.mjs` e olhar só a lista `segredos`: é a mesma conferência de cara de chave do backup automático (OpenAI, GitHub, AWS, Meta, Instagram, Google, Telegram, Mercado Livre e outros). Pra cada arquivo da lista, `git ls-files <arquivo>` diz se ele já está no backup. Nunca procurar prefixo de chave com `grep` à mão: os próprios arquivos do kit citam os prefixos.
- **Vermelho:** linha `sobe pro backup e devia ficar fora` (sem a pasta ser repositório, o item 2 já está vermelho). Conserto: acrescentar no fim do `.gitignore` uma linha que barra aquele caminho (pro `.env`, as duas linhas `.env*` e `!.env.example`; pra vídeo e zip, a extensão, como `*.mp4`; pra pasta, o nome dela com a barra no fim, como `dados/chrome-perfil/`; o resto, o nome como o script mostrou), mostrando o antes e o depois, e rodar o script de novo até sair `ok`. Seguiu furando: `git check-ignore -v --no-index <caminho>` mostra o arquivo e a linha que decidem, inclusive num `.gitignore` de subpasta (como `app/codigo/.gitignore`); a linha com `!` que solta o caminho sai de lá. Sem `.gitignore`: copiar o `../_modelo/.gitignore`. Enquanto o `.env` não estiver barrado, o backup automático não manda nada.
- **Amarelo:** linha `fica fora do backup e devia subir`: esse arquivo não vai pra nuvem. Conserto, com o antes e o depois: pro `.env.example`, a linha `!.env.example` no fim, depois das linhas do `.env`; pro resto, a liberação do `../_modelo/.gitignore` que cobre o caminho (como `!*.md`) logo antes do bloco "Bloqueio de proposito", nunca depois dele (no fim, ela soltaria o que o bloqueio segura), e sem esse bloco no arquivo, logo antes das linhas do `.env`. `.gitignore` que começa com `*` precisa também da linha `!*/` logo depois dele, que libera as pastas (sem ela, a liberação do tipo não alcança arquivo dentro de pasta). Seguiu fora: o `git check-ignore -v --no-index <caminho>` mostra a linha que segura.
- **Vermelho:** `.env` rastreado ou chave em arquivo. Conserto: mostrar arquivo e linha (nunca o valor); a pessoa abre o `.env` no editor e cola numa linha `NOME=valor`; a IA roda `node .claude/skills/conectar/scripts/chave.mjs bate NOME --em <arquivo>:<linha>` e só com `bate` tira a chave do arquivo (a IA nunca grava o `.env`); `git rm --cached` no `.env` se estiver rastreado (com outro computador ou sócio no projeto, esse commit apaga o `.env` de lá quando chegar: avisar antes, pra pessoa de lá copiar o `.env` pra fora da pasta e pôr de volta depois), e avisar que a chave exposta deve ser trocada no provedor (uma vez no GitHub, considerar vazada).

### 4. Comandos (skills)

- Listar `.claude/skills/*/SKILL.md`. Cada um tem frontmatter com `name` e `description`?
- Existe algum `.md` solto direto em `.claude/skills/` (fora de pasta)? Esse não carrega.
- O `AGENTS.md` cita alguma skill que não existe na pasta?
- Skill pessoal com o mesmo nome: `node .claude/skills/checar/scripts/skills-repetidas.mjs` lista as pastas de `~/.claude/skills/` com o nome de uma skill deste projeto, ou `nenhuma`. A skill pessoal roda no lugar da do projeto.
- **Amarelo:** nome repetido, "a sua versão pessoal de /<nome> roda no lugar da deste projeto". Conserto: renomear ou tirar a pasta de `~/.claude/skills/`.
- **Vermelho:** skill sem frontmatter ou `.md` solto. Conserto: mover pra `.claude/skills/<nome>/SKILL.md` e completar o frontmatter. Depois a skill aparece sozinha, na mesma conversa, no VS Code e no app do Claude; se não aparecer ao digitar `/`, abrir uma conversa nova.

### 5. Ponte do Codex

- `.agents/skills` existe? É link/junction, link quebrado ou pasta comum (cópia)? Um comando só responde nos dois sistemas (Git Bash, PowerShell, Terminal do Mac): `node -e "const fs=require('fs');const l=fs.lstatSync('.agents/skills').isSymbolicLink();let ok=true;try{fs.readdirSync('.agents/skills')}catch{ok=false};console.log(l?(ok?'link':'link quebrado'):'copia')"`. Link quebrado é o que sobra quando a pasta do projeto muda de lugar ou de nome: o link continua lá, apontando pro caminho velho, e o Codex não acha nenhuma skill, calado.
- Se for cópia: o conteúdo bate com `.claude/skills` (mesma lista de pastas)?
- **Vermelho:** link quebrado. Conserto, dito em uma frase ("a ponte do Codex quebrou, posso refazer?") e rodado pela IA com o sim: tirar só o link, que não apaga nada dele (`node -e "require('fs').rmSync('.agents/skills')"`), e criar a ponte de novo com o comando de criar abaixo.
- **Amarelo:** ponte ausente (só importa pra quem usa Codex) ou cópia desatualizada. Conserto, rodado pela IA com o sim: criar a ponte ou copiar `.claude/skills` por cima de `.agents/skills`. Comando de criar: no Windows `node -e "const fs=require('fs'),p=require('path');fs.mkdirSync('.agents',{recursive:true});if(!fs.existsSync('.agents/skills'))fs.symlinkSync(p.resolve('.claude/skills'),'.agents/skills','junction')"`; no Mac `mkdir -p .agents && ln -sfn ../.claude/skills .agents/skills`. O usuário que pedir no chat "refaz a ponte do Codex" cai aqui.

### 6. Ferramentas

- `_contexto/ferramentas.md` lista o que está ligado. Conferir com `/mcp` (o usuário roda e cola a lista, ou perguntar "aparece playwright conectado?"). Essa leitura mostra o que aparece listado, mas não prova que a ferramenta responde: fica `(só configurado)`.
- Em cada ferramenta que o `/mcp` mostrar conectada e que tiver alguma leitura sem custo (listar canais, listar rótulos, tirar um snapshot), rodar essa leitura agora. Só essas entram como `(testado agora)`; ferramenta sem leitura barata disponível fica `(só configurado)`, com o que o `/mcp` mostrou.
- Skill ativa que depende de ferramenta ainda pendente (a própria skill diz o que precisa)?
- **Amarelo:** skill esperando conexão. Conserto: `/conectar`.
- **Amarelo:** ferramenta conectada sem leitura barata feita agora. Texto: "não dá pra testar daqui, nada a consertar"; nunca "Conserto: /conectar", porque ela já está ligada.
- **Lib do Chrome em dia** (amarelo quando falha): cada `.claude/skills/*/scripts/lib/chrome.mjs` do projeto cita `conectar/scripts/lib/navegador.mjs`. O que não cita é a lib velha, que abre o Chrome em outra porta e briga pelo mesmo perfil. Conferência: `grep -L "conectar/scripts/lib/navegador.mjs" .claude/skills/*/scripts/lib/chrome.mjs`. Saída vazia é verde, e projeto sem nenhum `chrome.mjs` (nenhum pacote com navegador) também. Conserto: rodar a `/atualizar-sabinos` e aceitar a troca desse arquivo. Se ele foi mexido de propósito, refazer a mudança em cima da casca nova.

### 7. Padrão AGENTS.md

- `CLAUDE.md` tem só a linha `@AGENTS.md`? `AGENTS.md` existe e tem o contexto do negócio na abertura (não o título genérico "Projeto SabinOS")?
- **Vermelho:** `CLAUDE.md` com conteúdo próprio (vai divergir do `AGENTS.md`). Conserto: mover o conteúdo pro `AGENTS.md` e deixar o ponteiro.

### 8. Mesa (o que entra em toda conversa)

- Rodar `node <pasta-mãe>/_ferramentas/medir-mesa.mjs .` (o script mora na `_ferramentas/` da pasta-mãe). Ele lista três camadas, com tokens estimados por arquivo e o total antes da primeira palavra do usuário: o `CLAUDE.md` global, a cadeia de `CLAUDE.md`/`AGENTS.md` desta pasta até a raiz, e os cinco arquivos do `_contexto/` que o `AGENTS.md` manda ler sempre (marcados `[contexto]`). Depois do total, no bloco "Fora do total", vem o `licoes.md`, também `[contexto]` e com o mesmo limiar: ele entra inteiro no fechamento pelo `/atualizar`, então na linha Mesa aparece como peso do fechamento, nunca como peso de toda conversa, e fica fora do total antes da primeira palavra.
- **Arquivo de regra** (`CLAUDE.md`, `AGENTS.md`), **vermelho** acima de 6.000 tokens, **amarelo** acima de 2.000. Conserto: manter só regra nele; história, lista de comandos e nota de ferramenta vão pro `_contexto/` (no global, pra `~/.claude/contexto/`) e entram só quando a tarefa pede. Regra 11 do `AGENTS.md`. No `AGENTS.md` do projeto, medir também o molde (`node <pasta-mãe>/_ferramentas/medir-mesa.mjs <pasta-mãe>/_modelo`) e propor corte só quando o projeto passar o molde em mais de 1.000 tokens, e só no que o projeto acrescentou. Regra que veio do kit não se corta: quem enxuga o molde é o kit, e a versão nova chega pelo `/atualizar-sabinos`. Dentro dessa margem, o amarelo diz "o tamanho vem do molde do kit, nada a cortar aqui".
- **Arquivo do `_contexto/`**, limiar mais apertado porque os cinco carregam juntos: **vermelho** acima de 1.500 tokens, **amarelo** acima de 800. Conserto: `/atualizar`, que consolida e manda o que virou história pro `_contexto/arquivo/`. Memória que só cresce é o jeito mais silencioso de encarecer toda conversa.

### 9. Travas de segurança

Um hook que não roda (Node não instalado, script apagado) vira erro não bloqueante e o comando roda normal, com um aviso pequeno: a trava pode estar morta sem ninguém perceber. Por isso a única checagem que prova de verdade é rodar a trava com um comando perigoso de mentira.

- A pasta `.claude/hooks/` existe e o `barrar-perigoso.mjs` está dentro dela?
- O `settings.json` tem o bloco `hooks.PreToolUse` apontando pra `barrar-perigoso.mjs`, com o `matcher` cobrindo **as três** ferramentas (`"Bash|PowerShell|Monitor"`, em qualquer ordem, separadas por `|` ou vírgula; nunca só `"Bash"` sozinho, senão a trava do PowerShell morre em silêncio e ninguém percebe)? Sem só o `Monitor` (projeto de antes da 5.20): amarelo, o comando mandado em segundo plano escapa da trava, e o `/atualizar-sabinos` acrescenta (entrada `trava-no-monitor`).
- O `settings.json` tem o bloco `hooks.PreToolUse` com matcher `"mcp__.*"` apontando pra `barrar-mcp.mjs`, com `"onFailure": "block"`?
- O Node responde na sessão: rodar `node -v` pela ferramenta que roda comando nesta conversa (Bash ou PowerShell) e conferir que imprime a versão. **Vermelho** quando falha: sem Node, as travas não rodam, e as ferramentas do Claude e as conexões ficam barradas pelo `barrar-mcp` até o Node entrar e o programa reabrir. Conserto: se o Node não está instalado, `/setup`; depois, espera terminar o que roda nas outras conversas e fecha de vez o programa onde você conversa comigo (VS Code: fecha todas as janelas; app do Claude: ícone perto do relógio, botão direito, Sair; no Mac, Cmd+Q nos dois) e abre de novo nesta pasta, numa conversa nova. Gerenciador de Tarefas só se não fechar. Na fala, o parêntese leva só o programa em uso, lido pelo shell (`echo "$CLAUDE_CODE_ENTRYPOINT"` no Bash, `$env:CLAUDE_CODE_ENTRYPOINT` no PowerShell): `claude-vscode`, só o VS Code; começando com `claude-desktop`, só o app; vazio ou outro valor, os dois.
- Bloqueio de leitura fora da pasta: rodar `node .claude/skills/checar/scripts/bloqueio-leitura.mjs ler`. Ele imprime o caminho de cada settings (o do usuário e os dois do projeto) que tem `permissions.blockReadsOutsideWorkingDirectories` ligada (`true`; com `false` nada trava e ele não acusa), ou `nada`. **Vermelho** quando imprime caminho: com essa chave, a leitura da pasta-mãe (o `_modelo`, a `_ferramentas`) trava em todo projeto e em todo modo, e o `/atualizar-sabinos`, a mesa e o conserto das travas param. Conserto, dito em uma frase ("tem uma configuração que impede ler a pasta-mãe, posso tirar?") e rodado pela IA com o sim: `node .claude/skills/checar/scripts/bloqueio-leitura.mjs tirar`, que tira só essa chave e deixa o resto do arquivo como estava; depois, abrir uma conversa nova, que é quando a configuração nova vale. Se ele sair com `nao e um JSON valido`, repassar a mensagem como veio e não mexer no arquivo.
- A conversa está aberta dentro de `.claude/worktrees/` (a pasta atual, por `node -p "process.cwd()"`, tem `worktrees` logo depois de `.claude` no caminho)? **Amarelo** quando está: é a cópia que o programa cria com o Worktree ligado, e o que se faz nela fica à parte e não chega sozinho na pasta do projeto. Texto: "desliga o Worktree e abre a conversa de novo na pasta do projeto".
- O `settings.json` tem em `permissions.ask` a regra `"Edit(/_contexto/autonomia.md)"` (a caixinha que pergunta antes de a IA mexer na permissão escrita) e, em `permissions.allow`, as regras da lista do kit (as que começam com `Bash(node .claude/skills/`, `Bash(node _ferramentas/`, `Bash(git `, `Bash(npm install`, `Bash(npm ci`, `Bash(ffmpeg `, `Bash(ffprobe ` e `Bash(python`)? Sem o `ask` ou sem o `allow` do kit (projeto de antes da 5.52): amarelo, e o `/atualizar-sabinos` acrescenta no passo do `settings.json`. Regra no `allow` que solta tudo (`"Bash"`, `"Bash(*)"`, `"PowerShell(*)"` ou qualquer `mcp__`), ou `"bypassPermissions"` em qualquer lugar do arquivo: amarelo, mostrar a linha pra pessoa e perguntar se foi ela que pôs; o que ela pôs fica. O `allow` só vale depois de a pessoa confiar na pasta e não muda nada com as perguntas desligadas.
- A trava responde de verdade: rodar `node -e "process.stdout.write(JSON.stringify({tool_input:{command:'for'+'mat c:'}}))" | node .claude/hooks/barrar-perigoso.mjs` (o `node -e` monta o JSON sem depender de aspas do terminal do usuário, Windows ou Mac; o comando de disco vai partido em duas pontas, `'for'+'mat c:'`, pra esse comando de teste não carregar o próprio texto que a trava barra e acabar bloqueado por ela mesma antes de rodar) e conferir que o comando sai com código de erro e imprime a mensagem que começa com "Barrada pela trava barrar-perigoso". Isso prova que o script barra; as outras três só provam que o arquivo existe.
- A trava está ligada (ponta a ponta, o único teste que passa pelo `settings.json`):
  1. Criar uma pasta de teste com nome novo: `node -e "const n='.trava-teste-sabinos-'+Date.now();require('fs').mkdirSync(n);console.log(n)"`. O comando falha se o nome já existe, então nada de verdade entra na prova; anotar o nome que ele imprimiu.
  2. Avisar a pessoa: "Vai aparecer uma pergunta pra apagar a pasta de teste; responda Não." Depois, tentar apagar essa pasta pela ferramenta, como um pedido comum: no Bash, `rm -rf <nome>`; no PowerShell, `Remove-Item -Recurse <nome>` (nunca `rm -rf` no PowerShell, que falha por parâmetro e parece trava).
  3. Apareceu a pergunta "Pergunta da trava barrar-perigoso", com o nome da pasta, e a pessoa respondeu Não: a trava está ligada (testado agora). A pasta sumiu: a IA não enxerga a pergunta, então pergunta à pessoa antes de dar a cor ("apareceu uma pergunta da trava antes de apagar a pasta de teste?"). Apareceu e a pessoa deixou apagar: verde, a trava perguntou e a pessoa permitiu (testado agora); a pasta era de teste e não faz falta. Não apareceu: VERMELHO, trava desligada. Falhou sem a pergunta: amarelo, a prova não valeu; dizer o erro. O resultado diz o que a pessoa viu e nunca culpa o modo de permissão sem prova.
  4. Se a pasta ainda existe (a pessoa respondeu Não ou a prova falhou), tirar a pasta vazia: `node -e "require('fs').rmdirSync('<nome>')"`. É a limpeza combinada da prova, e não conta como refazer por outro caminho (regra 12 do `AGENTS.md`): a pasta nasceu vazia no passo 1, e o `rmdirSync` não apaga pasta com conteúdo. Se a pessoa deixou apagar, não sobrou nada pra tirar e este passo fica de fora.
- **Vermelho:** pasta ou script faltando, hook não referenciado no `settings.json`, matcher sem o Bash ou sem o PowerShell, ou a trava não bloqueou o comando de disco de teste (o do `node -e` acima), ou a pasta de teste foi apagada sem a pergunta, com a pessoa dizendo que ela não apareceu (trava fora do `settings.json` ou desligada). Conserto: copiar `.claude/hooks/barrar-perigoso.mjs` e `.claude/hooks/barrar-mcp.mjs` de `../_modelo/` (sem os `.test.mjs`, que são só de desenvolvimento) e reaplicar os dois blocos `PreToolUse` (matcher `"Bash|PowerShell|Monitor"` e matcher `"mcp__.*"`) no `settings.json`.

### 10. Agendador

- Se `.claude/skills/agendar/` existir no projeto: rodar `node .claude/skills/agendar/scripts/agendador.mjs atrasados`.
- **Amarelo:** algum robô atrasado (parado). Mostrar quais e desde quando. `(testado agora)`.
- Sem a skill `agendar` no projeto, o item não entra no semáforo.

### 11. Conselheiros

- Se `.claude/skills/clonar-especialista/` existir no projeto e a pasta-mãe tiver `agentes/`:
  rodar `node .claude/skills/clonar-especialista/scripts/instalar.mjs --faltando <pasta-mãe>/agentes`.
- **Verde:** `--faltando` responde `nenhum`.
- **Amarelo:** algum apelido listado (cópia-mestra sem instalação neste computador, caso típico
  de computador novo). Conserto: `node .claude/skills/clonar-especialista/scripts/instalar.mjs
  <pasta-mãe>/agentes/<apelido>` pra cada um, com o sim, e conversa nova. Se o script recusar,
  repassar a recusa ao aluno como veio. `(testado agora)`.
- Sem a skill ou sem `agentes/`, o item não entra no semáforo.

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

Memória        verde    8 arquivos preenchidos, agora.md de 3 dias atrás (testado agora)
Backup         VERMELHO último push há 12 dias e 2 commits presos. Conserto: /syncar (testado agora)
Chaves         verde    .env protegido, nada colado em arquivo (testado agora)
Comandos       verde    9 comandos carregando (testado agora)
Ponte Codex    amarelo  não existe (só importa se você usar o Codex) (testado agora)
Ferramentas    amarelo  Playwright e Gmail lidos agora (testado agora); Buffer só aparece no /mcp, não dá pra testar daqui, nada a consertar (só configurado)
Padrão         verde    CLAUDE.md e AGENTS.md no formato certo (testado agora)
Mesa           amarelo  AGENTS.md com 3.100 tokens, 400 acima do molde do kit, e empresa.md com 950 (total 5.900 antes da sua primeira palavra) (testado agora, medir-mesa.mjs rodou). O tamanho do AGENTS.md vem do molde do kit, nada a cortar aqui; /atualizar consolida o _contexto/
Travas         verde    barrar-perigoso responde ao comando de teste e pergunta antes de apagar a pasta da prova, trava do MCP ligada (testado agora)
Agendador      verde    nenhum robô atrasado (testado agora)
Conselheiros   verde    2 conselheiros instalados neste computador (testado agora)

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
