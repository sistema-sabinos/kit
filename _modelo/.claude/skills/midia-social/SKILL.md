---
name: midia-social
description: >
  Porta de entrada do pacote de midia social: configura na primeira vez (perfil da loja ou marca
  pessoal), cria as pastas do aluno e mostra o que falta e o proximo passo. Use quando o usuario
  chamar /midia-social, disser "quero comecar nas redes", "configura minhas redes", "como estao
  minhas redes". Agendar um post pronto e com a /publicar-social.
---

# /midia-social, as redes da loja (ou suas) no lugar

## O que faz

Na primeira vez, deixa o pacote pronto pra usar: pergunta se o perfil e da loja ou a sua marca
pessoal, cria as pastas onde tudo vai morar e mostra qual conta configurar primeiro. Depois disso,
vira o painel: diz o que ja esta configurado, o que falta, quantos posts estao na fila e qual o
proximo passo.

## Os comandos do pacote

| Comando | O que faz | Custo |
|---|---|---|
| `/midia-social` | configura e mostra o estado | gratis |
| `/pauta` | sugere os posts da semana e escreve o roteiro de cada um | gratis (Gemini opcional) |
| `/decupar-referencia` | desmonta um video que voce gostou em ficha | gratis (Gemini opcional) |
| `/publicar-social` | agenda o post pronto no Instagram, TikTok e YouTube | gratis |
| `/auditar-instagram` | raio-x da conta e medicao do post 7 dias depois | gratis |
| `/gerenciar-youtube` | le o canal e troca titulo e descricao | gratis |
| `/carrossel` | transforma o roteiro aprovado em slides prontos (PNG) | gratis |

O caminho de um post: `/pauta` escreve o roteiro em `producao/<post>/`, o video e feito (pelo motor
de video do SabinOS, por um editor ou no celular) ou o carrossel sai pela `/carrossel`, e o arquivo pronto vai em
`producao/<post>/final/`, o `/publicar-social` agenda, e 7 dias depois o `/auditar-instagram --medir`
conta o resultado.

## Primeira vez (sem `_contexto/midia-social.md`)

1. Perguntar, no formato da casa:
   > "O perfil que vamos cuidar e o da loja ou a sua marca pessoal?
   >
   > Pergunto porque muda o tipo de ideia que a /pauta sugere: perfil de loja mostra produto e
   > responde duvida de comprador; marca pessoal ensina e mostra bastidor.
   >
   > Tipo: 'da loja', 'o meu pessoal', ou 'da loja, mas quero aparecer nos videos'."

   Sem resposta clara, o padrao e `loja`.
2. Perguntar o nome curto do perfil (vira nome de pasta, ex.: `lojaacme`).
3. Perguntar quantos posts por semana, sugerindo 3: "constancia vale mais que volume, da pra subir depois".
4. Rodar:
   ```
   node .claude/skills/midia-social/scripts/iniciar.mjs --modo <loja|pessoal> --perfil <nome> --ritmo <n>
   ```
   Ele cria o `_contexto/midia-social.md` e as pastas `perfis/<nome>/`, `inteligencia/`,
   `biblioteca/` e `producao/_molde/`, sem apagar nada que ja exista. Mostrar o que foi criado.
5. Oferecer o proximo passo: preencher a bio (`perfis/<nome>/`) e, so se o perfil fala diferente da
   marca, o `tom.md`, ou ligar o Buffer
   (secao "Buffer" de `.claude/skills/midia-social/referencias/configurar.md`).

## Estado (quando o pacote ja esta configurado)

1. Ler o `_contexto/midia-social.md` e o `.env` e dizer, em linguagem simples, o que esta pronto e o
   que falta (Buffer, deposito do video, Instagram, YouTube), apontando a secao do guia de cada um.
2. Com o Buffer ligado, rodar `node .claude/skills/midia-social/scripts/canais.mjs` (so leitura) e
   conferir que as redes continuam conectadas.
3. Olhar o retrato mais novo em `dados/instagram/<perfil>/` e as pastas de `producao/` com post
   agendado ha 7 dias ou mais e sem a secao "Resultado" no `brief.md`: sugerir o `--medir`.
4. Sugerir o proximo comando.

## Custo

So o Gemini e pago, e e opcional. Antes de qualquer uso, o comando diz quanto vai custar e espera o
"pode ir". Todo gasto vira uma linha em `dados/custos.jsonl`. O Gemini assistindo video (pelo
`ver-video.mjs` da `/assistir-video`) anota sozinho; outro gasto pago anota com:
```
node .claude/skills/midia-social/scripts/lib/custos.mjs --servico "<servico>" --usd <valor em dolar> --tokens <n>
```

## Chrome dedicado

A coleta da /pauta e a /decupar-referencia leem paginas publicas do Instagram por um Chrome separado,
o mesmo do pacote Mercado Livre quando ele existe. Uma vez por projeto:
```
npm install --prefix .claude/skills/midia-social
node .claude/skills/midia-social/scripts/abrir-chrome.mjs
```

## Regras

- Nada publica sem o "pode ir" da pessoa naquele momento.
- Nunca logar no Instagram pra coletar: so pagina publica.
- Copiar o principio de um post de sucesso, nunca a frase.
- Chave e senha vao no `.env`, nunca no chat.
