---
name: atendimento
description: >
  Responde as mensagens de cliente do WhatsApp e do Instagram com preço e prazo tirados
  da sua tabela, nunca de cabeça: separa o que é urgente, rascunha cada resposta no tom
  da marca, confere os números antes de mostrar e deixa você mandar. Use quando o usuário
  chamar /atendimento, colar conversas ou prints de cliente, disser "responde essas
  mensagens", "me ajuda com o WhatsApp", "quanto eu cobro pra essa cliente", "triagem do
  WhatsApp", ou quiser montar ou mudar a tabela de preços e prazos.
---

# /atendimento, WhatsApp e Instagram com a tabela na mão

Quem responde 40 mensagens por dia erra preço e promete prazo que não dá. Aqui toda
resposta de preço e prazo sai da tabela `dados/catalogo.csv`, e um script confere o
rascunho antes de ele chegar em você. **Eu rascunho, você manda.** Nada sai daqui pro
cliente.

## Dependências

- `dados/catalogo.csv`: produto, tamanho, preço, prazo em dias e observação. Sem ele,
  nenhuma resposta de preço sai (ver "Primeira vez")
- `_contexto/empresa.md`: o que vende, entrega, retirada, forma de pagamento, chave Pix
- a voz da marca (Mapa do `AGENTS.md`), com as proibições de escrita do `_contexto/preferencias.md`
- `dados/respostas-padrao.md`, se existir

## Primeira vez: a tabela

Se `dados/catalogo.csv` não existe, montar com a pessoa antes de responder qualquer
preço. Mostrar o exemplo (`.claude/skills/atendimento/referencias/catalogo-exemplo.csv`)
e perguntar, uma coisa por vez: o que vende, em que tamanhos, quanto custa cada um e com
quantos dias de antecedência precisa do pedido. Foto do cardápio ou da tabela que ela já
manda pros clientes resolve mais rápido: ler a foto e montar a partir dela. Gravar o
arquivo com ponto e vírgula entre as colunas (abre direto no Excel) e rodar:

`node .claude/skills/atendimento/scripts/atendimento.mjs validar`

Deu problema: mostrar a linha e arrumar com a pessoa. Preço mudou depois: editar a linha
na tabela, nunca só lembrar na conversa.

## Como funciona

### 1. Receber

A pessoa cola o texto das conversas ou manda prints (recortados na conversa). Pode vir
tudo junto, bagunçado. Dado de cliente fica só o necessário: primeiro nome e o pedido.

### 2. Separar

1. **Responde já:** cliente pronto pra fechar, reclamação, prazo estourando
2. **Responde hoje:** preço, prazo, sabor, disponibilidade, como funciona
3. **Precisa de você:** desconto, pedido fora da tabela, exceção, caso delicado
4. **Não precisa de resposta:** "ok, obrigado", figurinha, corrente

### 3. Rascunhar e conferir

Pras caixas 1 e 2, escrever a resposta de cada cliente na voz da marca, com preço e prazo
da tabela. Faltou dado: perguntar à pessoa, nunca inventar. Gravar os rascunhos em
`dados/atendimento/rascunho.md`, uma resposta por bloco, com uma linha em branco entre
elas, e rodar:

`node .claude/skills/atendimento/scripts/atendimento.mjs conferir dados/atendimento/rascunho.md`

- Saiu `tudo bate com o catalogo`: mostrar.
- Saiu lista de pontos: cada ponto é um valor que não é o preço do produto citado (ou,
  sem produto citado, que não está na tabela), um valor que não dá pra ler, ou um prazo
  menor que o do produto. O prazo conta a partir de hoje, inclusive "pra hoje",
  "amanhã" e dia da semana. Arrumar o que for erro meu. O que for de propósito (soma de dois
  itens, sinal, desconto que a pessoa deu) vai pra ela decidir, dito em uma linha do lado
  da resposta: "R$ 260 é bolo de 2 kg mais o cento de brigadeiro, confere?".

Pra caixa 3, uma linha com o caso e a pergunta que destrava: "Cliente quer bolo pra
amanhã e a tabela pede 3 dias. Topa encaixar?".

### 4. Entregar

```
## Responde já (N)
1. Marina pediu bolo de 2 kg pra sábado → "..."

## Responde hoje (N)
...

## Precisa de você (N)
1. [caso em uma linha + a pergunta]

## Sem resposta (N)
[só a contagem]
```

### 5. Pedido fechado vai pro caixa

Cliente confirmou o pedido na conversa e o projeto tem o `/caixa`: oferecer anotar
("anoto o pedido da Marina, bolo de 2 kg, R$ 170, entrega sábado, sinal de R$ 85 por
Pix?") e, com o sim, rodar o `pedido` do `/caixa`.

### 6. Aprender

Pergunta que apareceu 3 vezes vira candidata a resposta pronta: propor guardar em
`dados/respostas-padrao.md`, já com o preço puxado da tabela.

## Regras

- **Nunca enviar nada.** Quem manda é a pessoa
- Preço e prazo só da tabela, e o rascunho só aparece depois do `conferir`
- Reclamação: reconhecer primeiro, resolver depois, nunca discutir com o cliente
- Ligar o WhatsApp direto, sem colar conversa, é rota paga e com regras da Meta: está no
  `/conectar`, item WhatsApp. Esta skill é a rota manual, que funciona hoje e não custa nada
