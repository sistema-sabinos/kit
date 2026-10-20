#!/usr/bin/env node
// O QUE ESTA TRAVA E: uma rede de protecao contra o acidente comum, o comando digitado
// errado ou copiado sem pensar que apaga pasta, reescreve historico do Git ou roda
// script baixado da internet sem ninguem ler. Ela reconhece as formas conhecidas desses
// comandos (inclusive apelido e variacao de Windows/Mac/Linux) e vai crescendo conforme
// aparece forma nova.
// O QUE ELA NAO E: uma garantia. Ela nao pretende cobrir toda forma possivel de apagar
// arquivo que existe (e nunca vai cobrir: sempre da pra escrever um comando novo que
// ela ainda nao conhece, tipo guardar o comando numa variavel antes de rodar). Ela
// tambem nao enxerga o que roda por fora do assistente (script agendado, outro
// programa, outro terminal). Quem quer garantia de verdade contra perda de arquivo usa
// backup (o /syncar deste kit e um backup automatico no GitHub); esta trava e a segunda
// linha de defesa, nao a primeira.
// ONDE ELA PESA (doc conferida em 2026-10-08, code.claude.com/docs/en/permission-modes e
// /permissions): no modo Manual o aluno ja e perguntado antes de todo comando; no modo
// automatico, o padrao desde a v2.1.283, um classificador costuma barrar baixar-e-executar,
// sem garantia; com as perguntas desligadas, so esta trava segura. O exit 2 daqui para o
// comando antes das regras de permissao, em qualquer modo, e vale dentro de subagente.
// A pasta-mae (SabinOS-Sistema/.claude/settings.json) nao liga esta trava; so o projeto.
// Barra comando destrutivo antes de ele rodar, pelo hook PreToolUse do Claude Code.
// Le o JSON do hook na entrada padrao, olha tool_input.command, e sai com codigo 2
// pra bloquear, escrevendo o motivo no stderr (o assistente le esse texto e explica).
// Conferido na doc oficial (code.claude.com/docs/en/hooks, 2026-09-21): exit 2 bloqueia,
// o motivo sai pelo stderr, e os campos da entrada sao tool_name e tool_input.command.
// O Bash e o PowerShell sao ferramentas separadas pro Claude Code (cada uma com seu
// proprio "tool_input.command"), entao o matcher do settings.json precisa das duas:
// a doc mostra literalmente "The matcher `Bash|PowerShell` covers the PowerShell tool
// as well as Bash", e lista `command` como o campo de conteudo tanto de Bash quanto de
// PowerShell. Este arquivo so precisa saber ler `tool_input.command`; quem decide se
// o hook roda pra Bash, PowerShell ou as duas e o matcher no settings.json.
import { pathToFileURL } from 'node:url'

// correcao 5 (terceira revisao): as duas correcoes anteriores tentaram listar quem E
// executor de shell (bash -c, ssh, powershell -Command...) e tratar o resto como
// citacao. Essa lista nunca fica completa: cada rodada de revisao achou um executor
// novo que escapava (cmd /c, cmd.exe /c, powershell -c abreviado, ssh com opcao tipo
// -p/-i, bash --login -c, eval). A logica virou o contrario: em vez de listar quem
// EXECUTA (lista que sempre falta alguem), mantem uma lista CURTA de quem so ESCREVE
// TEXTO (echo, printf, git commit -m/-am, git tag -m, geralmente seguido de > ou >>
// pra salvar em arquivo). Todo o resto (inclusive executor que ninguem previu ainda)
// cai do lado seguro: o conteudo entre aspas vira comando de verdade e e testado nele
// mesmo, recursivo. O preco e testar como comando um texto que era so citacao de um
// comando desconhecido (falso positivo ocasional); numa trava de seguranca, errar pra
// esse lado e melhor que deixar passar comando perigoso disfarcado (falso negativo).
// token "seguro" pros padroes de varios argumentos abaixo (nome de arquivo, -Path, etc):
// qualquer coisa que nao seja separador de shell (espaco, ; & |), parenteses, redirect
// (< >), substituicao de comando (backtick, $) ou fim de linha. Sem essa exclusao, um
// "Add-Content" solto no meio da linha esconderia um comando encadeado depois dele
// (ex.: `Add-Content x && rm -rf pasta && echo "..."` nao pode contar como escritor).
const TOKEN_SEGURO = '[^\\s;&|()<>`$]+'

// rodada 5.18 (chat 4, F1b): cada escritor era uma regex terminada em $ (tipo
// /\bgrep\b(?:\s+-\S+)*\s+$/i) testada no comando inteiro ate cada aspa, e muita aspa fazia o
// comando custar o quadrado do tamanho. Agora cada um e descrito palavra por palavra
// (palavra = trecho sem espaco) e o leitorDeEscritores le o comando uma vez so. O nome do
// programa (cabeca) e a ultima palavra de um trecho sem espaco, com o comeco do trecho ou um
// caractere fora de [A-Za-z0-9_] antes dele, como o \b; depois vem qualquer quantidade de
// palavras do meio, a ultima (quando tem) e espaco ate a aspa. git commit e git tag tem duas
// palavras na cabeca, a segunda exata. O colado do git log e a ultima sem espaco antes da aspa
const ANTES_DO_NOME = String.raw`(?:^|\W)`
const nomeNoFim = nome => new RegExp(`${ANTES_DO_NOME}(?:${nome})$`, 'i')
const exata = palavra => new RegExp(`^(?:${palavra})$`, 'i')
const OPCAO_TRACO = /^-\S+$/
const OPCAO_OU_NOME = new RegExp(`^-?${TOKEN_SEGURO}$`)
const ESCRITORES_DE_TEXTO = [
  { cabeca: [nomeNoFim('echo')] },
  { cabeca: [nomeNoFim('printf')] },
  // -am e a forma combinada de -a (adiciona tudo) e -m (mensagem); --message e a forma
  // longa. O meio deixa passar outra flag, tipo `git commit --allow-empty -m "..."`
  { cabeca: [nomeNoFim('git'), exata('commit')], meio: OPCAO_TRACO, ultima: exata('-a?m|--message') },
  { cabeca: [nomeNoFim('git'), exata('tag')], meio: OPCAO_TRACO, ultima: exata('-m') },
  // correcao 7 (quinta revisao): "echo" no PowerShell e so um apelido; o nome de
  // verdade e Write-Output (doc: "PowerShell includes the following aliases for
  // Write-Output: All platforms: echo; Windows: write"). O apelido "echo" ja batia no
  // padrao acima (a palavra e igual); faltava o nome de verdade e o outro apelido
  // ("write"), que o aluno de Windows tambem pode digitar.
  { cabeca: [nomeNoFim('Write-Output')] },
  { cabeca: [nomeNoFim('write')] },
  // paridade Windows do echo/printf: no PowerShell, anotar licao se faz com
  // Add-Content, Set-Content ou Out-File, geralmente com um nome de arquivo ou -Path
  // antes do texto (`Add-Content notas.md "..."`, `Set-Content -Path x -Value "..."`)
  { cabeca: [nomeNoFim('Add-Content|Set-Content|Out-File')], meio: OPCAO_OU_NOME },
  // grep/rg/findstr/Select-String so leem e comparam texto, nunca executam o padrao de
  // busca; procurar licao antiga sobre comando perigoso (`grep -rn "rm -rf" licoes.md`)
  // e rotina dentro do kit, e nao pode continuar sendo barrado. correcao 7: findstr e
  // do mundo do cmd, entao a opcao dele e com barra (/s), nao traco; o traco continua
  // valendo pro grep/rg
  { cabeca: [nomeNoFim('grep')], meio: OPCAO_TRACO },
  { cabeca: [nomeNoFim('rg')], meio: OPCAO_TRACO },
  { cabeca: [nomeNoFim('findstr')], meio: /^\/\S+$/ },
  { cabeca: [nomeNoFim('Select-String')], meio: OPCAO_OU_NOME },
  // correcao 7: opcao com "=" no meio (`git log --grep="..."`) nao tem espaco antes da
  // aspa, entao e colado; git log tambem so le, nunca executa a mensagem que esta procurando
  { cabeca: [nomeNoFim('git'), exata('log')], meio: OPCAO_TRACO, ultima: exata('--grep='), colado: true },
]

