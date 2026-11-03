# Decupagem: assistir o cru antes de cortar

Leia este arquivo só no passo 3.2b do `/editar-video`. Ele diz como olhar o vídeo
cru inteiro, como um editor, antes de escolher qualquer corte. O corte amador
quase sempre vem de escolher pelo texto sem ver a imagem.

## O que olhar

1. **As folhas inteiras, em ordem** (`trab/cru/folha-01.jpg` em diante). Cada
   quadro tem o segundo escrito embaixo. Leia junto com a tabela do
   `trab/cru/bordas.md`, que traz o texto de cada trecho. Se a folha mostra a
   pessoa falando num segundo que nenhum trecho cobre (fala baixa perto de
   ruído de fundo pode ficar de fora), abra o corte final até ali.
2. **A tira de cada trecho que você pensa em deixar** (`tira-01.jpg` em
   diante): três quadros em volta do começo do corte e três em volta do fim.
   Quadro com marca vermelha ("virado" ou "sem rosto") é borda ruim.
3. O que a marca não pega e só o olho vê: olho fechado no começo, mão no rosto,
   boca já aberta antes de falar, pessoa saindo do quadro, alguém passando atrás.

## As regras do corte

- **Gancho.** Os primeiros 3 segundos são a frase que promete o que o vídeo
  entrega. Se o cru começa com "oi, tudo bem" ou com a pessoa se ajeitando, isso
  sai.
- **Take repetido.** Frase gravada duas vezes ou mais: fica a última inteira,
  sem tropeço e de frente para a câmera. Se a última tropeça ou vira o rosto,
  fica a anterior. Nunca deixe as duas: frase repetida em sequência é o corte
  mais amador que existe.
- **Borda.** O trecho começa com a pessoa já de frente e termina antes de ela
  virar o rosto para ler. O `bordas.md` traz o corte sugerido (com a folga de
  sempre e sem invadir o trecho vizinho). Se a tira marca "virado" no fim,
  traga o fim para antes do primeiro quadro marcado; se marca no começo, leve o
  começo para depois do último quadro marcado. Nunca a ponto de cortar palavra:
  a última palavra termina no fim do trecho (a coluna `trecho`).
- **Palavra partida.** Texto do whisper que termina ou começa no meio de uma
  palavra ("O gritero...") é tropeço ou divisão errada. Tropeço sai. Na
  gravação corrida, pedaços vizinhos que ficam vão juntos num trecho só (o
  começo do primeiro até o fim do último), e aí a divisão errada não vira corte.
- **Cena que faz sentido.** Não deixe frase que depende de algo que saiu ("esses
  três aqui" sem nada na tela que mostre os três), nem informação dita duas
  vezes. A ordem é a do roteiro aprovado.
- **Erro de fala sai, fala solta que completa fica.** "Olha isso aqui" e "e o
  mais importante" ficam. Tropeço, palavra trocada e frase cortada no meio saem.

## O arquivo `trab/decupagem.md`

Grave sempre com estas seções, nesta ordem. O `montar-blocos.py` confere e
recusa montar sem elas.

```
# Decupagem

## Assunto
<o vídeo em uma frase: o que a pessoa leva embora>

## Gancho
<a frase dos primeiros 3 segundos e o trecho dela>

## Arco
<começo, meio e fim em três linhas>

## Takes repetidos
<cada frase gravada mais de uma vez: os trechos, o escolhido e por quê>

## Cortes

| trecho | fica | motivo |
|---|---|---|
| 19.75:24.75 | sim | gancho, inteiro e de frente |
| 142.35:143.95 | nao | tropeço e vira o rosto; repete inteiro no seguinte |
```

Na coluna `trecho` vai o **corte final** (começo e fim, em segundos, com duas
casas): é exatamente o que o `montar-blocos.py` recebe, sem folga somada. Uma
linha por trecho do `bordas.md`, com `sim` ou `nao` e o motivo em poucas
palavras. Todo trecho `sim` vai para o `montar-blocos.py`, e só eles.
