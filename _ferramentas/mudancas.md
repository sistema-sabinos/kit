# Mudanças que pedem conversa

> Este arquivo é lido pelo `/atualizar-sabinos` (e pela `/atualizar-kit`), nunca
> pelo aluno direto. O motor cuida de arquivo inteiro; aqui fica o que mexe num
> arquivo que é metade do kit e metade da pessoa (`AGENTS.md`, `settings.json`,
> `.gitignore`) ou que muda estrutura.

## Como usar (instrução pro agente)

1. Pular a entrada que já está no recibo (`.sabinos/instalado.json`, campo
   `mudancas`), a não ser que a pessoa peça.
2. Projeto no formato antigo: sem `AGENTS.md` e com um `CLAUDE.md` que tem
   conteúdo próprio (mais que a linha `@AGENTS.md`). Parar antes de qualquer
   entrada que mexe no `AGENTS.md` e perguntar à pessoa se quer migrar: o
   conteúdo do `CLAUDE.md` vai pro `AGENTS.md` novo e o `CLAUDE.md` fica só com
   `@AGENTS.md`. Mostrar o antes e o depois dos dois arquivos e só migrar com o
   sim. Sem migração, as entradas de `AGENTS.md` ficam de fora desta vez.
3. Rodar o "Te afeta se" de cada entrada no projeto. Não afeta: some da lista.
   Depois de cada grupo de 3, rodar de novo o "Te afeta se" das que sobraram:
   uma entrada pode passar a valer depois que outra foi aplicada (a
   `regra-trava` depende da `trava-no-settings`).
4. Mostrar as que sobraram na ordem deste arquivo, **no máximo 3 por vez**, cada
   uma em uma frase de gente. Esperar a pessoa dizer quais entram.
5. Pra cada uma aceita: mostrar o antes e o depois do trecho, aplicar com o sim,
   rodar o "Como testar" e registrar:
   `node .sabinos/atualizar-projeto.mjs registrar . <id> aplicada` (ou `recusada`).
6. Regra do `AGENTS.md` é achada pelo título em negrito, nunca pelo número. No
   arquivo, o número vem dentro do mesmo negrito, antes do título (`**10.
   Pesquisa mundial.**`): procurar o título com ou sem número na frente. Regra
   nova entra com o próximo número depois da última que o projeto tem; as regras
   que já existem não mudam de número.
7. `settings.json` se junta, nunca se substitui: acrescentar o que falta e manter
   tudo que a pessoa já tem. Conferir que continua JSON válido depois.

## aviso-backup-falhou

**O que é:** o `AGENTS.md` passa a mandar avisar, logo na primeira resposta, quando o backup automático no GitHub falhou.
**Por quê:** backup que falha calado é pior que nenhum, porque a pessoa para de se proteger achando que está coberta.
**Te afeta se:** o `AGENTS.md` do projeto não tem o texto `.backup-falhou`.
**Como aplicar:** copiar do `_modelo/AGENTS.md` do kit o parágrafo que começa com "Se existir um arquivo `.backup-falhou`" pro fim da seção "Início de conversa" do projeto.
**Como testar:** o `AGENTS.md` do projeto contém `.backup-falhou` uma vez só.

## regra-pesquisa-mundial

**O que é:** regra de buscar em qualquer idioma, principalmente inglês, e entregar em português.
**Por quê:** conteúdo só em português limita a resposta ao que existe no Brasil.
**Te afeta se:** o `AGENTS.md` não tem uma regra com o título `Pesquisa mundial.` em negrito (com ou sem número na frente, como `**10. Pesquisa mundial.**`).
**Como aplicar:** copiar a regra "Pesquisa mundial" do `_modelo/AGENTS.md` do kit pro fim de "Regras de operação", com o próximo número.
**Como testar:** o título `Pesquisa mundial.` aparece uma vez, em negrito, no `AGENTS.md`.

## regra-camadas

**O que é:** regra de cada regra morar num lugar só (global, pasta-mãe ou projeto), com o arquivo de regra curto.
**Por quê:** regra copiada em várias pastas envelhece em todas menos na que foi arrumada, e arquivo de regra comprido faz o modelo prestar menos atenção.
**Te afeta se:** o `AGENTS.md` não tem uma regra com o título `Camadas de regra.` em negrito (com ou sem número na frente, como `**10. Camadas de regra.**`).
**Como aplicar:** copiar a regra "Camadas de regra" do `_modelo/AGENTS.md` do kit pro fim de "Regras de operação", com o próximo número. Se o projeto não tem o `/checar`, tirar a última frase ("O `/checar` mede isso.").
**Como testar:** o título `Camadas de regra.` aparece uma vez, em negrito, no `AGENTS.md`.

