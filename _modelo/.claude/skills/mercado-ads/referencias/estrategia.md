# Estratégia de Mercado Ads

> O porquê de cada regra do `scripts/estrategia.mjs`. Os números da conta
> ficam em `dados/ads/guard-rails.json` (o freio). Regra de plataforma
> envelhece: conferido em 2026-09-24 por busca cruzada (a documentação
> oficial barrou o robô com 403). ACOS segue em porcentagem, e o painel usa
> ROAS objetivo, que substituiu o ACOS como meta central em 15/10/2025.
> Antes de agir, conferir ao vivo no painel do Mercado Ads e anotar a data
> nova.

## As métricas

- **ACOS**: gasto do anúncio dividido pela venda atribuída a ele. Precisa
  ficar abaixo da margem do produto, senão a venda por anúncio dá prejuízo.
- **ROAS**: o inverso (venda dividida por gasto). É a métrica do painel.
  ACOS 12% é ROAS 8,3; ACOS 20% é ROAS 5.
- **TACOS**: gasto de anúncio dividido pela receita inteira (anúncio mais
  orgânico). Subindo com a venda parada, o anúncio está comendo venda que
  viria de graça.

## O freio

- `acos_alvo`: abaixo disso sobra margem, e a campanha pode crescer.
- `acos_teto`: acima disso a campanha come a margem. Nunca acima da margem do
  produto mais apertado da campanha.
- `janela_minima_dias` (7): o algoritmo aprende por alguns dias depois de
  cada ajuste; antes disso nada se julga.
- `gasto_min_sem_conversao` (R$ 30): gastou isso sem vender, pausa.
- `orcamento_diario_max`: teto por campanha, pra operação que não tem gente
  olhando o dia inteiro.
- `uso_min_escalar` (70%): só vale subir verba de quem já gasta quase tudo o
  que tem. Quem gasta pouco do orçamento está travado por lance ou demanda, e
  mais verba não muda nada.

Os padrões do kit (alvo 15%, teto 25%) são ponto de partida pra margem
confortável. Margem apertada pede teto menor, e desconto ligado baixa a
margem: o teto desce junto.

## As ações

- **Escalar**: ACOS no alvo, com venda, gastando 70% ou mais do orçamento.
  Sobe o orçamento aos poucos (20% por vez).
- **Reduzir**: ACOS acima do teto. Se a campanha gasta quase todo o orçamento,
  corta verba; se gasta pouco, a alavanca é o ROAS objetivo (subir ROAS é
  baixar o ACOS aceito).
- **Pausar**: gastou o limite sem nenhuma venda, mesmo dentro da janela mínima.
- **Manter**: ACOS entre alvo e teto. Observa.
- **Aprender**: menos dias de dado que a janela mínima.

## A ata

O relatório lê `dados/decisoes.jsonl`. Decisão em vigor tira a campanha da
fila. Ela volta quando vence o prazo, quando o ACOS de 7 dias sobe 3 pontos
sobre o da decisão (`furar_acos_pp`) ou quando a campanha queima R$ 30 sem
vender desde a decisão (`furar_gasto_sem_venda`).
