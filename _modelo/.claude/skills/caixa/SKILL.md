---
name: caixa
description: >
  Caixa do pequeno negócio que vende por encomenda: anota o pedido e o sinal, mostra
  quanto falta receber e quem está devendo, e fecha o mês com o que entrou de verdade.
  Use quando o usuário chamar /caixa, disser "anota o pedido da Fulana", "ela pagou o
  sinal", "caiu o Pix da Fulana", "quem está me devendo?", "quanto tenho pra receber",
  "fecha o mês", "quanto vendi esse mês", "cancela o pedido". Pra cobrar quem deve, é o
  /cobrar; pra saber se o preço dá lucro, o financeiro.
---

# /caixa, pedido, sinal e quem está devendo

Pix cai misturado, encomenda grande leva sinal e ninguém anota, e no fim do mês fica a
dúvida se sobrou dinheiro. O caixa guarda dois arquivos em `dados/caixa/`, que abrem no
Excel:

- `pedidos.csv`: cada pedido, com cliente, item, valor e dia da entrega
- `pagamentos.csv`: cada dinheiro que entrou, ligado ao pedido. Sinal e restante são duas
  linhas, então dá pra bater linha por linha com o extrato do banco

Quem grava é o script, nunca a mão: nome com vírgula ou aspas quebraria a planilha.
Abriu e salvou no Excel? Tem que ser como "CSV UTF-8"; em outro formato o acento
estraga e o script para com recado, em vez de seguir com conta errada.
Todos os comandos rodam da raiz do projeto, com
`node .claude/skills/caixa/scripts/caixa.mjs <comando>`.

## Comandos

| a pessoa diz | comando |
|---|---|
| "anota o pedido da Marina, bolo 2 kg, 170, entrega sábado, pagou 85 de sinal (já caiu)" | `pedido --cliente "Marina" --item "bolo 2 kg" --valor 170 --entrega AAAA-MM-DD --sinal 85 --forma pix` |
| "a Marina pagou o resto" | `aberto` pra achar o id, depois `pago <id> --valor 85 --forma pix` |
| "cancela o pedido do Rui" | `cancelar <id>` |
| "devolvi os 30 do sinal do Rui" | `devolvido <id> --valor 30` |
| "quem está me devendo?", "quanto tenho pra receber" | `aberto` |
| "fecha o mês" | `mes AAAA-MM` |
| "quanto entrou no ano" | `ano AAAA` |

Forma de pagamento: `pix`, `dinheiro`, `cartao` ou outra palavra curta. Data diferente
de hoje: `--data AAAA-MM-DD`. Antes de gravar pedido ou pagamento, repetir em uma linha o
que vai ser anotado e esperar o sim. Data de entrega dita como "sábado" vira data
completa, confirmada na mesma linha.

Sinal: antes de usar `--sinal`, perguntar "o sinal já caiu na conta?". Caiu: `--sinal`
com `--data-sinal` do dia do Pix, se não foi hoje. Só combinado: anotar o pedido sem
`--sinal` e, no dia em que cair, `pago <id> --valor <sinal>`. O sinal combinado aparece
no `aberto` como parte do que falta.

O script recusa pagamento maior que o que falta e sinal maior que o pedido: mostrar o
recado e conferir o valor com a pessoa, nunca contornar.

## Comprovante não é dinheiro

Print de comprovante de Pix se falsifica fácil. Antes de marcar pago um valor grande ou
de cliente novo, a pessoa confere no app do banco se o dinheiro caiu. Dizer isso uma vez,
na primeira vez que ela anotar pagamento por print.

## Fechamento do mês

`mes AAAA-MM` mostra quantos pedidos, quanto foi vendido (pelo dia do pedido), quanto
entrou (pelo dia do pagamento), quanto ainda falta desses pedidos e o recebido por forma.
Apresentar em três linhas e fechar com o que falta receber e de quem (`aberto`). Pra
saber se sobrou dinheiro depois do custo, oferecer o template financeiro pelo `/mapear`
(ele precifica e calcula a margem); o caixa só conta o que entrou.

Projeto com contador: oferecer mandar o `mes` mais os dois arquivos do mês pra ele.
`procurando contador` não conta.

## Conta pessoal e o 31º Pix

Ler a linha **Registro:** do `_contexto/empresa.md`. Se diz que o negócio ainda não tem
CNPJ (vende como pessoa física), olhar o `pix recebidos no mes` do fechamento: passando
de 25, avisar uma vez, com o fato `pix-pf-31` do `referencias/fatos.md` (do 31º Pix no mês
em diante o banco pode cobrar tarifa de quem recebe na conta pessoal). Se a pessoa quiser
saber de formalizar, explicar com os fatos `mei-abrir`, `mei-das` e `mei-teto` (abrir é
grátis e só pelo gov.br, o valor do DAS, o teto) e oferecer o `/mei` pelo `/mapear`.
Recusou: uma linha no `_memoria/decisoes.md` e o assunto não volta.

Antes de repassar qualquer número do `fatos.md`, rodar `caixa.mjs fatos`: fato com mais
de 60 dias se confere na web, em fonte oficial, e a linha se atualiza com a data nova.

## Regras

- Valor em reais, como a pessoa disser ("1.200", "1200,50", "R$ 85")
- Dado de cliente: primeiro nome basta. Telefone e endereço ficam na conversa do WhatsApp
- O `/iniciar` mostra uma linha quando tem pedido entregue há mais de 7 dias ainda
  devendo (`caixa.mjs alertas`). Cobrar é com o `/cobrar`, que só rascunha
