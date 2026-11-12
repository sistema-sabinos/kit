---
name: slide
description: >
  Cria um slide ou card visual em HTML pra usar em apresentações, decks ou posts.
  Aplica a identidade visual do usuário (o guia visual da marca).
  Use quando o usuário pedir "faz um slide", "cria um card", "quero um visual pra apresentação",
  "frame pra deck", ou pedir um slide sobre algum tema específico.
---

# /slide, Criação de Slide ou Card Visual

## Dependências

- **Identidade visual:** o guia visual da marca (linha "a marca" do Mapa no `AGENTS.md`; pasta de projeto com `marca/` própria usa a dela)

---

## Workflow

### Passo 1, Entender o que o usuário quer

Se não estiver claro, perguntar:
1. "Qual é o tema ou conteúdo do slide?"
2. "Qual é o formato? (card quadrado 1:1, slide wide 16:9, story vertical 9:16)"
3. "É um slide de dados/estatística, texto/insight, diagrama/fluxo, ou visual/imagem?"

### Passo 2, Ler o design guide

Ler o guia visual da marca pra aplicar as cores e fontes corretas.
Se estiver vazio: visual limpo e neutro, sem inventar marca. Cor e fonte novas só entram no guia com o ok da pessoa.

### Passo 3, Gerar o HTML

Criar um arquivo HTML único, com dimensões específicas pro formato pedido:
- Card 1:1: 1080x1080px
- Slide 16:9: 1920x1080px
- Story 9:16: 1080x1920px

**O que não pode faltar:**
- A ideia principal, que se entende em 2 segundos
- Um destaque só por slide (o número, a frase ou o fluxo)
- Texto que cabe sem letra miúda
- As cores e fontes do guia visual

A disposição (onde vai o título, se tem caixa, seta ou gráfico, em linha ou em coluna) se escolhe pelo conteúdo de cada slide.

### Passo 4, Salvar

Salvar em `conteudo/slides/slide-[tema]-[data].html`

Renderizar com Playwright se disponível e mostrar o resultado.

---

## Regras

- Um slide por vez, se o usuário quer vários, criar um de cada vez e confirmar antes do próximo
- Inline CSS, sem dependências externas além do Google Fonts
- O slide deve funcionar como screenshot, tudo visível dentro da área, sem scroll
- Se o design guide tiver logo definido na seção **Logo**, pode incluir no slide quando fizer sentido (ex: canto inferior, assinatura). Escolher a versão correta conforme o fundo do slide
