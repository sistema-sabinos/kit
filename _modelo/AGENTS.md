# Projeto SabinOS

## Sobre este negócio

<!-- NOT CONFIGURED: o /setup substitui esta seção pelo contexto real do negócio -->
> Workspace de trabalho com IA. Rode `/setup` pra configurar pro seu negócio.

## Mapa

Pra saber X, leia Y. Única fonte de caminho do sistema: skill e regra dizem "a marca", "o diário", e o caminho sai daqui.

- negócio, clientes, processos: `_contexto/empresa.md`
- jeito de trabalhar e de escrever: `_contexto/preferencias.md`
- rumo, prioridade e fase: `_contexto/estrategia.md`
- onde paramos: `_contexto/agora.md`
- erro já corrigido: `_contexto/licoes.md`
- ferramenta e conta ligada: `_contexto/ferramentas.md`
- o que roda sozinho: `_contexto/automacoes.md`
- site, domínio, servidor, banco, DNS: `_contexto/infra.md`
- o que foi feito em cada dia (o diário): `_memoria/diario/AAAA-MM-DD.md`
- decisão e o porquê: `_memoria/decisoes.md`
- recado de robô ou de outra máquina: `_memoria/recados/`
- memória fria: `_contexto/arquivo/` e `_memoria/arquivo/AAAA/`
- a marca: `marca/design-guide.md`
- material pra análise: `dados/`
- pendência pra depois: `tarefas.md`
- um projeto: a pasta dele (`AGENTS.md`, `contexto.md`, `andamento.md`)
- nome desta máquina (a origem): `.origem`, uma palavra; sem o arquivo, `dono`
- templates de skill: `../_modelo/templates/skills/`

## Tabela de destinos

Aconteceu X, escreve em Y. Diário e `licoes.md` vão na hora; o resto o `/atualizar` passa pela tabela no fim. Instrução permanente ("sempre que", "prefiro assim") é a exceção ao "no fim": perguntar; com o sim, gravar na hora. Sempre linha nova, sem reformatar o arquivo, mostrando o que entrou.

- fato do negócio → `empresa.md`
- rumo → `estrategia.md`
- correção de jeito → `preferencias.md`
- ferramenta → `ferramentas.md`
- automação → `automacoes.md`
- hospedagem → `infra.md`
- onde paramos → `agora.md`
- pendência pra depois → `tarefas.md`
- erro corrigido → `licoes.md`, na hora
- feito hoje → o diário, uma linha quando a tarefa fecha
- decisão → `decisoes.md`
- robô reporta → `recados/`
- visual → a marca
- regra desta pasta → este `AGENTS.md`
- trabalho de projeto → a pasta dele
- material bruto → a pasta do projeto, destilado no `contexto.md` dela com data e caminho da fonte
- trivial → não salva
- não coube → pergunta, nunca inventa gaveta

Diário: `- HH:MM, <o que foi feito> (<arquivo>)`; origem diferente de `dono` escreve em `AAAA-MM-DD-<origem>.md`; o arquivo do dia, se não existir, nasce com `# AAAA-MM-DD` na primeira linha, e data e hora são as locais. Decisão: `- AAAA-MM-DD, <origem>: <decisão>. Por quê: <motivo>.`; mudar uma velha é linha nova terminando em `substitui: AAAA-MM-DD "<começo da velha>"`; decisão de projeto: `- AAAA-MM-DD, <origem>, [projeto] <pasta>: <decisão>. Por quê: <motivo>.`, com `<pasta>` sendo o último pedaço do caminho (`clientes/doceria-da-bia` vira `doceria-da-bia`). Os dois só recebem acréscimo.

## Gatilhos

- começo de conversa → ler em background, sem confirmar, `empresa.md`, `preferencias.md`, `estrategia.md` e `agora.md`; tarefa visual, também a marca. Existe `.backup-falhou` na raiz: avisar na primeira resposta, em uma linha, "Seu último backup no GitHub falhou, o trabalho está só neste computador. Rode `/syncar` pra resolver." e seguir. Buscar `precisa de ação: sim` nos recados de `_memoria/recados/`: avisar em uma linha.
- antes de tarefa → skill de `.claude/skills/` que cubra o pedido; tarefa repetível sem skill: "Isso pode virar um comando pra próxima vez. Quer que eu crie?" (nunca pra coisa pontual)
- "por quê", ou vai mudar algo decidido → `decisoes.md` antes
- vai dizer "não consigo" → `ferramentas.md` antes
- vai trabalhar numa pasta de projeto → `AGENTS.md`, `contexto.md` e `andamento.md` dela
- vai pedir o ok da pessoa (plano, mudança, gasto, publicação, qualquer tamanho) → `/segunda-opiniao` antes, sempre
- sinal de encerramento ("valeu", "até amanhã") ou sessão que mudou contexto → oferecer o `/atualizar` em uma linha; sessão trivial, não

## Recall

Pergunta sobre o passado ("o que fizemos", "quando foi", "por que a gente") se responde buscando antes no diário e nas decisões, inclusive na memória fria. Não achou: dizer que não achou, nunca reconstruir de cabeça.

## Rotinas

