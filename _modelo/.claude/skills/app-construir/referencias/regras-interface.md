# Regras de interface

> Lido pela `/app-construir` antes da primeira tela. Cada regra traz a classe do Tailwind (a
> pilha que a `/app-planejar` recomenda) e o mesmo efeito em CSS puro, pra quem usa outra pilha.

- **Altura de tela cheia que cabe no celular.** Usar `h-dvh` (CSS `height: 100dvh`) no lugar
  de `h-screen` (`100vh`). O `100vh` mede a tela como se a barra do navegador do celular
  estivesse recolhida, e com ela à mostra o pé da página fica escondido atrás. O `dvh`
  acompanha a barra quando ela aparece e some, então o bloco muda de altura enquanto a pessoa
  rola; bloco que precisa ficar parado usa `h-svh` (`100svh`), a altura com a barra à mostra.
- **Número que muda com algarismo de largura fixa.** Preço, hora, contador e total levam
  `tabular-nums` (CSS `font-variant-numeric: tabular-nums`). Todo algarismo ocupa o mesmo
  espaço, e a linha não treme quando o número troca.
- **Coluna de grade que não estoura.** Coluna que divide o espaço usa `minmax(0, 1fr)` no
  lugar de `1fr` (CSS `grid-template-columns`). O `1fr` sozinho cresce até caber a palavra
  ou a imagem mais comprida e empurra a tela pro lado. As classes prontas do Tailwind
  (`grid-cols-2`, `grid-cols-3`) já vêm assim; coluna escrita à mão troca o `1fr` por
  `minmax(0,1fr)`, e a coluna de largura fixa ao lado (a barra lateral, por exemplo) sai dos
  tokens de disposição da `/app-visual`, pelo nome, sem medida solta.
- **Animação só em posição e transparência.** Mexer só em `transform` e `opacity`
  (`transition-transform`, `transition-opacity`; CSS `transition-property`), que o
  navegador anima sem refazer o desenho da página, e o movimento não engasga no celular
  simples. O tempo vem do token `motion` da `/app-visual` (o rápido e o normal), pelo nome
  ligado no tema como o `app/visual/tailwind.md` ensina, sem número escrito no componente.
- **Menos movimento pra quem pediu.** Quem ligou "reduzir movimento" no aparelho (tem gente que
  sente tontura com animação) fica sem deslocamento na tela: `motion-reduce:transition-none` e
  `motion-reduce:animate-none` (CSS `@media (prefers-reduced-motion: reduce)`, com a
  animação desligada dentro).
- **Ação sem volta pede confirmação.** Apagar, cancelar horário e cobrar abrem antes uma
  janela que diz o que vai acontecer, com o botão nomeando a ação ("Apagar cliente") e uma
  saída clara ("Voltar"). Regra de comportamento, sem classe: vale em qualquer pilha.

Crédito: as regras acima partem da ideia da baseline-ui (projeto ui-skills) e do hallmark, e o
"mínimo primeiro" da `/app-construir` parte da ideia do ponytail. Ideia, sem texto copiado.
