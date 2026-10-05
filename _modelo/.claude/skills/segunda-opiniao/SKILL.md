---
name: segunda-opiniao
description: >
  Antes de pedir o ok da pessoa pra qualquer coisa (plano, mudança, gasto,
  publicação, estrutura de pasta), passa a proposta por um revisor que não viu a
  conversa e tem a ordem de derrubar: contradição, furo, suposição sem prova e o
  que quebra na prática. Cada achado se confere nos arquivos; o que se sustenta
  se corrige antes de mostrar. Use sempre antes de pedir aprovação, quando o
  usuário chamar /segunda-opiniao, ou disser "revisa isso antes", "tem furo
  nisso?", "pede uma segunda opinião".
---

# /segunda-opiniao, um olhar de fora antes do ok

Quem montou a proposta passou a conversa inteira convencido dela, e é aí que o
furo se esconde. Antes de pedir o ok, a proposta vai pra um revisor de contexto
limpo: alguém que não viu a conversa, recebe só o que a pessoa pediu e o que vai
ser feito, e tem a ordem de achar o que está errado. A pessoa recebe a proposta
já corrigida e, em linguagem simples, se o revisor aprovaria e por quê.

Vale pra todo pedido de ok, de qualquer tamanho. O tamanho muda a dose, nunca
pula a revisão.

## Passo 1, o pacote

Montar três coisas, e só elas:

1. **O pedido**, com as palavras da pessoa, o mais perto possível do que ela
   disse (inclusive o que ela disse que não quer).
2. **A proposta**, inteira, do jeito que vai ser mostrada pra ela: o que vai ser
   feito, em que ordem, o que custa, o que sai pra fora.
3. **Os arquivos** em que a proposta se apoia, por caminho (o `AGENTS.md`, a
   skill que está sendo seguida, o arquivo que vai mudar), pro revisor abrir e
   conferir. Entra também o arquivo que poderia contrariar a proposta (uma
   decisão antiga, uma regra), nunca só os que a apoiam. Na pasta-mãe, a
   proposta é o que o `/setup` ou o `/novo-projeto` vai criar, e os arquivos são
   a skill em uso e o que ela lê.

Fica de fora: o raciocínio que levou à proposta e qualquer conclusão sua ("acho
que está bom", "já conferi"). Revisor que recebe a conclusão tende a concordar
com ela.

## Passo 2, a dose

- **Rápida**, pra proposta pequena (uma mudança, um arquivo, um texto curto,
  nada que gaste ou publique): uma volta só, com o pedido de no máximo três
  achados.
- **Completa**, pra proposta grande (várias etapas, dinheiro, publicação, algo
  difícil de desfazer, mudança de estrutura): até três revisões no total,
  contando a primeira; uma nova só depois de uma correção que mudou a proposta
  de verdade.

Na dúvida, completa.

## Passo 3, o revisor

**No Claude Code:** abrir um subagente (a ferramenta Agent, tipo
`general-purpose`) com este texto e o pacote no lugar marcado. Esse subagente
consegue editar arquivo; quem segura é a frase "Não edite nenhum arquivo" do
texto, que nunca sai. Na dose rápida, a linha marcada abaixo entra no texto; na
completa, sai.

> Você é revisor. Não viu a conversa que produziu esta proposta. Sua tarefa é
> derrubar a proposta, nunca elogiar nem resumir. Esta revisão já é a segunda
> opinião que as regras do projeto pedem antes do ok; não aponte a falta dela.
> Procure, nesta ordem:
>
> 1. Contradição: a proposta contra o pedido, contra ela mesma ou contra uma
>    regra dos arquivos listados.
> 2. Furo: algo que o pedido pede e a proposta não cobre, ou um passo que falta
>    pra ela funcionar.
> 3. Suposição sem prova: fato afirmado que nenhum arquivo listado sustenta
>    (preço, regra de plataforma, arquivo que talvez não exista).
> 4. O que quebra na prática: ordem errada, custo escondido, algo que sai pra
>    fora sem o ok, passo que uma pessoa leiga não consegue fazer.
>
> Abra os arquivos listados e confira antes de afirmar. Cada achado vem com o
> trecho ou o arquivo e a linha que o provam. Achado sem prova não entra. Se não
> achar nada que se sustente, responda só "nada a derrubar": inventar problema é
> tão ruim quanto deixar passar. Não edite nenhum arquivo.
>
> (só na dose rápida) Devolva no máximo três achados, os mais graves.
>
> PEDIDO: ...
> PROPOSTA: ...
> ARQUIVOS: ...

**No Codex, ou onde não houver subagente:** fazer a revisão no próprio chat.
Reescrever o pacote como se fosse a primeira vez que o lê, seguir as quatro
perguntas acima e avisar a pessoa numa linha: "a segunda opinião foi feita aqui
mesmo, sem um revisor separado, então é menos independente".

## Passo 4, conferir cada achado

O revisor também erra, principalmente por falta de contexto. Pra cada achado,
abrir o arquivo citado e decidir:

- **Procede:** corrigir a proposta.
- **Procede, mas corrigir custa mais que aceitar:** deixar escrito pra pessoa,
  como risco.
- **Não procede:** sai, com uma frase do porquê (o arquivo diz outra coisa, ou o
  revisor não tinha um dado). Se faltou um dado no pacote, ele entra na próxima
  volta.

Achado que não se prova no arquivo real sai, por mais convincente que pareça.

## Passo 5, o que a pessoa recebe

A proposta corrigida e, embaixo, duas ou três linhas em linguagem simples:

> **Segunda opinião:** eu aprovaria. O revisor apontou que o aviso ia sair no
> WhatsApp sem o seu ok; agora ele fica pronto e espera você mandar.

> **Segunda opinião:** eu ainda não aprovaria. A mudança apaga a regra antiga de
> frete, e as decisões aqui só ganham entrada nova, nunca se apagam. Troquei
> por uma entrada nova que diz qual substitui; se concordar, sigo.

> **Segunda opinião:** nada a derrubar, eu aprovaria como está.

A linha aparece sempre, mesmo quando nada mudou: é ela que mostra que a revisão
rodou. Depois disso, pedir o ok normalmente.

## Regras

- Nunca pular, nem em proposta pequena: dose rápida, sim; nenhuma, nunca.
- Nunca passar sua conclusão pro revisor; só o pedido, a proposta e os arquivos.
- Nunca aceitar achado sem abrir o arquivo; nunca descartar sem dizer por quê.
- No máximo três revisões no total, contando a primeira. Se depois da terceira
  ainda há achado sério, dizer isso pra pessoa em vez de girar mais.
- O revisor só lê. Quem corrige e quem pede o ok é você.
- Rotina sem gente na frente (robô, agendamento) não pede ok, então não roda
  esta skill: ela escreve recado.