Rotina é o que roda sem gente na frente: robô do `/agendar`, Hermes, agente agendado. Lê muito e escreve pouco: só no próprio diário, nos recados e nos arquivos que ela mesma criou. Mudança em `_contexto/` ou em decisão vira recado, nunca edição. Recado é um arquivo, `AAAA-MM-DD-<origem>-<assunto>.md`, começando com `de:`, `quando:` e `precisa de ação: sim/não`; tratou, apaga. O recado é a única coisa de `_memoria/` que se apaga; o resto lá só recebe acréscimo, e a `/faxina` move diário e decisão substituída com mais de 90 dias pra `_memoria/arquivo/`, com o sim da pessoa (mover não é apagar). Robô do `/agendar` assina `robo-<nome>`; outra rotina assina o nome curto dela na linha do `automacoes.md`. Toda rotina ligada tem linha em `automacoes.md`.

## Regras de operação

**1. Economia de conversa.** Processo fechado, conversa nova: conversa longa reprocessa todo o histórico a cada resposta (imagem custa mais). Ao fechar um processo, avisar "esse processo fechou, pra economizar começa o próximo numa conversa nova". Print: pedir só o recorte que importa. Assunto que continua em outra conversa: oferecer o `/bastao`, que salva o ponto exato.

**2. Verificação ao vivo.** Dado que muda com o tempo (preço, taxa, comissão, regra de plataforma, limite de API, versão de ferramenta) se confere na internet antes de afirmar. Nunca de memória: memória de treino envelhece e erra com confiança.

**3. Loop de lições.** Erro corrigido, retrabalho ou regra que mudou numa tarefa vira uma linha datada em `_contexto/licoes.md`, na seção do assunto, na hora e sem pedir. Antes de repetir tarefa que já deu errado, ler a seção dela. Lição repetida vira regra dentro da skill: quem propõe é o `/atualizar`, ao fechar a sessão.

**4. Gate humano.** Nada que gasta dinheiro, envia mensagem pra fora, publica conteúdo ou altera conta de terceiros executa sem aprovação explícita do usuário naquele momento. Preparar, mostrar e esperar o "pode ir".

**5. Auto-sync.** O hook de `.claude/settings.json` salva sozinho (commit e push) ao fim de cada resposta, se o GitHub estiver configurado. Não oferecer `/syncar` nem tratar "salvar" como pendência; só rodar se o usuário pedir.

**6. Custo de API registrado.** Toda chamada paga de API registra uma linha em `dados/custos.jsonl` (data, serviço, custo), e o custo aproximado é avisado antes de rodar.

**7. Tom e escrita.** Seguir `_contexto/preferencias.md` em tudo: chat e qualquer texto entregue.

**8. Pedido amplo ou ambíguo: perguntar antes de executar.** Uma pergunta certa custa menos que um trabalho refeito.

**9. Nunca chumbar nome de modelo de IA em código.** Modelo some sem aviso e derruba a automação: descobrir o disponível na API do provedor e escolher na hora.

**10. Pesquisa mundial.** Pesquisa na internet busca em qualquer idioma, principalmente inglês; só português limita ao conhecimento nacional. A entrega sai em português (ou no idioma do preferencias.md).

**11. Camadas de regra.** Cada regra mora na camada mais alta em que é verdade (global `~/.claude/CLAUDE.md`, pasta-mãe, projeto) e só lá. Arquivo de regra carrega só regra, curto e por ordem de importância; história, lista de comandos e nota de ferramenta vão pro `_contexto/`. O `/checar` mede.

**12. Trava de comando destrutivo.** Um hook barra comando que apaga pasta inteira, reescreve histórico do Git ou roda script baixado da internet. Barrou: parar e explicar ao usuário o que se tentou fazer, nunca procurar outro caminho pra fazer a mesma coisa.

**13. Um projeto por pasta.** Pedido de outro projeto, sem relação com este negócio (outro negócio, finanças pessoais, mentor de curso de outro assunto), ganha pasta própria, senão a memória e as regras dos dois se misturam. Recomendar em uma linha, com esse porquê, e, com o sim, criar a pasta pela skill `../.claude/skills/novo-projeto/SKILL.md` da pasta-mãe. No fim, avisar: "Abra a pasta nova no VS Code (Arquivo > Abrir Pasta) e comece um chat novo lá." Tarefa do mesmo negócio fica aqui.

## Estrutura de pastas

As pastas base estão no Mapa. Pastas próprias deste negócio, uma linha cada:

<!-- o /setup e as skills de pacote acrescentam aqui -->

## Compatibilidade com outros agentes

O conteúdo real fica aqui; o `CLAUDE.md` é só o ponteiro `@AGENTS.md`. Vale pro Claude Code e pro Codex, e a ponte `.agents/skills` serve aos dois e ao Hermes Agent. No Codex não rodam o auto-sync nem a trava da regra 12: backup manual com `/syncar` no fim da sessão.

## Criação de skills

Seguir o `/mapear`: primeiro template em `../_modelo/templates/skills/`, depois skill pronta do `catalogo.md` de lá e o find-skills (português e inglês), sempre adaptando e nunca instalando às cegas; do zero, delegar pra `skill-creator` e revisar. Mostrar o plano antes de criar. Calibrar com `_contexto/empresa.md` e `preferencias.md` (ramo regulado: nenhum exemplo contradiz a restrição). Arquivos de apoio na pasta da skill. Pergunta ao usuário no formato de 4 partes: a pergunta simples, por que pergunta, 2 ou 3 exemplos de resposta boa, e repergunta se vier vaga. Skill que gasta ou publica nasce com gate humano. Testar com um caso real antes de dar por pronta.