## trava-no-settings

**O que é:** liga a trava que barra comando destrutivo (apagar pasta inteira, reescrever histórico do Git, rodar script baixado direto).
**Por quê:** um comando digitado errado apaga semanas de trabalho, e a trava para isso antes de rodar.
**Te afeta se:** o arquivo `.claude/hooks/barrar-perigoso.mjs` existe no projeto e o `.claude/settings.json` não cita `barrar-perigoso`.
**Como aplicar:** acrescentar no `settings.json`, dentro de `hooks`, o bloco `PreToolUse` igual ao do `_modelo/.claude/settings.json` do kit (matcher `Bash|PowerShell`), sem mexer no resto.
**Como testar:** o `settings.json` é JSON válido (`node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`) e `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | node .claude/hooks/barrar-perigoso.mjs` sai com código 0 (a trava roda e deixa passar comando inofensivo). Avisar que a trava vale a partir da próxima conversa.

## regra-trava

**O que é:** regra que diz o que fazer quando a trava barrar um comando: parar e explicar, nunca procurar outro caminho.
**Por quê:** sem ela, o assistente tende a contornar a trava e fazer a mesma coisa por outra rota.
**Te afeta se:** a entrada `trava-no-settings` está aplicada (ou o `settings.json` já cita `barrar-perigoso`) e o `AGENTS.md` não tem uma regra com o título `Trava de comando destrutivo.` em negrito (com ou sem número na frente, como `**10. Trava de comando destrutivo.**`).
**Como aplicar:** copiar a regra "Trava de comando destrutivo" do `_modelo/AGENTS.md` do kit pro fim de "Regras de operação", com o próximo número.
**Como testar:** o título `Trava de comando destrutivo.` aparece uma vez, em negrito, no `AGENTS.md`.

## chave-protegida

**O que é:** o assistente passa a pedir licença antes de ler o arquivo de chaves (`.env`) e nunca lê a pasta `secrets/`.
**Por quê:** chave lida entra na conversa, e conversa pode ir parar em print, em log ou em outro lugar.
**Te afeta se:** o `.claude/settings.json` não tem `Read(./.env)` em `permissions.ask`.
**Como aplicar:** acrescentar em `permissions.ask` os itens `Read(./.env)` e `Read(./.env.*)`, e em `permissions.deny` o item `Read(./secrets/**)`, criando `permissions` se não existir e sem tirar nada que já esteja lá.
**Como testar:** JSON válido e os três itens presentes.

## backup-com-aviso

**O que é:** o backup automático passa a deixar um aviso (`.backup-falhou`) quando não consegue subir pro GitHub.
**Por quê:** hoje, quando o envio falha, ninguém fica sabendo.
**Te afeta se:** o `settings.json` tem hook `Stop` com `git push` e o comando dele não tem `.backup-falhou`.
**Como aplicar:** mostrar o `command` atual desse hook `Stop` e o do `_modelo/.claude/settings.json` do kit, lado a lado. Se o atual não tem nada além do padrão do kit, trocar pelo do kit. Se tem algum pedaço que a pessoa acrescentou, perguntar antes e juntar os dois textos, mantendo o que é dela. Se a pessoa desligou o auto-sync (não tem `Stop`), não se aplica.
**Como testar:** JSON válido e o `command` do `Stop` contém `.backup-falhou`.

## regra-bastao

**O que é:** a regra de economia de conversa passa a mandar rodar o `/bastao` antes de continuar um assunto em conversa nova.
**Por quê:** sem ele, a conversa nova começa sem saber onde a anterior parou.
**Te afeta se:** o projeto tem `.claude/skills/bastao/` e a regra "Economia de conversa" do `AGENTS.md` não cita `/bastao`.
**Como aplicar:** acrescentar ao fim do parágrafo da regra "Economia de conversa" a frase "Quando o assunto continua em outra conversa, rodar o `/bastao` antes: ele salva o ponto exato pra retomada."
**Como testar:** `/bastao` aparece na regra "Economia de conversa".

## regra-licoes-pelo-atualizar

