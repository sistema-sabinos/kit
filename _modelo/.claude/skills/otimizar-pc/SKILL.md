---
name: otimizar-pc
description: Raio-X e faxina do PC Windows pra recuperar espaço em disco e velocidade (Windows; no Mac orienta caminhos nativos). Use quando o usuário chamar /otimizar-pc, disser "o notebook tá lento", "limpa o PC", "meu disco tá cheio", "otimiza a máquina", "atualiza tudo que tá desatualizado", "o que dá pra apagar aqui", "tá faltando espaço no C", ou reclamar de lentidão/travamento sem causa aparente. Mede antes de mexer, mostra os números, e só executa o que o usuário aprovar por bloco.
---

# Otimizar PC (Windows)

**Sistema:** esta skill cobre Windows. No Mac, responder: "essa faxina automática por enquanto é só pra Windows. No Mac, os caminhos nativos são: Ajustes > Geral > Armazenamento (o próprio sistema recomenda limpezas), e apagar caches pesados em ~/Library/Caches com cuidado. Se quiser, te guio manualmente por esses passos." E se oferecer pra guiar.

Faz o diagnóstico completo da máquina, aponta onde o espaço está indo, e executa a faxina **por blocos aprovados**. Roda com a pasta do projeto aberta, porque os comandos abaixo partem da raiz dele.

A regra que rege tudo aqui: **medir e mostrar antes de apagar**. O usuário decide bloco por bloco. Nunca sair apagando porque "parece lixo".

## Por que espaço vira velocidade

Windows com menos de ~15% do disco de sistema livre se sabota sozinho: para de expandir o arquivo de paginação, o índice de busca e o Defender brigam por espaço, e toda escrita fica mais lenta. Na maioria dos casos de "PC lento" a causa é essa, e o hardware fica por último na lista de suspeitos. **Primeiro medir o disco, depois teorizar sobre RAM e CPU.**

## Fluxo

### 1. Raio-X (só leitura, sempre primeiro)

```powershell
& ".claude/skills/otimizar-pc/scripts/diagnostico.ps1"
```

Levanta hardware, mapa de partição (qual letra é SSD e qual é HD), espaço livre, as pastas que mais ocupam (inclusive dentro do perfil do usuário), **o que foi gravado nos últimos 7 dias** (é ali que aparece quem enche o disco sozinho), o estado das travas (arquivo de paginação, IA do Chrome, extensões forçadas no Chrome, Sensor de Armazenamento, retenção do Claude Code), candidatos a lixo com tamanho medido, instaladores órfãos, apps desatualizados, programas no boot e processos comendo RAM. O que aparece com `(*)` fica fora do total do bloco 1: sai por outro caminho ou só com o sim à parte.

Demora uns 2 minutos (mede com robocopy). Salva em `~/.claude/logs/otimizar-pc/`.

**Disco enchendo de novo em dias ou semanas:** ler primeiro a seção dos 7 dias e a das travas, antes de olhar candidato a lixo. Limpar sem achar a fonte é enxugar gelo: o espaço volta a sumir.

### 2. Apresentar em tabela e pedir aprovação por bloco

Mostrar pro usuário: quanto dá pra recuperar, de onde, e **o risco real de cada bloco**. Usar `AskUserQuestion` com multi-select pros blocos. Nunca juntar tudo numa pergunta só de sim/não.

Os blocos:

| Bloco | O que é | Risco |
|---|---|---|
| 1 | Caches: navegador, npm, pip, drivers já instalados, TEMP, crash dumps, rascunho de chat do Claude fechado há 7+ dias, modelo de IA do Chrome (só com a trava ligada), perfis do navegador da IA parados há 90+ dias | zero, tudo reconstrói sozinho. Exceção: o perfil do navegador da IA guarda login, que se refaz na mão |
| Lixeira | O que está na lixeira do Windows | apaga de vez o que você já tinha jogado fora, sem volta |
| HuggingFace | Modelos de IA baixados (a `/pauta` guarda ali o modelo que transcreve) | zero, mas a próxima transcrição baixa tudo de novo |
| 2 | Instaladores órfãos do `C:\Windows\Installer` → **quarentena** em outro disco | baixo, é movido e reversível |
| 3 | Sobras de programa antigo e jogo, **item por item**, só o que o raio-X achou | baixo, mas sem volta: confirmar cada um |
| 4 | DISM no WinSxS | zero, mas perde a opção de desinstalar atualização antiga do Windows |
| 5 | Atualizar apps (winget) | baixo |
| Windows Update | Atualizações do Windows | baixo, mas pode pedir pra reiniciar o PC |
| 6 | Tirar programa da inicialização | zero, reversível no Gerenciador de Tarefas |
| 7 | VS Code: versão velha de extensão e instalador de extensão guardado | zero, mas só roda com o VS Code fechado |
| 8 | Dado frio pro HD: vídeo bruto, documento parado, modelo de IA que carrega uma vez | baixo: copiar, conferir e só então apagar |
| 9 | Programa e app da Microsoft Store sem uso | perguntar um por um |

