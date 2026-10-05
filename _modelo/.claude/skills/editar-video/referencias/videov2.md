# Estilo cenário próprio (VideoV2): o arquivo `edicao.json`

Neste estilo a pessoa aparece em tela cheia, no cenário em que gravou. A edição
põe por cima: zoom em degraus a cada frase, uma palavra-chave grande, cartões
com números, a legenda, flashes na troca de assunto e os efeitos sonoros.

O Claude escreve um arquivo por vídeo, `producao/<slug>/edicao.json`, e o
`preparar-props.py` transforma esse arquivo em `producao/<slug>/props.json`, que é
o que o `render.mjs` lê. Quem escreve o `edicao.json` é sempre o Claude. O aluno
só aprova o resultado.

```
node .claude/skills/editar-video/scripts/py.mjs preparar-props.py producao/<slug>/edicao.json producao/<slug>/props.json --public-dir producao/<slug>/public --midia <_video>/midia
```

O `--midia` é a pasta de mídia da biblioteca (para achar os efeitos sonoros).
Todos os nomes de arquivo dentro do `edicao.json` são relativos à pasta
`producao/<slug>/public/`.

## Os dois truques do `preparar-props.py`

**1. Tempo por palavra.** Qualquer campo de tempo (`deSeg`, `ateSeg`, `seg`,
`aSeg`) pode ser um número, ou um objeto que aponta uma palavra da fala:

```json
{ "palavra": "prazo", "depois": 0, "fim": false, "mais": -0.1 }
```

Isso vira o segundo em que a palavra "prazo" começa na legenda alinhada, a partir
do segundo `depois` (útil quando a palavra se repete). Com `"fim": true` vira o
segundo em que ela termina. O `mais` soma ou subtrai segundos (aqui, entra 0,1 s
antes). Palavra que não existe na legenda derruba o script com o nome dela, para a
chave nunca entrar no lugar errado em silêncio. Tempo na mão só onde não há fala
para ancorar.

**2. Efeito sonoro com volume medido.** Cada item de `sfx` que traz `dbVoz`
ganha volume calculado pela voz. O som tratado vai para `public/sfx-mix/` e o item
sai com volume 1. Item sem `dbVoz` passa como veio.

## Campos obrigatórios

| Campo | O que é |
|---|---|
| `pessoa` | O vídeo da pessoa, 1080x1920 a 30 quadros (por exemplo `pessoa.mp4`) |
| `voz` | A voz tratada (por exemplo `voz.wav`) |
| `legendas` | A legenda alinhada (por exemplo `voz.alinhado.json`) |

## Campos comuns

| Campo | Padrão | O que faz |
|---|---|---|
| `duracaoSeg` | duração da voz | Duração do vídeo, em segundos |
| `cortesSeg` | `[]` | Segundos em que o plano troca (as pausas cortadas) |
| `escalasSeg` | alterna 1,0 e 1,25 | Uma escala de zoom por bloco. Precisa ter `cortesSeg` mais um valores. 1,0 em todo bloco com frase atrás da cabeça |
| `escalaCorte` | 1,25 | Escala do plano fechado, quando `escalasSeg` não vem |
| `origemPessoa` | `"50% 22%"` | Ponto de onde o zoom cresce (topo da cabeça) |
| `alturaTela` | 0 | Altura do painel de cima. 0 é quadro inteiro, que é o normal neste estilo |
| `recorteTopoPessoa` | 0 | Corte do topo da pessoa. 0 com quadro inteiro |
| `topoLegenda` | 1240 | Altura da legenda, em pixels. Veja `referencias/zona-segura.md` |
| `chaves` | `[]` | Palavras-chave grandes (abaixo) |
| `cartoes` | `[]` | Cartões de texto em tela cheia (abaixo) |
| `flashes` | `[]` | Clarão de 2 quadros na troca de assunto: `{ "seg": 3.2 }`, com `cor` opcional |
| `sfx` | `[]` | Efeitos sonoros (abaixo) |
| `abertura` | `{ "de": 1.4, "frames": 12 }` | O vídeo começa com zoom 1,4 e assenta em 12 quadros. `null` desliga |
| `empurrao` | nenhum | Zoom lento no fecho: `{ "deSeg": 24, "ateSeg": 29, "ate": 1.2 }` |
| `acabamento` | valores de `referencias/acabamento.md` | Grão, vinheta e ajuste de luz. `null` desliga |
| `filtroPessoa` | nenhum | Cor da pessoa, como texto de filtro (`"saturate(1.2) contrast(1.1)"`). Só se o aluno pedir ou o vídeo saiu apagado |

## `chaves`: a palavra-chave

A palavra grande que aparece quando a pessoa fala algo importante.

```json
{ "apoio": "o primeiro critério", "chave": "PRAZO", "deSeg": { "palavra": "prazo", "mais": -0.1 }, "ateSeg": { "palavra": "prazo", "fim": true, "mais": 0.6 }, "topo": 400 }
```

| Campo | O que é |
|---|---|
| `apoio` | Frase curta em cima da palavra (opcional) |
| `chave` | A palavra grande |
| `deSeg`, `ateSeg` | Quando entra e quando sai |
| `topo` | Altura em pixels |
| `cor` | Cor da palavra (padrão amarelo) |
| `tamanho` | Tamanho da fonte (padrão 170) |

