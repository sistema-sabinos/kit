---
name: publicar-social
description: >
  Agenda um post pronto (video ou carrossel) no Instagram, TikTok e YouTube Shorts de uma vez, pelo
  Buffer, com a legenda e o titulo da pasta do post, no dia e hora escolhidos. Mostra tudo antes e so
  agenda depois do "pode ir". Use quando o usuario chamar /publicar-social, disser "agenda o video",
  "posta nas redes", "agenda o carrossel", "programa o post pra sexta", "publica nas tres redes".
---

# /publicar-social, agendar o post nas redes

## O que faz

Pega a pasta `producao/<post>/`:

- `final/` com **um** video `.mp4` (o mais novo que nao tenha `-preview` no nome) **ou** as imagens
  do carrossel (`slide-01.png`, `slide-02.png`...). Pra o TikTok, o carrossel pode ter uma versao
  em pe em `final-916/`, com o mesmo numero de imagens.
- `post.md`, com a legenda, o titulo e a descricao do YouTube e a linha `ia: sim` ou `ia: nao`
  (quem escreve e a `/pauta`; o formato esta em `producao/_molde/post.md`).

Sobe o arquivo pro deposito (Cloudinary ou R2, o que estiver no `_contexto/midia-social.md`), cria
um post agendado por rede no Buffer e anota tudo em `producao/<post>/publicacao.md`, com o comando
de desfazer. O Buffer publica na hora marcada, com o computador desligado.

Script: `node .claude/skills/publicar-social/scripts/publicar-social.mjs`.

## Primeira vez

Se o script disser "falta configurar", ele diz a chave e a secao do guia
`.claude/skills/midia-social/referencias/configurar.md`. Abrir essa secao e guiar a pessoa passo a
passo, uma conta por vez: primeiro o Buffer, depois o deposito do video. Nunca pedir pra ela colar
chave no chat: a chave vai no arquivo `.env`.

## Passos

1. **Pasta e horario.** Perguntar so o que faltar, no formato da casa:
   > "Qual post e pra quando?
   >
   > Pergunto porque o horario vai direto pras redes, e horario errado e post errado no ar.
   >
   > Tipo: 'o do moedor, sexta 11h30', ou '2026-10-10-moedor, 2026-10-10 19:30'."

   Se vier vago, listar as pastas de `producao/` que ja tem arquivo em `final/` e os horarios
   livres do `perfis/<perfil>/calendario.md`.

2. **Simular**, sem `--confirmar`:
   ```
   node .claude/skills/publicar-social/scripts/publicar-social.mjs <pasta> --quando "AAAA-MM-DD HH:MM" [--capa <segundos>] [--redes instagram,tiktok]
   ```
   Mostrar a saida inteira: arquivo e tamanho, hora em Brasilia, o texto de cada rede, o titulo do
   Short, o rotulo de IA e os avisos.

3. **Capa do video.** Sem `--capa`, a capa do Reel e do TikTok vira o primeiro quadro, que muitas
   vezes sai borrado. Oferecer tirar 3 ou 4 quadros pra pessoa escolher:
   ```
   ffmpeg -ss <segundos> -i <video> -frames:v 1 capa-<segundos>.png
   ```
   e simular de novo com o `--capa` escolhido.

4. **Gate humano.** Esperar o "pode ir". Sem ele, nada sobe nem agenda.

5. **Agendar**, repetindo com `--confirmar`. Ler a saida inteira, sem filtrar: quando uma rede
   recusa, a linha diz `FALHOU`. O script sobe toda a midia antes de mexer em qualquer post, e
   grava o `publicacao.md` depois de cada post criado ou apagado. Se uma rede falhar no meio, as que
   entraram ficam registradas: corrigir a causa e rodar de novo so com as redes que faltam
   (`--redes tiktok,youtube`), sem `--substituir`. Se a conexao cair e ele nao souber se o post
   entrou, ele pergunta ao Buffer; se nem o Buffer responder, o registro marca "incerto" e o proximo
   `--confirmar` confere sozinho antes de qualquer coisa.

6. **Fechar.** Marcar no `perfis/<perfil>/calendario.md` que o horario foi ocupado por essa pasta e
   dizer que da pra ver tudo no calendario do Buffer. Desfazer, a qualquer hora antes do horario:
   ```
   node .claude/skills/publicar-social/scripts/publicar-social.mjs --apagar <id>,<id>
   ```

## Regras e limites

- Plano gratis do Buffer: 10 posts esperando por rede. O script confere antes de subir e para se a
  fila estiver cheia.
- Horario no minimo 5 minutos no futuro, no formato `AAAA-MM-DD HH:MM`, horario de Brasilia.
- Musica vai gravada no proprio video: o Buffer nao poe audio da biblioteca do Instagram ou do TikTok.
- Post agendado nao se edita. Pra trocar, repetir com `--confirmar --substituir`: depois de subir a
  midia nova, ele apaga os antigos das redes pedidas e cria os novos (nessa ordem, porque o Buffer
  recusa post repetido no mesmo horario). Com `--redes`, so as redes pedidas sao trocadas.
- Rodar de novo uma rede que ja tem post, sem `--substituir`, e barrado: e o que impede post em dobro.
- O que esta agendado de verdade fica na secao "VALIDO AGORA" do `publicacao.md`; o Historico guarda
  cada passo. O `--apagar` tambem tira os ids de la.
- Carrossel nao vai pro YouTube (o Buffer so publica video la) e so vai pro TikTok com 4 imagens ou mais.
- Categoria do Short no YouTube: `categoria_youtube` no `_contexto/midia-social.md` (22 = Pessoas e blogs).
- O que se promete sobre o produto segue a regra do marketplace onde a pessoa vende: nada de
  promessa de efeito, cura ou resultado garantido na legenda.
