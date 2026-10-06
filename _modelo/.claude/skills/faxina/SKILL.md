---
name: faxina
description: >
  Confere se a memória do projeto está apodrecendo: diário e decisão velhos pra
  arquivar, senha ou CPF fora do .env, arquivo que nenhuma regra cita, decisões
  que brigam entre si, "onde paramos" que não bate com o diário, robô que parou
  de dar sinal, fato do negócio guardado só na memória do assistente e arquivo
  que não está no backup. Só relata; mexe com o sim. Use quando o usuário chamar
  /faxina, disser "faz uma faxina", "o que está velho aqui", "confere se a
  memória está em dia", "audita o projeto", ou uma vez por mês.
---

# /faxina, a memória em dia

O `/checar` confere se o sistema está ligado (backup, chaves, ponte). A faxina
confere se o que ele guarda ainda presta. Roda quando a pessoa pede, de
preferência uma vez por mês, e termina num relatório curto em frases. Nada se
apaga e nada se muda sem o sim: arquivar é mover pra pasta de arquivo, e o resto
é aviso com a correção pronta.

Os nomes abaixo ("o diário", "as decisões", "os recados", "o inventário de
automações") são os do Mapa do `AGENTS.md` do projeto: ler o Mapa e a Tabela de
destinos antes de começar, porque são a régua de tudo.

## Passo 1, o levantamento mecânico

Da raiz do projeto:

```bash
node .claude/skills/faxina/scripts/faxina.mjs
```

Sai um JSON. Ele só lê; não mexe em nada. (`relatorio` como primeira palavra dá o
mesmo; `--hoje AAAA-MM-DD` troca a data de referência, pra conferir um dia
passado; palavra desconhecida sai com erro 3 e não roda nada.) O que cada parte quer dizer:

- `arquivar.diarios`: dia do diário com mais de 90 dias, com o destino.
- `arquivar.decisoes`: decisão com mais de 90 dias que uma mais nova já
  substituiu (`substitui:` com a data dela). Decisão que ainda vale fica onde
  está, por mais velha que seja.
- `arquivar.ambiguas`: data substituída que tem mais de uma decisão naquele dia,
  quando o `substitui:` não cita o começo da velha entre aspas (o formato do
  `decisoes.md`, que separa as duas). Nunca arquivar sozinho: perguntar qual das
  duas saiu de cena, e sugerir completar o `substitui:` com o trecho.
- `arquivar.recadosVelhos`: recado com mais de 30 dias na pasta de recados. Só
  avisar: quem trata é a pessoa (tratou, apaga).
- `segredos`: arquivo e linha com cara de chave, token, senha ou CPF fora do
  `.env`, inclusive dentro do `.env.example` (ele sobe pro GitHub, e é onde chave
  de verdade costuma ficar esquecida). A lista de cara de chave é a mesma do backup
  automático (OpenAI, GitHub, AWS, Meta, Instagram, Google, Telegram, Mercado Livre
  e outros, mais sequência longa logo depois de "token", "chave" ou "senha"). CPF
  só é pego no formato com pontos e traço (`000.000.000-00`). O valor nunca
  aparece no relatório, e não deve aparecer no chat. Ficam fora da varredura, de
  propósito: `.env`, arquivo de teste (`.test.mjs`) e as pastas `node_modules`,
  `.venv`, `.agents` e `chrome-perfil`.
- `naoVarridos`: arquivo que a varredura de segredo não leu (acima de 2 MB ou
  binário, como planilha e PDF). Se é de texto e sobe pro backup (export em `.csv`
  ou `.txt`), pedir que a pessoa confirme que não tem senha nem CPF dentro.
- `orfaos`: arquivo ou pasta que o Mapa, a Tabela de destinos e a Estrutura de pastas do `AGENTS.md` não citam (projeto antigo, sem essas seções, conta o texto inteiro). O que o `SKILL.md` de outra skill instalada cita pelo caminho, entre crases, já não entra: é contexto ou pasta de trabalho de um pacote.
- `automacoes.semSinal`: rotina do inventário que não deixou sinal (diário,
  recado ou rodada no livro dos robôs) nos últimos 30 dias.
  `automacoes.robosSemRegistro`: robô que rodou e não está no inventário.
  `automacoes.origensSemRegistro`: nome que assinou diário e não está
  no inventário nem na linha "Equipe e máquinas" do `ferramentas.md`; pode ser
  uma máquina da equipe que falta nessa linha ou uma rotina que ninguém registrou.
  `automacoes.recadosSemRegistro`: recado de quem não está no inventário nem
  nessa linha (rotina esquecida de registrar).
- `backup.arquivos`: arquivo do aluno que o `.gitignore` deixa fora do backup,
  tirando o que fica fora de propósito (`.env`, `.origem`, `node_modules/` e
  parecidos). `backup.semGit`: o projeto nem tem backup ligado.
- `backup.pastas`: pasta com mais de três arquivos fora do backup, numa linha só
  com a contagem; no relatório, citar a pasta, nunca os arquivos um por um.
- `memoriaDoAgente`: arquivos que o Claude Code guardou na memória dele sobre
  este projeto (só existe no Claude Code; no Codex fica vazio).
- `diarioRende`: o diário anda virando memória de verdade? Conta as entradas do
  diário dos últimos 30 dias e quantas vezes, no mesmo período, o backup guardou
  mudança no `_contexto/`, nas decisões ou num `andamento.md`. Com `alerta`
  (10 entradas ou mais e mais de 10 entradas pra cada mudança), dizer em "Só
  avisando": "o diário anda cheio e quase nada vira contexto ou decisão; vale um
  /atualizar". `semGit`: sem backup ligado não dá pra contar; dizer isso numa
  linha.
- `frescor.parados`: regra ou contexto (`AGENTS.md`, `empresa.md`,
  `estrategia.md`, `preferencias.md`) que ninguém mexe há mais de 60 dias,
  enquanto o diário teve entrada nas últimas duas semanas. Frase: "o
  `estrategia.md` está parado há N dias enquanto o trabalho segue; confere se
  ainda vale". Sem backup ligado (`semGit`), pula.
- `ferramentasSemRegistro`: ferramenta ligada que o `_contexto/ferramentas.md`
  não cita. `mcp` são as conexões do `.mcp.json`; `env` são os nomes das chaves
  do `.env` (só o nome; o valor nunca aparece no relatório). Propor uma linha no
  `ferramentas.md` pra cada uma, dizendo o que ela faz. Sem `ferramentas.md`,
  vem vazio.
- `ultimosDiarios`: os três arquivos mais recentes do diário, pra conferir o
  "onde paramos".
- `ilegiveis`: arquivo que não deu pra ler (aberto em outro programa, por exemplo). Ficou fora da varredura de segredo: dizer qual é e pedir pra fechar o programa e rodar de novo.

## Passo 2, o que pede leitura

Esses o script não resolve; ler e julgar:

1. **Decisões que brigam.** Ler as decisões inteiras. Duas entradas que dizem
   coisas opostas sobre o mesmo assunto, sem uma dizer `substitui:` da outra,
   viram pergunta: "a de [data] substitui a de [data]?". Com o sim, a correção é
   uma entrada nova datada que diz `substitui:`, nunca editar as antigas.
2. **"Onde paramos" contra o diário.** Ler o `agora.md` e os três dias de
   `ultimosDiarios`. Pendência que o diário diz que foi feita, ou foco que o
   diário mostra que mudou: apontar e propor a linha corrigida.
3. **Memória do assistente.** Se `memoriaDoAgente` veio, ler cada arquivo. O que
   for fato do negócio (cliente, preço, combinado, preferência de trabalho) devia
   morar no projeto, onde o backup guarda e outro assistente acha: propor a linha
   e o destino pela Tabela de destinos. O que for só jeito da máquina fica lá.
   Nunca copiar sozinho.
4. **Robô sem sinal.** Pra cada nome de `automacoes.semSinal`, a coluna "como
   saber se quebrou" do inventário diz onde olhar. Dizer isso na frase.
5. **Fora do backup.** Vídeo e áudio ficam fora de propósito (são pesados e
   derrubam o backup); dizer onde guardar (Google Drive ou disco externo). Outro
   tipo de arquivo (planilha de outro programa, arquivo de design): oferecer
   liberar a extensão no `.gitignore`, avisando que arquivo acima de 100 MB o
   GitHub recusa.

## Passo 3, o relatório

Frases curtas, em três grupos, e só aparece o que achou algo. Sistema em dia
rende duas linhas, e está ótimo.

> **Faxina de outubro.**
>
> **Precisa de você:** o `agora.md` diz que a proposta da Bia está pendente, mas
> o diário de sexta diz que foi enviada; corrijo? · duas decisões sobre prazo de
> entrega se contradizem (2 dias, em março, e 5 dias, em agosto); a de agosto
> substitui a de março? · o `clientes.md` tem um CPF na linha 4; o lugar dele é
> o `.env` ou fora do sistema.
>
> **Posso arquivar:** 14 dias de diário de antes de julho e 1 decisão
> substituída. Arquivo?
>
> **Só avisando:** o robô `estoque` não deu sinal há 30 dias (o inventário diz
> pra olhar os recados dele) · o `video-loja.mp4` não está no backup, de
> propósito; guarde uma cópia no Drive.

## Passo 4, aplicar o que teve sim

Todo pedido de sim desta skill segue o gatilho da `/segunda-opiniao` (dose rápida).

Um item por vez, ou tudo de uma vez se a pessoa disser "aplica tudo":

- Arquivar: `node .claude/skills/faxina/scripts/faxina.mjs arquivar --sim`.
  Move os dias de diário e as decisões substituídas da lista (a decisão sai das
  decisões e vai pro `decisoes-substituidas.md` do ano). A saída diz o que moveu
  (`movidos`, `decisoes`). Arquivo que já existia no destino fica onde estava e
  aparece em `pulados`: avisar.
- Decisão que briga: entrada nova nas decisões, datada de hoje e assinada, com
  `substitui:` e o motivo.
  A decisão antiga que ela substitui entra na lista de arquivar da próxima
  faxina; não precisa de outro sim agora.
- Segredo: mostrar arquivo e linha, explicar que o lugar de chave e senha é o
  `.env` (que nunca sobe pro GitHub) e oferecer mover; CPF de cliente sai do
  sistema ou vai pra um arquivo que a pessoa decidir. Se o arquivo já subiu pro
  GitHub, avisar que tirar daqui não apaga o histórico: a chave tem que ser
  trocada no serviço.
- Órfão: perguntar se entra na Estrutura de pastas (uma linha no `AGENTS.md`)
  ou vai pro `_contexto/arquivo/`. Pasta de robô, de site ou de sistema nunca
  vai pro arquivo sem a pessoa confirmar que não usa mais. Arquivo citado por
  skill instalada (`grep -rl "<caminho>" .claude/skills/` acha) nunca recebe a
  oferta de arquivar: a skill para de achar o que procura.
- Fato trazido da memória do assistente ou correção do `agora.md`: gravar a
  linha mostrada, no destino que a Tabela de destinos dá, sem reformatar o
  arquivo. O fato trazido continua também na memória do assistente: dizer isso e
  oferecer apagar de lá, só com o sim.
- Extensão liberada no `.gitignore`: uma linha `!*.<extensão>` no fim, com o
  aviso dos 100 MB.

No fim, sempre, uma linha no diário de hoje, no formato que o `AGENTS.md` manda,
com a palavra `/faxina` e o que ela aplicou ("`/faxina` rodou, nada a aplicar"
quando não mexeu em nada): é por essa linha que o `/iniciar` sabe que a faxina do
mês foi feita. O diário
do dia é `_memoria/diario/AAAA-MM-DD.md` (com `-<origem>` no fim do nome quando
o `.origem` desta máquina não é `dono`); se ainda não existe, criar com o título
`# AAAA-MM-DD`.

## Regras

- Nunca apagar. Arquivar é mover, com a lista mostrada antes.
- Nunca mudar decisão antiga: decisão nova com `substitui:`.
- Valor de segredo nunca no chat, nem no relatório.
- Nada aplicado sem o sim daquele item (ou o "aplica tudo").
- Relatório curto: o que não achou nada não aparece.
