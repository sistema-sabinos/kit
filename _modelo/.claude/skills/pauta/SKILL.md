---
name: pauta
description: >
  Monta a pauta da semana de posts (Reels e carrosseis) a partir do que deu certo em perfis que a pessoa
  acompanha e, no perfil de loja, das perguntas reais dos compradores. Entrega a pasta de cada post com
  brief, roteiro (o pedido pra quem faz o video) e texto de publicacao, com duas aprovacoes da pessoa no
  caminho. Use quando o usuario chamar /pauta, disser "ideias pra semana", "o que eu posto", "o que a
  gente grava", "garimpa a base", "pauta da semana", ou mandar um perfil do Instagram pra entrar na base.
---

# /pauta, o que postar na semana

Copia o principio do que deu certo (assunto, gancho, estrutura) e escreve na voz do perfil. Nada
publica: a publicacao e do `/publicar-social`, com o "pode ir".

## Antes de comecar

1. Sem `_contexto/midia-social.md`, rodar a `/midia-social` primeiro.
2. Ler do config: `modo` (loja ou pessoal), `perfil` e `ritmo` (posts por semana).
3. Ler `.claude/skills/pauta/melhorias.md` e aplicar o que estiver em "entra no proximo".
4. `DIA` = hoje (AAAA-MM-DD). Criar `producao/_pauta/` se nao existir.
5. Base vazia (`inteligencia/base-ideias/README.md` sem perfil na tabela): pedir 3 a 6 perfis no
   formato da casa, explicando que sao a fonte de formato, e seguir pelo passo 0 com cada um.

## Custo

Tudo e gratis por padrao: a analise dos videos usa a transcricao (feita no computador pela
`/transcribe`) e a pagina publica. Antes do passo 2, oferecer uma vez:
> "Da pra fazer a analise com mais qualidade usando o Gemini, que ve a imagem do video alem de ouvir.
> Nesta rodada sao <n> videos, uns <m> minutos no total; custa em torno de R$ <x>. Quer, ou sigo no gratis?"

Estimar o valor pela duracao somada e pelo preco por token do modelo que a `/assistir-video` escolhe,
conferido na pagina de precos do Google na hora (nunca de memoria). So rodar com o "pode ir". Depois,
registrar o gasto real (a `/assistir-video` imprime os tokens) com:
```
node .claude/skills/midia-social/scripts/lib/custos.mjs --servico "gemini (pauta)" --reais <valor> --tokens <n> --nota "<perfil>"
```

## Como despachar um cargo

Subagente `general-purpose` com o prompt = conteudo inteiro de `.claude/skills/pauta/cargos/<cargo>.md`,
mais no fim:

```
## Entradas desta rodada
- DIA: <DIA>
- modo: <loja|pessoal>
- perfil: <perfil>
- <caminhos e decisoes desta rodada, um por linha>
Responda no chat so com o caminho do arquivo gravado e 3 linhas de resumo.
```

Analistas rodam em paralelo (um por perfil). O resto, um por vez, lendo a saida antes do proximo.

## Passo 0, perfil novo na base (quando a pessoa mandar um)

`node .claude/skills/pauta/scripts/frequencia.mjs --perfis <perfil>`, anotar no
`inteligencia/base-ideias/README.md` o que a pessoa gosta nele, e seguir os passos 1 e 2 so com esse perfil.
O Chrome dedicado precisa estar aberto (secao "Chrome dedicado" da `/midia-social`).

## Passo 1, coleta (gratis)

Com os codigos que a `frequencia.mjs` listou, os posts dos ultimos 4 dias (teto de 10 por perfil):
```
node .claude/skills/pauta/scripts/coletar.mjs --perfil <perfil> --reels <c1,c2> --posts <c3,c4>
```
Perfil coletado ha menos de 4 dias: pular. A coleta so le pagina publica, nunca loga.

## Passo 2, Analistas (um por perfil, em paralelo)

Despachar `cargos/analista.md` com o perfil, a linha do que a pessoa gosta e a rota (gratis ou Gemini).
Saida: `inteligencia/base-ideias/<perfil>.md`. Ficha com menos de 4 dias: pular.

## Passo 2b, opcionais

