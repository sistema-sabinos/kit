---
name: cobrar
description: >
  Rascunha a mensagem de cobrança de quem ficou devendo, no tom da sua marca, com o valor
  certo e a chave Pix, pra você colar no WhatsApp. Sobe o tom aos poucos (lembrete leve,
  segundo aviso, conversa direta) e nunca ameaça nem expõe o cliente. Use quando o
  usuário chamar /cobrar, disser "cobra a Fulana", "quem eu preciso cobrar?", "me ajuda a
  cobrar sem ficar chato", "a cliente sumiu e não pagou".
---

# /cobrar, cobrança sem constrangimento

Cobrar é a parte que todo mundo adia. Aqui o rascunho sai pronto, com o valor que o
`/caixa` diz que falta, e a pessoa só cola. **Nada é enviado daqui.**

## Dependências

- `/caixa`: `node .claude/skills/caixa/scripts/caixa.mjs aberto` diz quem deve, quanto,
  há quantos dias e quantas vezes já foi cobrado
- chave Pix no `_contexto/empresa.md`. Faltou: perguntar uma vez e gravar lá
- a voz da marca (Mapa do `AGENTS.md`), com as proibições do `_contexto/preferencias.md`

## Como funciona

1. Rodar o `aberto`. Pedido que ainda não foi entregue fica de fora, porque o resto de
   um pedido futuro se acerta na própria conversa do pedido, a não ser que a pessoa peça.
2. Escolher o degrau pelo que o `aberto` mostra:
   - **Lembrete leve** (nunca cobrado): tom de quem lembra, com o valor, o item e a chave
     Pix. "Oi Marina! Passando pra lembrar do restinho do bolo de sábado, R$ 85. Chave Pix: ..."
   - **Segundo aviso** (cobrado 1 vez): direto e cordial, com o valor e pergunta de quando
     ela consegue pagar
   - **Conversa direta** (cobrado 2 vezes ou mais): pedir uma data, oferecer dividir em
     duas vezes se a pessoa topar, e dizer que o próximo pedido fica pra depois do
     acerto. A decisão de oferecer parcelamento é da pessoa, perguntar antes de escrever
3. Mostrar cada rascunho com o nome, o valor e o degrau. A pessoa cola e manda.
4. Mandou: anotar com `caixa.mjs cobrado <id>`, pra próxima cobrança subir de degrau.

## Regras que não mudam

- **Nunca enviar nada.** Quem manda é a pessoa
- Nada de ameaça, ironia, exposição em grupo ou status, mensagem pra parente, vizinho ou
  trabalho do cliente, nem cobrança em horário de descanso. A lei por trás disso está
  nos fatos `cdc-42` e `cdc-71` do `referencias/fatos.md`
- Valor sempre o do `/caixa`. Cobrar a mais tem preço (fato `cdc-42-dobro`)
- Cliente reclamou do produto na resposta: parar a cobrança e tratar a reclamação primeiro
