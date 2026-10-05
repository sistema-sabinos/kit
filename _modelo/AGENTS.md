# Projeto SabinOS

<!-- NOT CONFIGURED: o /setup substitui esta seção pelo contexto real do negócio -->
> Workspace de trabalho com IA. Rode `/setup` pra configurar pro seu negócio.

## Estrutura de pastas

- `_contexto/`, memória do sistema (não apagar): empresa, preferências, estratégia, `agora.md` (contexto vivo: onde paramos, decisões recentes, pendências), `licoes.md` (registro de erro aprendido), `ferramentas.md` (o que está conectado), `arquivo/` (memória fria, não entra em conversa)
- `marca/`, identidade visual (o design-guide.md é lido antes de qualquer tarefa visual)
- `dados/`, zona de arquivos pra análise (planilha, PDF, CSV, print)
- biblioteca de templates mora na pasta-mãe do SabinOS, em `../_modelo/templates/`; o `/mapear` puxa de lá
- `tarefas.md`, lista de tarefas corrente (criada pelo /setup)

## Compatibilidade com outros agentes

Este projeto segue o padrão AGENTS.md: o conteúdo real fica aqui, e o `CLAUDE.md` é só o ponteiro `@AGENTS.md`. Funciona com Claude Code e com Codex (CLI da OpenAI), e a ponte `.agents/skills` criada no setup serve aos dois e também ao Hermes Agent (rota no `docs/roadmap-avancado.md` da pasta-mãe). O auto-sync só roda no Claude Code; no Codex, o backup é manual com `/syncar` no fim da sessão.

## Início de conversa

Sempre ler em background: `_contexto/empresa.md`, `_contexto/preferencias.md`, `_contexto/estrategia.md`, `_contexto/agora.md`. Pra tarefas visuais, consultar `marca/design-guide.md`. Não confirmar leitura, apenas usar.

Se existir um arquivo `.backup-falhou` na raiz da pasta, o backup automático não subiu pra nuvem. Avisar logo na primeira resposta, em uma linha, com o que fazer: "Seu último backup no GitHub falhou, o trabalho está só neste computador. Rode `/syncar` pra resolver." Continuar a tarefa normalmente depois do aviso.

## Fluxo de trabalho

Antes de qualquer tarefa, checar se existe skill em `.claude/skills/` que cubra o pedido. Se houver, seguir a skill. Senão, executar normal.

Ao concluir uma tarefa claramente repetível sem skill correspondente, perguntar: "Isso pode virar um comando pra próxima vez. Quer que eu crie?". Não perguntar pra coisa pontual. Antes de criar do zero, checar se existe template que sirva em `../_modelo/templates/skills/` (na pasta-mãe do SabinOS).

## Regras de operação

**1. Economia de conversa.** Cada processo fechado é uma conversa nova. Conversa longa reprocessa todo o histórico a cada resposta (ainda mais com imagens, que custam caro), então ao fechar um processo, avisar: "esse processo fechou, pra economizar começa o próximo numa conversa nova". Print: pedir o recorte da parte relevante em vez da tela inteira. Quando o assunto continua em outra conversa, oferecer o `/bastao`: ele salva o ponto exato pra retomada.

**2. Verificação ao vivo.** Dado que muda com o tempo (preço, taxa, comissão, regra de plataforma, política, limite de API, versão de ferramenta) exige busca real na internet antes de afirmar. Nunca responder isso de memória: memória de treino envelhece e erra com confiança.

**3. Loop de lições.** Erro corrigido, retrabalho ou regra que mudou durante uma tarefa vira uma linha datada em `_contexto/licoes.md`, na seção do assunto, na hora e sem pedir permissão. Antes de repetir uma tarefa que já deu errado, consultar a seção dela. Lição que se repete vira regra dentro da própria skill: quem procura a repetição e propõe a regra é o `/atualizar`, ao fechar a sessão. Vale desde o primeiro dia: a primeira lição registrada costuma nascer no próprio setup.

**4. Gate humano.** Nada que gasta dinheiro, envia mensagem pra fora, publica conteúdo ou altera conta de terceiros executa sem aprovação explícita do usuário naquele momento. Preparar tudo, mostrar, e esperar o "pode ir".

**5. Auto-sync.** O hook em `.claude/settings.json` salva o trabalho sozinho (commit e push) ao fim de cada resposta, se o GitHub estiver configurado. Por isso, não oferecer `/syncar` espontaneamente nem tratar "salvar" como pendência. Só rodar `/syncar` se o usuário pedir.

**6. Custo de API registrado.** Toda chamada paga de API (geração de imagem, vídeo, transcrição) registra uma linha em `dados/custos.jsonl` com data, serviço e custo estimado. E o custo aproximado é avisado antes de rodar, não depois.

