# Padrões de cara de IA, pt-BR de comércio

Catálogo da /humanizar. Cada linha: `ID [gravidade] gatilho: conserto. Ex.: antes -> depois`.
S1 denuncia na hora e sai sempre, menos dentro de citação de cliente real; S2 incomoda e sai quando dá; S3 é polimento e só pesa somado.
A marca (v) diz que o varredor (`scripts/varrer.mjs`) tem regra pro padrão; sem (v), só a leitura
acha. A marca (conta) é padrão de frequência: vale a partir de um número de vezes no texto, e quem
conta é o varredor. Nos exemplos, o dado do depois vem da ficha do produto; sem ficha, vira
[PREENCHER].

## V vocabulário oco

- V-1 [S2] (v) "solução ideal para quem busca": dizer o que o produto faz. Ex.: "A solução ideal para quem busca praticidade" -> "Corta o legume em rodela fina"
- V-2 [S2] dois ou mais adjetivos de vitrine colados (incrível, inovador, revolucionário): um dado da ficha. Ex.: "Design incrível e inovador" -> "Corpo em inox escovado"
- V-3 [S2] (v) "eleva", "potencializa" ou "transforma sua experiência" ou "sua rotina": o verbo do uso real. Ex.: "Transforme sua rotina na cozinha" -> "Pica a cebola sem chorar"
- V-4 [S3] universo, cenário ou jornada no sentido abstrato: cortar. Ex.: "No universo da maquiagem, este pincel" -> "Este pincel"
- V-5 [S2] "qualidade premium" ou "alto padrão" sem material nem medida: o dado da ficha ou [PREENCHER]. Ex.: "Tecido premium" -> "Malha de algodão"

## C conversa de robô

- C-1 [S1] (v) fecho de robô: "Espero ter ajudado", "Qualquer dúvida, é só chamar", "Fico à disposição": terminar na informação ou numa pergunta concreta. Ex.: "Chega quinta. Espero ter ajudado!" -> "Chega quinta. Separo o seu?"
- C-2 [S1] (v) "Ótima pergunta", "Que bom que você perguntou": responder direto. Ex.: "Ótima pergunta! Serve sim." -> "Serve sim."
- C-3 [S1] (v) moldura de chat: "Claro! Aqui está", "Segue abaixo": apagar a moldura e entregar o texto. Ex.: "Claro! Aqui está a descrição:" -> (some)
- C-4 [S2] bajulação: "Você está absolutamente certo", "Que escolha incrível": reconhecer só o fato verdadeiro. Ex.: "Você está absolutamente certo, atrasou" -> "Atrasou, sim. O rastreio é [PREENCHER]"
- C-5 [S1] (v) aviso de limite: "Com base nas informações disponíveis", "Até onde sei": afirmar o que a ficha diz ou [PREENCHER]. Ex.: "Até onde sei, é bivolt" -> "É bivolt"

## P prova e promessa inventada

- P-1 [S1] número sem fonte: "Mais de 10 mil clientes satisfeitos": sai, ou [PREENCHER] até a pessoa dar o número. Ex.: "Mais de 10 mil vendidos" -> "[PREENCHER: quantos vendidos]"
- P-2 [S1] depoimento inventado ou citação sem dono: sai. Ex.: "'Mudou minha vida!' (Ana, SP)" -> (some)
- P-3 [S1] prazo ou garantia fora da tabela: "Entrega em 24h", "Garantia vitalícia": o valor da tabela ou [PREENCHER]. Ex.: "Garantia vitalícia" -> "Garantia de [PREENCHER]"
- P-4 [S2] (v) superlativo sem prova: "o melhor do mercado", "o mais vendido do Brasil": cortar ou citar a fonte. Ex.: "A melhor do mercado em panela" -> "Panela de ferro fundido"
- P-5 [S2] importância inflada: "um verdadeiro marco", "vai revolucionar seu dia": cortar. Ex.: "Um divisor de águas no seu banho" -> (some)
- P-6 [S2] chute com cara de fato ou fonte vaga: "provavelmente o modelo mais procurado", "especialistas recomendam": cortar ou dar o nome da fonte. Ex.: "Especialistas recomendam" -> (some)

## A abertura e arremate de redação

- A-1 [S1] (v) abertura de redação: "No mundo atual", "Nos dias de hoje", "Em um mundo cada vez mais": abrir pelo produto. Ex.: "Nos dias de hoje, organização é tudo. A caixa" -> "A caixa"
- A-2 [S2] (v) "Você já se perguntou", "Imagine um mundo": abrir pela dor concreta. Ex.: "Você já se perguntou por que seu café esfria?" -> "Café gelado antes do segundo gole?"
- A-3 [S2] arremate otimista vazio: "O futuro da sua cozinha começa agora": acabar no último fato ou no convite real. Ex.: "e o futuro começa agora!" -> "Escolha a cor e finalize o pedido."
- A-4 [S3] (v) anúncio de explicação: "Confira a seguir", "Tudo o que você precisa saber": ir direto ao conteúdo. Ex.: "Confira a seguir as medidas:" -> "Medidas:"

## R ritmo e retórica

