---
name: assistir-video
description: >
  Assiste um vídeo de verdade (YouTube, Instagram, TikTok, Kwai, Facebook, X,
  Vimeo ou arquivo local), vendo IMAGEM e ouvindo ÁUDIO via Gemini, não só
  lendo legenda. Use quando o usuário mandar um link de vídeo e disser
  "assiste esse vídeo", "vê esse vídeo e me diz o que tem", "o que esse vídeo
  mostra/faz", "resume esse vídeo", "o que aparece na tela", "esse cara tá
  falando verdade?", ou colar uma URL de vídeo com intenção de entender o
  conteúdo. Enxerga o que aparece na tela (painéis, sites, prints,
  demonstrações), por isso é melhor que uma transcrição pura quando o vídeo
  mostra algo visual.
---

# Assistir vídeo (com visão, via Gemini)

Manda o **Gemini assistir o vídeo** processando áudio + imagem (~1 frame/seg). Diferente de transcrever (só o áudio vira texto), aqui o modelo **vê a tela**: descreve ferramentas, sites, painéis e demonstrações que aparecem, com timestamps.

Funciona em qualquer pasta/negócio (skill global). Usa a `GEMINI_API_KEY` do arquivo `.env` na raiz do projeto (o `/conectar` ensina a criar a chave; é paga por uso, avisar custo antes).

## Quando usar

- O usuário cola um link de vídeo e quer saber o que dizem E o que mostram.
- Checar se o que um vídeo promete é verdade (o modo padrão já separa uma seção de "afirmações verificáveis" pra conferir depois com WebSearch).
- Tutorial onde o que importa está na tela (painel, software, passo a passo).
- Resumo, perguntas específicas, ou achar o timestamp de um trecho.

Para áudio puro (podcast, vídeo sem nada visual relevante), a skill global `transcribe` também serve; esta aqui ganha quando a TELA importa.

## Como rodar

```bash
node .claude/skills/assistir-video/ver-video.mjs "<url ou arquivo>"
```

Opções:
- `--pergunta "..."` responde uma pergunta específica em vez da análise completa.
- `--barato` usa o flash mais novo em vez do pro. **É o que derruba o custo de verdade** (cai a qualidade da leitura de texto miúdo na tela).
- `--model gemini-3.1-pro-preview` força um modelo específico (normalmente desnecessário, ver abaixo).
- `--lowres` pede resolução de mídia baixa. Não muda o número de tokens nos modelos 3.x, então não conte com ele pra economizar; use `--barato`.
- `--baixar` força baixar mesmo sendo YouTube. `--manter` não apaga o arquivo temporário. `--so-baixar` só baixa e imprime o caminho.

O texto sai no stdout. O stderr mostra a rota usada, o modelo e o nº de tokens (pra conferir custo).

## De onde ele aceita vídeo

| Origem | Como funciona |
|---|---|
| YouTube | link direto, o Gemini busca sozinho (não baixa nada aqui, é a rota mais barata) |
| TikTok, Kwai, Facebook, X, Vimeo e afins | baixa com `yt-dlp` e sobe pela Files API |
| Instagram | o `yt-dlp` costuma levar "empty media response" sem cookie de sessão logada |
| Arquivo local (.mp4/.mov/.webm/...) | sobe direto pela Files API |

O arquivo baixado é apagado no fim, e a cópia que fica no servidor do Gemini também (sem `--manter`).

Dependência dessas rotas: `yt-dlp` e `ffmpeg` no PATH. Se o download por `yt-dlp` falhar por exigir login (caso comum do Instagram), avisar o usuário que essa rota precisa de um navegador dedicado (recurso avançado, ver `../docs/roadmap-avancado.md`, na pasta-mãe do SabinOS); enquanto isso não estiver montado, o caminho é o usuário baixar o vídeo manualmente e passar o arquivo local.

## Modelo: escolhido na hora, nunca chumbado

O script pergunta pra API quais modelos existem e escolhe o melhor disponível (pro mais novo; com `--barato`, o flash mais novo).

**Por que:** modelo em preview some sem aviso e derruba a skill inteira quando o nome vem chumbado no código. Não chumbar nome de modelo aqui.

## Custo (pay-per-use, na billing Gemini do usuário)

NÃO é grátis, mas é barato. Vídeo é tokenizado por segundo de duração. Referência medida: um reel de 38s consumiu ~3.500 tokens de entrada. Estimativa:
- Vídeo curto (1-3 min): poucos centavos a 1 real
- Vídeo médio (10-15 min): alguns reais
- `--barato` derruba pra uma fração disso.

Sempre relatar ao usuário o custo aproximado quando o vídeo for longo.

## Fluxo da skill

1. Pegar a URL (ou caminho) do argumento. Se não vier, pedir.
2. Se o usuário fez uma pergunta específica, passar via `--pergunta`. Vídeo longo sem texto miúdo na tela: considerar `--barato`.
3. Rodar o script e apresentar a análise. Em vídeo longo, avisar o custo aproximado.
4. Se o usuário pediu pra checar se o vídeo fala verdade, pegar a seção "afirmações verificáveis" e conferir cada uma com WebSearch/WebFetch antes de responder.

## Limitações

- Vídeo privado ou de conta fechada não entra (nem o YouTube não listado, nem post de perfil privado).
- Vídeo muito longo pode estourar contexto; nesse caso usar `--barato` ou pedir foco num trecho via `--pergunta`.
- Lê o que está na tela, mas não clica nem interage; é observação, não automação.
