---
name: triagem-atendimento
description: >
  Organiza um volume de mensagens de clientes (WhatsApp, Instagram, email), classifica
  por urgência e tipo, e rascunha as respostas no tom da empresa, separando o que
  precisa de decisão humana. Use quando o usuário colar mensagens de clientes, disser
  "me ajuda com esses clientes", "responde essas mensagens", "triagem do WhatsApp",
  ou mandar prints de conversas pra responder.
---

# /triagem-atendimento, Caixa de entrada sob controle

## Dependências

- `_contexto/empresa.md`, o que a empresa vende, políticas, prazos
- a voz da marca (Mapa do `AGENTS.md`), tom das respostas, com as proibições de escrita do `_contexto/preferencias.md`
- Se existir um catálogo de produtos e preços em `dados/`, ler antes de responder qualquer pergunta de preço

## Como as mensagens chegam

O usuário cola o texto das conversas ou manda prints (recortados na parte da conversa, não a tela inteira). Não precisa de formato: pode vir tudo junto, bagunçado.

## Workflow

### Passo 1, Classificar

Separar cada mensagem em uma de quatro caixas:

1. **Responde já (urgente):** cliente esperando pra fechar compra, reclamação quente, prazo estourando
2. **Responde hoje (rotina):** pergunta de preço, prazo, disponibilidade, como funciona
3. **Precisa do humano:** negociação fora do padrão, caso delicado, decisão de exceção (desconto, devolução fora da política)
4. **Não precisa de resposta:** spam, "ok, obrigado", corrente

### Passo 2, Rascunhar

Pra caixas 1 e 2, escrever a resposta pronta de cada uma, na voz da marca (com as proibições do `preferencias.md`), usando os dados reais (preço do catálogo, prazo da política). **Se faltar um dado, perguntar ao usuário em vez de inventar.** Nunca prometer prazo, desconto ou condição que não está documentada.

Pra caixa 3, resumir o caso em uma linha e dizer por que precisa dele: "Cliente pede desconto de 20% em pedido grande, sua política não cobre isso, quanto você topa?"

### Passo 3, Entregar

Formato de saída:

```
## Responde já (N)
1. [nome/número] pediu [resumo] → resposta pronta: "..."

## Responde hoje (N)
...

## Precisa de você (N)
1. [caso em uma linha + a pergunta que destrava]

## Sem resposta necessária (N)
[só a contagem e de quem]
```

### Passo 4, Aprender

Pergunta que apareceu 3 ou mais vezes na triagem vira candidata a resposta padrão: propor salvar num arquivo `dados/respostas-padrao.md` pra próxima triagem já usar.

## Regras

- **Nunca enviar nada.** Esta skill prepara; quem envia é o usuário (gate humano)
- Resposta de preço só com fonte documentada
- Tom de reclamação: reconhecer primeiro, resolver depois, nunca debater com o cliente
