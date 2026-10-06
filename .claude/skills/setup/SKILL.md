---
name: setup
description: >
  Conduz o fluxo de primeiro projeto do SabinOS. Lê o RESPONDA-AQUI.txt (ou entrevista
  na conversa quando ele está em branco), confirma o entendimento, resolve em chat o
  que não dá pra responder num arquivo (tom, identidade visual, importação de
  ChatGPT/Gemini), grava a identidade global do usuário em ~/.claude/CLAUDE.md,
  descobre skills prontas com a find-skills, e cria o projeto novo por cópia seletiva
  do _modelo/. Use quando o usuário chamar /setup, disser "primeiro projeto",
  "configura o sistema", "vamos começar", ou quando esta pasta-mãe ainda não tiver
  nenhuma pasta de projeto.
---

# /setup, primeiro projeto

Esta skill roda a partir da pasta-mãe (a raiz do SabinOS, onde este arquivo mora
dentro de `.claude/skills/setup/`). Todo caminho abaixo é relativo a essa raiz,
salvo quando marcado como caminho do projeto ou caminho global.

## Regra de formato das perguntas (obrigatória em toda a entrevista)

Quem responde nunca usou IA a sério. Pergunta seca gera resposta de uma linha, e
resposta de uma linha vira memória inútil. Por isso **toda pergunta feita na
conversa sai em 4 partes**:

1. A pergunta, em linguagem de gente, sem jargão.
2. Uma linha de **por que estou perguntando**, o que a resposta muda no sistema.
3. **Dois ou três exemplos de resposta boa**, curtos, de ramos diferentes.
4. Se a resposta vier vaga, curta ou "não sei", **uma repergunta de acompanhamento**
   antes de seguir. Nunca aceitar resposta oca e passar direto pra próxima.

Uma pergunta por mensagem, em conversa natural. Nunca listar várias de uma vez,
nunca numeração formal na frente do usuário.

As 17 perguntas do `RESPONDA-AQUI.txt` já trazem a pergunta, o porquê e os exemplos
prontos, bloco a bloco. Na conversa, usar esse texto direto (partes 1 a 3), só
adaptando pra tom de fala. A parte 4, a repergunta, é montada na hora, dirigida ao
que a resposta deixou faltando.

## Passo 0, ler o questionário

Antes de tudo, rodar `node -v` em silêncio. Sem Node, o Passo 7 falha no fim,
depois da entrevista inteira: avisar logo, em uma linha, que falta instalar o
Node.js (passo 3 da seção "Como instalar" do `README.md`), e seguir só depois.

Abrir `RESPONDA-AQUI.txt` e classificar cada uma das 17 perguntas em três estados:

- **Respondida:** tem conteúdo real embaixo de "Sua resposta:", com detalhe suficiente
  pra usar.
- **Vaga:** tem texto, mas curto, genérico ou do tipo "não sei", "tanto faz", "normal",
  sem profundidade pra virar memória útil.
- **Em branco:** nada escrito embaixo de "Sua resposta:".

Com a classificação em mãos, escolher a rota:

- **10 ou mais respondidas:** seguir a **rota A (arquivo)**. Usar as respostas do
  arquivo como base e ir direto pro Passo 1.
- **Menos de 4 respondidas (quase tudo em branco):** oferecer as duas rotas sem
  travar a conversa, com este texto exato:

  > "Vi que o RESPONDA-AQUI.txt ainda está em branco. Dois caminhos, você escolhe:
  > preenche ele com calma no seu tempo e me chama quando salvar, ou eu te pergunto
  > aqui na conversa e eu mesmo preencho o arquivo pra você. Qual prefere?"

  Se a pessoa escolher preencher sozinha, encerrar a sessão e esperar ela chamar de
  novo. Se escolher a conversa, oferecer o ritmo antes de começar, com este texto:

  > "Dois ritmos: o completo, com 17 perguntas (uns 20 minutos, e a memória fica
  > bem melhor), ou o rápido, com as 11 que eu não consigo trabalhar sem (uns 10
  > minutos; as outras 6 ficam anotadas pra você responder depois, quando quiser).
  > Qual prefere?"

  Seguir então a **rota conversa**: fazer as perguntas na ordem dos blocos (A a F),
  no formato de 4 partes. No ritmo completo, são as 17, pulando as marcadas como
  (opcional) se a pessoa começar a cansar. No ritmo rápido, só as essenciais (1, 3,
  4, 8, 9, 11, 12, 14, 15, 16 e 17); as seis restantes (2, 5, 6, 7, 10 e 13) entram
  no `tarefas.md` do projeto (Passo 5) como "responder no RESPONDA-AQUI.txt quando
  der", com a ressalva de que a 7 (ramo regulado) é perguntada em uma linha mesmo no
  rápido, porque restrição de conselho ou órgão muda o que toda skill pode escrever.
  Gravar cada resposta dentro do próprio `RESPONDA-AQUI.txt`, embaixo do "Sua
  resposta:" correspondente, **na hora, antes da pergunta seguinte**: o arquivo vira
  o registro, mesmo tendo sido preenchido em chat.
