---
name: catalogo-produto
description: >
  Transforma uma lista bagunçada de produtos (planilha, texto solto, fotos de tabela)
  num catálogo limpo, consistente e pronto pra enviar a clientes. Use quando o usuário
  disser "organiza meu catálogo", "monta a lista de produtos", "deixa a tabela de
  preços apresentável", "preciso mandar o catálogo pro cliente".
---

# /catalogo-produto, Catálogo limpo pra mandar pro cliente

## Dependências

- `_contexto/empresa.md`, o que a empresa vende e pra quem
- `marca/design-guide.md`, cores e estilo, se a saída for visual
- A lista crua: planilha ou arquivo em `dados/`, texto colado, ou foto de tabela

## Workflow

### Passo 1, Entender a lista

Ler a lista crua e mapear o que existe de campo: nome, código, preço, unidade, categoria, estoque, foto. Apontar o que está inconsistente (mesmo produto escrito de dois jeitos, preço faltando, unidade misturada).

Perguntar o que não der pra inferir:

"Esse catálogo vai pra quem, e como ele chega?

Pergunto porque catálogo pra revendedor mostra preço de atacado e código; catálogo pra cliente final esconde custo e destaca benefício. E o formato muda se vai por WhatsApp (PDF leve) ou por link.

Tipo: 'mando o PDF pros lojistas no WhatsApp toda segunda', ou 'é pra imprimir e deixar no balcão'."

### Passo 2, Padronizar

- Nome de produto num padrão só: `[Produto] [variação] [tamanho/unidade]`
- Categoria consistente (agrupar o que é do mesmo tipo)
- Preço com a mesma formatação em tudo
- **Campo faltando fica marcado como [confirmar], nunca inventado**

### Passo 3, Gerar a saída

Conforme o destino:

- **PDF/impresso:** gerar HTML limpo com a identidade do design-guide (capa, categorias, tabela legível) e converter
- **WhatsApp texto:** versão em texto puro com categorias e emojis sóbrios, curta o bastante pra não virar textão
- **Planilha:** versão organizada com uma aba por categoria

### Passo 4, Rotina

Perguntar se o catálogo muda com frequência. Se sim, propor a rotina: a lista crua vive em `dados/`, e regenerar o catálogo vira um comando de uma linha sempre que mudar preço.

## Regras

- Nunca inventar preço, prazo ou especificação: o que falta vai como [confirmar] e entra numa lista de pendências no final
- Antes de entregar, conferir: todo produto tem preço? Toda categoria tem pelo menos um produto? Não sobrou [confirmar] esquecido no meio?
