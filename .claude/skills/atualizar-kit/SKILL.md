---
name: atualizar-kit
description: >
  Traz pra esta pasta-mãe uma versão nova do SabinOS (o zip novo) sem tocar nas
  pastas de projeto: atualiza o `_modelo/`, as skills da pasta-mãe, as ferramentas e
  os guias, mostra o que mudou e substitui com um sim só o que ninguém mexeu, perguntando um por um o editado e o que some. Depois oferece
  levar as skills novas pra cada projeto. Use quando o usuário chamar /atualizar-kit,
  disser "chegou versão nova do kit", "atualiza o kit", "atualiza a pasta-mãe",
  "baixei o zip novo, e agora", ou disser onde está o zip novo. Dentro de uma pasta
  de projeto é a /atualizar-sabinos. Fechar a sessão de trabalho é o /atualizar,
  aberto na pasta do projeto.
---

# /atualizar-kit, Versão nova sem perder nada

## O problema que resolve

O kit instalado é uma foto do dia em que foi baixado. Toda melhoria nova (skill corrigida, template novo, ferramenta) ficaria só na versão nova, e refazer a instalação apagaria os projetos. Esta skill separa o que é **do kit** (pode ser substituído) do que é **da pessoa** (nunca se toca).

## O que é da pessoa e nunca se toca

- Toda pasta de projeto (as que têm `_contexto/` dentro) e tudo dentro delas
- `RESPONDA-AQUI.txt` preenchido
- `.git/`, `.env`, `.agents/`
- `~/.claude/CLAUDE.md` (identidade global), fora a linha do gate humano entre os marcadores, que o passo "Bloco global" propõe trocar com o sim
- `agentes/` (cópia-mestra dos conselheiros da `/clonar-especialista`) e, em `~/.claude/skills/` e `~/.claude/agents/`, tudo que tem `origem: clonar-especialista` no frontmatter

## O que é do kit e pode ser atualizado

`_modelo/` inteiro, `.claude/skills/` da pasta-mãe, `_ferramentas/`, `docs/`, `VERSAO`, `README.md`, `COMECE-AQUI.md`, `AGENTS.md` e `CLAUDE.md` da pasta-mãe, e o texto do `RESPONDA-AQUI.txt` **só se ainda estiver em branco**.

O `.gitignore` e o `.claude/settings.json` da pasta-mãe são metade do kit e metade da pessoa: seguem o passo "Arquivos misturados da pasta-mãe", logo depois do Passo 3.

## Passo 1, onde está o zip novo

Os comandos de baixar e descompactar desta skill rodam pela ferramenta Bash; no Windows
ela é o Git Bash, que vem com o Git. Pela ferramenta PowerShell eles quebram.

Oferecer os dois caminhos, nessa ordem:

1. **Baixar a última do GitHub** (o normal): seguir o Passo 1 da skill
   `_modelo/.claude/skills/atualizar-sabinos/SKILL.md` lendo a versão atual do
   arquivo `VERSAO` desta pasta-mãe (não do `.sabinos/instalado.json`, que só existe
   em projeto), e depois o Passo 2. A versão nova é a pasta `kit-<versão>` extraída.
   Se ele concluir que o kit já está na última versão, dizer isso e encerrar.
2. **Zip que a pessoa já baixou:** perguntar onde está (formato de 4 partes) e
   extrair sempre numa pasta temporária nova e vazia, criada agora, fora da pasta-mãe:
   no Windows `"C:/Windows/System32/tar.exe" -xf "<zip>" -C "<temp>"`, no Mac `unzip -q "<zip>" -d "<temp>"`.
   No Windows vai o caminho completo porque, no terminal do Git, o `tar` comum é
   outro programa e não abre zip. Onde fica a versão nova depende do zip:
   - o `VERSAO` está direto na pasta temporária (zip desde a 5.8, o `SabinOS-Sistema.zip`):
     a versão nova é a própria pasta temporária;
   - existe a pasta `SabinOS-Sistema/` extraída dentro dela (zip até a 5.7):
     a versão nova é essa pasta `SabinOS-Sistema/`.

Se a versão nova não tiver `_modelo/AGENTS.md` e `.claude/skills/setup/SKILL.md`, parar: não é um kit SabinOS.

## Passo 2, comparar e mostrar

Rodar o motor da versão nova, apontando pra esta pasta-mãe (o daqui pode ser de uma versão que ainda não sabe comparar):
`node "<versão-nova>/_ferramentas/atualizar-projeto.mjs" mae "<versão-nova>" --mae .`

