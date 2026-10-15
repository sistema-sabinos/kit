# Molde da ficha (Passo 5)

Vai colado no prompt do subagente da ficha, que lê uma fonte só.

```
# <título>, <ano>
fonte: <obra, editora ou URL> | camada: <a-e> | idioma: <xx> | etiqueta: <verbatim|artifact|impression>
acesso: <AAAA-MM-DD> | bruto: fontes/<arquivo>
nota: <o que não abriu, convenção usada>

## O que ensina
## Princípios        (cada item com a marca e uma citação curta)
## Regras de decisão ("se X, faça Y", com a marca)
## Casos             (caso, decisão, resultado, com a marca)
## Opiniões datadas  (posição e ano)
## Traços e valores  (com a marca)
## Voz               (ritmo, conectivos, metáforas, 1 a 3 frases curtas no original, com a marca)
## Fatos e críticas  (só na camada e: fato sobre a pessoa ou crítica, com a marca)
```

A marca é a do lugar exato, nos formatos que o `conferir-citacoes --persona` aceita: `6:15` ou
`1:02:03` no vídeo ou áudio, `p. 41` na página, `§3` no parágrafo de página web (contado de cima
pra baixo no texto principal), com a URL e a data de acesso no cabeçalho. Na ficha, uma marca por
colchete (`[p. 41]`); na persona, sem colchetes e uma por parêntese (`(fonte 3, p. 41)`); duas
fontes, dois parênteses. Citação literal sempre curta, nunca um trecho inteiro do livro. O que não
está na fonte não entra. Etiqueta: `verbatim` (dito pela pessoa), `artifact` (obra da pessoa) ou
`impression` (outra pessoa descrevendo).

O `<fonte>` do nome do arquivo é um apelido curto do título, minúsculo, com hífen e sem o nome da
pessoa (`fichas/03-armas-da-persuasao.md`). O título é o do inventário. O comentário entre
parênteses depois de cada seção do molde fica fora da ficha. Seção sem nada fica com `nada na
fonte`, e os itens não se numeram.

- PDF: a marca é a página do arquivo, nunca o número impresso; nota de rodapé leva a página onde
  ela está.
- `§N` conta só parágrafo do texto principal: título, legenda, chamada, item de menu e bloco
  repetido ficam fora da conta.
- Vídeo ou áudio: um tempo só no bloco é o do começo dele; sem tempo nenhum, a fonte vira `fora`
  no inventário.
- Opinião datada leva o ano da fala. Fonte que abriu só em parte, ou trecho que é especulação, vai
  na `nota:`.
- Item que é fala de outra pessoa (apresentador, entrevistador, citação de terceiro dentro da
  obra), ou de falante incerto, leva `(impression)` no fim, mesmo em ficha `verbatim`.
- Erro óbvio de transcrição se copia como está, com `[sic]`; hífen de quebra de linha do PDF se
  junta; travessão do original vira vírgula.
- Ficha da camada e: Princípios, Regras de decisão e Opiniões datadas ficam com `nada na fonte`, e
  o que ela traz vai em Fatos e críticas.
- Página web se lê pelo texto da página aberta (WebFetch), sem script novo; docx, pedir em PDF
  (Passo 3).