**O que é:** a regra do loop de lições passa a dizer quem transforma lição repetida em regra: o `/atualizar`, ao fechar a sessão.
**Por quê:** sem dono, a lição repetida fica só registrada e o erro volta.
**Te afeta se:** a regra "Loop de lições" do `AGENTS.md` não cita `/atualizar`.
**Como aplicar:** trocar a última frase da regra "Loop de lições" pela versão do `_modelo/AGENTS.md` do kit, mantendo qualquer frase que a pessoa tenha acrescentado.
**Como testar:** a regra "Loop de lições" cita `/atualizar`.

## criacao-de-skills

**O que é:** a seção "Criação de skills" ganha três passos: mostrar o plano antes de criar, delegar a skill feita do zero pra `skill-creator` e testar com um caso real.
**Por quê:** skill criada sem plano e sem teste costuma nascer torta e só aparecer quebrada no uso.
**Te afeta se:** a seção "Criação de skills" do `AGENTS.md` não cita `skill-creator`.
**Como aplicar:** mostrar lado a lado a seção do projeto e a do `_modelo/AGENTS.md` do kit, e aplicar a do kit mantendo os passos que a pessoa escreveu e que o kit não tem. O caminho da biblioteca de templates segue a entrada `caminho-da-biblioteca`.
**Como testar:** a seção cita `skill-creator` e continua com todos os passos próprios da pessoa.

## caminho-da-biblioteca

**O que é:** o `AGENTS.md` passa a apontar pra biblioteca de templates da pasta-mãe, e deixa de usar uma cópia dentro do projeto.
**Por quê:** a cópia local para no tempo, e a da pasta-mãe é a que a atualização mantém nova.
**Te afeta se:** o `AGENTS.md` cita `templates/skills/` num caminho que não resolve a partir do projeto, ou o projeto tem uma pasta `templates/` própria.
**Como aplicar:** achar a pasta-mãe (a pasta com `_modelo/AGENTS.md` dentro, normalmente a de cima ou uma ao lado) e trocar cada menção a `templates/` no `AGENTS.md` pelo caminho relativo que resolve (ex.: `../_modelo/templates/` ou `../SabinOS-Sistema/_modelo/templates/`). A pasta `templates/` própria do projeto só sai com aprovação nominal da pessoa, e antes conferir se ela tem algum arquivo que não existe na biblioteca da pasta-mãe (esse fica).
**Como testar:** todo caminho de `templates/` citado no `AGENTS.md` existe no disco.

## ponte-codex-fora-do-git

**O que é:** a ponte `.agents/` (que deixa o Codex enxergar as skills) sai do GitHub.
**Por quê:** ela aponta pra `.claude/skills`; guardada no git, vira uma segunda cópia de todas as skills que envelhece.
**Te afeta se:** `git ls-files .agents` lista algum arquivo, ou o `.gitignore` não tem `.agents/`.
**Como aplicar:** acrescentar `.agents/` ao `.gitignore` e rodar `git rm -r --cached .agents`, que tira do controle do git sem apagar nada do disco. Dizer isso à pessoa com essas palavras antes.
**Como testar:** `git ls-files .agents` não lista nada e a pasta `.agents/skills` continua no disco.

## oferta-mercado-livre

**O que é:** oferece o pacote de marketplace (treze comandos, do "posso vender isso?" ao anúncio publicado e à conta auditada) pra quem vende em marketplace.
**Por quê:** quem vende no Mercado Livre refaz na mão, todo produto, pesquisa, preço, anúncio e auditoria que o pacote faz.
**Te afeta se:** o `_contexto/empresa.md` cita marketplace, Mercado Livre, Shopee, Amazon ou Magalu, e o projeto não tem `.claude/skills/mercado-livre/`.
**Como aplicar:** dizer em uma frase o que o pacote faz e perguntar se entra. Com o sim, refazer o plano do Passo 3 com `--componentes mercado-livre` (somado a qualquer outro componente já escolhido) e aplicar. Depois, a entrada `estrutura-mercado-livre` passa a valer.
**Como testar:** `.claude/skills/mercado-livre/SKILL.md` e `.claude/agents/ml-publicador.md` existem no projeto.

## estrutura-mercado-livre