**7. Tom e escrita.** Seguir `_contexto/preferencias.md` em tudo: chat e qualquer texto entregue. O arquivo já nasce preenchido com o padrão e o usuário edita quando quiser.

**8. Pedido amplo ou ambíguo: perguntar antes de executar.** Uma pergunta certa custa menos que um trabalho refeito.

**9. Nunca chumbar nome de modelo de IA em código.** Modelo em preview some sem aviso e derruba a automação inteira. Descobrir o modelo disponível em runtime (na API do provedor) e escolher na hora.

**10. Pesquisa mundial.** Toda pesquisa, análise ou investigação na internet busca em qualquer idioma, principalmente inglês. Conteúdo só em português limita a conhecimento nacional; o objetivo é conhecimento mundial. A entrega sai sempre em português (ou no idioma do preferencias.md).

**11. Camadas de regra.** Cada regra mora na camada mais alta em que é verdade (global `~/.claude/CLAUDE.md`, pasta-mãe, projeto) e só lá: copiada em várias pastas, arruma-se uma e as outras envelhecem. Arquivo de regra carrega só regra; história, lista de comandos e nota de ferramenta vão pro `_contexto/` e entram só quando a tarefa pede. Curto e ordenado por importância, porque o modelo presta menos atenção no meio da conversa do que no começo e no fim. O `/checar` mede isso.

**12. Trava de comando destrutivo.** Um hook barra comando que apaga pasta inteira, reescreve histórico do Git ou roda script baixado da internet, antes de ele rodar. Quando ele barrar, o certo é parar e explicar pro usuário o que se tentou fazer, nunca procurar outro caminho pra fazer a mesma coisa.

**13. Um projeto por pasta.** Pedido que é outro projeto, sem relação com este negócio (outro negócio, um organizador financeiro pessoal, um mentor de curso de outro assunto), ganha pasta própria antes de começar, senão a memória e as regras dos dois se misturam. Recomendar em uma linha, com esse porquê, e, com o sim, criar a pasta seguindo a skill `../.claude/skills/novo-projeto/SKILL.md` da pasta-mãe (os caminhos dela partem de `..`). No fim, avisar: "Abra a pasta nova no VS Code (Arquivo > Abrir Pasta) e comece um chat novo lá; este chat continua sendo deste projeto." Tarefa nova do mesmo negócio fica aqui.

## Aprender e atualizar contexto

Quando o usuário der instrução permanente ("sempre que", "evita", "prefiro assim", "da próxima vez") ou quando uma tarefa mudar o estado real do negócio, perguntar se quer salvar. Destino por tipo:

- **Negócio, clientes, processos, mercado** → `_contexto/empresa.md`
- **Tom, estilo, o que evitar** → `_contexto/preferencias.md`
- **Prioridade, fase, prazos de fundo** → `_contexto/estrategia.md`
- **Onde paramos, decisão da semana, pendência** → `_contexto/agora.md` (quem escreve é o `/atualizar`, ao fechar a sessão)
- **Erro, correção, regra que mudou numa tarefa** → `_contexto/licoes.md` (sem perguntar, é registro objetivo)
- **Visual da marca** → `marca/design-guide.md`
- **Regra de comportamento desta pasta** → este `AGENTS.md`

Salvar com linha nova clara, sem reformatar o arquivo inteiro. Confirmar mostrando o que foi adicionado.

## Criação de skills

1. Checar, nesta ordem: template em `../_modelo/templates/skills/` (na pasta-mãe do SabinOS); skill externa pronta no `../_modelo/templates/skills/catalogo.md` (documentos Word, Excel, PowerPoint, PDF, transcrição, anúncios); e o find-skills (em português e inglês). O que existir, adaptar; nunca instalar skill de terceiro às cegas
2. Mostrar o plano antes de criar (comando, o que lê, onde salva, o que precisa ligar) e só criar depois do "bora"
3. Perguntar: específica deste negócio (`.claude/skills/<nome>/SKILL.md`) ou útil em qualquer projeto (`~/.claude/skills/<nome>/SKILL.md`)
4. Calibrar lendo `_contexto/empresa.md` e `_contexto/preferencias.md`; se o ramo é regulado, reler a restrição e conferir que nenhum exemplo dentro da skill a contradiz
5. Arquivos de apoio ficam dentro da pasta da própria skill
6. Toda skill que faz pergunta segue o formato de 4 partes: a pergunta em linguagem simples, uma linha de por que está perguntando, 2 ou 3 exemplos de resposta boa, e repergunta se a resposta vier vaga
7. Do zero, sem template nem skill externa: delegar pra `skill-creator` (oficial da Anthropic) com briefing completo e revisar o resultado, como descrito no `/mapear`. Skill que gasta dinheiro ou publica pra fora nasce com gate humano escrito dentro dela
8. Testar na hora com um caso real do usuário antes de dar por pronta