// devolve uma funcao que responde, pra cada aspa (em ordem crescente de posicao), se o texto
// antes dela termina num escritor de texto. Cada palavra e lida uma vez: agora diz se ate a
// ultima palavra lida o escritor vale (cabeca e palavras do meio), antes diz o mesmo uma
// palavra atras (pro escritor com ultima), e primeira diz se a ultima palavra fecha a
// primeira palavra da cabeca de duas
function leitorDeEscritores(comando) {
  const RE_PALAVRA = /\S+/g
  const estados = ESCRITORES_DE_TEXTO.map(() => ({ agora: false, antes: false, primeira: false }))
  let ultima = null
  let proxima = RE_PALAVRA.exec(comando)
  const ler = palavra => {
    ESCRITORES_DE_TEXTO.forEach((esc, i) => {
      const e = estados[i]
      const fechaCabeca = esc.cabeca.length === 1 ? esc.cabeca[0].test(palavra) : e.primeira && esc.cabeca[1].test(palavra)
      e.antes = e.agora
      e.agora = fechaCabeca || (e.agora && !!esc.meio && esc.meio.test(palavra))
      e.primeira = esc.cabeca.length === 2 && esc.cabeca[0].test(palavra)
    })
    ultima = palavra
  }
  return posicaoDaAspa => {
    while (proxima && proxima.index + proxima[0].length <= posicaoDaAspa) {
      ler(proxima[0])
      proxima = RE_PALAVRA.exec(comando)
    }
    if (posicaoDaAspa > 0 && /\s/.test(comando[posicaoDaAspa - 1])) {
      if (ultima === null) return false
      return ESCRITORES_DE_TEXTO.some((esc, i) => !esc.colado &&
        (esc.ultima ? estados[i].antes && esc.ultima.test(ultima) : estados[i].agora))
    }
    // aspa colada no fim de uma palavra: so o colado vale, com espaco antes da palavra
    if (!proxima || proxima.index === 0 || proxima.index >= posicaoDaAspa) return false
    const colada = comando.slice(proxima.index, posicaoDaAspa)
    return ESCRITORES_DE_TEXTO.some((esc, i) => esc.colado && estados[i].agora && esc.ultima.test(colada))
  }
}

// Cinco limites conhecidos, fora do escopo desta trava de proposito: resolver de
// verdade pede um analisador de shell (tokenizar variavel, aspas, escape), nao regex.
// Confirmados contra o codigo de hoje (nao e so teoria, todos passam batido agora):
// 1. Comando montado em duas variaveis separadas e rodado por expansao depois:
//    `CMD=rm; ARGS=-rf; $CMD $ARGS pasta` (nenhum padrao ve "rm" e "-rf" juntos, porque
//    nunca aparecem na mesma janela de texto).
// 2. Apostrofo no meio de uma citacao legitima criando um par de aspas com uma aspa
//    real mais adiante, e o comando perigoso caindo picotado entre o texto que sobra
//    fora do par (onde falta uma das duas flags) e o texto suspeito extraido de dentro
//    dele (onde falta a outra): `rm -r pasta's_backup -f && echo it's feito`.
// 3. Baixar-e-executar fora das tres formas que a trava conhece (pipe pro sh,
//    `sh -c "$(curl ...)"` e `bash <(curl ...)`, rodada 5.14): `eval "$(curl x)"`,
//    `. <(curl x)` e baixar pra um arquivo e rodar depois (`curl -o a.sh x && sh a.sh`).
//    E o contrario: `<(curl ...)` logo depois de um texto que termina em "sh" (tipo
//    `diff <(curl x/a.sh) <(curl y)`) barra sem precisar.
// 4. Trava de disco (rodada 5.17). Passam: `cp ubuntu.iso /dev/sdb` (o cp so cita),
//    `fdisk /dev/sda` e `parted /dev/sda mklabel gpt` (interativos ou com verbo depois),
//    `nvme format /dev/nvme0n1`, `hdparm --security-erase`, `dd of=$DISCO` (o limite 1),
//    `echo "format D:" | cmd`, `git -c alias.f=!format f D:` e `rg --pre format`. E o
//    contrario, barram sem precisar: `notepad mkfs.txt`, `wipefs /dev/sdb` sem -a (so
//    lista) e mencao solta como `echo usar wipefs depois >> licoes.md`.
// 5. Copias de sombra do Windows (rodada 5.18, doc conferida em 2026-10-19 em
//    learn.microsoft.com/windows-server/administration/windows-commands/vssadmin): so o
//    `vssadmin delete shadows` barra. Passam `vssadmin resize shadowstorage` (a doc avisa
//    "Resizing the storage association may cause shadow copies to disappear"), `wmic
//    shadowcopy delete` e o Delete() do Win32_ShadowCopy pelo PowerShell.
function classificarTrechosEntreAspas(comando) {
  const RE_ASPAS = /"([^"]*)"|'([^']*)'/g
  const suspeitos = []
  let limpo = ''
  // rodada 5.2: "desaspado" e o comando com as aspas tiradas e o conteudo no lugar,
  // menos o texto de quem so escreve texto (esse some inteiro). Serve so pras regras
  // de baixar-e-executar do PowerShell: `powershell.exe "-e" <base64>` e
  // `irm x "|" iex` rodam de verdade, mas o limpo perde a opcao e os suspeitos perdem
  // o executavel, e nenhum dos dois pedacos casa sozinho (achado do Codex no plano).
  let desaspado = ''
  let ultimoIndice = 0
  let m
  const ehEscritorDeTexto = leitorDeEscritores(comando)
  while ((m = RE_ASPAS.exec(comando))) {
    const conteudo = m[1] !== undefined ? m[1] : m[2]
    limpo += comando.slice(ultimoIndice, m.index)
    desaspado += comando.slice(ultimoIndice, m.index)
    ultimoIndice = RE_ASPAS.lastIndex
    const escritor = ehEscritorDeTexto(m.index)
    if (conteudo && !escritor) suspeitos.push(conteudo)
    if (!escritor) desaspado += conteudo
  }
  limpo += comando.slice(ultimoIndice)
  desaspado += comando.slice(ultimoIndice)
  return { limpo, suspeitos, desaspado }
}

