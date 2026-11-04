---
name: agendar
description: >
  Monta um robô que roda sozinho no horário marcado, confere algo do negócio e
  avisa só quando tem problema (no Telegram ou, sem ele, num recado no projeto),
  e também gasta, publica ou responde cliente quando a tarefa pedir.
  Use quando o usuário chamar /agendar,
  disser "todo dia às 8h confere...", "roda isso sozinho", "me avisa no celular
  quando...", "quais robôs eu tenho" ou "tira o robô X". Na hora de agendar,
  mostra o que o robô executa e quanto gasta por rodada e por mês; o "pode ir"
  dali vale pra toda execução.
---

# /agendar, o robô que trabalha sozinho

Um robô é um arquivo pequeno em `robos/<nome>.mjs` (a receita) que o computador
roda sozinho no horário marcado. O motor desta skill cuida do resto: espera o
computador terminar de ligar, não roda duas vezes no mesmo dia, confere o acesso
antes, anota cada rodada em `robos/execucoes.jsonl` e avisa só quando tem
problema: no Telegram, se estiver ligado, ou num recado em `_memoria/recados/`, que o
`/iniciar` mostra quando a pessoa abre o projeto. Silêncio quer dizer que deu tudo certo.

Funciona no Windows e no Mac, com o computador ligado e a sessão do usuário
aberta. No Windows, computador desligado ou dormindo na hora marcada: roda
assim que ligar, uma vez só. No Mac, isso só vale se ele estava dormindo;
desligado na hora, a rodada daquele dia se perde.

## Regra que não muda: o "pode ir" se dá na hora de agendar

O robô confere, compara, calcula e avisa, e também pode gastar, publicar, mudar
preço, responder cliente ou mexer em conta, quando a tarefa pedir. O gate humano
fica num ponto só, antes de agendar: mostrar em poucas linhas o que o robô
executa em cada rodada (o que lê, o que gasta, o que publica ou responde, e
onde) e quanto ele gasta por rodada e por mês, em dólar e em real, e esperar o
"pode ir". Esse "pode ir" vale pra toda execução do robô: ele roda com você
longe, e cada rodada já está coberta pelo sim que você deu ali. Mudou o que ele
faz ou quanto gasta: mostrar de novo e esperar um "pode ir" novo antes de
agendar a receita nova. O gasto do robô passa pela trava do gasto do projeto, e
o orçamento do mês, quando existe, segue parando o robô que passar dele.

## Primeira vez: o bot do Telegram

Rodar `node .claude/skills/conectar/scripts/chave.mjs tem TELEGRAM_TOKEN TELEGRAM_CHAT_ID`; com
os dois `tem`, pular esta seção. O valor nunca aparece no chat: o script responde só `tem` ou `falta`.

