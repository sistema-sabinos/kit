# Detalhe das regras

> Arquivo do kit: o `/atualizar-sabinos` traz a versão nova. A regra mora no `AGENTS.md`; aqui fica o formato e o detalhe que ela não precisa carregar em toda conversa. O `AGENTS.md` manda ler este arquivo antes de escrever diário, decisão, recado, rotina ou skill.

## Diário e decisão

Diário: `- HH:MM, <o que foi feito> (<arquivo>)`; origem diferente de `dono` escreve em `AAAA-MM-DD-<origem>.md`; o arquivo do dia, se não existir, nasce com `# AAAA-MM-DD` na primeira linha, e data e hora são as locais. Decisão: `- AAAA-MM-DD, <origem>: <decisão>. Por quê: <motivo>.`; mudar uma velha é linha nova terminando em `substitui: AAAA-MM-DD "<começo da velha>"`; decisão de projeto: `- AAAA-MM-DD, <origem>, [projeto] <pasta>: <decisão>. Por quê: <motivo>.`, com `<pasta>` sendo o último pedaço do caminho (`clientes/doceria-da-bia` vira `doceria-da-bia`). Os dois só recebem acréscimo.

## Tabela de destinos, por extenso

Aconteceu X, escreve em Y. Diário, `licoes.md`, decisão e fato do negócio vão na hora (sessão que cai antes do fim não perde o que se decidiu); o resto o `/atualizar` passa pela tabela no fim. Instrução permanente ("sempre que", "prefiro assim") é a exceção ao "no fim": perguntar; com o sim, gravar na hora. Sempre linha nova, sem reformatar o arquivo, mostrando o que entrou. Data sempre absoluta (AAAA-MM-DD, nunca "semana passada"). Pasta que falta se cria antes de salvar; pasta que nasce vazia leva `.gitkeep`.

## Rotinas

Rotina é o que roda sem gente na frente: robô do `/agendar`, Hermes, agente agendado. Lê muito e escreve pouco: só no próprio diário, nos recados e nos arquivos que ela mesma criou. Mudança em `_contexto/`, em decisão ou em arquivo de trabalho que ela não criou vira recado, nunca edição; entregável novo (rascunho, relatório) ela cria direto e avisa por recado. Sessão sem gente na frente nunca grava sozinha em `_contexto/`, nas decisões nem na memória automática do assistente. Recado é um arquivo, `AAAA-MM-DD-<origem>-<assunto>.md`, começando com `de:`, `quando:` e `precisa de ação: sim/não`; tratou, apaga (ou leva pro diário, se vale registro). O recado é a única coisa de `_memoria/` que se apaga; o resto lá só recebe acréscimo, e a `/faxina` move diário e decisão substituída com mais de 90 dias pra `_memoria/arquivo/`, com o sim da pessoa (mover não é apagar). Robô do `/agendar` assina `robo-<nome>`; outra rotina assina o nome curto dela na linha do `automacoes.md`. Toda rotina ligada tem linha em `automacoes.md`.

## Regras por extenso

O `AGENTS.md` traz estas regras na forma curta; aqui fica o texto inteiro, com o porquê.

**1. Economia de conversa.** Processo fechado, conversa nova: conversa longa reprocessa todo o histórico a cada resposta (imagem custa mais). Ao fechar um processo, avisar "esse processo fechou, pra economizar começa o próximo numa conversa nova". Print: pedir só o recorte que importa. Assunto que continua em outra conversa: oferecer o `/bastao`, que salva o ponto exato.

**2. Verificação ao vivo.** Dado que muda com o tempo (preço, taxa, comissão, regra de plataforma, limite de API, versão de ferramenta) se confere na internet antes de afirmar. Nunca de memória: memória de treino envelhece e erra com confiança.

**3. Loop de lições.** Erro corrigido, retrabalho ou regra que mudou numa tarefa vira uma linha datada em `_contexto/licoes.md`, na seção do assunto, na hora e sem pedir. Antes de repetir tarefa que já deu errado, ler a seção dela. Lição repetida vira regra dentro da skill: quem propõe é o `/atualizar`, ao fechar a sessão.

**9. Nunca chumbar nome de modelo de IA em código.** Modelo some sem aviso e derruba a automação: descobrir o disponível na API do provedor e escolher na hora.

**10. Pesquisa mundial.** Pesquisa na internet busca em qualquer idioma, principalmente inglês; só português limita ao conhecimento nacional. A entrega sai em português (ou no idioma do preferencias.md).

**12. Trava de comando destrutivo.** Um hook barra comando que apaga pasta inteira, reescreve histórico do Git ou roda script baixado da internet. Barrou: parar e explicar ao usuário o que se tentou fazer, nunca procurar outro caminho pra fazer a mesma coisa.

**13. Um projeto por pasta.** Pedido de outro projeto, sem relação com este negócio (outro negócio, finanças pessoais, mentor de curso de outro assunto), ganha pasta própria, senão a memória e as regras dos dois se misturam. Recomendar em uma linha, com esse porquê, e, com o sim, criar a pasta pela skill `../.claude/skills/novo-projeto/SKILL.md` da pasta-mãe. No fim, avisar: "Abra a pasta nova no VS Code (Arquivo > Abrir Pasta) e comece um chat novo lá." Tarefa do mesmo negócio fica aqui.

## Codex

O `AGENTS.md` é o arquivo de regra dos dois agentes. Vale pro Claude Code e pro Codex, e a ponte `.agents/skills` serve aos dois e ao Hermes Agent. No Codex não rodam o auto-sync nem a trava da regra 12: backup manual com `/syncar` no fim da sessão.

## Criação de skills

Seguir o `/mapear`: primeiro template em `../_modelo/templates/skills/`, depois skill pronta do `catalogo.md` de lá e o find-skills (português e inglês), sempre adaptando e nunca instalando às cegas; do zero, delegar pra `skill-creator` e revisar. Mostrar o plano antes de criar. Calibrar com `_contexto/empresa.md` e `preferencias.md`, e com a voz da marca se a skill escreve pro cliente (ramo regulado: nenhum exemplo contradiz a restrição). Arquivos de apoio na pasta da skill. Pergunta ao usuário no formato de 4 partes: a pergunta simples, por que pergunta, 2 ou 3 exemplos de resposta boa, e repergunta se vier vaga. Skill que gasta ou publica nasce com gate humano. Testar com um caso real antes de dar por pronta.
