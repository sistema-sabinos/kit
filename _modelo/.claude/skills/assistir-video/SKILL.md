---
name: assistir-video
description: >
  Assiste um vídeo de verdade (YouTube, Instagram, TikTok, Kwai, Facebook, X,
  Vimeo ou arquivo local), vendo IMAGEM e ouvindo ÁUDIO via Gemini (pago, centavos,
  sempre avisado antes). Use quando o usuário chamar /assistir-video ou quiser o que
  APARECE NA TELA: "assiste esse vídeo com imagem", "o que aparece na tela", "que site
  ou painel ele mostra", "esse cara tá falando verdade?" num vídeo que mostra coisa na
  tela. Pra saber só o que o vídeo fala, a rota padrão é a /transcribe, grátis.
---

# Assistir vídeo (com visão, via Gemini)

Manda o **Gemini assistir o vídeo** processando áudio + imagem (~1 frame/seg). Diferente de transcrever (só o áudio vira texto), aqui o modelo **vê a tela**: descreve ferramentas, sites, painéis e demonstrações que aparecem, com timestamps.

Funciona em qualquer projeto que tenha esta skill. Usa a `GEMINI_API_KEY` do arquivo `.env` na raiz do projeto (o `/conectar` ensina a criar a chave; é paga por uso).

## Quando usar

- O usuário cola um link de vídeo e quer saber o que dizem E o que mostram.
- Checar se o que um vídeo promete é verdade (o modo padrão já separa uma seção de "afirmações verificáveis" pra conferir depois com WebSearch).
- Tutorial onde o que importa está na tela (painel, software, passo a passo).
- Resumo, perguntas específicas, ou achar o timestamp de um trecho.

Para áudio puro (podcast, vídeo sem nada visual relevante), a skill `transcribe` também serve, e é grátis; esta aqui ganha quando a TELA importa.

## Como rodar

```bash
node .claude/skills/assistir-video/ver-video.mjs "<url ou arquivo>"
```

Opções:
- `--pergunta "..."` responde uma pergunta específica em vez da análise completa.
- `--barato` usa o flash mais novo em vez do pro. **É o que derruba o custo de verdade** (cai a qualidade da leitura de texto miúdo na tela).
- `--model gemini-3.1-pro-preview` força um modelo específico (normalmente desnecessário, ver abaixo).
- `--lowres` pede resolução de mídia baixa. Não muda o número de tokens nos modelos 3.x, então não conte com ele pra economizar; use `--barato`.
- `--baixar` força baixar mesmo sendo YouTube. `--manter` não apaga o arquivo temporário. `--so-baixar` só baixa e imprime o caminho (grátis: não chama o Gemini nem precisa de chave). `--sem-registro` não grava o custo, pra script que já anota ele mesmo (o fiscal do `/editar-video`).

O texto sai no stdout. O stderr mostra a rota usada, o modelo, os tokens e o custo em dólar. Cada chamada paga vira uma linha em `dados/custos.jsonl` sozinha.

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

NÃO é grátis, mas é barato. Vídeo é cobrado por segundo de duração: medido em 2026-10-04, uns 91 tokens de entrada por segundo de vídeo. Estimativa = segundos × 91 × preço por milhão de tokens de entrada do modelo, conferido no dia na página oficial (ai.google.dev/gemini-api/docs/pricing), nunca de memória. No dia da medição, com `--barato`, uma aula de 8 minutos saiu US$ 0,04 e uma de 28 minutos, US$ 0,13; o pro custa algumas vezes mais.

Avisar o custo aproximado antes de toda chamada e esperar o "pode ir" (regra do gate humano).

## Fluxo da skill

1. Pegar a URL (ou caminho) do argumento. Se não vier, pedir.
2. Se o usuário fez uma pergunta específica, passar via `--pergunta`. Vídeo longo sem texto miúdo na tela: considerar `--barato`.
3. Avisar o custo aproximado e esperar o "pode ir". Depois rodar o script e apresentar a análise.
4. Se o usuário pediu pra checar se o vídeo fala verdade, pegar a seção "afirmações verificáveis" e conferir cada uma com WebSearch/WebFetch antes de responder.

## Limitações

- Vídeo privado ou de conta fechada não entra (nem o YouTube não listado, nem post de perfil privado).
- Vídeo muito longo pode estourar contexto; nesse caso usar `--barato` ou pedir foco num trecho via `--pergunta`.
- Lê o que está na tela, mas não clica nem interage; é observação, não automação.