- **Garimpo aberto** (assunto quente fora da base):
  ```
  node .claude/skills/pauta/scripts/garimpo.mjs --sementes <a,b> --dias 4 --posts 9 --teto 18 --piso 300
  ```
  Semente boa e perfil de pessoa ou loja do nicho; menos de 5 relacionados e sinal de semente ruim.
  Pra juntar levas: `node .claude/skills/pauta/scripts/refiltrar.mjs --dias 4 --piso 300 --tag 4dias <arquivo1> <arquivo2>`.
- **Radar** (noticias e assuntos do dia):
  ```
  node .claude/skills/pauta/scripts/radar.mjs --termos "<termos do nicho>"
  ```
  e despachar `cargos/radar.md`.

## Passo 3, Garimpeiro

No modo `loja`, rodar antes `node .claude/skills/pauta/scripts/perguntas.mjs`: lista as perguntas reais
dos compradores que a `/espionar-concorrente` juntou. Sem pergunta (sem o pacote Mercado Livre ou sem
briefing), dizer isso e seguir so com os perfis. Despachar `cargos/garimpeiro.md` com o numero de ideias
(o dobro do `ritmo`, pra sobrar escolha) e o caminho das perguntas. Saida: `producao/_pauta/<DIA>-ideias.md`.

## Gate 1, a pessoa escolhe (espera)

Mostrar so o bloco "Pra escolher" (uma linha por ideia) e perguntar no formato da casa:
> "Quais vao essa semana?
>
> Pergunto porque a escolha define roteiro e dia de cada post.
>
> Tipo: '1, 4 e 7', 'o 5, mas mostrando o produto na mao', ou 'garimpa de novo, nada me pegou'."

Resposta vaga ("vai ai") = as melhores por media ate fechar o `ritmo`, dizendo quais.

## Passo 4, Roteirista (um por ideia, em paralelo)

Despachar com o bloco inteiro da ideia nas entradas. Saida em `producao/<DIA>-<assunto>/`:
`brief.md`, `roteiro.md` e `post.md` (formato em `producao/_molde/`).

## Passo 5, Revisor (um por pasta)

Saida: `producao/<DIA>-<assunto>/revisao.md`. `FALTA`: despachar o Roteirista de novo com a revisao nas
entradas, depois o Revisor. Ate 2 voltas; na terceira, mostrar o impasse e perguntar.

## Gate 2, a pessoa aprova o roteiro (espera)

Mostrar o titulo, a mensagem em uma frase (o que a pessoa leva) e a fala dos blocos (carrossel: os
slides). Perguntar se aprova ou muda algo, explicando que depois daqui vem a gravacao, e mudanca depois
vira regravacao.

## Passo 6, entrega

Dizer que as pastas estao prontas em `producao/`, e que o video (ou as imagens do carrossel) sai pelo
motor de video do SabinOS quando ele estiver instalado, ou gravado e editado pela pessoa; o arquivo
pronto vai em `producao/<pasta>/final/`, e dai o `/publicar-social` agenda. Marcar no
`perfis/<perfil>/calendario.md` qual pasta toma qual horario.

## Passo 7, melhorias

No fim, escrever no `melhorias.md` desta pasta: o que atrasou, o que a pessoa pediu pra mudar, o que
entra no proximo. Sete dias depois de cada post publicado, sugerir o `/auditar-instagram --medir`.

## Regras que nao se negociam

- Gate humano nos dois pontos marcados.
- Uma peca por vez quando a pessoa nao esta pra aprovar: escrever uma, mostrar, e so comecar a
  segunda depois do retorno. Duas no escuro dobram o desperdicio.
- Nunca logar no Instagram pra coletar. So pagina publica.
- Principio se copia, frase nao. O modelo esta em `.claude/skills/pauta/modelo-copia.md`.
- Todo numero dito no post sai de fonte conferida no dia (pagina oficial, anuncio, nota fiscal da
  operacao da pessoa), com fonte e data no brief. Nada de memoria.
- No modo loja, nada de promessa de efeito, cura, saude ou resultado garantido que a regra do
  marketplace ou da ANVISA proibe.
- Politica e crime so com angulo comercial e sem lado.
- Sem travessao e sem frase que nega uma coisa so pra afirmar outra, em tudo que sai daqui.
