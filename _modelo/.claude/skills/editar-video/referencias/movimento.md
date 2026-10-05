# Padrões de movimento (MOV-01 a MOV-03)

Movimento aqui quer dizer o que a "câmera" faz depois da gravação: cortes, zoom,
aproximação. O aluno grava parado, e a edição cria o movimento. Cada padrão
abaixo foi observado em vídeos de editores profissionais, medindo o vídeo
original e o editado lado a lado. São padrões de estilo.

Quando o vídeo é no estilo "cenário próprio" (VideoV2), os campos citados estão
no `edicao.json`, descritos em `referencias/videov2.md`.

---

## MOV-01: corte só na pausa da fala, com o enquadramento trocando a cada corte

**O que é.** A gravação é feita parada, num plano aberto. Na edição, cada pausa
entre frases vira um corte seco, e a cada corte o enquadramento troca: aberto
(1,0x), depois mais fechado (cerca de 1,25x, do peito para cima, rosto no terço
de cima), depois aberto de novo. O corte seco não se nota porque o plano mudou.
Não existe zoom animado: é uma troca seca entre dois recortes fixos.

**Por que funciona.** A pessoa fala uma frase por vez, sem decorar texto, e a
edição tira o tempo morto. A troca de plano é estímulo novo a cada 2 ou 3
segundos, que ajuda a segurar quem assiste, sem precisar de efeito sonoro nem
transição. Como o corte cai na respiração, a fala soa contínua.

**Quando usar.** Em toda fala gravada em blocos, no estilo cenário próprio.

**Quando evitar.** Em bloco que tem frase escrita atrás da cabeça, porque a
escala corta a frase nas laterais. E quando o ponto de origem do zoom fica abaixo
do topo da cabeça, porque aí o plano fechado empurra a cabeça para a barra de
cima (testado com origem em 45 % e 30 %: pior que 22 %).

**Como fazer no sistema.** Os campos `escalaCorte` (padrão 1,25), `origemPessoa`
(padrão "50% 22%", o topo da cabeça) e `escalasSeg` (uma escala fixa por bloco)
já existem. Declare `escalasSeg` com um valor por bloco: 1,0 em todo bloco que
tem frase atrás da cabeça, e 1,25 e 1,0 alternando nos outros. Não deixe dois
blocos com frase atrás colados, senão um corte fica sem troca de plano. A pessoa
vem em 1080p e o 1,25 segura sem perda de nitidez visível.

---

## MOV-02: zoom em três degraus sobre uma gravação contínua, ancorado no olho

**O que é.** A pessoa grava de uma vez só, num plano aberto. Na edição, o
recorte troca seco entre três degraus: 1,0, depois 1,15 a 1,25, depois 1,45 a
1,6. A troca sempre acontece na virada de frase, e a frase que merece ênfase
ganha o degrau mais fechado. O ponto de origem é o rosto: o olho fica na mesma
altura em todos os degraus.

**Por que funciona.** É o MOV-01 levado mais longe: troca de plano a cada frase
dá estímulo novo sem tirar a voz do lugar, e o degrau fechado sublinha a frase
importante, como se a câmera chegasse perto. Com o olho parado na mesma altura, o
corte não pula: parece outra câmera, sem salto.

**Quando usar.** Na fala do aluno em geral. O degrau mais fechado vai nas frases
com número ou virada de assunto.

**Quando evitar.** Acima do que a gravação aguenta com nitidez: o 1,25 já foi
testado em 1080p, e o 1,5 precisa de teste de qualidade antes, ou de gravação em
4K. E no bloco com frase atrás da cabeça, pela mesma razão do MOV-01.

**Como fazer no sistema.** `escalasSeg` aceita qualquer valor por bloco. Use três
valores (1,0, depois entre 1,15 e 1,25, depois entre 1,45 e 1,6) e a origem no
olho, medida num quadro do vídeo.

---

## MOV-03: abertura que assenta e empurrão lento no fecho

**O que é.** Duas animações de câmera que não existem na gravação. Na abertura, o
quadro 0 começa com zoom alto (1,35 a 1,7) e volta para 1,0 em 0,3 a 0,5 segundo,
com um pouco de borrão de movimento. No fecho, um zoom contínuo e lento de 1,0 até
1,2 ou 1,3 durante os últimos 3 a 5 segundos, sem corte.

**Por que funciona.** O primeiro meio segundo tem movimento mesmo com a pessoa
parada, e movimento no quadro 0 segura o dedo. O empurrão no fecho dá sensação de
conclusão e de proximidade na frase final, sem corte que quebre a fala.

**Quando usar.** A abertura que assenta em todo vídeo. O empurrão na última
frase, a que fecha a ideia.

**Quando evitar.** A abertura junto com um gancho em tela cheia (`cheia: true`),
onde a pessoa nem aparece. O empurrão por cima de uma lista ou de um texto que já
está se mexendo muito.

**Como fazer no sistema.** A abertura que assenta é o campo `abertura` do VideoV2,
já ligado por padrão (`{ "de": 1.4, "frames": 12 }`; `null` desliga). O empurrão é
o campo `empurrao`: `{ "deSeg": 24, "ateSeg": 29, "ate": 1.2 }` multiplica a
escala do bloco, devagar, por até 1,2 nos últimos segundos.