Sem Telegram por enquanto (a pessoa não quer ou não pode agora): seguir pra
"Montar um robô" assim mesmo. O aviso que não sai pelo Telegram vira um recado em
`_memoria/recados/`, e o `/iniciar` mostra na próxima sessão. Dizer isso em uma
frase ("sem o Telegram, o robô te avisa quando você abrir o projeto; dá pra ligar
o Telegram depois") e anotar no `tarefas.md` "ligar o Telegram do robô".

1. Explicar: "O robô te avisa por um bot seu no Telegram. É grátis e leva uns
   5 minutos."
2. Guiar: no Telegram, procurar `@BotFather` (com o selo azul de verificado),
   mandar `/newbot`, escolher um nome e um usuário terminado em `bot`. Ele
   responde com um token, uma sequência longa com dois-pontos no meio.
3. Pedir pra colar o token no `.env` do projeto, numa linha
   `TELEGRAM_TOKEN=<o token>`, e salvar. Não pedir o token no chat: ele é a
   chave do bot.
4. Pedir pra abrir a conversa com o bot novo no Telegram e mandar "oi".
5. Rodar `node .claude/skills/agendar/scripts/avisar.mjs --descobrir-chat`.
   Uma conversa só: gravar com
   `node .claude/skills/agendar/scripts/avisar.mjs --gravar-chat <id>`. Mais de
   uma: mostrar os nomes e perguntar qual é a dele. Nenhuma: o "oi" ainda não
   chegou; pedir pra mandar de novo e rodar outra vez.
6. Rodar `node .claude/skills/agendar/scripts/avisar.mjs --teste` e perguntar
   se a mensagem chegou no celular. Só seguir com o sim.

## Montar um robô

### 1. Entender o pedido

Perguntar, uma por vez, só o que faltar:

- **O que conferir.** "O que o robô confere pra você? Pergunto porque é isso
  que vira a receita dele. Tipo: 'anúncio sem estoque no Mercado Livre', 'venda
  nova no Bling desde ontem', 'se o site da loja está no ar'." Resposta vaga
  ("vê como estão as coisas"): perguntar de novo pedindo uma coisa só.
- **Quando avisar.** "Em que situação você quer receber aviso? Pergunto porque
  o robô fica calado quando está tudo bem. Tipo: 'quando tiver algum zerado',
  'quando vender menos de 5 no dia', 'sempre que o site cair'." Resposta vaga:
  perguntar qual número ou situação faria ele querer saber na hora.
- **Quando rodar.** "Que dia e que hora ele roda? Pergunto pra marcar no
  agendador do computador. Tipo: 'todo dia 8h', 'toda segunda 9h'." Mais de uma
  vez por dia fica fora desta versão: oferecer o horário que mais importa.

Descobrir de onde vem o dado: API que o projeto já ligou (Mercado Livre, Bling,
pelo `/conectar`), arquivo em `dados/` ou página pública. Dado que exige login
num site sem API: rodar a escada do `/conectar` e voltar aqui com o caminho que
ela der (arquivo do degrau 4, ou script sem IA no Chrome dedicado).

### 2. Escrever a receita

Gravar `robos/<nome>.mjs`, com nome curto, minúsculo e com hífen:

```js
// <o que este robô faz, em uma linha>
export default {
  nome: 'estoque-zerado',
  quando: { tipo: 'diario', hora: '08:00' },   // semanal: { tipo: 'semanal', dia: 'seg', hora: '09:00' }
  prazoMinutos: 10,
  async conferirAcesso(ctx) {
    // conferir que o token, o arquivo ou o site responde; nunca tentar logar
    // erro de rede: deixar lançar (vira falhou, e a próxima disparada tenta de novo);
    // ok: false só pra acesso que caiu de verdade, porque fecha o dia
    return { ok: true }   // ou { ok: false, motivo: 'o token do Mercado Livre venceu' }
  },
  async rodar(ctx) {
    // ctx.raiz, ctx.data (AAAA-MM-DD), ctx.env, ctx.fetch (com prazo), ctx.teste
    return { avisos: [], relatorio: '' }
  },
}
```

Regras da receita:

- Faz só o que foi mostrado no "pode ir" do agendamento. Chamada que cria, muda,
  apaga, publica ou responde cliente entra só se estava no que foi mostrado.
- Gasto passa pela trava do gasto (`liberarGasto` de
  `.claude/skills/conectar/scripts/lib/orcamento.mjs`) com a estimativa da
  rodada, `autorizado: true` e `acimaDoTetoUsd` igual ao valor por rodada
  mostrado no agendamento, que o "pode ir" de lá cobre. Rodada que estima mais
  que esse valor, ou que não cabe no orçamento do mês, para: o robô não gasta e
  avisa com o recado da trava.
- Chamada de rede sempre por `ctx.fetch`, que tem prazo, nunca pelo `fetch` puro.
- Se usa a API do Mercado Livre ou do Bling, importar o que a skill
  `mercado-livre` já tem em `.claude/skills/mercado-livre/scripts/lib/`, nunca
  copiar token pra dentro da receita.
- `motivo` e cada aviso em frase de gente, com a ação do usuário quando houver.
- `dia` do semanal: `dom`, `seg`, `ter`, `qua`, `qui`, `sex` ou `sab`.

Mostrar a receita explicada em poucas linhas (o que confere, o que executa,
quando avisa, quando roda e quanto gasta por rodada e por mês) e esperar o "pode
ir". É esse "pode ir" que vale pra toda execução do robô.

### 3. Testar na frente do usuário

`node .claude/skills/agendar/scripts/motor.mjs robos/<nome>.mjs --teste`

O modo teste avisa mesmo sem problema (a mensagem começa com `[teste]`) e não
conta como a rodada do dia. Sem Telegram, o aviso do teste sai na tela, nunca como
recado. Conferir com o usuário que a mensagem chegou (ou apareceu na tela) e que o
conteúdo faz sentido. Anotar quanto tempo levou: `prazoMinutos` fica no dobro
disso, no mínimo 2. Deu erro: consertar a receita e testar de novo antes de
agendar.

### 4. Agendar

`node .claude/skills/agendar/scripts/agendador.mjs registrar robos/<nome>.mjs`

O comando confere lendo a tarefa de volta do agendador. Anotar uma linha em
`_contexto/automacoes.md`: `| <nome> | <o que confere> | este computador | <quando> | robo-<nome> | aviso no Telegram ou recado em _memoria/recados/ |`.

Dizer ao usuário: "Pronto. Se estiver tudo certo, você não recebe nada." E
completar conforme o computador. No Windows: "Se o computador estiver desligado
na hora, ele roda quando ligar." No Mac: "Se o computador estiver dormindo na
hora, ele roda quando acordar; desligado, a rodada daquele dia se perde."

## Ver e tirar robôs

- "Quais robôs eu tenho": rodar
  `node .claude/skills/agendar/scripts/agendador.mjs listar` e contar em
  linguagem simples o nome, quando roda (lido da receita) e como foi a última
  rodada.
- "Tira o robô X": confirmar e rodar
  `node .claude/skills/agendar/scripts/agendador.mjs remover <nome>`. A receita
  em `robos/` fica, a não ser que o usuário peça pra apagar. Tirar a linha
  dele do `_contexto/automacoes.md`.
- "Algum robô parou?": `node .claude/skills/agendar/scripts/agendador.mjs atrasados`
  mostra robô que parou de rodar (PC trocado, pasta renomeada, janela fechada).
  O `/iniciar` já confere isso sozinho.

## Quando algo dá errado

- Aviso "não rodou hoje": o acesso caiu (token vencido, senha trocada).
  Resolver pelo `/conectar`; o robô tenta de novo na próxima rodada.
- Aviso "deu erro e parou": ler a última linha do robô em
  `robos/execucoes.jsonl`, consertar a receita e testar com `--teste`.
- Aviso "não conseguiu nem começar": a receita quebrou ou a pasta mudou de
  lugar. O erro fica em `robos/<nome>.log`; consertar e testar com `--teste`.
- Mensagem que não chegou vira um recado em `_memoria/recados/`, e o
  `/iniciar` mostra. Conferir o token e a conversa com `avisar.mjs --teste`.
- No Windows, a coluna "Resultado da última execução" do Agendador de Tarefas
  sempre mostra 0, mesmo quando o robô falhou. O resultado de verdade está em
  `robos/execucoes.jsonl` e no aviso.
- No Mac, projeto dentro de Documentos, Mesa ou Downloads: o macOS pode barrar
  o robô agendado sem deixar rastro. Saída: mover o projeto pra fora dessas
  pastas, ou liberar o Node em Ajustes do Sistema, Privacidade e Segurança,
  Acesso Total ao Disco. Isso ainda não foi provado num Mac de verdade: quem
  passar por isso registra no `_contexto/licoes.md`.
- Erro corrigido vira linha datada no `_contexto/licoes.md`, na seção do robô.
