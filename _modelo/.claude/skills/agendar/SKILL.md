---
name: agendar
description: >
  Monta um robô que roda sozinho no horário marcado, confere algo do negócio e
  avisa no Telegram só quando tem problema. Use quando o usuário chamar /agendar,
  disser "todo dia às 8h confere...", "roda isso sozinho", "me avisa no celular
  quando...", "quais robôs eu tenho" ou "tira o robô X". O robô só lê e avisa:
  gastar, publicar ou responder cliente fica de fora.
---

# /agendar, o robô que trabalha sozinho

Um robô é um arquivo pequeno em `robos/<nome>.mjs` (a receita) que o computador
roda sozinho no horário marcado. O motor desta skill cuida do resto: espera o
computador terminar de ligar, não roda duas vezes no mesmo dia, confere o acesso
antes, anota cada rodada em `robos/execucoes.jsonl` e avisa no Telegram só
quando tem problema. Silêncio quer dizer que deu tudo certo.

Funciona no Windows e no Mac, com o computador ligado e a sessão do usuário
aberta. No Windows, computador desligado ou dormindo na hora marcada: roda
assim que ligar, uma vez só. No Mac, isso só vale se ele estava dormindo;
desligado na hora, a rodada daquele dia se perde.

## Regra que não muda: robô lê e avisa

O robô confere, compara, calcula e avisa. Ele nunca gasta dinheiro, publica,
muda preço, responde cliente nem mexe em conta de terceiro, mesmo que o usuário
peça. Se o pedido tiver uma parte que age, dizer em uma frase: "Essa parte eu
não coloco no robô: o que gasta ou publica precisa do seu 'pode ir' na hora, e
o robô roda com você longe. Ele pode te avisar pra você decidir." E montar só a
parte de leitura.

## Primeira vez: o bot do Telegram

Se o `.env` já tem `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`, pular esta seção.

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
num site sem API fica de fora: explicar e oferecer outro caminho.

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

- Só leitura. Nenhuma chamada que cria, muda ou apaga.
- Chamada de rede sempre por `ctx.fetch`, que tem prazo, nunca pelo `fetch` puro.
- Se usa a API do Mercado Livre ou do Bling, importar o que a skill
  `mercado-livre` já tem em `.claude/skills/mercado-livre/scripts/lib/`, nunca
  copiar token pra dentro da receita.
- `motivo` e cada aviso em frase de gente, com a ação do usuário quando houver.
- `dia` do semanal: `dom`, `seg`, `ter`, `qua`, `qui`, `sex` ou `sab`.

Mostrar a receita explicada em três linhas (o que confere, quando avisa, quando
roda) e esperar o "pode ir".

### 3. Testar na frente do usuário

`node .claude/skills/agendar/scripts/motor.mjs robos/<nome>.mjs --teste`

O modo teste avisa mesmo sem problema (a mensagem começa com `[teste]`) e não
conta como a rodada do dia. Conferir com o usuário que a mensagem chegou e que o
conteúdo faz sentido. Anotar quanto tempo levou: `prazoMinutos` fica no dobro
disso, no mínimo 2. Deu erro: consertar a receita e testar de novo antes de
agendar.

### 4. Agendar

`node .claude/skills/agendar/scripts/agendador.mjs registrar robos/<nome>.mjs`

O comando confere lendo a tarefa de volta do agendador. Anotar em
`_contexto/ferramentas.md`: `| robô <nome> | agendado | <AAAA-MM-DD> | <quando> |`.

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
  em `robos/` fica, a não ser que o usuário peça pra apagar. Atualizar
  `_contexto/ferramentas.md`.
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
- Mensagem que não chegou fica guardada em `robos/avisos-pendentes.md`, e o
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
