# Estilo camadas (fundo verde)

Neste estilo a pessoa é recortada do fundo verde e posta sobre um cenário. A
cada frase aparece um gráfico que explica o que ela fala: um título, um número,
uma lista, uma mensagem. O gráfico fica **atrás da cabeça** ou em um **cartão na
frente**, na altura do peito. É o que dá clareza ao vídeo e o que o faz parecer
feito por uma equipe.

**Só o Claude edita o código deste estilo.** O aluno não abre o arquivo da
composição nem mexe no motor, e não precisa entender de código. Ele grava,
escolhe o cenário, aprova o roteiro e assiste o resultado.

## A ordem das camadas, de baixo para cima

1. Cenário (imagem parada, ou em relevo 3D quando a máquina permite).
2. Gráfico de trás (atrás da cabeça da pessoa).
3. Pessoa recortada, com zoom em degrau.
4. Gráfico da frente (cartões).
5. Chamada "Seguir" e barra de capítulos.
6. Legenda no peito.
7. Voz e efeitos sonoros.

Todo elemento visível fica dentro de uma `<Camada>`. O que ficar fora dela o
fiscal não enxerga, e o fiscal é quem confere o vídeo quadro a quadro.

## Passo a passo de uma peça

`<slug>` é o nome inteiro da pasta da peça (por exemplo
`2026-10-04-como-escolher-fornecedor`).

### 1. Os arquivos de mídia, em `producao/<slug>/public/`

| Arquivo | De onde vem |
|---|---|
| `pessoa.webm` | `recortar-verde.py` (recorte com transparência) |
| `voz.wav` | `tratar-voz.py` (voz tratada) |
| `voz.alinhado.json` | transcrição alinhada ao roteiro |
| `cenario.png` | foto do aluno, ou imagem feita pela `/gerar-imagens` |
| `perfil.jpg` | foto do perfil do aluno, para a chamada "Seguir" (opcional) |

O passo a passo completo do recorte e da voz está no `SKILL.md`.

### 2. Os dados da peça, `producao/<slug>/dados.json`

Quem gera é o `paginas-camadas.py`, a partir da legenda alinhada. Ele grava a
duração, as palavras com tempo e as páginas de legenda (1 a 2 palavras por
página, porque a legenda mora numa coluna estreita). O formato de exemplo está
em `.claude/skills/editar-video/motor/exemplos/camadas-exemplo-dados.json`. Não escreva
esse arquivo à mão.

### 3. A composição, `producao/<slug>/composicao.tsx`

Copie `.claude/skills/editar-video/motor/exemplos/camadas-exemplo.tsx` para
`producao/<slug>/composicao.tsx`. O `render.mjs` copia esse arquivo, e o
`dados.json` ao lado, para dentro do motor e registra a composição sozinho.

Depois da cópia, troque tudo o que está marcado com `TROQUE` nos comentários:

| O que trocar | Como |
|---|---|
| Import dos dados | Troque `../../exemplos/camadas-exemplo-dados.json` por `./<slug>.dados.json` (com o nome inteiro da pasta). Os imports de `../camadas/kit` e `../camadas/extras` ficam como estão |
| Momentos `T` | `q("frase")` devolve o segundo em que a frase começa na fala alinhada, e `q.fim("frase")` o segundo em que acaba. Frase que não existe na fala derruba o render com o nome dela, de propósito: o tempo nunca é digitado à mão. `q("frase", 2)` pega a segunda vez |
| Zoom `DEGRAUS` | Pares `[segundo, escala]`. Use 1,0 sempre que houver título atrás da cabeça |
| Efeitos `SFX` | Um por gráfico que entra, no segundo em que ele aparece. Veja `referencias/som.md` |
| `Atras` | Os gráficos de trás, um por frase |
| `Frente` | Os cartões da frente |
| `CenarioImagem` | `cenario.png`, a foto parada atrás da pessoa |
| `ChamadaSeguir` | Foto, usuário e descrição do perfil do aluno; o toque cai no "me segue" |
| `BarraCapitulo` | Um capítulo por bloco do roteiro |

