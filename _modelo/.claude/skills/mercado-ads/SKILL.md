---
name: mercado-ads
description: >
  Cuida do Mercado Ads (Product Ads do Mercado Livre): raio-X das campanhas com o que
  escalar, reduzir ou pausar, montagem da primeira campanha, o freio de ACOS calculado
  pela margem, campanhas de desconto abertas pra conta, e a ata do que foi decidido.
  Só lê a conta: mexer em campanha é no painel, pela pessoa, uma ação por vez. Use
  quando o usuário chamar /mercado-ads, disser "como estão meus anúncios pagos no Mercado
  Livre", "roda o raio-x do ads", "monta minha primeira campanha", "meu ACOS está bom?",
  "mexe no teto do ads", "tem promoção do Mercado Livre pra entrar?".
---

# /mercado-ads, anúncio pago com freio

## O que essa skill faz

Lê as campanhas de Product Ads pela API, aplica as regras de
`referencias/estrategia.md` e diz, por campanha, o que fazer. Cruza com a ata
de decisões (`dados/decisoes.jsonl`) pra não recomendar hoje o que a pessoa
decidiu ontem, e cobra quando o combinado vence ou fura. Não mexe em nada: a
execução é sempre no painel, com a pessoa, por decisão do projeto (gate
humano). Se a escrita de campanha também exige selo de parceiro certificado,
não deu pra confirmar em 2026-09-24 (sem painel logado); conferir na fumaça
do plano D.

## Dependências

- Autorização do Mercado Livre no `.env`, com `ML_USER_ID`
- `ML_ADVERTISER_ID` no `.env` (o passo "Primeira vez" grava)
- `dados/ads/guard-rails.json`, o freio (o passo "O freio" monta)
- `_contexto/mercado-livre.md` e `.claude/skills/mercado-livre/referencias/precificacao.md`: margem e imposto
- `referencias/estrategia.md`: o porquê de cada regra

## Modos

### Primeira vez

```bash
node .claude/skills/mercado-ads/scripts/rodar.mjs --anunciante
```

Grava o id de anunciante no `.env`. Se disser que não há anunciante, o Mercado
Ads não está ativo na conta ou a autorização não tem permissão de publicidade:
ativar no painel e refazer a autorização pelo `/conectar`.

### O freio (antes do primeiro raio-X que for virar ação)

O ACOS de empate de um produto é a margem dele: acima disso, cada venda por
anúncio dá prejuízo. Calcular com a pessoa, a partir da margem real (o
simulador da `/montar-anuncio` e o imposto da configuração), e gravar
`dados/ads/guard-rails.json`:

```json
{ "acos_alvo": 0.10, "acos_teto": 0.14, "gasto_min_sem_conversao": 30, "orcamento_diario_max": 50 }
```

`acos_teto` fica abaixo da margem do produto mais apertado da campanha, com
folga. Desconto ligado (campanha de promoção) baixa a margem, e o teto desce
junto, na mesma hora. Campo que faltar vem do padrão de `estrategia.mjs`, e o
relatório avisa enquanto o freio for o padrão do kit.

### Raio-X

```bash
node .claude/skills/mercado-ads/scripts/rodar.mjs --dias 30
```

Grava `dados/ads/snapshots/<data>.json` e `relatorios/ads-<data>.md`.
Traduzir no chat em linguagem direta: o que está bom, o que está queimando
dinheiro, e a fila do que fazer, uma linha por campanha. Campanha com menos de
7 dias de dado está aprendendo e não se julga, a não ser que já tenha gastado
o limite sem vender: essa pausa na hora.

### Executar uma ação

Uma por vez, com o "pode ir": dizer exatamente o que clicar no painel do
Mercado Ads (campanha, campo, valor antigo, valor novo). O painel fala em ROAS
objetivo: ROAS é 1 dividido pelo ACOS (ACOS 12% é ROAS 8,3). Editar orçamento
só funciona com a campanha ativa. Quando a pessoa confirmar que fez, gravar a
decisão na ata.

### Primeira campanha

Cruzar com o último raio-X da conta (`/auditar-conta`): anunciar só produto que
já vende sozinho, com margem boa e anúncio de qualidade. Anúncio fraco com
dinheiro por trás só queima mais rápido. Propor itens, orçamento diário (até
`orcamento_diario_max`) e ROAS objetivo (a partir do `acos_alvo`); a pessoa
cria no painel e a decisão entra na ata.

### Campanhas de desconto do Mercado Livre

```bash
node .claude/skills/mercado-ads/scripts/rodar.mjs --promocoes
```

Lista o que está aberto pra conta, com prazo de adesão. `candidate` é campanha
que a conta pode entrar e ainda não entrou. Nas cofinanciadas, o Mercado Livre
banca parte do desconto. Antes de entrar: refazer a margem com o desconto no
simulador e baixar o `acos_teto` do freio na mesma hora, porque desconto e
anúncio pago saem da mesma margem.

## A ata

Toda decisão sobre campanha vira linha em `dados/decisoes.jsonl` (contrato 9),
inclusive a de não mexer, que é a mais importante e a que nenhum robô vê
sozinho. Escrever a decisão num arquivo temporário e gravar:

```bash
node .claude/skills/mercado-livre/scripts/lib/decisoes.mjs --gravar <arquivo.json>
node .claude/skills/mercado-livre/scripts/lib/decisoes.mjs --listar ads
```

```json
{ "escopo": "ads", "alvo": { "id": "<id da campanha>", "nome": "<nome>" }, "decisao": "nao_mexer", "resumo": "deixar aprender mais uma semana", "motivo": "o lance mudou há 3 dias", "baseline": { "acos_7d": 0.18 }, "reavaliar_em": "2026-10-01", "esperado": "ACOS abaixo do teto" }
```

`baseline` leva o ACOS de 7 dias do relatório do dia (é contra ele que a
decisão fura). ACOS vai sempre em fração, nunca em porcentagem inteira: 18% é
`0.18`, 150% é `1.5`. Um valor digitado entre 1 e 5 é lido como 100% a 500%,
então conferir antes de gravar. Sem `reavaliar_em`, vale 7 dias. Pra reabrir, grava-se uma
decisão nova pro mesmo alvo; linha da ata nunca se edita nem se apaga.

## Regras

- Só leitura pela API. Mexer em campanha é no painel, com a pessoa, uma ação por vez.
- Nunca prometer retorno. Falar do que os números mostram e do risco.
- Conselho ancorado no relatório do dia e na `estrategia.md`, nunca em achismo.
- Regra de plataforma envelhece (ROAS no painel, limites de campanha): conferir
  ao vivo antes de agir, e a data da conferência vai junto.