- **Entre 4 e 9 respondidas (caso misto):** o arquivo está pela metade, então
  também vale oferecer as duas rotas, com uma versão adaptada pro que já foi
  preenchido:

  > "Vi que você já respondeu parte do RESPONDA-AQUI.txt. Dois caminhos, você
  > escolhe: termina de preencher o resto com calma no seu tempo e me chama quando
  > salvar, ou eu te pergunto aqui na conversa só o que ainda ficou faltando. Qual
  > prefere?"

  Se a pessoa escolher terminar sozinha, encerrar a sessão e esperar ela chamar de
  novo. Se escolher a conversa, perguntar em chat só o que ficou vago ou em branco,
  no formato de 4 partes, sem repetir o que já foi respondido bem. Toda resposta
  colhida em chat é gravada no `RESPONDA-AQUI.txt` **na hora, antes da pergunta
  seguinte**, embaixo do "Sua resposta:" dela. Nunca acumular pra gravar no fim: a
  gravação imediata é o que faz a conversa sobreviver a uma queda no meio das 17
  perguntas; sem ela, a pessoa perde tudo e recomeça do zero.

## Passo 1, confirmar o entendimento

Resumir em até 8 linhas o que foi entendido: quem é a pessoa, o que o negócio faz,
as principais dores, o foco atual e o quick win esperado. Mostrar o resumo e pedir
confirmação antes de seguir para a construção.

Antes de fechar o resumo, checar as perguntas **essenciais** (1, 3, 4, 8, 9, 11, 12,
14, 15, 16 e 17 do `RESPONDA-AQUI.txt`). Toda essencial que ficou vaga ou em branco
recebe uma repergunta dirigida agora, no formato de 4 partes, antes de montar o
resumo. As não essenciais (2, 5, 6, 7, 10, 13) que ficaram vagas ou em branco não
travam o resumo: se a pessoa não completar quando perguntada uma vez, seguir e
anotar a lacuna para o `tarefas.md` do projeto (Passo 5).

Se a mesma pergunta essencial voltar vaga depois da repergunta, aceitar o que veio,
anotar a lacuna e seguir sem insistir mais uma vez.

Se a resposta de confirmação vier com correção ou informação nova ("está certo, só
que..."), acusar o recebimento em uma linha, dizendo o que mudou no entendimento, e
só então seguir para o Passo 2. Quem corrige e não recebe resposta sobre a correção
não sabe se foi ouvido, e passa o resto do onboarding na dúvida.

## Passo 2, perguntas que só funcionam em conversa

Seis interações que não têm como vir prontas de um arquivo, sempre em chat,
independente da rota escolhida no Passo 0:

### Tom (reação ao padrão, não pergunta aberta)

Mostrar o conteúdo de `_modelo/_contexto/preferencias.md` resumido em 3 ou 4 linhas
e perguntar:

> "Esse é o jeito que eu venho configurado pra escrever: informal, direto, sem cara
> de robô, sem enrolação. Quer que eu mude alguma coisa? Pode ser qualquer detalhe:
> mais formal com cliente, pode usar gíria, sempre responder curto, o que for do seu
> jeito."

Se a pessoa pedir mudança, guardar a mudança para escrever no `preferencias.md` do
projeto (Passo 5, não no `_modelo/`, que nunca se edita). Se disser "tá bom assim",
seguir com o padrão.

### Nome do assistente (opcional)

Logo depois do tom, perguntar no formato de 4 partes:

> "Quer me chamar por algum nome? Pode ser qualquer um, ou nenhum.
>
> Pergunto porque tem gente que acha mais fácil conversar com um nome. Ele vale
> em todo projeto seu, e dá pra trocar quando quiser, é só pedir.
>
> Tipo: 'Max', 'Lia', ou 'não precisa'."

Com nome: guardar para o Passo 3. Sem nome: seguir, nada muda.

### Identidade visual

Oferecer as 4 rotas em conversa:

- **URL do site:** ler com WebFetch, apresentar o que foi detectado (cores,
  tipografia, estilo) e confirmar antes de usar.
- **Prints ou logo:** como o projeto ainda não existe nesse ponto da conversa,
  pedir pra pessoa dizer onde os arquivos estão salvos no computador dela
  (o caminho da pasta, ou arrastar o arquivo pro Explorer/Finder e copiar o
  caminho de lá), ler direto de onde estiverem e confirmar antes de usar.
- **Texto:** a pessoa descreve cores, estilo e fontes, usar direto.
- **Não tem:** seguir com um visual neutro e avisar que dá pra preencher depois
  com o `/atualizar`, dentro da pasta do projeto. Nomear o comando: sem isso a
  frase vira lacuna e sai um chute (o `/conectar` liga contas e ferramentas, não
  mexe em identidade visual).

Em todos os casos, perguntar pelo logo (PNG ou SVG), com variação para fundo claro
e escuro se existir.

### Voz da marca (como escrevo no seu lugar, pro seu cliente)

Logo depois do visual, no formato de 4 partes:

> "E quando eu escrever no seu lugar, pro seu cliente (post, anúncio, resposta de
> WhatsApp): trato por tu ou por você? É informal ou mais sério? Tem palavra ou
> promessa que você nunca usaria?
>
> Pergunto porque o jeito que eu falo com você aqui é um, e o jeito que a sua marca
> fala com o cliente pode ser outro. Misturar os dois faz o cliente estranhar.
>
> Tipo: 'você, informal, sem gíria e sem emoji', 'tu, bem descontraído, nunca
> prometer resultado', ou cola um texto seu que ficou bom (email, post, proposta):
> exemplo real vale mais que descrição."

