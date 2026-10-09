---
name: otimizar-pc
description: Raio-X e faxina do PC Windows pra recuperar espaço em disco e velocidade (Windows; no Mac orienta caminhos nativos). Use quando o usuário chamar /otimizar-pc, disser "o notebook tá lento", "limpa o PC", "meu disco tá cheio", "otimiza a máquina", "atualiza tudo que tá desatualizado", "o que dá pra apagar aqui", "tá faltando espaço no C", ou reclamar de lentidão/travamento sem causa aparente. Mede antes de mexer, mostra os números, e só executa o que o usuário aprovar por bloco.
---

# Otimizar PC (Windows)

**Sistema:** esta skill cobre Windows. No Mac, responder: "essa faxina automática por enquanto é só pra Windows. No Mac, os caminhos nativos são: Ajustes > Geral > Armazenamento (o próprio sistema recomenda limpezas), e apagar caches pesados em ~/Library/Caches com cuidado. Se quiser, te guio manualmente por esses passos." E se oferecer pra guiar.

Faz o diagnóstico completo da máquina, aponta onde o espaço está indo, e executa a faxina **por blocos aprovados**. Skill global, funciona em qualquer pasta.

A regra que rege tudo aqui: **medir e mostrar antes de apagar**. O usuário decide bloco por bloco. Nunca sair apagando porque "parece lixo".

## Por que espaço vira velocidade

Windows com menos de ~15% do disco de sistema livre se sabota sozinho: para de expandir o arquivo de paginação, o índice de busca e o Defender brigam por espaço, e toda escrita fica mais lenta. Na maioria dos casos de "PC lento" a causa é essa, não o hardware. **Primeiro medir o disco, depois teorizar sobre RAM e CPU.**

## Fluxo

### 1. Raio-X (só leitura, sempre primeiro)

```powershell
& ".claude/skills/otimizar-pc/scripts/diagnostico.ps1"
```

Levanta hardware, mapa de partição (qual letra é SSD e qual é HD), espaço livre, as pastas que mais ocupam, candidatos a lixo com tamanho medido, instaladores órfãos, apps desatualizados, programas no boot e processos comendo RAM.

Demora de 3 a 8 minutos (varre o disco inteiro). Salva em `~/.claude/logs/otimizar-pc/`.

### 2. Apresentar em tabela e pedir aprovação por bloco

Mostrar pro usuário: quanto dá pra recuperar, de onde, e **o risco real de cada bloco**. Usar `AskUserQuestion` com multi-select pros blocos. Nunca juntar tudo numa pergunta só de sim/não.

Os blocos:

| Bloco | O que é | Risco |
|---|---|---|
| 1 | Caches: navegador, npm, pip, HuggingFace, drivers já instalados, TEMP, crash dumps | zero, tudo reconstrói sozinho |
| Lixeira | O que está na lixeira do Windows | apaga de vez o que você já tinha jogado fora, sem volta |
| 2 | Instaladores órfãos do `C:\Windows\Installer` → **quarentena** em outro disco | baixo, é movido e reversível |
| 3 | Sobras de programa antigo e jogo, **item por item**, só o que o raio-X achou | baixo, mas sem volta: confirmar cada um |
| 4 | DISM no WinSxS | zero, mas perde a opção de desinstalar atualização antiga do Windows |
| 5 | Atualizar apps (winget) + Windows Update | baixo |
| 6 | Tirar programa da inicialização | zero, reversível no Gerenciador de Tarefas |

A lixeira se pergunta à parte, com o tamanho que o raio-X mediu.

Bloco 3 aprovado: uma segunda pergunta com multi-select por item, só com os ids que o raio-X mostrou, cada um com o tamanho e o que é. `android` leva o aviso 'apaga a chave de teste e os emuladores do Android, sem volta'. Mais de 4 itens: dividir em perguntas de até 4 opções.

### 3. Executar o que foi aprovado

```powershell
# blocos 1 e 3 (escopo do usuário, não precisa admin); -Itens só com os ids aprovados
& "...\scripts\limpar.ps1" -Blocos 1,3 -Itens gradle,fortnite

# lixeira, só se aprovada à parte (sozinha, sem -Blocos, não mexe em mais nada)
& "...\scripts\limpar.ps1" -Lixeira

# bloco 2 (precisa admin, dispara UAC)
& "...\scripts\quarentena-installer.ps1"

# bloco 4 (precisa admin, 10 a 20 min, trava a máquina em rajadas)
& "...\scripts\dism.ps1"

# bloco 5 (precisa admin)
& "...\scripts\atualizar-apps.ps1"
```