**O que é:** registra no projeto as pastas que o pacote de marketplace cria e protege o login do Chrome dedicado.
**Por quê:** sem a linha no `AGENTS.md`, o assistente não sabe onde mora cada anúncio; sem a linha no `.gitignore`, o backup sobe o login da sua conta do Mercado Livre pro GitHub.
**Te afeta se:** o projeto tem `.claude/skills/mercado-livre/` e o `.gitignore` não tem `dados/chrome-perfil/`, ou a seção "Estrutura de pastas" do `AGENTS.md` não cita `anuncios/`.
**Como aplicar:** acrescentar ao `.gitignore` as duas linhas do `_modelo/.gitignore` do kit que começam em "# Perfil do Chrome dedicado"; e, na seção "Estrutura de pastas" do `AGENTS.md`, a linha abaixo:

```
- pacote Mercado Livre: `fornecedores/`, `anuncios/`, `dados/pipeline/`, `relatorios/` e `_contexto/mercado-livre.md`, criados pela `/mercado-livre` na primeira vez
```

Se `dados/chrome-perfil/` já estiver no git (`git ls-files dados/chrome-perfil`), rodar `git rm -r --cached dados/chrome-perfil`, que tira do git sem apagar do disco, dizendo isso à pessoa antes.
**Como testar:** `git check-ignore dados/chrome-perfil/x` imprime o caminho, e `anuncios/` aparece uma vez no `AGENTS.md`.

## estilo-por-categoria

**O que é:** o guia de marca ganha a seção "Estilo por categoria", que diz qual estilo de foto (Limpo, Colorido ou Natural) cada categoria de produto usa.
**Por quê:** a `/gerar-imagens` lê essa seção pra escolher as cores e o clima das fotos do anúncio; sem ela, todas saem no estilo Limpo.
**Te afeta se:** o projeto tem `.claude/skills/gerar-imagens/` e o `marca/design-guide.md` não tem a seção `## Estilo por categoria`.
**Como aplicar:** copiar do `_modelo/marca/design-guide.md` do kit a seção `## Estilo por categoria` inteira (do título até o `---` que vem antes de `## O que NUNCA fazer`) e colar no `marca/design-guide.md` do projeto logo antes de `## O que NUNCA fazer`, sem mexer no resto do guia. Guia sem essa seção "O que NUNCA fazer": colar no fim.
**Como testar:** `## Estilo por categoria` aparece uma vez no `marca/design-guide.md` e vem antes de `## O que NUNCA fazer`.

## permissao-escrita-ml

**O que é:** o `/publicar-marketplace` passa a criar o anúncio direto no Mercado Livre, já pausado, quando você não usa Bling.
**Por quê:** pra isso o aplicativo do Mercado Livre que você criou no `/conectar` precisa de permissão de leitura e escrita; com só leitura, a auditoria funciona e a publicação volta erro de permissão.
**Te afeta se:** o `.env` tem `ML_CLIENT_ID` e o projeto tem `.claude/skills/publicar-marketplace/scripts/publicar-ml.mjs`.
**Como aplicar:** abrir com a pessoa o portal de desenvolvedor do Mercado Livre, no aplicativo dela, e conferir na tela que a permissão é de leitura e escrita; se for só leitura, trocar e autorizar a conta de novo com o `autorizar.mjs --ml --url`, como no `/conectar`.
**Como testar:** o `publicar-ml.mjs --montar` de um anúncio auditado termina sem erro de permissão (a validação do Mercado Livre é uma escrita que não cria nada).

## video

**O que é:** três skills novas de vídeo: `/configurar-video` (instala o motor de vídeo uma vez, medindo a máquina), `/video-produto` (vídeo do produto sem filmar, a partir das perguntas e opiniões do concorrente) e `/editar-video` (edita o vídeo que você gravou, com fundo verde ou no seu cenário). O teto padrão de gasto (`limite_gasto_usd`) passou de US$ 2 pra US$ 4.
**Por quê:** vídeo é o que mais move venda e perfil, e agora sai pelo sistema com aviso de custo antes de qualquer gasto.
**Te afeta se:** você quer fazer vídeo de produto ou editar vídeo gravado. O teto novo vale pra quem não escreveu `limite_gasto_usd` no `_contexto/mercado-livre.md`.
**Como aplicar:** `/atualizar-sabinos` traz as skills; depois rode `/configurar-video` uma vez (uns 4 GB livres na instalação, uns 3 GB depois). Música e efeito sonoro não vêm no kit: cada pessoa baixa os seus, e o `/editar-video` mostra onde colocar.
**Como testar:** `/configurar-video` termina com um vídeo de teste de uns 8 segundos com legenda.

