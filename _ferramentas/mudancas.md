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
