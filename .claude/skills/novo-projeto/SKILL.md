---
name: novo-projeto
description: >
  Adiciona um projeto novo dentro do SabinOS já configurado, reaproveitando a
  identidade global da pessoa e criando a pasta por cópia seletiva do
  `_modelo/`. Use quando o usuário chamar /novo-projeto, disser "adicionar
  projeto", "quero outro projeto", "novo cliente grande que merece pasta
  própria", ou "vou começar um projeto novo" com o SabinOS já tendo pelo
  menos um projeto criado.
---

# /novo-projeto, adicionar projeto

Esta skill roda a partir da pasta-mãe (a raiz do SabinOS, onde este arquivo
mora dentro de `.claude/skills/novo-projeto/`), igual à `/setup`, mas parte do
princípio de que já existe pelo menos um projeto na casa. Todo caminho abaixo
é relativo a essa raiz, salvo quando marcado como caminho do projeto ou
caminho global. Chamada de dentro de um projeto (regra 13 do `AGENTS.md` do
projeto: o aluno começou ali um projeto que merece pasta própria), a raiz é a
pasta de cima (`..`) e o resto segue igual; no fim, avisar pra abrir a pasta
nova no VS Code e começar um chat novo lá.

## Regra de formato das perguntas (obrigatória em toda a conversa)

Toda pergunta feita ao usuário sai em 4 partes:

1. A pergunta, em linguagem de gente, sem jargão.
2. Uma linha de **por que estou perguntando**, o que a resposta muda no
   projeto.
3. **Dois ou três exemplos de resposta boa**, curtos, de ramos diferentes.
4. Se a resposta vier vaga, curta ou "não sei", **uma repergunta de
   acompanhamento** antes de seguir. Nunca aceitar resposta oca e passar
   direto pra próxima.

**Pergunta com resposta de lista sai com botão.** Uma pergunta por vez. Quando a resposta cabe numa lista curta (sim ou não, 2 a 4 caminhos, várias marcadas), usar a ferramenta de pergunta com opções (AskUserQuestion): 1 pergunta por chamada, 2 a 4 opções, cabeçalho de até 12 letras, e o "Other" fica pra quem quer escrever. As opções saem da linha `Opções` da pergunta quando ela existe, senão dos exemplos da parte 3. O porquê (parte 2) vai numa linha antes. Opção clicada conta como resposta completa; a repergunta da parte 4 só vale quando o "Other" vier vago. Quando a pergunta pede um detalhe que a opção não traz (qual conselho ou qual dado sensível, quem faz o quê na equipe), uma pergunta aberta curta logo depois pega esse detalhe, gravado junto da opção. Sem botão (Codex, ou sessão sem a ferramenta), as mesmas opções saem numeradas em texto (1, 2, 3) e a pessoa responde com o número. Pergunta aberta continua aberta, com os exemplos em texto; se for opcional, fecha com "se quiser pular, diz pular".

## Passo 0, se situar

Antes de perguntar qualquer coisa, ler o que o sistema já sabe sobre a pessoa
e sobre os projetos que já existem:

1. `~/.claude/CLAUDE.md` (o arquivo de instrução global do usuário, fora
   desta pasta-mãe), a seção entre `<!-- sabinos:inicio -->` e
   `<!-- sabinos:fim -->` gravada pelo `/setup` ou por um `/novo-projeto`
   anterior, e o `~/.claude/contexto/projetos.md`, se existir (uma linha por
   projeto já criado).
2. O `AGENTS.md` (o `CLAUDE.md` de cada projeto é só o ponteiro `@AGENTS.md`,
   o conteúdo real está no `AGENTS.md`) e o `_contexto/empresa.md` de CADA
   pasta de projeto que já existe na raiz. Pasta de projeto é a que tem
   `_contexto/` dentro: as que começam com `_` ou com `.` e a `docs/` da
   própria pasta-mãe não são projeto e ficam de fora (a `docs/` vem no kit e
   passa por projeto num filtro só de nome).

Com essas leituras em mãos, confirmar o entendimento em até 3 linhas, citando
o nome real da pessoa e os projetos existentes de verdade, sem inventar nada
que não veio dessas leituras:

> "Pelo que já sei: você é [nome], toca [projeto A, o que é] e [projeto B, o
> que é]. O projeto novo é sobre o quê?"

Se só existir um projeto até agora, ajustar pro singular: "você é [nome] e
toca [projeto A, o que é]. O projeto novo é sobre o quê?"

