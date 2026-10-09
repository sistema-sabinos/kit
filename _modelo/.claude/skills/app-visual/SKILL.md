---
name: app-visual
description: >
  Monta o visual do seu app a partir dos prints do app de referência: as cores pelo papel
  de cada uma, o tamanho das letras, os espaços, os cantos, as sombras e cada componente
  (botão, campo, cartão, menu) com todos os estados, com fonte e ícones de licença aberta
  e o contraste conferido por script. Nada de logo, ícone, desenho ou texto da referência.
  Etapa 4 de 11 do pacote criar app, sem gasto. Use quando o usuário chamar /app-visual,
  disser "monta o visual do app", "quais cores e letras o app vai usar", "deixa com a
  cara de um app profissional", "o texto está difícil de ler", "confere o contraste",
  "que fonte eu uso", ou quando a /app-planejar terminar.
---

# /app-visual, as cores, as letras e os componentes do app

## O que essa skill faz

Lê `app/mapa.md` e os prints em `app/prints/`, que a `/app-estudar` guardou, e monta o
sistema visual do app em `app/visual/`:

```
app/visual/tokens.json     os valores de cor, letra, espaço e canto, no molde do tokens.json desta pasta
app/visual/tokens.css      os mesmos valores no formato que o navegador lê
app/visual/tailwind.md     como ligar os tokens no Tailwind do app
app/visual/componentes.md  cada componente com variações, tamanhos, estados e acesso
```

O que se reconstrói da referência é o **sistema**: que papéis as cores cumprem, a escada
de tamanhos das letras, o ritmo dos espaços, o jeito de um formulário ou de uma janela se
comportar. Isso o cliente já espera de qualquer app e ninguém tem dono. A aparência que
identifica a referência (logo, ícone, desenho, foto, texto, cor de marca) fica com ela.

Termos que aparecem aqui:

- **Token (de design):** um valor de visual com nome de papel. O app escreve `texto` em
  cada tela, e o valor (`#14171c`) mora num lugar só. Trocar a paleta inteira vira trocar
  um arquivo.
- **Papel de cor:** o trabalho que a cor faz na tela (fundo, texto, borda, destaque,
  perigo), sem dizer qual cor é.
- **Hexadecimal:** o jeito de escrever cor com `#` e seis letras ou números (`#2f5bea`).
  Qualquer conta-gotas de cor mostra nesse formato.
- **Contraste:** o quanto a cor do texto se separa da cor do fundo. Contraste baixo é
  texto cinza-claro em fundo branco, que pouca gente consegue ler.
- **WCAG, AA e AAA:** WCAG é a regra internacional de acessibilidade pra tela. AA é o nível
  mínimo que todo app deve passar; AAA é o nível mais exigente.
- **CSS:** a linguagem que diz ao navegador a cor, o tamanho e a posição de cada coisa.
- **Tailwind:** a ferramenta de visual que a `/app-planejar` escolheu; ela escreve o
  visual direto na tela, com nomes curtos tipo `bg-superficie`.
- **Componente:** peça reaproveitada em várias telas (botão, campo, cartão, menu, janela).
- **Estado:** como o componente aparece em cada situação: normal, com o mouse em cima,
  apertado, selecionado pelo teclado (o **foco**), desligado, carregando, com erro, vazio.
- **Leitor de tela:** o programa que lê o app em voz alta pra quem não enxerga.
- **Licença aberta:** a permissão escrita que deixa qualquer um usar uma fonte ou um
  ícone, cumprindo a condição dela (quase sempre manter o aviso de autor). As mais comuns
  aqui são OFL (fontes), MIT e ISC (ícones e código).

## Dependências

- `app/mapa.md` e `app/prints/` (a `/app-estudar` rodou): telas, componentes de cada tela
  e os prints pra medir.
- `app/arquitetura.md` (a `/app-planejar` rodou): confirma Tailwind e o resto da pilha
  (o conjunto de ferramentas com que o app é feito).
- `marca/design-guide.md`, quando o projeto já tem marca: perguntar ao aluno se o app usa
  as mesmas cores e letras. Se usar, os valores saem de lá e os papéis saem daqui.
- `.claude/skills/app-planejar/referencias/fatos.md`, os fatos datados do pacote. Aqui
  entram o `app-wcag` (os limites de contraste), o `app-trade-dress` e o `app-lpi-195` (a
  régua do visual) e a seção "Fora da tabela" (licença de fonte e ícone). Antes de afirmar
  qualquer um ao aluno, olhar o `conferido_em`: com mais de 60 dias, conferir de novo na
  fonte da linha (fonte oficial primeiro, buscando em português e em inglês), atualizar a
  linha com a data de hoje e só então afirmar.
- Node, que o kit já instala, pro script de contraste.

Faltou o mapa ou os prints: parar e rodar a `/app-estudar`. Faltou a arquitetura: rodar a
`/app-planejar`.

## O que nunca vem da referência

- **Logo, ícone, desenho, foto e som.** Ícone sai de um conjunto aberto (Lucide, Phosphor,
  Heroicons ou Tabler). Desenho e ilustração o aluno faz, encomenda ou gera do zero. Copiar
  ou contornar por cima um desenho da referência fica proibido.