Três cuidados:

- **Largura se calcula.** A chave não quebra linha: texto largo demais sai cortado
  nas duas bordas. Largura estimada igual a 0,62 vezes o tamanho vezes o número de
  letras, com alvo abaixo de 1000 px dos 1080. Estourou, encurte o texto primeiro e
  só depois baixe o tamanho.
- **Onde pôr.** Meça o topo da cabeça num quadro do vídeo. Se o texto (apoio mais
  chave) não couber acima dela, ponha a chave no peito (`topo` por volta de 1060,
  acima das mãos e da legenda). Nunca sobre o rosto.
- **Perto de um corte.** Se a chave começa a menos de 0,5 s de um corte, comece na
  palavra anterior e deixe atravessar o corte por cerca de 0,5 s.

Para conferir um quadro, olhe 0,45 s depois da entrada. Aos 0,15 s, nos primeiros
quadros, a barra amarela varre o lugar da palavra e parece um bloco sólido.

## `cartoes`: o cartão em tela cheia

Um fundo escuro com linhas de texto grandes, para um número ou uma frase que
precisa de destaque.

```json
{ "deSeg": 12.0, "ateSeg": 14.5, "linhas": [ { "texto": "R$ 52", "cor": "#FFE600", "tamanho": 200 }, { "texto": "por unidade", "tamanho": 90, "aSeg": 0.4 } ] }
```

`aSeg` é quantos segundos depois do começo do cartão a linha entra. As linhas
também não quebram: valem a mesma conta de largura da chave.

## `sfx`: os efeitos sonoros

```json
{ "arquivo": "biblioteca/sfx/pop.wav", "seg": { "palavra": "prazo", "mais": -0.1 }, "dbVoz": -12, "importante": false, "duracaoSeg": 1.0 }
```

| Campo | O que é |
|---|---|
| `arquivo` | `biblioteca/sfx/<nome>.wav` (o render copia o que está citado) |
| `seg` | O segundo em que o pico do som deve cair. O script recua o arquivo para o pico bater |
| `dbVoz` | Quantos dB abaixo da voz o efeito toca. Sem esse campo, o item passa como veio |
| `importante` | `true` garante ataque pelo menos 4,5 dB acima da voz. Use em poucos |
| `duracaoSeg` | Quanto do som usar (padrão 1 s) |
| `volume` | Só para item sem `dbVoz`: de 0 a 1 (padrão 0,4) |

A escolha dos sons está em `referencias/som.md`.

## `segmentos`: imagem ou vídeo em cima da fala (inserção)

Cada item é um trecho de prova que cobre a pessoa: um print de tela, um clipe, uma
foto.

| Campo | O que é |
|---|---|
| `deSeg`, `ateSeg` | Quando aparece |
| `tipo` | `"video"` ou `"imagem"` |
| `arquivo` | O arquivo, em `public/` |
| `tam` | `{ "w": 1080, "h": 1920 }`, o tamanho do arquivo original |
| `cheia` | `true` põe em tela cheia (o normal neste estilo, com `alturaTela` 0) |
| `crop` | Recorte do original: `{ "x", "y", "w", "h" }` |
| `offsetSeg` | Quantos segundos pular do começo do clipe |
| `velocidade` | 1 é normal; 2 é o dobro |
| `zoom` | Aproximação lenta: `{ "de": 1, "ate": 1.12, "origem": [50, 30], "duracaoSeg": 0.3 }` |

Clipe de outra pessoa mostra-se inteiro dentro do quadro (sem cortar cabeça nem
rosto de quem aparece). A inserção em tela cheia não tem teto de porcentagem: entra
o que faz sentido ser mostrado.

Os campos `palavras`, `lista`, `circulos`, `riscos` e `rotulos` desenham sobre o
painel de cima e só aparecem quando `alturaTela` é maior que 0. Neste estilo,
com quadro inteiro, use `chaves` e `cartoes` no lugar.

## Exemplo completo

```json
{
  "pessoa": "pessoa.mp4",
  "voz": "voz.wav",
  "legendas": "voz.alinhado.json",
  "cortesSeg": [3.2, 6.8],
  "escalasSeg": [1.0, 1.25, 1.0],
  "chaves": [
    { "apoio": "o primeiro critério", "chave": "PRAZO", "deSeg": { "palavra": "prazo", "mais": -0.1 }, "ateSeg": { "palavra": "prazo", "fim": true, "mais": 0.6 }, "topo": 400 }
  ],
  "flashes": [ { "seg": 3.2 } ],
  "sfx": [
    { "arquivo": "biblioteca/sfx/pop.wav", "seg": { "palavra": "prazo", "mais": -0.1 }, "dbVoz": -12 },
    { "arquivo": "biblioteca/sfx/whoosh-curto.wav", "seg": 3.2, "dbVoz": -14 }
  ]
}
```

O `duracaoSeg` sai da voz quando não vem. Os outros campos ficam com o padrão.
Um exemplo menor, já no formato de props, está em
`.claude/skills/editar-video/motor/exemplos/videov2-exemplo.json`.
