---
name: carrossel
description: >
  Cria carrosséis completos para Instagram e TikTok com a identidade visual do usuário.
  Inclui setup guiado na primeira vez (checagem de marca, tom de voz, Playwright).
  Gera texto editorial, HTMLs estilizados, renderiza em PNG via Playwright.
  Suporta imagens do usuário, geração por IA ou design visual sem foto.
  Use quando o usuário mencionar "carrossel", "carousel", "slides instagram",
  "slides tiktok", "faz um carrossel", ou pedir pra transformar um tema em carrossel.
---

# /carrossel, Criação de Carrossel

## Setup (primeira vez)

Antes de criar qualquer carrossel, checar 5 coisas. Se tudo estiver OK, pular direto pro workflow. Se faltar algo, resolver na hora de forma conversacional.

### 1. Design guide

Ler o guia visual da marca (linha "a marca" do Mapa no `AGENTS.md`; pasta de projeto com `marca/` própria usa a dela). Se os campos estiverem vazios (template padrão):

> "Pra criar o carrossel com a tua cara, preciso de algumas coisas. Me conta:
> 1. Qual a cor principal da tua marca? (hex tipo #FF5C35, ou descreve: "azul escuro", "laranja quente")
> 2. Tem preferência de fonte? (Se não, eu escolho uma boa pro teu estilo)
> 3. Estilo geral: clean/minimalista, bold/impactante, editorial/elegante, ou outro?
> 4. Tem logo? Se sim, joga o arquivo na pasta `marca/` e me diz o nome"

Com as respostas, preencher o guia visual da marca. A partir da cor principal, gerar variações claras e escuras pra usar nos slides (uma versão mais clara pro destaque sutil, uma mais escura pra fundos). Escolher um fundo escuro e um fundo claro que combinem com o tom da cor (cores quentes pedem fundos mais aconchegantes, cores frias pedem fundos mais neutros).

Se o usuário disser "não sei" ou "escolhe pra mim": usar padrão limpo (fundo escuro #0D0D0D, destaque amarelo #FFD600, Bricolage Grotesque + Instrument Serif).

### 2. Estilo de design dos slides

Ler `references/design-carrossel.md`. Se o arquivo contiver a linha `<!-- estilo: pendente -->`, significa que o usuário ainda não escolheu o estilo. Perguntar:

> "Como tu quer o visual dos slides?
> 1. **Minimalista:** limpo, muito espaço em branco, layouts simples. Elegante e clean
> 2. **Elaborado:** texturas, composições ousadas, layouts variados. Impactante e marcante no feed
> 3. **Tweet:** simula um tweet/post do Twitter. Fundo branco, foto de perfil e @handle no topo, texto grande embaixo. Ultra-limpo e familiar"

Conforme a resposta, **substituir o conteúdo inteiro** de `references/design-carrossel.md` pelo conteúdo do arquivo de estilo escolhido:
- Minimalista: copiar conteúdo de `references/design-minimalista.md`
- Elaborado: copiar conteúdo de `references/design-elaborado.md`
- Tweet: copiar conteúdo de `references/design-tweet.md`

Se `design-carrossel.md` NÃO contiver `<!-- estilo: pendente -->`, o estilo já foi escolhido. Não perguntar de novo.

Se escolher **tweet**, perguntar também:
> "Pra o estilo tweet, preciso de algumas coisas:
> 1. Teu nome (como quer que apareça no slide)
> 2. Teu @ do Instagram
> 3. Uma foto de perfil (joga na pasta `marca/foto-perfil.jpg`). Se não tiver agora, uso as iniciais do teu nome
> 4. Quer o badge azul de verificado ao lado do nome? (sim/não)"

Salvar essas informações na seção `## Perfil do autor` do guia visual da marca pra não perguntar de novo:
```markdown
## Perfil do autor
- **Nome:** [nome]
- **Handle:** @[handle]
- **Foto:** marca/foto-perfil.jpg (ou "iniciais" se não tiver)
- **Badge verificado:** sim/não
```

Se o design guide já tiver a seção "Perfil do autor" preenchida, não perguntar de novo.

Se o usuário não souber ou não tiver preferência, usar **elaborado** como padrão.

O usuário pode trocar depois a qualquer momento: "muda o estilo do carrossel pra tweet" e o Claude copia o outro arquivo.

### 3. Tom de voz

Ler a voz da marca (Mapa do `AGENTS.md`) e as proibições de escrita do `_contexto/preferencias.md`. Se a voz da marca estiver vazia:

> "Como tu prefere que eu escreva os textos dos slides?
> - Informal e direto (papo de colega)?
> - Profissional mas acessível?
> - Técnico e denso?
> E tem algo que te incomoda em texto de IA? (ex: travessões, emojis, frases curtas demais)"

Salvar na voz da marca. O que incomoda em texto de IA vai pras proibições de escrita do `_contexto/preferencias.md`.

### 4. Contexto do negócio

Ler `_contexto/empresa.md`. Se ainda tiver `<!-- NOT CONFIGURED -->` ou a seção "Quem é" estiver no texto entre colchetes do molde, perguntar ali mesmo, uma pergunta por mensagem, no formato de 4 partes da casa (pergunta simples, por que pergunto, exemplos, repergunta se vier vago):

> "O que tu vende ou faz, e pra quem?
>
> Pergunto porque carrossel que fala com todo mundo não prende ninguém: o texto precisa da dor de quem compra de ti.
>
> Tipo: 'vendo moedor de café manual pra quem toma café em casa', ou 'faço consultoria de Mercado Livre pra loja pequena'."

Se vier vago ("vendo de tudo"), reperguntar uma vez pedindo o produto que mais vende e quem mais compra. Com a resposta, preencher as seções "Quem é" e "Como o negócio funciona" de `_contexto/empresa.md` e tirar a linha `<!-- NOT CONFIGURED -->`. O resto do arquivo fica como está.

### 5. Playwright

Conferir se `.claude/skills/midia-social/node_modules/playwright` existe; senão, `npm install --prefix .claude/skills/midia-social` (o mesmo da seção Chrome dedicado da `/midia-social`). Ele desenha os slides no Google Chrome do computador, sem baixar outro navegador.

---

## Dependências

- **Identidade visual:** o guia visual da marca (preenchido no setup ou antes)
- **Regras de design:** `references/design-carrossel.md` (dentro desta skill)
- **Contexto:** `_contexto/empresa.md`
- **Tom de voz:** a voz da marca, com as proibições de escrita do `_contexto/preferencias.md`
- **Render dos slides:** o `slides.mjs` da `/midia-social`

## Input

O usuário fornece:
- Tema, ideia, texto livre, link ou arquivo de referência
- Imagens (opcional): se anexar fotos, usar nos slides. Se não, criar design visual sem foto
- Número do episódio ou série (se aplicável)

## Onde o post mora

Cada carrossel é uma pasta `producao/<slug>/`, com `<slug>` no formato `AAAA-MM-DD-assunto-curto` (data de hoje, assunto em minúsculas, sem acento, com hífen). É a mesma pasta que a `/publicar-social` lê pra agendar:

- `final/slide-01.png`, `final/slide-02.png`...: os slides prontos, em 4:5, e nada mais nessa pasta (no máximo 10 slides, o teto do agendador).
- `final-916/`: a versão em pé pro TikTok, se pedida, com o mesmo número de slides.
- `post.md`: a legenda, no formato do molde da mídia social.
- `roteiro.md`, `imagens/` e `html/`: o texto aprovado, as fotos e os HTMLs dos slides.

**Pasta que veio da `/pauta`.** Antes de criar uma pasta nova, olhar `producao/*/roteiro.md` (fora `_molde` e `_pauta`) atrás de uma pasta do mesmo assunto com a tabela `## Carrossel` preenchida. Achando uma ou mais, listar em ordem de data e perguntar qual é. Confirmada, usar essa pasta: o texto dos slides parte da tabela do `roteiro.md` (já aprovado no Gate 2 da `/pauta`), e o `post.md` que ela escreveu fica, só revisado. Sem pasta da `/pauta`, criar `producao/<slug>/`.

**Molde do `post.md`.** Usar o primeiro que existir: `producao/_molde/post.md` ou `.claude/skills/midia-social/moldes/producao/_molde/post.md`.

---

## Workflow em 3 Fases

### Fase 1, Texto

1. Ler a voz da marca e as proibições de escrita do `_contexto/preferencias.md` pra calibrar tom
2. Ler `_contexto/empresa.md` pra entender contexto e público
3. Se o input for um link, buscar o conteúdo com os fallbacks corretos:
   - **Links normais (artigos, blogs, docs):** tentar WebFetch direto. Se falhar ou retornar pouco conteúdo, usar Jina Reader: prefixar a URL com `https://r.jina.ai/` (ex: `https://r.jina.ai/https://exemplo.com/artigo`)
   - **Links do X/Twitter (x.com ou twitter.com):** substituir o domínio por `api.fxtwitter.com` e usar WebFetch (ex: `https://x.com/user/status/123` vira `https://api.fxtwitter.com/user/status/123`). Funciona também pra `x.com/i/status/ID`. Retorna texto, mídia e links do tweet sem precisar de login
   - **Links do Instagram:** WebFetch não funciona. Avisar o usuário pra copiar o texto do post e colar direto
   - **Links de YouTube:** se tiver a skill `/yt-transcript` ou `/transcribe`, usar. Se não, tentar WebFetch na página
4. **Se o usuário mencionar algo que tu não conhece ou não tem certeza do que é** (nome de produto, ferramenta, evento, pessoa, termo técnico): pesquisar antes de escrever. Usar WebSearch, WebFetch ou qualquer ferramenta disponível. Nunca chutar, corrigir o usuário ou assumir que ele errou. Se ele citou uma ferramenta ou termo que tu não conhece, vai atrás pra descobrir o que é. O usuário sabe do que tá falando, tu é que pode não saber
5. Definir o ângulo do carrossel: educacional, oportunidade, contrário, provocativo ou inspiracional

6. **Briefing rápido**, perguntar ao usuário (numa mensagem só):
   > "Antes de escrever, me confirma:
   > - Quantos slides? (padrão: 6 a 9; teto de 10, o limite do agendador)
   > - Vai querer imagem na capa ou dentro dos slides? Se sim, quantas imagens tu tem?
   >   - Se tiver imagens: joga na pasta `producao/<slug>/imagens/` e me diz os nomes
   >   - Se não tiver: faço um design visual que funciona bem sem foto
   >   - Se quiser, posso gerar imagens por IA (ver seção Geração de Imagens abaixo)
   > - CTA do último slide? (ex: 'segue pra mais', 'link na bio', 'comenta X')
   > - Tipo: dica prática, tendência, opinião forte, bastidores, ou outro?"

   Se o usuário responder tudo junto ("faz sobre X com 8 slides"), não ficar perguntando mais. Usar bom senso pros campos que faltaram.

   Se o usuário fornecer imagens, criar a pasta `producao/<slug>/imagens/` e confirmar que as imagens estão lá antes de seguir.

7. **Planejar a espinha dorsal do carrossel e mostrar pro usuário.** Montar e apresentar:

   > **Espinha dorsal do carrossel:**
   >
   > **Ângulo:** [a opinião/tese do usuário sobre o assunto. Se ele disse "quero falar que X tá matando Y", esse é o ângulo. Nunca diluir]
   >
   > **Tensão central:** [a fricção, contradição ou dado surpreendente]
   >
   > **Mecanismo:** [por que isso acontece, a causa real]
   >
   > **Provas:** [2-3 evidências concretas]
   >
   > **Virada:** [o que muda pra quem tá lendo]
   >
   > **5 opções de capa:**
   > A: [título] / [subtítulo]
   > B: [título] / [subtítulo]
   > C: [título] / [subtítulo]
   > D: [título] / [subtítulo]
   > E: [título] / [subtítulo]
   >
   > Qual capa tu prefere? E a narrativa tá no caminho certo ou quer ajustar algo?

   **CHECKPOINT 1:** Esperar o usuário escolher a capa e aprovar a direção narrativa. Se ele quiser mudar o ângulo, ajustar a espinha dorsal antes de escrever. Só avançar quando a narrativa estiver alinhada.

   Cada opção de capa deve ter título (max 8 palavras) + subtítulo próprio. Nunca o mesmo subtítulo pra todas. Precisa criar tensão ou curiosidade. Nunca descritivo ("5 dicas de X"), sempre com ângulo ("por que X não funciona como tu pensa").

8. **Escrever os slides com base na espinha dorsal e capa aprovadas.** Seguir o arco narrativo:

   **Slide 1 (Capa):** usar a capa escolhida no checkpoint 1.

   **Slide 2 (Hook):** Abre com um fato, dado ou situação que cria tensão. Contextualiza o problema e faz a pessoa querer entender o porquê. O slide termina preparando o terreno pro próximo (a pessoa precisa passar pro próximo pra resolver a tensão, sem precisar de "swipe pra ver mais").

   **Slides 3-4 (Mecanismo):** Explica POR QUE isso acontece, indo além do "o que" pra mostrar o motor por trás. Dados concretos aqui: número + fonte + ano. Se não tiver dado, usar um exemplo real e específico (nome de empresa, produto, caso). Nunca genérico.

   **Do slide 5 ao antepenúltimo (Provas e aprofundamento):** Um ponto por slide, cada um aprofundando um aspecto diferente. Cada slide deve adicionar uma camada nova, não repetir o anterior com palavras diferentes. Se um slide apresenta um dado, o seguinte contradiz ou expande, e o outro conecta com a realidade do leitor. Num carrossel de 6 essa faixa não existe e as provas entram junto do mecanismo, nos slides 3 e 4.

   **Penúltimo (Virada e item salvável):** Aqui o carrossel muda de tom: em vez de resumir o que foi dito, traz uma virada genuína, tipo "e o que isso significa pra quem tá lendo?" ou "o que muda a partir de agora?". Conexão prática e específica, não genérica.

   **Slide final (CTA):** Chamada pra ação + menção ao canal/marca. Curto. O CTA precisa ter uma frase-ponte que conecta o conteúdo do carrossel com a ação (não um "segue pra mais" solto).

**Regras de construção do texto:**
- Cada slide é um parágrafo de reportagem, não uma lista disfarçada. 2-4 frases que fluem com conectivos naturais (porque, só que, por isso, enquanto, mas, então, aí)
- Artigos sempre presentes: "um mercado", "a marca", "os dados". Nunca cortar artigo pra economizar espaço
- Cada frase deve funcionar lida em voz alta. Se soar robótico, reescrever
- Preferir 2 frases curtas com ponto a 1 frase longa com vírgula. Ritmo é mais importante que economia
- Cada slide termina preparando o terreno pro próximo. A passagem entre slides deve ser inevitável pela tensão narrativa, não por aviso ("continue no próximo")
- Dentro de cada slide, o texto é um bloco coeso. Entre slides, há curiosity gap
- Toda afirmação factual precisa de especificidade: dado + fonte + ano. "O mercado cresceu 34% em 2024 (Statista)" em vez de "o mercado cresceu muito"
- Se não tiver dado verificável, não inventar. Melhor uma opinião forte e honesta do que um número falso

**Teste de qualidade (rodar mentalmente antes de entregar):**
- **Teste da leitura em voz alta:** cada slide soa como alguém falando ou como texto gerado por IA?
- **Teste da substituição:** se trocar o tema por outro qualquer e o texto ainda funcionar, tá genérico demais. Reescrever com especificidade
- **Teste da promessa:** o que o hook prometeu foi entregue antes do CTA?
- **Teste do "e daí?":** cada slide responde "e daí?" do anterior. Se um slide não avança a narrativa, cortar

**Padrões proibidos:**
- Sem estruturas binárias: "não é X, é Y" ou "X diminui, Y acelera" (parece IA)
- Sem cacoetes: "e isso muda tudo", "no fim das contas", "a pergunta que fica", "de forma X", "cada vez mais", "em um mundo onde", "é preciso", "simplesmente", "basicamente"
- Sem jargão corporativo: "ecossistema", "mindset", "sinergia", "potencializar", "alavancagem", "disruptivo"
- Sem aberturas genéricas: "hoje vamos falar sobre", "neste carrossel tu vai", "muitas pessoas perguntam"
- Sem fechamentos fracos: "continue no próximo", "swipe pra ver mais", "não para por aí"
- Sem CTA cordial: "espero que tenha gostado", "se esse conteúdo te ajudou", "não esqueça de seguir"
- Sem travessões, a menos que o preferencias.md diga o contrário
- Se soar como template, redação de vestibular ou post genérico de Instagram: reescrever do zero

9. Gerar legenda Instagram:
   - Gancho nos primeiros 125 caracteres (é o que aparece antes do "...mais")
   - 2-3 parágrafos curtos de desenvolvimento
   - CTA no final
   - 5-10 hashtags relevantes

10. Mostrar o texto completo de todos os slides + legenda no chat (não só salvar no arquivo)

11. Salvar o texto dos slides em `producao/<slug>/roteiro.md` (numa pasta que veio da `/pauta`, atualizar a coluna "Texto (literal)" da tabela `## Carrossel`). A legenda vai no `post.md`: copiar o molde (seção "Onde o post mora") pra `producao/<slug>/post.md`, trocar o título, pôr a legenda inteira (gancho, desenvolvimento, CTA e hashtags) no lugar do texto entre `<` e `>` da seção `## Legenda`, e apagar as seções `## YouTube titulo` e `## YouTube descricao`, que carrossel não usa (o YouTube só recebe vídeo). A linha `ia:` fica `ia: sim` se algum slide usar imagem gerada por IA, senão `ia: nao`. Nenhuma linha com texto entre `<` e `>` pode sobrar: o agendador recusa o post enquanto houver.

**CHECKPOINT 2:** Mostrar o texto completo + legenda. Esperar o usuário aprovar ou pedir ajustes antes de seguir pra Fase 2. Se pedir pra mudar um slide, ajustar só aquele.

---

### Fase 2, Visual (HTMLs + PNGs)

1. Ler o guia visual da marca pra identidade visual (cores, fontes, logo)
2. Ler `references/design-carrossel.md` pra regras de design (layouts, ritmo, imagens, elementos fixos)
3. Criar HTMLs seguindo as regras do arquivo de design
4. Salvar HTMLs em `producao/<slug>/html/`
5. Renderizar, com o PNG direto em `final/` (1080x1350). **Slide 1 primeiro**, e mostrar pro usuário:
   ```bash
   node .claude/skills/midia-social/scripts/slides.mjs --pasta producao/<slug> --so 01
   ```

**CHECKPOINT:** Mostrar slide 1 renderizado. Se aprovado, renderizar os demais com o mesmo comando sem `--so`. Se pedir ajuste, editar o HTML e re-renderizar só aquele slide (`--so NN`). Mais de 10 HTMLs em `html/`: o script não grava nada, porque o agendador aceita no máximo 10.

Os PNGs ficam em `producao/<slug>/final/`, com nome `slide-01.png`, `slide-02.png`... (dois dígitos, é por esse nome que o agendador acha e ordena os slides).

> **Dica:** se o usuário não gostar do visual, separar o que é da marca do que é do formato. Cor, fonte e logo mudam no guia visual da marca (linha "a marca" do Mapa no `AGENTS.md`), e valem pra todo conteúdo. Layout, ritmo e elementos do carrossel mudam em `references/design-carrossel.md`: pode editar direto ou pedir "muda a regra X no design do carrossel".

---

### Fase 3, Versão TikTok (opcional)

Após finalizar o Instagram, perguntar:
> "Quer a versão TikTok também? (1080x1920, formato vertical)"

Se sim:
- Adaptar os HTMLs: height 1920px, aumentar padding, ajustar espaçamento
- **Bottom safe zone:** deixar 230px livres embaixo (UI do TikTok sobrepõe)
- Salvar os HTMLs em `producao/<slug>/html-916/` e renderizar (1080x1920):
  ```bash
  node .claude/skills/midia-social/scripts/slides.mjs --pasta producao/<slug> --916
  ```
- Os PNGs ficam em `producao/<slug>/final-916/`, com o mesmo número de slides do `final/`

---

## Output final

```
producao/<AAAA-MM-DD-assunto>/
  post.md                   <- legenda (formato do molde da mídia social)
  roteiro.md                <- texto aprovado dos slides
  imagens/                  <- fotos do usuário ou geradas (se houver)
  html/                     <- slide-01.html, slide-02.html...
  final/                    <- slide-01.png, slide-02.png... e só isso
  html-916/, final-916/     <- versão TikTok (se pedida)
```

Fechar dizendo onde está a pasta e como sai pro ar: "Pra agendar no Instagram e no TikTok, chama a `/publicar-social` com essa pasta e o horário."

## Geração de imagens (opcional)

Se o usuário quiser imagens mas não tiver nenhuma, oferecer gerar por IA. A opção mais simples:

### Pollinations.ai (gratuito, sem cadastro)

Gera imagens direto por URL, sem API key:

```bash
curl -L "https://image.pollinations.ai/prompt/modern%20office%20desk%20minimal%20clean?width=1080&height=720&nologo=true" -o imagens/foto-01.jpg
```

- Grátis e sem cadastro quando esta skill foi escrita, com fila mais lenta pra quem não tem conta. Regra de serviço grátis muda: se a chamada falhar ou pedir chave, conferir a página oficial do Pollinations antes de dizer que é grátis
- Qualidade OK pra foto de apoio (não pra foto principal de produto)
- Não precisa instalar nada

**Como usar no fluxo:**
1. Perguntar ao usuário o que quer na imagem (ex: "mesa de trabalho com notebook", "pessoa usando celular")
2. Gerar com Pollinations, salvar em `producao/<slug>/imagens/`
3. Mostrar pro usuário aprovar antes de usar no slide
4. Se a qualidade não servir, oferecer um gerador pago (abaixo) ou sugerir que ele gere numa ferramenta que já usa e jogue o arquivo na pasta `imagens/`

**Dica pro prompt:** ser específico e adicionar "no text, clean background, professional" pra resultados mais limpos.

### Gerador pago (requer chave de API)

Se o usuário já tiver chave de algum serviço pago de imagem (OpenAI, Stability AI, Replicate ou outro, com a chave no `.env`), dá pra usar, nesta ordem e sem pular passo:

1. **Preço do dia.** Abrir a página oficial de preços do serviço, hoje, e anotar o preço por imagem no tamanho que vai ser pedido. Preço de imagem por IA muda de um mês pro outro: nunca dizer de memória.
2. **Avisar o custo antes.** Mostrar a conta: "São N imagens a US$ X cada, total US$ Y, pelo preço de hoje na página do <serviço>. Pode ir?"
3. **Esperar o "pode ir".** Sem ele, nada é gerado.
4. **Registrar o gasto** em `dados/custos.jsonl`, uma linha por rodada, no contrato `{em, servico, usd, contexto}`. O registrador do pacote faz isso:
   ```bash
   node .claude/skills/midia-social/scripts/lib/custos.mjs --servico "<serviço> (carrossel)" --usd <total em dólar> --contexto "<slug>, N imagens"
   ```

Imagem gerada por IA no slide deixa o `post.md` com `ia: sim`.

---

## Regras

- Texto aprovado na Fase 1 não muda na Fase 2 (visual fiel ao texto)
- Sempre mostrar slide 1 antes de renderizar os demais
- Se o usuário pedir ajuste no visual, editar o HTML e re-renderizar apenas o slide alterado
- Sem travessões no texto por padrão, a menos que preferencias.md diga o contrário
- Se o setup já foi feito antes, não repetir as perguntas. Ir direto pro workflow
- Se faltar algo no meio do caminho (ex: Playwright não instalado), resolver na hora sem travar
- Cor, fonte e logo são da marca: mudam no guia visual da marca (linha "a marca" do Mapa no `AGENTS.md`). Layout, ritmo e elementos do formato carrossel mudam em `references/design-carrossel.md`
