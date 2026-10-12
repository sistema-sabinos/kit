# Molde do inventario.md

Mora só na cópia-mestra (tem o nome real, pra citar a obra; nunca vai pro `~/.claude`). O
`travar-nome.mjs` lê `pessoa:` e `nome-no-agente:`. O `medir-coleta.mjs` lê a tabela: não mudar
a ordem nem o nome das colunas.

```
# Inventário

pessoa: <nome completo>
nome-no-agente: nao
area: <expertise, ex.: persuasão>
pesquisa: <AAAA-MM-DD>

| N | camada | tipo | idioma | ano | fonte | etiqueta | status | itens | novos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | a | livro | en | 1984 | <título, editora ou caminho em fontes/> | artifact | pendente | 0 | 0 |
```

- **camada:** `a` obra própria; `b` fala longa espontânea (1 hora ou mais); `c` artigo, post,
  newsletter; `d` acadêmico; `e` terceiros (só fato e crítica).
- **etiqueta:** `verbatim` (dito pela pessoa), `artifact` (obra da pessoa), `impression` (outra pessoa
  descrevendo).
- **status:** `pendente`, `feita`, `prova` (separada pro teste, ninguém lê antes) ou `fora`
  (descartada, com o motivo na coluna fonte).
- **itens / novos:** itens da ficha e quantos o contador acrescentou ao `itens-vistos.md`
  (Passo 5). Inteiro de 0 pra cima; outra coisa vira linha torta.
- **coleta-aceita:** linha opcional no cabeçalho, só com o sim do aluno no Passo 6
  (`coleta-aceita: <AAAA-MM-DD>, <o que falta>`).

Conferir quando a coleta acabou:
```
node .claude/skills/clonar-especialista/scripts/medir-coleta.mjs <pasta>
```
