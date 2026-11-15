---
name: diretoria
description: >
  Reúne a Diretoria do negócio: até quatro cadeiras (Dinheiro, Vendas, Operação,
  Regras e, quando a dúvida pede, Pessoas ou Marca e Conteúdo) leem o projeto cada
  uma pelo seu ângulo, o Pé no Chão procura o que todas deixaram passar, e a
  resposta sai em quatro partes, com o risco à vista. Custa umas 6 conversas
  normais e uns 3 minutos, então só roda com o sim, depois do aviso. Oferecer
  (nunca rodar sozinha) quando a pessoa vai gastar, contratar ou assinar algo do
  negócio, no check-up do mês do negócio, quando ela diz que o negócio mudou de
  fase e no "Como foi?" de uma decisão antiga da Diretoria. Rodar quando a pessoa
  chamar /diretoria ou disser "chama a diretoria", "leva pra diretoria", "reunião
  da diretoria". Dúvida do dia a dia fica na conversa normal.
---

# /diretoria, a reunião antes da decisão cara

Quem toca o negócio sozinho decide preço, gasto, fornecedor e contratação olhando de um
ângulo só. A Diretoria junta os ângulos antes do sim: cada cadeira lê o projeto procurando o
que pode dar errado do lado dela, o Pé no Chão procura o que todas deixaram passar, e a
pessoa recebe uma resposta só, simples, com a conta mostrada e o risco à vista.

Quem conduz a reunião é o **Facilitador**: é esta conversa, com esse nome quando fala da
reunião. Ele não é cadeira e não dá parecer próprio; ele monta o pacote, chama as cadeiras,
junta e escreve a resposta.

## Quando entra

Só com o sim da pessoa, depois do aviso do Passo 1. São quatro entradas:

1. **Decisão:** a pessoa vai gastar, contratar ou assinar algo do negócio (comprar lote,
   pôr verba em anúncio, fechar com fornecedor, contratar gente, assinar contrato com
   cliente ou marca, abrir ou mudar o MEI).
2. **Check-up do mês do negócio:** uma vez por mês, o `/iniciar` oferece. A dúvida da
   reunião é "como o negócio está este mês e o que mudar". O check-up do sistema é o
   `/checar`, que é outra coisa.
3. **"Mudei de fase":** a pessoa diz que o negócio mudou de momento, ou o `/atualizar` vai
   trocar a Fase do `_contexto/estrategia.md`. A dúvida é "o que muda daqui pra frente".
4. **"Como foi?":** uma decisão tomada depois de uma reunião passou de 30 dias e o
   `/iniciar` oferece rever. A dúvida é "a decisão deu certo, e o que fazer agora" (Passo 7).

Fica de fora, com uma linha dizendo que a conversa normal resolve: dúvida do dia a dia
(como escrever um post, que horas postar, como responder um cliente), pergunta que já tem
skill própria e não envolve gasto, contratação ou contrato, e pessoa sem negócio (emprego
CLT, estudante, carreira). A versão pra carreira ainda não existe.

Robô do `/agendar`, rotina agendada e sessão sem gente na frente nunca rodam a reunião: ela
precisa da pessoa pra dizer sim no aviso e pra decidir no fim.

Não existe versão curta da reunião. Quem quer só uma opinião segue na conversa normal.

## Passo 1, o aviso

Antes de qualquer leitura, uma mensagem curta:

"Posso levar isso pra Diretoria: até cinco leituras do seu projeto, cada uma de um ângulo
(dinheiro, vendas, operação, regras e um olhar de fora no fim). Leva uns 3 minutos e gasta
umas 6 conversas normais da sua cota. Quer?"

(Os números vêm do teste de 2026-11-14: uma reunião completa gastou uns 250 mil tokens
novos, umas 6 vezes uma conversa comum com o mesmo material. Cota é dado que muda com o
plano da pessoa.)

Sem o sim, a conversa segue normal. Com o sim, Passo 2.

## Passo 2, o pacote

1. Ler `_contexto/empresa.md`, `_contexto/estrategia.md`, `_contexto/agora.md`, o fim do
   `_memoria/decisoes.md` e, da pasta `dados/` e do `_contexto/`, o que toca a dúvida
   (planilha de vendas, custos, proposta, contrato, `_contexto/vereditos-legais.md`).
2. Rodar as contas que o projeto já tem, porque número de script é mais confiável que conta
   de cabeça: com a pasta `.claude/skills/caixa/`, `node .claude/skills/caixa/scripts/caixa.mjs
   mes <AAAA-MM>` do mês atual e do anterior e `... caixa.mjs aberto`; com a
   `.claude/skills/mei/` e o `dados/mei.json`, `node .claude/skills/mei/scripts/mei.mjs
   proximos`. Saída de script entra no pacote como está, com o comando ao lado.