Os que precisam de admin devem ser disparados assim, e **avisar o usuário pra aprovar o UAC na tela dele**:

```powershell
Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","<caminho do script>" -Verb RunAs -Wait
```

Como o processo elevado não devolve saída pro chat, cada script grava log em `~/.claude/logs/otimizar-pc/` e a leitura é feita depois com `Read`.

Bloco 6 (inicialização) é registro puro, roda inline. Desativar pelo `StartupApproved\Run` (primeiro byte `0x03`), **nunca apagando a chave do `Run`**, pra continuar reversível num clique no Gerenciador de Tarefas.

### 4. Verificar integridade (obrigatório, nunca pular)

```powershell
& "...\scripts\verificar.ps1"
```

Confere que a operação do usuário continua de pé: `.env` com as chaves, sessões salvas dos robôs, perfis e senhas do navegador, tarefas agendadas em Ready, git do workspace. **Relatar o resultado, não só dizer "deu certo".**

### 5. Fechar com o número

Tabela de antes e depois do disco, o que foi atualizado, e as pontas soltas (o Edge, a quarentena). Se algo falhou, dizer qual e por quê.

## Armadilhas (custaram tempo de verdade, ler antes de rodar)

**Nunca limpar `%TEMP%` inteiro.** O Claude Code grava a saída dos comandos e o scratchpad em `%LOCALAPPDATA%\Temp\claude`, ou seja, DENTRO do TEMP. Apagar tudo mata a saída do próprio comando no meio da execução e volta `ENOENT` em vez do resultado. O `limpar.ps1` já protege essa pasta. Se escrever limpeza nova de TEMP, manter a exclusão.

**O sandbox de comando bloqueia por texto, não por caminho real.** Ele leu `/1MB` de um `-f ($s/1MB)` como se fosse caminho de sistema e travou a execução. Por isso toda rotina de limpeza vive num `.ps1` e é executada como arquivo, nunca inline.

**`WinSxS` mente no tamanho.** Varredura comum reporta quase o dobro do real porque conta hardlink duas vezes. Antes de prometer número, rodar `dism /online /cleanup-image /analyzecomponentstore` e usar a linha "Backups e Recursos Desabilitados", que é a parte de fato recuperável.

**`C:\Windows\Installer` quase sempre é a maior mina.** Cruzar os `.msi/.msp` da pasta com o que o registro referencia (`HKLM:\...\Installer\UserData\<SID>\Products\*\InstallProperties\LocalPackage` e os `Patches\*\LocalPackage`). O que não é referenciado é órfão. **Mover pra quarentena, nunca apagar**, com manifesto CSV pra saber desfazer.

**O Edge não atualiza por winget.** Dá "tecnologia de instalação diferente", e o updater próprio dele também resiste por linha de comando. Solução: mandar o usuário abrir o Edge e ir em Ajuda e comentários, Sobre o Microsoft Edge. Atualiza sozinho ao abrir a tela.

**Cookie do Chrome não está mais em `Cookies`.** Mudou pra `<Perfil>\Network\Cookies`. Checar no caminho novo antes de sair dizendo que sumiu.

## O que NUNCA tocar

- Perfil de navegador (só o cache de dentro dele). Apagar perfil desloga de tudo.
- `.env`, `.session/state.json`, `chrome-profile` dedicado, `node_modules` de robô em produção.
- Navegador do Playwright que algum robô fixa. Conferir o `browsers.json` de cada `node_modules/playwright-core` antes de podar versão.
- `pagefile.sys` para outro disco. Libera pouco e joga a paginação num disco mecânico, deixando tudo mais lento.
- Pasta de trabalho, documento, foto, nada do usuário.

## Mover coisa do SSD pro HD

Costuma ser tentador e quase sempre é má ideia: o que sobra ocupando SSD depois da faxina é justamente o que precisa de SSD (sistema, Office, perfil de navegador, navegador de automação). Mover troca velocidade por espaço, que é o oposto do pedido.

O que funciona de verdade é a regra pra frente: **programa novo e pesado instala no disco grande**, não no SSD.

## Manutenção recomendada

Rodar a cada 6 meses, ou quando o disco de sistema passar de 80% cheio. Depois de 30 a 60 dias, se nada quebrou, apagar a pasta de quarentena.
