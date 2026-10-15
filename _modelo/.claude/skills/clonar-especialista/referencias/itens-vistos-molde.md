# Molde do itens-vistos.md (Passo 5)

Vai colado no prompt do subagente contador, junto com a ficha nova e o `itens-vistos.md` da
pasta. Ele devolve só os itens que ainda não estavam lá; quem grava no fim do `itens-vistos.md` é
a conversa principal, em CRLF, sempre na ordem do N.

```
# Itens vistos

## Princípios
<N> | <ano> | <pessoa|terceiro> | <resumo em uma linha>
## Regras de decisão
## Casos
## Opiniões datadas
```

- **Item** é só o que está em Princípios, Regras de decisão, Casos e Opiniões datadas da ficha. O
  que ensina, Traços e valores, Voz e Fatos e críticas não contam.
- **Terceira coluna:** de quem é o item, `pessoa` ou `terceiro`; item com `(impression)` conta
  como terceiro.
- **Já visto:** a mesma ideia com outro texto; o mesmo estudo com outro número (a diferença vai
  também pro `conflitos.md`, como divergência); o mesmo conteúdo em outro tipo (caso que só
  repete um princípio já visto).
- **Novo:** generalização de item já visto, ou item já visto com parte nova somada (a linha diz o
  que somou). Repetição dentro da mesma ficha conta uma vez.
- Fonte `prova` no meio da ordem do N se pula: não tem ficha e não entra na contagem.
- `novos` na linha da fonte no inventário é o número de itens que o contador devolveu.