3. Decidir a fase e o chapéu (seções abaixo). Faltou dado pra decidir: uma pergunta só pra
   pessoa, com as opções.
4. Montar a lista de arquivos do pacote, por caminho. Ficam fora sempre: `.env` e qualquer
   arquivo de senha, `~/.claude`, pasta de outro projeto.

## Fase

Pelo que está gravado em `_contexto/estrategia.md` (seção Fase) e pelos números do pacote:

| Fase | Como se reconhece | Cadeiras da fase |
|---|---|---|
| Começo | ainda não vende todo mês, ou vende há menos de 3 meses | Vendas e Regras |
| Tração | vende todo mês e quer crescer | Dinheiro e Operação |
| Estrutura | já tem gente trabalhando junto ou vai montar equipe | Dinheiro e Pessoas |

As cadeiras da fase entram sempre, mesmo que o chapéu não as liste.

## Chapéus

O chapéu sai do que o `_contexto/empresa.md` diz que o negócio faz e vende. Ele muda o foco
da cadeira, nunca o nome dela.

| Negócio | Cadeiras fixas | Foco que muda |
|---|---|---|
| Loja, revenda, produto próprio | Dinheiro, Vendas, Operação, Regras | |
| Serviço (freelancer, prestador) | Dinheiro, Vendas, Operação, Regras | Vendas olha prospecção e preço por hora ou pacote; Operação olha agenda e escopo; Regras olha contrato, nota de serviço e ocupação do MEI |
| Agência (vários clientes) | Dinheiro, Vendas, Operação, Regras | Operação olha entrega por cliente; Pessoas sob demanda |
| Criador de conteúdo, influenciador | Dinheiro, Vendas, Regras, Marca e Conteúdo | Vendas olha publi e marcas; Regras olha identificação de publicidade, contrato com marca e exclusividade |
| Empresa com equipe | Dinheiro, Vendas, Operação, Regras, Pessoas | o Facilitador corta uma pelo teto |
| Contador, escritório de contabilidade | Dinheiro, Vendas, Operação, Regras | Regras se inverte: a pessoa já conhece a regra, e a cadeira olha o risco do próprio escritório (responsabilidade profissional, prazo de obrigação dos clientes, contrato de honorário, guarda de documento) |
| Motorista de app | Dinheiro, Operação, Regras | Vendas sai; Dinheiro olha custo por km com combustível, manutenção, seguro e desgaste do carro |

Pessoas entra sob demanda quando a dúvida é contratar, dividir trabalho ou depender de uma
pessoa só; Marca e Conteúdo, quando a dúvida mexe em posicionamento, reputação ou no que o
público vê.

**Teto:** até 4 cadeiras mais o Pé no Chão, 5 leituras por reunião. Passando de 4, fica de
fora a cadeira que menos toca a dúvida, e a resposta diz qual ficou de fora.

## Passo 3, o registro

Antes de chamar as cadeiras, criar `_memoria/diretoria/AAAA-MM-DD-<tema>.md` (tema curto, em
minúsculas e hífen) com a dúvida, a entrada (decisão, check-up, fase ou como foi), a fase, o
chapéu e a lista do pacote. Cada parecer entra no arquivo assim que volta, debaixo de
`## <cadeira>`; a resposta do Passo 6 entra no fim, debaixo de `## Resposta`. Criar e
acrescentar sempre pela ferramenta de escrever e editar arquivo, nunca por comando de terminal
(`cat >>`, `echo >>`, `Add-Content`): a trava do kit pode barrar a gravação pelo terminal, e
o parecer se perde no meio da reunião.

Reunião que caiu no meio (cota, internet, computador desligado): ler o arquivo do mesmo tema
em `_memoria/diretoria/`, de hoje ou de outro dia (a data do nome é a do dia em que a reunião
abriu, e ela continua nesse mesmo arquivo), e chamar só a cadeira que ainda não tem parecer. Com `## Resposta` gravada, a reunião
acabou e não se refaz; mostrar a resposta de novo.

## Passo 4, as cadeiras

Cada cadeira vai pelo subagente `diretoria-cadeira` (`subagent_type: diretoria-cadeira`), que
só lê arquivo: não tem terminal, internet nem como gravar. Se o `diretoria-cadeira` não
aparecer (pasta `.claude/agents/` criada nesta sessão pede reiniciar o Claude Code), parar e
pedir pra pessoa reiniciar; nunca trocar calado por outro tipo de subagente.