Ele separa as áreas "do kit" (acima) em quatro grupos, pelas impressões digitais do kit novo, e o que está igual não aparece:

- **Novo:** existe só na versão nova (skill nova, template novo)
- **Mudou e ninguém mexeu:** a pasta-mãe tem um conteúdo que o próprio kit entregou um dia
- **Editado na pasta-mãe:** alguém mexeu, ou o motor não tem como saber (arquivo sem impressão digital conta aqui)
- **Some:** o kit entregou um dia e a versão nova não traz mais (saiu do kit). Arquivo que a pessoa criou nessas áreas, como uma skill dela, nunca foi do kit e não aparece aqui: fica como está

**Bloco do motor** (entra inteiro ou não entra): `_modelo/`, `_ferramentas/`, `VERSAO`, e as skills `setup` e `novo-projeto` da pasta-mãe, que copiam o `_modelo/` e chamam o motor.

Duas perguntas, nessa ordem, em linguagem de gente:

1. **Um sim só** pro novo e pro que mudou sem ninguém mexer. Aqui o bloco do motor conta como um item só e entra junto:

   > "Versão nova encontrada. Entra com um sim só (coisa nova e coisa que você nunca mexeu):
   >
   > **Comandos novos no molde de projeto:** `/checar` (check-up do sistema)
   > **Templates novos:** financeiro, copy de venda
   > **Comandos que mudaram:** `/mapear`, `/novo-projeto`
   > **Motor de atualização e guias:** atualizados
   >
   > Pode aplicar?"

2. **Um por um**, só o editado e o que some, cada item com a sua pergunta: "o `docs/guia.md` foi mexido aqui; troco pelo novo e guardo o seu na cópia de segurança, ou deixo o seu?" e "o `<arquivo>` saiu do kit; apago?". Item editado dentro do bloco do motor também pergunta, e com o não o bloco do motor inteiro fica de fora.

Se a pessoa pedir detalhe, mostrar o diff daquele arquivo resumido em prosa (o que entrou, o que saiu), sem colar o diff bruto.

## Passo 3, aplicar (só o aprovado)

1. Antes de substituir qualquer coisa, guardar cópia da versão atual em `_kit-anterior-<AAAA-MM-DD>/` dentro da pasta-mãe, só das áreas que vão mudar. Adicionar essa pasta ao `.gitignore` da pasta-mãe, uma linha.
2. Copiar por cima o que entrou no sim só e o que a pessoa aprovou um por um. Arquivo que some só se apaga com o sim dele, pelo nome. Bloco do motor recusado: nada dele muda, e o Passo 4 não roda.
3. `RESPONDA-AQUI.txt`: substituir só se o atual estiver em branco (nenhuma resposta escrita).
4. Rodar `node _ferramentas/verificar-kit.mjs .` (obrigatório, não pular: em teste real este passo ficou pra trás) e mostrar ao usuário a última linha da saída, a que começa com `Resultado:` (quantas conferências ficaram verdes, quantas falharam e quantas não rodaram inteiras). Na pasta-mãe é normal o Gate 1 sair `parcial` (a lista de termos só existe na bancada de quem faz o kit) e o Gate 7 sair `n/a` (sem zip ao lado): dizer isso em uma frase, sem tratar como problema. Gate 11 `n/a` (git não encontrado) fica fora desse normal: o backup não foi conferido; ligar o git pelo passo de primeira vez do `/syncar` e rodar de novo. O verificador aqui só avisa: se algum gate falhar, dizer qual e o que fazer, sem desfazer sozinho e sem segurar o fim (o Passo 4 e o Passo 5 seguem). Gate 11, Gate 9 ou Gate 3 (linha que falta no `.gitignore`) vermelho na pasta-mãe: fazer o passo dos arquivos misturados (abaixo) e rodar de novo. Gate 1 com `.env: arquivo proibido` na pasta-mãe quer dizer chave solta ali: o `.env` nunca sai do `.gitignore`, e a IA nunca mostra o valor no chat nem grava um `.env`. Os nomes saem por `node _modelo/.claude/skills/conectar/scripts/chave.mjs nomes`, rodado aqui na pasta-mãe (só os nomes, nunca o valor). Com o sim, pra cada uma: a pessoa abre o `.env` do projeto que usa e o da pasta-mãe no editor e copia a linha `NOME=valor` de um pro outro; a IA roda `node _modelo/.claude/skills/conectar/scripts/chave.mjs bate NOME --arquivo <projeto>/.env --com .env` e, só com `bate`, a pessoa apaga a linha do `.env` da pasta-mãe. A ponte do Codex em cópia (quando o link falhou no `/setup`) passa no verificador, só que não acompanha skill nova. Gate 1 com `.agents/skills/<nome>: skill so na ponte` quer dizer uma skill que só existe na cópia (o Codex ou a pessoa criou ali) e por isso fica fora do backup: mostrar o nome e, com o sim da pessoa, mover a pasta dela pra `.claude/skills` antes de qualquer recópia ou troca por link. Gate 1 com `tipo diferente` numa entrada da cópia: com o sim, trocar aquela entrada pela de mesmo nome em `.claude/skills`. `.env` dentro de `.agents/skills`: a IA nunca mostra o valor dele no chat (regra 15); a pessoa abre ele pelo explorador, leva cada linha pro `.env` do projeto que usa, pelo editor, e apaga o arquivo da ponte; a IA confere depois por `node _modelo/.claude/skills/conectar/scripts/chave.mjs nomes --arquivo <projeto>/.env`. Se a pessoa quiser trocar a cópia por link, o comando da seção "Ponte pro Codex" do `/setup` só cria o link quando `.agents/skills` não existe: rodar o verificador de novo e conferir que nenhuma linha `skill so na ponte` sobrou; com o sim dela, apagar a pasta `.agents/skills` (aí ela é só a cópia de `.claude/skills`), rodar o comando e conferir que virou link; se o link falhar de novo, a cópia volta pela regra do `/setup`. Gate 15 vermelho na pasta-mãe: algum texto do `_modelo`, quase sempre um que a pessoa editou, tem a frase que nega uma coisa pra afirmar outra logo depois; mostrar a linha que o gate aponta e propor a reescrita afirmando direto, e só gravar com o ok dela.

