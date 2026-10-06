---
name: copy-venda
description: >
  Escreve texto que vende no tom do negócio: anúncio, descrição de produto, página
  de serviço, mensagem de fechamento, resposta a objeção. Parte do cliente e da dor,
  não do produto, e respeita as regras do ramo (conselho, ANVISA, promessa proibida).
  Use quando o usuário disser "escreve o anúncio", "descrição do produto", "texto pra
  vender", "como eu respondo quem diz que está caro", "copy pra página", "mensagem
  pra fechar a venda".
---

# /copy-venda, Texto que vende, sem cara de IA

## Dependências

- `_contexto/empresa.md`: o que vende, pra quem, diferencial, restrições do ramo
- a voz da marca (Mapa do `AGENTS.md`): o tom do texto entregue
- `_contexto/preferencias.md`: o que evitar (as proibições de escrita valem pro texto entregue também, não só pro chat)
- o guia visual da marca (linha "a marca" do Mapa no `AGENTS.md`; pasta de projeto com `marca/` própria usa a dela): só se o texto for pra peça visual
- Concorrentes ou referências anotadas no `empresa.md`, se houver
- `marca/voz-do-cliente.md`: frases reais do cliente já registradas; pode não existir ainda na primeira vez (a própria skill cria)

## Antes de escrever (formato de 4 partes, só o que ainda não estiver na memória)

1. "Esse texto é pra quem, e o que essa pessoa está tentando resolver quando encontra você?" (por que pergunto: copy boa fala da dor do leitor antes do produto; exemplos: "mãe que precisa de bolo pra festa de amanhã e não tem tempo" / "dono de loja pequena que gasta com anúncio e não vê retorno")
2. "Onde esse texto vai aparecer?" (por que pergunto: anúncio de marketplace, legenda de Instagram, página e mensagem de WhatsApp têm tamanho, formato e regra diferentes; exemplos: "título e descrição do anúncio no marketplace" / "resposta no WhatsApp pra quem pediu preço")
3. "O que faz o cliente escolher você em vez do concorrente, na sua opinião?" (por que pergunto: sem diferencial real o texto vira genérico; exemplos: "entrego no mesmo dia na região" / "sou a única que faz sem glúten aqui")
4. "Tem alguma prova que dá pra usar: número, depoimento, tempo de mercado, garantia?" (por que pergunto: prova concreta vende mais que adjetivo; exemplos: "300 festas entregues em 2025" / "garantia de 30 dias, devolvo o dinheiro")

Se o ramo é regulado (pergunta 7 do questionário do `/setup`), reler a restrição antes de escrever e listar o que **não** pode aparecer: promessa de resultado, "cura", "melhor do mercado" sem prova, captação disfarçada, antes e depois onde é proibido.

## A temperatura de quem vai ler

Pergunta obrigatória, junto com as de cima:

"Quem vai ler isso já te conhece?" (por que pergunto: quem nunca ouviu falar de
você precisa de história antes de preço, e quem já quer comprar só precisa do
caminho; trocar os dois queima o texto; exemplos: "anúncio pra quem nunca me viu" /
"mensagem pra quem já pediu orçamento")

| Temperatura | Quem é | O que o gancho faz |
|---|---|---|
| Gelada | não sabe nem que tem o problema | história ou identidade, sem citar o produto |
| Fria | sabe do problema, não conhece solução | dá nome à dor, com empatia |
| Morna | conhece soluções, não conhece você | mostra o resultado sem o que ele odeia |
| Quente | conhece você, ainda não comprou | diferença e prova |
| Fervendo | já quer comprar | oferta, preço, prazo, caminho |

Reprova na hora: gancho que cita o produto em público gelado, e gancho que conta
história longa em público fervendo.

## Inventário de prova

Antes de escrever, listar o que existe de verdade, da prova mais forte pra mais
fraca: número específico e conferível, demonstração (foto, vídeo, antes e depois
onde for permitido), depoimento com nome, caso contado com detalhe, tempo de
mercado, garantia, amostra ou teste grátis, explicação de por que funciona.

Sem nenhuma delas, o texto sai mais curto e mais honesto, e a primeira tarefa passa
a ser conseguir a primeira prova.

Depois de escrever, reler cada afirmação como o cliente mais desconfiado, aquele que
responde "ah, tá bom" em tudo. Se a frase seguinte não prova, prova ou corta.
Adjetivo vira fato: "rápido" vira "chega em 40 minutos".

## Objeções, antes de o cliente falar

Isso é prevenção: entra dentro de um texto novo, antes de o cliente abrir a boca.
Se ele já falou a objeção e só falta responder agora, pula pro "Modo rápido:
resposta a objeção", mais abaixo.

Listar de 3 a 5 coisas negativas que o leitor pode estar pensando e responder no
próprio texto, antes que ele pergunte. Falar na frente funciona melhor que esconder:
"você deve estar achando caro pra um bolo, e eu te explico o porquê".

