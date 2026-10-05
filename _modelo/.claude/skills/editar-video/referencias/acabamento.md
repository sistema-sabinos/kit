# Acabamento de cinema

Acabamento é o tratamento que dá cara de vídeo profissional à imagem da pessoa:
um pouco de grão (a textura fina de filme), uma vinheta (borda levemente escura,
que empurra o olho para o rosto), ajuste de sombras e de luzes fortes, e um
borrão curto no momento do zoom. Tudo roda dentro do sistema, por shader
(efeitos de imagem feitos pela placa de vídeo), sem passo extra e sem custo.

Vale para o estilo "cenário próprio" (a composição VideoV2), onde o campo
`acabamento` do `edicao.json` controla isso. O campo está descrito em
`referencias/videov2.md`.

## Onde entra

Só na pessoa. A inserção (um print de tela, uma matéria, um gráfico) fica sem: grão em
cima de print fica sujo e dá cara de filtro. A inserção sai limpa, e isso
sustenta a prova de que aquela tela é real.

É o padrão: o vídeo que não declara `acabamento` recebe os valores abaixo. Para
desligar, escreva `"acabamento": null`.

```json
"acabamento": {
  "grao": 0.18,
  "vinheta": 0.22,
  "sombras": 0.10,
  "altas": -0.08,
  "blurMax": 18
}
```

| Campo | Faixa | O que faz |
|---|---|---|
| `grao` | 0 a 1 | Textura fina. Escala com a luz da imagem (veja abaixo) |
| `vinheta` | 0 a 1 | Escurece a borda e empurra o olho para o rosto |
| `sombras` | -1 a 1 | Positivo abre a sombra e mostra detalhe (barba, cabelo escuro) |
| `altas` | -1 a 1 | Negativo segura o estouro de luz (testa brilhando, luz de anel) |
| `blurMax` | 0 a 80 | Borrão radial, em pixels, no pico do zoom. 0 desliga |

## O grão e o fundo escuro

Quem grava com fundo preto ou muito escuro precisa de atenção ao grão. Grão
uniforme cai igual no rosto e no fundo vazio, a rede comprime o vídeo e o fundo
vira chuvisco. Por isso o grão do sistema é "premultiplicado": ele é
multiplicado pela cor da imagem e escala com a luz. Preto recebe quase nada, pele
recebe grão.

Medição feita num vídeo de teste, depois de comprimir a 3,5 Mbps (perto do que as
redes entregam). Textura média por região, quanto maior mais textura:

| Ajuste | Fundo escuro | Rosto | Razão útil (rosto sobre fundo) |
|---|---|---|---|
| sem grão | 0,735 | 1,697 | 2,31 |
| 0,06 uniforme | 1,827 | 2,446 | 1,34 |
| 0,06 premultiplicado | 0,673 | 1,611 | 2,39 |
| 0,18 premultiplicado (o padrão) | 0,655 | 2,578 | 3,93 |
| 0,30 premultiplicado | 0,697 | 5,673 | 8,14 |

O valor padrão dá mais grão no rosto que o 0,06 uniforme e deixa o fundo escuro
mais limpo do que não fazer nada. O 0,30 deixa a pele arenosa. Lição do caminho:
a escolha olhando uma imagem parada, sem compressão, estava errada. Só o teste
com o vídeo comprimido mostrou o problema.

## O borrão do zoom

O zoom da pessoa é um degrau instantâneo no corte, sem transição suave. Sem nada,
ele "pula". Com um pulso curto de borrão logo depois do corte (decai em 0,18 s),
a troca vira movimento de câmera. Medido: o quadro dentro do pulso fica cerca de
10 % menos nítido e volta ao normal sozinho. Parado, o borrão é sempre zero, então
o vídeo inteiro nunca fica borrado.

## Os valores de partida

Comparando com e sem acabamento num quadro de teste: 96 % dos pixels mudam, com
diferença média de 6,8 em 255. Ou seja, mexe em quase todo ponto, de leve. É
densidade de imagem.

A ordem dos efeitos importa e já está feita no sistema: primeiro sombras e luzes,
depois a vinheta, e o grão por último, para cair por cima de tudo. Efeito com
valor 0 nem entra, então ninguém paga shader à toa.

## Exige renderizar com a placa de vídeo

Os efeitos são feitos pela placa de vídeo (WebGL2). O `render.mjs` já liga a
flag `--gl=angle` sozinho, então o aluno não faz nada. Se um dia o render rodar
por outro caminho sem essa flag, o efeito some ou o render quebra.

## O que fica de fora por enquanto

- **Grade de cor por arquivo `.cube`** (as "LUTs" de cinema): precisa escolher e
  licenciar um arquivo. Não está no sistema.
- **Recorte de pessoa sem fundo verde**: existe como pesquisa, ainda sem teste.
- **Efeitos de estilo** (vazamento de luz, fita antiga, TV estática): servem
  para quebra de seção, e cada um precisa de motivo declarado. Não são padrão.