Se a resposta de confirmação vier com correção ou informação nova ("é isso, só
que..."), acusar o recebimento em uma linha, dizendo o que mudou no entendimento,
antes de seguir.

## Passo 0.5, sala própria ou pasta dentro de um projeto que já existe

Nem todo projeto novo merece um workspace inteiro. Um cliente pequeno de uma
agência, uma campanha, um lançamento, um produto novo da mesma loja cabem numa
subpasta do projeto que já existe, com contexto próprio e sem duplicar skills,
backup e memória. Perguntar antes de qualquer outra coisa, no formato de 4
partes:

> "Isso é um negócio ou uma frente nova que merece uma sala própria, com
> memória, comandos e backup separados? Ou é um cliente, um projeto ou uma
> campanha que vive dentro de [projeto A] e só precisa de uma pasta com o
> contexto dele?
>
> Pergunto porque sala própria custa mais pra montar e pra manter (é um
> workspace inteiro), e pasta dentro fica pronta em dois minutos.
>
> Tipo: 'é outro negócio meu, um brechó, nada a ver com a loja de bolos' vira
> sala própria. 'é um cliente novo da agência' ou 'é a campanha de Natal da
> loja' vira pasta dentro."

**Rota leve (pasta dentro de um projeto).** Fazer só duas perguntas: o nome e
o que é (vira a pasta e a primeira linha do contexto) e o que vai ser produzido
aí dentro com prazo ou meta, se houver. Junto da segunda, perguntar se esse
cliente ou projeto tem visual ou jeito de falar próprios, diferentes da marca do
projeto-pai.

Antes de criar, conferir se vale uma pasta: vai juntar mais de um arquivo? vai
durar mais que uma semana? tem combinado, prazo ou contato próprio que precisa
ser lembrado? Menos de dois sim: dizer "isso cabe num arquivo, não precisa de
pasta", propor um arquivo só no lugar que a estrutura do projeto-pai já tem
(`projetos/<nome>.md`, por exemplo) e parar aqui com o sim da pessoa. Dois ou
mais: seguir.

1. Sugerir o lugar dentro do projeto-pai, seguindo a estrutura que ele já tem
   (`clientes/<nome>/` numa agência, `projetos/<nome>/` num negócio próprio,
   `conteudo/<nome>/` pra série ou canal).
   Antes de propor, procurar o que o projeto-pai já sabe dessa pasta: o nome
   (e o nome da pasta) nas decisões (inclusive as com `[<nome-da-pasta>]`), no
   diário, no `agora.md`, no `empresa.md` e nos arquivos que o Mapa do
   `AGENTS.md` do projeto-pai lista. O que achar entra no `contexto.md` e no
   `andamento.md` com a data e o caminho de onde saiu; pendência que o diário diz
   que já foi feita entra como feita. Dado pessoal (CPF, telefone pessoal,
   endereço de casa) e senha ficam de fora.
   Passar o lugar e os quatro arquivos do item 2 pela `/segunda-opiniao` (a
   skill desta pasta-mãe) e só então pedir a confirmação.
2. Criar a pasta com quatro arquivos, e só eles (mais a `marca/` quando ela tem
   identidade própria; outra subpasta nasce quando a
   pessoa pedir):
   - `CLAUDE.md`, com a linha `@AGENTS.md`.
   - `AGENTS.md` curto (menos de 30 linhas): o que é e o tipo (cliente,
     produto, conteúdo, interno); uma seção "Antes de agir" dizendo que o que
     é o projeto e o que foi combinado está no `contexto.md`, que onde está e
     o que falta está no `andamento.md`, que texto ou peça pra fora segue a
     marca do projeto-pai (ou a `marca/` desta pasta, se ela tem identidade
     própria), que onde salvar segue a Tabela de destinos do `AGENTS.md` do
     projeto-pai e que decisão sobre esta pasta vai pras decisões do projeto
     com a marca de projeto que a Tabela de destinos do projeto-pai manda e o
     nome da pasta; uma seção "Regras desta pasta", lista
     vazia que cresce com o uso; a regra "sessão que mexeu aqui atualiza o
     `andamento.md` antes de fechar"; e a linha "skill só desta pasta mora em
     `.claude/skills/` daqui e aparece em 'Habilidades desta pasta' (seção que
     nasce com a primeira); com a sessão aberta no projeto-pai, ler o
     `SKILL.md` dela quando o pedido é desta pasta". A pasta `.claude/skills/`
     não se cria vazia.
   - `contexto.md`: o que é e o que precisa ser entregue; prazo, orçamento,
     ferramenta e regra ou órgão próprio, se houver; contato, se for cliente;
     e uma seção "Material de origem", onde transcrição, PDF ou e-mail do
     projeto entram destilados, cada linha com a data e o caminho da fonte.
   - `andamento.md`: "Onde está (AAAA-MM-DD)", com "pasta criada" e o
     primeiro passo que a pessoa citou; "Pendências", em checklist (as
     entregas, se for cliente); e "Feito", vazio.
   - Só se a pessoa disse que tem visual ou jeito de falar próprios:
     `marca/design-guide.md` e `marca/tom-de-voz.md` a partir dos do
     `_modelo/`, preenchidos com o que ela disse (a metade que ela não citou
     fica de fora: vale a do projeto-pai). Sem marca própria, nada de `marca/`.
3. Registrar a pasta na "Estrutura de pastas" do `AGENTS.md` do projeto-pai,
   uma linha, e, se for cliente, oferecer uma linha em `_contexto/empresa.md`
   do projeto-pai.
4. Encerrar: "Pasta criada em `<caminho>`. Pra trabalhar nela, abre a pasta
   do projeto [A] como sempre e fala do [nome]: o assistente lê o contexto da
   subpasta sozinho." Sem `.gitignore`, sem skill, sem ponte: tudo isso vem do
   projeto-pai. O backup do pai já cobre a subpasta.

Nome da subpasta em kebab case, sem acento nem caractere especial, pelo mesmo
motivo da regra de nome de pasta do Passo 3.

**Modo link (pasta que já existe).** Quando a pessoa diz que a pasta já
existe ("liga a pasta X", "/novo-projeto link X"), ou quando o `/compartilhar`
acha uma pasta sem os quatro arquivos: ler o que tem dentro, criar só o que
falta dos quatro arquivos do item 2 e registrar na Estrutura de pastas do
projeto-pai. O `contexto.md` nasce com o que dá pra deduzir dos arquivos que
já estão lá, cada linha com o caminho de onde saiu. Mostrar o que vai ser
criado, passar pela `/segunda-opiniao` e só gravar com o ok. Nunca mover,
renomear nem reescrever o que já estava dentro da pasta. Se a pasta
já tem linha na Estrutura de pastas, atualizar essa linha em vez de criar outra.
O modo link pula o Passo 0.5 e as perguntas da rota leve: o nome é o da pasta e
o resto se deduz dos arquivos dela e da busca do item 1. Pasta fora de qualquer
projeto: perguntar se ela entra num projeto (mover só com o sim) ou se merece
sala própria (rota completa).

**Rota completa (sala própria).** Seguir do Passo 1 em diante.

## Passo 1, entender o projeto novo

Perguntas no formato de 4 partes de cima, uma por mensagem:

1. "Qual o nome do projeto e o que é?" (por que pergunto: vira o nome da
   pasta e a primeira linha do contexto dele; exemplos: "cliente novo de
   social media, a Padaria Central" / "projeto interno de reorganizar o
   estoque" / "negócio novo de brechó online, ainda começando")
2. "O que vai ser produzido aí dentro?" (por que pergunto: define as
   subpastas e quais skills fazem sentido pro dia a dia dele; exemplos:
   "relatório de campanha toda semana pra esse cliente" / "posts e vídeos pro
   Instagram" / "planilha de estoque e nota fiscal")
3. "Tem prazo ou meta?" (por que pergunto: entra no contexto do projeto pra
   eu cobrar na direção certa; exemplos: "fechar contrato de 6 meses com esse
   cliente" / "sem prazo fixo, é projeto contínuo" / "lançar até o fim do
   ano")
4. "Esse projeto tem regra ou órgão próprio que limita o que pode fazer ou
   dizer?" (por que pergunto: negócio ou cliente regulado tem linha que não
   se cruza em anúncio, texto ou promessa, e isso vira regra fixa que toda
   skill de conteúdo deste projeto respeita; exemplos: "é cliente advogado, a
   OAB proíbe prometer resultado de processo" / "não, é só um brechó, sem
   regra especial" / "vende suplemento, tem regra da ANVISA que proíbe
   alegar cura de qualquer coisa")

A pergunta 4 repete a pergunta 7 do questionário do `/setup`, agora por
projeto: cada pasta pode ter um ramo, um cliente e uma regra diferente do
projeto principal.

## Passo 2, descoberta de skills

Detectar o perfil do projeto novo a partir das respostas do Passo 1:
`agencia` (múltiplos clientes com processo de entrega), `freelancer` (solo,
vende serviço), `solopreneur` (negócio próprio, produto ou audiência),
`criador` (conteúdo e canal), `empresa` (equipe organizada por setor),
`profissional` (produtividade pessoal e carreira).

Antes de buscar fora, consultar a biblioteca local em
`_modelo/templates/skills/`: o que já existe pronto ali cobre boa parte dos
casos comuns.

Sem internet, ou com o `npx` falhando: anotar no `tarefas.md` do projeto "buscar
skills prontas com o /find-skills", dizer isso em uma linha e seguir só com a
biblioteca local; nunca pular o passo calado.

Depois, rodar a skill `find-skills` com termos do projeto, em português **e**
em inglês (exemplo: pra um cliente de estética facial, buscar tanto "estética
facial" quanto "aesthetics clinic"; pra um projeto de agendamento, tanto
"agendamento de horário" quanto "appointment scheduling"). Repetir com os
termos do que vai ser produzido (pergunta 2) e da meta (pergunta 3).

Política obrigatória diante de qualquer skill de terceiro encontrada:

> "Skill de terceiro nunca se instala às cegas: ler o conteúdo da skill
> encontrada, aproveitar só o que serve e gerar uma skill própria adaptada ao
> projeto, dentro da pasta dele. O que não existir em lugar nenhum, criar do
> zero. Cada skill criada é curta, tem frontmatter name/description e segue o
> formato de 4 partes quando pergunta algo."

Meta: entre 3 e 6 skills ativadas no projeto novo, escolhidas pelo que vai
ser produzido (pergunta 2) e pela meta (pergunta 3).
O pacote de marketplace, quando entra, conta como um bloco só (o de vídeo e o de mídia social também) e fica fora dessa
conta. Menos é mais: skill que o projeto não vai usar nos primeiros 30 dias fica
de fora.

Quando a pergunta 4 apontou conselho, órgão ou dado sensível deste projeto,
reler cada skill gerada procurando exemplo que contradiga o próprio limite que
ela declara. O exemplo é o que o modelo imita na hora do uso, então exemplo e
limite que brigam entre si viram a regra sendo furada no caso regulado.

## Passo 3, criar por cópia seletiva

Tudo daqui pra frente acontece de uma vez, depois que os Passos 0 a 2 já
resolveram todas as respostas. Não gerar arquivo por arquivo durante a
conversa.

### Consentimento do auto-sync (antes de copiar `settings.json`)

Explicar em uma frase e perguntar:

> "Esse projeto também pode salvar o trabalho sozinho num backup na nuvem
> (GitHub) ao fim de cada resposta. Quer deixar ligado, do mesmo jeito que
> nos outros projetos?"

Guardar a escolha para aplicar na cópia do `settings.json` abaixo.

### Anúncio pago (antes de escolher as skills)

Perguntar na conversa, no formato de 4 partes:

> "Você investe em anúncio pago hoje, ou pretende investir nos próximos meses?
>
> Pergunto porque, se sim, eu já instalo aqui o comando que cuida disso: ele
> calcula quanto vale um resultado pro seu negócio e, toda vez que você chamar,
> te diz o que está queimando dinheiro e o que merece mais verba.
>
> Tipo: 'sim, rodo anúncio no Instagram', 'ainda não, mas quero começar', ou
> 'não, meu movimento vem de indicação'."

Resposta positiva ou "pretendo": copiar a pasta `_modelo/.claude/skills/trafego/`
inteira, com `referencias/` e `scripts/` dentro, pro `.claude/skills/` do
projeto, e registrar em `_contexto/ferramentas.md` que a skill está instalada e
ainda sem régua, porque a régua nasce na primeira vez que a pessoa rodar
`/trafego`.

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o `/trafego`
existe e pode ser instalado depois com o `/mapear`, que acha a skill em
`_modelo/.claude/skills/trafego/`.

### Venda em marketplace (antes de escolher as skills)

Só quando as respostas do Passo 1 ou o `empresa.md` lido no Passo 0 citam
marketplace, Mercado Livre, Shopee, Amazon ou Magalu, ou a pessoa diz que quer
começar a vender online. Perguntar na conversa, no formato de 4 partes:

> "Vi que você vende ou quer vender em marketplace. Tenho um pacote pronto pra isso: vai do
> 'posso vender esse produto?' até o anúncio publicado e a conta auditada, e
> custa zero pra usar (as partes pagas são opcionais e sempre avisadas antes
> de rodar: gerar imagem por IA e a leitura das fotos dos concorrentes). Quer que eu instale?
>
> Pergunto porque ele é grande (catorze comandos que trabalham juntos), então só
> entra se fizer sentido pra você.
>
> Tipo: 'quero, vendo no Mercado Livre', 'vendo na Shopee, serve?', ou 'agora
> não'."

Quem ainda não vende ouve também: "e se você está começando do zero, o pacote
tem uma trilha que vai da conta no gov.br ao primeiro anúncio, pelo
dropshipping ou com produto próprio".

A esteira e as ferramentas do pacote são do Mercado Livre (e do Bling, pra quem
usa). Quem vende só em outro marketplace ouve isso numa frase: o método
(pode vender, análise de catálogo, decisão e montagem do anúncio) serve pra
qualquer um; pesquisa, simulador, Ads e auditoria são do Mercado Livre.

Resposta positiva: copiar pro projeto as catorze pastas inteiras de
`_modelo/.claude/skills/` (`mercado-livre`, `comecar-a-vender`, `pode-vender`,
`analisar-catalogo`, `pesquisar-tendencia`, `espionar-concorrente`,
`decidir-anuncio`, `montar-anuncio`, `cadastrar-bling`, `publicar-marketplace`,
`mercado-ads`, `auditar-conta`, `gerar-imagens`, `engenharia-reversa`) e os seis agentes de `_modelo/.claude/agents/`
(`ml-minerador.md`, `ml-espiao.md`, `ml-copywriter.md`, `ml-designer.md`,
`ml-auditor.md`, `ml-publicador.md`) pra `.claude/agents/` do projeto. Nunca
copiar arquivo terminado em `.test.mjs` nem pasta `node_modules/`. O pacote vai
inteiro ou não vai: as skills dividem a mesma biblioteca de scripts. Depois:

- Na seção "Estrutura de pastas" do `AGENTS.md` do projeto, uma linha:

    - pacote Mercado Livre: `fornecedores/`, `anuncios/`, `dados/pipeline/`, `relatorios/` e `_contexto/mercado-livre.md`, criados pela `/mercado-livre` na primeira vez

- Em `_contexto/ferramentas.md`: `| pacote Mercado Livre | instalado | <AAAA-MM-DD> | sem configuração: nasce na primeira /mercado-livre |`
- Em `tarefas.md`: "rodar `/mercado-livre` (ele pergunta se você já vende e, se não, abre a trilha do zero), e o `/conectar` (seção Mercado Livre e Bling) pra ligar as contas".

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o pacote de
marketplace existe e pode ser instalado depois pelo `/mapear`.

### Vídeo (depois do marketplace)

Só quando o pacote de marketplace acabou de entrar. Perguntar na conversa, no
formato de 4 partes:

> "Tenho também um pacote de vídeo: faz o vídeo do produto sem você filmar nada,
> a partir das dúvidas que os compradores deixam nos concorrentes, e edita o
> vídeo que você grava no celular, com corte, legenda e música. Editar o que você
> gravou é grátis; gerar vídeo por IA custa alguns dólares por vídeo, sempre
> mostrado antes de gastar. Quer que eu instale?
>
> Pergunto porque ele pede uns 4 GB livres no computador na instalação (uns 3 GB
> depois), então só entra se fizer sentido. Música e efeito sonoro você baixa
> grátis nos sites certos; eu mostro onde.
>
> Tipo: 'quero', 'quero, mas configuro outro dia', ou 'agora não'."

Resposta positiva: copiar pro projeto as três pastas inteiras de
`_modelo/.claude/skills/` (`configurar-video`, `video-produto`, `editar-video`)
e, se ainda não estiver no projeto, a `assistir-video` (o vídeo usa ela na
conferência final). Nunca copiar arquivo terminado em `.test.mjs` nem pasta
`node_modules/`. Depois:

- Em `_contexto/ferramentas.md`: `| pacote de vídeo | instalado, motor ainda não | <AAAA-MM-DD> | o motor entra pela /configurar-video, uma vez |`
- Em `tarefas.md`: "rodar `/configurar-video` num dia com tempo e internet boa (baixa uns 4 GB); ele termina com um vídeo de teste".

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o pacote de
vídeo existe e pode ser instalado depois pelo `/mapear`.

### Mídia social (depois do marketplace)

Quando as respostas do Passo 1 ou o `empresa.md` lido no Passo 0 cita Instagram, TikTok, YouTube, rede social, post ou vídeo, ou
quando o pacote de marketplace acabou de entrar. Perguntar na conversa, no
formato de 4 partes:

> "Tenho também um pacote de redes sociais: sugere os posts da semana olhando o
> que funciona no seu nicho e o que os seus compradores perguntam, agenda no
> Instagram, TikTok e YouTube de uma vez e mede o resultado depois. É grátis pra
> usar; a única parte paga é uma análise de vídeo mais caprichada, opcional e
> sempre avisada antes. Quer que eu instale?
>
> Pergunto porque ele é grande (seis comandos que trabalham juntos), então só
> entra se fizer sentido.
>
> Tipo: 'quero, pra loja', 'quero, mas pro meu perfil pessoal', ou 'agora não'."

Resposta positiva: copiar pro projeto as seis pastas inteiras de
`_modelo/.claude/skills/` (`midia-social`, `pauta`, `decupar-referencia`,
`publicar-social`, `auditar-instagram`, `gerenciar-youtube`). Nunca copiar
arquivo terminado em `.test.mjs` nem pasta `node_modules/`. O pacote vai
inteiro ou não vai: as skills dividem a mesma biblioteca de scripts. Copiar
também, se ainda não estiverem no projeto, a `assistir-video` e a `transcribe`:
a `decupar-referencia` e a `pauta` usam as duas. Copiar também o agente
`_modelo/.claude/agents/pauta-leitor.md` pra `.claude/agents/` do projeto: a `pauta`
despacha por ele quem lê legenda alheia, sem terminal nem internet. Depois:

- Na seção "Estrutura de pastas" do `AGENTS.md` do projeto, uma linha:

    - pacote de mídia social: `perfis/`, `inteligencia/`, `biblioteca/`, `producao/` e `_contexto/midia-social.md`, criados pela `/midia-social` na primeira vez

- Em `_contexto/ferramentas.md`: `| pacote de mídia social | instalado | <AAAA-MM-DD> | contas se ligam pela /midia-social, uma por vez |`
- Em `tarefas.md`: "rodar `/midia-social` (ele pergunta se o perfil é da loja ou pessoal e cria as pastas) e ligar o Buffer pelo guia que ele abre".

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o pacote de
mídia social existe e pode ser instalado depois pelo `/mapear`.

### Loja (depois da mídia social)

Quando as respostas do Passo 1 ou o `empresa.md` lido no Passo 0 cita venda direta ao cliente: WhatsApp, encomenda, Pix, sinal,
cardápio, loja física, delivery ou "vendo pelo Instagram". Perguntar na conversa, no
formato de 4 partes:

> "Vi que você vende direto pro cliente. Tenho um pacote de loja: responde o WhatsApp
> com o preço e o prazo da sua tabela (eu rascunho, você manda), anota pedido e sinal,
> mostra quem está devendo e rascunha a cobrança no seu tom. É grátis pra usar. Quer
> que eu instale?
>
> Pergunto porque ele mexe no seu dinheiro do dia a dia, então só entra se fizer sentido.
>
> Tipo: 'quero', 'quero, mas me explica o caixa', ou 'agora não'."

Resposta positiva: copiar pro projeto as três pastas inteiras de
`_modelo/.claude/skills/` (`atendimento`, `caixa`, `cobrar`). Nunca copiar arquivo
terminado em `.test.mjs`. O pacote vai inteiro ou não vai: o atendimento e o
cobrar usam os scripts do caixa. Quem só quer uma parte recebe as três e começa
pela que quer; as outras ficam quietas até serem chamadas. Depois, uma pergunta só, no formato de 4 partes:

> "Seu negócio tem CNPJ? Se tem, ele é MEI, Simples Nacional ou outro regime? Pergunto
> porque, se você é MEI, eu cuido também do DAS de todo mês, da declaração anual e do teto
> de faturamento. Nos outros regimes o imposto muda com o que você vende, e quem faz essa
> conta é o contador.
>
> Tipo: 'sou MEI', 'Simples Nacional, tenho contador' ou 'ainda não tenho CNPJ'."

- **MEI:** copiar também a pasta `mei` e anotar `**Registro:** MEI` no
  `_contexto/empresa.md` (data de abertura e tipo, a `/mei` pergunta na primeira vez).
- **Simples Nacional:** se a pessoa disser só "Simples", confirmar se ela paga um valor
  fixo todo mês (aí é MEI) ou uma parte de cada venda. Anotar `**Registro:** Simples
  Nacional, com contador` ou `**Registro:** Simples Nacional, procurando contador`. A
  `mei` fica de fora.
- **Outro regime (Lucro Presumido, Lucro Real):** anotar `**Registro:** <regime>, com
  contador` (ou `procurando contador`). A `mei` fica de fora.
- **Sem contador no Simples ou em outro regime:** dizer com todas as letras que ela
  precisa procurar um contador com urgência, e anotar no `tarefas.md` "achar um contador".
- **Ainda não tem CNPJ:** anotar `**Registro:** sem CNPJ, vende como pessoa física`.
  A `mei` fica de fora; o `/caixa` avisa uma vez quando o Pix na conta pessoal passa do
  ponto em que o banco pode cobrar tarifa, e oferece a `mei` só se a pessoa quiser
  formalizar.
- **Não sei:** perguntar se ela paga um valor fixo todo mês (MEI) ou uma parte de cada
  venda. Seguindo sem saber, explicar que a Consulta Optantes da Receita mostra de graça,
  só com o CNPJ, se a empresa é MEI ou Simples (`regime-consulta`, no fatos.md da
  `/comecar-a-vender`), anotar `**Registro:** regime a conferir` e, no `tarefas.md`,
  "descobrir o regime do CNPJ e me contar".

E em seguida:

- Na seção "Estrutura de pastas" do `AGENTS.md` do projeto, uma linha:

    - pacote de loja: `dados/catalogo.csv` (tabela de preços e prazos) e `dados/caixa/` (pedidos e pagamentos), criados na primeira vez pelo `/atendimento` e pelo `/caixa`

- Em `_contexto/ferramentas.md`: `| pacote de loja | instalado | <AAAA-MM-DD> | a tabela de preços nasce no primeiro /atendimento |`
- Em `tarefas.md`: "rodar `/atendimento` com uma foto do cardápio ou da tabela de preços pra montar o catálogo".

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o pacote de
loja existe e pode ser instalado depois pelo `/mapear`.

### Criar app (depois da loja)

Quando as respostas do Passo 1 ou o `empresa.md` lido no Passo 0 cita app, aplicativo,
sistema, plataforma, SaaS, site com login ou "quero vender assinatura de um programa".
Perguntar na conversa, no formato de 4 partes:

> "Tenho também um pacote pra criar um app ou sistema seu, do estudo de um app que já
> existe até o seu no ar com marca própria: planeja, monta, testa, faz a página de venda e
> publica. Montar é grátis; o que custa (domínio, hospedagem paga, conta nas lojas de
> celular, taxa do INPI) é sempre avisado antes, com o valor, e só anda com o seu ok.
>
> Pergunto porque ele é grande (dez comandos que trabalham juntos) e gasta bastante do seu
> plano Claude enquanto o app é construído, então só entra se fizer sentido.
>
> Tipo: 'quero, tenho uma ideia de app', 'quero conhecer, mas sem pressa', ou 'agora não'."

Resposta positiva: copiar pro projeto as dez pastas inteiras de `_modelo/.claude/skills/`
(`app-estudar`, `app-planejar`, `app-visual`, `app-construir`, `app-servidor`,
`app-testar`, `app-comparar`, `app-marca`, `app-lancar`, `app-publicar`). Nunca copiar
arquivo terminado em `.test.mjs` nem pasta `node_modules/`. O pacote vai inteiro ou não
vai: as skills dividem a biblioteca de scripts da `app-estudar` e a `app-publicar` chama os
scripts de três outras. A `ler-avaliacoes`, que o pacote usa na etapa 2, já vem com as
skills base. Depois:

- Na seção "Estrutura de pastas" do `AGENTS.md` do projeto, uma linha:

    - pacote criar app: `app/` (estudo, plano, avaliações, marca e ficha) e `app/codigo/` (o código do app, que vai pro backup junto), criados pela `/app-estudar` na primeira vez

- Em `_contexto/ferramentas.md`: `| pacote criar app | instalado | <AAAA-MM-DD> | contas de hospedagem e pagamento se criam pela /app-servidor, uma por vez |`
- Em `tarefas.md`: "rodar `/app-estudar` com o nome ou o link do app que serve de referência".
- Se o `.gitignore` do projeto não tem a linha `.next/` (projeto que veio de versão antiga), aplicar a entrada `gitignore-criar-app` de `_ferramentas/mudancas.md`, mostrando o antes e o depois. Sem ela, a pasta de build do app sobe pro backup, e o ícone, a fonte e as mudanças de banco de `app/codigo/` ficam de fora.

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o pacote criar app
existe e pode ser instalado depois pelo `/mapear`.

### Nome da pasta

Kebab case do nome do projeto, **sem acento nem caractere especial** (ex:
"Padaria Central" vira `padaria-central/`, "Açaí do Zé" vira `acai-do-ze/`;
acento em nome de pasta cria conflito de normalização entre Mac e Windows no
git). Se já existir uma pasta com esse nome na raiz, avisar e
perguntar outro nome antes de seguir.

### O que copiar de `_modelo/` para `<pasta-do-projeto>/`

- `.claude/settings.json`: copiar como está se o auto-sync ficou ligado; se a
  pessoa recusou, copiar sem o bloco `Stop`. Nesse caso de recusa, a regra 5 do
  `AGENTS.md` do projeto (que hoje descreve o hook salvando tudo sozinho e
  proíbe oferecer `/syncar`) precisa ser reescrita: dizer que não existe backup
  automático configurado e que o assistente deve sugerir `/syncar` ao fim das
  sessões de trabalho. Caminho padrão (auto-sync aceito) mantém a regra 5 como
  está no `_modelo/AGENTS.md`.
- `.claude/hooks/barrar-perigoso.mjs`, só o script (nunca o `.claude/hooks/barrar-perigoso.test.mjs`,
  que é teste de desenvolvimento e não serve de nada no projeto do aluno). É a trava de
  segurança que barra comando destrutivo (apagar pasta, reescrever histórico do GitHub,
  rodar script baixado da internet) antes de ele rodar. Vai sempre, em todo projeto,
  mesmo quando a pessoa recusou o auto-sync: o `settings.json` copiado já chama ela pelo
  bloco `PreToolUse`, e sem o arquivo o projeto nasce apontando pra um script que não existe.
- `.claude/hooks/auto-sync.mjs`, só o script (nunca o `auto-sync.test.mjs`). É o
  backup automático que o bloco `Stop` do `settings.json` chama. Vai sempre, como a
  trava: sem ele o projeto nasce com o `settings.json` apontando pra um script que não existe.
- `.gitignore`, copiar como está.
- `.gitattributes`, copiar como está. Faz o diário e as decisões, que só recebem
  linha nova, juntarem as duas versões sozinhos quando dois computadores escrevem
  ao mesmo tempo, em vez de travar o backup.
- `_contexto/` inteira (`empresa.md`, `preferencias.md`, `estrategia.md`,
  `agora.md`, `licoes.md`, `ferramentas.md`, `automacoes.md`, `infra.md` e as
  pastas `arquivo/` e `pessoas/`), preenchidos
  com o que já se sabe da pessoa pelas leituras do Passo 0 (nome, tom,
  ferramentas que já valem pra ela em qualquer projeto) mais o que é
  específico deste projeto novo (respostas do Passo 1), nunca deixando o
  aviso `NOT CONFIGURED` no projeto final. No `ferramentas.md`, uma linha pra
  cada um dos sete assuntos, como o `/setup` faz (Passo 5): o que já vale pra
  pessoa em qualquer projeto vem do `ferramentas.md` do projeto irmão; o que
  for só deste projeto, perguntar numa mensagem.
- `marca/design-guide.md`: perguntar rapidamente se este projeto muda algo do
  visual já usado nos outros projetos da pessoa. Identidade própria, preencher
  com ela. Mesma identidade dos outros, copiar o `design-guide.md` já
  preenchido do projeto irmão (lido no Passo 0) em vez de deixar em branco,
  senão as skills visuais vão perguntar cor e fonte de novo. Só fica neutro se
  ela ainda não tiver visual definido em lugar nenhum, avisando que dá pra
  preencher depois com o `/atualizar`, dentro da pasta do projeto (nomear o
  comando; sem isso a frase vira lacuna e sai um chute). Essa identidade vale
  pro conteúdo da marca (post, carrossel, proposta, slide). Foto de anúncio de
  marketplace usa as cores e as letras da categoria do produto, sem cor, letra
  ou logo da marca, e quem resolve é a `/mercado-livre`.
- `marca/tom-de-voz.md`: na mesma pergunta do visual, perguntar se este projeto
  fala com o cliente de outro jeito (outro público, outro tratamento). Mesma voz,
  copiar o `tom-de-voz.md` preenchido do projeto irmão; voz própria, as três
  perguntas da "Voz da marca" do `/setup` (Passo 2), aqui em uma mensagem.
- `dados/README.md` (e a pasta `dados/` que ele documenta).
- `_memoria/` inteira, como está no molde: `diario/`, `recados/` e
  `arquivo/` com o `.gitkeep` e o `decisoes.md` só com o cabeçalho. Nunca o
  diário nem as decisões de outro projeto: cada projeto começa o registro dele
  do zero.
- `.origem`: se um projeto irmão tem `.origem` (olhar na pasta dele), criar igual,
  porque é o nome desta máquina; sem irmão com `.origem`, gravar `dono`.
- As skills base do dia a dia: `iniciar`, `conectar`, `mapear`, `atualizar`,
  `syncar`, `bastao`, `checar`, `agendar`, `atualizar-sabinos`, `find-skills`,
  `faxina`, `compartilhar`, `segunda-opiniao` (o `AGENTS.md` do projeto manda
  passar todo pedido de ok por ela) e `aprender-curso` (o `AGENTS.md` do
  projeto e o `/mapear`
  mandam rodar a `find-skills` lá dentro, então ela vai junto, senão a
  instrução aponta pra uma skill que não existe na pasta), mais a `assistir-video`
  e a `transcribe`, que a `aprender-curso` usa pra estudar um curso em vídeo e
  virar mentor, e a `ler-avaliacoes`, que ranqueia o que os clientes do concorrente
  reclamam. Das skills copiadas, nunca copiar arquivo terminado em `.test.mjs` (várias trazem testes que só servem no kit: `trafego`, `agendar`, `faxina`, `compartilhar` e outras; conferir no fim com uma busca por `.test.mjs` dentro do projeto, que tem que voltar vazia). Além dessas, copiar
  `otimizar-pc` só se o computador da pessoa for Windows (já sabido do
  Passo 0, ou perguntar se não ficou claro), e a pasta `trafego` inteira só se a
  pergunta de anúncio pago acima teve resposta positiva ou "pretendo".
  O pacote de marketplace segue o bloco "Venda em marketplace" acima.
- As skills escolhidas no Passo 2 (as ativadas de `templates/skills/` mais as
  geradas do zero), já dentro de `<pasta-do-projeto>/.claude/skills/`. Template
  da biblioteca é arquivo solto (`<nome>.md`) ou pasta: vira
  `.claude/skills/<nome>/SKILL.md` (pasta inteira quando for pasta, com os
  `references/`), nunca um `.md` jogado direto em `.claude/skills/`, que assim
  não carrega. E vai sempre adaptado ao projeto, nunca ativado cru.

### O que nunca copiar

- `templates/` inteira: fica só em `_modelo/`, é a biblioteca de origem, não
  o produto final.
- `README.md` do `_modelo/`.
- Qualquer skill de `_modelo/.claude/skills/` que não tenha sido escolhida
  pra este projeto.

### `AGENTS.md` do projeto (com `CLAUDE.md` de ponteiro)

Partir de `_modelo/AGENTS.md` inteiro e mexer só no título e na seção
`## Sobre este negócio` (a que traz o comentário `NOT CONFIGURED`): trocar
pelo nome do projeto novo e por um resumo real do que ele é, vindo das
respostas do Passo 1. As outras seções (`## Mapa`, `## Tabela de destinos`,
`## Gatilhos`, `## Recall`, `## Rotinas`, `## Regras de operação`,
`## Estrutura de pastas`) não se mexem, tirando a Estrutura de pastas (abaixo)
e a regra 5 quando o auto-sync foi recusado (acima). Onde o texto cita a
biblioteca por `../_modelo/templates/skills/` (o relativo da pasta do projeto
até a pasta-mãe, já que `templates/` não é copiada), só conferir que continua
assim e deixar como está. Reescrever esse caminho de novo gera
`../_modelo/../_modelo/`, que não resolve.

Salvar esse conteúdo como `AGENTS.md` na raiz do projeto novo, e ao lado dele
criar `CLAUDE.md` com uma linha só: `@AGENTS.md`. O Claude Code carrega o
mesmo conteúdo através desse ponteiro, sem duplicar informação em dois
arquivos.

A lista de pastas dentro de "Estrutura de pastas" precisa refletir o que
existe **de verdade** neste projeto, não o que está escrito no `_modelo/` nem
no template do perfil: tirar a linha de `templates/` (a biblioteca não é
copiada, só existe na pasta-mãe) e usar como
inspiração a lista do template de perfil correspondente em
`_modelo/templates/perfis/agents-md-<perfil>.md` (`agencia`, `freelancer`,
`solopreneur` e `empresa` têm modelo pronto; `criador` parte do de
`solopreneur`; `profissional` usa uma estrutura simples:
`trabalho/projetos/`, `trabalho/reunioes/`, `anotacoes/` e `tarefas.md`). O template de perfil traz também uma `## Tabela de destinos` com linhas
próprias do perfil: elas entram dentro da `## Tabela de destinos` do `AGENTS.md`,
nunca como um segundo título igual.
Passar a estrutura de pastas proposta, junto com as skills e os pacotes
escolhidos, pela `/segunda-opiniao` (a skill desta pasta-mãe), mostrar e só
criar depois da pessoa confirmar.

Pasta que nasce agora e ainda não tem arquivo leva um `README.md` de uma linha
dizendo pra que serve, no mesmo espírito do `dados/README.md`. Sem isso ela cai
na conferência de pasta vazia do Passo 4 e some no primeiro backup pro GitHub,
que não guarda pasta vazia.

### `tarefas.md`

Criar na raiz do projeto com as pendências que apareceram na conversa:
decisões adiadas (ex: identidade visual sem definir) e qualquer item que a
pessoa mencionou querer resolver depois.

### Ponte pro Codex

Criar a junction `.agents/skills` (apontando pra `.claude/skills`) na pasta do
projeto recém-criada, e também na pasta-mãe, se ainda não existir. É essa
ponte que deixa o Codex (CLI da OpenAI) enxergar as mesmas skills do Claude
Code. Rodar pelo comando do sistema operacional da pessoa:

- **Windows:** `node -e "const fs=require('fs'),p=require('path');fs.mkdirSync('.agents',{recursive:true});if(!fs.existsSync('.agents/skills'))fs.symlinkSync(p.resolve('.claude/skills'),'.agents/skills','junction')"`
  (não precisa de administrador; vai pelo Node porque funciona igual no Git Bash e
  no PowerShell: o `cmd /c` no Git Bash vira `C:/`, não faz nada e ainda sai sem
  erro; e se o link falhar, o Node sai com erro e a regra da cópia abaixo vale).
- **Mac/Linux:** `mkdir -p .agents && ln -sfn ../.claude/skills .agents/skills`.

No Mac, usar o comando como está: o alvo é relativo de propósito e sobrevive à
pasta mudando de lugar. No Windows não existe essa opção: junction
grava sempre o caminho absoluto, mesmo recebendo alvo relativo, é limitação do
formato. Consequência prática: se a pessoa mover a pasta do SabinOS de lugar, a
ponte quebra em silêncio, e o conserto é apagar `.agents\skills` e rodar o mesmo
comando de novo dentro da pasta. Deixar isso dito na mensagem final quando a ponte
for criada no Windows, com este texto exato (em teste real a frase saiu trocada,
chamando a ponte de "ponte pra backup" e mandando consertar com `/syncar`, que não
tem nada a ver):

> "Se um dia você mover a pasta do SabinOS de lugar, a ponte que deixa o Codex
> enxergar os comandos para de funcionar em silêncio. Nada de backup é afetado. O
> conserto é me pedir 'refaz a ponte do Codex' dentro da pasta do projeto."

Se o comando falhar (permissão, sistema de arquivos sem suporte a link), cair
pra cópia sem travar a criação do projeto: copiar a pasta `.claude/skills`
inteira pra `.agents/skills` e registrar em `_contexto/ferramentas.md` a linha
`| Ponte Codex | cópia | <AAAA-MM-DD> | não é link; /mapear e /atualizar
re-sincronizam |`. Cópia funciona igual pro Codex, só não acompanha skill nova
sozinha, e é por isso que o `/mapear`, o `/atualizar` e o `/checar` conferem se
a ponte é cópia e copiam de novo quando for.

## Passo 4, limpeza, registro e encerramento

### Conferência de limpeza

Listar a pasta do projeto criada e checar, um a um:

- Nenhuma pasta vazia sem função (pasta vazia só se justifica se algo vai
  cair nela em breve, como `dados/`).
- Nenhuma skill copiada que não foi ativada de propósito.
- Nenhum arquivo de template sobrando (`templates/perfis/`,
  `templates/skills/` não deveriam existir dentro do projeto).

Mostrar a estrutura final da pasta em árvore, cabendo numa tela só, pro
usuário ver de uma olhada o que foi criado.

### Lista final de skills, em linguagem simples

Depois da árvore, entregar em prosa, sem jargão técnico: "Esses comandos
ficaram prontos pro seu projeto", seguido de uma linha por skill ativada
dizendo o que ela faz na prática (não o nome do arquivo nem termo técnico),
cobrindo tanto as skills base quanto as escolhidas ou criadas no Passo 2.
O pacote de marketplace entra como uma linha só: "/mercado-livre, a sua esteira
de marketplace, do produto novo ao anúncio publicado".
O de vídeo e o de mídia social, quando entram, também: "/configurar-video, que
prepara o vídeo (depois /video-produto e /editar-video)" e "/midia-social, os
seus posts da semana, agendados e medidos".
O pacote criar app, quando entra, também: "/app-estudar, o começo do seu app (ele diz
qual é o próximo passo ao terminar cada etapa)".

### Registrar e encerrar

1. Adicionar a pasta do projeto no `.gitignore` da pasta-mãe, uma linha só
   (ex: `padaria-central/`).
   Nota: no `.gitignore` fechado (o de hoje, que começa com `*`) essa linha é
   redundante e inofensiva, porque a pasta de projeto já fica fora; ela segura
   o `.gitignore` antigo, aberto, de quem veio de versão anterior à 4.4.
2. Semear `_contexto/agora.md` do projeto:
   - **Onde paramos:** "Projeto recém-criado pelo SabinOS."
   - **Pendências:** "Abrir esta pasta no VS Code e rodar /iniciar",
     "/conectar pra ligar as ferramentas", "/mapear pra criar mais
     comandos", "/syncar pra configurar o backup no GitHub".
3. Registrar o projeto novo em `~/.claude/contexto/projetos.md` (criar a
   pasta e o arquivo se não existirem): uma linha com nome, pasta e o que o
   projeto faz, sem apagar as linhas dos projetos que já estavam lá. A seção
   global do `~/.claude/CLAUDE.md` não cresce: ela entra em toda conversa e
   carrega só regra e duas linhas de quem a pessoa é (regra de forma do
   Passo 3 do `/setup`). Mostrar a linha adicionada antes de gravar.
4. Registrar a versão do SabinOS no projeto. Da pasta-mãe, rodar
   `node _ferramentas/atualizar-projeto.mjs plano <pasta-do-projeto>` e depois
   `node _ferramentas/atualizar-projeto.mjs aplicar <pasta-do-projeto>`. Tudo sai
   "igual" e nada é trocado: o que fica é o recibo `.sabinos/instalado.json` e o
   motor guardado, que deixam o `/atualizar-sabinos` saber, na versão seguinte,
   o que veio do SabinOS e o que é da pessoa.
5. Mensagem final, ensinando clique a clique, cobrindo Windows e Mac, como
   abrir a pasta nova no VS Code (menu Arquivo, opção Abrir Pasta, ou
   arrastar a pasta pro ícone do VS Code). Antes de fechar, dizer que a
   estrutura de hoje é o começo, com este texto:

   > "Os comandos de hoje cobrem o que mais pesa agora. A estrutura cresce
   > com o uso: toda vez que você notar que está fazendo algo pela terceira
   > vez, me fala que vira comando, e quando eu errar, eu anoto pra não
   > repetir. Em um mês esse sistema vai estar bem mais parecido com o seu
   > projeto do que está hoje."

   E fechar com a economia de conversa:

   > "Esse processo fechou, abre uma conversa nova já dentro da pasta do
   > projeto."

## Regras gerais

- Gerar tudo do Passo 3 em diante de uma vez só, depois de fechados os
  Passos 0 a 2. Nunca criar arquivo por arquivo durante a conversa. As
  confirmações do Passo 3 (auto-sync, anúncio pago, identidade visual e a
  estrutura de pastas proposta) vêm antes de gerar, em bloco, e não contam como
  quebrar essa regra.
- Depois de gerar, mostrar só o resumo do que foi criado, não o conteúdo de
  cada arquivo linha por linha.
- Resposta vaga ou em branco, perguntada uma vez e ainda vaga: aceitar o que
  veio, registrar a lacuna em `tarefas.md` e seguir sem virar interrogatório.
- `_modelo/` nunca se edita durante esta skill. Tudo que muda por causa de
  uma resposta do usuário vai para dentro da pasta do projeto.
- Nunca copiar sozinho o `_contexto/empresa.md` de outro projeto pra este: o
  que é comum entre projetos (nome da pessoa, tom, ferramentas gerais) vem
  das leituras do Passo 0, o que é específico deste projeto vem só das
  respostas do Passo 1.