Listar as 3 a 5 é sempre preparo. O que entra no texto depende do tamanho da peça:
em texto longo (página, proposta, descrição de produto caro) as 3 a 5 entram; em
peça curta (anúncio, título de marketplace, legenda, mensagem de WhatsApp) entra só
a principal, e as outras ficam de prontidão pra conversa ou pro modo rápido, quando
o cliente perguntar.

Em texto longo (página, produto caro, proposta), usar como checklist de buraco: é
diferente do que eu já vi? o que eu ganho? como sei que é real? o que me travou
antes? por que agora? por que confiar em você? como funciona? como começo? o que eu
perco se não der certo?

O inimigo do texto é sempre um sistema ou um hábito, nunca um concorrente com nome
nem um grupo de pessoas.

## A fala do cliente

Antes de escrever, procurar as palavras que o cliente usa de verdade: avaliação de
marketplace (as de 5 e as de 1 estrela, inclusive as do concorrente), pergunta no
anúncio, conversa de WhatsApp, comentário. Usar essas palavras no gancho, porque
texto com a língua do cliente não tem cara de IA.

As melhores frases vão pra `marca/voz-do-cliente.md`, criado na primeira vez com uma
linha no topo explicando o que é. O arquivo cresce com o tempo e as outras skills de
texto leem ele. Nunca inventar frase de cliente.

## Estrutura que funciona (adaptar, não seguir cega)

1. **Gancho:** a dor ou o desejo do leitor em uma frase, na língua dele. Nada de começar pelo nome do produto.
2. **Virada:** o que muda com o produto ou serviço, em resultado concreto, não em característica ("chega em 40 minutos" em vez de "logística eficiente").
3. **Prova:** número, depoimento, garantia, tempo de casa.
4. **Objeção principal respondida** antes de o leitor pensar nela (preço, prazo, "será que funciona pra mim"), escolhida da lista de 3 a 5 já feita no preparo (ver "Objeções, antes de o cliente falar").
5. **Chamada:** o próximo passo, um só, em verbo ("chama no WhatsApp", "adiciona ao carrinho").

Tamanho segue o canal: anúncio de marketplace tem limite de título e precisa das palavras que o comprador digita na busca; legenda de Instagram vive do primeiro parágrafo; mensagem de WhatsApp cabe na tela sem rolar.

## Entregar

- Duas versões por pedido (uma mais direta, uma mais quente), pro usuário escolher ou misturar. Não mais que duas: opção demais paralisa.
- Texto limpo, pronto pra colar. Sem travessão, sem "não é X, é Y", sem "mergulhe", sem adjetivo empilhado, sem emoji a menos que a voz da marca libere.
- Ao lado do texto, em duas linhas: o que cada versão aposta e onde ajustar se não performar.
- Salvar em `conteudo/copy/<canal>-<assunto>-<AAAA-MM-DD>.md` se o usuário quiser guardar (criar a pasta com `README.md` de uma linha na primeira vez).

## Antes de entregar, confere

Vale pro fluxo completo (o modo rápido tem a conferência dele, ver mais abaixo).

- [ ] A temperatura de quem lê bate com o gancho
- [ ] Cada promessa tem prova logo depois, ou saiu do texto
- [ ] Objeções antecipadas: 3 a 5 em peça longa, só a principal em peça curta (anúncio, legenda, mensagem)
- [ ] Uma ideia central só, e não três
- [ ] Zero travessão e zero "não é X, é Y"
- [ ] Ramo regulado: a lista do proibido foi relida antes de escrever

## Modo rápido: resposta a objeção

Isso é reação: o cliente já falou a objeção, e a resposta precisa sair na hora. Pula
a temperatura, o inventário de prova e a lista de objeções antecipadas, porque o
cliente já disse o que pensa e a memória já tem o negócio. A conferência aqui troca
o checklist de "Antes de entregar, confere" (esse é do fluxo completo) por prova em
toda promessa (teste "ah, tá bom") mais as regras de escrita, e só isso.
Pra prevenir objeção dentro de um texto novo, em vez de responder uma que já veio,
ver "Objeções, antes de o cliente falar", mais acima.

Quando o pedido for "como respondo quem diz que está caro / que vai pensar / que achou mais barato", pular a entrevista se a memória já tem o negócio, e entregar 3 respostas curtas no tom do usuário: uma que reforça valor, uma que oferece caminho (parcela, versão menor, prazo), uma que solta sem queimar a ponte.

## Regras

- Nunca prometer resultado que o negócio não garante; ramo regulado tem lista do proibido lida antes de escrever
- Prova só se for verdadeira e o usuário confirmar; nunca inventar número ou depoimento
- Publicar em rede social, marketplace ou anúncio é gate humano: esta skill escreve, o usuário aprova e publica (ou aciona a skill de publicação com aprovação explícita)
- Copy que o usuário corrigiu duas vezes na mesma direção vira linha na voz da marca, ou no `_contexto/preferencias.md` se for proibição de escrita (pedir antes de salvar)
