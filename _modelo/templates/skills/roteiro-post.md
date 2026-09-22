---
name: roteiro-post
description: >
  Transforma uma ideia, texto, link ou arquivo em conteúdo ESCRITO: post pra rede
  social, thread ou newsletter. Calibra o formato e o tom ao canal pedido. Pra roteiro
  de vídeo pra GRAVAR (Reels, TikTok), usar a skill roteiro-video.
  Use quando o usuário pedir "faz um roteiro de post", "transforma isso num post",
  "transforma esse vídeo num post", "cria uma thread", "faz uma newsletter sobre isso".
---

# /roteiro-post, Roteiro de Conteúdo

## Quando não usar

Vídeo pra gravar (Reels, TikTok, Shorts, YouTube) é da skill `roteiro-video`. Esta
aqui cuida de texto escrito: post, thread e newsletter. Pedido de vídeo se passa
pra lá em vez de responder aqui.

## Dependências

- **Contexto do negócio:** `_contexto/empresa.md`
- **Tom de voz:** `_contexto/preferencias.md`

---

## Workflow

### Passo 1, Entender o pedido

Identificar:
1. **O conteúdo fonte:** ideia, link, texto, arquivo, transcrição ou assunto livre
2. **O formato de saída:** post Instagram, thread X/LinkedIn, newsletter

Se não estiver claro, perguntar: "Pra qual formato é esse roteiro? (post, thread, newsletter)"

Se for um link, usar WebFetch pra buscar o conteúdo.

### Passo 2, Ler o contexto

Ler `_contexto/empresa.md` e `_contexto/preferencias.md` pra calibrar:
- Tom (informal/formal, gíria ou não, etc)
- Público (quem lê/assiste)
- Posicionamento (o que a marca defende)

### Passo 2.1, Dar forma de história

Antes de escrever, passar a ideia por uma destas três formas. Post sem forma vira
lista, e lista ninguém lembra.

**E, Mas, Por isso.** Três tempos: o contexto ("e"), o problema que aparece ("mas"),
a saída ("por isso"). Teste de rascunho: se o texto é "e... e... e...", ainda não
virou história.

**Antes, o que quebrou, depois.** Nunca pular direto pro resultado. Mostrar como
era, o que deu errado, e só então como ficou.

**O momento de 5 segundos.** Toda história gira num instante em que algo mudou.
Achar esse instante, começar pelo oposto dele, e ligar as partes com "mas" e "por
isso", nunca com "e aí".

### Passo 3, Escrever o roteiro

**Post (Instagram/LinkedIn):**
- Hook nas primeiras 2 linhas (antes do "ver mais")
- Desenvolvimento em parágrafos curtos ou lista com contexto
- CTA no final (pergunta, link, salvar)
- Sugestão de hashtags (5-10)

**Thread (X ou LinkedIn):**
- Tweet/post 1: hook que para o scroll
- Tweets 2-8: um ponto por tweet, progressão lógica
- Tweet final: conclusão + CTA

**Newsletter:**
- Linha de assunto + pré-header (duas opções)
- Abertura pessoal (2-4 linhas)
- Desenvolvimento em seções curtas
- Encerramento com CTA

### Passo 4, Salvar

Salvar em `conteudo/roteiros/roteiro-[tema]-[data].md`

---

## Regras

- Tom segue `_contexto/preferencias.md` estritamente
- Não usar fórmulas de youtuber ("ei pessoal", "não esquece de dar like")
- O roteiro deve soar como o usuário fala, não como conteúdo genérico
- Frases de transição naturais, não clichês de criador de conteúdo
