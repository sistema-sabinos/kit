# Projeto SabinOS

<!-- NOT CONFIGURED: o /setup substitui esta seção pelo contexto real do negócio -->
> Workspace de trabalho com IA. Rode `/setup` pra configurar pro seu negócio.

## Estrutura de pastas

- `_contexto/`, memória do sistema (não apagar): empresa, preferências, estratégia, `agora.md` (onde paramos, pendências), `licoes.md` (erro aprendido), `ferramentas.md` (o que está conectado), `arquivo/` (memória fria, fora da conversa)
- `marca/`, identidade visual (`design-guide.md`, lido antes de tarefa visual)
- `dados/`, arquivos pra análise (planilha, PDF, CSV, print)
- biblioteca de templates na pasta-mãe do SabinOS, em `../_modelo/templates/`; o `/mapear` puxa de lá
- `tarefas.md`, lista de tarefas corrente (criada pelo /setup)

## Compatibilidade com outros agentes

O conteúdo real fica aqui; o `CLAUDE.md` é só o ponteiro `@AGENTS.md`. Vale pro Claude Code e pro Codex, e a ponte `.agents/skills` serve aos dois e ao Hermes Agent. No Codex não rodam o auto-sync nem a trava da regra 12: backup manual com `/syncar` no fim da sessão.

## Início de conversa

Ler em background, sem confirmar: `_contexto/empresa.md`, `_contexto/preferencias.md`, `_contexto/estrategia.md` e `_contexto/agora.md`; em tarefa visual, também `marca/design-guide.md`.

Se existir um arquivo `.backup-falhou` na raiz da pasta, o backup automático não subiu pra nuvem: avisar na primeira resposta, em uma linha, "Seu último backup no GitHub falhou, o trabalho está só neste computador. Rode `/syncar` pra resolver." e seguir a tarefa.

## Fluxo de trabalho

Antes de qualquer tarefa, checar se existe skill em `.claude/skills/` que cubra o pedido e seguir ela. Tarefa claramente repetível sem skill: perguntar "Isso pode virar um comando pra próxima vez. Quer que eu crie?" (nunca pra coisa pontual), checando antes os templates de `../_modelo/templates/skills/`.

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

## Aprender e atualizar contexto

Instrução permanente ("sempre que", "evita", "prefiro assim") ou mudança real no negócio: perguntar se quer salvar, gravar em linha nova sem reformatar o arquivo e mostrar o que entrou. Negócio, clientes e processos vão pro `_contexto/empresa.md`; tom e estilo, pro `preferencias.md`; prioridade e fase, pro `estrategia.md`; onde paramos, pro `agora.md` (quem escreve é o `/atualizar`); erro e correção, pro `licoes.md` (sem perguntar); visual, pro `marca/design-guide.md`; regra desta pasta, pra este `AGENTS.md`.

## Criação de skills

Seguir o `/mapear`: primeiro template em `../_modelo/templates/skills/`, depois skill pronta do `catalogo.md` de lá e o find-skills (português e inglês), sempre adaptando e nunca instalando às cegas; do zero, delegar pra `skill-creator` e revisar. Mostrar o plano antes de criar. Calibrar com `_contexto/empresa.md` e `preferencias.md` (ramo regulado: nenhum exemplo contradiz a restrição). Arquivos de apoio na pasta da skill. Pergunta ao usuário no formato de 4 partes: a pergunta simples, por que pergunta, 2 ou 3 exemplos de resposta boa, e repergunta se vier vaga. Skill que gasta ou publica nasce com gate humano. Testar com um caso real antes de dar por pronta.
