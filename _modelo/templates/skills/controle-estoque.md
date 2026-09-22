---
name: controle-estoque
description: >
  Lê a planilha de estoque e devolve o que importa: o que está acabando, o que está
  parado, o que repor primeiro. Use quando o usuário disser "como está meu estoque",
  "o que preciso repor", "o que não está girando", "analisa o estoque", ou jogar uma
  planilha de estoque em dados/.
---

# /controle-estoque, O estoque falando com você

## Dependências

- Planilha de estoque em `dados/` (qualquer formato: xlsx, csv, ou até texto colado)
- Se houver histórico de vendas (outra planilha ou coluna), a análise fica muito melhor: pedir se existir

## Workflow

### Passo 1, Entender a planilha

Ler e identificar as colunas: produto, quantidade, custo, e o que mais houver. Se a estrutura for ambígua, confirmar com o usuário antes de calcular ("essa coluna 'qtd' é o que tem hoje ou o mínimo?").

Na primeira vez, perguntar:

"Quanto tempo demora entre pedir reposição e ela chegar? E tem produto com mínimo que você nunca deixa furar?

Pergunto porque o alerta certo dispara antes de faltar, não quando faltou. Se a reposição leva uma semana, eu aviso com uma semana de folga.

Tipo: 'o fornecedor entrega em 5 dias úteis', ou 'compro na cidade, reponho no mesmo dia'."

Guardar essas respostas em `dados/estoque-config.md` pra não perguntar de novo.

### Passo 2, Analisar

Com os dados que EXISTEM na planilha (nunca inventar número):

1. **Acabando:** itens abaixo do mínimo, ou abaixo do que o prazo de reposição exige
2. **Parado:** itens sem movimento (se houver histórico) ou com quantidade muito acima do giro
3. **Dinheiro imobilizado:** se houver custo, quanto está parado em cada categoria
4. **Sugestão de reposição:** o que pedir primeiro, considerando prazo do fornecedor

### Passo 3, Entregar

```
## Estoque em [data]

### Repor agora (N itens)
| Produto | Tem | Sugerido | Por quê |

### Atenção esta semana (N)
...

### Parado (N itens, R$ X imobilizado)
[itens e há quanto tempo, se o dado existir]

### Pendências de dado
[o que a planilha não tem e melhoraria a análise: histórico de vendas, custo, mínimo por item]
```

## Regras

- Só calcular com o que está na planilha; a seção "Pendências de dado" existe pra pedir o que falta, não pra chutar
- Decisão de compra é do usuário: a skill sugere, não pede pra fornecedor
- Se a planilha vier visivelmente desatualizada (data antiga, números redondos demais), perguntar antes de analisar