// usado so pelo rmPerigoso (ver comentario dele) pra dividir a linha em comandos; a
// limpeza principal de aspas de todo o resto do arquivo e a classificarTrechosEntreAspas
// acima.
function semTrechoEntreAspas(texto) {
  return texto.replace(/"[^"]*"|'[^']*'/g, '')
}

// correcao 3 (revisao final): rm perigoso e a ideia de recursivo E a ideia de forcado
// no MESMO comando rm, nao numa linha inteira que pode ter mais de um comando. Por
// isso divide a linha nos separadores reais de shell (&&, ||, ;, |, `, quebra de linha)
// antes de testar, pra opcao de um rm nao vazar pro rm vizinho, tipo em
// `rm temp.txt && cp -r origem destino && rm -f outro.txt`.
// correcao 6 (quarta revisao): flag /i acrescentada porque "rm" tambem e apelido de
// Remove-Item no PowerShell, que aceita a flag por extenso e com F maiuscula
// (`-Force`, `-Recurse`); sem /i, `rm -Recurse -Force dados` nao batia (a doc oficial
// da Microsoft, learn.microsoft.com/powershell/module/.../remove-item, lista "rm" nos
// apelidos do Remove-Item so no Windows). "rm" continua exigindo os DOIS sinais (r e f)
// juntos, diferente do resto da familia Remove-Item logo abaixo: e o unico apelido que
// tambem e comando Unix de verdade, com o teste historico `rm -r pasta` (recursivo sem
// forcar) deliberadamente livre, e nao da pra saber por regex qual dialeto e sem contexto.
// rodada 5.18 (chat 4, F1): os dois lookaheads viraram o opcaoDepoisDaPalavra (abaixo) com
// as duas opcoes, e a letra procurada vai num lookahead antes do bloco de letras: o
// [a-zA-Z]*r[a-zA-Z]* voltava letra por letra numa opcao comprida sem espaco no fim e
// custava o quadrado dela. O bloco inteiro de letras continua tendo de terminar em espaco
const RE_RM = /\brm\b/gi
const RE_RM_RECURSIVO = /\s(?:-(?=[a-zA-Z]*r)[a-zA-Z]+|--recursive)(?:\s|$)/gi
const RE_RM_FORCADO = /\s(?:-(?=[a-zA-Z]*f)[a-zA-Z]+|--force)(?:\s|$)/gi

// rodada 5.18 (decisao 1): o -WhatIf deixou de liberar qualquer comando. Ate a 5.17 ele
// valia como simulacao, mas o teste olhava o comando inteiro: `ls -WhatIf; rm -rf pasta`
// passava, porque o -WhatIf de um comando soltava o vizinho. Nenhuma skill do kit usa
// -WhatIf, entao o preco (simulacao de verdade barrada a toa) e pequeno.

// a opcao (reOpcao) vale se aparece depois da palavra (rePalavra) na mesma linha, igual a
// um lookahead (?=[^\n]*...), que relia o resto da linha a cada palavra achada e fazia
// linha longa custar o quadrado do tamanho. Cada regex le o texto uma vez so: basta a
// primeira palavra da linha e a ultima opcao dela. O \s do comeco da opcao pode ser a
// propria quebra de linha, como no lookahead. reFim troca o que encerra o trecho (a quebra
// de linha, por padrao), pra regra que para tambem no separador de comando.
// rodada 5.18 (chat 4, F1): reOpcao pode ser uma lista, e todas tem de aparecer depois da
// mesma palavra (o git clean e o rm pedem duas opcoes, como os dois lookaheads de antes).
// A busca de cada opcao recomeca uma letra depois do inicio da anterior, sem pular o que
// ela consumiu: o espaco do fim de uma opcao pode ser o comeco da seguinte
// (`x -rm -r -f` tem o "rm" dentro de "-rm", e o " -rm " engolia o espaco do " -r")
function posicoes(texto, re) {
  const achadas = []
  re.lastIndex = 0
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    achadas.push(m.index)
    re.lastIndex = m.index + 1
  }
  return achadas
}
// rodada 5.18 (chat 4, F1b): a opcao tambem pode vir pronta, { posicoes: [...] } em ordem
// crescente, pra opcao que uma regex sozinha so acha relendo o texto (ver processoComDownload)
function opcaoDepoisDaPalavra(texto, rePalavra, reOpcao, reFim = /\n/g) {
  const listas = (Array.isArray(reOpcao) ? reOpcao : [reOpcao]).map(re => re.posicoes || posicoes(texto, re))
  const ks = listas.map(() => 0)
  let fimLinha = -1
  for (const m of texto.matchAll(rePalavra)) {
    const fim = m.index + m[0].length
    if (fim > fimLinha) {
      reFim.lastIndex = fim
      const f = reFim.exec(texto)
      fimLinha = f ? f.index : texto.length
    }
    let todas = true
    listas.forEach((opcoes, j) => {
      while (ks[j] < opcoes.length && opcoes[ks[j]] < fim) ks[j]++
      if (!(ks[j] < opcoes.length && opcoes[ks[j]] <= fimLinha)) todas = false
    })
    if (todas) return true
  }
  return false
}

