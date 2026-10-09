---
name: analisar-catalogo
description: >
  Lê o catálogo de um fornecedor (PDF, planilha, site ou API) e gera a tabela
  estruturada dos produtos disponíveis, classificando cada um como OK, CUIDADO (regra
  específica obrigatória) ou BLOQUEADO (fora, com motivo). É a etapa 1 da esteira do
  Mercado Livre e alimenta a pesquisa de mercado. Use quando o usuário chamar
  /analisar-catalogo, disser "analisa o catálogo do [fornecedor]", "chegou catálogo
  novo", "atualiza a lista de produtos", ou colocar um arquivo novo em
  fornecedores/<fornecedor>/catalogos/.
---

# /analisar-catalogo, do catálogo bruto à tabela classificada

## O que essa skill faz

Primeira etapa da esteira. Transforma o catálogo do fornecedor numa tabela com
custo, EAN, peso e dimensões, e uma classificação por produto, pronta pra
`/pesquisar-tendencia` cruzar com o que o Mercado Livre está vendendo.
Saturação de mercado não se avalia aqui: isso é da pesquisa, com dado real.

## Dependências

- `_contexto/mercado-livre.md`: a lista `fornecedores` (cada nome é uma pasta
  em `fornecedores/`)
- `_contexto/empresa.md`: as regras do negócio (seção "Produtos bloqueados" e
  restrições do ramo, quando existirem)
- `_contexto/vereditos-legais.md`: vereditos da `/pode-vender`
- `.claude/skills/mercado-livre/referencias/contratos.md`, seção 0: as colunas
  do CSV que sai daqui

Caminhos que começam em `_contexto/` e `fornecedores/` são da raiz do projeto.

## Fluxo

### 1. Qual fornecedor

Um só por rodada. Se a configuração tem um fornecedor, é ele; se tem vários,
perguntar. Nome novo: perguntar como o catálogo chega e criar
`fornecedores/<nome>/catalogos/`, acrescentando o nome na lista `fornecedores`
de `_contexto/mercado-livre.md`.

### 2. Carregar o catálogo

- **Arquivo** (PDF, planilha, CSV, imagem): listar `fornecedores/<nome>/catalogos/`
  e usar o mais recente (maior data ou versão no nome). Confirmar em uma frase:
  "vou usar o `catalogo-2026-09.pdf`, pode ser?". Ler com a ferramenta de
  leitura; PDF que não vira texto (só imagem) pede à pessoa a planilha ou um
  export do fornecedor.
- **Planilha ou CSV do fornecedor**: preço sem `R$`, sem separador de milhar
  e com a vírgula decimal convertida pra ponto; espaço invisível (U+00A0,
  non-breaking space) trocado por espaço comum. No fim do preparo, conferir:
  quantidade de linhas da fonte igual à da tabela gerada, e soma dos preços
  da fonte igual à soma da tabela gerada; diferença aponta linha perdida ou
  número mal lido.
- **Site ou API do fornecedor**: só com credencial no `.env` do projeto (a
  pessoa diz o nome da variável). Sem credencial, parar e dizer o que falta.
  Nunca raspar site que exige login sem a pessoa pedir.

### 3. Extrair os produtos

Pra cada produto: categoria (a declarada no catálogo, reduzida a um nome curto
sem acento), nome, EAN, custo, peso em gramas, dimensões em centímetros,
variações (cores, tamanhos, sabores) e qualquer nota do fornecedor.

Dado que não está no catálogo fica vazio, com observação: "preço ilegível,
conferir com o fornecedor", "sem EAN no catálogo". Nunca inventar.

### 4. Classificar

- **OK**: sem bloqueio no catálogo; ainda passa pelo Gate 0 da `/mercado-livre` antes da pesquisa. É o padrão.
- **CUIDADO**: pode, mas com regra obrigatória. Entram aqui: produto com
  veredito PODE COM RESSALVA em `_contexto/vereditos-legais.md` (a ressalva vai
  na observação) e restrição própria do negócio anotada em
  `_contexto/empresa.md`.
- **BLOQUEADO**: fora. Veredito NÃO PODE ou INCONCLUSIVO válido, item que a
  pessoa marcou como bloqueado por experiência ruim (lista em
  `_contexto/empresa.md`), item que ela sinalizar na revisão, e produto de
  categoria regulada ainda sem veredito válido, com a observação "aguardando
  /pode-vender": ele volta pra OK ou CUIDADO quando o veredito sair.

Categoria inteira nunca é bloqueada por padrão: a política é vender e
bloquear caso a caso conforme aparecem problemas. Toda marca diferente de OK
leva observação curta com o motivo.

### 5. Gravar

`fornecedores/<nome>/catalogo-analisado.md`, tabela por categoria com as
colunas `Status | Produto | EAN | Custo | Peso | Dimensões | Variações |
Observação`, e o cabeçalho:

```markdown
# Catálogo analisado, <Fornecedor>

> Gerado por /analisar-catalogo em <AAAA-MM-DD>
> Fonte: <arquivo ou "API do fornecedor">
> Total: <N> produtos (<N> OK | <N> CUIDADO | <N> BLOQUEADO)
```

`fornecedores/<nome>/catalogo-analisado.csv`, nas colunas do contrato 0
(`status,categoria,produto,ean,custo,peso_g,dimensoes_cm,variacoes,observacao`),
com ponto decimal e campo vazio onde não há dado. É esse arquivo que as outras
skills leem.

**Modelo dropshipping** (`modelo: dropshipping` em `_contexto/mercado-livre.md`):
as fotos do produto vêm do fornecedor. Com a autorização de uso anotada em
`fornecedores/<nome>/fornecedor.md`, copiar pra `anuncios/<slug>/fotos-cruas/`
quando o produto virar anúncio. O estoque que conta é o que o fornecedor
confirma, nunca um número suposto.

### 6. Resumo no chat

```
Catálogo de <Fornecedor> analisado: <N> produtos.
  OK         <N>  prontos pra pesquisa
  CUIDADO    <N>  com regra específica (ver observação)
  BLOQUEADO  <N>  fora
Arquivos: fornecedores/<nome>/catalogo-analisado.md e .csv
Próximo passo: /pesquisar-tendencia na categoria que você quiser começar.
```

Sem listar produto por produto: a pessoa lê no arquivo.

## Regras

- Caso de fronteira vai como OK com a observação "revisar: <motivo>", pra
  pessoa decidir.
- Produto repetido em duas categorias (mesmo EAN ou nome) entra uma vez, com
  a observação "também aparece em <categoria>".
- Reclassificação pedida na revisão atualiza os dois arquivos e pergunta se a
  regra nova vai pro `_contexto/empresa.md` pra valer da próxima vez.
- Catálogo novo do mesmo fornecedor: rodar de novo; o anterior fica no
  histórico do git (`/syncar`).
