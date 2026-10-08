---
name: pedir
description: >
  Responde se a IA consegue fazer algo no negócio da pessoa e transforma pedido vago em
  pedido completo, mostrando o antes e o depois. Use quando o usuário chamar /pedir,
  perguntar "dá pra...", "a IA consegue...", "tem como a IA...", "você consegue...", disser
  "não sei pedir", "me ajuda a pedir", "como eu peço isso". Pra achar ou instalar skill de
  fora, é a find-skills; pra ligar uma conta, o /conectar.
---

# /pedir, a porta de entrada

Quem ainda não sabe pedir chega com "dá pra?" ou com um pedido pela metade. Esta skill
responde, completa o pedido com o que o projeto já sabe e devolve o pedido bem escrito,
pra pessoa aprender vendo. A fórmula é sempre a mesma do guia: **o que você quer, pra
quê, e como sabe que ficou bom**.

## Antes de responder

1. Ler `_contexto/ferramentas.md` (o que está `ligado`, `não ligada`, `pendente`) e a lista
   de pastas de `.claude/skills/`. Nunca responder "não consigo" sem olhar os dois
2. Usar o `_contexto/` que já chegou na conversa (produto, canal, foco, o que está em
   andamento). Não reler o que já foi lido
3. Ler `cardapio.md`, nesta pasta: 6 pares de pedido vago e pedido bom, com a skill que
   atende cada um. O par mais parecido serve de molde

## Modo 1: "a IA consegue X?"

1. Responder em uma linha: **dá**, **dá em parte** ou **não dá**, e por quê
2. O que falta: conta a ligar (pelo `/conectar`), skill que faz (pelo nome, só se a pasta
   existe no projeto) ou pacote que não veio (o `/atualizar-sabinos` mostra os
   disponíveis). Mudança em conta de terceiro, gasto, publicação e mensagem pra fora
   continuam pedindo o "pode ir" da pessoa: dizer isso quando o X mexe em conta
3. Se custa: dizer que custa e quem cobra (o `ferramentas.md` e a skill que cobra dizem
   quem). Valor só conferido na internet na hora (regra 2 do `AGENTS.md`); sem conferir:
   "tem custo; confiro o valor antes de rodar qualquer coisa". Nunca preço, taxa ou limite
   de memória
4. Oferecer 2 ou 3 primeiros passos, cada um escrito como pedido completo. Com a
   `AskUserQuestion`: cabeçalho `Começar`, rótulo de até 5 palavras, pedido completo na
   descrição da opção, e o campo livre faz o papel de "ou escreve do seu jeito". Sem ela
   (Codex, por exemplo): numerados em texto (1, 2, 3), seguidos de "ou escreve do seu
   jeito", e a pessoa responde com o número
5. Fechar com a dica (ver "Dica de pedido")

"Não dá" sempre vem com a rota mais próxima que funciona.

## Modo 2: "me ajuda a pedir"

1. A pessoa escreve do jeito que sair. Completar com o `_contexto/` e com o par mais
   parecido do cardápio
2. Mostrar em até 3 linhas, com o que foi suposto entre colchetes:
   ```
   Antes: "<o que a pessoa escreveu>"
   Depois: "<pedido completo: o quê, pra quê, como fica pronto>"
   ```
3. Confirmar com "faço agora?" e parar ali: o trabalho só começa depois do sim. "Ajusta"
   volta pro passo 2 com a correção
4. Perguntar por último, junto da confirmação, e só o que o contexto não responde e muda
   o trabalho (o quê, pra quê, como fica pronto): até 3 perguntas, com opções (botão
   quando houver; sem botão, numeradas 1, 2, 3). O "Depois" se refaz com as respostas
5. No sim, seguir pela skill que o pedido pede (a do par do cardápio, se existir no projeto)

## Regras que valem aqui também

- "Só faz": parar de perguntar até o fim da sessão e seguir pela suposição mais segura,
  dizendo qual foi em uma linha
- Sem gente na frente (rotina, subagente): nunca perguntar, a `AskUserQuestion` nem
  existe ali. Seguir pela suposição mais segura e declará-la no recado ou na resposta
- Duas correções sem acertar: resumir o pedido certo num bloco e sugerir colar numa
  conversa nova
- Pedido que já chegou claro não passa por aqui: executa direto

## Dica de pedido

Toda resposta desta skill fecha com "da próxima vez, pode pedir assim: <pedido completo>",
menos quando o `_contexto/preferencias.md` tem a linha `Dicas de pedido: desligadas`.
"Para com as dicas" grava essa linha no fim da seção Formato de lá na hora; "volta com as
dicas" a tira. Mesma regra do `AGENTS.md`, regra 8.

## Comportamento

- Tom de conversa, sem aula sobre prompt e sem sigla
- Não listar os arquivos lidos, só usar
- Exemplo de produto e canal sai do projeto da pessoa; o cardápio é só molde
