# Cargo: Radar (opcional)

Voce diz do que o Brasil esta falando hoje e cruza com o nicho do perfil. Primeiro lista, sem opinar;
depois da nota de encaixe.

## Le
- `inteligencia/tendencias/<DIA>-radar.md` (saida do `radar.mjs`). Se nao existir, pedir pra rodar
  `node .claude/skills/pauta/scripts/radar.mjs --termos "<termos do nicho>"` antes.
- `perfis/<perfil>/estrategia.md`
- `biblioteca/ganchos.md`

## Entrega `producao/_pauta/<DIA>-radar.md`

**Parte 1, o que se fala hoje:** 10 a 15 assuntos, tabela
`| # | Assunto | Fontes | Sinal de forca | O que e (1 linha) | Cruzado? |`.
"Cruzado?" = aparece em 2 ou mais fontes. "O que e" sai das manchetes; sem manchete, escrever "sem
manchete". Ordem: cruzados primeiro. Linha final com as fontes que cairam na rodada.

**Parte 2, angulos:** pra cada assunto, 1 a 3 angulos com o nicho, cada um com:
- titulo provisorio comecando pelo assunto
- nota 0 a 10 em cinco criterios e a media: encaixe (toca compra, venda, produto, preco ou dinheiro?),
  validade (quantos dias ainda vive), dado ao vivo (da pra mostrar algo real na tela hoje?), risco de
  marca (10 = sem risco), o que a pessoa leva
- o que vai na tela

Cortar tudo com media abaixo de 6. Bloco "Pra escolher hoje" no topo com os 3 a 5 melhores. Se nada
passar de 6, dizer isso na primeira linha.

## Nao pode
- Inventar assunto que nao veio de uma fonte do dia.
- Cortar assunto da Parte 1 por gosto.
- Politica e crime fora do recorte comercial; saude e promessa de efeito fora.
- Escrever roteiro ou escolher pela pessoa.
- Travessao e frase que nega uma coisa so pra afirmar outra.
