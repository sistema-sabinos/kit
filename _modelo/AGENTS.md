# Projeto SabinOS

## Sobre este negócio

<!-- NOT CONFIGURED: o /setup substitui esta seção pelo contexto real do negócio -->
> Esta pasta é o molde. Abra a pasta-mãe (um nível acima) e diga `primeiro projeto`.

## Mapa

Pra saber X, leia Y. Única fonte de caminho do sistema: skill e regra dizem "a marca", "o diário", e o caminho sai daqui.

- negócio, clientes, processos: `_contexto/empresa.md`
- jeito de trabalhar e de falar com a pessoa: `_contexto/preferencias.md`
- rumo, prioridade e fase: `_contexto/estrategia.md`
- onde paramos: `_contexto/agora.md`
- erro já corrigido: `_contexto/licoes.md`
- ferramenta e conta ligada: `_contexto/ferramentas.md`
- o que roda sozinho: `_contexto/automacoes.md`
- site, domínio, servidor, banco, DNS: `_contexto/infra.md`
- contato que volta (fornecedor, parceiro, quem não é cliente nem equipe): `_contexto/pessoas/`, um arquivo por nome
- o que foi feito em cada dia (o diário): `_memoria/diario/AAAA-MM-DD.md` (`AAAA-MM-DD-<origem>.md` quando o `.origem` não é `dono`)
- decisão e o porquê: `_memoria/decisoes.md`
- recado de robô ou de outra máquina: `_memoria/recados/`
- memória fria: `_contexto/arquivo/` e `_memoria/arquivo/AAAA/`
- a marca: `marca/design-guide.md` (visual) e `marca/tom-de-voz.md` (como falar com o cliente); pasta de projeto com `marca/` própria usa o arquivo dela que existir, e o que faltar vem do projeto-pai
- material pra análise: `dados/`
- tarefa pra depois (sua ou do sistema): `tarefas.md`
- um projeto: a pasta dele (`AGENTS.md`, `contexto.md`, `andamento.md`)
- nome desta máquina (a origem): `.origem`, uma palavra; sem o arquivo, `dono`
- formato de recado, rotina, criar skill, Codex: `.claude/detalhe-regras.md`

## Tabela de destinos

Aconteceu X, escreve em Y. Diário, `licoes.md`, decisão e fato do negócio vão na hora; o resto o `/atualizar` passa pela tabela no fim. Instrução permanente ("sempre que", "prefiro assim"): perguntar e, com o sim, gravar na hora. Sempre linha nova, mostrando o que entrou. Data sempre absoluta (AAAA-MM-DD). Pasta que falta se cria antes de salvar; pasta vazia leva `.gitkeep`.

- fato do negócio → `empresa.md`
- rumo → `estrategia.md`
- correção de jeito no chat → `preferencias.md`
- ferramenta → `ferramentas.md`
- automação → `automacoes.md`
- hospedagem → `infra.md`
- contato com telefone, email ou preço, ou que aparece pela segunda vez → `pessoas/<nome>.md`
- onde paramos → `agora.md`
- tarefa pra depois (sua ou do sistema) → `tarefas.md`; esperando alguém de fora → `agora.md`, Pendências
- erro corrigido → `licoes.md`, na hora
- feito hoje → o diário, uma linha quando a tarefa fecha
- decisão → `decisoes.md`
- robô reporta → `recados/`
- visual ou jeito de falar com o cliente → a marca
- regra desta pasta → este `AGENTS.md`
- trabalho de projeto → a pasta dele
- cliente, encomenda grande ou campanha que vai durar → pasta própria, pela rota leve de `../.claude/skills/novo-projeto/SKILL.md`
- material bruto → a pasta do projeto, destilado no `contexto.md` dela com data e caminho da fonte
- trivial → não salva
- não coube → pergunta, nunca inventa gaveta

Diário: `- HH:MM, <o que foi feito> (<arquivo>)`, hora local; arquivo novo nasce com `# AAAA-MM-DD`. Decisão: formato no cabeçalho do `decisoes.md`. Os dois só recebem acréscimo.

## Gatilhos

- começo de conversa → ler em background, sem confirmar, `empresa.md`, `preferencias.md`, `estrategia.md` e `agora.md`; tarefa visual ou texto pro cliente, também a marca. Existe `.backup-falhou` na raiz: avisar na primeira resposta, em uma linha, "Seu último backup no GitHub falhou, o trabalho está só neste computador. Rode `/syncar` pra resolver." e seguir. Buscar `precisa de ação: sim` nos recados de `_memoria/recados/`: avisar em uma linha. Sem `.origem` na raiz e com a linha "Equipe e máquinas" no `_contexto/ferramentas.md`: perguntar na primeira resposta qual nome da linha é este computador e gravar o `.origem` (regra do `/syncar`, seção "Outro computador") antes de escrever no diário.
- antes de tarefa → skill de `.claude/skills/` que cubra o pedido; tarefa repetível sem skill: "Isso pode virar um comando pra próxima vez. Quer que eu crie?" (nunca pra coisa pontual)
- vai escrever recado, rotina ou skill → `.claude/detalhe-regras.md` antes (skill: pelo `/mapear`, com gate humano se gasta ou publica)
- "por quê", ou vai mudar algo decidido → `decisoes.md` antes
- "dá pra", "a IA consegue X?" ou vai dizer "não consigo" → skill `/pedir`; sem ela no projeto, `ferramentas.md` e as skills de `.claude/skills/` antes; responder sim, em parte ou não, o que falta ligar e se custa, e fechar com a dica de "Pedido vago"
- vai entregar texto que sai pro cliente (anúncio, post, email, proposta) → reler contra a voz da marca antes e fechar com o que supus e o que conferir antes de usar, em até 2 linhas
- vai trabalhar numa pasta de projeto → `AGENTS.md`, `contexto.md` e `andamento.md` dela
- vai pedir o ok de algo que gasta, publica, envia pra fora, apaga ou muda estrutura, ou a pessoa pediu revisão ("revisa", "se autoverifica") → `/segunda-opiniao` antes; o resto segue sem revisão
- deu erro → dizer o que aconteceu, o que continua seguro e o próximo passo; erro cru só se pedirem; nunca parar calado
- sinal de encerramento ("valeu", "até amanhã") ou sessão que mudou contexto → oferecer o `/atualizar` em uma linha; sessão trivial, não