## Arquivos misturados da pasta-mãe

O `.gitignore` e o `.claude/settings.json` da pasta-mãe têm parte do kit e parte da pessoa. Cada um se mostra antes e depois, e só se grava com o sim.

1. **`.gitignore`:** mostrar o atual e o da versão nova, lado a lado. Trocar pelo do kit, mantendo no fim as linhas que a pessoa acrescentou por conta própria (pastas de projeto, `_kit-anterior-*`). Depois rodar `git ls-files -ci --exclude-standard`, que lista o que já está no backup e agora ficaria de fora. Se aparecer `.env` ou arquivo de chave, avisar: tirar o arquivo do backup não apaga o histórico do GitHub, a chave vazou e precisa ser trocada no serviço (gerar uma nova, guardar no `.env`, apagar a velha), e ajudar a pessoa a fazer isso. Tirar do backup (`git rm --cached`, com `-r` pra pasta) só o que for segredo ou arquivo pesado, nunca a lista inteira.
2. **`.claude/settings.json`:** juntar ao atual o que falta dos hooks e das listas `permissions.ask` e `permissions.deny` do kit, e tirar o que o kit tirou: as regras e o bloco da lista `TIRADAS_DO_KIT` do `_ferramentas/atualizar-projeto.mjs` (a mesma do passo settings dos projetos), que hoje são o deny de leitura do `.env`, das pastas de chave e de sessão e do perfil do Chrome, o deny do `run_code_unsafe`, o ask velho do `.env` e o bloco `SessionStart` que chama o `barrar-mcp.mjs`. Sai só a regra igual, letra por letra; o resto que a pessoa tinha continua junto. Hook do kit que mudou de texto troca o antigo em vez de somar: o `Stop` do backup se reconhece pelo `auto-sync:` dentro do comando (o da versão velha, em `bash`) ou pelo `backup-pasta-mae.mjs` (o da versão nova), e fica só um, o do kit novo.

## Bloco global (linha do gate)

O `~/.claude/CLAUDE.md` é da pessoa, e o `/setup` grava nele um bloco entre `<!-- sabinos:inicio -->` e `<!-- sabinos:fim -->`. Desde a 5.42 a linha do gate humano desse bloco diz que nada que gasta dinheiro, manda mensagem pra fora, publica ou altera conta de terceiro roda sem o "pode ir" da pessoa naquele momento, fora da permissão escrita de cada projeto.

Roda logo depois dos arquivos misturados, antes do Passo 4.