A lixeira se pergunta à parte, com o tamanho que o raio-X mediu. O cache do HuggingFace se pergunta só quando o bloco 1 foi aprovado, porque sai junto com ele: com o tamanho e o aviso de que a próxima transcrição da `/pauta` baixa o modelo de novo (pode levar minutos e alguns GB de internet).

O bloco 5 fica fora da pergunta e vai com aviso: atualizar programa é atualizar ferramenta, e a pessoa confirma no UAC que abre na tela dela. O Windows Update se pergunta à parte, sempre, porque pode pedir pra reiniciar o PC no meio do trabalho.

Bloco 3 aprovado: uma segunda pergunta com multi-select por item, só com os ids que o raio-X mostrou, cada um com o tamanho e o que é. `android` leva o aviso 'apaga a chave de teste e os emuladores do Android, sem volta'. Mais de 4 itens: dividir em perguntas de até 4 opções.

Bloco 9 aprovado: uma pergunta por programa, com o tamanho.

### 3. Executar o que foi aprovado

```powershell
# blocos 1 e 3 (escopo do usuário, não precisa admin); -Itens só com os ids aprovados.
# -ManterHuggingFace sempre, a não ser que o cache do HuggingFace tenha sido aprovado à parte
& ".claude/skills/otimizar-pc/scripts/limpar.ps1" -Blocos 1,3 -Itens gradle,fortnite -ManterHuggingFace

# lixeira, só se aprovada à parte (sozinha, sem -Blocos, não mexe em mais nada)
& ".claude/skills/otimizar-pc/scripts/limpar.ps1" -Lixeira

# blocos 2, 4 e 5 e o Windows Update precisam de admin: sobem pelo comando de admin logo abaixo
```

Os de admin sobem **sempre pelo `elevar.ps1`**, nunca chamados direto, e **avisar o usuário pra aprovar o UAC na tela dele**:

```powershell
# bloco 2 (quarentena); pra desfazer, o mesmo com -Argumentos '-Desfazer' no fim
& ".claude/skills/otimizar-pc/scripts/elevar.ps1" -Script ".claude/skills/otimizar-pc/scripts/quarentena-installer.ps1"

# bloco 4 (10 a 20 min, trava a máquina em rajadas)
& ".claude/skills/otimizar-pc/scripts/elevar.ps1" -Script ".claude/skills/otimizar-pc/scripts/dism.ps1"

# bloco 5
& ".claude/skills/otimizar-pc/scripts/elevar.ps1" -Script ".claude/skills/otimizar-pc/scripts/atualizar-apps.ps1" -Argumentos '-Parte','apps'

# Windows Update, só se aprovado à parte
& ".claude/skills/otimizar-pc/scripts/elevar.ps1" -Script ".claude/skills/otimizar-pc/scripts/atualizar-apps.ps1" -Argumentos '-Parte','windows'
```

O `elevar.ps1` resolve o caminho inteiro a partir da raiz do projeto (o PowerShell de admin abre em `C:\Windows\System32` e se perderia), confere a sintaxe no PowerShell 5.1 (o motor que vai executar) antes de pedir o UAC, põe aspas no caminho com espaço, faz o log cair no seu perfil mesmo quando o UAC pede a senha de outra conta, e no fim imprime só o log **desta** rodada. Sai com o código do script de admin: diferente de 0 é falha, dizer qual. "SEM LOG NOVO" quer dizer que o script nem subiu. Script de admin escrito na hora (por exemplo pro bloco 9) também sobe por ele, desde que comece com `param([string]$LogDir)`, carregue o `_comum.ps1` e abra o log com `Iniciar-Log`.

Bloco 6 (inicialização) é registro puro, roda inline. Desativar pelo `StartupApproved\Run` (primeiro byte `0x03`), **nunca apagando a chave do `Run`**, pra continuar reversível num clique no Gerenciador de Tarefas.

