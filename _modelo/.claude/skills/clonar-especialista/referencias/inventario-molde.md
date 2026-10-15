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
fases: <AAAA-MM-DD>, <fases da carreira cobertas>

| N | camada | tipo | idioma | ano | fonte | etiqueta | status | itens | novos |
|---|---|---|---|---|---|---|---|---|---|
| 1 | a | livro | en | 1984 | <título, editora ou caminho em fontes/> | artifact | pendente | 0 | 0 |
```

- **camada:** `a` obra própria; `b` fala longa espontânea (30 minutos ou mais, contando só a
  fala dela: episódio com vários convidados conta a parte dela); `c` artigo, post, newsletter; `d`
  acadêmico; `e` terceiros (só fato e crítica).
- **ano:** o da publicação; sem data, `s/d`; reprise leva o ano da gravação original.
- **fonte:** título, e a URL quando é página web.
- **etiqueta:** `verbatim` (dito pela pessoa), `artifact` (obra da pessoa), `impression` (outra pessoa
  descrevendo). Transcrição automática ou feita por terceiro, e entrevista "editada e condensada",
  seguem `verbatim`, com nota na ficha. Coautoria é `artifact` só quando a pessoa é a primeira
  autora; senão, `impression`. Página institucional sem assinatura é `impression`; depoimento
  escrito pela pessoa é `artifact`.
- **status:** `pendente`, `feita`, `prova` (separada pro teste, ninguém lê antes) ou `fora`
  (descartada, com o motivo na coluna fonte).
- **itens / novos:** itens da ficha e quantos o contador acrescentou ao `itens-vistos.md`
  (Passo 5). Inteiro de 0 pra cima; outra coisa vira linha torta.
- **fases:** a conferência de julgamento do Passo 6 (toda fase da carreira com fonte), com a data;
  sem ela o `medir-coleta` avisa.
- **coleta-aceita:** linha opcional no cabeçalho, só com o sim do aluno no Passo 6
  (`coleta-aceita: <AAAA-MM-DD>, <o que falta>`). Abaixo da tabela não vale.

Conferir quando a coleta acabou:
```
node .claude/skills/clonar-especialista/scripts/medir-coleta.mjs <pasta>
```
