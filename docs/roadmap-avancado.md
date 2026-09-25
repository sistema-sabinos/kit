# Roadmap avançado (pra quando o básico estiver rodando)

Dois padrões que transformam o sistema de "assistente que ajuda" em "operação que roda". Ficam aqui de propósito, e não instalados: cada um só compensa depois de um sinal claro. Instalar antes da hora é peso morto.

## Padrão 1, Multiagente (o time de especialistas)

### O que é

Em vez de uma conversa fazer tudo, um orquestrador despacha agentes especializados: um pesquisa, outro escreve, outro revisa, outro publica. Cada agente tem instrução própria (em `.claude/agents/`), e eles trocam trabalho por arquivos de estado (JSON) com contrato definido: o que o pesquisador entrega é exatamente o que o escritor espera receber.

### Por que existe

1. **Contexto limpo:** cada agente enxerga só o que precisa, então erra menos e custa menos
2. **Qualidade por etapa:** dá pra colocar um agente auditor entre a produção e a publicação, um filtro que barra erro antes de virar público
3. **Repetição em escala:** o mesmo pipeline roda pra 1 ou pra 50 itens

### O sinal de que chegou a hora

Você tem um processo de 4+ etapas que roda toda semana, já mapeado em skills que funcionam bem sozinhas, e o gargalo virou o "cola" manual entre elas. Exemplos: produzir conteúdo em série (pesquisar tema, escrever, revisar, agendar), ou catalogar produtos em lote (foto, descrição, preço, publicação).

### Por onde começar

1. Escrever o pipeline em texto: etapas, o que entra e o que sai de cada uma
2. Criar um agente por etapa em `.claude/agents/<nome>.md` (instrução + ferramentas permitidas)
3. Definir onde vive o estado (ex: `dados/pipeline/<item>/status.json`) e o que cada etapa grava
4. Criar a skill orquestradora que despacha os agentes na ordem e **para nos pontos de aprovação humana** (nada publica sem gate)
5. Rodar com UM item de ponta a ponta antes de rodar em lote

## Padrão 2, Robô agendado (a tarefa que roda sozinha)

### O que é

Uma tarefa que executa no horário marcado sem ninguém pedir: toda segunda de manhã um relatório da semana, todo dia às 13h uma checagem dos anúncios, todo dia um backup. No Windows, via Task Scheduler; no Mac/Linux, via cron. O script roda, grava o resultado e avisa no Telegram. Dentro de um projeto, o `/agendar` monta tudo isso.

### Por que existe

O que depende de alguém lembrar, uma hora ninguém lembra. Monitoramento de coisa que muda (preço, estoque, campanha, promoção vencendo) só funciona agendado.

### O sinal de que chegou a hora

Existe uma checagem ou relatório que você já faz manualmente há semanas, do mesmo jeito, e o custo de esquecer é real (promoção venceu, estoque furou, campanha queimou verba).

### As 4 lições de quem já operou isso (aprender pelo atalho)

1. **Silêncio = tudo certo.** O robô só avisa quando tem problema ou ação a tomar. Robô que manda "rodei com sucesso" todo dia ensina a ignorar aviso.
2. **Guardião de boot.** Se o computador liga e todas as tarefas atrasadas disparam juntas, dá timeout e alarme falso. O robô confere há quanto tempo a máquina está ligada e espera a rede subir antes de rodar.
3. **Escrita atômica em arquivo compartilhado.** Dois robôs gravando o mesmo arquivo (ex: o `.env` num refresh de token) ao mesmo tempo corrompem tudo. Gravar em arquivo temporário e renomear; e backup diário do `.env` fora da pasta.
4. **Robô lê, humano aprova o que gasta.** Agendado pra LER e avisar, sim. Agendado pra gastar dinheiro ou publicar sozinho, não, até existir freio testado (limites escritos em arquivo de configuração e histórico de decisões).

### Por onde começar

1. Escolher UMA checagem que você já faz na mão
2. Pedir o robô pelo `/agendar`: ele escreve a receita e testa na sua frente
3. Rodar o teste na mão (`--teste`) por alguns dias pra ver se o aviso faz sentido
4. Só então deixar o `/agendar` cadastrar no agendador do computador

## Automação agendada, onde estão as instruções técnicas

Depois de decidir que um robô agendado (Padrão 2 acima) faz sentido, a parte de
"como configurar de fato" mora em `_ferramentas/lib/README.md`, dentro da
pasta-mãe. Lá tem o passo a passo de cadastrar a tarefa no agendador do
Windows (Agendador de Tarefas) e no Mac (launchd ou cron), além da explicação
de quatro peças pequenas de código que qualquer robô agendado deveria usar
pra não travar em silêncio: um prazo pra cada chamada de rede, um cão de
guarda pra rodada inteira, uma espera pra não rodar assim que o computador
liga, e um backup do arquivo de chaves (`.env`) fora da pasta. Ler esse
README antes de agendar o primeiro robô, não depois de ele travar pela
primeira vez.

