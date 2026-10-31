# Orçamento do mês

> Quanto você topa gastar por mês com inteligência artificial paga. Hoje é o Gemini:
> imagem feita por IA, olho final do vídeo e vídeo do produto. O /configurar-video
> preenche este arquivo com você e mostra quantos vídeos esse valor dá, em média.

Como funciona:

- O valor fica em dólar, a moeda em que o Google cobra. A IA fala com você em reais,
  dizendo o câmbio e a data que usou.
- Antes de cada gasto a IA continua pedindo o seu "pode ir". O orçamento é um limite
  a mais: quando um gasto não cabe no que sobrou do mês, o sistema para antes de gastar
  e explica por quê.
- O mês é o do calendário do seu computador.
- Enquanto o valor estiver vazio, vale o limite por rodada de antes: o padrão do kit,
  ou o `limite_gasto_usd` do `_contexto/mercado-livre.md`, se você vende no Mercado Livre.
- Quer saber quanto já gastou no mês? Pergunte. A IA só mostra o saldo quando você pede.

O bloco abaixo é lido pelo sistema. Mude pelo /configurar-video, que confere o preço do
dia antes de gravar.

```orcamento
orcamento_mes_usd:
definido_em:
preco_segundo_usd:
preco_cena_usd:
fonte:
conferido_em:
segundos_por_video:
cenas_por_video:
media_video_usd:
```
