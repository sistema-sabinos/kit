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
// rodada 5.20 (N11, doc conferida em 2026-10-20 em code.claude.com/docs/en/tools-reference):
// a ferramenta Monitor "Runs a command in the background" e o nome da tabela e "the exact
// strings you use in ... hook matchers", entao o matcher e `Bash|PowerShell|Monitor`. O
// comando do Monitor vem no mesmo `command` (o `ws`, WebSocket, entra no lugar dele e nao
// roda shell). A doc nao mostra o tool_input do Monitor no hook; o campo vem do schema dela.
// rodada 5.20 (N6, N10): o git le o cwd que o Claude Code manda na entrada (campo cwd), pra
// saber se o alvo do checkout e do restore e uma pasta
import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
// 6. Apagar por outro programa (rodada 5.20, N9) e uma classe aberta: barram as formas
//    comuns (find -delete e -exec rm, xargs rm, node -e com rmSync/rmdirSync recursivo ou
//    unlinkSync, python -c com rmtree/os.remove/os.rmdir/os.unlink, rimraf e del-cli pelo
//    npx, [IO.Directory]::Delete com $true, [IO.File]::Delete, .Delete($true), .Delete() no
//    bloco do ForEach e Clear-Content com curinga, -Recurse ou pipe). Passam perl, ruby, bun,
//    deno, o pathlib do Python (.unlink(), .rmdir()), script gravado em arquivo e rodado
//    depois, codigo mandado pela entrada (`python3 - <<EOF`, `node <<EOF`), o rm dentro de
//    outro shell no find (`find . -exec sh -c 'rm "$1"' _ {} \;`), o .Delete() fora do pipe
//    (`foreach ($f in ...) { $f.Delete() }`, `.ForEach({ $_.Delete() })`, `ForEach-Object
//    Delete`), `rsync --delete`, `robocopy /MOV` e `/MOVE` (movem, a copia fica no destino) e
//    o `/MIR` guardado num arquivo de /JOB. E o contrario: qualquer .Delete( no bloco do
//    ForEach barra, seja qual for o objeto (`$api | % { $_.Delete(id) }`).
// 7. Git (rodada 5.20, N6 e N10). `git checkout arquivo` sem `--` fica livre (nao da pra
//    saber sem o git se a palavra e branch ou arquivo; pasta, ponto, curinga, `:/` e a lista
//    que sai de $(...) ou do xargs barram). Passam alias (`git -c alias.x="reset --hard" x`),
//    `git branch -D`, `git reflog expire`, `git gc --prune=now`, `git update-ref -d`, `git
//    checkout-index -a -f` e o alvo lido de arquivo (`--pathspec-from-file`). A palavra "git"
//    solta no meio dos argumentos de outro git abre a leitura de um git novo (`git reset git
//    --hard` passa), e o cd so muda a pasta do git que vem depois dele no mesmo nivel (o cd de
//    fora de um ( ) nao chega no git de dentro).
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
  // rodada 5.20 (N6): "marcado" e o desaspado em que cada trecho entre aspas vira uma palavra
  // so (o espaco de dentro vira NUL), pra regra do git, que conta palavra (o git entre aspas de
  // quem executa, `bash -c "git reset --hard"`, vai pelo suspeito, como o resto): no limpo,
  // `git -C "Meus Projetos" reset --hard` virava `git -C  reset --hard`, e o -C comia o reset
  // em pedacos, pra o VAZIO de uma sequencia de aspas vazias sair depois sem refazer o texto
  const marcado = []
  let ultimoIndice = 0
  let m
  // rodada 5.23 (revisao interna): aspas vazias coladas em texto somem, como no shell
  // (`git reset --ha""rd` roda `--hard`); a palavra feita so de aspas vazias (`""`, `""""`) e um
  // argumento vazio e vira um VAZIO so (revisao comum do Codex: sumir com os dois pares de
  // `git -C """" reset` deixava o -C comer o reset). A sequencia de pares vazios guarda onde pos o
  // VAZIO e onde acaba; se acaba colada em texto, o VAZIO sai. Uma passada so: a entrada gigante
  // segue linear
  let sequencia = null
  const fechaSequencia = () => {
    if (sequencia && /\S/.test(comando[sequencia.fim] ?? ' ')) marcado[sequencia.posicao] = ''
    sequencia = null
  }
  const ehEscritorDeTexto = leitorDeEscritores(comando)
  while ((m = RE_ASPAS.exec(comando))) {
    const conteudo = m[1] !== undefined ? m[1] : m[2]
    const escritor = ehEscritorDeTexto(m.index)
    if (conteudo || escritor || !sequencia || sequencia.fim !== m.index) fechaSequencia()
    limpo += comando.slice(ultimoIndice, m.index)
    desaspado += comando.slice(ultimoIndice, m.index)
    marcado.push(comando.slice(ultimoIndice, m.index))
    ultimoIndice = RE_ASPAS.lastIndex
    if (conteudo && !escritor) suspeitos.push(conteudo)
    if (!escritor) desaspado += conteudo
    // dentro das aspas, parentese, chave, crase e separador sao texto (`git checkout -- "a (1).txt"`)
    // aspas vazias viram a marca VAZIO: `git -C ""` mantem a pasta (git-scm.com/docs/git)
    if (escritor) continue
    if (conteudo) marcado.push(conteudo.replace(/\s/g, NUL).replace(/[(){}`;&|]/g, '_'))
    else if (sequencia) sequencia.fim = RE_ASPAS.lastIndex
    else if (!/\S/.test(comando[m.index - 1] ?? ' ')) { sequencia = { posicao: marcado.length, fim: RE_ASPAS.lastIndex }; marcado.push(VAZIO) }
  }
  fechaSequencia()
  limpo += comando.slice(ultimoIndice)
  desaspado += comando.slice(ultimoIndice)
  marcado.push(comando.slice(ultimoIndice))
  return { limpo, suspeitos, desaspado, marcado: marcado.join('') }
}
const NUL = String.fromCharCode(0)
const VAZIO = String.fromCharCode(2)

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
// rodada 5.20 (N5): o PowerShell aceita U+2013, U+2014 e U+2015 no lugar do hifen pra abrir
// parametro. Medido em 2026-10-20 no pwsh 7.6.7 e no 5.1.26100.9711 (Remove-Item com o traco
// apagou a pasta nos dois; U+2010, U+2011, U+2012 e U+2212 deram erro), e a especificacao da
// linguagem (learn.microsoft.com/powershell/scripting/lang-spec/chapter-02) chama os quatro
// de "dash". Vale nas regras do Remove-Item e apelidos, rm incluso (no bash, `rm` com traco
// e nome de arquivo: barra a toa, do lado seguro)
const TRACO = '[-' + String.fromCharCode(0x2013, 0x2014, 0x2015) + ']'
const RE_RM = /\brm\b/gi
const RE_RM_RECURSIVO = new RegExp(String.raw`\s(?:${TRACO}(?=[a-zA-Z]*r)[a-zA-Z]+|--recursive)(?:\s|$)`, 'gi')
const RE_RM_FORCADO = new RegExp(String.raw`\s(?:${TRACO}(?=[a-zA-Z]*f)[a-zA-Z]+|--force)(?:\s|$)`, 'gi')

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

// rodada 5.20 (N12): Remove-Item, del e rd liam ate o fim da linha, e o -r, -Recurse ou /s de
// um comando vizinho (`del velho.mp4; ffmpeg -i in.mp4 -r 30 out.mp4`) barrava o inofensivo.
// Agora param no fim do comando: ;, &, &&, ||, | e quebra de linha (o & sozinho separa comando
// no cmd). Separador dentro de parentese nao encerra (`Remove-Item (gci | select -First 1)
// -Recurse` segue barrado): semSeparadorNoParentese troca por espaco o que esta dentro
const FIM_DO_COMANDO = /[\n;|&]/g
function semSeparadorNoParentese(texto) {
  if (!texto.includes('(')) return texto
  let fundo = 0
  let saida = ''
  for (const c of texto) {
    if (c === '(') fundo++
    else if (c === ')') fundo = Math.max(0, fundo - 1)
    saida += fundo > 0 && (c === ';' || c === '|' || c === '&' || c === '\n') ? ' ' : c
  }
  return saida
}

// rodada 5.20 (N7): o cmd le a chave em qualquer ponto da palavra, colada no nome, na outra
// chave ou no fim do alvo. Medido em 2026-10-20 no cmd real: `rd c/s/q` apagou a pasta c
// inteira e `del d/s/q` apagou os arquivos das subpastas de d. Entao todo /s depois do rd ou
// do del conta (o `del temp/s/a.txt` do PowerShell barra a toa, do lado seguro)
function chavesS(texto) {
  return [...texto.matchAll(/\/s(?!\w)/gi)].map(m => m.index)
}
// a palavra do comando: rd, del, Remove-Item e apelidos em posicao de comando, nunca dentro
// de nome de arquivo (ri.mp4) ou de caminho (videos/del/in.mp4); a chave pode vir colada
// (rd/s). Antes de ler: crase e ^ no fim da linha continuam o comando (PowerShell e cmd), e o
// ^ do cmd e escape (`rd ^/s` roda rd /s, `r^d` roda rd), entao sai
// (revisao comum do Codex) a barra invertida do nome qualificado pelo modulo vale
// (`Microsoft.PowerShell.Management\Remove-Item`, about_Command_Precedence)
const nomeDeComando = nomes => new RegExp(String.raw`(?<![\w\-.\/:])(?<!(?<!\.Management)\\)(?:${nomes})(?=[\s\/]|$)`, 'gi')
const RE_RD = nomeDeComando('rmdir|rd')
const RE_DEL = nomeDeComando('del|erase')
const RE_REMOVE_ITEM = nomeDeComando('Remove-Item|ri|del|erase|rd|rmdir')
function textoDoComando(comando) {
  return semSeparadorNoParentese(comando.replace(/[`^]\r?\n/g, '  ').replace(/\^/g, ''))
}
function rdPerigoso(comando) {
  const texto = textoDoComando(comando)
  return opcaoDepoisDaPalavra(texto, RE_RD, { posicoes: chavesS(texto) }, FIM_DO_COMANDO)
}

// rodada 5.20 (N6, N10): as regras de git eram regex no limpo, com o verbo colado no "git"
// (`git\s+reset\s+--hard`), e qualquer opcao no meio (`git -C pasta reset --hard`, `git reset
// -q --hard`) soltava o comando. Agora le palavra por palavra no marcado: acha o git (pelo
// nome, com caminho e .exe), tira as opcoes globais (git-scm.com/docs/git, conferido em
// 2026-10-20; as longas aceitam o valor com = ou na palavra seguinte, medido no git 2.55) e
// olha o verbo e o resto do comando. Cada palavra e lida uma vez: a leitura de um git para no
// proximo git
const GIT_COM_VALOR = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env',
  '--attr-source', '--list-cmds', '--super-prefix'])
const MOTIVO_HISTORICO = 'reescreve o historico do backup no GitHub'
const MOTIVO_APAGA_REMOTO = 'apaga branch do backup no GitHub'
const MOTIVO_SEM_SALVAR = 'joga fora o trabalho que ainda nao foi salvo'
const MOTIVO_PASTA = 'descarta toda mudanca nao salva da pasta inteira'
const MOTIVO_CLEAN = 'apaga arquivo e pasta fora do controle de versao, sem confirmacao'
const MOTIVO_STASH = 'apaga pra sempre o trabalho guardado no stash'
const MAX_PASTAS_CONFERIDAS = 1000

function nomeDoPrograma(palavra) {
  return palavra.replace(/^.*[\\\/]/, '').replace(/\.(?:exe|cmd)$/i, '').toLowerCase()
}

// letras de uma opcao curta agrupada (-fdx). Na letra que pede valor (-o do push, -e do
// clean) o resto da palavra e o valor; pedeValor diz se o valor e a palavra seguinte
function letrasCurtas(palavra, comValor = '') {
  if (!/^-[A-Za-z0-9]/.test(palavra)) return { letras: '', pedeValor: false }
  let letras = ''
  for (let i = 1; i < palavra.length; i++) {
    letras += palavra[i]
    if (comValor.includes(palavra[i])) return { letras, pedeValor: i === palavra.length - 1 }
  }
  return { letras, pedeValor: false }
}

// opcao longa abreviada: o git aceita o comeco dela quando ele e unico (`git reset --har`
// apaga igual, medido na revisao interna). Conta a partir de 4 caracteres, os dois tracos
// inclusos; um comeco ambiguo o git recusa, e barrar ele nao custa nada
function longa(a, nome) {
  const op = a.split('=')[0]
  return op.length >= 4 && op.startsWith('--') && nome.startsWith(op)
}

// pasta de casa escrita do jeito do shell (~, $HOME, $env:USERPROFILE, %USERPROFILE%)
function expandir(p) {
  return p.replace(/^(?:~|\$HOME|\$env:USERPROFILE|%USERPROFILE%)(?=[\\\/]|$)/i, () => homedir())
}

// alvo que pega a pasta inteira ou muitos arquivos: ponto, curinga, pathspec magico (:/ e a
// raiz), terminado em barra, a lista que sai de outro comando ($(git ls-files -m), marca SUB),
// caminho de rede (\\servidor, que o disco demora a responder) ou pasta que existe (relativa
// ao cwd do comando). A conferencia no disco tem teto: passou dele, conta como pasta
function alvoAmplo(alvo, dir, conta) {
  const a = expandir(alvo.split(NUL).join(' '))
  if (a === '.' || a === '..' || /[*?[]/.test(a) || a.startsWith(':') || /[\\\/]$/.test(a)) return true
  if (a.includes(SUB) || /^[\\\/]{2}/.test(a)) return true
  if (a === VAZIO || a.startsWith('-')) return false
  if (conta.mudancas > MAX_MUDANCAS_DE_PASTA) return true
  if (++conta.n > MAX_PASTAS_CONFERIDAS) return true
  try { return !!statSync(resolve(dir, a), { throwIfNoEntry: false })?.isDirectory() } catch { return false }
}

function gitPushPerigoso(resto) {
  for (let j = 0; j < resto.length; j++) {
    const a = resto[j]
    if (a === '-o' || a === '--push-option' || a === '--repo' || a === '--receive-pack' || a === '--exec') { j++; continue }
    if (longa(a, '--force')) return MOTIVO_HISTORICO
    if (longa(a, '--delete') || longa(a, '--mirror') || longa(a, '--prune')) return MOTIVO_APAGA_REMOTO
    const { letras, pedeValor } = letrasCurtas(a, 'o')
    if (letras.includes('f')) return MOTIVO_HISTORICO
    if (letras.includes('d')) return MOTIVO_APAGA_REMOTO
    if (pedeValor) { j++; continue }
    if (a.startsWith('+')) return MOTIVO_HISTORICO
    // `git push origin :` sozinho empurra as branches de mesmo nome, nao apaga nada
    if (a.startsWith(':') && a.length > 1) return MOTIVO_APAGA_REMOTO
  }
  return null
}

function gitCleanPerigoso(resto, semForca) {
  let forca = semForca, apaga = false, simula = false
  for (let j = 0; j < resto.length; j++) {
    const a = resto[j]
    if (a === '--') break
    // a opcao negada (--no-dry-run) desfaz a anterior, e vale a ultima (gitcli, "negating options")
    if (longa(a, '--force')) forca = true
    else if (longa(a, '--no-force')) forca = semForca
    else if (longa(a, '--dry-run')) simula = true
    else if (longa(a, '--no-dry-run')) simula = false
    else if (a === '-e' || a === '--exclude') j++
    else if (!a.startsWith('--')) {
      const { letras, pedeValor } = letrasCurtas(a, 'e')
      if (letras.includes('f')) forca = true
      if (/[dxX]/.test(letras)) apaga = true
      if (letras.includes('n')) simula = true
      if (pedeValor) j++
    }
  }
  return forca && apaga && !simula ? MOTIVO_CLEAN : null
}

// checkout, restore e switch: separa opcao de alvo; depois do -- tudo e alvo. deFora: os alvos
// chegam pelo xargs (`git diff --name-only | xargs git checkout --`), entao contam como amplos
function gitDescartePerigoso(verbo, resto, dir, conta, deFora) {
  const comValor = { checkout: 'bB', restore: 's', switch: 'cC' }[verbo]
  const longasComValor = { checkout: ['--orphan'], restore: ['--source'], switch: ['--create', '--force-create', '--orphan'] }[verbo]
  let forca = false, staged = false, worktree = false, depoisDoTraco = false
  const alvos = []
  for (let j = 0; j < resto.length; j++) {
    const a = resto[j]
    if (!depoisDoTraco && a.startsWith('-')) {
      if (a === '--') { depoisDoTraco = true; continue }
      if (!a.includes('=') && longasComValor.some(n => longa(a, n))) { j++; continue }
      if (longa(a, '--force') || longa(a, '--discard-changes')) forca = true
      else if (longa(a, '--staged')) staged = true
      else if (longa(a, '--no-staged')) staged = false
      else if (longa(a, '--worktree')) worktree = true
      else if (longa(a, '--no-worktree')) worktree = false
      else if (!a.startsWith('--')) {
        const { letras, pedeValor } = letrasCurtas(a, comValor)
        if (letras.includes('f')) forca = true
        if (verbo === 'restore' && letras.includes('S')) staged = true
        if (verbo === 'restore' && letras.includes('W')) worktree = true
        if (pedeValor) j++
      }
      continue
    }
    // no checkout sem --, o primeiro alvo pode ser a branch ou o commit, mesmo vindo de $(...)
    alvos.push(verbo === 'checkout' && !depoisDoTraco && alvos.length === 0 ? a.split(SUB).join('_') : a)
  }
  if (forca && verbo !== 'restore') return MOTIVO_SEM_SALVAR
  if (verbo === 'switch') return null
  // o restore so mexe no index com --staged sozinho; sem nada, ou com --worktree, mexe nos arquivos
  if (verbo === 'restore' && staged && !worktree) return null
  if (deFora) return MOTIVO_PASTA
  return alvos.some(a => alvoAmplo(a, dir, conta)) ? MOTIVO_PASTA : null
}

// cd e -C repetidos tem teto: passou dele, a pasta para de mudar (cada um junta texto no
// caminho, e milhares deles faziam o comando custar o quadrado) e o alvoAmplo conta todo
// alvo como pasta, porque a pasta medida ja nao e a de verdade (rodada 5.21)
const MAX_MUDANCAS_DE_PASTA = 64
function mudarPasta(conta, dir, alvo) {
  if (alvo === VAZIO || ++conta.mudancas > MAX_MUDANCAS_DE_PASTA) return dir
  return resolve(dir, expandir(alvo.split(NUL).join(' ')))
}

function lerGit(args, dir, conta, deFora) {
  let i = 0
  let semForca = false
  while (i < args.length && args[i].startsWith('-')) {
    const op = args[i]
    const nome = op.split('=')[0]
    let valor
    if (GIT_COM_VALOR.has(op)) { valor = args[i + 1]; i += 2 } else { valor = op.slice(nome.length + 1); i++ }
    if (valor === undefined) return null
    if (op === '-C' || nome === '--work-tree') dir = mudarPasta(conta, dir, valor)
    // valor vazio e zero tambem sao falso pro git (revisao final do Codex, 5.20); o --config-env
    // tira o valor de uma variavel que a trava nao le, entao conta como sem forca
    if (op === '-c' && /^clean\.requireforce=(?:false|no|off|0*)$/i.test(valor)) semForca = true
    if (nome === '--config-env' && /^clean\.requireforce=/i.test(valor)) semForca = true
  }
  const verbo = args[i]
  const resto = args.slice(i + 1)
  if (verbo === 'push') return gitPushPerigoso(resto)
  if (verbo === 'reset') return resto.some(a => longa(a, '--hard')) ? MOTIVO_SEM_SALVAR : null
  if (verbo === 'clean') return gitCleanPerigoso(resto, semForca)
  if (verbo === 'checkout' || verbo === 'restore' || verbo === 'switch') return gitDescartePerigoso(verbo, resto, dir, conta, deFora)
  if (verbo === 'stash') {
    const sub = resto.find(a => !a.startsWith('-'))
    return sub === 'clear' || sub === 'drop' ? MOTIVO_STASH : null
  }
  return null
}

// divide o texto em comandos. O que esta dentro de $( ), ( ), { } (bloco do PowerShell) e
// crase vira um comando a parte, e no lugar dele fica a marca SUB (a saida do comando de
// dentro): `git push origin $(git branch --show-current) --force` le o --force no push, e
// `Invoke-Command {git reset --hard}` le o git do bloco. Depois cada um divide no separador
const SUB = String.fromCharCode(1)
function comandosDoTexto(texto) {
  const prontos = []
  const pilha = ['']
  let crase = false
  for (const c of texto) {
    const topo = pilha.length - 1
    if (c === '(' || c === '{' || (c === '`' && !crase)) {
      if (c === '`') crase = true
      // a marca fica colada no que vem antes ($SUB, stash@SUB): no checkout, `$(git rev-parse
      // x) -- a.txt` continua sendo um alvo so
      pilha[topo] += SUB + ' '
      pilha.push('')
    } else if ((c === ')' || c === '}' || (c === '`' && crase)) && topo > 0) {
      if (c === '`') crase = false
      prontos.push(pilha.pop())
    } else {
      pilha[topo] += c
    }
  }
  // um por um: o push(...pilha) com centenas de milhares de "(" abertos estourava a pilha do Node
  for (const t of pilha) prontos.push(t)
  return prontos.flatMap(t => t.split(/&&|\|\||[;&|\n]/))
}

// o cd de um comando anterior da mesma linha muda a pasta do git seguinte (`cd sub && git
// checkout pasta`); o /d do cd do cmd e opcao
const CDS = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl'])
function gitPerigoso(texto, cwd) {
  let dir = cwd
  const conta = { n: 0, mudancas: 0 }
  for (const seg of comandosDoTexto(texto)) {
    const palavras = seg.match(/\S+/g)
    if (!palavras) continue
    if (CDS.has(nomeDoPrograma(palavras[0]))) {
      const alvo = palavras.slice(1).find(p => !p.startsWith('-') && !/^\/d$/i.test(p))
      if (alvo) dir = mudarPasta(conta, dir, alvo)
      continue
    }
    let i = 0
    let deFora = false
    while (i < palavras.length) {
      const nome = nomeDoPrograma(palavras[i])
      if (nome === 'xargs') deFora = true
      if (nome !== 'git') { i++; continue }
      let fim = i + 1
      while (fim < palavras.length && nomeDoPrograma(palavras[fim]) !== 'git') fim++
      const motivo = lerGit(palavras.slice(i + 1, fim), dir, conta, deFora)
      if (motivo) return motivo
      i = fim
    }
  }
  return null
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
const RE_OPCAO_RECURSE = new RegExp(String.raw`\s${TRACO}r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b`, 'gi')
function removeItemPerigoso(comando) {
  return opcaoDepoisDaPalavra(textoDoComando(comando), RE_REMOVE_ITEM,
    RE_OPCAO_RECURSE, FIM_DO_COMANDO)
}

// correcao 7: "erase" e sinonimo de "del" no cmd e aceita a mesma sintaxe (/s), doc da
// Microsoft confirma os dois como apelido do mesmo Remove-Item; cobrir um so e deixar
// o gemeo de fora era o buraco que esta rodada veio fechar
function delPerigoso(comando) {
  const texto = textoDoComando(comando)
  return opcaoDepoisDaPalavra(texto, RE_DEL, { posicoes: chavesS(texto) }, FIM_DO_COMANDO)
}

// rodada 5.20 (N8, doc conferida em 2026-10-20 em learn.microsoft.com/windows-server/
// administration/windows-commands/robocopy): /PURGE "Deletes destination files and
// directories that no longer exist in the source" e /MIR e o /E com o /PURGE. Barra sempre,
// ate com o /L (so lista), como o -WhatIf desde a 5.18
// le o desaspado (lista PERIGOS_NO_DESASPADO): a chave pode vir entre aspas ("/MIR"), e o
// robocopy aceita o traco no lugar da barra (-MIR)
function robocopyPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /(?<![\w\-.])robocopy(?:\.exe)?(?![\w\-.\/])/gi, /\s[\/-](?:mir|purge)(?!\w)/gi, FIM_DO_COMANDO)
}

// rodada 5.20 (N9): apagar por outro programa, as formas comuns (limite 6 no cabecalho).
// find e xargs no limpo; o codigo do node -e e do python -c mora entre aspas, entao esses
// dois leem o desaspado (lista PERIGOS_NO_DESASPADO). O codigo pode ter ;, | e quebra de
// linha, entao o node e o python leem o comando ate o fim
const NUNCA = /(?!)/g
const RE_FIND = /(?<![\w\-.])find(?![\w\-.])/gi
const RE_FIND_APAGA = /\s-(?:delete(?![\w\-])|(?:exec|execdir)\s+(?:\S*\/)?(?:rm|rmdir|unlink)(?![\w\-.]))/gi
function findPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, RE_FIND, RE_FIND_APAGA, FIM_DO_COMANDO)
}
// xargs so barra quando o programa que ele roda e o rm (pula as opcoes do xargs e o valor
// delas): `xargs git rm` e `xargs grep -l rm` seguem livres
const XARGS_COM_VALOR = /^-[IiLlnPdEsa]$/
function xargsApaga(comando) {
  for (const seg of comando.split(/&&|\|\||[;&|\n]/)) {
    const p = seg.match(/\S+/g) || []
    let i = p.findIndex(x => nomeDoPrograma(x) === 'xargs')
    if (i < 0) continue
    i++
    while (i < p.length && (p[i].startsWith('-') || nomeDoPrograma(p[i]) === 'sudo')) i += XARGS_COM_VALOR.test(p[i]) ? 2 : 1
    if (i < p.length && ['rm', 'rmdir', 'unlink'].includes(nomeDoPrograma(p[i]))) return true
  }
  return false
}
// node -e, -p e agrupado (-pe); o recursive tem de vir depois da chamada que apaga, no mesmo
// comando do JavaScript (antes do ;): `fs.mkdirSync('out',{recursive:true}); fs.rmSync('a.txt')`
// apaga um arquivo so e segue livre
const RE_NODE = /(?<![\w\-.])node(?:\.exe)?(?=\s)/gi
const RE_NODE_EVAL = /\s(?:-[a-zA-Z]*[ep][a-zA-Z]*|--eval|--print)(?=[\s=]|$)/g
const RE_CHAMADA_RM = /\b(?:rmSync|rmdirSync|rm|rmdir)\s*\(/g
function nodeApaga(comando) {
  if (!opcaoDepoisDaPalavra(comando, RE_NODE, RE_NODE_EVAL, NUNCA)) return false
  return /\bunlinkSync\b/.test(comando) || opcaoDepoisDaPalavra(comando, RE_CHAMADA_RM, /\brecursive\b/g, /;/g)
}
// python -c, agrupado (-Bc) ou colado no codigo (-c"...")
const RE_PYTHON = /(?<![\w\-.])(?:python(?:3(?:\.\d+)?)?|py)(?:\.exe)?(?=\s)/gi
function pythonApaga(comando) {
  return opcaoDepoisDaPalavra(comando, RE_PYTHON, [/\s-[a-zA-Z]*c/g, /\b(?:rmtree|os\.remove|os\.rmdir|os\.unlink|os\.removedirs)\b/g], NUNCA)
}
// rimraf e del-cli so como programa: no comeco do pedaco ou depois de quem lanca pacote
// (npx, pnpm dlx, npm exec, env, VAR=valor...), com ou sem versao (rimraf@5). `npm install
// rimraf` instala, nao roda
const LANCADORES = new Set(['npx', 'pnpx', 'bunx', 'pnpm', 'yarn', 'npm', 'bun', 'exec', 'dlx', 'x', 'sudo', 'env', 'cross-env'])
function apagadorDePacote(comando) {
  for (const { seg } of pedacosDeComando(comando)) {
    for (const palavra of seg.match(/\S+/g) || []) {
      const nome = nomeDoPrograma(palavra).replace(/@[^@\/]*$/, '')
      if (nome === 'rimraf' || nome === 'del-cli') return true
      if (!LANCADORES.has(nome) && !palavra.startsWith('-') && !/^\w+=/.test(palavra)) break
    }
  }
  return false
}
// .NET pelo PowerShell: Directory.Delete com $true (recursivo), File.Delete e o .Delete($true)
// do DirectoryInfo (Get-Item pasta). O .Delete() no bloco do ForEach vai pelo removeItemPipePerigoso
const RE_DIRECTORY_DELETE = /\[(?:System\.)?IO\.Directory\]\s*::\s*Delete\b/gi
const RE_FILE_DELETE = /\[(?:System\.)?IO\.File\]\s*::\s*Delete\b/i
function dotnetApaga(comando) {
  return RE_FILE_DELETE.test(comando) || /\.Delete\s*\(\s*\$true\s*\)/i.test(comando) ||
    opcaoDepoisDaPalavra(comando, RE_DIRECTORY_DELETE, /\$true\b|,\s*1\s*\)/gi, FIM_DO_COMANDO)
}
// Clear-Content zera o arquivo (fica com 0 bytes). Um arquivo so, livre; com curinga, com
// -Recurse ou recebendo a lista pelo pipe, zera varios de uma vez. Le o desaspado, porque o
// curinga costuma vir no caminho entre aspas ("logs/*.log")
const RE_CLEAR_CONTENT = /(?<![\w\-.])(?:Clear-Content|clc)(?![\w\-.])/gi
function clearContentPerigoso(comando) {
  return /\|\s*(?:Clear-Content|clc)(?![\w\-.])/i.test(comando) ||
    opcaoDepoisDaPalavra(comando, RE_CLEAR_CONTENT, /[*?]/g, FIM_DO_COMANDO) ||
    opcaoDepoisDaPalavra(comando, RE_CLEAR_CONTENT, RE_OPCAO_RECURSE, FIM_DO_COMANDO)
}
const MOTIVO_OUTRO_PROGRAMA = 'apaga pasta ou arquivo por outro programa, sem confirmacao'
// regras que leem o desaspado (o que importa pode estar entre aspas); o texto de quem so
// escreve (echo "...") ja saiu dele
const PERIGOS_NO_DESASPADO = [
  { teste: robocopyPerigoso, motivo: 'apaga do destino, pra sempre, tudo que nao existe na origem' },
  { teste: nodeApaga, motivo: MOTIVO_OUTRO_PROGRAMA },
  { teste: pythonApaga, motivo: MOTIVO_OUTRO_PROGRAMA },
  { teste: clearContentPerigoso, motivo: 'apaga o conteudo de varios arquivos de uma vez' },
]

// correcao 7: a regra do pipe nao pode depender de um nome literal do lado esquerdo
// (Get-ChildItem tem apelidos gci/dir/ls, e podia vir qualquer outro comando gerando a
// lista), entao aceita QUALQUER coisa antes do "|" e olha so o que vem depois: um
// apelido de Remove-Item direto, ou um ForEach-Object/% cujo bloco chama Remove-Item.
// rodada 5.18 (chat 4, F1b): as duas regex sairam de dentro da funcao, que as montava de novo
// a cada chamada (cada trecho entre aspas chama o hook inteiro outra vez)
const RE_ALIAS_REMOVE = /(?:Remove-Item|ri|del|erase|rd|rmdir|rm)/.source
const RE_PIPE_REMOVE = new RegExp(String.raw`\|\s*${RE_ALIAS_REMOVE}\b`, 'i')
// rodada 5.20 (N9): o .Delete() do .NET no bloco (`gci -Recurse -File | % { $_.Delete() }`)
// apaga item por item como o Remove-Item
const RE_REMOVE_NO_BLOCO = new RegExp(String.raw`\b${RE_ALIAS_REMOVE}\b|\.Delete\s*\(`, 'gi')
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
  // as regras de git (push forcado ou apagando branch, reset --hard, checkout e restore na
  // pasta inteira, checkout -f, switch --discard-changes, clean, stash clear e drop) moram no
  // gitPerigoso, que le o marcado (ver ehPerigoso). --force-with-lease e a variante segura
  // (nao sobrescreve o que outra pessoa subiu) e segue livre: barrar ela empurraria o aluno
  // avancado a desligar a trava inteira. O git clean barra com -f (ou --force) junto de -d,
  // -x ou -X, e o -n (--dry-run) so simula. Um arquivo so (git checkout -- arquivo.txt, git
  // restore arquivo.txt) continua liberado
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
  { teste: findPerigoso, motivo: MOTIVO_OUTRO_PROGRAMA },
  { teste: xargsApaga, motivo: MOTIVO_OUTRO_PROGRAMA },
  { teste: apagadorDePacote, motivo: MOTIVO_OUTRO_PROGRAMA },
  { teste: dotnetApaga, motivo: MOTIVO_OUTRO_PROGRAMA },
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

// rodada 5.20 (N2): Start-Process com -ArgumentList em lista ('/c','rd','/s' ou /c,rd,/s,
// com ou sem @( )) chegava picotado: o limpo perde o que esta entre aspas, cada suspeito tem
// uma palavra so, e o desaspado fica com virgula no lugar do espaco. Aqui o trecho depois do
// Start-Process (ate o fim do comando ou o proximo Start-Process) volta a ser uma linha so, com
// espaco no lugar da virgula, e passa pelo ehPerigoso inteiro como mais um suspeito. Le o
// desaspado, nao o comando cru, pra o texto de quem so escreve (echo "...") seguir livre.
// O trecho e sempre mais curto que o comando (perde ao menos o nome), entao a recursao termina
const RE_START_PROCESS = /(?<![\w\-.])(?:Start-Process|saps|start)(?![\w\-.])/gi
// A lista pode vir quebrada em linhas (virgula no fim da linha, ou dentro do @( )): a quebra
// depois da virgula e a de dentro do parentese nao encerram o comando
function argumentosRemontados(desaspado) {
  const texto = semSeparadorNoParentese(desaspado.replace(/,[ \t]*\r?\n/g, ', '))
  const remontados = []
  const inicios = [...texto.matchAll(RE_START_PROCESS)]
  const fim = proximaDesde(texto, new RegExp(FIM_DO_COMANDO.source, 'g'))
  inicios.forEach((m, k) => {
    const comeco = m.index + m[0].length
    const ate = Math.min(fim(comeco), k + 1 < inicios.length ? inicios[k + 1].index : texto.length)
    const trecho = texto.slice(comeco, ate)
    // lista com virgula ou dentro de @( ), que no PowerShell pode ter um item por linha sem virgula
    if (/[,(]/.test(trecho)) remontados.push(trecho.replace(/@\(|[,()]/g, ' '))
  })
  return remontados
}

export function ehPerigoso(comando, opcoes = {}) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const { limpo, suspeitos, desaspado, marcado } = classificarTrechosEntreAspas(comando)
  // menor 1: a limpeza de aspas vale pra todos os padroes, nao so pro rm, senao
  // escrever licao sobre qualquer outro comando perigoso continua barrado
  // (ex.: `echo "nunca rode chmod 777" >> licoes.md`).
  // o PowerShell continua o comando na linha de baixo depois de "(" ou de crase no fim
  // da linha, entao as regras dele leem o comando com as linhas juntadas
  // (achado do Codex no Bloco A: `iex (` numa linha e `irm x)` na outra passava)
  const emUmaLinha = desaspado.replace(/`?\r?\n\s*/g, ' ')
  // e tambem linha a linha: juntar tudo deixava um `-Command` da primeira linha encerrar a
  // leitura das opcoes e esconder o `powershell "-e"` da segunda (achado do Codex na final)
  const motivo = testarPadroes(limpo) || gitPerigoso(marcado, cwd) || testarPadroes(desaspado, PERIGOS_POWERSHELL) || testarPadroes(emUmaLinha, PERIGOS_POWERSHELL) || testarPadroes(desaspado, PERIGOS_SUBSHELL) || testarPadroes(desaspado, PERIGOS_DISCO) || testarPadroes(desaspado, PERIGOS_NO_DESASPADO)
  if (motivo) return motivo
  // correcao 5: todo trecho entre aspas que NAO veio de um escritor de texto conhecido
  // e comando de verdade em potencial, e testa nele mesmo, recursivo (o texto extraido
  // e sempre mais curto que o original, entao a recursao termina). O suspeito repetido e
  // lido uma vez so (rodada 5.20: o Start-Process remontado soma um suspeito por chamada)
  for (const suspeito of new Set([...suspeitos, ...argumentosRemontados(desaspado)])) {
    const motivoSuspeito = ehPerigoso(suspeito, { cwd })
    if (motivoSuspeito) return motivoSuspeito
  }
  return null
}

// rodada 5.23 (1b): so a leitura de git, com a mesma leitura do ehPerigoso (marcado, cwd, -C e
// trecho entre aspas de quem executa, recursivo). O ehPerigoso devolve o primeiro motivo que
// achar, e o do rm vem antes: `rm -rf x; git reset --hard` voltava com o motivo do rm, e quem so
// quer saber do git ficava sem ele
export function ehGitPerigoso(comando, opcoes = {}) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const { suspeitos, desaspado, marcado } = classificarTrechosEntreAspas(comando)
  const motivo = gitPerigoso(marcado, cwd)
  if (motivo) return motivo
  for (const suspeito of new Set([...suspeitos, ...argumentosRemontados(desaspado)])) {
    const motivoSuspeito = ehGitPerigoso(suspeito, { cwd })
    if (motivoSuspeito) return motivoSuspeito
  }
  return null
}

// rodada 5.20 (decisao 9, N37): o Node entrega o import.meta.url com o atalho resolvido e o
// argv[1] do jeito que veio. Com o projeto aberto por uma juncao ou um link, as duas formas
// velhas da guarda davam false e a trava saia 0 calada, sem ler nada. Os dois lados passam
// pelo realpathSync; se ele falha, a guarda nao roda
function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (chamadoDireto()) {
  let bruto = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', pedaco => { bruto += pedaco })
  process.stdin.on('end', () => {
    let entrada
    // entrada ilegivel deixa passar de proposito: uma trava que bloqueia tudo quando
    // nao entende a entrada viraria pedra no sapato e seria desligada pelo aluno.
    try { entrada = JSON.parse(bruto || '{}') } catch { process.exit(0) }
    const comando = entrada && entrada.tool_input && entrada.tool_input.command
    // rodada 5.20 (revisao interna): erro na leitura do comando saia 1, e o Claude Code deixa
    // rodar o que o hook nao barrou com 2. A trava leu a entrada e nao conseguiu julgar o
    // comando, entao barra: o recado diz que foi a trava que falhou
    let motivo
    try { motivo = ehPerigoso(comando, { cwd: entrada && entrada.cwd }) } catch {
      motivo = 'a trava nao conseguiu ler este comando (erro dentro dela); quebre o comando em partes menores'
    }
    if (!motivo) process.exit(0)
    process.stderr.write(
      `Um comando foi barrado antes de rodar, porque ${motivo}.\n` +
      `Pare aqui: explique pro usuario o que voce estava tentando fazer e peca a ele\n` +
      `pra decidir o proximo passo, em vez de tentar de outro jeito pra fazer a mesma coisa.\n`
    )
    process.exit(2)
  })
}