## Navegador dedicado pra automação e downloads com login

Alguns sites (rede social que exige login pra liberar o download de um
vídeo, painel de fornecedor sem API, marketplace que barra script) só
deixam passar quem está de fato logado num navegador de verdade. A saída é
abrir um segundo navegador baseado em Chrome/Chromium, separado do que você
usa no dia a dia, com uma porta de depuração remota ligada nele. Esse
navegador dedicado fica logado nas contas que a automação precisa, e um
script ou robô se conecta nele pra clicar, digitar e navegar como se fosse
uma pessoa, sem precisar refazer login toda vez.

### Quando vale a pena

Só montar isso depois de esgotar o caminho mais simples (API oficial,
biblioteca pronta, download direto) e ele travar especificamente por causa
de login. Pra um uso ocasional, baixar o vídeo na mão e passar o arquivo
local resolve sem esse peso a mais.

### Cuidados de segurança, sempre

- **Perfil isolado:** o navegador dedicado usa uma pasta de perfil própria,
  separada do navegador pessoal, pra um script com bug não ter acesso às
  suas outras contas.
- **Nunca o navegador do dia a dia:** a porta de depuração remota nunca vai
  no navegador que você usa pra tudo. Isso deixaria qualquer processo da
  máquina, não só o seu script, capaz de controlar sua sessão logada.
- **Credencial só no `.env`:** usuário e senha das contas usadas nesse
  navegador ficam no arquivo `.env`, nunca digitadas no chat nem escritas em
  outro arquivo do projeto.

### Onde isso já aparece

A skill `assistir-video` cai nessa rota quando a plataforma exige login pra
baixar o vídeo (caso comum de rede social fechada): hoje ela avisa que esse
recurso ainda não está montado no template e orienta baixar o vídeo
manualmente enquanto isso não existir. Esta seção é o desenho de referência
pra quando alguém decidir montar essa automação de verdade.

## Promover um projeto pra fora da pasta-mãe

Cada projeto nasce como uma pasta irmã dentro da pasta-mãe do SabinOS. Isso
funciona bem enquanto o projeto é pequeno, mas em algum momento ele pode
crescer o suficiente pra merecer vida própria: ganhou uma equipe, precisa de
um repositório Git só dele, ou acumulou tanto dado que faz sentido separar
de vez.

### O sinal de que chegou a hora

Mais de uma pessoa mexendo na mesma pasta ao mesmo tempo, necessidade de
controlar permissão de acesso por conta própria (um repositório Git
separado), ou o projeto virando, na prática, um negócio à parte.

### Como promover

1. Mover a pasta do projeto pra fora da pasta-mãe, pro lugar onde ela vai
   morar de forma definitiva.
2. Abrir essa pasta como workspace independente no VS Code, e não mais como
   pasta dentro da pasta-mãe.
3. Criar um repositório Git próprio pra ela (o `/syncar` serve pra isso
   também fora da pasta-mãe) e apontar pro remoto novo, em vez de continuar
   compartilhando o repositório da pasta-mãe.

### O que conferir depois de mover

- **A biblioteca de templates deixa de existir no caminho de sempre.**
  Dentro da pasta-mãe, uma skill nova podia apontar pra
  `../_modelo/templates/skills/` quando precisava de um modelo pronto. Fora
  da pasta-mãe esse caminho não existe mais. Duas saídas: copiar a pasta
  `templates/` pra dentro do projeto promovido (vira uma cópia própria, que
  passa a evoluir sozinha), ou aceitar que dali pra frente toda skill nova
  se escreve do zero.
- **A pasta-mãe perde a linha do `.gitignore`.** A pasta do projeto estava
  listada lá pra não entrar no repositório da pasta-mãe; como ela não mora
  mais ali, essa linha virou lixo e pode ser removida.

## Rota Codex

O kit segue o padrão AGENTS.md, então funciona também com o Codex (a CLI de
agente da OpenAI), não só com o Claude Code. Passo a passo pra quem prefere
o Codex ou quer os dois disponíveis:

1. **Instalar o Codex CLI**, seguindo as instruções oficiais da OpenAI pro
   seu sistema.
2. **Fazer login pela conta ChatGPT** (não precisa de chave de API separada
   pra isso).
3. **Abrir a mesma pasta** do projeto ou da pasta-mãe que já existe. O Codex
   lê o `AGENTS.md` nativamente, sem configuração extra: é o mesmo arquivo
   que o Claude Code usa através do ponteiro `CLAUDE.md`.