Bloco 7 depende de onde a conversa está. Ler `$env:CLAUDE_CODE_ENTRYPOINT`:
- `claude-vscode`: o Claude mora dentro do VS Code e morreria junto. Montar o caminho inteiro na hora com `(Resolve-Path '.claude/skills/otimizar-pc/scripts/limpar-vscode.ps1').Path` e passar pro usuário: fechar todas as janelas do VS Code, apertar `Win + R` e colar `powershell -ExecutionPolicy Bypass -File "<caminho inteiro>"`. Depois, abrir o VS Code e conversa nova.
- começando com `claude-desktop`: pedir pro usuário fechar todas as janelas do VS Code e rodar `& ".claude/skills/otimizar-pc/scripts/limpar-vscode.ps1"`. Com o VS Code aberto, o script recusa e não apaga nada.
- vazio ou outro valor: perguntar ao usuário se a conversa está dentro do VS Code e seguir pelo caso que bater.

Bloco 8: copiar pro HD, conferir que chegou inteiro (mesma quantidade de arquivo e de bytes) e só então apagar do SSD, uma pasta por vez, com o sim. Modelo de IA que o programa procura numa variável (como `HF_HOME`) só sai do lugar com a variável apontada pro destino novo.

Bloco 9: programa comum sai por Configurações > Aplicativos > Aplicativos instalados, que o usuário clica. App da Microsoft Store que veio de fábrica (provisionado) só libera espaço com admin, por script que sobe pelo `elevar.ps1` com `Remove-AppxProvisionedPackage -Online` e `Remove-AppxPackage -AllUsers`.

### 4. Verificar integridade (obrigatório, nunca pular)

```powershell
& ".claude/skills/otimizar-pc/scripts/verificar.ps1"
```

Confere que a operação do usuário continua de pé: `.env` com as chaves, o Chrome dedicado dos robôs (`dados/chrome-perfil`) e o Playwright de cada pacote, perfis e senhas do navegador, tarefas agendadas em Ready, git do workspace. **Relatar o resultado, não só dizer "deu certo".**

### 5. Fechar com o número

Tabela de antes e depois do disco, o que foi atualizado, e as pontas soltas (o Edge, a quarentena). Se algo falhou, dizer qual e por quê.

## Armadilhas (custaram tempo de verdade, ler antes de rodar)

**Nunca limpar `%TEMP%` inteiro.** O Claude Code grava a saída dos comandos e o scratchpad em `%LOCALAPPDATA%\Temp\claude`, ou seja, DENTRO do TEMP. Apagar tudo mata a saída do próprio comando no meio da execução e volta `ENOENT` em vez do resultado. O `limpar.ps1` já protege essa pasta e só tira dela o rascunho de chat parado há 7+ dias, nunca o de um chat aberto. Se escrever limpeza nova de TEMP, manter a exclusão.

**`Temp\claude` se mede com robocopy.** Ali ficam dezenas de milhares de arquivo pequeno e a varredura comum do PowerShell estoura minutos. O raio-X já mede com `robocopy`; medida feita à mão segue o mesmo caminho.

**O sandbox de comando bloqueia pelo texto do comando.** Ele lê `/1MB` ou `/1GB` de uma conta como se fosse caminho de sistema e trava a execução, principalmente no mesmo comando que apaga. Por isso toda rotina de limpeza vive num `.ps1` e é executada como arquivo; em comando inline, converter multiplicando (`$x*9.3132257e-10` pra GB) e nunca escrever `/1GB` ou `/1MB` junto de um `Remove-Item`.

**Disco em 0 MB derruba o próprio raio-X.** O log e a saída dos comandos ficam no C:, então com o disco zerado o `diagnostico.ps1` morre no meio e a saída sai cortada. Nesse caso, pular o raio-X completo: medir pasta a pasta com saída curta, abrir um respiro com aprovação (TEMP, lixeira, cache de driver) e só depois rodar o diagnóstico.

**O arquivo de paginação come o ganho da faxina.** Com a RAM no talo, o `pagefile.sys` cresce e engole em minutos os GB que a faxina liberou, sem ninguém gravar arquivo. Antes de caçar culpado, olhar o tamanho dele (a linha `pagefile.sys` da seção de travas do raio-X, ou `(Get-Item C:\pagefile.sys -Force).Length`) e a RAM livre. Ele encolhe sozinho ao reiniciar; o antes e depois só vale medido com a RAM folgada.