- **Fonte paga ou exclusiva.** Se a referência usa uma, trocar por uma aberta que faz o
  mesmo trabalho: Inter, Geist, IBM Plex, Manrope ou Source Serif.
- **Texto.** Todo rótulo, botão e aviso de tela vazia se escreve de novo, na
  `/app-construir`.
- **Cor de marca.** Ela entra como papel (`destaque`) com um valor neutro provisório, e a
  `/app-marca` troca pela cor do aluno antes de lançar.

A régua por trás, sem promessa de resultado jurídico (caso com dinheiro alto ou briga com
outra empresa vai pra um advogado): visual igual a ponto de o cliente confundir os dois
apps pode ser julgado concorrência desleal (`app-lpi-195`). O conjunto da aparência (cor
de marca, disposição da tela, logo, tipo de letra juntos), chamado trade dress, é
protegido mesmo sem registro (`app-trade-dress`). Por isso o sistema pode ser parecido, e a
cor de marca com a disposição marcante da referência mudam antes do lançamento.

As licenças das fontes e dos ícones citados estão na seção "Fora da tabela" do
`fatos.md`, com a data. Antes de indicar uma fonte ou um conjunto de ícones, olhar a data
dela; com mais de 60 dias, abrir o repositório oficial do escolhido e conferir a licença
lá. O aviso de licença da fonte e do conjunto de ícones vai junto com o código do app em
`app/codigo/`, porque é a condição que essas licenças pedem.

## Fluxo

### Passo 1. Medir nos prints

Medir sempre, sem chutar. Pedir ao aluno pra abrir os prints com zoom e usar um conta-gotas
de cor (programa que mostra o código da cor onde o mouse aponta), ou ler o valor direto do
print quando a IA consegue abrir a imagem.

- **Papéis de cor:** fundo, superfície (cartão e painel por cima do fundo), borda, borda de
  campo, texto, texto-mudo (o cinza das legendas), destaque, sobre-destaque (o texto em
  cima do botão de destaque), perigo e sucesso. Contar quantos cinzas a referência usa de
  verdade; quase sempre são de 5 a 7.
- **Letras:** os tamanhos, a altura da linha e a grossura (peso). Encaixar numa escada,
  como 12, 14, 16, 20, 28 e 40 pixels (pixel é o pontinho da tela, a medida de tamanho
  de tudo). Anotar o tipo de letra (sem serifa, com serifa, que é o pezinho na ponta da letra, ou de máquina de
  escrever), sem
  buscar o arquivo da fonte.
- **Espaços:** medir a distância entre os elementos. Quase sempre ela anda de 4 em 4 ou de
  8 em 8. Escrever a escada.
- **Cantos, sombras e movimento:** dois ou três de cada (canto pouco redondo, médio e
  redondo; sombra de cartão e de janela flutuante; animação rápida e normal).
- **Disposição:** largura máxima do conteúdo, colunas, larguras em que a tela muda de
  arrumação (do celular pro computador), largura da barra lateral, altura do topo.

### Passo 2. Os tokens

Copiar o `tokens.json` desta pasta pra `app/visual/tokens.json` e preencher com o que o
Passo 1 mediu. Os nomes dos papéis ficam; só os valores mudam. A `/app-marca` também só
troca valores, e por isso cada tela continua funcionando quando a marca nova entra.

Na cor de destaque, gravar um valor neutro (o azul do molde serve). A cor de marca da
referência vai só pra uma nota no fim do `app/visual/componentes.md`, pra `/app-marca`
saber o que precisa ficar diferente.

Gerar `app/visual/tokens.css` com cada token como variável do CSS (`--texto: #14171c;`
dentro de `:root`) e escrever em `app/visual/tailwind.md` como ligar essas variáveis no
tema do Tailwind, pra todo componente usar só os nomes dos tokens (`bg-superficie
text-texto-mudo`). A `/app-construir` copia isso pra dentro de `app/codigo/` quando monta a casca
(o esqueleto do app, com menu e páginas ainda vazias).

### Passo 3. Conferir o contraste

Na lista `pairs` do `app/visual/tokens.json`, uma linha pra cada combinação de texto e
fundo que o app usa de verdade: `["texto", "fundo"]`. Texto de 24 pixels pra cima (ou
18,66 em negrito) leva `"grande"` no terceiro item; borda de campo, botão e anel de foco
levam `"ui"`. Depois, da raiz do projeto:

```bash
node .claude/skills/app-visual/scripts/contraste.mjs app/visual/tokens.json
```

Cada linha sai com a nota (`AAA`, `AA`, `REPROVA`, ou `PASSA` pros itens `ui`), a razão de
contraste e o par. O fim diz quantos pares reprovam. O script sai com 0 quando todos
passam, 1 quando algum reprova ou cita cor que não existe no arquivo, e 2 quando o arquivo
está quebrado, tem par escrito fora do formato (`"texto,fundo"` numa string só, por
exemplo; o aviso mostra o par e o jeito certo) ou não tem nada pra conferir. Pra testar
uma cor solta antes de gravar:

```bash
node .claude/skills/app-visual/scripts/contraste.mjs "#6b7280" "#ffffff"
```

Os limites que o script usa vêm da WCAG (`app-wcag`). AA é o piso deste pacote: zero par
reprovando. Par que reprovou se conserta no `tokens.json`, escurecendo o texto ou clareando
o fundo, e o script roda de novo. O conserto fica no token, porque um ajuste feito num
componente só deixa todos os outros que usam a mesma cor com o mesmo problema.

### Passo 4. A ficha de cada componente

Pra cada componente que o mapa listou, um bloco em `app/visual/componentes.md`:

```
Botão
  variações  principal, secundário, só texto, perigo
  tamanhos   pequeno 32px, médio 40px, grande 48px
  estados    normal, mouse em cima, apertado, foco (anel de 2px na cor destaque), desligado, carregando
  tokens     fundo destaque, texto sobre-destaque, canto md, letra sm peso 600
  acesso     botão de verdade no código, foco visível, carregando mantém o nome pro leitor de tela
  telas      T02, T07, T09
```

Entram todos os estados que a referência mostrou, mais os que ela deveria ter: foco,
desligado, carregando, com erro e vazio. Como o componente se comporta no teclado (Tab
chega nele, Enter aperta, Esc fecha a janela) e o que o leitor de tela fala fazem parte da
ficha.

Essa ficha é material de trabalho da IA na `/app-construir`. Pro aluno, no chat, basta a
lista de componentes e quantos estados cada um tem.

### Passo 5. A vitrine

Antes de qualquer tela, os componentes se montam uma vez em código, sozinhos, numa página
de vitrine (`/vitrine` dentro do app), usando uma base de componentes acessível (um pacote de botões, campos e janelas
prontos que já funcionam no teclado e no leitor de tela) se a pilha
tiver uma (a `/app-planejar` registra qual). A vitrine é a prova do sistema: cada
componente em cada estado, lado a lado.

Se `app/codigo/` ainda não existe, a vitrine fica como primeiro item da casca na
`/app-construir`. Se já existe, montar agora, tirar o print da vitrine pelo Playwright (o
navegador que a IA controla sozinha, ligado pelo `/conectar`) e salvar em
`app/visual/vitrine.png`. Sem Playwright, pedir ao aluno pra abrir a vitrine no navegador e
olhar.

## Quando entra gasto

Esta etapa roda sem gasto: ícone aberto, fonte aberta, desenho em SVG (desenho feito em
código, que fica nítido em qualquer tamanho). Três caminhos custam dinheiro, e cada um
passa pelo gate:

- **Imagem ou ilustração gerada por IA paga:** só pela `/gerar-imagens`, que vem no pacote
  do Mercado Livre e já avisa o custo e espera o "pode ir". Sem esse pacote, a imagem do
  app sai em SVG ou de banco de imagem grátis com licença aberta.
- **Fonte paga** que o aluno queira comprar, ou **ilustrador contratado.** Esses preços
  ficam fora do `fatos.md`. Antes de qualquer compra:
  1. Abrir a página oficial do vendedor e mostrar ao aluno o que vai ser comprado, o
     preço e a data de hoje como data da consulta.
  2. Passar a proposta pela `/segunda-opiniao` (dose completa), com a alternativa aberta
     que faz o mesmo trabalho.
  3. Esperar o "pode ir" do aluno naquele momento. O pagamento é feito pelo próprio
     aluno, na página do vendedor, com o cartão dele.
  4. Pago, acrescentar uma linha no fim de `dados/custos.jsonl` (criar o arquivo se não
     existir), sem editar as antigas:
     ```
     {"em":"<data e hora em UTC>","servico":"fonte <nome>","usd":0,"brl":<valor pago>,"contexto":"app <nome>, licença de fonte"}
     ```
     `em` é a data e hora em UTC (o relógio de referência do mundo); valor em reais vai
     em `brl` com `"usd":0`, e em dólar vai em `usd`, número com ponto.

## Saída

`app/visual/tokens.json`, `tokens.css`, `tailwind.md` e `componentes.md`, e o relatório de
contraste com zero par reprovando no AA. No chat, só o resumo: quantas cores, quantos
tamanhos de letra e quantos componentes (contados no arquivo), a fonte e o conjunto de
ícones escolhidos com a licença de cada um, o número de pares conferidos e de pares
reprovando, e `/syncar` com `visual: tokens e componentes`.

## Regras

- Só token: nenhuma tela usa cor ou medida solta. Faltou um valor, ele entra no
  `tokens.json` e dali vai pra tela.
- Contraste conferido pelo script depois de toda troca de cor, com zero par reprovando no
  AA.
- Logo, ícone, desenho, foto, som, texto e fonte paga da referência ficam fora.
- Cor de marca da referência fica fora; o destaque nasce neutro e a `/app-marca` dá a cor
  do aluno.
- Valor que muda (limite de contraste, licença, regra) só pelo id do `fatos.md`, com a data
  olhada antes.
- Gasto só pelo gate acima, com o "pode ir" do aluno naquele momento.

Próxima etapa: `/app-construir`, que monta o app tela a tela com estes tokens e componentes.