## pacote-midia-social

**O que é:** pacote novo de redes sociais, com seis comandos: `/midia-social` (configura e mostra o estado), `/pauta` (posts da semana com roteiro), `/decupar-referencia` (ficha de vídeo que funcionou), `/publicar-social` (agenda no Instagram, TikTok e YouTube pelo Buffer), `/auditar-instagram` (raio-x da conta e resultado de cada post) e `/gerenciar-youtube` (canal pela API).
**Por quê:** levar pro aluno o fluxo de redes sociais que roda na operação do criador do SabinOS, com perfil da loja como padrão e marca pessoal como opção.
**Te afeta se:** o projeto vende ou quer vender e quer postar nas redes; pacote opcional, nada muda pra quem não instalar.
**Como aplicar:** oferecer o pacote como no bloco "Mídia social" do `/setup`; se a pessoa quiser, copiar as seis pastas e rodar `/midia-social`.
**Como testar:** `/midia-social` cria `_contexto/midia-social.md` e as pastas; com uma pasta em `producao/` que tenha `final/` e `post.md`, o `publicar-social.mjs <pasta> --quando "<data hora>"` mostra o plano sem agendar nada.

## aprender-curso

**O que é:** comando novo `/aprender-curso`: o sistema estuda um curso em vídeo (playlist do YouTube ou vídeos no computador) e vira seu mentor no assunto, citando aula e minuto e conferindo na internet o que pode ter mudado. Vem junto com o `/assistir-video` e o `/transcribe`, que ele usa.
**Por quê:** curso que você assistiu vira consulta pro dia a dia, aplicada ao seu negócio, em vez de ficar esquecido.
**Te afeta se:** o projeto não tem `.claude/skills/aprender-curso/`.
**Como aplicar:** copiar do kit as pastas `aprender-curso`, `assistir-video` e `transcribe` (as que faltarem) pra `.claude/skills/` do projeto, sem os arquivos `.test.mjs`.
**Como testar:** `node .claude/skills/aprender-curso/scripts/listar-aulas.mjs "<link de uma playlist>"` lista as aulas na ordem, sem gastar nada.

## um-projeto-por-pasta

**O que é:** o `AGENTS.md` ganha a regra "Um projeto por pasta": quando você começa ali um projeto sem relação com aquele negócio, o sistema recomenda criar uma pasta própria e avisa pra abrir ela no VS Code.
**Por quê:** dois projetos na mesma pasta misturam memória e regras, e o sistema passa a errar nos dois.
**Te afeta se:** o `AGENTS.md` do projeto não tem o título `Um projeto por pasta`.
**Como aplicar:** copiar do `_modelo/AGENTS.md` do kit o parágrafo da regra "Um projeto por pasta" pro fim da seção "Regras de operação" do projeto, com o próximo número livre (item 6 do "Como usar" deste arquivo).
**Como testar:** o `AGENTS.md` do projeto contém `Um projeto por pasta` uma vez só.

## bastao-oferecer

**O que é:** a regra "Economia de conversa" do `AGENTS.md` passa a mandar oferecer o bastão quando o assunto continua em outra conversa, em vez de rodar ele sozinho.
**Por quê:** a própria skill do bastão diz que nunca roda sem você pedir; as duas regras brigavam.
**Te afeta se:** a regra "Economia de conversa" do `AGENTS.md` do projeto diz "rodar o" bastão "antes".
**Como aplicar:** nessa frase, trocar "rodar o `/bastao` antes" por "oferecer o `/bastao`".
**Como testar:** a regra "Economia de conversa" diz "oferecer o `/bastao`".

## voz-de-teste-no-backup

**O que é:** o `.gitignore` do projeto ganha uma exceção pra voz de teste do `/configurar-video`, que é arquivo do kit e ficava fora do backup por ser `.wav`.
**Por quê:** num clone em outro computador, o teste rápido do vídeo quebrava por falta desse arquivo.
**Te afeta se:** o projeto tem `.claude/skills/configurar-video/` e o `.gitignore` não tem `!.claude/skills/configurar-video/referencias/teste-voz.wav`.
**Como aplicar:** acrescentar essa linha logo abaixo da linha `*.m4a` do `.gitignore`.
**Como testar:** `git check-ignore .claude/skills/configurar-video/referencias/teste-voz.wav` não imprime nada.