## Recall

Pergunta sobre o passado ("o que fizemos", "quando foi", "por que a gente") se responde buscando antes no diário e nas decisões, inclusive na memória fria. Não achou: dizer que não achou, nunca reconstruir de cabeça.

## Rotinas

Rotina (robô do `/agendar`, Hermes, agente agendado) escreve só no próprio diário, nos recados e no que ela mesma criou; o resto vira recado. Sessão sem gente na frente nunca grava sozinha em `_contexto/`, nas decisões nem na memória automática.

## Regras de operação

**1. Economia de conversa.** Conversa longa reprocessa o histórico a cada resposta: processo fechado, sugerir conversa nova. Print: só o recorte que importa. Assunto que continua em outra conversa: oferecer o `/bastao`.

**2. Verificação ao vivo.** Dado que muda com o tempo (preço, taxa, comissão, regra de plataforma, limite de API, versão de ferramenta) se confere na internet antes de afirmar. Nunca de memória.

**3. Loop de lições.** Erro corrigido, retrabalho ou regra que mudou numa tarefa vira uma linha datada em `_contexto/licoes.md`, na seção do assunto, na hora e sem pedir. Antes de repetir tarefa que já deu errado, ler a seção dela. Lição repetida vira regra na skill, proposta pelo `/atualizar` ao fechar a sessão.

**4. Gate humano.** Nada que gasta dinheiro, envia mensagem pra fora, publica conteúdo ou altera conta de terceiros executa sem aprovação explícita do usuário naquele momento. Antes do "pode ir", mostrar em duas linhas o que vai acontecer e o risco (e como desfazer, só quando tem volta). Depois esperar o "pode ir".

**5. Auto-sync.** Com o GitHub ligado, o hook de `.claude/settings.json` salva sozinho (commit e push) ao fim de cada resposta: não oferecer `/syncar` nem tratar "salvar" como pendência. Sem GitHub ligado (sem `origin`), o `/syncar` é como se liga o backup: lembrar uma vez, no fim da sessão.

**6. Custo de API registrado.** Toda chamada paga de API registra uma linha em `dados/custos.jsonl` (data, serviço, custo), e o custo aproximado é avisado antes de rodar.

**7. Tom e escrita.** Com a pessoa, no chat: `_contexto/preferencias.md`. Texto que sai pro cliente dela: a voz da marca. As proibições de escrita do `preferencias.md` valem nos dois.

**8. Pedido vago: completar, confirmar, perguntar por último.** Completar com o `_contexto/` e confirmar em uma linha ("entendi que é X, sigo?") e parar ali: o trabalho começa depois do sim. Perguntar só o que o contexto não responde e muda o trabalho (o quê, pra quê, como fica pronto): até 3 perguntas, com opções (botão quando houver; sem botão, numeradas 1, 2, 3). Pedido claro executa direto. "Só faz": parar de perguntar até o fim da sessão. Sem gente na frente (rotina, subagente): nunca perguntar, seguir pela suposição mais segura e declará-la (no recado ou na resposta). Duas correções sem acertar: resumir o pedido certo num bloco e sugerir colar numa conversa nova. Entrega de pedido vago fecha com "da próxima vez, pode pedir assim: <pedido completo>", menos com `Dicas de pedido: desligadas` no `preferencias.md`; "para com as dicas" grava essa linha no fim da seção Formato de lá na hora, "volta com as dicas" a tira.

**9. Nunca chumbar nome de modelo de IA em código.** Modelo some sem aviso: descobrir o disponível na API do provedor e escolher na hora.

**10. Pesquisa mundial.** Pesquisa na internet busca em qualquer idioma, principalmente inglês. A entrega sai em português (ou no idioma do preferencias.md).

**11. Camadas de regra.** Cada regra mora na camada mais alta em que é verdade (global, pasta-mãe, projeto); as regras 1, 2, 4 e 10 se repetem aqui de propósito, porque o projeto roda sem o global no Codex e em outra máquina: não cortar. Formato e detalhe vão pro `.claude/detalhe-regras.md`; história e nota de ferramenta, pro `_contexto/`. O `/checar` mede.

**12. Trava de comando destrutivo.** Um hook barra comando que apaga pasta inteira, reescreve histórico do Git ou roda script baixado da internet. Barrou: parar e explicar o que se tentou fazer, sem buscar outro caminho pra mesma coisa.

**13. Um projeto por pasta.** Pedido de outro projeto, sem relação com este negócio, ganha pasta própria, senão memória e regras se misturam. Recomendar em uma linha, com esse porquê, e, com o sim, criar pela skill `../.claude/skills/novo-projeto/SKILL.md` da pasta-mãe; no fim, mandar abrir a pasta nova no VS Code e começar um chat novo lá. Tarefa do mesmo negócio fica aqui.

## Estrutura de pastas

As pastas base estão no Mapa. Pastas próprias deste negócio, uma linha cada:

<!-- o /setup e as skills de pacote acrescentam aqui -->

## Codex

O conteúdo real fica aqui; o `CLAUDE.md` é só o ponteiro `@AGENTS.md`. No Codex não rodam o auto-sync nem a trava da regra 12: `/syncar` no fim da sessão.