Resposta vaga ("normal"): reperguntar com um dos exemplos. Guardar pro
`marca/tom-de-voz.md` do Passo 5. Sem resposta, o arquivo nasce com os campos em
branco, e até lá o texto pro cliente sai neutro e profissional, com as proibições
de escrita (nunca no tom simples do chat).

### Onde as suas coisas moram (uma mensagem, opcional)

> "Onde ficam as suas coisas na internet: site, domínio, email da empresa, loja?
> Só o nome do serviço, senha nunca.
>
> Pergunto pra, quando algo der problema no site ou no email, eu saber onde
> procurar sem te perguntar de novo.
>
> Tipo: 'site na Hostinger, email no Gmail normal', 'loja na Nuvemshop', ou 'não
> tenho site'."

Vira o `_contexto/infra.md` do Passo 5. "Não tenho" é resposta: a seção diz "não tem".

### Importação de ChatGPT/Gemini (atalho, uma linha)

> "Última coisa: se você já usa ChatGPT ou Gemini com frequência, tenho um atalho
> pra puxar o que eles já sabem de você e completar o que faltou. Quer?"

Se sim, mostrar o prompt pra colar lá, sem alterar nada:

```
Preciso exportar o contexto do meu negócio das nossas conversas para configurar
uma nova ferramenta. Responda com o que sabe sobre mim nas categorias abaixo.
Se não souber algo, deixe em branco:

NOME / NEGÓCIO / O QUE FAZ / PRINCIPAIS ATIVIDADES / CLIENTES / EQUIPE /
FERRAMENTAS / IDENTIDADE VISUAL / TOM DE VOZ / O QUE EVITAR / OUTROS DETALHES
```

Com a resposta colada, extrair o que complementa as respostas já colhidas, mostrar
o resumo do que muda e confirmar antes de usar. Se a pessoa não usar outro
assistente, seguir direto sem essa etapa.

Quem já usa o Claude Code ou o Codex neste computador tem memória pronta aqui
mesmo: existe conteúdo próprio em `~/.claude/CLAUDE.md` (fora dos marcadores do
SabinOS), arquivos em `~/.claude/projects/*/memory/` ou um `~/.codex/AGENTS.md`.
Nesse caso, na mesma mensagem do atalho: "Vi que você já usa o Claude Code (ou o
Codex) aqui. Posso ler o que ele já guardou de você pra não te perguntar de novo?"
Com o sim, ler só esses arquivos, mostrar em até 6 linhas o que serve pro negócio
e confirmar antes de usar; o resto (outros projetos, assunto pessoal) fica de fora.
Sem o sim, nada se lê.

## Passo 3, identidade global

Escrever em `~/.claude/CLAUDE.md` (o arquivo de instrução global do usuário, fora
desta pasta-mãe) uma seção demarcada por `<!-- sabinos:inicio -->` e
`<!-- sabinos:fim -->`. Regras exatas:

- **Arquivo não existe:** criar com só essa seção dentro.
- **Existe, sem os marcadores:** adicionar a seção no final do arquivo, sem tocar
  em nada que já está escrito ali.
- **Existe, com os marcadores:** substituir só o miolo entre eles, mantendo tudo
  antes e depois.

Esse arquivo entra em toda conversa, de qualquer pasta, antes da primeira palavra
do usuário. O modelo presta mais atenção no começo e no fim do que está na mesa,
e cada linha dele é cobrada em toda mensagem. Por isso o bloco segue quatro regras
de forma, nesta ordem de importância:

- **Só regra.** Quem a pessoa é cabe em duas linhas no topo (nome, como prefere
  ser chamada, o que faz, nível de tecnologia: mais simples pra quem nunca usou
  nada disso, mais direta pra quem já se vira). Se a pessoa deu nome ao
  assistente no Passo 2, uma linha logo abaixo: "Você se chama <nome>: atenda
  por esse nome e use ele quando se apresentar." Pedido de troca depois muda
  só essa linha, entre os marcadores. História, lista de projetos e
  notas de ferramenta não entram: vão pra `~/.claude/contexto/` (criar a pasta,
  um arquivo por assunto) e o bloco aponta pra ela em uma linha, "abrir quando a
  tarefa pedir". Nunca com `@import`, senão volta tudo pra mesa.
- **Nunca copiar a lista de skills ou comandos.** O Claude Code já injeta, em
  toda conversa, o nome e a descrição de cada skill instalada. Cópia manual paga
  duas vezes e envelhece.
- **As regras de casa no topo, e repetidas em uma linha no rodapé.** São quatro:
  pesquisa mundial (buscar em qualquer idioma, principalmente inglês, entregar em
  português); economia de conversa (processo fechado, conversa nova); chave e
  senha só em arquivo `.env`, nunca no chat nem em outro arquivo; e gate humano
  (nada que gasta dinheiro, manda mensagem pra fora, publica ou altera conta de
  terceiro roda sem o "pode ir" da pessoa naquele momento). Depois delas, o tom
  de escrita resumido em poucas linhas.
- **Curto.** Meta: menos de 900 tokens, uns 3.500 caracteres. Regra que vale só
  pra um projeto não entra aqui; vai pro `AGENTS.md` daquele projeto. Cada regra
  mora na camada mais alta em que é verdade, e só lá.

Mostrar o bloco inteiro para o usuário antes de gravar, com o tamanho em
caracteres (`node _ferramentas/medir-mesa.mjs` mede depois de gravado).

## Passo 4, descoberta de skills

Detectar o perfil principal a partir das respostas colhidas: `agencia` (múltiplos
clientes com processo de entrega), `freelancer` (solo, vende serviço), `solopreneur`
(negócio próprio, produto ou audiência), `criador` (conteúdo e canal), `empresa`
(equipe organizada por setor), `profissional` (produtividade pessoal e carreira).

Antes de buscar fora, consultar a biblioteca local em `_modelo/templates/skills/`:
o que já existe pronto ali cobre boa parte dos casos comuns.