1. Ler o arquivo. Sem ele ou sem os dois marcadores, nada a fazer.
2. Saída antes de qualquer troca: se o bloco diz só "regras de casa: ... já no começo deste arquivo", sem repetir o "pode ir" em nenhuma linha, o gate mora fora dos marcadores e é texto da pessoa. Nada dentro do bloco muda, rodapé incluso. Contar em uma frase que a regra de cada projeto já traz a permissão escrita, e parar aqui.
3. Entre os marcadores, achar a linha do gate humano (a que fala do "pode ir") e a do rodapé que repete as regras de casa, se ela também falar do "pode ir". Linha que já tem "permissão escrita" fica como está.
4. Pra cada linha que falta, propor a mesma linha com "fora da permissão escrita de cada projeto" no fim da frase do gate, logo depois de "naquele momento" (no rodapé, a forma curta "fora da permissão escrita"). Mostrar o antes e o depois e gravar só com o sim, trocando só essa linha: o resto do arquivo, dentro e fora dos marcadores, não muda. Exemplo com a linha da v5.41:
   - Antes: `sem o "pode ir" da pessoa naquele momento`
   - Depois: `sem o "pode ir" da pessoa naquele momento, fora da permissão escrita de cada projeto`

## Passo 4, levar pros projetos (opcional, um projeto de cada vez)

O `_modelo/` atualizado só vale pra projetos **futuros**. Projeto existente se
atualiza pelo motor, que já sabe o que é do kit e o que é da pessoa.

1. Listar as pastas de projeto (as que têm `_contexto/` dentro) aqui dentro **e ao
   lado** desta pasta-mãe, e perguntar se tem alguma em outro lugar.
2. Pra cada projeto que a pessoa escolher, seguir os Passos 3 a 6 da skill
   `_modelo/.claude/skills/atualizar-sabinos/SKILL.md`, usando como `<kit>` esta
   pasta-mãe já atualizada:
   `node _ferramentas/atualizar-projeto.mjs plano <caminho-do-projeto>`.
   Os passos seguintes rodam todos daqui, pelo motor desta pasta-mãe:
   - `node _ferramentas/atualizar-projeto.mjs aplicar <caminho-do-projeto> --tambem <caminhos>`
   - `node _ferramentas/atualizar-projeto.mjs registrar <caminho-do-projeto> <id> aplicada` (ou `recusada`)
   - `node _ferramentas/atualizar-projeto.mjs conferir <caminho-do-projeto>`
   - JSON do settings: `node -e "JSON.parse(require('fs').readFileSync('<caminho-do-projeto>/.claude/settings.json','utf8'))"`
   - diário em `<caminho-do-projeto>/_memoria/diario/`
   - backup: `node _modelo/.claude/hooks/auto-sync.mjs --idade <caminho-do-projeto>` e mostrar a linha como veio. Só confere, sem commit e sem envio: quem manda é o backup automático (o da pasta-mãe sobe os projetos de dentro dela no fim de cada resposta; o projeto ao lado sobe quando a pessoa abrir ele). Linha começando com `Backup vermelho`: dizer pra rodar o `/syncar` dentro daquele projeto.
3. Projeto antigo nasceu sem o `/atualizar-sabinos`: ele vem no componente
   `nucleo`, então depois desta primeira vez o projeto se atualiza sozinho, de
   dentro dele.

## Passo 5, registrar e encerrar

1. Cada projeto tocado já ganhou a linha no diário de hoje (`_memoria/diario/`) pelo Passo 6 da `/atualizar-sabinos`.
2. No resumo final, repetir a linha do `node _modelo/.claude/hooks/auto-sync.mjs --idade <caminho-do-projeto>` de cada projeto tocado, rodada de novo agora.
3. Rodar `node _ferramentas/historico-app.mjs` aqui na pasta-mãe, que grava no `~/.claude/settings.json` da pessoa (o do computador, fora de qualquer projeto) o prazo de 30 dias pro app guardar as conversas, e mostrar a linha que ele imprime. As outras configurações desse arquivo ficam como estavam. Saída 2 quer dizer que o arquivo tem um erro de escrita e nada foi gravado: dizer isso em uma frase e seguir, sem consertar sozinho.
4. Apagar a pasta temporária da extração.
5. Fechar com a economia de conversa: "Kit atualizado. As pastas `_kit-anterior-*` guardam a versão de antes; pode apagar quando tiver certeza de que está tudo bem. Esse processo fechou, abre uma conversa nova."

## Regras

- Nada dentro de pasta de projeto muda sem aprovação nominal, projeto por projeto
- Sempre cópia de segurança antes de substituir
- Nunca rodar `git reset`, `git checkout --` ou apagar `.git/`
- A versão do kit está no arquivo `VERSAO` na raiz (e no topo do `README.md`). Comparar a da pasta-mãe com a do zip e dizer no resumo: "você está na 3.0, o zip é a 4.0". Se a do zip for **mais antiga ou igual**, avisar e perguntar se é isso mesmo antes de seguir