## carrossel-na-producao

**O que é:** o modelo de carrossel passa a salvar cada post em `producao/<data>-<assunto>/`, com os slides em `final/` e a legenda num `post.md`, o formato que a `/publicar-social` agenda. Antes ia pra `conteudo/carrosseis/`, onde o agendamento não acha. Também deixou de mandar rodar o `/setup` de dentro do projeto e de citar preço fixo de gerador de imagem.
**Por quê:** carrossel pronto que não dá pra agendar obriga a pessoa a mover arquivo na mão.
**Te afeta se:** o projeto tem `.claude/skills/carrossel/SKILL.md` e ele cita `conteudo/carrosseis`.
**Como aplicar:** essa skill foi adaptada ao negócio quando entrou, então não se substitui inteira. Mostrar à pessoa as seções "Onde o post mora" e de custo do modelo novo (`../_modelo/templates/skills/carrossel/SKILL.md` na pasta-mãe) e, com o sim, trocar só essas partes na skill dela, mantendo o tom, as cores e os exemplos que ela já tinha.
**Como testar:** a skill do projeto cita `producao/` e `post.md` e não cita mais `conteudo/carrosseis`.

## gitignore-fechado

**O que é:** o `.gitignore` do projeto passa a ser fechado por padrão: só o tipo liberado (texto, planilha, imagem, PDF, script) vai pro backup no GitHub, e o resto fica de fora.
**Por quê:** a lista antiga só bloqueava o que alguém lembrou de bloquear, então uma chave, um vídeo pesado ou um arquivo de outra pessoa podia subir sem ninguém ver.
**Te afeta se:** o `.gitignore` do projeto não começa com as linhas `*` e `!*/`.
**Como aplicar:** mostrar o `.gitignore` atual e o `_modelo/.gitignore` do kit, lado a lado. Trocar pelo do kit, mantendo no fim as linhas que a pessoa acrescentou por conta própria (por exemplo as de pasta do projeto). Depois rodar `git ls-files -ci --exclude-standard`, que lista o que já está no backup e agora ficaria de fora. Se aparecer `.env` ou arquivo de chave, avisar: tirar o arquivo do backup não apaga o histórico do GitHub, a chave vazou e precisa ser trocada no serviço (gerar uma nova, guardar no `.env`, apagar a velha), e ajudar a pessoa a fazer isso. Tirar do backup (`git rm --cached`, com `-r` pra pasta) só o que for segredo ou arquivo pesado, nunca a lista inteira.
**Como testar:** `git check-ignore -v .env .origem` bloqueia os dois, e `git status --ignored` não mostra nada do trabalho da pessoa ignorado por engano.

## memoria-registro