**Cenário em relevo (3D)**: fica fora nesta versão do kit, porque o modelo de
profundidade ainda não vem instalado. O exemplo usa o `CenarioImagem` (o cenário
parado) e traz o `Cenario3D` só como comentário. Deixe como está.

**Sem foto de perfil**: apague a linha do `<ChamadaSeguir ... />` e o nome dele
do import. O render quebra se o arquivo `perfil.jpg` for citado e não existir.

### 4. Escrever os gráficos

Cada frase do roteiro vira um gráfico. Os blocos prontos do kit (`Titulo`,
`Cartao`, `LegendaPeito`, `mola`, `visivel`) estão no exemplo, e o exemplo mostra
como cada um é usado. Gráfico novo que serviria para outros vídeos vale a pena
entrar no kit, em vez de ficar só nesta peça.

Regras que valem sempre:

- **Um gráfico por frase, que explica o que a pessoa fala.** Título, número,
  calendário, linha, mensagem na tela. Gráfico que só decora fica de fora.
- **Entrada com mola curta e saída em corte seco.** O `visivel` liga o gráfico
  entre dois segundos e a saída é seca.
- **Todo gráfico que entra tem efeito sonoro.**
- **Zoom da pessoa em degrau**: muda de uma vez, sem animação.
- **Título de trás** cabe entre a barra de capítulos (até y = 330) e a cabeça
  (por volta de y = 540). Palavra curta no meio some atrás da cabeça: ponha do
  lado, como o `TituloLado` do exemplo.
- **No máximo 35 % de um gráfico de trás escondido pela pessoa.** A palavra
  atrás da cabeça tem que continuar legível.
- **Gráfico da frente** fica abaixo do rosto e fora da faixa da legenda (que
  começa em y = 1240).
- **Respiro de 40 px** entre um texto e qualquer outro elemento. E cartão que
  repete a legenda é cartão que sobra.
- **Zona segura** (`referencias/zona-segura.md`): nada de texto importante
  além de x = 940, e a legenda fica em y = 1240.
- **Todo número entra conferido na fonte.** Tela que sustenta
  uma prova tem que ser execução real.

### 5. Olhar antes de seguir

Depois do render, crie a pasta `producao/<slug>/quadros/` (o ffmpeg não cria pasta),
extraia um quadro de cada troca de gráfico com o ffmpeg e olhe cada um
(ferramenta de leitura de imagem):

```
ffmpeg -y -ss <segundo> -i producao/<slug>/final/<slug>.mp4 -frames:v 1 producao/<slug>/quadros/<segundo>.png
```

Procure texto que passa de x = 940, texto sobre o rosto, gráfico escondido atrás da
cabeça, dois elementos colados. Corrija na composição e renderize de novo.

## O recorte do fundo verde

O `recortar-verde.py` troca a diferença de verde por transparência. Antes do
render inteiro, confira um quadro com `--preview <segundo>`: ele grava
`recorte.jpg` com a pessoa sobre cinza escuro. Confira:

- Sem franja verde no cabelo, na barba e nos dedos.
- Sem buraco no corpo (roupa com verde some junto com o fundo).
- Sem "aura" clara ou colorida no contorno do corpo.
- Mesa e objetos reais que estão na frente continuam de verdade.

Se sobrou verde, aumente o `--lo` e o `--hi` (fundo muito saturado aceita
valores maiores). Se comeu a pessoa, diminua. O padrão é `--lo 0.10 --hi 0.30`.

A cor da pessoa (`--filtro-pessoa`) vem **desligada**. Só ligue se o aluno pedir
ou se o vídeo gravado saiu apagado, e mostre o antes e o depois.

## Clipe de outra pessoa

O kit tem o `ClipeJCut` (o clipe aparece numa moldura, com o som entrando um
pouco antes da imagem). Todo clipe leva **legenda**: transcreva o clipe e gere as
páginas com `paginas-legenda.py`. Clipe de terceiro exige permissão ou licença: peça
a confirmação ao aluno antes de usar.
