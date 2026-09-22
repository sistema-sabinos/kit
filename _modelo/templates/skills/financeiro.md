---
name: financeiro
description: >
  Responde as duas perguntas que todo negócio pequeno tem e poucos sabem calcular: "por
  quanto eu preciso vender pra ter lucro de verdade?" e "esse mês fechou no azul ou no
  vermelho?". Precifica produto ou serviço com custo, taxa de canal, imposto e frete, e
  fecha o mês a partir de planilha ou extrato. Use quando o usuário disser "quanto cobrar",
  "estou tendo lucro?", "calcula minha margem", "fecha o mês", "esse produto compensa",
  "quanto sobra depois da comissão", ou jogar planilha de vendas ou custos em dados/.
---

# /financeiro, Lucro de verdade, sem achismo

## Dependências

- `_contexto/empresa.md`: o que vende, por onde vende (cada canal tem taxa própria), regime tributário se estiver anotado
- `dados/`: planilha de custos, de vendas, extrato do banco ou do marketplace, o que existir
- `_contexto/licoes.md`, seção "Dados e análise": erros de cálculo já cometidos antes

## Princípios

1. **Nenhum número de taxa ou imposto vem de memória.** Comissão de marketplace, taxa de cartão, alíquota de Simples mudam. Antes de usar qualquer percentual, perguntar ao usuário o que ele paga hoje ou verificar ao vivo na fonte oficial, e registrar a data do dado no resultado.
2. **Custo invisível entra na conta.** Frete grátis, embalagem, devolução, taxa fixa por venda, mensalidade de ferramenta, tempo do dono. O que não entra vira "lucro" que não existe.
3. **Mostrar a conta, não só o resultado.** O usuário precisa conseguir conferir e repetir sozinho.
4. Esta skill orienta decisão financeira do próprio negócio; não substitui contador nem dá parecer fiscal. Dúvida de imposto vai pro contador, com a conta pronta pra ele conferir.

## Modo 1, Precificar (produto ou serviço)

### Colher os dados (formato de 4 partes, uma pergunta por vez)

1. "Quanto custa pra você ter esse produto pronto pra vender (ou entregar esse serviço)?" (por que pergunto: é a base de tudo, e costuma estar subestimada; exemplos: "compro por R$ 18 e a embalagem sai R$ 1,50" / "gasto 3 horas por atendimento e meu hora vale R$ 80")
2. "Por onde ele é vendido e o que cada canal cobra por venda?" (por que pergunto: a mesma venda deixa lucro diferente em cada canal; exemplos: "marketplace cobra 16% mais R$ 6 fixos abaixo de R$ 79" / "Instagram com Pix, sem taxa" / "cartão em 3x cobra 4,5%")
3. "Quanto de imposto sai de cada venda?" (por que pergunto: no Simples a alíquota depende do faturamento anual, e muita gente esquece; exemplos: "meu contador disse 6%" / "sou MEI, pago fixo por mês" / "não sei" vira pendência pro contador, seguir com uma estimativa marcada como estimativa)
4. "Tem frete, devolução ou brinde que sai do seu bolso?" (por que pergunto: frete grátis é o custo que mais some da conta; exemplos: "frete grátis acima de R$ 79, me custa uns R$ 12 por pedido" / "uns 3% dos pedidos voltam")
5. "Quanto você quer que sobre por venda, em reais ou em porcentagem?" (por que pergunto: margem alvo define o preço mínimo; exemplos: "quero R$ 10 limpos por unidade" / "30% de margem")

### Calcular

Montar a conta em tabela, linha a linha, por canal:

```
Preço de venda ............ R$ X
(-) Comissão do canal ..... R$   (Y%)
(-) Taxa fixa do canal .... R$
(-) Imposto ............... R$   (Z%, dado de AAAA-MM-DD)
(-) Frete / embalagem ..... R$
(-) Devolução estimada .... R$
(-) Custo do produto ...... R$
= Sobra por venda ......... R$   (margem real W%)
```

Entregar: **preço mínimo** pra não perder dinheiro, **preço pra margem alvo**, e **ponto de equilíbrio** (quantas vendas por mês pagam os custos fixos que o usuário informar). Se o preço de mercado (o usuário informa, ou pesquisa ao vivo com aprovação) ficar abaixo do mínimo, dizer isso sem rodeio: "nesse canal, a esse preço, cada venda dá prejuízo de R$ N".

Salvar em `dados/precificacao-<produto>-<AAAA-MM-DD>.md` se o usuário quiser guardar.

## Modo 2, Fechar o mês

### Insumos

Planilha de vendas ou extrato (marketplace, banco, maquininha) em `dados/`, mais a lista de custos fixos do mês (aluguel, ferramentas, salário, pró-labore). Se só existir parte disso, fechar com o que há e marcar claramente o que ficou de fora.

### Passos

1. Ler a planilha e confirmar as colunas com o usuário antes de somar ("essa coluna 'valor' é o que o cliente pagou ou o que caiu na sua conta?").
2. Separar: receita bruta, taxas e comissões, impostos, custo de mercadoria ou de entrega, custos fixos, retiradas.
3. Devolver o resumo:

```
Fechamento de <mês/ano>

Receita bruta ............. R$
(-) Taxas e comissões ..... R$   (X% da receita)
(-) Impostos .............. R$
(-) Custo do que vendeu ... R$
= Margem bruta ............ R$   (Y%)
(-) Custos fixos .......... R$
= Resultado do mês ........ R$   (azul ou vermelho, sem eufemismo)

Faltou na conta: [o que não veio nos dados]
```

4. Apontar as 3 coisas que mais pesaram e, se houver histórico de meses anteriores em `dados/`, comparar.
5. Salvar em `dados/fechamento-<AAAA-MM>.md` e oferecer registrar o resultado no `_contexto/agora.md` (decisão da semana) ou no `estrategia.md` se mudar a prioridade.

## Modo 3, Alerta de produto que não compensa

Com planilha de vendas por produto e a precificação do Modo 1, listar o que vende bem mas deixa pouco ou nada, e o que deixa muito mas vende pouco. Uma tabela, ordenada por lucro total no período, com a coluna "o que fazer": subir preço, trocar de canal, cortar frete grátis, parar de vender.

## Regras

- Percentual usado na conta sempre acompanhado da fonte e da data
- Cálculo mostrado inteiro, nunca só o resultado
- Sem parecer fiscal: dúvida de imposto vai pro contador com a conta pronta
- Erro de cálculo corrigido pelo usuário vira linha datada em `_contexto/licoes.md`, seção "Dados e análise"