**O que é:** nasce a pasta `_memoria/` (`decisoes.md`, `diario/`, `recados/`, `arquivo/`). As "Decisões recentes" do `agora.md` vão pro `decisoes.md` com a data. Cada linha de `robos/avisos-pendentes.md` vira um recado em `_memoria/recados/`.
**Por quê:** o que foi decidido e feito ficava só no `agora.md`, que se reescreve a cada sessão, e o aviso de robô ficava num arquivo que ninguém abria. Com `_memoria/` o sistema lembra o que foi feito e por quê.
**Te afeta se:** o projeto não tem `_memoria/decisoes.md` (vale também sem "Decisões recentes" e sem avisos, porque ele precisa nascer com o cabeçalho).
**Como aplicar:** criar `_memoria/` com `decisoes.md` (cabeçalho do `_modelo/_memoria/decisoes.md` na pasta-mãe) e as pastas `diario/`, `recados/` e `arquivo/`. Decisões: cada linha da seção "Decisões recentes" vira `- AAAA-MM-DD, dono: <decisão>. Por quê: <motivo>.` no `decisoes.md`, com a data que tinha. Linha sem motivo entra com `Por quê: não registrado.`; linha sem data entra com a data do último commit que mexeu no `agora.md` (`git log -1 --format=%cs -- _contexto/agora.md`) e a nota `(data aproximada)` no fim. Depois a seção sai do `agora.md`. Avisos de robô: cada linha `- [AAAA-MM-DD HH:MM] <robo>: <texto>` de `robos/avisos-pendentes.md` vira o arquivo `_memoria/recados/AAAA-MM-DD-robo-<robo>-aviso-HHMM.md` com `de: robo-<robo>` (o `<robo>` do nome do arquivo e do `de:` sai normalizado como o `origemDoRobo` do `avisar.mjs` faz: minúscula, sem acento, o que não for letra ou número vira hífen), `quando: AAAA-MM-DD HH:MM`, `precisa de ação: sim`, uma linha em branco e o texto inteiro (o ` / ` que o formato velho usava no lugar de quebra de linha volta a ser quebra). Dois avisos no mesmo minuto: o segundo ganha `-2`, o terceiro `-3`. Depois de converter todas as linhas, apagar `robos/avisos-pendentes.md`, com o sim da pessoa. Atualização parcial: se no `/atualizar-sabinos` a pessoa ficou com a versão dela do `/iniciar` ou do `/atualizar` ("fica a sua"), antes desta mudança juntar na versão dela o item 2 do `/iniciar` novo (ler `_memoria/recados/`) e o Passo 3 do `/atualizar` novo (decisão no `decisoes.md`, sem higiene de 30 dias); senão o aviso do robô some de vista e decisão volta pro `agora.md`. Criar também `_contexto/automacoes.md` e `_contexto/infra.md` a partir do `_modelo/` do kit quando faltarem (a entrada `agents-md-mapa-tabela` passa a apontar pra eles). Cada receita em `robos/*.mjs` ganha uma linha no `automacoes.md`, no formato do molde: `| <nome> | <o que confere> | este computador | <quando> | robo-<nome> | aviso no Telegram ou recado em _memoria/recados/ |`, com `<nome>` o nome do arquivo sem `.mjs`. Pasta `robos/` que ficou vazia pode sair, com o sim. Ao fechar a atualização, a anotação do que mudou vai pro diário de hoje em `_memoria/diario/`, nunca pro `agora.md`.
**Como testar:** `_memoria/decisoes.md`, `_contexto/automacoes.md` e `_contexto/infra.md` existem, cada `robos/*.mjs` tem linha `robo-<nome>` no `automacoes.md`, o `agora.md` não tem "Decisões recentes" e `robos/avisos-pendentes.md` não existe mais (ou continua lá porque a pessoa recusou apagar, com todas as linhas já convertidas em recado).

## agents-md-mapa-tabela

**O que é:** o `AGENTS.md` do projeto ganha mapa, tabela de destinos, gatilhos, recall e rotinas, que dizem onde cada coisa mora e quando ler `_memoria/`.
**Por quê:** sem a tabela, cada sessão decide de novo onde guardar uma decisão, um fato ou um recado, e a memória espalha.
**Te afeta se:** o `AGENTS.md` do projeto não tem o título `## Tabela de destinos`.
**Como aplicar:** o texto do aluno (a abertura e as pastas próprias) fica; as três seções velhas saem porque Gatilhos e Tabela tomam o lugar delas. Mostrar à pessoa o antes e o depois de cada passo. Pôr o título `## Sobre este negócio` acima do parágrafo de abertura que o projeto já tem (o texto dele fica igual; o projeto 4.2 não tem o título). Apagar as seções velhas "Início de conversa", "Fluxo de trabalho" e "Aprender e atualizar contexto", porque Gatilhos e Tabela de destinos tomam o lugar delas. Na "Estrutura de pastas", deixar só as pastas próprias do negócio (as base, `_contexto/`, `dados/`, `tarefas.md` e `marca/`, estão no Mapa). Copiar do `_modelo/AGENTS.md` (na pasta-mãe) as seções `## Mapa`, `## Tabela de destinos`, `## Gatilhos`, `## Recall` e `## Rotinas`. As regras de operação que ele já tem (regra se acha pelo título, item 6 do "Como usar") e as seções `## Compatibilidade com outros agentes` e `## Criação de skills` ficam como estão.
**Como testar:** o `AGENTS.md` do projeto tem uma vez cada os oito títulos fixos (`## Sobre este negócio`, `## Mapa`, `## Tabela de destinos`, `## Gatilhos`, `## Recall`, `## Rotinas`, `## Compatibilidade com outros agentes`, `## Criação de skills`), o parágrafo de abertura continua com o texto dele e as três seções velhas não existem mais.

## auto-sync-equipe