As cadeiras rodam juntas, uma volta só. O prompt de cada uma é o conteúdo inteiro de
`.claude/skills/diretoria/referencias/cadeira-<nome>.md`, mais no fim:

```
CADEIRA: <nome>
CHAPÉU: <negócio e foco que muda, da tabela de Chapéus>
FASE: <fase>
DÚVIDA: <com as palavras da pessoa>
ARQUIVOS: <lista do pacote, por caminho>
NÚMEROS DE SCRIPT: <saída das contas do Passo 2, com o comando, ou "nenhum">
```

O parecer volta com o nome da cadeira na primeira linha. Parecer que volta sem ele, ou com o
nome de outra cadeira, se despacha de novo uma vez.

## Passo 5, o Pé no Chão

Depois que todas voltaram, o Pé no Chão vai pelo mesmo `diretoria-cadeira`, com
`referencias/cadeira-pe-no-chao.md`, o mesmo bloco do Passo 4 e, debaixo de `PARECERES:`, os
pareceres colados inteiros. Uma volta só, sem mandar nada de volta pras cadeiras.

**Risco alto:** quando a decisão é de risco alto pela lista do `.claude/detalhe-regras.md`
(seção Risco alto), a vaga do Pé no Chão vai pro revisor da `/segunda-opiniao`: o mesmo
`diretoria-cadeira`, com o texto do revisor do Passo 3 da `segunda-opiniao/SKILL.md` (dose
completa) no lugar da referência do Pé no Chão, a proposta sendo o que a reunião está
pesando e os pareceres colados. Uma volta só dentro da reunião, e o teto de 5 vale. Antes de
pedir o ok do risco alto, comparar o que vai ser mostrado com o que o revisor viu: se a
proposta mudou de verdade depois da revisão (pelo Facilitador, por um fato conferido na
internet no Passo 6 ou pela pessoa), a `/segunda-opiniao` roda as outras voltas dela com a
proposta do jeito que vai ser mostrada, e só depois vem o pedido de ok.

## Passo 6, a resposta

Juntar tudo numa resposta só, em linguagem simples, sem citar cadeira, reunião nem parecer:

- **O que eu vejo:** a situação, com os números do pacote e a conta mostrada.
- **O que eu faria:** a recomendação, com o porquê.
- **O que pode dar errado:** os riscos, inclusive onde as cadeiras discordaram (a
  discordância entra aqui como risco, com os dois lados em uma linha cada).
- **Próximo passo:** uma ação concreta, pequena, que a pessoa consegue fazer hoje.

Conta que aparece na resposta vem do pacote ou de script, nunca de cabeça. Fato que muda com
o tempo (taxa, regra de plataforma, teto do MEI, certificação) e sustenta a recomendação se
confere na internet antes de escrever, na fonte oficial, como manda a regra 2 do `AGENTS.md`:
as cadeiras não têm internet, então quem confere é o Facilitador, e a resposta cita a fonte e
a data. Sem internet, ou sem fonte achada, o fato sai marcado "não conferi; confira na fonte
oficial antes de agir" e a recomendação diz que depende dele. Cadeira que ficou de fora pelo
teto entra numa linha no fim.

Gravar a resposta no arquivo do Passo 3 e uma linha no diário.

## Passo 7, a decisão e o "Como foi?"

Quando a pessoa decide (sim, não ou outra coisa), gravar no `_memoria/decisoes.md`, no
formato de sempre, com `[diretoria]` logo depois da origem:

`- AAAA-MM-DD, <origem> [diretoria]: <decisão>. Por quê: <motivo, com o caminho do arquivo da reunião>.`

**"Como foi?":** a reunião desta entrada lê a decisão original, o arquivo da reunião e os
números de agora, e a dúvida é se deu certo e o que fazer. Oferecer o "Como foi?" fecha a
decisão: com a resposta da pessoa ou com a dispensa, entra uma linha nova (acréscimo) no
`_memoria/decisoes.md`:

`- AAAA-MM-DD, <origem> [diretoria] como foi "<começo da decisão original>": <o que aconteceu, ou dispensado>. Por quê: <motivo>.`

Decisão `[diretoria]` que já tem uma linha "como foi" citando o começo dela não se oferece de
novo.

## No Codex, ou onde não houver subagente

O Facilitador faz as cadeiras uma por vez, no próprio chat, seguindo cada referência como se
fosse a primeira vez que lê o pacote, e o Pé no Chão por último. Avisar numa linha: "a
reunião foi feita aqui mesmo, sem leituras separadas, então é menos independente". O
registro do Passo 3 vale igual.