function rmPerigoso(comando) {
  const segmentos = semTrechoEntreAspas(comando).split(/&&|\|\||[;&|`\n]/)
  return segmentos.some(seg => opcaoDepoisDaPalavra(seg, RE_RM, [RE_RM_RECURSIVO, RE_RM_FORCADO]))
}

// rodada 5.18 (chat 4, F1): git push, git clean e rd/rmdir eram (?=[^\n]*...) ou
// [^\n]*... depois da palavra, que relia o resto da linha a cada palavra repetida (o mesmo
// quadrado que o opcaoDepoisDaPalavra resolveu no Remove-Item). No git clean a letra vai num
// lookahead antes do bloco, como no rm
const RE_GIT_PUSH = /\bgit\s+push\b/g
const RE_PUSH_FORCE = /--force(?!-with-lease)\b/g
const RE_PUSH_F = /\s-f(?:\s|$)/g
const RE_PUSH_MAIS = /\s\+\S/g
function pushForcado(comando) {
  return opcaoDepoisDaPalavra(comando, RE_GIT_PUSH, RE_PUSH_FORCE) ||
    opcaoDepoisDaPalavra(comando, RE_GIT_PUSH, RE_PUSH_F) ||
    opcaoDepoisDaPalavra(comando, RE_GIT_PUSH, RE_PUSH_MAIS)
}
const RE_GIT_CLEAN = /\bgit\s+clean\b/g
const RE_CLEAN_F = /\s-(?=[fdxniqeX]*f)[fdxniqeX]+\b/g
const RE_CLEAN_D = /\s-(?=[fdxniqeX]*d)[fdxniqeX]+\b/g
function cleanPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, RE_GIT_CLEAN, [RE_CLEAN_F, RE_CLEAN_D])
}
function rdPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /\b(?:rmdir|rd)\b/gi, /\s\/s\b/gi)
}
// rodada 5.18 (chat 4, F1b): curl e wget com pipe pro shell eram [^\n]* depois da palavra,
// o mesmo quadrado do git push
const RE_PIPE_SHELL = /\|\s*(?:sudo\s+)?(?:ba)?sh\b/gi
function curlPipePerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /\bcurl\b/gi, RE_PIPE_SHELL)
}
function wgetPipePerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /\bwget\b/gi, RE_PIPE_SHELL)
}

// correcao 7: Remove-Item e os apelidos oficiais dele que nao sao "rm" (ver comentario
// da regra abaixo). So exige a ideia de recursivo (nunca -Force, doc na regra abaixo).
function removeItemPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /\b(?:Remove-Item|ri|del|erase|rd|rmdir)\b/gi,
    /\s-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b/gi)
}

// correcao 7: "erase" e sinonimo de "del" no cmd e aceita a mesma sintaxe (/s), doc da
// Microsoft confirma os dois como apelido do mesmo Remove-Item; cobrir um so e deixar
// o gemeo de fora era o buraco que esta rodada veio fechar
function delPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /\b(?:del|erase)\b/gi, /\s\/s\b/gi)
}

// correcao 7: a regra do pipe nao pode depender de um nome literal do lado esquerdo
// (Get-ChildItem tem apelidos gci/dir/ls, e podia vir qualquer outro comando gerando a
// lista), entao aceita QUALQUER coisa antes do "|" e olha so o que vem depois: um
// apelido de Remove-Item direto, ou um ForEach-Object/% cujo bloco chama Remove-Item.
// rodada 5.18 (chat 4, F1b): as duas regex sairam de dentro da funcao, que as montava de novo
// a cada chamada (cada trecho entre aspas chama o hook inteiro outra vez)
const RE_ALIAS_REMOVE = /(?:Remove-Item|ri|del|erase|rd|rmdir|rm)/.source
const RE_PIPE_REMOVE = new RegExp(String.raw`\|\s*${RE_ALIAS_REMOVE}\b`, 'i')
const RE_REMOVE_NO_BLOCO = new RegExp(String.raw`\b${RE_ALIAS_REMOVE}\b`, 'gi')
function removeItemPipePerigoso(comando) {
  // "%" nao e caractere de palavra, entao \b logo depois dele nunca casa (nem "{" nem
  // " " sao \w); o \b so faz sentido nas duas outras formas, que sao palavras de verdade.
  // rodada 5.18 (decisao 8, achado da revisao): o bloco do ForEach era um [^\n]* que relia
  // a linha a cada "|%", e passa pelo opcaoDepoisDaPalavra como o Remove-Item
  return RE_PIPE_REMOVE.test(comando) ||
    opcaoDepoisDaPalavra(comando, /\|\s*(?:%|foreach\b|ForEach-Object\b)/gi, RE_REMOVE_NO_BLOCO)
}

// "format" sozinho e o comando de formatar disco. Ate a 5.15 a regra casava "format" e
// qualquer letra de unidade depois na linha, e barrava ffmpeg (format=gray), ffprobe
// (-show_entries format) e git log --format com caminho de unidade. Desde a 5.16 a letra
// tem que ser o primeiro argumento do format; antes dela so podem vir opcao com barra
// (/q, /FS:NTFS, colada ou nao), o --% do PowerShell e redirecionamento (2> erros.txt,
// >nul, <respostas.txt, 2>&1). Le pedaco por pedaco, linha por linha e comando por
// comando: as tres versoes em regex dessa rodada abriram buraco novo a cada remendo, e
// uma delas travava o hook com "format" seguido de muita barra.
// Format no fim de um caminho e seguido de espaco e o programa chamado pelo caminho
// completo (System32, ou /c/Windows/System32 no Git Bash) ou o \format do bash, que pula
// apelido; pasta chamada format no meio de um caminho (seguida de barra) e so caminho
const RE_FORMAT = /(?<![\w\-=.:\/\\])format(?:\.com)?(?=[\s\/<>]|$)|(?<=[\\\/])format(?:\.com)?(?=\s|$)/gi

// rodada 5.17: programa que so le, formata codigo ou copia arquivo e recebe "format" como
// texto (grep, ruff format e dotnet format com caminho de unidade, cp -r format pra outra
// unidade). Lista CURTA de quem so cita, no espirito dos escritores de texto: programa que
// ninguem previu continua do lado seguro. Vale so com o programa no comeco do pedaco
// (sudo grep ... segue barrado). O where do PowerShell roda bloco de script e so pode
// ficar na lista porque o pedacosDeComando divide no "{"
const SO_CITAM = new Set(['grep', 'egrep', 'fgrep', 'rg', 'findstr', 'select-string', 'sls',
  'git', 'ruff', 'dotnet', 'ffmpeg', 'ffprobe', 'cp', 'mv', 'ls', 'dir', 'cd', 'mkdir',
  'copy', 'move', 'xcopy', 'robocopy', 'copy-item', 'cpi', 'move-item', 'mi', 'cat', 'type',
  'get-content', 'gc', 'get-childitem', 'gci', 'code', 'get-help', 'help', 'man',
  'get-command', 'gcm', 'where', 'which'])
function primeiroProgramaSoCita(seg) {
  const m = /^\s*(\S+)/.exec(seg)
  if (!m) return false
  const nome = m[1].replace(/^.*[\\\/]/, '').replace(/\.exe$/i, '').toLowerCase()
  return SO_CITAM.has(nome)
}

// le o comando do jeito que as regras de disco precisam: escape do cmd (^, format^ D: roda
// format D:) e do PowerShell (crase) fora, linha continuada (barra invertida ou crase no
// fim) junta, comentario de shell no fim da linha fora, e cada linha dividida nos
// separadores, no "(" (o $( do bash e o ( do PowerShell abrem comando) e no "{" (bloco de
// script). Entrega cada pedaco com a marca de "so cita". Crase fora do fim de linha (que no
// bash roda o que esta dentro) desliga o "so cita" do comando todo: grep x `format D:`
// roda o format
// o # entre aspas nao precisa disto: a leitura sem o trecho entre aspas (semTrechoEntreAspas)
// ja tira o comentario falso junto com as aspas
function parenteseAberto(prefixo) {
  let parenteses = 0
  for (const c of prefixo) {
    if (c === '(') parenteses++
    else if (c === ')') parenteses--
  }
  return parenteses > 0
}

// rodada 5.18 (chat 4, F1b): as quatro regras de disco pedem os pedacos do mesmo texto, uma
// atras da outra; guarda o ultimo (ninguem altera a lista devolvida)
let ultimosPedacos = { comando: null, pedacos: null }
function pedacosDeComando(comando) {
  if (ultimosPedacos.comando === comando) return ultimosPedacos.pedacos
  const pedacos = lerPedacos(comando)
  ultimosPedacos = { comando, pedacos }
  return pedacos
}
function lerPedacos(comando) {
  const pedacos = []
  const crase = /`(?!\r?\n)/.test(comando)
  const junto = comando.replace(/\^/g, '').replace(/[\\`]\r?\n/g, ' ').replace(/`/g, '')
  for (let linha of junto.split(/[\r\n]+/)) {
    // # no comeco de palavra abre comentario no bash e no PowerShell; no cmd nao, e la o
    // & separa comando, entao comentario com & ou | no meio continua sendo lido. Dentro de
    // parentese aberto o # e texto (cmd /c "for %i in ( # ) do ..." roda o corpo, revisao
    // comum do bloco 1 da 5.17), entao ai a linha fica inteira
    const iComentario = linha.search(/(?:^|\s)#/)
    if (iComentario >= 0 && !/[&|]|#>/.test(linha.slice(iComentario)) && !parenteseAberto(linha.slice(0, iComentario))) linha = linha.slice(0, iComentario)
    // antes de dividir no & (que no cmd separa comando) e no |, os redirecionamentos que
    // usam esses sinais (2>&1, *>&1, 2>&-, &>log, &>>log, >&log, >|log) viram um > comum
    const semDup = linha.replace(/&>|>&|>\|/g, '>')
    for (const seg of semDup.split(/&&|\|\||[;&|({]/)) {
      pedacos.push({ seg, soCita: !crase && primeiroProgramaSoCita(seg) })
    }
  }
  return pedacos
}

function formatPerigoso(comando) {
  for (const { seg, soCita } of pedacosDeComando(comando)) {
    if (soCita) continue
    const iStart = seg.search(/\b(?:Start-Process|saps|start)\b/i)
    let lido = 0
    for (const m of seg.matchAll(RE_FORMAT)) {
      // format que ja foi lido como nome de arquivo ou opcao de um format anterior nao
      // e comando; reler cada um fazia "format<" repetido custar o quadrado do tamanho
      if (m.index < lido) continue
      if (/show_entries\s+$/i.test(seg.slice(Math.max(0, m.index - 40), m.index))) continue
      const inicio = m.index + m[0].length
      // Start-Process format -ArgumentList D: (e -Verb RunAs no meio): a letra vem depois
      // de opcao do Start-Process, entao vale letra de unidade em qualquer ponto do resto
      if (iStart >= 0 && iStart < m.index) {
        if (/(?<![\w:])[a-zA-Z]:(?:[\\\/\s<>,]|$)/.test(seg.slice(inicio))) return true
        break
      }
      const r = lerArgumentosDoFormat(seg, inicio)
      if (r.unidade) return true
      lido = r.fim
    }
  }
  return false
}

// rodada 5.17: os comandos de disco do PowerShell apagam o disco ou a particao inteira, e o
// diskpart sem nada abre o modo interativo, que a trava nao enxerga (o "clean" vem depois,
// digitado ou de um arquivo /s), entao barra sempre, ate pra listar (e com -WhatIf, desde a
// 5.18). Initialize-Disk fica livre: so aceita disco RAW, sem particao.
// rodada 5.18 (decisao 1): Remove-VirtualDisk, doc conferida em 2026-10-19 em
// learn.microsoft.com/powershell/module/storage/remove-virtualdisk ("deletes an existing
// virtual disk", "This action also deletes any associated file system"), sem apelido na doc
const RE_DISCO_PS = /\b(?:Format-Volume|Clear-Disk|Remove-Partition|Remove-VirtualDisk)\b/i
const RE_DISKPART = /(?<![\w\-.])diskpart(?:\.exe)?(?![\w\-.])/i
function discoPerigoso(comando) {
  for (const { seg, soCita } of pedacosDeComando(comando)) {
    if (soCita) continue
    if (RE_DISKPART.test(seg)) return true
    if (RE_DISCO_PS.test(seg)) return true
  }
  return false
}

// rodada 5.18 (decisao 1): vssadmin delete shadows apaga as copias de sombra (as "versoes
// anteriores" e os pontos de restauracao) pra sempre. Doc conferida em 2026-10-19 em
// learn.microsoft.com/windows-server/administration/windows-commands/vssadmin-delete-shadows:
// "vssadmin delete shadows /for=<ForVolumeSpec> [/oldest | /all | /shadow=<ShadowID>]
// [/quiet]", e "delete shadows" e o unico verbo delete da tabela do vssadmin. Mesmo criterio
// do format: pedaco por pedaco, quem so cita fica livre
const RE_VSSADMIN = /(?<![\w\-.])vssadmin(?:\.exe)?(?![\w\-.\/])/i
const RE_VSSADMIN_APAGA = /\sdelete\s+shadows(?=\s|$)/i
function sombraPerigosa(comando) {
  for (const { seg, soCita } of pedacosDeComando(comando)) {
    if (soCita) continue
    const i = seg.search(RE_VSSADMIN)
    if (i >= 0 && RE_VSSADMIN_APAGA.test(seg.slice(i))) return true
  }
  return false
}

// rodada 5.17 (decisao 12): os gemeos de Mac e Linux, conferidos em 2026-10-18 em
// ss64.com/mac/diskutil.html (eraseDisk, eraseVolume, reformat, partitionDisk, zeroDisk,
// randomDisk, secureErase, splitPartition, mergePartitions, resetFusion, destroyRAID e os
// delete* do apfs, appleRAID e coreStorage apagam), man7.org mkfs(8) ("front-end for the
// various filesystem builders (mkfs.fstype)", mais mke2fs e mkdosfs), wipefs(8),
// blkdiscard(8) e sgdisk(8) (-Z/--zap-all, -z/--zap e -o/--clear destroem a tabela).
// Mesmo criterio do format: pedaco por pedaco, quem so cita fica livre, mencao solta barra.
// O verbo do diskutil vale em minuscula tambem (diskutil erasevolume aparece no forum da
// Apple). A lista de verbos e fechada pra deixar o deleteSnapshot livre (so tira o
// snapshot). Nome seguido de barra e pasta no meio de um caminho, como no format
const RE_DISKUTIL = /(?<![\w\-.])diskutil(?![\w\-.\/])/i
const RE_DISKUTIL_APAGA = /(?:^|\s)(?:erase(?:Disk|Volume|Optical|CD)|delete(?:Container|Volume|VolumeGroup|LVG|LV)?|reformat|partitionDisk|zeroDisk|randomDisk|secureErase|splitPartition|mergePartitions|resetFusion|destroyRAID)(?=\s|$)/i
const RE_FORMATA_UNIX = /(?<![\w\-.])(?:mkfs(?:\.\w+)?|mke2fs|mkdosfs|mkntfs|newfs(?:_\w+)?|wipefs|blkdiscard)(?![\w\-.\/])/i
const RE_SGDISK = /(?<![\w\-.])sgdisk(?![\w\-.\/])/i
const RE_SGDISK_ZAP = /(?:^|\s)(?:-[Zzo]|--zap-all|--zap|--clear)(?=\s|$)/
// disco inteiro ou particao: sda, nvme0n1, mmcblk0, disk2 e rdisk2 do Mac, /dev/disk/by-id
const DISCO_DEV = String.raw`\/dev\/(?:r?disk|sd[a-z]|hd[a-z]|vd[a-z]|xvd[a-z]|nvme\d|mmcblk\d|md\d|dm-\d|mapper\/|nbd\d)`
// o of= so existe no dd e nos primos dele (gdd, dcfldd), entao nem precisa achar o nome
const RE_DD_DISCO = new RegExp(String.raw`(?:^|\s)of=${DISCO_DEV}`)
// > /dev/sdb grava por cima do disco seja qual for o programa (cat imagem.iso > /dev/sdb),
// entao vale ate no pedaco que so cita
const RE_REDIR_DISCO = new RegExp(String.raw`>\s*${DISCO_DEV}`)
const RE_SHRED_TEE = /(?<![\w\-.])(?:shred|tee)(?![\w\-.\/])/i
const RE_ARG_DISCO = new RegExp(String.raw`(?:^|\s)${DISCO_DEV}`)
function discoUnixPerigoso(comando) {
  for (const { seg, soCita } of pedacosDeComando(comando)) {
    if (RE_REDIR_DISCO.test(seg)) return true
    if (soCita) continue
    if (RE_FORMATA_UNIX.test(seg) || RE_DD_DISCO.test(seg)) return true
    const iDiskutil = seg.search(RE_DISKUTIL)
    if (iDiskutil >= 0 && RE_DISKUTIL_APAGA.test(seg.slice(iDiskutil))) return true
    if (RE_SGDISK.test(seg) && RE_SGDISK_ZAP.test(seg)) return true
    if (RE_SHRED_TEE.test(seg) && RE_ARG_DISCO.test(seg)) return true
  }
  return false
}

// regex com y testa exatamente na posicao, sem copiar o resto do texto a cada volta
const Y_ESPACO = /\s*/y
const Y_OPCAO = /\/[^\s\/<>]*|--%/y
const Y_REDIR = /[\d*]?[<>]{1,2}/y
const Y_ALVO = /[^\s<>]*/y
const Y_UNIDADE_SOZINHA = /[a-zA-Z]:(?=\s|$)/y
// \D: no bash entrega D: ao programa; o ")" e o "}" fecham o $( ) e o bloco de script
const Y_UNIDADE = /\\?[a-zA-Z]:(?:[\\\/\s<>)}]|$)/y
function casaEm(re, seg, i) {
  re.lastIndex = i
  const m = re.exec(seg)
  return m ? m[0].length : -1
}

// cada volta consome pelo menos um caractere, entao o tempo cresce em linha reta
function lerArgumentosDoFormat(seg, i) {
  for (;;) {
    i += casaEm(Y_ESPACO, seg, i)
    if (i >= seg.length) return { unidade: false, fim: i }
    const opcao = casaEm(Y_OPCAO, seg, i)
    if (opcao > 0) { i += opcao; continue }
    // 2> erros.txt, >nul, <respostas.txt e o *> do PowerShell (todas as saidas)
    const redir = casaEm(Y_REDIR, seg, i)
    if (redir > 0) {
      i += redir
      i += casaEm(Y_ESPACO, seg, i)
      // o nome entre aspas ja saiu antes desta regra: "> "meu log.txt" C:" chega como
      // "> C:", e letra de unidade sozinha nao e nome de arquivo, entao fica pra volta seguinte
      if (casaEm(Y_UNIDADE_SOZINHA, seg, i) > 0) continue
      i += casaEm(Y_ALVO, seg, i)
      continue
    }
    return { unidade: casaEm(Y_UNIDADE, seg, i) > 0, fim: i }
  }
}

// rodada 5.2: opcao -EncodedCommand do powershell.exe e do pwsh, que roda um comando
// escrito em base64 (ninguem le o que vai rodar). A doc do pwsh 7 lista -e e -ec; a do
// 5.1 so o nome inteiro, mas medido nas duas versoes (PS 5.1.26100 e pwsh 7.6.6) rodam
// qualquer prefixo a partir de -e, com barra no lugar do hifen e ate com os tracos
// U+2013 e U+2014 (por isso a classe p{Pd} com a flag u). -ex e -ep (ExecutionPolicy)
// nao sao prefixo e passam. Le as opcoes so ate -c/-Command ou -f/-File, porque depois
// deles o resto e do comando ou do script, nao do PowerShell.
const RE_POWERSHELL = /\b(?:powershell|pwsh)(?:\.exe)?\b([^\n|;&]*)/gi
const RE_OPCAO = /^[-/\p{Pd}]([a-z]+)(?::\S*)?$/iu
function encodedPerigoso(comando) {
  for (const m of comando.matchAll(RE_POWERSHELL)) {
    for (const token of m[1].split(/\s+/)) {
      const opcao = RE_OPCAO.exec(token)
      if (!opcao) continue
      const nome = opcao[1].toLowerCase()
      if (nome === 'ec' || 'encodedcommand'.startsWith(nome)) return true
      if ('command'.startsWith(nome) || 'file'.startsWith(nome)) break
    }
  }
  return false
}

// rodada 5.2: baixar-e-executar do Windows. No PowerShell 5.1, curl e wget sao apelidos
// do Invoke-WebRequest (doc da Microsoft, invoke-webrequest?view=powershell-5.1), entao
// `curl x | iex` roda o que baixou; no 7 sobra so o iwr. Ficam de fora, sabidos:
// `& ([scriptblock]::Create((irm x)))`, `irm x | powershell -` e comando montado em
// variavel (limite 1 acima).
// rodada 5.18 (chat 4, F1b): as duas regras eram [^\n;&]* e [^\n|;&]* depois da palavra, o
// mesmo quadrado do git push. Na primeira, o primeiro "|" depois do download (antes de
// quebra de linha, ; ou &) e o que vale: um "|" mais adiante no mesmo trecho acharia o mesmo
// fim (quebra de linha, ; ou &&), entao nao acha iex que o primeiro nao ache.
// proximaDesde guarda a ultima resposta e so busca de novo quando a posicao passa dela, por
// isso as posicoes pedidas tem de crescer
// o matchAll copia o lastIndex da regex, entao a do proximaDesde (que mexe nele) e sempre nova
const RE_DOWNLOAD_PS = /\b(?:irm|iwr|curl|wget|Invoke-RestMethod|Invoke-WebRequest)\b/gi
const RE_IEX = /\b(?:iex|Invoke-Expression)\b/gi
function proximaDesde(texto, re) {
  let achada = -1
  return desde => {
    if (desde > achada) {
      re.lastIndex = desde
      const m = re.exec(texto)
      achada = m ? m.index : texto.length
    }
    return achada
  }
}
function downloadProIex(comando) {
  const fimDoTrecho = proximaDesde(comando, /[\n;&]/g)
  const pipe = proximaDesde(comando, /\|/g)
  const fimDepoisDoPipe = proximaDesde(comando, /[\n;]|&&/g)
  const iex = proximaDesde(comando, new RegExp(RE_IEX.source, 'gi'))
  for (const m of comando.matchAll(RE_DOWNLOAD_PS)) {
    const fim = m.index + m[0].length
    const p = pipe(fim)
    if (p < fimDoTrecho(fim) && iex(p + 1) < fimDepoisDoPipe(p + 1)) return true
  }
  return false
}
function iexDoDownload(comando) {
  return opcaoDepoisDaPalavra(comando, RE_IEX,
    /\b(?:DownloadString|DownloadData|irm|iwr|curl|wget|Invoke-RestMethod|Invoke-WebRequest)\b/gi, /[\n|;&]/g)
}
const PERIGOS_POWERSHELL = [
  // o iex pode estar em qualquer ponto depois do pipe: com o modulo na frente
  // (Microsoft.PowerShell.Utility\Invoke-Expression), dentro de % { iex $_ } ou com &
  // (achado do Codex no Bloco A); & sozinho e o operador de chamada, && encerra
  { teste: downloadProIex, motivo: 'roda um script baixado da internet sem ninguem ler' },
  { teste: iexDoDownload, motivo: 'roda um script baixado da internet sem ninguem ler' },
  { teste: encodedPerigoso, motivo: 'roda um comando escondido em codigo que ninguem consegue ler' },
]

// rodada 5.14: baixar-e-executar sem pipe. `sh -c "$(curl ...)"` (linha oficial do
// Homebrew e do oh-my-zsh) e `bash <(curl ...)` rodam o script direto do download e
// passavam, porque as regras do curl so olham o pipe. Le o desaspado, porque o curl mora
// dentro das aspas. A linha oficial do Homebrew, endereco exato, fica liberada: a
// /configurar-video manda rodar ela com o sim da pessoa (conferir.mjs, BREW).
const BREW_OFICIAL = '$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)'
// o shell so conta em posicao de comando (o .sh de um endereco nao e shell), a opcao pode
// vir junta (-lc) e o curl pode vir por caminho (/usr/bin/curl): achados da revisao do grupo F
// Revisao final: o c vale em qualquer ponto da opcao (-cx), e o shell so conta no comeco de um
// comando (depois de ; | & ( ou de sudo/env/exec...), nunca como argumento (shellcheck -s bash)
// rodada 5.18 (decisao 8): o caminho antes do shell e [^\s;|&(]* em vez de \S*, porque o \S*
// engolia todo "&" seguinte e voltava letra por letra a cada "&", e 25 mil "&" levavam
// segundos; o separador ja encerra o nome do programa no shell. Achado da revisao: o trecho
// [^\n|;&]* depois do shell relia o comando inteiro a cada "(", entao o shell e o -c (ou o
// <() viram regexes separadas, juntadas pelo opcaoDepoisDaPalavra, que para no separador
const RE_SH_INICIO = /(?:^|[;|&(])\s*(?:(?:sudo|env|exec|command|nohup|time)\s+)*(?:[^\s;|&(]*\/)?(?:ba|z|da|k)?sh(?=\s)/gi
const RE_SH_OU_SOURCE_INICIO = /(?:^|[;|&(])\s*(?:(?:sudo|env|exec|command|nohup|time)\s+)*(?:(?:[^\s;|&(]*\/)?(?:ba|z|da|k)?sh|source)(?=\s)/gi
// rodada 5.18 (chat 4, F1b): o c do -c vai num lookahead antes do bloco de letras, como no rm
// (o [a-z]*c[a-z]* voltava letra por letra numa opcao comprida). E o <( deixou de ser
// <\(\s*(?:\S*\/)?(?:curl|wget)\b: o \S* relia o resto da palavra a cada <( e "<(<(<(..."
// custava o quadrado. Agora vale o <( com o download logo depois dos espacos ou depois de uma
// barra na mesma palavra, que e o que o \S*\/ aceitava
const RE_SH_C_DOWNLOAD = /\s-(?=[a-z]*c)[a-z]+\s+(?:\$\(|`)\s*(?:\S*\/)?(?:curl|wget)\b/gi
const RE_DOWNLOAD_DIRETO = /(?:curl|wget)\b/iy
function processoComDownload(texto) {
  const achadas = []
  const fimDaPalavra = proximaDesde(texto, /\s/g)
  const barraDownload = proximaDesde(texto, /\/(?:curl|wget)\b/gi)
  for (const m of texto.matchAll(/<\(\s*/g)) {
    const inicio = m.index + m[0].length
    RE_DOWNLOAD_DIRETO.lastIndex = inicio
    if (RE_DOWNLOAD_DIRETO.test(texto) || barraDownload(inicio) < fimDaPalavra(inicio)) achadas.push(m.index)
  }
  return achadas
}
function subshellPerigoso(comando) {
  const semBrew = comando.split(BREW_OFICIAL).join('')
  return opcaoDepoisDaPalavra(semBrew, RE_SH_INICIO, RE_SH_C_DOWNLOAD, /[\n|;&]/g) ||
    opcaoDepoisDaPalavra(semBrew, RE_SH_OU_SOURCE_INICIO, { posicoes: processoComDownload(semBrew) }, /[\n|;&]/g)
}
const PERIGOS_SUBSHELL = [
  { teste: subshellPerigoso, motivo: 'roda um script baixado da internet sem ninguem ler' },
]
// rodada 5.17: as regras de disco leem o limpo (na lista PERIGOS) e o desaspado: format "D:"
// e o format.com do System32 chamado pelo caminho entre aspas tinham a letra ou o programa
// dentro das aspas
const PERIGOS_DISCO = [
  { teste: formatPerigoso, motivo: 'apaga tudo do disco pra sempre' },
  { teste: discoPerigoso, motivo: 'apaga tudo do disco pra sempre' },
  { teste: discoUnixPerigoso, motivo: 'apaga tudo do disco pra sempre' },
  { teste: sombraPerigosa, motivo: 'apaga as copias de seguranca do Windows (versoes anteriores e pontos de restauracao) pra sempre' },
]

const PERIGOS = [
  { teste: rmPerigoso, motivo: 'apaga uma pasta inteira de uma vez' },
  // --force-with-lease e a variante segura (nao sobrescreve o que outra pessoa subiu);
  // barrar ela empurraria o aluno avancado a desligar a trava inteira, entao o
  // lookahead negativo deixa exatamente essa variante passar. Empurrao forcado tambem se
  // escreve com -f e com "+" na frente do nome da branch, sem --force (ver pushForcado)
  { teste: pushForcado, motivo: 'reescreve o historico do backup no GitHub' },
  { re: /\bgit\s+reset\s+--hard\b/, motivo: 'joga fora o trabalho que ainda nao foi salvo' },
  // correcao 7 (quinta revisao): o que importa e o alvo ser a pasta inteira (.), com ou
  // sem "--" e com ou sem revisao antes (`git checkout .`, `git checkout -- .` e
  // `git checkout HEAD -- .` sao a mesma coisa pro resultado: joga fora tudo que nao foi
  // salvo). Um arquivo so (git checkout -- arquivo.txt / git restore arquivo.txt / git
  // checkout HEAD -- arquivo.txt) continua liberado, porque o alvo final nao e "."
  { re: /\bgit\s+checkout\s+(?:\S+\s+)?(?:--\s+)?\.(?:\s|$)/, motivo: 'descarta toda mudanca nao salva da pasta inteira' },
  { re: /\bgit\s+restore\s+(?:\S+\s+)?(?:--\s+)?\.(?:\s|$)/, motivo: 'descarta toda mudanca nao salva da pasta inteira' },
  // git clean apaga arquivo e pasta fora do controle de versao; -f (forca) e -d (pastas)
  // precisam estar juntos (combinados tipo -fdx ou separados) pra ser destrutivo, e o
  // token so pode ter as letras de flag de verdade do git clean, senao "--dry-run"
  // (que so simula, nao apaga nada) acusaria por ter "d" na palavra "dry"
  { teste: cleanPerigoso, motivo: 'apaga arquivo e pasta fora do controle de versao, sem confirmacao' },
  // "sudo" no meio do pipe (curl ... | sudo bash) e o jeito mais comum de instalar
  // script de terceiro com privilegio elevado, e tem que continuar batendo. Flag i desde
  // a 5.2: `CURL x | SH` passava (o PowerShell nao liga pra maiuscula). Ver curlPipePerigoso
  { teste: curlPipePerigoso, motivo: 'roda um script baixado da internet sem ninguem ler' },
  { teste: wgetPipePerigoso, motivo: 'roda um script baixado da internet sem ninguem ler' },
  // modo de 4 digitos (0777 a 7777: setuid/setgid/sticky, sozinhos ou combinados, + 777)
  // e tao aberto quanto o 777 puro; o lookbehind evita casar o final de um numero maior
  { re: /\bchmod\s+(?:-[a-zA-Z]+\s+)*(?<!\d)[0-7]?777\b/, motivo: 'libera o arquivo pra qualquer um do computador' },
  // correcao 6 (quarta revisao): a doc oficial da Microsoft confirma os dois fatos que
  // sustentam esta regra. 1) -Force NAO tem nada a ver com pular confirmacao de pasta:
  // "Forces the cmdlet to remove items that can't otherwise be changed, such as hidden
  // or read-only files". 2) so o -Recurse ja apaga sem perguntar nada: "When you try to
  // delete a folder that contains items without using the Recurse parameter, the cmdlet
  // prompts for confirmation. Using -Confirm:$false doesn't suppress the prompt. This is
  // by design" (ou seja, COM -Recurse, nao ha prompt pra suprimir). Por isso a regra so
  // exige a ideia de recursivo, nunca o -Force. Cobre Remove-Item e os apelidos oficiais
  // do PowerShell pra ele (doc: "PowerShell includes the following aliases for
  // Remove-Item: All platforms: del, erase, rd, ri; Windows: rm, rmdir"), exceto "rm",
  // que fica na regra dele mesmo logo acima (ver comentario la). Case-insensitive porque
  // PowerShell nao diferencia maiuscula de minuscula em nada disso.
  { teste: removeItemPerigoso, motivo: 'apaga uma pasta inteira de uma vez, sem pedir confirmacao (a Microsoft confirma: so confirma quando NAO usa -Recurse)' },
  // correcao 7 (quinta revisao): a regra anterior exigia "Get-ChildItem" literal antes
  // do pipe, mas gci/dir/ls sao apelidos oficiais dela (doc: "PowerShell includes the
  // following aliases for Get-ChildItem: All platforms: dir, gci; Windows: ls") e
  // qualquer outro comando podia estar do lado esquerdo. Agora aceita qualquer coisa
  // antes do "|" e olha so o que vem depois: um apelido de Remove-Item direto no pipe,
  // ou um ForEach-Object (apelidos oficiais "%" e "foreach", doc: "PowerShell includes
  // the following aliases for ForEach-Object: All Platforms: %, foreach") cujo bloco
  // chama Remove-Item pra cada item, tipo `Get-ChildItem -Recurse | %{ Remove-Item $_ }`
  { teste: removeItemPipePerigoso, motivo: 'apaga varios arquivos de uma vez, um por um, sem confirmar nenhum' },
  { teste: rdPerigoso, motivo: 'apaga uma pasta inteira de uma vez' },
  // del e erase com /s: ver delPerigoso
  { teste: delPerigoso, motivo: 'apaga arquivo de varias pastas de uma vez' },
  ...PERIGOS_DISCO,
  ...PERIGOS_POWERSHELL,
]

function testarPadroes(comando, lista = PERIGOS) {
  for (const p of lista) {
    const bateu = p.teste ? p.teste(comando) : p.re.test(comando)
    if (bateu) return p.motivo
  }
  return null
}

export function ehPerigoso(comando) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const { limpo, suspeitos, desaspado } = classificarTrechosEntreAspas(comando)
  // menor 1: a limpeza de aspas vale pra todos os padroes, nao so pro rm, senao
  // escrever licao sobre qualquer outro comando perigoso continua barrado
  // (ex.: `echo "nunca rode chmod 777" >> licoes.md`).
  // o PowerShell continua o comando na linha de baixo depois de "(" ou de crase no fim
  // da linha, entao as regras dele leem o comando com as linhas juntadas
  // (achado do Codex no Bloco A: `iex (` numa linha e `irm x)` na outra passava)
  const emUmaLinha = desaspado.replace(/`?\r?\n\s*/g, ' ')
  // e tambem linha a linha: juntar tudo deixava um `-Command` da primeira linha encerrar a
  // leitura das opcoes e esconder o `powershell "-e"` da segunda (achado do Codex na final)
  const motivo = testarPadroes(limpo) || testarPadroes(desaspado, PERIGOS_POWERSHELL) || testarPadroes(emUmaLinha, PERIGOS_POWERSHELL) || testarPadroes(desaspado, PERIGOS_SUBSHELL) || testarPadroes(desaspado, PERIGOS_DISCO)
  if (motivo) return motivo
  // correcao 5: todo trecho entre aspas que NAO veio de um escritor de texto conhecido
  // e comando de verdade em potencial, e testa nele mesmo, recursivo (o texto extraido
  // e sempre mais curto que o original, entao a recursao termina).
  for (const suspeito of suspeitos) {
    const motivoSuspeito = ehPerigoso(suspeito)
    if (motivoSuspeito) return motivoSuspeito
  }
  return null
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let bruto = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', pedaco => { bruto += pedaco })
  process.stdin.on('end', () => {
    let entrada
    // entrada ilegivel deixa passar de proposito: uma trava que bloqueia tudo quando
    // nao entende a entrada viraria pedra no sapato e seria desligada pelo aluno.
    try { entrada = JSON.parse(bruto || '{}') } catch { process.exit(0) }
    const comando = entrada && entrada.tool_input && entrada.tool_input.command
    const motivo = ehPerigoso(comando)
    if (!motivo) process.exit(0)
    process.stderr.write(
      `Um comando foi barrado antes de rodar, porque ${motivo}.\n` +
      `Pare aqui: explique pro usuario o que voce estava tentando fazer e peca a ele\n` +
      `pra decidir o proximo passo, em vez de tentar de outro jeito pra fazer a mesma coisa.\n`
    )
    process.exit(2)
  })
}
