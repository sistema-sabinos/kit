# Lista de lacunas do conselheiro

Quando o conselheiro precisa deduzir porque o material da pessoa não cobre o tema, ele marca a
dedução na resposta e anota o tema (item 4 do "Como respondo"). Ele nunca pesquisa a pessoa na
internet no meio da resposta: frase achada assim entraria sem ficha, sem conferência e sem teste.
Quem pesquisa é o "atualiza o <apelido>", depois, pelo caminho de sempre.

## Onde fica

- No projeto aberto, `inteligencia/conselheiros/<apelido>/lacunas.md`, uma linha por dedução
  (`- AAAA-MM-DD HH:MM:SS | <tema>`), gravada pelo
  `node .claude/skills/clonar-especialista/scripts/lacunas.mjs anotar <apelido> "<tema>"`. Toda
  dedução vira linha; quem não repete é o `juntar`. Só tema e data, nenhuma frase da pessoa.
- Na cópia-mestra, `lacunas.md`, a tabela que junta os projetos:

```
# Lacunas

| tema | anotada | status | marcada | fichas |
|---|---|---|---|---|
| <tema> | <data e hora da anotação> | aberta | | |
```

Status: `aberta`, `coberta` (as fichas novas cobriram) ou `sem-fonte` (a pessoa não falou disso
em nenhum material legível). Tema fechado que volta a ser deduzido depois da marcação reabre numa
linha nova.

## "Atualiza o <apelido>" com lacuna aberta

1. `node .claude/skills/clonar-especialista/scripts/lacunas.mjs juntar <pasta>` (já rodou no Passo 2):
   mostrar os temas `aberta` em lista simples.
2. Passo 4, só nesses temas: buscar no material da pessoa (camadas a a d; terceiro só pra fato) o
   que fala de cada um, listar as fontes novas no fim do inventário e mostrar a estimativa com o
   "pode ir". Tema sem nenhuma fonte legível fica pra `sem-fonte`.
3. Passos 5 a 10 como no acréscimo de material: fichas, `medir-coleta`, persona remontada (o que
   virou fonte deixa de ser dedução; o que segue sem fonte vai pra seção Limites), as quatro travas,
   rodada nova da bateria, carimbo e reinstalação com o ok.
4. Depois de instalado, fechar cada tema:
   `node .claude/skills/clonar-especialista/scripts/lacunas.mjs marcar <pasta> "<tema>" coberta "24, 25"`
   (os N das fichas que cobriram) ou `... marcar <pasta> "<tema>" sem-fonte`.

O `juntar` lê o projeto aberto e, com a cópia-mestra na pasta-mãe, todos os projetos dela; não
apaga nada nos projetos.