- R-1 [S1] (v) contraste espelhado, nas duas ordens e com "só": "não é só X, é Y", "é Y, não X": afirmar o Y. Ex.: "Não é só uma garrafa, é um estilo de vida" -> "Garrafa térmica de inox"
- R-2 [S2] (v) (conta) trinca de adjetivos: 3 ou mais trincas no texto ("prático, bonito e durável"): um atributo forte por frase. Ex.: "Leve, prático e durável" -> "Cabe no bolso da calça"
- R-3 [S2] (v) gancho dramático: "O resultado?", "E o melhor:": dizer o resultado. Ex.: "O resultado? Roupa lisa." -> "A roupa sai lisa."
- R-4 [S3] (v) (conta) 3 ou mais frases seguidas abrindo com a mesma palavra: variar a abertura. Ex.: "Tem alça. Tem tampa. Tem trava." -> "Vem com alça e tampa. A trava segura o líquido."

## L ligação

- L-1 [S2] (v) ressalva: "Vale ressaltar", "Cabe destacar", "É importante salientar": cortar a moldura. Ex.: "Vale ressaltar que é bivolt" -> "É bivolt"
- L-2 [S2] (v) (conta) 3 ou mais conectivos no mesmo parágrafo (além disso, também, dessa forma, por fim): ponto final e frase nova. Ex.: "Além disso... Também... Por fim..." -> frases sem o conectivo
- L-3 [S3] (v) conectivo arcaico: "outrossim", "destarte", "ademais": cortar. Ex.: "Ademais, acompanha estojo" -> "Acompanha estojo"
- L-4 [S3] enchimento: "devido ao fato de", "no sentido de", "a fim de que": a palavra curta. Ex.: "devido ao fato de ser leve" -> "por ser leve"

## M marca visual

- M-1 [S1] (v) travessão (traço longo) ou meia-risca (traço médio): vírgula, ponto ou dois-pontos. Zero em qualquer canal; só a citação de cliente real fica como veio. Ex.: "Leve [travessão] cabe na bolsa" -> "Leve, cabe na bolsa"
- M-2 [S2] (v) (conta) negrito em mais de uma frase do mesmo bloco, ou rótulo em negrito abrindo toda linha: texto corrido, negrito só no que a pessoa não pode perder.
- M-3 [S2] emoji de enfeite abrindo ou fechando toda linha: tirar. Exceção no Instagram (ver Por canal).

## F forma pt-BR

- F-1 [S1] (v) gerundismo: "vou estar enviando", "vamos estar verificando": verbo direto. Ex.: "Vamos estar enviando hoje" -> "Enviamos hoje"
- F-2 [S2] gerúndio no fim fingindo efeito: ", garantindo mais conforto": frase própria com o fato, ou cortar. Ex.: "Palmilha de gel, garantindo conforto" -> "Palmilha de gel."
- F-3 [S2] (v) fugir do "é" e do "tem": "conta com", "dispõe de", "possui" no texto corrido: "tem". Ex.: "A mochila conta com 3 bolsos" -> "A mochila tem 3 bolsos"
- F-4 [S2] (v) oficialês: "Venho por meio desta", "No que tange": falar como gente. Ex.: "No que tange ao envio" -> "Sobre o envio:"
- F-5 [S3] (v) (conta) 3 ou mais frases na passiva, com "foi" ou "será" ("foi enviado", "será entregue"): voz ativa. Ex.: "O pedido foi enviado pela loja" -> "A loja enviou o pedido"
- F-6 [S3] pronome depois do verbo e "trata-se" de redação: "permite-nos", "trata-se de": a forma falada. Ex.: "Trata-se de um tapete antiderrapante" -> "É um tapete antiderrapante"

## Por canal

Só a exceção. O resto segue a voz da marca do projeto. Canal sem dizer: deduza pelo texto
(título, legenda, resposta a cliente) e, se não der, pergunte.

Instagram e post: emoji no fim de frase e hashtag no fim da legenda passam (M-3 fica de fora).
Título de marketplace: palavra-chave em sequência, sem verbo, é o formato do canal; V e R ficam de
fora no título. Atendimento: um emoji e "Oi, tudo bem?" na abertura passam, e "Qualquer dúvida, é
só chamar" num fecho curto também; o resto do C-1 ("Espero ter ajudado") continua valendo.
O M-1 vale em todo canal.

## Honestidade

Número, depoimento, garantia e prazo inventados são o pior defeito da lista, porque parecem
honestos: o leitor confia justamente no que é específico. A reescrita nunca acrescenta número,
nome, data, citação ou fonte que não veio do texto ou da pessoa. O que falta vira [PREENCHER] com o
que precisa ("[PREENCHER: prazo de garantia]"), e a pessoa completa. Chute vira omissão. A trava
antes/depois do varredor pega número que sumiu ou apareceu; depoimento e garantia sem número só a
leitura pega.

## O que não marcar

Vale o conjunto: o texto só volta com aviso quando tem 3 ou mais padrões ou um S1. Um S2 ou S3
solto, mesmo apontado pelo varredor, volta como limpo, com a ocorrência citada numa linha. Ficam de
fora: gramática perfeita, texto seco e direto, palavra formal solta, conectivo isolado, frase curta
isolada, aspas curvas. Ficha técnica com "possui" ou "conta com" listando fato ("Conta com 2 portas
USB") fica como está: o F-3 do varredor aponta, e a leitura libera. Ficha em lista com rótulo em
negrito ("Preço:", "Frete:", "Cores:") fica, mesmo com o M-2 apontando. "Segue abaixo" apontando
anexo de verdade ("Segue abaixo as fotos das cores") fica; o C-3 é a moldura antes do próprio
texto. Citação de cliente real fica intocada. E cuidado com o excesso de limpeza: texto sem voz nenhuma também soa
máquina.
