# Ferramentas conectadas

O que este negócio usa e como o sistema alcança cada coisa. **"não ligada" é resposta
válida:** é assim que o sistema sabe que aquilo existe e dá pra ligar, em vez de achar
que não dá. Quem preenche: o `/setup`, na criação, com uma linha pra cada um dos sete
assuntos abaixo; depois o `/conectar`, a cada conexão concluída.

- **Ferramenta:** linha de um dos sete assuntos leva o assunto na frente ("Agenda:
  Google Agenda", "Reunião: nada").
- **Status:** `ligado`; `não ligada` (o `/conectar` diz o que liga, ou que fica com você); `só você` (a
  ferramenta existe, mas quem mexe é a pessoa, na mão); `pendente` (começou a ligar
  e falta um passo); ou `instalado` (pacote de skills, que se configura no primeiro
  uso).
- **Observação:** pra quê, e como o sistema alcança: MCP, API (só o nome da variável
  no `.env`, a chave nunca vem aqui) ou programa no computador.

| Ferramenta | Status | Ligado em | Observação |
|---|---|---|---|

## Os sete assuntos de todo negócio

Mensagem com cliente, tarefa e prazo, email, agenda, dinheiro entrando e saindo, ficha
do cliente, reunião. Cada um tem linha na tabela, mesmo que a resposta seja "nada": aí
a linha diz `não ligada` e o que o `/conectar` liga pra isso.