Depois, rodar a skill `find-skills` com termos do negócio da pessoa, em português
**e** em inglês (exemplo: para uma clínica de estética facial, buscar tanto
"estética facial" quanto "aesthetics clinic"; para agendamento, tanto "agendamento
de horário" quanto "appointment scheduling"). Repetir com os termos das dores
(pergunta 11), das entregas (pergunta 12) e do quick win (pergunta 17).

Política obrigatória diante de qualquer skill de terceiro encontrada:

> "Skill de terceiro nunca se instala às cegas: ler o conteúdo da skill encontrada,
> aproveitar só o que serve e gerar uma skill própria adaptada ao negócio do
> usuário, dentro do projeto. O que não existir em lugar nenhum, criar do zero.
> Cada skill criada é curta, tem frontmatter name/description e segue o formato de
> 4 partes quando pergunta algo."

Meta: entre 3 e 6 skills ativadas no projeto novo, escolhidas pela dor (pergunta
11), pelas entregas (pergunta 12) e pelo quick win (pergunta 17).
O pacote de marketplace, quando entra, conta como um bloco só (o de vídeo e o de mídia social também) e fica fora dessa
conta. Menos é mais: skill que a pessoa não vai usar nos primeiros 30 dias fica
de fora.

Quando a pergunta 7 apontou conselho, órgão ou dado sensível, reler cada skill
gerada procurando exemplo que contradiga o próprio limite que ela declara (um
exemplo de "monte minha dieta" numa skill que proíbe montar plano alimentar, e
assim por diante). O exemplo é o que o modelo imita na hora do uso, então exemplo
e limite que brigam entre si viram a regra sendo furada exatamente no caso
regulado.

## Passo 5, criar o projeto por cópia seletiva

Tudo daqui pra frente acontece de uma vez, depois que os passos 0 a 4 já
resolveram todas as respostas. Não gerar arquivo por arquivo durante a entrevista.

### Consentimento do auto-sync (antes de copiar `settings.json`)

Explicar em uma frase e perguntar:

> "Esse sistema salva o trabalho sozinho num backup na nuvem (GitHub) ao fim de
> cada resposta, pra você nunca perder nada. Quer deixar ligado? Se ainda não tem
> GitHub configurado, o /syncar te guia nisso depois."

Guardar a escolha para aplicar na cópia do `settings.json` abaixo.

### Equipe e computadores (logo depois do auto-sync)

Perguntar na conversa, no formato de 4 partes:

> "Você toca isso sozinho num computador só, ou tem sócio, equipe ou mais de um
> computador mexendo nesse projeto?
>
> Pergunto porque, com mais de um, cada computador assina o que faz com um nome
> curto, e o backup sabe parar e te avisar quando dois mexerem no mesmo arquivo,
> em vez de um apagar o outro.
>
> Tipo: 'só eu, no notebook', 'eu e minha sócia, cada uma no seu', ou 'eu, no
> notebook e no computador da loja'."

Sozinho: o projeto ganha `.origem` com a palavra `dono`, e nada mais muda.

Mais de um: pedir um nome curto pra cada outro computador ou pessoa (uma palavra,
minúscula, só letras sem acento, números ou hífen, tipo `loja`, `ana`, `notebook`); este computador, o principal, continua
`dono`. Gravar o `.origem` com `dono`, registrar em `_contexto/ferramentas.md` a
linha `| Equipe e máquinas | dono (este computador), <nomes> | <AAAA-MM-DD> | cada computador tem o .origem com o próprio nome; o /syncar grava no computador novo |`
e, em `tarefas.md`, uma linha por computador, que se basta sozinha (nesse
computador o agente abre a pasta-mãe, e o projeto só depois): "no computador
<nome>, com o SabinOS instalado e o Git configurado: abrir a pasta-mãe no VS Code
e pedir 'baixa o projeto <pasta> do GitHub' (o agente roda `git clone <endereço do
repositório> <pasta>`); antes de abrir o projeto, criar na raiz dele o arquivo
`.origem` contendo só `<nome>`; acrescentar a linha `<pasta>/` no `.gitignore`
da pasta-mãe; abrir a pasta do projeto e rodar /syncar uma vez (ele acerta nome e
email do Git e o login, se precisar)".

Com o auto-sync recusado a pergunta vale igual: o commit feito pelo `/syncar`
também assina com a origem.

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

Só quando a pergunta 4 ou a 6 do questionário cita marketplace, Mercado Livre,
Shopee, Amazon ou Magalu, ou a pessoa diz que quer começar a vender online.
Perguntar na conversa, no formato de 4 partes:

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

Quando a pergunta 4 ou a 6 do questionário cita Instagram, TikTok, YouTube, rede social, post ou vídeo, ou
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
a `decupar-referencia` e a `pauta` usam as duas. Depois:

- Na seção "Estrutura de pastas" do `AGENTS.md` do projeto, uma linha:

    - pacote de mídia social: `perfis/`, `inteligencia/`, `biblioteca/`, `producao/` e `_contexto/midia-social.md`, criados pela `/midia-social` na primeira vez

- Em `_contexto/ferramentas.md`: `| pacote de mídia social | instalado | <AAAA-MM-DD> | contas se ligam pela /midia-social, uma por vez |`
- Em `tarefas.md`: "rodar `/midia-social` (ele pergunta se o perfil é da loja ou pessoal e cria as pastas) e ligar o Buffer pelo guia que ele abre".

Resposta negativa: não copiar nada, e anotar em `tarefas.md` que o pacote de
mídia social existe e pode ser instalado depois pelo `/mapear`.

### Nome da pasta

Kebab case do nome do negócio ou projeto, **sem acento nem caractere especial**
(ex: "Doce Vida Confeitaria" vira `doce-vida-confeitaria/`, "Açaí do Zé" vira
`acai-do-ze/`). Acento em nome de pasta cria conflito de normalização entre Mac e
Windows no git, e o backup passa a ver o mesmo arquivo como dois.

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
  backup automático que o bloco `Stop` do `settings.json` chama: manda o trabalho
  pro GitHub ao fim de cada resposta e, se outro computador mexeu no mesmo
  arquivo, para e deixa recado em vez de forçar. Vai sempre, como a trava: com o
  auto-sync recusado ele fica no projeto sem nada chamando.
- `.gitignore`, copiar como está. É fechado por padrão: só o tipo liberado (texto, planilha, imagem, PDF, script) vai pro backup.
- `.gitattributes`, copiar como está. Faz o diário e as decisões, que só recebem
  linha nova, juntarem as duas versões sozinhos quando dois computadores escrevem
  ao mesmo tempo, em vez de travar o backup.
- `_contexto/` inteira (os 8 arquivos: `empresa.md`, `preferencias.md`,
  `estrategia.md`, `agora.md`, `licoes.md`, `ferramentas.md`, `automacoes.md`,
  `infra.md`, mais as pastas `arquivo/` e `pessoas/` com o `.gitkeep`), preenchidos com as respostas colhidas (o `automacoes.md` nasce quase
  vazio quando a pessoa não citou rotina; o `infra.md` sai do "Onde as suas coisas
  moram" do Passo 2), nunca deixando o aviso `NOT CONFIGURED` no projeto final.
  No `ferramentas.md`, uma linha pra cada um dos sete assuntos do arquivo, tirada
  das respostas 14 e 15, com o assunto na frente na coluna Ferramenta ("Agenda:
  Google Agenda", "Reunião: nada"): o que ela usa e o sistema ainda não alcança
  fica `só você`; o que ela não tem fica `não ligada`, com o que o `/conectar`
  liga pra isso na Observação. Nada se liga aqui: é só o mapa.
- `marca/design-guide.md`, preenchido com o que veio do Passo 2 (identidade
  visual), ou mantido neutro se a pessoa não tinha nada ainda.
- `marca/tom-de-voz.md`, preenchido com a voz da marca do Passo 2 (o exemplo real
  colado entra inteiro na seção dele), ou com os campos em branco.
- `dados/README.md` (e a pasta `dados/` que ele documenta).
- `_memoria/` inteira (diário, decisões, recados e arquivo, com os `.gitkeep`): é o
  registro do que aconteceu e por quê, e nasce vazia.
- `.origem` não se copia: nasce da pergunta de equipe acima. Fica fora do backup
  de propósito, porque cada computador tem o seu.
- As skills base do dia a dia: `iniciar`, `conectar`, `mapear`, `atualizar`,
  `syncar`, `bastao`, `checar`, `agendar`, `atualizar-sabinos`, `faxina`,
  `compartilhar`, `segunda-opiniao`, `find-skills` e `aprender-curso` (o `AGENTS.md` do projeto e o `/mapear`
  mandam rodar a `find-skills` lá dentro, então ela vai junto, senão a instrução
  aponta pra uma skill que não existe na pasta), mais a `assistir-video` e a
  `transcribe`, que a `aprender-curso` usa pra estudar um curso em vídeo e virar
  mentor. Das skills copiadas, nunca copiar arquivo terminado em `.test.mjs` (a `trafego` e a `agendar` trazem testes que só servem no kit). Além dessas, copiar
  `otimizar-pc` só se o computador da pessoa for Windows, e a
  pasta `trafego` inteira só se a pergunta de anúncio pago acima teve resposta
  positiva ou "pretendo".
  O pacote de marketplace segue o bloco "Venda em marketplace" acima.
  Nunca deduzir o sistema operacional: nenhuma das 17 perguntas pede isso, então
  na dúvida ele entra na pergunta em bloco do Passo 5, antes de listar qualquer
  skill. Assumir Windows entrega a um usuário de Mac uma skill de PowerShell que
  não roda, e o erro só aparece quando ele tenta usar.
- As skills escolhidas no Passo 4 (as ativadas de `templates/skills/` mais as
  geradas do zero), já dentro de `<pasta-do-projeto>/.claude/skills/`. Template
  da biblioteca é arquivo solto (`<nome>.md`) ou pasta: vira
  `.claude/skills/<nome>/SKILL.md` (pasta inteira quando for pasta, com os
  `references/`), nunca um `.md` jogado direto em `.claude/skills/`, que assim
  não carrega. E vai sempre adaptado ao negócio (produtos, tom, regra do ramo),
  nunca ativado cru.

### O que nunca copiar

- `templates/` inteira: fica só em `_modelo/`, é a biblioteca de origem, não o
  produto final.
- `README.md` do `_modelo/`.
- Qualquer skill de `_modelo/.claude/skills/` que não tenha sido escolhida pra
  este negócio.

### `AGENTS.md` do projeto (com `CLAUDE.md` de ponteiro)

Partir de `_modelo/AGENTS.md` inteiro e preencher só a seção `## Sobre este
negócio`: trocar o que o molde deixou marcado como não configurado pelo nome do
negócio e por um resumo real de quem é a pessoa e o que o workspace representa.
As outras seções (`## Mapa`, `## Tabela de destinos`, `## Gatilhos`, `## Recall`,
`## Rotinas`, `## Regras de operação`, `## Estrutura de pastas`) não se mexem,
com duas exceções: a regra 5 de `## Regras de operação` quando o auto-sync foi
recusado (acima) e a lista de `## Estrutura de pastas` (abaixo). O caminho da
biblioteca, `../_modelo/templates/skills/`, já vem certo do molde (o relativo da
pasta do projeto até a pasta-mãe, já que `templates/` não é copiada): conferir e
deixar como está. Reescrever esse caminho de novo gera `../_modelo/../_modelo/`,
que não resolve.

Salvar esse conteúdo como `AGENTS.md` na raiz do projeto (mesmo nome, mesmo
conteúdo do `_modelo/AGENTS.md` personalizado, só muda o arquivo alvo). Ao lado
dele, criar `CLAUDE.md` com uma linha só: `@AGENTS.md`. É esse ponteiro que faz o
Claude Code carregar o mesmo conteúdo, sem duplicar informação em dois arquivos.

A lista de pastas dentro de `## Estrutura de pastas` precisa refletir o que existe **de
verdade** no projeto, não o que está escrito no `_modelo/` nem no template do
perfil: usar como inspiração a lista do
template de perfil correspondente em `_modelo/templates/perfis/agents-md-<perfil>.md`
(`agencia`, `freelancer`, `solopreneur` e `empresa` têm modelo pronto; `criador`
parte do de `solopreneur`; `profissional` usa uma estrutura simples: `trabalho/projetos/`,
`trabalho/reunioes/`, `anotacoes/` e `tarefas.md`). O template de perfil traz também uma `## Tabela de destinos` com linhas
próprias do perfil: elas entram dentro da `## Tabela de destinos` do `AGENTS.md`,
nunca como um segundo título igual. Passar a
estrutura de pastas proposta pela `/segunda-opiniao` (a skill desta pasta-mãe),
mostrar e só criar depois da pessoa confirmar.

Pasta que nasce agora e ainda não tem arquivo (ex: `conteudo/`, `clientes/`)
leva um `README.md` de uma linha dizendo pra que serve, no mesmo espírito do
`dados/README.md`. Sem isso ela cai na conferência de pasta vazia do Passo 6 e
some no primeiro backup pro GitHub, que não guarda pasta vazia.

### `tarefas.md`

Criar na raiz do projeto com as pendências que apareceram na entrevista: lacunas de
perguntas não essenciais deixadas em branco, decisões adiadas (ex: identidade
visual sem definir) e qualquer item que a pessoa mencionou querer resolver depois.

### Ponte pro Codex

Criar a junction `.agents/skills` (apontando pra `.claude/skills`) na pasta do
projeto recém-criada, e também na pasta-mãe, se ainda não existir. É essa ponte
que deixa o Codex (CLI da OpenAI) enxergar as mesmas skills do Claude Code. Rodar
pelo comando do sistema operacional da pessoa:

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
pra cópia sem travar o setup: copiar a pasta `.claude/skills` inteira pra
`.agents/skills` e registrar em `_contexto/ferramentas.md` a linha
`| Ponte Codex | cópia | <AAAA-MM-DD> | não é link; /mapear e /atualizar
re-sincronizam |`. Cópia funciona igual pro Codex, só não acompanha skill nova
sozinha, e é por isso que o `/mapear`, o `/atualizar` e o `/checar` conferem se
a ponte é cópia e copiam de novo quando for.

## Passo 6, conferência de limpeza

Listar a pasta do projeto criada e checar, um a um:

- Nenhuma pasta vazia sem função (pasta vazia só se justifica se algo vai cair
  nela em breve, como `dados/`).
- Nenhuma skill copiada que não foi ativada de propósito.
- Nenhum arquivo de template sobrando (`templates/perfis/`, `templates/skills/`
  não deveriam existir dentro do projeto).

Mostrar a estrutura final da pasta em árvore, cabendo numa tela só, pro usuário
ver de uma olhada o que foi criado.

### Lista final de skills, em linguagem simples

Depois da árvore, entregar em prosa, sem jargão técnico: "Esses comandos ficaram
prontos pro seu negócio", seguido de uma linha por skill ativada dizendo o que ela
faz na prática (não o nome do arquivo nem termo técnico), cobrindo tanto as skills
base quanto as escolhidas ou criadas no Passo 4.
O pacote de marketplace entra como uma linha só: "/mercado-livre, a sua esteira
de marketplace, do produto novo ao anúncio publicado".
O de vídeo e o de mídia social, quando entram, também: "/configurar-video, que
prepara o vídeo (depois /video-produto e /editar-video)" e "/midia-social, os
seus posts da semana, agendados e medidos".

## Passo 7, registrar e encerrar

1. Adicionar a pasta do projeto no `.gitignore` da pasta-mãe, uma linha só (ex:
   `loja-de-bolos/`).
2. Semear `_contexto/agora.md` do projeto:
   - **Onde paramos:** "Sistema recém-criado pelo SabinOS."
   - **Pendências:** "Abrir esta pasta no VS Code e rodar /iniciar", "/conectar
     pra ligar as ferramentas", "/mapear pra criar mais comandos", "/syncar pra
     configurar o backup no GitHub".
3. Registrar a versão do SabinOS no projeto. Da pasta-mãe, rodar
   `node _ferramentas/atualizar-projeto.mjs plano <pasta-do-projeto>` e depois
   `node _ferramentas/atualizar-projeto.mjs aplicar <pasta-do-projeto>`. Tudo sai
   "igual" e nada é trocado: o que fica é o recibo `.sabinos/instalado.json` e o
   motor guardado, que deixam o `/atualizar-sabinos` saber, na versão seguinte,
   o que veio do SabinOS e o que é da pessoa.
4. **Teste de aceite.** Reler do disco, nunca da memória da conversa, o
   `_contexto/empresa.md`, o `_contexto/estrategia.md` e o
   `_contexto/preferencias.md` do projeto, e provar com três fatos tirados deles,
   numa frase só:

   > "Pra conferir que ficou certo: você <quem é e o que faz>, o foco agora é
   > <foco>, e comigo você quer <o jeito>. Bateu?"

   Bateu: seguir. Não bateu: corrigir o arquivo de onde saiu o fato errado,
   anotar no `_contexto/licoes.md` do projeto (entendimento errado corrigido) e
   repetir só o fato corrigido. O teste lê o arquivo porque é ele que o sistema
   vai ler amanhã: fato que ficou só na conversa some.
5. **`bem-vindo.html`.** Copiar `_modelo/templates/bem-vindo.template.html` pra
   raiz do projeto como `bem-vindo.html` e trocar cada marcador:
   - `{{NEGOCIO}}`, `{{PESSOA}}` (como a pessoa prefere ser chamada) e `{{DATA}}`
     (AAAA-MM-DD de hoje);
   - `{{COR_FUNDO}}`, `{{COR_DESTAQUE}}`, `{{COR_TEXTO}}` e `{{COR_CARD}}` pelas
     cores do `marca/design-guide.md` do projeto, e `{{FONTE_TITULO}}` e
     `{{FONTE_CORPO}}` pelas fontes dele. Guia vazio: visual neutro (`#FAFAF7`,
     `#2F5D50`, `#1F2328`, `#FFFFFF`, fonte `Inter` nas duas);
   - `{{LINK_FONTES}}` pela linha `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=<Fonte>:wght@400;700&display=swap">`
     quando a fonte existe no Google Fonts (uma por fonte), ou por nada;
   - `{{LOGO}}` por `<img class="logo" src="marca/<arquivo do logo>" alt="">` quando a
     pessoa mandou o logo no Passo 2 (o arquivo vai pra `marca/` do projeto), ou por nada;
   - `{{FATO_QUEM}}`, `{{FATO_FOCO}}` e `{{FATO_JEITO}}` pelos três fatos do teste
     de aceite, já confirmados;
   - `{{COMANDOS}}` por um `<li>` por comando da lista final do Passo 6, na mesma
     linguagem simples;
   - `{{PROXIMO_PASSO}}` pela primeira pendência do `agora.md`.

   Antes de mostrar, conferir no arquivo gravado que não sobrou nenhum `{{` e
   nenhum travessão (os caracteres U+2014 e U+2013; resposta colada do
   questionário é por onde ele costuma entrar). Abrir no navegador (Windows:
   `start bem-vindo.html`; Mac: `open bem-vindo.html`) e dizer em uma linha que é
   o retrato do que o sistema sabe hoje, tirado agora: a página não se atualiza
   sozinha quando os arquivos mudam.
6. Mensagem final, ensinando clique a clique, cobrindo Windows e Mac, como abrir a
   pasta nova no VS Code (menu Arquivo, opção Abrir Pasta, ou arrastar a pasta pro
   ícone do VS Code). Antes de fechar, dizer que a estrutura de hoje é o começo, com
   este texto:

   > "Os comandos de hoje cobrem o que mais pesa agora. A estrutura cresce com o
   > uso: toda vez que você notar que está fazendo algo pela terceira vez, me fala
   > que vira comando, e quando eu errar, eu anoto pra não repetir. Em um mês esse
   > sistema vai estar bem mais parecido com o seu negócio do que está hoje."

   E fechar com a economia de conversa:

   > "Esse processo fechou, abre uma conversa nova já dentro da pasta do projeto."

## Regras gerais

- Gerar tudo do Passo 5 em diante de uma vez só, depois de fechados os Passos 0 a
  4. Nunca criar arquivo por arquivo durante a entrevista. As cinco confirmações
  do Passo 5 (auto-sync, equipe e computadores, anúncio pago, Windows quando nenhuma resposta deixou
  isso claro, e a estrutura de pastas proposta) vêm antes de gerar, em bloco, e
  não contam como quebrar essa regra.
- Depois de gerar, mostrar só o resumo do que foi criado, não o conteúdo de cada
  arquivo linha por linha.
- Resposta vaga ou em branco não essencial, perguntada uma vez e ainda vaga: aceitar
  o que veio, registrar a lacuna em `tarefas.md` e seguir sem virar interrogatório.
- `_modelo/` nunca se edita durante o setup. Tudo que muda por causa de uma
  resposta do usuário vai para dentro da pasta do projeto.
- Erro corrigido, retrabalho ou regra que mudou durante o próprio setup (por
  exemplo, uma resposta que só ficou clara depois de reperguntada, um ajuste
  de rota no meio da entrevista, ou a pessoa corrigindo o resumo do Passo 1,
  que conta como entendimento errado corrigido) vira uma linha datada em
  `_contexto/licoes.md` do projeto, na hora. Setup que termina com o
  `licoes.md` sem nenhuma linha depois de uma correção dessas está incompleto.