**O que é:** o backup automático passa a ser um script em Node (`.claude/hooks/auto-sync.mjs`) que manda primeiro, assina o commit com o nome da máquina (`.origem`) e, se o outro lado mudou o mesmo trecho, para e deixa um recado em vez de perder texto.
**Por quê:** com dois computadores no mesmo projeto, o envio antigo simplesmente falhava no segundo push e deixava só a marca `.backup-falhou`; o novo puxa quando o envio é recusado e, se der conflito, para com um recado que o /syncar resolve junto com a pessoa.
**Te afeta se:** o hook `Stop` do `.claude/settings.json` ainda usa `bash -c`, ou o projeto não tem `.origem`, ou não tem `.gitattributes`.
**Como aplicar:** `_contexto/automacoes.md` e `_contexto/infra.md` nascem na `memoria-registro`; se ainda faltar algum, criar a partir do `_modelo/` do kit. O `.claude/hooks/auto-sync.mjs` chega pelo atualizador junto do núcleo. No `.claude/settings.json`, trocar o `command` do `Stop` pelo `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/auto-sync.mjs"`, juntando ao que já está lá, nunca substituindo o arquivo (mostrar o antes e o depois do `Stop`). Perguntar se é só a pessoa ou se tem equipe e, em caso de equipe, qual o nome curto desta máquina; gravar em `.origem` (uma palavra, minúscula, letras sem acento, números ou hífen). Sozinha, a origem é `dono`. Se `git check-ignore .origem` falhar (projeto que manteve o `.gitignore` da 4.2), acrescentar ao `.gitignore` do projeto as linhas `.origem` e `.backup-falhou` antes de criar o `.origem`. Se `git check-ignore -q _memoria/recados/x-auto-sync-parado.md` falhar, acrescentar a linha `_memoria/recados/*-auto-sync-parado.md` (o recado de envio parado é desta máquina e não viaja). Auto-sync recusado continua recusado: nesse caso aplicar só o `.origem` (e a linha dele no `.gitignore`), sem acrescentar o hook `Stop`. Copiar o `.gitattributes` do `_modelo/` do kit (faz o diário e as decisões juntarem as duas versões sozinhos quando dois computadores escrevem ao mesmo tempo); se o `.gitignore` do projeto é o fechado e não tem `!.gitattributes`, acrescentar essa linha logo abaixo de `!.gitignore`. Em equipe, registrar em `_contexto/ferramentas.md` a linha `| Equipe e máquinas | dono (este computador), <nomes> | <AAAA-MM-DD> | cada computador tem o .origem com o próprio nome; o /syncar grava no computador novo |`.
**Como testar:** `git check-ignore .origem` imprime `.origem`; `git check-attr merge _memoria/decisoes.md` responde `union`; `settings.json` é JSON válido e o `Stop` cita `auto-sync.mjs`; fazer uma edição, rodar o hook uma vez à mão e ver o commit `auto-sync <origem>: ...` chegar ao GitHub.

## skills-faxina-compartilhar-segunda-opiniao

**O que é:** três comandos novos em todo projeto. `/faxina` confere uma vez por mês se a memória do projeto apodreceu (diário e decisão velhos pra arquivar, senha ou CPF fora do `.env`, arquivo que nenhuma regra cita, decisões que brigam, "onde paramos" que não bate com o diário, robô sem sinal, fato do negócio guardado só na memória do assistente, arquivo fora do backup); só relata e mexe com o sim. `/compartilhar` prepara uma pasta de cliente ou sócio pra ir pro GitHub dela, sem senha e sem levar o projeto inteiro. `/segunda-opiniao` passa todo pedido de ok por um revisor que não viu a conversa.
**Por quê:** memória que apodrece calada, pasta que sai sem senha e sem o projeto, e furo que quem montou a proposta não vê.
**Te afeta se:** o projeto não tem `.claude/skills/faxina/`, `.claude/skills/compartilhar/` ou `.claude/skills/segunda-opiniao/`.
**Como aplicar:** as três chegam pelo motor do `/atualizar-sabinos` junto do núcleo, sem pergunta nova; esta entrada só confere que as três pastas existem e apresenta os três comandos à pessoa, uma frase cada. A `/faxina` só rende depois que o projeto tem `_memoria/` (entrada `memoria-registro`).
**Como testar:** `/faxina` no projeto mostra um relatório curto (projeto em dia rende duas linhas); `/segunda-opiniao` antes de qualquer pedido de ok mostra a linha "Segunda opinião: ...".
