---
name: auditar-conta
description: >
  Raio-X da conta inteira do Mercado Livre: anúncio morto, sem estoque, com atributo
  obrigatório faltando, com tráfego e sem venda, fotos, descrição e título fracos,
  candidato a Full, reputação perto do limite, campanhas de desconto abertas, palavra-
  chave em alta que o título não usa, e o custo pelo Bling quando existe. Só lê a
  conta. Use quando o usuário chamar /auditar-conta, disser "roda o raio-x da conta",
  "audita a conta", "o que está puxando a conta pra baixo", "tem anúncio morto?",
  "como está minha reputação", "vale mandar pro Full?".
---

# /auditar-conta, o raio-X da conta

## O que essa skill faz

Tira uma foto da conta pela API do Mercado Livre (todos os anúncios, visitas e
vendas da janela, reputação, promoções, qualidade de cada anúncio), compara
com a foto anterior e escreve o relatório com a fila de ação, do mais grave pro
mais leve. Com Bling, cruza o custo pelo SKU e mostra a margem bruta. Não mexe
em anúncio: a execução é no painel, pela pessoa.

## Dependências

- Autorização do Mercado Livre no `.env`, com `ML_USER_ID`
- `_contexto/mercado-livre.md`: com `erp: bling`, o custo vem do Bling
- `_contexto/vereditos-legais.md`: pra conferir vereditos vencidos (passo 3)
- `dados/decisoes.jsonl`: decisões de conta em vigor tiram o anúncio da fila

## Fluxo

### 1. Rodar

```bash
node .claude/skills/auditar-conta/scripts/rodar.mjs --dias 30
```

Grava `dados/auditoria/snapshots/<data>.json`, `relatorios/auditoria-conta-<data>.md`
e `relatorios/keywords-<data>.md`. `--sem-keywords` pula a palavra-chave.
Conta grande demora (a API vai em lotes com pausa); é normal.

### 2. Conferir se a regra ainda vale

Os limites do relatório (reputação, fotos, título, Full) são regra de
plataforma e envelhecem. Antes de mandar a pessoa agir sobre um deles,
conferir ao vivo na Central de Vendedores e, se mudou, dizer e anotar a data
nova em `.claude/skills/mercado-livre/referencias/regras-ml.md`. Limite que
virou ruído ou deixou passar problema se calibra em `LIMITES`, no topo de
`scripts/diagnosticar.mjs`.

### 3. Vereditos vencidos

Ler `_contexto/vereditos-legais.md` e listar os produtos à venda cujo
veredito passou de 6 meses: "revalidar com a `/pode-vender`". Produto
regulado com veredito vencido é risco de queda do anúncio.

### 4. Apresentar

Resumo priorizado no chat, sem colar o relatório:

1. Incêndio: reputação acima do limite, anúncio sem estoque, pausado que já
   vendeu bem, atributo obrigatório faltando.
2. Conversão: tráfego que não vira venda (o problema é oferta: preço, capa, ficha).
3. Qualidade: fotos, descrição, título (título só muda antes da primeira
   venda; depois, a palavra que falta vai pra descrição).
4. Oportunidade: Full pra quem gira, campanha de desconto aberta (entrar só
   com a margem refeita no simulador), palavra-chave forte faltando.

### 5. Ação, uma por vez

Pra cada item que a pessoa quiser resolver: dizer o que mudar no painel, com
o valor novo pronto. Nada em lote sem o "pode ir" daquele item. Anúncio que a
pessoa decide aposentar ou deixar como está vira decisão na ata, pra não voltar
toda semana no topo:

```json
{ "escopo": "conta", "alvo": { "id": "<código do anúncio>", "nome": "<título>" }, "decisao": "aposentar", "resumo": "produto saiu de linha", "motivo": "o fornecedor parou de fabricar", "baseline": {}, "permanente": true }
```

Gravar com `node .claude/skills/mercado-livre/scripts/lib/decisoes.mjs --gravar <arquivo.json>`.

### 6. Fechar

Lembrar que a próxima rodada mostra o efeito na seção "Evolução". Sugestão de
ritmo: uma vez por semana, no mesmo dia.

## Regras

- Só leitura pela API. Mudança em anúncio é no painel, pela pessoa.
- A quantidade do anúncio pode estar inflada; por isso "morto" se mede por
  status, visita e venda, e nunca por estoque.
- Nunca inventar número. Visita que a API não devolveu fica "?", nunca zero.
- Sem Bling, o relatório sai sem margem; com Bling e sem custo cadastrado, o
  anúncio aparece na seção "Sem custo no Bling".