**Chrome de automação enche o TEMP sozinho.** Robô ou teste que abre Chrome e não fecha direito deixa milhares de `.tmp` e pastas `scoped_dir*`, `puppeteer_dev_chrome_profile*` e `playwright_chromiumdev_profile*`, às vezes dezenas de GB. O bloco 1 limpa, mas volta. Se o TEMP encher de novo, olhar primeiro a seção de travas: extensão forçada pelo registro (chaves `Software\Google\Chrome\Extensions` em `HKLM` e `HKCU`, muitas vezes de programa que nem existe mais) é instalada em todo Chrome novo e deixa o lixo quando ele é fechado no meio.

**Minas que o raio-X agora mede:** modelo de IA do Chrome (`Chrome\User Data\OptGuideOnDeviceModel`, uns 4 GB, volta sozinho se a política `GenAILocalFoundationalModelSettings=1` em `HKLM\SOFTWARE\Policies\Google\Chrome` não estiver ligada; ligar pede admin), perfis velhos do navegador da IA (`ms-playwright-mcp`), instalador de driver da NVIDIA (`ProgramData\NVIDIA Corporation`), versão velha de extensão do VS Code (bloco 7) e modelo de IA guardado em pasta de ponto no perfil.

**DISM repetido rende pouco.** Rodado de novo poucas semanas depois, o bloco 4 tira quase nada: o resto de "Backups e Recursos Desabilitados" é recurso desabilitado, que limpeza não tira. Não prometer esse número. E o cache do Windows Update (`SoftwareDistribution\Download`) só se limpa DEPOIS do bloco 5, do Windows Update e do reinício: antes, o Windows Update baixa tudo de volta. Fora dos blocos, com o sim à parte, ele sai por um script de admin escrito na hora e subido pelo `elevar.ps1`, que para o serviço `wuauserv`, apaga o conteúdo de `SoftwareDistribution\Download` e liga o serviço de novo.

**DISM com reinício pendente.** O DISM pergunta "reiniciar agora?" e a pergunta some, deixando tudo parado. O `dism.ps1` já aborta quando há reinício pendente: mexeu em recurso do Windows, reiniciar antes do bloco 4.

**`WinSxS` mente no tamanho.** Varredura comum reporta quase o dobro do real porque conta hardlink duas vezes. Antes de prometer número, rodar `dism /online /cleanup-image /analyzecomponentstore` e usar a linha "Backups e Recursos Desabilitados", que é a parte de fato recuperável.

**`C:\Windows\Installer` quase sempre é a maior mina.** Cruzar os `.msi/.msp` da pasta com o que o registro referencia (`HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\UserData\<SID>\Products\*\InstallProperties\LocalPackage` e os `Patches\*\LocalPackage`). O que não é referenciado é órfão. **Mover pra quarentena, nunca apagar**, com manifesto CSV pra saber desfazer.

**O Edge não atualiza por winget.** Dá "tecnologia de instalação diferente", e o updater próprio dele também resiste por linha de comando. Solução: mandar o usuário abrir o Edge e ir em Ajuda e comentários, Sobre o Microsoft Edge. Atualiza sozinho ao abrir a tela.

**Cookie do Chrome não está mais em `Cookies`.** Mudou pra `<Perfil>\Network\Cookies`. Checar no caminho novo antes de sair dizendo que sumiu.

## O que NUNCA tocar

- Perfil de navegador (só o cache de dentro dele). Apagar perfil desloga de tudo.
- `.env`, `dados/chrome-perfil` (o Chrome dedicado com o login dos robôs), `node_modules` das skills.
- Navegador do Playwright (pasta `ms-playwright`) que algum app seu usa, como o que o `/app-testar` baixa. Os robôs do kit usam o Chrome instalado, não esses.
- `pagefile.sys` para outro disco. Libera pouco e joga a paginação num disco mecânico, deixando tudo mais lento.
- Pasta de trabalho, documento, foto, nada do usuário.

## Mover coisa do SSD pro HD

Programa e coisa de uso diário: má ideia. O que precisa de SSD é sistema, Office, perfil de navegador, navegador de automação, VS Code e extensões, TEMP e arquivo de paginação. Mover troca velocidade por espaço, que é o oposto do pedido. Partição também não estica de um disco físico pro outro.

Dado frio vale (bloco 8): vídeo bruto, documento parado, modelo de IA que o programa carrega uma vez, conversa antiga guardada por programa de IA. Pasta com atalho de pasta dentro (junction) não se move inteira.

O que funciona de verdade é a regra pra frente: **programa novo e pesado instala no disco grande**, não no SSD.

## Manutenção recomendada

Rodar a cada 6 meses, ou quando o disco de sistema passar de 80% cheio. Depois de 30 a 60 dias, se nada quebrou, apagar a pasta de quarentena.