4. **Conferir a ponte `.agents/skills`.** O `/setup` e o `/novo-projeto` já
   criam essa junction (apontando pra `.claude/skills`) na hora de montar o
   projeto. Se ela não existir por algum motivo, criar na mão:
   - **Windows:** `cmd /c "if not exist .agents mkdir .agents & mklink /J .agents\skills .claude\skills"`.
   - **Mac/Linux:** `mkdir -p .agents && ln -sfn ../.claude/skills .agents/skills`.
   - Se o link não puder ser criado (permissão, pendrive, pasta de rede), a
     cópia da pasta `.claude/skills` pra `.agents/skills` funciona igual; só
     precisa ser refeita quando nascer skill nova, e o `/mapear`, o
     `/atualizar` e o `/checar` fazem isso sozinhos quando a ponte é cópia.
5. **Backup manual.** O hook de auto-sync (que salva no GitHub sozinho ao
   fim de cada resposta) é recurso só do Claude Code. No Codex, rodar
   `/syncar` na mão ao fim da sessão de trabalho.
6. **Lado global, opcional.** Assim como o Claude Code lê `~/.claude/CLAUDE.md`
   pra te conhecer em qualquer pasta, o Codex lê `~/.codex/AGENTS.md`. Criar
   esse arquivo apontando pro seu arquivo de identidade global (ou com uma
   cópia do conteúdo dele) faz o Codex te reconhecer fora desta pasta-mãe
   também.

## Rota Hermes Agent

O Hermes Agent (Nous Research, código aberto sob licença MIT) é outro programa de
agente, do mesmo tipo do Claude Code e do Codex. Ele aparece aqui por dois motivos
bem diferentes, um barato e um caro.

### O barato: a pasta do projeto já serve pra ele

O Hermes procura skill de projeto em `<pasta>/.hermes/skills/` e em
`<pasta>/.agents/skills/`. A segunda é exatamente a junction que o `/setup` e o
`/novo-projeto` já criam pra ponte do Codex. E o formato de skill é o mesmo
`SKILL.md` com frontmatter do padrão aberto agentskills.io que o Claude Code usa.

Não tem conversão a fazer: quem instalar o Hermes e abrir uma pasta de projeto do
SabinOS tende a enxergar os mesmos comandos. Ressalva honesta: isso vem da
documentação dele, conferida em 2026-09-18, e ainda não foi testado de ponta a
ponta aqui. Quem testar primeiro registra o resultado no `_contexto/licoes.md`.

### O caro: robô agendado e bot de mensagem já montados

O Padrão 2 desta página descreve o robô agendado pra montar na mão, com o
Agendador de Tarefas do Windows ou o cron do Mac. O Hermes já vem com isso de
fábrica: agendador próprio mais um gateway que liga o agente a mais de 30 canais
de mensagem, entre eles Telegram, Discord, Slack, Signal e a API do WhatsApp. É o
caminho mais curto pra "todo domingo à noite chega no meu Telegram o resumo da
semana".

Ele traz também um modelo de segurança em camadas que vale copiar mesmo pra quem
nunca for instalar nada dele: lista de comandos proibidos que nenhum modo
permissivo derruba, bloqueio de escrita em pasta de credencial (`~/.ssh`, `~/.aws`,
`.env`), bloqueio de acesso a endereço de rede interna, e execução dentro de
container isolado.

### O alerta de custo, que é o que decide

**O Hermes não usa a sua assinatura do Claude.** Conferido nas issues do próprio
repositório em 2026-09-18: mesmo quem assina Pro ou Max precisa bancar uma chave
de API por cima do plano. O login por OAuth só funciona no plano Max e só consome
crédito extra comprado à parte, nunca a franquia da assinatura. No Pro não
funciona.

Isso muda a natureza da conta. O SabinOS rodando no Claude Code tem custo fixo, a
assinatura. Rodando no Hermes, passa a ter custo por token, que sobe com o uso e
não avisa antes. Pra um robô que dispara sozinho todo dia, é exatamente o tipo de
coisa que precisa de limite escrito em arquivo de configuração e de alguém olhando
a fatura na primeira semana.

### O sinal de que chegou a hora

Você já tem um robô agendado de leitura rodando há semanas pelo agendador do
sistema, ele funciona, e o incômodo virou "preciso estar no computador pra ver o
resultado". Aí um canal de mensagem compensa. Antes disso, não.

Ordem segura: primeiro o agendador do sistema operacional com aviso no Telegram,
pelo `/agendar` (custo zero, descrito acima), e só depois o Hermes, se o canal de mensagem virar
necessidade de verdade. E nunca com o agente respondendo mensagem de terceiro
sozinho: a regra do gate humano não muda de lugar porque o programa mudou.

## A ordem certa

Básico rodando (skills + conexões) → primeiro robô agendado de LEITURA (relatório semanal) → multiagente quando um pipeline de produção estiver maduro → robô com ação só por último, com freio e histórico.

Pular etapas dessa ordem é a receita clássica de desligar tudo na terceira semana.
