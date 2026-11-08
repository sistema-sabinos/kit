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
// Barra comando destrutivo antes de ele rodar, pelo hook PreToolUse do Claude Code. Desde a
// 5.40, um caso so pergunta em vez de barrar: o `rm -r` na ferramenta PowerShell (ver a entrada).
// 5.49 (bloco A, 2026-11-03): barram so o git que joga trabalho fora (bloco 7), o disco
// (bloco 10), o -EncodedCommand (bloco 9) e o erro dentro da trava. Apagar pasta pergunta nas tres
// ferramentas, e a pasta temporaria apaga calada (bloco 5, perguntaDeApagar). Sairam o
// baixar-e-executar (bloco 8), o chmod 777 e o texto entre aspas lido como comando (bloco 9), o git
// que a trava nao le (bloco 6, fica so no estrito da bancada) e a leitura de segredo (bloco 11).
// 5.52 (chat 2, Task 2e, 2026-11-05): a pasta da lista fechada (PASTAS_REFAZIVEIS: node_modules, dist, build,
// .next, __pycache__) dentro do projeto tambem apaga calada; a pergunta traz a contagem, o fora do backup e o
// nome sensivel.
// 5.52 (chat 2, Task 2f, 2026-11-05): o script rodado por bash, sh, source, ., .ps1, -File, bat, .cmd e call e lido
// e julgado como digitado; o que a trava nao le pergunta pela regra script-nao-lido (ver scriptsRodados).
// 5.52 (chat 3, Task 3c): gravar no _contexto/autonomia.md pelo shell pergunta pela regra grava-autonomia (ver gravaAutonomia).
// 5.49 (D-embrulho e D-apelido, 2026-11-03): o trecho entre aspas de quem executa comando (bash -c, cmd
// /c, powershell -Command, Invoke-Expression, eval) e o comando do apelido do git com ! voltam a ser lidos.
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
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

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
// 5.49 (bloco 9, 2026-11-03): o ehPerigoso nao desce mais nos suspeitos (`bash -c "git reset
// --hard"` passa), nem a perguntaDeApagar (`bash -c "rm -rf x"` passa); desce so o ehGitPerigoso no
// estrito da bancada. 5.49 (D-embrulho, 2026-11-03): a logica de antes desta correcao volta, so que
// pela lista de quem executa (embrulhados): `bash -c "git reset --hard"` barra e `bash -c "rm -rf x"`
// pergunta; o texto de qualquer outro programa segue sem ser lido.
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
// 3. Baixar-e-executar passa inteiro desde a 5.49 (bloco 8, 2026-11-03: o instalador
//    oficial de uv, bun e do Claude Code e assim): `curl x | sh`, `sh -c "$(curl ...)"`,
//    `bash <(curl ...)`, `irm x | iex` e `iex (irm x)`.
// 4. Trava de disco (rodada 5.17). Passam: `cp ubuntu.iso /dev/sdb` (o cp so cita),
//    `fdisk /dev/sda` e `parted /dev/sda mklabel gpt` (interativos ou com verbo depois),
//    `nvme format /dev/nvme0n1`, `hdparm --security-erase`, `dd of=$DISCO` (o limite 1),
//    `echo "format D:" | cmd` e `rg --pre format` (o `git -c alias.f='!format D:' f` barra de novo
//    desde a 5.49, D-apelido: o comando do apelido com ! e lido). E o
//    contrario, barram sem precisar: `notepad mkfs.txt`, `wipefs /dev/sdb` sem -a (so
//    lista) e mencao solta como `echo usar wipefs depois >> licoes.md`.
// 5. Copias de sombra do Windows (rodada 5.18, doc conferida em 2026-10-19 em
//    learn.microsoft.com/windows-server/administration/windows-commands/vssadmin): so o
//    `vssadmin delete shadows` barra. Passam `vssadmin resize shadowstorage` (a doc avisa
//    "Resizing the storage association may cause shadow copies to disappear"), `wmic
//    shadowcopy delete` e o Delete() do Win32_ShadowCopy pelo PowerShell.
// 6. Apagar por outro programa (rodada 5.20, N9) e uma classe aberta (desde a 5.49 pergunta em vez
//    de barrar, bloco 5; as formas abaixo sem alvo lido perguntam "uma pasta"): barram as formas
//    comuns (find -delete e -exec rm, xargs rm, node -e com rmSync/rmdirSync recursivo ou
//    unlinkSync, python -c com rmtree/os.remove/os.rmdir/os.unlink, rimraf e del-cli pelo
//    npx, [IO.Directory]::Delete com $true, [IO.File]::Delete, .Delete($true), .Delete() no
//    bloco do ForEach e Clear-Content com curinga, -Recurse ou pipe). Passam perl, ruby, bun,
//    deno, o pathlib do Python (.unlink(), .rmdir()), script gravado em arquivo e rodado
//    depois pelo ./x.sh direto, pela entrada (`bash < x.sh`, `cat x.sh | bash`) ou por node e python
//    (5.52, chat 2, Task 2f, 2026-11-05: o rodado por bash, sh, source, ., .ps1, -File, bat, .cmd e
//    call e lido, ver scriptsRodados), codigo mandado pela entrada (`python3 - <<EOF`, `node <<EOF`), o rm dentro de
//    outro shell no find (`find . -exec sh -c 'rm "$1"' _ {} \;`), o .Delete() fora do pipe
//    (`foreach ($f in ...) { $f.Delete() }`, `.ForEach({ $_.Delete() })`, `ForEach-Object
//    Delete`), `rsync --delete`, `robocopy /MOV` e `/MOVE` (movem, a copia fica no destino) e
//    o `/MIR` guardado num arquivo de /JOB. E o contrario: qualquer .Delete( no bloco do
//    ForEach barra, seja qual for o objeto (`$api | % { $_.Delete(id) }`).
// 7. Git (rodada 5.20, N6 e N10). `git checkout arquivo` sem `--` fica livre (nao da pra
//    saber sem o git se a palavra e branch ou arquivo; pasta, ponto, curinga, `:/` e a lista
//    que sai de $(...) ou do xargs barram). Desde a 5.49 (bloco 6, 2026-11-03) o que segue
//    ate o fim deste item (o naoLe) saiu do kit, e desde a 5.49 (D-bancada-git) tambem do estrito da
//    bancada, onde sobra so o apelido por -c ou --config-env. Desde a 5.28, nos verbos que a trava julga, barram
//    a palavra com variavel, substituicao, crase ou chaves, o git depois do xargs e o apelido
//    por -c ou --config-env; pelo xargs com -I, -i ou --replace, a troca no verbo. A barra invertida se
//    le do jeito do bash e do PowerShell. Nao decidem o redirecionamento (`2>$null`), o
//    comentario, as chaves coladas em @ ou ^ (`HEAD@{1}`), o valor do `stash -m` e o git citado
//    por grep, rg, echo ou outro git. Barra a prosa de heredoc com verbo julgado antes de
//    parentese, crase ou chaves (`git push (desde ...)` num `commit -F - <<EOF`). Passam
//    o verbo por crase, chaves ou parentese (git `x` --hard), porque o mesmo desenho pega
//    prosa de heredoc, o apelido gravado no config do git, `git checkout-index -a -f` e o alvo
//    lido de arquivo (`--pathspec-from-file`). 5.52 (chat 2, Task 2d, 2026-11-05): `git reflog
//    expire`, `git branch -f`, `-D`, `-M` e `-C`, `git worktree remove` e `git update-ref -d`, junto de
//    `wsl --unregister` e `Clear-RecycleBin`, perguntam pela regra apaga-de-vez (apagaDeVez), fora
//    deste item e do ehGitPerigoso; seguem passando `git checkout -B`, `git switch -C`, `git gc
//    --prune=now` sozinho, `git prune`, `git update-ref --stdin` e `wslconfig /unregister`. A palavra "git"
//    solta no meio dos argumentos de outro git abre a leitura de um git novo (`git reset git
//    --hard` passa), e o cd so muda a pasta do git que vem depois dele no mesmo nivel (o cd de
//    fora de um ( ) nao chega no git de dentro).
// 8. Leitura de segredo (rodada 5.28) saiu na 5.49 (bloco 11, 2026-11-03): `cat .env`,
//    `Get-Content .env` e o codigo inline lendo segredo passam; o backup segue segurando a senha.
// 5.49 (Codex comum, 2026-11-04): literal liga a marca LITERAL no trecho entre aspas simples com $ ou %
// (so a leitura do alvo de apagar pede), porque no bash e no PowerShell a variavel entre aspas simples
// nao expande, e no cmd a aspa simples e parte do nome: '$TMPDIR/x' e uma pasta com esse nome
function classificarTrechosEntreAspas(comando, { literal = false } = {}) {
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
    // a crase entre aspas duplas ainda roda no bash: vira $, que a leitura de git conta como nao lida; e
    // o #, o < e o > do comeco sao texto (`git clean -e "#keep"`), entao levam a marca ASPA (5.28)
    if (conteudo) {
      const t = (m[1] !== undefined ? conteudo.split('`').join('$') : conteudo).replace(/\s/g, NUL).replace(/[(){}`;&|]/g, '_')
      const marca = literal && m[2] !== undefined && /[$%]/.test(t) ? LITERAL : ''
      marcado.push(marca + (/^[#<>]/.test(t) ? ASPA + t : t))
    } else if (sequencia) sequencia.fim = RE_ASPAS.lastIndex
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
const ASPA = String.fromCharCode(3)
const LITERAL = String.fromCharCode(4)

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
// crescente, pra opcao que uma regex sozinha so acha relendo o texto (ver chavesS; o processoComDownload
// saiu na 5.49)
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

// 5.49 (Codex comum, revisao interna, 2026-11-04): o caminho do cmd.exe pela variavel (`& $env:ComSpec /c "..."`,
// `%ComSpec%`, `$COMSPEC` do Git Bash) e o proprio cmd. 5.49 (regressao contra a v5.40, 2026-11-04): com
// chaves tambem (`${env:ComSpec}`, `${COMSPEC}`)
const RE_COMSPEC = /^(?:[$]env:comspec|%comspec%|[$]comspec|[$][{]env:comspec[}]|[$][{]comspec[}])$/i
function nomeDoPrograma(palavra) {
  if (RE_COMSPEC.test(palavra)) return 'cmd'
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
  const a = expandir(alvo.split(NUL).join(' ').split(ASPA).join(''))
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
  return resolve(dir, expandir(alvo.split(NUL).join(' ').split(ASPA).join('')))
}

// rodada 5.28 (1a): git que joga trabalho fora escrito de um jeito que a trava nao desfaz como o
// shell (variavel, $'..', $(...), crase, chaves, a lista do xargs, apelido por -c) barra: o criterio
// "barra o que nao entende" da D1 da 5.27 da bancada. A barra invertida o bash tira e o PowerShell
// guarda (caminho do Windows), entao a palavra com ela e lida dos dois jeitos
// 5.49 (D-bancada-git, 2026-11-03): no estrito da bancada sobra so o apelido por -c ou --config-env;
// sairam o naoLe (variavel, substituicao, crase, chaves), o xargs e a troca do -I, com o
// commitAntesDoTraco e o argumentosLidos, que so ele usava
const JULGADOS = new Set(['push', 'reset', 'clean', 'checkout', 'restore', 'switch', 'stash'])
export const MOTIVO_NAO_LE = 'usa um apelido do git, que a trava nao le com certeza, e pode jogar trabalho fora'
const BARRA = String.fromCharCode(92)
function semBarra(a) { return a.replace(/\\([\s\S])/g, '$1') }
const ehGit = p => nomeDoPrograma(p) === 'git' || (p.includes(BARRA) && nomeDoPrograma(semBarra(p)) === 'git')
// o git que vem como texto de outro programa (`grep -rn git $DIR`, `git log --grep git`, `xargs grep
// -l git`) fica so com as regras de antes da 5.28. O programa do pedaco e a primeira palavra, ou a
// primeira depois do xargs e das opcoes dele
const CITAM = new Set(['git', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'findstr', 'select-string', 'sls', 'echo', 'printf', 'write-output', 'write-host'])
function programaDoPedaco(palavras) {
  let k = 0
  if (nomeDoPrograma(palavras[0]) === 'xargs') {
    k = 1
    while (k < palavras.length && palavras[k].startsWith('-')) k += XARGS_COM_VALOR.test(palavras[k]) ? 2 : 1
  }
  return k
}

// 5.49 (bloco 6, 2026-11-03): todo MOTIVO_NAO_LE so volta com estrito (o porteiro da
// bancada); sem ele, o git com variavel segue pelas regras de antes da 5.28 (o --hard, o -f e o
// resto do bloco 7 continuam lidos). 5.49 (D-bancada-git, 2026-11-03): no estrito, so o apelido
function lerGit(args, dir, conta, deFora, citado, estrito) {
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
    if (estrito && !citado && (op === '-c' || nome === '--config-env') && /^alias\./i.test(valor)) return MOTIVO_NAO_LE
  }
  const verbo = args[i]
  const resto = args.slice(i + 1)
  if (!JULGADOS.has(verbo)) return null
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
function gitPerigoso(texto, cwd, estrito = false) {
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
    const programa = programaDoPedaco(palavras)
    while (i < palavras.length) {
      const nome = nomeDoPrograma(palavras[i])
      if (nome === 'xargs') deFora = true
      if (!ehGit(palavras[i])) { i++; continue }
      // o g\it so abre leitura no lugar do programa; no meio dos argumentos ele fica como na v5.24
      let fim = i + 1
      while (fim < palavras.length && nomeDoPrograma(palavras[fim]) !== 'git') fim++
      const args = palavras.slice(i + 1, fim)
      const citado = programa < i && CITAM.has(nomeDoPrograma(palavras[programa]))
      const motivo = lerGit(args, dir, conta, deFora, citado, estrito) ||
        (args.some(a => a.includes(BARRA)) ? lerGit(args.map(semBarra), dir, conta, deFora, citado, estrito) : null)
      if (motivo) return motivo
      i = fim
    }
  }
  return null
}
// 5.49 (bloco 8, 2026-11-03): sairam o curlPipePerigoso e o wgetPipePerigoso

// correcao 7: Remove-Item e os apelidos oficiais dele que nao sao "rm" (ver comentario
// da regra abaixo). So exige a ideia de recursivo (nunca -Force, doc na regra abaixo).
const RE_OPCAO_RECURSE = new RegExp(String.raw`\s${TRACO}r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b`, 'gi')
function removeItemPerigoso(comando) {
  return opcaoDepoisDaPalavra(textoDoComando(comando), RE_REMOVE_ITEM,
    RE_OPCAO_RECURSE, FIM_DO_COMANDO)
}

// rodada 5.39 (D54): o rm e apelido do Remove-Item no PowerShell do Windows, e a regra dele (r e f
// juntos, a do bash) deixava livres `rm -Recurse pasta`, `rm pasta -Recurse`, o traco no lugar do
// hifen e a forma com parentese, que na ferramenta PowerShell apagam a pasta sem perguntar. Opcao
// que so existe no PowerShell barra pelo mesmo caminho do Remove-Item: hifen com -re ate -recurse
// (o rm do bash recusa o -e) ou traco (U+2013 a U+2015) com -r ate -recurse (no bash vira nome de
// arquivo). O `rm -r pasta` de uma letra segue livre: no bash e seguro (correcao 1), e na
// ferramenta PowerShell pergunta ao aluno desde a 5.40 (perguntaDeApagar desde a 5.49). O `git rm` com essas opcoes barra a toa (o git
// recusa as duas). A opcao termina em espaco, fim ou pontuacao de comando: com o \b, `rm -re.txt`
// e `rm -- -recurse-backup.txt` (arquivo com hifen no nome) barravam a toa (Codex final da 5.39)
const RE_RM_COMANDO = nomeDeComando('rm')
const TRACO_SO_PS = '[' + String.fromCharCode(0x2013, 0x2014, 0x2015) + ']'
const RE_OPCAO_RECURSE_SO_PS = new RegExp(String.raw`\s(?:-re(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?|${TRACO_SO_PS}r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?)(?![\w.-])`, 'gi')
function rmDoPowershellPerigoso(comando) {
  return opcaoDepoisDaPalavra(textoDoComando(comando), RE_RM_COMANDO, RE_OPCAO_RECURSE_SO_PS, FIM_DO_COMANDO)
}

// rodada 5.43 (resto da 5.39): o nome entre aspas em posicao de comando roda o
// comando (`& "rm" -Recurse pasta` e `. "Remove-Item" -Recurse x` no PowerShell, `"rm" -rf pasta` no
// bash), e o limpo apagava o nome junto com as aspas. Antes das regras, o nome da familia do
// Remove-Item (com caminho na frente e .exe atras opcionais) perde as aspas quando vem no comeco, depois
// de ; & | ( { ou quebra de linha, com o operador ponto opcional. Nome partido por aspas (`r"m"`), atras
// de outro programa (`sudo "rm"`) ou em variavel segue de fora (furos nomeados na T51).
// Comum do chat 1: o caminho fica (tirar ele sumia com o `$(git reset --hard)` que roda antes), e
// depois do separador so espaco e tab, porque o \s relia cada quebra de linha seguinte (quadrado).
// Final do Codex: a aspa do outro tipo cabe no caminho (`"/home/O'Brien/rm"`) e sai como _, senao
// casava com uma aspa mais adiante e o limpo apagava a opcao junto
const NOME_APAGADOR = String.raw`(?:Remove-Item|ri|del|erase|rd|rmdir|rm)(?:\.exe)?`
const RE_NOME_ENTRE_ASPAS = new RegExp(String.raw`((?:^|[;&|\n({])[ \t]*(?:\.[ \t]*)?)(?:"((?:[^"\n]*[\\/])?${NOME_APAGADOR})"|'((?:[^'\n]*[\\/])?${NOME_APAGADOR})')(?=[\s;&|)]|$)`, 'gi')
function nomeDoApagadorSemAspas(comando) {
  return comando.replace(RE_NOME_ENTRE_ASPAS, (m, antes, duplas, simples) => antes + (duplas ?? simples).replace(/["']/g, '_'))
}

// rodada 5.40 (decisao 3 da 5.39): o `rm -r pasta` de uma letra segue livre no ehPerigoso (no bash
// e seguro), mas na ferramenta PowerShell e Remove-Item -Recurse e apaga a pasta sem perguntar. La
// o hook pergunta ao aluno (ver a entrada, no fim). Le o marcado palavra por palavra, como o git:
// o rm tem de ser o programa do comando (`git rm -r x` nao pergunta) e o alvo entre aspas sai
// inteiro. Descia em cada trecho entre aspas de quem executa (`Invoke-Expression "rm -r x"`) ate a
// 5.49 (bloco 9).
// Desde a 5.49 essa leitura e a perguntaDeApagar (perto do fim), pras tres ferramentas
const RE_OPCAO_R_PS = new RegExp(String.raw`^${TRACO}r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?(?::\S*)?$`, 'i')
const RE_COMECA_OPCAO = new RegExp('^' + TRACO)
// comum do chat 1 da 5.40: a atribuicao na frente roda o rm igual (`$x = rm -r pasta`, `$null=rm ...`),
// e sai pelo RE_ATRIBUICAO; e o valor de opcao nao e o alvo (`rm -r -ErrorAction SilentlyContinue pasta`): chave do Remove-Item
// (learn.microsoft.com/powershell/module/microsoft.powershell.management/remove-item) e comum dos
// cmdlets nao pede valor; -Path, -LiteralPath e os apelidos dele dao o alvo; o resto come a palavra
// seguinte. O nome pode vir abreviado, e o valor colado com dois pontos (`-Path:dados`)
const CHAVES_RM = ['recurse', 'force', 'whatif', 'confirm', 'verbose', 'debug']
const DAO_O_ALVO = ['path', 'literalpath', 'pspath', 'lp']
// as que pedem valor: as do Remove-Item e as comuns dos cmdlets, com os apelidos oficiais (about_CommonParameters)
const COM_VALOR_RM = ['filter', 'include', 'exclude', 'credential', 'stream', 'erroraction', 'warningaction', 'informationaction',
  'errorvariable', 'warningvariable', 'informationvariable', 'outvariable', 'outbuffer', 'pipelinevariable', 'progressaction']
const APELIDOS_COM_VALOR = ['ea', 'wa', 'infa', 'ev', 'wv', 'iv', 'ov', 'ob', 'pv', 'proga']
// o lado esquerdo e qualquer coisa que comeca com $ ou [ ate o primeiro = (`${x}`, `$x.y`, `$x[0]`,
// `$x, $y`, `[List[string]]$x`, `??=`). Sem = no meio, o [^=]* para no primeiro =: linear
const RE_ATRIBUICAO = /^\s*(?:[$[][^=]*=\s*)+/
// 5.49 (bloco 5, 2026-11-03): os alvos de todas as palavras soltas, nao so a primeira
// (`rm -rf a b`). A opcao do bash (`-rf`, `--force`) nao pede valor; final do Codex da 5.40: o caminho
// pode ser uma lista com virgula (`rm -r a, b`, `rm -r a ,b`), que liga uma palavra na outra
const RE_LETRAS_DO_RM = /^-[fivdIrR]+$/
function alvosDosArgs(args) {
  const soltos = []
  for (let j = 0; j < args.length; j++) {
    const a = args[j]
    if (a === '--') { for (const s of args.slice(j + 1)) soltos.push(s); break }
    if (a.startsWith('--')) continue
    if (!RE_COMECA_OPCAO.test(a)) { soltos.push(a); continue }
    const [nome, ...resto] = a.slice(1).toLowerCase().split(':')
    if (nome && DAO_O_ALVO.some(n => n.startsWith(nome))) {
      if (resto.length) soltos.push(a.slice(a.indexOf(':') + 1))
      else if (j + 1 < args.length) soltos.push(args[++j])
      continue
    }
    if (resto.length || RE_LETRAS_DO_RM.test(a) || (nome && CHAVES_RM.some(n => n.startsWith(nome)))) continue
    // 5.49 (bloco 5, revisao interna): so a opcao que pede valor come a palavra seguinte; a que a trava
    // nao conhece (o -x do rm do Mac, o -G do rimraf) pode ser seguida do alvo, entao vira null e pergunta
    if (APELIDOS_COM_VALOR.includes(nome) || (nome && COM_VALOR_RM.some(n => n.startsWith(nome)))) j++
    else soltos.push(null)
  }
  const lista = []
  for (const s of soltos) {
    const ultimo = lista[lista.length - 1]
    if (s !== null && typeof ultimo === 'string' && (ultimo.endsWith(',') || s.startsWith(','))) lista[lista.length - 1] += s
    else lista.push(s)
  }
  return lista.flatMap(s => s === null ? [null] : s.split(',').filter(p => p))
}
// segunda volta da comum: o operador ponto e o return na frente rodam o rm igual (o & ja separa
// comando), e a crase no fim da linha continua o comando na linha de baixo (`rm `+quebra+`-r pasta`).
// Final do Codex: o comentario de bloco (`<# ... #>`) some antes, por indexOf, pra entrada gigante
// seguir linear; o comentario sem fim come o resto, como no PowerShell. Segunda volta da final: o
// `<#` dentro de aspas e texto (`Write-Output '<#'; rm -r pasta`), entao a leitura pula as aspas
const ANTES_DO_PROGRAMA = new Set(['.', 'return', 'throw'])
function semComentarioDeBloco(texto) {
  let saida = ''
  let aspa = null
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspa) { if (c === aspa) aspa = null }
    else if (c === '"' || c === "'") aspa = c
    else if (c === '<' && texto[i + 1] === '#') {
      const fecha = texto.indexOf('#>', i + 2)
      if (fecha < 0) return saida
      saida += ' '
      i = fecha + 1
      continue
    }
    saida += c
  }
  return saida
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
// le o desaspado (lista APAGAR_NO_DESASPADO desde a 5.49): a chave pode vir entre aspas ("/MIR"), e o
// robocopy aceita o traco no lugar da barra (-MIR)
function robocopyPerigoso(comando) {
  return opcaoDepoisDaPalavra(comando, /(?<![\w\-.])robocopy(?:\.exe)?(?![\w\-.\/])/gi, /\s[\/-](?:mir|purge)(?!\w)/gi, FIM_DO_COMANDO)
}

// rodada 5.20 (N9): apagar por outro programa, as formas comuns (limite 6 no cabecalho).
// find e xargs no limpo; o codigo do node -e e do python -c mora entre aspas, entao esses
// dois leem o desaspado (lista APAGAR_NO_DESASPADO desde a 5.49). O codigo pode ter ;, | e quebra de
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
// 5.49 (bloco 11, 2026-11-03): saiu a leituraDeSegredo (cat, Get-Content, codigo inline,
// sqlite3, copia e download com cookie de .env, perfil, sessao, HAR e 2FA) e o que so ela usava

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
// 5.49 (bloco 9, 2026-11-03): sem a descida nas aspas, o powershell de dentro chega no mesmo
// trecho do de fora (`powershell -c "pwsh -e x"` vira `powershell -c pwsh -e x` no desaspado): cada
// powershell ou pwsh do trecho volta a ler as opcoes dele. Cada palavra e lida uma vez: linear
const RE_NOME_POWERSHELL = /\b(?:powershell|pwsh)(?:\.exe)?$/i
function encodedPerigoso(comando) {
  for (const m of comando.matchAll(RE_POWERSHELL)) {
    let lendo = true
    for (const token of m[1].split(/\s+/)) {
      if (RE_NOME_POWERSHELL.test(token)) { lendo = true; continue }
      if (!lendo) continue
      const opcao = RE_OPCAO.exec(token)
      if (!opcao) continue
      const nome = opcao[1].toLowerCase()
      if (nome === 'ec' || 'encodedcommand'.startsWith(nome)) return true
      if ('command'.startsWith(nome) || 'file'.startsWith(nome)) lendo = false
    }
  }
  return false
}

// 5.49 (bloco 8, 2026-11-03): sairam o downloadProIex, o iexDoDownload e o subshellPerigoso
// (com a linha do Homebrew liberada, que deixou de precisar). Fica o proximaDesde, do Start-Process:
// ele guarda a ultima resposta e so busca de novo quando a posicao passa dela, por isso as posicoes
// pedidas tem de crescer
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
const PERIGOS_POWERSHELL = [
  { teste: encodedPerigoso, regra: 'comando-escondido', motivo: 'roda um comando escondido em codigo que ninguem consegue ler' },
]
// rodada 5.17: as regras de disco leem o limpo (na lista PERIGOS) e o desaspado: format "D:"
// e o format.com do System32 chamado pelo caminho entre aspas tinham a letra ou o programa
// dentro das aspas
// 5.49 (bloco A, 2026-11-03): cada entrada ganhou a regra, o nome curto que a mensagem diz
const PERIGOS_DISCO = [
  { teste: formatPerigoso, regra: 'disco', motivo: 'apaga tudo do disco pra sempre' },
  { teste: discoPerigoso, regra: 'disco', motivo: 'apaga tudo do disco pra sempre' },
  { teste: discoUnixPerigoso, regra: 'disco', motivo: 'apaga tudo do disco pra sempre' },
  { teste: sombraPerigosa, regra: 'disco', motivo: 'apaga as copias de seguranca do Windows (versoes anteriores e pontos de restauracao) pra sempre' },
]

// as regras de git (push forcado ou apagando branch, reset --hard, checkout e restore na
// pasta inteira, checkout -f, switch --discard-changes, clean, stash clear e drop) moram no
// gitPerigoso, que le o marcado (ver ehPerigoso), com a regra git-joga-fora. --force-with-lease
// e a variante segura (nao sobrescreve o que outra pessoa subiu) e segue livre: barrar ela
// empurraria o aluno avancado a desligar a trava inteira. O git clean barra com -f (ou --force)
// junto de -d, -x ou -X, e o -n (--dry-run) so simula. Um arquivo so (git checkout --
// arquivo.txt, git restore arquivo.txt) continua liberado.
// 5.49 (2026-11-03): sairam daqui as regras de apagar (bloco 5, foram pra APAGAR, que
// pergunta), o curl e o wget com pipe pro shell (bloco 8) e o chmod 777 (bloco 9)
const PERIGOS = [
  ...PERIGOS_DISCO,
  ...PERIGOS_POWERSHELL,
]
const MOTIVOS_GIT = [MOTIVO_HISTORICO, MOTIVO_APAGA_REMOTO, MOTIVO_SEM_SALVAR, MOTIVO_PASTA, MOTIVO_CLEAN, MOTIVO_STASH, MOTIVO_NAO_LE]
// 5.49 (bloco 4, 2026-11-03): saiu o "quebre o comando em partes menores", que mandava refazer
// por outro caminho logo antes do fim da mensagem, que manda nao refazer
const MOTIVO_ERRO_INTERNO = 'a trava nao conseguiu ler este comando (erro dentro dela)'
// o ehPerigoso devolve so o motivo (quem importa ja usa assim); a regra sai do motivo
const REGRA_DO_MOTIVO = new Map([...MOTIVOS_GIT.map(m => [m, 'git-joga-fora']), ...PERIGOS.map(p => [p.motivo, p.regra]),
  [MOTIVO_ERRO_INTERNO, 'erro-interno']])

function testarPadroes(comando, lista = PERIGOS) {
  for (const p of lista) if (p.teste(comando)) return p.motivo
  return null
}

// 5.49 (bloco 5, 2026-11-03): as regras de apagar, que o ehPerigoso deixou de ler. Quem le e
// a perguntaDeApagar (perto do fim): as de APAGAR_COM_ALVO tem o alvo lido palavra por palavra
// (alvosDoPedaco), e as outras perguntam "uma pasta" (o alvo vem do pipe, de outro programa ou do codigo)
const REGRA_APAGAR = 'apagar-pasta'
const APAGAR_COM_ALVO = [
  { teste: rmPerigoso, regra: REGRA_APAGAR },
  // rm com opcao que so o PowerShell tem: ver rmDoPowershellPerigoso
  { teste: rmDoPowershellPerigoso, regra: REGRA_APAGAR },
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
  { teste: removeItemPerigoso, regra: REGRA_APAGAR },
  { teste: rdPerigoso, regra: REGRA_APAGAR },
  // del e erase com /s: ver delPerigoso
  { teste: delPerigoso, regra: REGRA_APAGAR },
  { teste: apagadorDePacote, regra: REGRA_APAGAR },
]
const APAGAR_SEM_ALVO = [
  // correcao 7 (quinta revisao): a regra anterior exigia "Get-ChildItem" literal antes
  // do pipe, mas gci/dir/ls sao apelidos oficiais dela (doc: "PowerShell includes the
  // following aliases for Get-ChildItem: All platforms: dir, gci; Windows: ls") e
  // qualquer outro comando podia estar do lado esquerdo. Agora aceita qualquer coisa
  // antes do "|" e olha so o que vem depois: um apelido de Remove-Item direto no pipe,
  // ou um ForEach-Object (apelidos oficiais "%" e "foreach", doc: "PowerShell includes
  // the following aliases for ForEach-Object: All Platforms: %, foreach") cujo bloco
  // chama Remove-Item pra cada item, tipo `Get-ChildItem -Recurse | %{ Remove-Item $_ }`
  { teste: removeItemPipePerigoso, regra: REGRA_APAGAR },
  { teste: findPerigoso, regra: REGRA_APAGAR },
  { teste: xargsApaga, regra: REGRA_APAGAR },
  { teste: dotnetApaga, regra: REGRA_APAGAR },
]
// regras que leem o desaspado (o que importa pode estar entre aspas); o texto de quem so
// escreve (echo "...") ja saiu dele
const APAGAR_NO_DESASPADO = [
  { teste: robocopyPerigoso, regra: REGRA_APAGAR },
  { teste: nodeApaga, regra: REGRA_APAGAR },
  { teste: pythonApaga, regra: REGRA_APAGAR },
  { teste: clearContentPerigoso, regra: REGRA_APAGAR },
]

// rodada 5.20 (N2): Start-Process com -ArgumentList em lista ('/c','rd','/s' ou /c,rd,/s,
// com ou sem @( )) chegava picotado: o limpo perde o que esta entre aspas, cada suspeito tem
// uma palavra so, e o desaspado fica com virgula no lugar do espaco. Aqui o trecho depois do
// Start-Process (ate o fim do comando ou o proximo Start-Process) volta a ser uma linha so, com
// espaco no lugar da virgula, e passa pelo ehPerigoso inteiro como mais um suspeito. Le o
// desaspado, nao o comando cru, pra o texto de quem so escreve (echo "...") seguir livre.
// O trecho e sempre mais curto que o comando (perde ao menos o nome), entao a recursao termina
const RE_START_PROCESS = /(?<![\w\-.])(?:Start-Process|saps|start)(?![\w\-.])/gi
const RE_OPCAO_DO_START = /(?<![\w\-.])-(?:ArgumentList|Args|FilePath|Wait|NoNewWindow|PassThru|(?:Verb|WindowStyle)\s+\S+)(?![\w\-.])/gi
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
    // lista com virgula ou dentro de @( ), que no PowerShell pode ter um item por linha sem virgula.
    // 5.49 (regressao contra a v5.40, 2026-11-04): a lista de uma string so (`Start-Process cmd.exe
    // -ArgumentList "/c git reset --hard"`) tambem volta, sem os nomes das opcoes do Start-Process, porque
    // o trecho entre aspas deixou de ser lido como comando e ela passava calada. 5.49 (Codex comum, terceira,
    // 2026-11-04): so quando o programa executa comando (cmd, shell, git, lancador): pro notepad o texto e
    // nome de arquivo (`Start-Process notepad -ArgumentList "git reset --hard"` barrava a toa)
    // 5.52 (chat 2, Task 2c, 2026-11-05, revisao interna): a lista tambem sai sem os nomes das opcoes, senao o
    // -ArgumentList ficava no lugar do /c e o cmd da lista nao era lido (`-ArgumentList '/c','@git ...'` passava)
    if (/[,(]/.test(trecho)) { remontados.push(trecho.replace(/@\(|[,()]/g, ' ').replace(RE_OPCAO_DO_START, ' ')); return }
    const resto = trecho.replace(RE_OPCAO_DO_START, ' ')
    const programa = nomeDoPrograma((resto.match(/[^\s]+/) || [''])[0])
    if (ehExecutor(programa) || LANCADORES.has(programa) || LANCADORES_DO_EMBRULHO.has(programa) || PREFIXOS_DO_SHELL.has(programa)) remontados.push(resto)
  })
  return remontados
}

// 5.49 (D-embrulho, 2026-11-03): o trecho entre aspas volta a ser lido como comando so quando o
// programa que o recebe executa comando: bash, sh, zsh e dash com -c (com opcao antes: --login -c,
// -lc), cmd com /c ou /k, powershell e pwsh com -Command, -c ou outra abreviacao, Invoke-Expression,
// iex e eval. Texto citado por outro programa (gh issue --body, git commit -m, echo, node x.mjs "...")
// segue sem ser lido. 5.49 (D-apelido, 2026-11-03): o apelido do git que roda outro programa
// (-c alias.x='!comando') tem o comando lido do mesmo jeito; o git roda esse comando na raiz do
// repositorio, entao o alvo relativo de dentro dele a trava nao le. Cada palavra e lida uma vez
const SEPARADORES_DO_SHELL = new Set([';', '&', '|', '\n', '(', ')', '{', '}', '`'])
// divide em comandos simples, cada um com as palavras sem as aspas; aspas=true na palavra que e um
// trecho entre aspas inteiro. A aspa sem par e texto, como no classificarTrechosEntreAspas.
// 5.49 (D-embrulho, 2026-11-03, revisao interna): dentro das aspas duplas, a barra invertida antes de
// aspa dupla, barra invertida, crase ou cifrao escapa (`bash -c "rm -rf \"minha pasta\""`), como no bash;
// a aspa escapada fora das aspas e texto
const ESCAPA_NAS_DUPLAS = new Set(['"', BARRA, '`', '$'])
function fimDasAspas(texto, i) {
  const c = texto[i]
  for (let j = i + 1; j < texto.length; j++) {
    if (c === '"' && texto[j] === BARRA && ESCAPA_NAS_DUPLAS.has(texto[j + 1])) { j++; continue }
    if (texto[j] === c) return j
  }
  return -1
}
// 5.49 (Codex comum, aspas emendadas, 2026-11-04): o pedaco entre aspas emendado em outro (`bash -c 'rm -rf
// '"pasta"`, `bash -c rm' -rf pasta'`) e uma palavra so, como no bash, e segue palavra entre aspas: antes a
// emenda zerava o tipo e o embrulho nao era lido. O tipo da emendada e '"' so quando todo pedaco o shell de
// fora expande (aspas duplas sem o $ escapado, ou solto sem barra invertida), senao "'", pra aspa simples
// literal na temporaria seguir perguntando. O ps guarda a palavra como o PowerShell a parte (medido no pwsh
// 7.6 e no powershell.exe 5.1 em 2026-11-04): a palavra que comeca em aspas acaba na aspa que fecha, e o
// pedaco colado depois comeca outra (`'a '"b"` sao duas); a que comeca solta segue emendando (`a' b'` e uma)
// 5.49 (Codex comum, aspas emendadas, revisao interna, 2026-11-04): barra=true le a palavra como o bash
// (medido no Git Bash em 2026-11-04): a barra invertida fora das aspas escapa o caractere seguinte, que entra
// como literal (`'git reset '\''--hard'\''`, `git\ reset\ --hard` sao uma palavra so), a barra antes da quebra
// de linha some, o $'...' (ANSI-C) tira o $ e troca os escapes, e o $"..." e aspa dupla. No PowerShell nada
// disso vale (`$'x'` chega como `$x`, `a\ b` sao duas palavras com a barra), entao e uma leitura a mais (ver embrulhados)
const ESCAPES_ANSI = { a: 7, b: 8, e: 27, E: 27, f: 12, n: 10, r: 13, t: 9, v: 11 }
const RE_ESCAPE_ANSI = new RegExp(BARRA + BARRA + '(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|U[0-9a-fA-F]{1,8}|[0-7]{1,3}|c[^]|[^])', 'g')
const ansiC = s => s.replace(RE_ESCAPE_ANSI, (todo, e) => {
  if (e in ESCAPES_ANSI) return String.fromCharCode(ESCAPES_ANSI[e])
  if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8) & 255)
  if (e.length > 1 && e[0] !== 'c') { const n = parseInt(e.slice(1), 16); return n <= 0x10ffff ? String.fromCodePoint(n) : '' }
  if (e.length > 1) return String.fromCharCode(e.charCodeAt(1) & 31)
  return ("'" + '"?' + BARRA).includes(e) ? e : todo
})
function fimDoAnsi(texto, i) {
  for (let j = i + 1; j < texto.length; j++) {
    if (texto[j] === BARRA) j++
    else if (texto[j] === "'") return j
  }
  return -1
}
function comandosSimples(texto, barra = false) {
  const comandos = [[]]
  let palavra = null
  const fecha = () => { if (palavra) comandos[comandos.length - 1].push(palavra); palavra = null }
  const junta = (t, aspas) => {
    const expande = aspas === '"' || (!aspas && t !== BARRA)
    if (!palavra) { palavra = { t, aspas, expande, ps: [{ t, aspas, expande }], fechou: !!aspas }; return }
    palavra.t += t
    palavra.expande = palavra.expande && expande
    if (aspas || palavra.aspas) palavra.aspas = palavra.expande ? '"' : "'"
    const ultimo = palavra.ps[palavra.ps.length - 1]
    if (palavra.fechou) { palavra.ps.push({ t, aspas, expande }); palavra.fechou = !!aspas; return }
    ultimo.t += t
    ultimo.expande = ultimo.expande && expande
    if (aspas) ultimo.aspas = ultimo.aspas || aspas
  }
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (barra && c === BARRA && i + 1 < texto.length) {
      if (texto[i + 1] !== '\n') junta(texto[i + 1], "'")
      i++
      continue
    }
    if (barra && c === '$' && texto[i + 1] === "'") {
      const fim = fimDoAnsi(texto, i + 1)
      if (fim >= 0) { junta(ansiC(texto.slice(i + 2, fim)), "'"); i = fim; continue }
    }
    if (barra && c === '$' && texto[i + 1] === '"' && fimDasAspas(texto, i + 1) >= 0) continue
    const escapada = !barra && i > 0 && texto[i - 1] === BARRA && !(i > 1 && texto[i - 2] === BARRA)
    const par = (c === '"' || c === "'") && !escapada ? fimDasAspas(texto, i) : -1
    if (par >= 0) {
      let conteudo = texto.slice(i + 1, par)
      if (c === '"') conteudo = conteudo.replace(new RegExp(BARRA + BARRA + '([' + BARRA + BARRA + '"`$])', 'g'), '$1')
      // aspas guarda qual aspa (ver lerApagar); a dupla com o $ escapado dentro vira 'escapada', porque
      // nela o shell de fora deixou alguma variavel sem trocar
      junta(conteudo, c === '"' && texto.slice(i + 1, par).includes(BARRA + '$') ? 'escapada' : c)
      i = par
    } else if (SEPARADORES_DO_SHELL.has(c)) { fecha(); comandos.push([]) }
    else if (/\s/.test(c)) fecha()
    else junta(c, false)
  }
  fecha()
  return comandos
}
const OPCAO_DO_SHELL_COM_VALOR = new Set(['-o', '+o', '-O', '+O', '--rcfile', '--init-file'])
// cada leitor de opcao diz 'executa' (o trecho entre aspas de depois e comando), 'para' (o resto e
// de um script), 'valor' (a palavra seguinte e o valor da opcao) ou 'pasta' (o valor e a pasta onde
// o comando roda); undefined segue lendo. umSo: so a primeira palavra depois das opcoes e o comando.
// shell: o shell que le o trecho, pra conta da temporaria (ver foraDoShell).
// 5.49 (D-embrulho, 2026-11-03, revisao interna): o powershell.exe (nao o pwsh, cujo padrao e o -File) roda
// como comando o primeiro trecho entre aspas solto (`powershell -NoProfile "..."`), e os dois aceitam o
// traco duplo (`pwsh --command "..."`)
const opcaoDoPowershell = posicional => (a, aspas) => {
  const o = RE_OPCAO.exec(a.startsWith('--') ? a.slice(1) : a)
  if (!o) return posicional && aspas ? 'comando' : undefined
  const n = o[1].toLowerCase()
  if ('command'.startsWith(n)) return 'executa'
  if ('file'.startsWith(n)) return 'para'
  return n === 'wd' || (n.length >= 2 && 'workingdirectory'.startsWith(n)) ? 'pasta' : undefined
}
// 5.49 (D-embrulho, 2026-11-03, quarta leva): quem recebe o comando inteiro e o entrega a um shell sem
// shell na frente. su, runuser, script e flock rodam o valor do -c (ou --command=) num shell; o ssh
// junta o resto da linha depois do host e roda no shell da outra maquina; o watch junta o resto da
// linha e roda num sh -c. Leitura das opcoes no jeito do getopt: a letra que pede valor come o resto
// da palavra ou a palavra seguinte. Devolve ['colado', valor] quando o comando vem colado na opcao
// (-cVALOR, --command=VALOR); o 'executa' de quem tem valorDoC le so a palavra seguinte. O posicional decide o que a palavra sem traco e (st guarda o estado de um so programa); o
// login (su -, -l, --login) troca a pasta, e o alvo relativo de dentro vira "uma pasta"
// 5.49 (D-embrulho, 2026-11-03, quarta leva, revisao interna): o getopt_long aceita o comeco unico da
// opcao longa (`su --comm`, `watch --inter 5`), e o comeco conta a partir de `--x`. O duplo diz o que
// vem depois do `--`: 'para' (o resto e de outro programa), 'posicional' (ssh e watch: a palavra com
// traco tambem e host ou comando) ou 'shell' (su e runuser: o que vem depois do usuario vai pro
// shell, e o `-c` dele roda a palavra seguinte, `su root -- -c "..."`)
const opcaoGetopt = ({ comando = '', valor = '', longasComando = [], longasValor = [], login = '', duplo = 'para', posicional }) =>
  (a, aspas, ctx, st) => {
    if (st.fim === 'posicional') return posicional(st)
    if (st.fim === 'shell') return posicional(st) || (/^-[A-Za-z]+$/.test(a) && a.includes('c') ? 'executa' : undefined)
    if (a === '--') { if (duplo === 'para') return 'para'; st.fim = duplo; return undefined }
    if (a.startsWith('--')) {
      const [nome, ...resto] = a.split('=')
      const casa = l => nome.length >= 3 && l.startsWith(nome)
      if (login && casa('--login')) ctx.outraPasta = true
      if (longasComando.some(casa)) return resto.length ? ['colado', resto.join('=')] : 'executa'
      if (longasValor.some(casa) && !resto.length) { st.longas = (st.longas || '') + longasValor.find(casa); return 'valor' }
      return undefined
    }
    if (a === '-') { if (login) ctx.outraPasta = true; return undefined }
    if (/^-[A-Za-z0-9]/.test(a)) {
      const { letras, pedeValor } = letrasCurtas(a, comando + valor)
      st.letras = (st.letras || '') + letras
      if (login && [...letras].some(l => login.includes(l))) ctx.outraPasta = true
      if (comando.includes(letras[letras.length - 1])) return pedeValor ? 'executa' : ['colado', a.slice(letras.length + 1)]
      return pedeValor ? 'valor' : undefined
    }
    return posicional(st)
  }
const SU = { comando: 'c', valor: 'sgGw', longasComando: ['--command', '--session-command'], login: 'l', duplo: 'shell',
  longasValor: ['--shell', '--group', '--supp-group', '--whitelist-environment'], posicional: () => undefined }
const EXECUTORES = [
  { nomes: ['bash', 'sh', 'zsh', 'dash'], umSo: true, shell: 'Bash', opcao: a => /^-[a-zA-Z]+$/.test(a) && a.includes('c') ? 'executa'
    : OPCAO_DO_SHELL_COM_VALOR.has(a) ? 'valor' : /^[-+]/.test(a) ? undefined : 'para' },
  { nomes: ['su'], valorDoC: true, shell: 'Bash', opcao: opcaoGetopt(SU) },
  // o runuser com -u roda o programa direto, sem shell: a palavra sem traco depois dele e o programa
  { nomes: ['runuser'], valorDoC: true, shell: 'Bash', opcao: opcaoGetopt({ ...SU, valor: SU.valor + 'u',
    longasValor: [...SU.longasValor, '--user'], posicional: st => /u/.test(st.letras || '') || /--user/.test(st.longas || '') ? 'para' : undefined }) },
  { nomes: ['script'], valorDoC: true, shell: 'Bash', opcao: opcaoGetopt({ comando: 'c', valor: 'EIOBTmo', longasComando: ['--command'],
    longasValor: ['--echo', '--log-in', '--log-out', '--log-io', '--log-timing', '--logging-format', '--output-limit'], posicional: () => undefined }) },
  // flock <arquivo> -c "..." roda num shell; flock <arquivo> programa roda o programa direto
  { nomes: ['flock'], valorDoC: true, shell: 'Bash', opcao: opcaoGetopt({ comando: 'c', valor: 'wE', longasComando: ['--command'],
    longasValor: ['--timeout', '--wait', '--conflict-exit-code'], posicional: st => st.arquivo ? 'para' : (st.arquivo = true, undefined) }) },
  { nomes: ['ssh'], junta: true, remoto: true, shell: 'Bash', opcao: opcaoGetopt({ valor: 'BbcDEeFIiJLlmOoPpQRSWw', duplo: 'posicional',
    posicional: st => st.host ? 'comando' : (st.host = true, undefined) }) },
  { nomes: ['watch'], junta: true, shell: 'Bash', opcao: opcaoGetopt({ valor: 'nqs', duplo: 'posicional',
    longasValor: ['--interval', '--equexit', '--shotsdir'], posicional: () => 'comando' }) },
  // 5.49 (Codex comum, aspas emendadas, revisao interna, 2026-11-04): no Git Bash o `cmd //c` e o `cmd /c` (o MSYS
  // troca a barra dobrada do comeco por uma, medido em 2026-11-04); vindo do PowerShell o cmd recebe o //c e
  // abre o prompt sem rodar nada, entao o //c so vale quando o comando veio do bash (ctx.bash)
  { nomes: ['cmd'], shell: 'cmd', opcao: (a, aspas, ctx) => (ctx.bash ? /^\/\/?[ckr]$/i : /^\/[ckr]$/i).test(a) ? 'executa' : a.startsWith('/') ? undefined : 'para' },
  { nomes: ['powershell'], shell: 'PowerShell', opcao: opcaoDoPowershell(true) },
  { nomes: ['pwsh'], shell: 'PowerShell', opcao: opcaoDoPowershell(false) },
  { nomes: ['invoke-expression', 'iex'], shell: 'PowerShell' },
  { nomes: ['eval'], shell: 'Bash' },
]
// 5.49 (Codex comum, 2026-11-04): o cmd.exe le as chaves dele sem espaco entre elas nem antes do
// comando (`cmd /d/c "..."`, `cmd /c"..."`, `cmd /cgit reset --hard`, `cmd/c`), em qualquer caixa, com o
// /r como sinonimo do /c e com /a, /u, /q, /d, /s, /x, /y, /e:on, /v:on, /f:off e /t:fg antes (a v5.39
// barrava as formas grudadas pela descida em toda aspa). Devolve o comando com cada chave do cmd
// separada ate a /c, /k ou /r, ou o proprio comando quando nada esta grudado, entao a segunda volta
// devolve o mesmo texto. Entra como leitura a mais, depois da do comando como veio (T55). Logo depois
// do /c o comando de dentro comeca, e o cmd de la (`cmd/ccmd/c...`) se le na mesma volta, pelo tempo linear.
// Revisao interna da comum: o nome entre aspas tambem conta (`"cmd" /c"..."`, o caminho do cmd.exe entre aspas
// com `/d/c "..."`); o =, a virgula e o @ logo depois do /c o cmd pula (`cmd /c=git`, `cmd /d/c@git`, `cmd /c @git`);
// e o cmd grudado so se le na posicao de programa (comeco, depois de separador, de aspa que abre, de quem
// lanca programa ou do /c de outro cmd) ou com o comando de dentro entre aspas (`sudo -u x cmd /d/c "..."`),
// porque `rm -rf cmd/cache` e `rm -rf $TMPDIR/cmd/cache` sao pasta. 5.49 (Codex comum, 2026-11-04): o caminho
// entre aspas aceita espaco (`& "<disco>/Program Files/../Windows/System32/cmd.exe" /c"..."`): cada aspa que abre
// le so ate a proxima, e a entrada gigante segue linear
const RE_NOME_DO_CMD = /(?<=^|[\s;&|()"'`])(?:"(?:[^"]*[\\\/])?cmd(?:\.exe)?"|'(?:[^']*[\\\/])?cmd(?:\.exe)?'|(?:[^\s;&|()"'`]*[\\\/])?cmd(?:\.exe)?)(?=[\s\/])/gi
// o cmd que comeca o comando de dentro, tambem entre aspas e depois de espaco (`"cmd" /c"cmd" /c...`): sem
// ele aqui, cada volta da leitura a mais separava um so e a entrada gigante ficava quadratica. Sem aspas,
// so o nome, sem caminho na frente: o caminho comeria o resto (`cmd/ccmd/c...`) a cada volta
const RE_CMD_LOGO_DEPOIS = /\s*(?:"(?:[^"]*[\\\/])?cmd(?:\.exe)?"|'(?:[^']*[\\\/])?cmd(?:\.exe)?'|cmd(?:\.exe)?)(?=[\s\/])/iy
// a barra dobrada e a do Git Bash (`cmd //cgit reset --hard` roda, medido em 2026-11-04; ver EXECUTORES)
const RE_CHAVE_DO_CMD = /^\/\/?([a-z])(?::[a-z0-9]*)?/i
const RE_CHAVES_ATE_O_C = /(?:^|cmd(?:\.exe)?)(?:\/[a-z](?::[a-z0-9]*)?)*\/[ckr]$/i
const lancaPrograma = p => {
  const n = nomeDoPrograma(p)
  return p === '&' || ANTES_DO_PROGRAMA.has(p.toLowerCase()) || LANCADORES.has(n) || PREFIXOS_DO_SHELL.has(n) ||
    LANCADORES_DO_EMBRULHO.has(n) || n === 'start' || n === 'call' || RE_CHAVES_ATE_O_C.test(p)
}
function naPosicaoDePrograma(texto, i) {
  let k = i
  while (k > 0 && /\s/.test(texto[k - 1])) { if (texto[k - 1] === '\n') return true; k-- }
  if (k === 0) return true
  const c = texto[k - 1]
  if (';&|({'.includes(c)) return true
  // a aspa colada no nome so conta depois do /c de outro cmd (`cmd /c"cmd/c..."`): o trecho de quem
  // executa (`bash -c "cmd/c..."`) a leitura do embrulho le de novo, com o cmd no comeco, e a aspa de
  // argumento (`Remove-Item "cmd/cache"`) ou a que fecha (`"$TMPDIR"/cmd/cache`) e de pasta
  if (k === i && (c === '"' || c === "'" || c === '`')) return RE_CHAVES_ATE_O_C.test(texto.slice(Math.max(0, k - 40), k - 1))
  let w = k
  while (w > 0 && !/[\s;&|(]/.test(texto[w - 1])) w--
  return lancaPrograma(texto.slice(w, k))
}
// 5.49 (Codex comum, terceira, 2026-11-04): a variavel do cmd.exe com as chaves grudadas (`& $env:ComSpec
// /d/c "..."`, `& ${env:ComSpec} /c"..."`) e o proprio cmd, que roda essa forma (a v5.40 barrava); o nome fica
// mais curto, entao a recursao termina
const RE_COMSPEC_NO_TEXTO = /[$][{](?:env:)?comspec[}]|[$](?:env:)?comspec(?![A-Za-z0-9_:])|%comspec%/gi
function cmdComChavesSeparadas(texto) {
  texto = texto.replace(RE_COMSPEC_NO_TEXTO, 'cmd')
  if (!/cmd/i.test(texto)) return texto
  let saida = ''
  let desde = 0
  let pos = 0
  let logoDepois = false
  for (;;) {
    let m = null
    if (logoDepois) { RE_CMD_LOGO_DEPOIS.lastIndex = pos; m = RE_CMD_LOGO_DEPOIS.exec(texto) }
    const programa = !!m
    if (!m) { RE_NOME_DO_CMD.lastIndex = pos; m = RE_NOME_DO_CMD.exec(texto) }
    logoDepois = false
    if (!m) break
    const fimDoNome = m.index + m[0].length
    pos = fimDoNome
    let grudado = texto[fimDoNome] === '/'
    const chaves = []
    let j = fimDoNome
    let achou = false
    for (;;) {
      let k = j
      while (k < texto.length && /\s/.test(texto[k])) k++
      const c = RE_CHAVE_DO_CMD.exec(texto.slice(k, k + 16))
      if (!c) break
      chaves.push(c[0])
      j = k + c[0].length
      if (j < texto.length && !/\s/.test(texto[j])) grudado = true
      if (/[ckr]/i.test(c[1])) { achou = true; break }
    }
    if (!achou) continue
    let d = j
    while (d < texto.length && /[\s=,@]/.test(texto[d])) d++
    if (/[=,@]/.test(texto.slice(j, d))) { grudado = true; j = d }
    if (!grudado) continue
    if (!programa && !naPosicaoDePrograma(texto, m.index) && !/["']/.test(texto[d] || '')) continue
    saida += texto.slice(desde, fimDoNome) + ' ' + chaves.join(' ') + ' '
    desde = j
    pos = j
    logoDepois = true
  }
  return saida + texto.slice(desde)
}
// Revisao interna da comum (2026-11-04): a barra invertida antes da aspa que fecha (`cmd /c "rd /s /q C:\"`)
// e caractere no PowerShell e no cmd, e a leitura de quem executa tomava a aspa por escapada, como no
// bash, e perdia o comando de dentro (a v5.39 e a v5.40 barram). Leitura a mais com um espaco entre a
// barra e a aspa, que entao nao escapa; no bash o comando nem roda (a aspa fica aberta), entao so a barra
// do git e a pergunta fora do bash a leem
const RE_BARRA_NA_ASPA = /(?<=[^\s\\])\\(["'])(?=[\s;&|)]|$)/g
const semBarraNaAspa = texto => texto.includes('\\') ? texto.replace(RE_BARRA_NA_ASPA, '\\ $1') : texto
const leiturasAMais = (comando, comBarra = true) =>
  [...new Set([cmdComChavesSeparadas(comando), ...(comBarra ? [semBarraNaAspa(comando)] : [])])].filter(t => t !== comando)
// 5.52 (chat 2, Task 2c, 2026-11-05): no cmd o @ na frente do comando so tira o eco, e o comando roda igual
// (`cmd /c "@git reset --hard"`, `cmd /c "echo a & @git ..."`, `(@git ...)`, `@@git`, passavam calados). No
// trecho que o cmd roda, o @ do comeco e o de depois de &, &&, || e ( saem numa leitura a mais (T55); fora do
// cmd o @ fica (`bash -c "@git reset --hard"` nao acha o programa @git). O texto fica mais curto, entao a
// recursao termina. 5.52 (chat 2, Task 2c, 2026-11-05, revisao interna): o cmd pula tambem ; , = antes do
// comando (`cmd /c ";@git ..."`, `echo a & ,@git ...`), que saem junto do @, e no trecho com if ou for o @ de depois do espaco sai
// (`for %i in (1) do @git ...`, `if 1==1 @git ...`, `else @git ...`); sem if nem for, `echo @git` segue calado
const RE_ARROBA_DO_CMD = /(^|[&|(])([\s;,=]*)@+/g
// 5.52 (chat 2, Task 2c, Codex comum): o cmd aceita o if e o for grudados no ( e na / (`if(1)==(1) @git ...`, `for/l`)
const RE_IF_FOR_DO_CMD = /(^|[\s&|(;,=@])(if|for)(?=[\s(/])/i
const semArrobaDoCmd = (comando, shell) => {
  if (shell !== 'cmd' || !comando.includes('@')) return comando
  const texto = comando.replace(RE_ARROBA_DO_CMD, '$1 ')
  return RE_IF_FOR_DO_CMD.test(texto) ? texto.replace(/(\s)@+/g, '$1') : texto
}
const RE_APELIDO_QUE_RODA = /^alias\.[^=]*=!([\s\S]*)$/i
// 5.49 (D-embrulho, 2026-11-03, revisao interna): quem lanca outro programa na frente do executor
// (`timeout 60 bash -c`, `nice -n 5 bash -c`, `xargs -0 bash -c`, `wsl -d Ubuntu bash -c`). Depois dele
// pula a opcao, o valor dela e o numero, ate achar o nome de um executor ou do git
const LANCADORES_DO_EMBRULHO = new Set(['timeout', 'nice', 'xargs', 'wsl', 'ionice', 'stdbuf'])
const ehExecutor = nome => nome === 'git' || EXECUTORES.some(e => e.nomes.includes(nome))
// 5.49 (D-embrulho, 2026-11-03, frente A): o lancador fora da lista (`chrt 5 bash -c`, `taskset -c 0`, `setsid`,
// `su -c`, `gdb --args`, `firejail`...) deixava o embrulho sem leitura. Sem lista fechada: depois do
// primeiro programa que nao executa comando, a primeira palavra que e o nome de um executor com
// opcao (bash, sh, zsh, dash, cmd, powershell, pwsh) ou do git volta a ser lida como comando, e a
// leitura das opcoes dele decide se o trecho entre aspas roda (`echo bash "x"` passa, `echo bash -c
// "rm -rf x"` pergunta). O nome entre aspas conta, como no comeco do comando (`chrt 5 "bash" -c`); o
// trecho entre aspas que nao e so o nome segue texto. O eval e o iex ficam so no comeco: sao do
// proprio shell, e nenhum programa de fora os lanca
// 5.49 (D-embrulho, 2026-11-03, frente A, revisao interna): o nome achado no meio pode ser so o valor
// de uma opcao (o usuario em `sudo -u git bash -c`, o conteiner em `docker run --name sh img bash -c`) ou
// um executor que roda script (`chrt 5 sh run.sh bash -c`). Por isso o git achado no meio e o executor
// que nao executou seguem procurando depois de onde a leitura deles parou (ctx.noMeio); o git do
// comeco do comando le so o git (`git commit -m bash -c "..."` segue calado)
const ehExecutorLancavel = nome => nome === 'git' || EXECUTORES.some(e => e.opcao && e.nomes.includes(nome))
function proximoExecutor(palavras, k, ctx) {
  for (let j = k + 1; j < palavras.length; j++) if (ehExecutorLancavel(nomeDoPrograma(palavras[j].t))) { ctx.noMeio = true; return j }
  return -1
}
// powershell: o comando veio do PowerShell (ou de shell que a trava nao sabe), e a palavra emendada tambem
// se le partida como ele a parte (ver comandosSimples)
// bash: o comando veio do bash (ou de shell que a trava nao sabe), e a palavra tambem se le como o bash a le
// (ver comandosSimples), numa segunda volta so quando o comando tem barra invertida, $' ou $"; no Bash e no
// Monitor (powershell falso) so essa volta vale
function embrulhados(comando, powershell = true, bash = true) {
  const saida = []
  // 5.49 (regressao contra a v5.40, 2026-11-04): a chave e separador no comandosSimples, entao o cmd pela
  // variavel com chaves (`& ${env:ComSpec} /c "..."`, `${COMSPEC}`) perde as chaves antes de ser lido
  comando = comando.replace(/[$][{]((?:env:)?comspec)[}]/gi, '$$$1')
  const comoBash = bash && (comando.includes(BARRA) || /\$['"]/.test(comando))
  const leituras = []
  if (powershell || !comoBash) leituras.push([comandosSimples(comando), powershell])
  if (comoBash) leituras.push([comandosSimples(comando, true), false])
  for (const [comandos, partida] of leituras) {
    for (const palavras of comandos) {
      // o cmd /c, o powershell -c e o iex que comecam sem aspas voltam aqui com o k no comando de dentro;
      // o k so cresce, entao cada palavra e lida uma vez
      const ctx = { outraPasta: false, ultimaAspas: palavras.findLastIndex(p => p.aspas), powershell: partida, bash }
      for (let k = 0; k >= 0 && k < palavras.length;) k = lerEmbrulho(palavras, k, saida, ctx)
    }
  }
  return saida
}
// le o comando simples desde a palavra k; devolve onde o comando de dentro comeca, ou -1
function lerEmbrulho(palavras, k, saida, ctx) {
  const inicio = k
  const noMeio = ctx.noMeio
  ctx.noMeio = false
  let lancado = false
  while (k < palavras.length - 1 && !palavras[k].aspas && !ehExecutor(nomeDoPrograma(palavras[k].t))) {
    const t = palavras[k].t
    if (LANCADORES_DO_EMBRULHO.has(nomeDoPrograma(t))) lancado = true
    else if (!pulaAntesDoApagador(t, k - inicio) && !(lancado && (/^\d[\d.]*[smhd]?$/.test(t) || palavras[k - 1].t.startsWith('-')))) break
    k++
  }
  if (!palavras[k]) return -1
  // o git depois de sudo, env, timeout ou outro programa pulado acima tambem esta no meio (`sudo -u git bash -c`)
  const noMeioOuLancado = noMeio || k > inicio
  const nome = nomeDoPrograma(palavras[k].t)
  if (nome === 'git') {
    let j = k + 1
    for (; j < palavras.length && palavras[j].t.startsWith('-'); j += GIT_COM_VALOR.has(palavras[j].t) ? 2 : 1) {
      const m = palavras[j].t === '-c' && palavras[j + 1] ? RE_APELIDO_QUE_RODA.exec(palavras[j + 1].t) : null
      if (m && m[1]) saida.push({ texto: m[1], outraPasta: true, shell: 'Bash', remoto: !!ctx.remoto })
    }
    let ate = j - 1
    // 5.49 (D-apelido, 2026-11-03, revisao interna): o apelido que roda outro programa gravado pelo
    // `git config [--global] alias.x '!comando'` (e chamado depois, no mesmo comando ou noutro)
    if (palavras[j] && palavras[j].t === 'config') {
      for (j++; j < palavras.length - 1; j++) {
        if (!/^alias\.\S+$/i.test(palavras[j].t)) continue
        const valor = palavras[j + 1].t
        if (valor.startsWith('!') && valor.length > 1) saida.push({ texto: valor.slice(1), outraPasta: true, shell: 'Bash', remoto: !!ctx.remoto })
        break
      }
      ate = j
    }
    return noMeioOuLancado ? proximoExecutor(palavras, ate, ctx) : -1
  }
  const ex = EXECUTORES.find(e => e.nomes.includes(nome))
  if (!ex) return proximoExecutor(palavras, k, ctx)
  let executa = !ex.opcao
  let primeira = true
  const st = {}
  // duplas: o trecho veio de aspas duplas, que o shell de fora ja expandiu (ver lerApagar)
  const empurra = (texto, duplas = false) => saida.push({ texto, outraPasta: ctx.outraPasta, shell: ex.shell, remoto: !!ctx.remoto, duplas })
  // 5.49 (Codex comum, aspas emendadas, 2026-11-04): vinda do PowerShell, a palavra emendada chega partida
  // (ver comandosSimples): quem roda uma palavra so (bash -c, su -c) roda o primeiro pedaco, e o resto vira
  // o $0; o cmd /c e o powershell -c juntam os pedacos com espaco (`pwsh -c 'git reset'"--hard"` roda o
  // git). O iex recusa o pedaco a mais e nao roda nada
  const empurraPartida = (p, umSo) => {
    if (!ctx.powershell || p.ps.length < 2) return
    const lidos = umSo ? p.ps.slice(0, 1) : p.ps
    const texto = lidos.map(q => q.t).join(' ')
    if (texto) empurra(texto, lidos.every(q => q.expande))
  }
  let j = k + 1
  for (; j < palavras.length; j++) {
    const p = palavras[j]
    if (executa) {
      // 5.49 (D-embrulho, 2026-11-03, quarta leva): no ssh o que vem daqui roda na outra maquina, e
      // tudo lido depois no mesmo comando simples (`ssh host bash -c "..."`) leva a marca remoto
      if (ex.remoto) ctx.remoto = true
      // o ssh e o watch juntam o resto da linha com espaco e o shell de la rele o texto, entao o
      // trecho entre aspas perde as aspas (`ssh host ls ";" "git reset --hard"` roda o git). 5.49
      // (D-embrulho, 2026-11-03, quarta leva, revisao interna): o texto junto e lido quando o resto
      // tem trecho entre aspas; sem aspas no comeco, a leitura de fora tambem segue no resto (`ssh host
      // bash -c "..."`). So o primeiro ssh ou watch do comando simples junta: o texto junto ja leva os
      // de depois, e as aspas somem a cada volta, o que segura o tempo linear
      if (ex.junta) {
        // vindo do PowerShell, cada pedaco da palavra emendada chega como palavra (ver comandosSimples)
        const junto = () => {
          const resto = palavras.slice(j)
          const texto = resto.map(q => q.t).join(' ')
          empurra(texto)
          const partido = ctx.powershell ? resto.flatMap(q => q.ps.map(x => x.t)).join(' ') : texto
          if (partido !== texto) empurra(partido)
        }
        if (p.aspas) { junto(); break }
        if (!ctx.juntou && j <= ctx.ultimaAspas) { ctx.juntou = true; junto() }
        return j
      }
      if (ex.umSo && !p.aspas && /^[-+]/.test(p.t)) continue
      // revisao interna das aspas emendadas (2026-11-04): no Git Bash o MSYS troca o /c por C:/, que o cmd pula, e o
      // //c de depois e o que roda (`cmd /c //c "..."` roda, medido em 2026-11-04)
      if (ex.shell === 'cmd' && ctx.bash && primeira && !p.aspas && /^\/\/[a-z]/i.test(p.t)) continue
      // 5.49 (D-embrulho, 2026-11-03, revisao interna): no cmd /c, no powershell -c e no iex que
      // comecam sem aspas, o comando de dentro e o resto da linha, que a leitura de fora ja ve; o
      // trecho entre aspas dele e de quem o recebe (`cmd /c git commit -m "rm -rf dist"` segue calado),
      // e so o executor de dentro (`cmd /c bash -c "..."`) volta a ser lido
      if (!ex.umSo && primeira && !p.aspas) return j
      primeira = false
      if (p.aspas && p.t) empurra(p.t, p.aspas === '"')
      if (!ex.nomes.includes('iex')) empurraPartida(p, ex.umSo)
      if (ex.umSo) break
      continue
    }
    const d = ex.opcao(p.t, p.aspas, ctx, st)
    // valorDoC: o -c e opcao com valor no getopt, que segue lendo as opcoes depois dele, e o ultimo -c
    // vale; cada valor entre aspas e lido. O valor sem aspas volta a ser lido como comeco de comando,
    // como no cmd /c (`su -c bash -c "..."`, `script -q -c cmd /c "..."`)
    if (Array.isArray(d)) { if (d[1]) empurra(d[1]) }
    else if (d === 'executa' && ex.valorDoC) {
      if (palavras[j + 1] && !palavras[j + 1].aspas) return j + 1
      if (palavras[j + 1] && palavras[j + 1].t) { empurra(palavras[j + 1].t, palavras[j + 1].aspas === '"'); empurraPartida(palavras[j + 1], true) }
      j++
    }
    else if (d === 'executa') executa = true
    else if (d === 'comando') { executa = true; j-- }
    else if (d === 'para') break
    else if (d === 'valor') j++
    else if (d === 'pasta') { ctx.outraPasta = true; j++ }
  }
  return executa ? -1 : proximoExecutor(palavras, j - 1, ctx)
}

export function ehPerigoso(comando, opcoes = {}) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const { limpo, desaspado, marcado } = classificarTrechosEntreAspas(comando)
  // menor 1: a limpeza de aspas vale pra todos os padroes, nao so pro rm, senao
  // escrever licao sobre qualquer outro comando perigoso continua barrado
  // (ex.: `echo "nunca rode format D:" >> licoes.md`).
  // o PowerShell continua o comando na linha de baixo depois de "(" ou de crase no fim
  // da linha, entao as regras dele leem o comando com as linhas juntadas
  // (achado do Codex no Bloco A: `iex (` numa linha e `irm x)` na outra passava)
  const emUmaLinha = desaspado.replace(/`?\r?\n\s*/g, ' ')
  // e tambem linha a linha: juntar tudo deixava um `-Command` da primeira linha encerrar a
  // leitura das opcoes e esconder o `powershell "-e"` da segunda (achado do Codex na final)
  const motivo = testarPadroes(limpo) || gitPerigoso(marcado, cwd) || testarPadroes(desaspado, PERIGOS_POWERSHELL) || testarPadroes(emUmaLinha, PERIGOS_POWERSHELL) || testarPadroes(desaspado, PERIGOS_DISCO)
  if (motivo) return motivo
  // 5.49 (bloco 9, 2026-11-03): o trecho entre aspas deixou de ser lido como comando (correcao 5);
  // fica o Start-Process remontado (rodada 5.20, N2), cujo disco segue barrando. 5.49 (D-embrulho e
  // D-apelido, 2026-11-03): volta o trecho de quem executa comando e o comando do apelido do git (ver
  // embrulhados). O trecho e sempre mais curto que o comando, entao a recursao termina. O nome do
  // apagador sem aspas (5.43) foi pra perguntaDeApagar, junto com as regras de apagar. 5.49 (Codex comum,
  // 2026-11-04): o comando com as chaves do cmd separadas, que e mais comprido, mas a volta dele devolve o
  // mesmo texto e nao entra de novo; e a da barra dobrada antes da aspa (ver semBarraNaAspa), idem
  // 5.52 (chat 2, Task 2c, 2026-11-05): cada trecho leva o shell que o roda, e no do cmd o @ sai (ver semArrobaDoCmd)
  for (const [trecho, shell] of trechosComShell(comando, desaspado, opcoes.shell)) {
    const motivoTrecho = ehPerigoso(trecho, { cwd, shell })
    if (motivoTrecho) return motivoTrecho
  }
  return null
}
// os trechos que o ehPerigoso e o ehGitPerigoso leem de novo, cada um com o shell dele, sem repetir
function trechosComShell(comando, desaspado, shell, antes = []) {
  const vistos = new Map()
  const poe = (texto, sh) => { const chave = (sh || '') + ' ' + texto; if (!vistos.has(chave)) vistos.set(chave, [texto, sh]) }
  for (const t of antes) poe(t, null)
  for (const e of embrulhados(comando)) poe(e.texto, e.shell)
  for (const t of argumentosRemontados(desaspado)) poe(t, null)
  for (const t of leiturasAMais(comando)) poe(t, shell)
  const semArroba = semArrobaDoCmd(comando, shell)
  if (semArroba !== comando) poe(semArroba, shell)
  return vistos.values()
}

// rodada 5.23 (1b): so a leitura de git, com a mesma leitura do ehPerigoso (marcado, cwd, -C e
// Start-Process remontado). O ehPerigoso devolve o primeiro motivo que achar, e quem so quer saber
// do git ficava sem ele.
// 5.49 (bloco 6 e bloco 9, 2026-11-03): { estrito: true } liga de volta o apelido do git por -c ou
// --config-env e a descida em todo trecho entre aspas que nao e de quem so escreve, como na v5.39. So a
// bancada passa (porteiro-destrutivo.mjs). 5.49 (D-bancada-git, 2026-11-03): o naoLe saiu do estrito
// (o git com variavel, $(...), crase, chaves ou xargs segue as regras do kit). 5.49 (D-embrulho,
// 2026-11-03): sem o estrito, desce no trecho de quem executa comando, como o ehPerigoso
export function ehGitPerigoso(comando, opcoes = {}) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const estrito = opcoes.estrito === true
  const { suspeitos, desaspado, marcado } = classificarTrechosEntreAspas(comando)
  const motivo = gitPerigoso(marcado, cwd, estrito)
  if (motivo) return motivo
  // 5.49 (D-apelido, 2026-11-03, revisao interna): o estrito le tambem o embrulho, pro comando do
  // `git config alias.x '!git reset --hard'`, que o suspeito com o ! na frente nao le
  for (const [trecho, shell] of trechosComShell(comando, desaspado, opcoes.shell, estrito ? suspeitos : [])) {
    const motivoTrecho = ehGitPerigoso(trecho, { cwd, estrito, shell })
    if (motivoTrecho) return motivoTrecho
  }
  return null
}

// 5.52 (chat 2, Task 2d, 2026-11-05): decisao 13. Os seis que apagam de vez e passavam calados (git reflog
// expire, git branch -f, -D, -M e -C, git worktree remove, git update-ref -d, wsl --unregister e Clear-RecycleBin)
// perguntam, pela regra apaga-de-vez. Ficam fora do ehGitPerigoso porque o porteiro destrutivo da bancada o
// importa no estrito e travaria a propria limpeza de worktree. Le o git em qualquer palavra, como o gitPerigoso
// (ver deVezNoTexto), e desce nos mesmos embrulhados do ehGitPerigoso (trechosComShell, com o @ do cmd). Devolve
// o que a IA quer fazer, pra pergunta, ou null. Passam: git branch -d (o git confere se a branch ja foi juntada),
// git branch -m e -c, git worktree list, add e prune, e os furos do T46 (checkout -B, switch -C, gc --prune=now
// sozinho, git prune, wslconfig /unregister, update-ref --stdin). O git citado sem aspas (echo git branch -D x)
// pergunta a toa
export const REGRA_APAGA_DE_VEZ = 'apaga-de-vez'
const DE_VEZ_REFLOG = 'apagar o reflog do git, o historico que deixa recuperar commit perdido'
const DE_VEZ_BRANCH = 'apagar, sobrescrever ou renomear por cima uma branch do git sem conferir se o trabalho dela ja foi juntado'
const DE_VEZ_WORKTREE = 'apagar uma copia de trabalho do git (worktree) junto com a pasta dela'
const DE_VEZ_UPDATE_REF = 'apagar uma referencia do git (branch ou tag) direto, sem conferencia'
const DE_VEZ_WSL = 'apagar uma distribuicao Linux do WSL inteira, com todos os arquivos dela'
const DE_VEZ_LIXEIRA = 'esvaziar a lixeira do Windows'
const WSL_COM_VALOR = new Set(['-d', '--distribution', '-u', '--user', '--cd', '--distribution-id'])
function gitDeVez(args) {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) i += GIT_COM_VALOR.has(args[i]) ? 2 : 1
  const verbo = args[i]
  const resto = args.slice(i + 1)
  const sub = resto.find(a => !a.startsWith('-'))
  if (verbo === 'reflog') return sub === 'expire' ? DE_VEZ_REFLOG : null
  if (verbo === 'worktree') return sub === 'remove' ? DE_VEZ_WORKTREE : null
  if (verbo !== 'branch' && verbo !== 'update-ref') return null
  // 5.52 (chat 2, Task 2d, Codex comum): o -f e o --force com --list, -l ou --show-current so consultam
  const soConsulta = verbo === 'branch' && resto.some(a => a === '--list' || a === '-l' || a === '--show-current')
  for (let j = 0; j < resto.length; j++) {
    const a = resto[j]
    if (a === '--') break
    if (verbo === 'update-ref') {
      if (a === '-m') { j++; continue }
      if (!a.startsWith('--') && letrasCurtas(a, 'm').letras.includes('d')) return DE_VEZ_UPDATE_REF
      continue
    }
    if (longa(a, '--force')) { if (!soConsulta) return DE_VEZ_BRANCH; continue }
    // 5.52 (chat 2, Task 2d, revisao interna, 2026-11-05): o -C copia por cima, como o --copy --force
    const letras = a.startsWith('--') ? '' : letrasCurtas(a, 'u').letras
    if (/[DMC]/.test(letras) || (!soConsulta && letras.includes('f'))) return DE_VEZ_BRANCH
  }
  return null
}
// 5.52 (chat 2, Task 2d, revisao interna, 2026-11-05): le como o gitPerigoso, o git em qualquer palavra do
// comando simples ate o git seguinte, e nao so no lugar de programa: timeout 5, nice -n 5, env -C, stdbuf, sudo -u,
// ssh host, watch, do, then, !, find -exec e cmd /c ou powershell -c sem aspas deixavam o programa fora da
// leitura. O wsl e o Clear-RecycleBin tambem, menos quando o programa do pedaco so cita o nome (echo, grep, Get-Help)
const SO_NOMEIAM = new Set([...CITAM, 'get-help', 'help', 'man', 'get-command', 'gcm'])
function deVezNoTexto(texto) {
  for (const seg of comandosDoTexto(texto)) {
    const p = (seg.match(/\S+/g) || []).map(a => a.split(ASPA).join(''))
    const cita = p.length > 0 && SO_NOMEIAM.has(nomeDoPrograma(p[0]))
    let i = 0
    while (i < p.length) {
      const nome = nomeDoPrograma(p[i])
      if (!cita && nome === 'clear-recyclebin') return DE_VEZ_LIXEIRA
      if (!cita && nome === 'wsl') {
        for (let k = i + 1; k < p.length && p[k].startsWith('-'); k += WSL_COM_VALOR.has(p[k]) ? 2 : 1) {
          if (p[k].toLowerCase() === '--unregister') return DE_VEZ_WSL
          if (p[k] === '--' || p[k] === '-e' || p[k] === '--exec') break
        }
      }
      if (!ehGit(p[i])) { i++; continue }
      let fim = i + 1
      while (fim < p.length && !ehGit(p[fim])) fim++
      const args = p.slice(i + 1, fim)
      const motivo = gitDeVez(args) || (args.some(a => a.includes(BARRA)) ? gitDeVez(args.map(semBarra)) : null)
      if (motivo) return motivo
      i = fim
    }
  }
  return null
}
export function apagaDeVez(comando, opcoes = {}) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const { desaspado, marcado } = classificarTrechosEntreAspas(comando)
  // 5.52 (chat 2, Task 2d, Codex comum): o PowerShell continua a linha depois da crase no fim (`wsl `+quebra+
  // `--unregister`) e a crase dentro da palavra so escapa a letra (Clear-Recycle`Bin): as duas leituras a mais
  // so podem perguntar a mais
  const juntado = marcado.replace(/`\r?\n\s*/g, ' ')
  const motivo = deVezNoTexto(marcado) || deVezNoTexto(juntado) || deVezNoTexto(juntado.replace(/`(?=\S)/g, ''))
  if (motivo) return motivo
  for (const [trecho, shell] of trechosComShell(comando, desaspado, opcoes.shell)) {
    const motivoTrecho = apagaDeVez(trecho, { shell })
    if (motivoTrecho) return motivoTrecho
  }
  return null
}

// 5.49 (bloco 5, 2026-11-03): apagar pasta pergunta em vez de barrar, nas tres ferramentas
// (Bash, PowerShell e Monitor), e a pasta temporaria apaga calada. Generaliza a perguntaDoPowershell
// da 5.40: as regras de apagar de antes (APAGAR_COM_ALVO, APAGAR_SEM_ALVO e APAGAR_NO_DESASPADO)
// decidem se o comando apaga, como barravam ate a v5.39, e o leitor palavra por palavra acha o alvo.
// Devolve a lista dos alvos (null no que a trava nao le) ou null: comando que nao apaga, ou com
// todo alvo legivel dentro da temporaria.
// O programa pode vir depois de atribuicao, do operador ponto, do & de chamada, do return e do throw
// (5.40), de sudo, env, nohup, time ou command, de VAR=valor e de quem lanca pacote (npx rimraf)
const PREFIXOS_DO_SHELL = new Set(['command', 'nohup', 'time'])
function pulaAntesDoApagador(p, k) {
  return ANTES_DO_PROGRAMA.has(p.toLowerCase()) || p === '&' || LANCADORES.has(nomeDoPrograma(p)) ||
    PREFIXOS_DO_SHELL.has(nomeDoPrograma(p)) || /^\w+=/.test(p) || (k > 0 && p.startsWith('-'))
}
// o cmd le a chave colada no nome e no alvo (rodada 5.20, N7): `rd/s/q pasta`, `rd c/s/q`
const APAGADORES_PS = new Set(['remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir'])
const APAGADORES_CMD = new Set(['del', 'erase', 'rd', 'rmdir'])
const RE_CHAVE_S = /\/s(?!\w)/i
const RE_COLADO_NO_CMD = /^(rd|rmdir|del|erase)(\/.*)$/i
// as chaves do proprio cmd, uma ou varias juntas, com a barra dobrada do Git Bash
const RE_CHAVES_DO_CMD = /^(?:\/\/?(?:[cksqdaur]|[tefv]:\w+))+$/i
const RE_CHAVE_QUE_RODA = /\/[ckr](?![:\w])/i
// o rm recursivo do bash (-r, -R, --recursive, agrupado como -rf) ou do PowerShell (-r ate -recurse)
const rmRecursivo = a => RE_OPCAO_R_PS.test(a) || a === '--recursive' || (RE_LETRAS_DO_RM.test(a) && /r/i.test(a))
// 5.52 (chat 2, Task 2e, revisao interna, 2026-11-05): a opcao de quem vem antes do apagador que troca a pasta
// (o -C e o --chdir do env, o -D, o -R e o --chdir do sudo, o -C, o --dir, o --cwd e o --prefix do lancador de
// pacote, o -w e o --filter da area de trabalho), grudada no valor ou nao: o alvo relativo e de outra pasta, como
// depois do cd (`env -C.. rm -rf dist` apaga o dist de fora do projeto). Pega a mais, so pergunta a mais
const RE_OPCAO_DE_PASTA = /^(?:-[A-Za-z]*[CDRFrw]|--(?:c|dir|prefix|workspace|filter|recursive))/
// 5.52 (chat 2, Task 2e, revisao interna, 2026-11-05): o redirecionamento nao e alvo (`rm -rf dist 2>/dev/null`,
// `2>$null` do PowerShell, `2>nul` do cmd); o operador sozinho leva a palavra seguinte, o destino dele
const RE_REDIRECAO = /^(?:\d+|[&*])?(?:>>?|<)/
const RE_SO_REDIRECAO = /^(?:\d+|[&*])?(?:>>?|<)(?:&\d*)?$/
function semRedirecao(args) {
  const saida = []
  for (let j = 0; j < args.length; j++) {
    if (!RE_REDIRECAO.test(args[j])) saida.push(args[j])
    else if (RE_SO_REDIRECAO.test(args[j])) j++
  }
  return saida
}
// alvos de um pedaco do marcado, ou null quando o programa dele nao e um apagador lido aqui
function alvosDoPedaco(seg) {
  // o espaco depois da marca SUB e do comandosDoTexto: `$(pwd)/x` e uma palavra so
  const palavras = (seg.split(SUB + ' ').join(SUB).replace(RE_ATRIBUICAO, '').match(/\S+/g) || []).map(p => p.split('^').join(''))
  let k = 0
  let outraPasta = false
  // 5.49 (autonomia, 2026-11-04): o cmd com /c, /k ou /r sem aspas roda o resto da linha, e o alvo do rd e
  // do del se le dali (`cmd /c rd /s /q dist`, `cmd //c` do Git Bash, chaves antes, como /d /q, ou juntas).
  // Em laco, sem recursao: `cmd /c cmd /c ...` gigante segue linear
  for (;;) {
    const ini = k
    while (k < palavras.length - 1 && pulaAntesDoApagador(palavras[k], k - ini)) {
      if (k > ini && RE_OPCAO_DE_PASTA.test(palavras[k])) outraPasta = true
      k++
    }
    if (!palavras[k]) return null
    if (nomeDoPrograma(palavras[k]) !== 'cmd') break
    let j = k + 1
    while (j < palavras.length && RE_CHAVES_DO_CMD.test(palavras[j]) && !RE_CHAVE_QUE_RODA.test(palavras[j])) j++
    if (j + 1 >= palavras.length || !RE_CHAVES_DO_CMD.test(palavras[j])) break
    k = j + 1
  }
  const colado = RE_COLADO_NO_CMD.exec(palavras[k])
  const nome = colado ? colado[1].toLowerCase() : nomeDoPrograma(palavras[k]).replace(/@[^@\/]*$/, '')
  const args = semRedirecao(palavras.slice(k + 1))
  const lista = alvosDoApagador(nome, colado, args)
  if (lista && outraPasta) lista.outraPasta = true
  return lista
}
function alvosDoApagador(nome, colado, args) {
  if (nome === 'rm') return args.some(rmRecursivo) ? alvosDosArgs(args) : null
  if (nome === 'rimraf' || nome === 'del-cli') return alvosDosArgs(args)
  if (!APAGADORES_PS.has(nome)) return null
  if (args.some(a => RE_OPCAO_R_PS.test(a))) return alvosDosArgs(args)
  if (!APAGADORES_CMD.has(nome) || !((colado && RE_CHAVE_S.test(colado[2])) || args.some(a => RE_CHAVE_S.test(a)))) return null
  // no cmd a chave sai, e a palavra com a chave colada ninguem le com certeza (vira null)
  return args.filter(a => !a.startsWith('/')).map(a => RE_CHAVE_S.test(a) ? null : a)
}
// alvo entre aspas sai inteiro; aspas vazias e o que vem de $(...), ( ) ou { } a trava nao le. Depois
// de um cd no mesmo comando, o alvo relativo e de outra pasta, que a trava nao acompanha
const alvoLegivel = (a, mudouPasta) => {
  if (!a || a === VAZIO || a.includes(SUB)) return null
  const t = a.split(NUL).join(' ').split(ASPA).join('')
  return mudouPasta && !/^(?:[a-zA-Z]:|[\\\/~$%])/.test(t) ? null : t
}
// o pedaco do limpo e o do marcado andam juntos: o separador fora das aspas e o mesmo nos dois, e o de
// dentro das aspas o limpo tira e o marcado troca por _. A regra de antes le o limpo (o nome entre aspas
// fora da posicao de comando, `ls "rm" -Recurse`, segue livre) e o leitor de alvo le o marcado
// 5.49 (bloco 5, revisao interna): o Push-Location (nome de verdade do pushd), o popd e o Pop-Location
// tambem trocam a pasta, e o `builtin cd` e o `command cd` sao o cd (o `pwsh -WorkingDirectory x -c
// "..."` leva o apagar entre aspas, lido de novo desde a 5.49, D-embrulho, com o alvo relativo como
// "uma pasta")
const CDS_DO_APAGAR = new Set([...CDS, 'push-location', 'popd', 'pop-location'])
const RE_PREFIXO_DO_CD = /^\s*(?:(?:builtin|command)\s+)+/i
// 5.49 (D-embrulho, 2026-11-03, revisao interna): o alvo lido dentro do embrulho tambem passa pelo
// shell de dentro: a forma da temporaria que esse shell nao le (`powershell -c '... $TMPDIR/x'`, onde o
// $TMPDIR e vazio) vira alvo que a trava nao le. A conta do shell de fora segue no caminhoDoAlvo
const SHELLS_QUE_LEEM = { PowerShell: ['PowerShell', 'cmd'], Bash: ['Bash', 'cmd'], cmd: ['cmd'] }
// 5.49 (autonomia, 2026-11-04): o /tmp do Git Bash tambem (`powershell -c "Remove-Item -Recurse /tmp/x"`)
const foraDoShell = (a, shell) => !!shell && typeof a === 'string' &&
  (VARIAVEIS_DA_TEMPORARIA.some(f => f.re.test(a) && !SHELLS_QUE_LEEM[shell].includes(f.shell)) ||
    (tmpDoBash(a) && !SHELLS_QUE_LEEM[shell].includes('Bash')))
// 5.49 (Codex comum, 2026-11-04, revisao interna): literal falso no trecho que veio de aspas duplas pra
// quem executa (`bash -c "rm -rf '$TMPDIR/x'"`): o shell de fora ja trocou a variavel pelo valor antes do
// de dentro ver as aspas simples. No cmd de dentro ou de fora a aspa simples segue parte do nome
// powershell: o comando veio do PowerShell (ou de shell que a trava nao sabe), ver embrulhados
function lerApagar(comando, alvos, mudouPasta = false, shell = null, literal = true, powershell = true, bash = true) {
  const cru = classificarTrechosEntreAspas(comando)
  const lido = classificarTrechosEntreAspas(semComentarioDeBloco(comando.replace(/`\r?\n/g, '  ')), { literal })
  const pedacos = comandosDoTexto(lido.marcado)
  const pedacosDoLimpo = comandosDoTexto(lido.limpo)
  const juntos = pedacos.length === pedacosDoLimpo.length
  let achou = false
  pedacos.forEach((seg, i) => {
    const primeira = (seg.replace(RE_PREFIXO_DO_CD, '').match(/\S+/) || [''])[0]
    if (CDS_DO_APAGAR.has(nomeDoPrograma(primeira))) { mudouPasta = true; return }
    const doPedaco = alvosDoPedaco(seg)
    // o pedaco que a regra de antes barra e o leitor nao entende (`nice rm -rf x`) pergunta "uma pasta"
    // um por um: o push(...lista) com centenas de milhares de alvos estourava a pilha do Node, erro que
    // desde a 5.49 barra com a regra erro-interno (revisao interna)
    if (doPedaco) {
      if (!doPedaco.length) alvos.push(null)
      for (const a of doPedaco) { const t = alvoLegivel(a, mudouPasta || !!doPedaco.outraPasta); alvos.push(foraDoShell(t, shell) ? null : t) }
    }
    else if (juntos && APAGAR_COM_ALVO.some(p => p.teste(pedacosDoLimpo[i]))) alvos.push(null)
    else return
    achou = true
  })
  if (!achou && APAGAR_COM_ALVO.some(p => p.teste(cru.limpo))) alvos.push(null)
  if (APAGAR_SEM_ALVO.some(p => p.teste(cru.limpo)) || APAGAR_NO_DESASPADO.some(p => p.teste(cru.desaspado))) alvos.push(null)
  // desce no Start-Process remontado, como o ehPerigoso; o trecho e sempre mais curto, entao a recursao
  // termina. 5.49 (bloco 9, 2026-11-03, revisao interna): o trecho entre aspas deixou de ser lido
  // como comando aqui tambem (`gh issue create --body "rode rm -rf x"` perguntava a toa). 5.49
  // (D-embrulho e D-apelido, 2026-11-03): volta o de quem executa comando (`bash -c "rm -rf pasta"`
  // pergunta), e o alvo de dentro passa pela mesma conta da temporaria; com -WorkingDirectory do
  // powershell ou no apelido do git, o alvo relativo e de outra pasta, que a trava nao le
  // 5.49 (D-embrulho, 2026-11-03, quarta leva): o alvo do que roda na outra maquina (ssh) conta como
  // fora da temporaria daqui: a pergunta sai com o alvo que a trava nao le pra cada alvo de dentro
  const lidos = new Set()
  for (const e of embrulhados(comando, powershell, bash)) {
    const fora = mudouPasta || e.outraPasta
    const chave = fora + ' ' + e.shell + ' ' + e.remoto + ' ' + e.texto
    if (lidos.has(chave)) continue
    lidos.add(chave)
    const destino = e.remoto ? [] : alvos
    lerApagar(e.texto, destino, fora, e.shell, !(e.duplas && e.shell !== 'cmd' && shell !== 'cmd'), e.shell === 'PowerShell', e.shell === 'Bash')
    if (e.remoto) for (let n = 0; n < destino.length; n++) alvos.push(null)
  }
  for (const trecho of new Set(argumentosRemontados(cru.desaspado))) lerApagar(trecho, alvos, mudouPasta, shell, literal, powershell, bash)
  // 5.49 (Codex comum, 2026-11-04): as chaves do cmd separadas, como no ehPerigoso. A barra dobrada so
  // a perguntaDeApagar le, e so fora do bash
  for (const trecho of leiturasAMais(comando, false)) lerApagar(trecho, alvos, mudouPasta, shell, literal, powershell, bash)
  // 5.52 (chat 2, Task 2c, 2026-11-05): no trecho do cmd, o @ do comeco e de depois de &, &&, || e ( sai (ver semArrobaDoCmd)
  const semArroba = semArrobaDoCmd(comando, shell)
  if (semArroba !== comando) lerApagar(semArroba, alvos, mudouPasta, shell, literal, powershell, bash)
}
// 5.49 (autonomia, 2026-11-04): o corpo do heredoc com o delimitador entre aspas (o shell nao troca nada
// nele) que o cat ou o tee grava em arquivo e texto, como o do echo: gravar no licoes.md uma linha que
// cita rm -rf nao pergunta. O cabecalho e o que vem depois do delimitador seguem lidos. O corpo segue lido
// como comando quando o delimitador nao tem aspas, quando o cat nao manda pra arquivo, com pipe, crase,
// $( ), substituicao de processo ou outro comando antes do << na linha, com mais de um << e sem o fim
// 5.49 (Codex comum, 2026-11-04): o delimitador e a palavra inteira depois do << (ou <<-), sem as aspas
// (`<<'EOF'x` termina na linha EOFx); qualquer pedaco entre aspas tira a expansao do corpo, entao so a
// palavra com aspas abre heredoc de texto. O <<< (here-string) nunca e heredoc: a linha de baixo roda. A
// barra, o $ e a crase na palavra, a aspa sem par e a palavra vazia a trava nao le: o corpo segue lido.
// Revisao interna: o CR do meio da palavra e caractere comum pro bash (`<<'EOF'<CR>x` termina na linha
// EOF<CR>x); so o CR do fim da linha sai, como na linha do fim
const FIM_DO_DELIMITADOR = ' ' + String.fromCharCode(9) + ';&|()<>'
function delimitadorDeTexto(cabecalho) {
  const i = cabecalho.indexOf('<<')
  if (i < 0 || cabecalho.includes('<<<')) return null
  const fimDaLinha = cabecalho.endsWith(String.fromCharCode(13)) ? cabecalho.length - 1 : cabecalho.length
  let k = i + 2
  const tab = cabecalho[k] === '-'
  if (tab) k++
  while (cabecalho[k] === ' ' || cabecalho[k] === String.fromCharCode(9)) k++
  let palavra = ''
  let aspas = false
  for (; k < fimDaLinha && !FIM_DO_DELIMITADOR.includes(cabecalho[k]); k++) {
    const c = cabecalho[k]
    if (c === "'" || c === '"') {
      const f = cabecalho.indexOf(c, k + 1)
      if (f < 0 || f >= fimDaLinha) return null
      const dentro = cabecalho.slice(k + 1, f)
      if (dentro.includes(BARRA_DO_HEREDOC) || (c === '"' && /[$`]/.test(dentro))) return null
      palavra += dentro
      aspas = true
      k = f
    } else if (c === BARRA_DO_HEREDOC || c === '$' || c === '`') return null
    else palavra += c
  }
  return aspas && palavra ? { index: i, fim: k, tab, palavra } : null
}
function semCorpoDeHeredocDeTexto(texto) {
  if (!texto.includes('<<')) return texto
  const linhas = texto.split(LF_DO_HEREDOC)
  // onde cada linha aparece (como veio e sem os tabs do comeco, pro <<-), pra achar o fim do corpo sem
  // varrer de novo a cada cabecalho: a entrada gigante segue linear
  const exatas = new Map(), semTab = new Map()
  const guarda = (mapa, chave, j) => { const e = mapa.get(chave); if (e) e.l.push(j); else mapa.set(chave, { l: [j], p: 0 }) }
  linhas.forEach((l, j) => { const t = l.replace(/\r$/, ''); guarda(exatas, t, j); guarda(semTab, t.replace(/^\t+/, ''), j) })
  const proxima = (mapa, chave, depois) => {
    const e = mapa.get(chave)
    if (!e) return -1
    while (e.p < e.l.length && e.l[e.p] <= depois) e.p++
    return e.p < e.l.length ? e.l[e.p] : -1
  }
  // 5.49 (autonomia, revisao interna, 2026-11-04): o << so abre heredoc fora de aspas e de comentario,
  // lidos desde o comeco do comando (`cat > a # <<'EOF'`, `cat "x <<'EOF'"` e o `echo "` aberto na linha
  // de cima nao abrem nada, e o bash roda as linhas de baixo). A primeira linha com << que nao vira
  // heredoc de texto para a leitura: dali pra baixo o corpo segue lido como comando
  const estado = { e: '', antes: LF_DO_HEREDOC }
  for (let i = 0; i < linhas.length; i++) {
    const cabecalho = linhas[i]
    if (!cabecalho.includes('<<')) { estadoDoShell(cabecalho + LF_DO_HEREDOC, estado); continue }
    const d = delimitadorDeTexto(cabecalho)
    if (!d || cabecalho.split('<<').length !== 2 || /[|`]|\$\(|[<>]\(/.test(cabecalho)) break
    const antes = cabecalho.slice(0, d.index)
    const programa = (antes.match(/^\s*(\S+)/) || [])[1]
    if (/[;&]/.test(antes) || !['cat', 'tee'].includes(programa)) break
    const semDelimitador = cabecalho.slice(0, d.index) + cabecalho.slice(d.fim)
    if (programa === 'cat' && !/>>?\s*[^\s&>]/.test(semDelimitador)) break
    // a barra colada no << o tira de heredoc (`cat > a\<<'EOF'`)
    if (antes.endsWith(BARRA_DO_HEREDOC) || estadoDoShell(antes, estado).e !== '' || estadoDoShell(cabecalho.slice(d.index) + LF_DO_HEREDOC, estado).e !== '') break
    const fim = proxima(d.tab ? semTab : exatas, d.palavra, i)
    if (fim < 0) break
    for (let j = i + 1; j < fim; j++) linhas[j] = ''
    i = fim
  }
  return linhas.join(LF_DO_HEREDOC)
}
const LF_DO_HEREDOC = String.fromCharCode(10)
// o estado do bash depois do trecho: fora (''), aspas simples, duplas, $'...', crase ou comentario. A
// barra pula o caractere seguinte (menos nas aspas simples), e o # so comenta no comeco de palavra
const BARRA_DO_HEREDOC = String.fromCharCode(92)
const FIM_DE_PALAVRA = ' ' + String.fromCharCode(9) + LF_DO_HEREDOC + ';&|()<>'
function estadoDoShell(trecho, estado) {
  for (let k = 0; k < trecho.length; k++) {
    const c = trecho[k]
    const antes = estado.antes
    estado.antes = c
    if (estado.e === 'comentario') { if (c === LF_DO_HEREDOC) estado.e = ''; continue }
    if (estado.e === "'") { if (c === "'") estado.e = ''; continue }
    if (c === BARRA_DO_HEREDOC) { k++; estado.antes = 'x'; continue }
    if (estado.e === '"' || estado.e === '`') { if (c === estado.e) estado.e = ''; continue }
    if (estado.e === "$'") { if (c === "'") estado.e = ''; continue }
    if (c === "'" || c === '"' || c === '`') estado.e = c
    else if (c === '$' && trecho[k + 1] === "'") { estado.e = "$'"; k++ }
    else if (c === '#' && FIM_DE_PALAVRA.includes(antes)) estado.e = 'comentario'
  }
  return estado
}
export function perguntaDeApagar(comando, opcoes = {}) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const env = opcoes.env && typeof opcoes.env === 'object' ? opcoes.env : process.env
  // 5.49 (Codex comum, aspas emendadas, 2026-11-04): no Bash e no Monitor a palavra emendada nao se le partida
  const doPowershell = opcoes.ferramenta !== 'Bash' && opcoes.ferramenta !== 'Monitor'
  // revisao interna: na ferramenta PowerShell a palavra nao se le como o bash (barra, $'...', cmd //c)
  const doBash = opcoes.ferramenta !== 'PowerShell'
  // 5.49 (autonomia, 2026-11-04): heredoc so existe fora do PowerShell
  const texto = semChavesNoTmpdir(doBash ? semCorpoDeHeredocDeTexto(comando) : comando)
  const achados = []
  lerApagar(texto, achados, false, null, true, doPowershell, doBash)
  // 5.43: o nome do apagador sem aspas e uma leitura a mais, depois da do comando como veio (segunda
  // volta da final: trocar o comando no lugar escondia o `$(git 'reset' --hard)` do caminho)
  const semAspas = nomeDoApagadorSemAspas(texto)
  if (semAspas !== texto) lerApagar(semAspas, achados, false, null, true, doPowershell, doBash)
  // revisao interna da comum (2026-11-04): fora do bash a barra antes da aspa e caractere (ver semBarraNaAspa)
  const semBarra = opcoes.ferramenta === 'Bash' || opcoes.ferramenta === 'Monitor' ? texto : semBarraNaAspa(texto)
  if (semBarra !== texto) lerApagar(semBarra, achados, false, null, true, doPowershell, doBash)
  // 5.52 (chat 2, Task 2e, Codex comum): a duplicacao de saida (`2>&1`, `>&2`, `&>`, `>&arquivo`) parte o comando no
  // & e o alvo de depois (`rm -rf dist 2>&1 src`) caia num pedaco sem apagador; a leitura sem ela soma os alvos
  const semDuplica = texto.replace(/\d*>&(?=[\d-])\S*/g, ' ').replace(/>&|&>/g, '>')
  if (semDuplica !== texto) lerApagar(semDuplica, achados, false, null, true, doPowershell, doBash)
  if (!achados.length) return null
  const daqui = leituraDasVariaveis(texto, env, opcoes.ferramenta)
  // 5.52 (chat 2, Task 2f, comum, 2026-11-06): opcoes.confia e a do comando que roda o script (scriptsRodados): a
  // variavel da temporaria que o comando muda (`TMPDIR=x bash x.sh`, export, env, set, $env:) nao libera o de dentro
  const leitura = typeof opcoes.confia === 'function'
    ? { ...daqui, confia: (nome, shell) => daqui.confia(nome, shell) && opcoes.confia(nome, shell) } : daqui
  const alvos = [...new Set(achados)].map(a => ({ a, caminho: a === null ? null : caminhoDoAlvo(a, cwd, leitura) }))
  const bases = basesTemporarias()
  const projeto = pastaDoProjeto(env, cwd)
  if (alvos.every(x => x.caminho !== null && (dentroDaTemporaria(x.caminho, bases) || pastaRefazivel(x.a, x.caminho, projeto, opcoes.ferramenta)))) return null
  return alvos.map(x => x.caminho === null ? null : x.a)
}

// 5.52 (chat 2, Task 2e, 2026-11-05): decisao 11, lista fechada. A pasta que o projeto refaz sozinho (npm install,
// build, o Python) apaga calada, so com o caminho real dentro do projeto (CLAUDE_PROJECT_DIR, senao o cwd) e nunca o
// projeto inteiro. So a pasta da lista inteira: o nome dela e o ultimo pedaco do alvo (`./dist`, `sub/node_modules`);
// arquivo dentro dela (`dist/a.txt`) pergunta, porque o nome do arquivo nao diz se ele e refeito. Sem curinga, sem
// expansao (chaves, variavel, aspas que sobraram), sem `..` no alvo e sem caractere fora do ASCII visivel (as marcas
// da leitura sao de controle). A pasta mae pelo caminho real (atalho ou juncao no meio do caminho que leva pra fora
// do projeto pergunta) e a propria pasta pelo lstat: atalho ou juncao com o nome da lista pergunta, porque o
// Remove-Item do Windows PowerShell desce na pasta de destino. A barra invertida so separa na ferramenta PowerShell
// no Windows; no Bash ela escapa a letra seguinte (`.\dist` apaga `.dist`). O dados/navegador-saida fica fora (guarda
// o download do robo) e o .gitignore nunca serve de criterio pra soltar
// 5.52 (chat 2, Task 2e, revisao interna, 2026-11-05): o til no comeco do alvo tambem pergunta: o do Bash com
// usuario ou com o OLDPWD (`~root/build`, `~-/dist`) e outra pasta, que a trava lia como pasta dentro do projeto.
// So no comeco, onde o shell o troca: no meio ele e letra do nome curto do Windows (`PROGRA~1`)
export const PASTAS_REFAZIVEIS = ['node_modules', 'dist', 'build', '.next', '__pycache__']
const naLista = nome => PASTAS_REFAZIVEIS.includes(nome)
const RE_ALVO_VISIVEL = /^[ -~]+$/
const RE_CURINGA_OU_EXPANSAO = /[*?[\]{}$`%"'<>|;&!]|^~/
function pastaDoProjeto(env, cwd) {
  const p = typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR ? env.CLAUDE_PROJECT_DIR : cwd
  return semCaixa(caminhoReal(resolve(cwd, p)))
}
function pastaRefazivel(alvo, caminho, projeto, ferramenta) {
  try {
    const invertida = process.platform === 'win32' && ferramenta === 'PowerShell'
    if (!RE_ALVO_VISIVEL.test(alvo) || RE_CURINGA_OU_EXPANSAO.test(alvo) || (!invertida && alvo.includes(BARRA_DO_HEREDOC))) return false
    const partes = alvo.split(invertida ? /[\\\/]+/ : /\/+/).filter(p => p && p !== '.')
    const nome = partes[partes.length - 1]
    if (!nome || partes.includes('..') || !naLista(nome) || basename(caminho) !== nome) return false
    const real = semCaixa(join(caminhoReal(dirname(caminho)), nome))
    const rel = relative(projeto, real)
    if (rel === '' || rel.split(sep)[0] === '..' || isAbsolute(rel)) return false
    const info = lstatSync(caminho, { throwIfNoEntry: false })
    return !info || (info.isDirectory() && !info.isSymbolicLink())
  } catch { return false }
}

// a variavel da temporaria no comeco do alvo vira o valor do ambiente do hook, e so entao o .. se
// resolve ($env:TEMP/../Documentos pergunta). Outra variavel, ou a temporaria sem valor, a trava nao le.
// 5.49 (bloco 5, revisao interna): cada forma vale so no shell dela. Na ferramenta PowerShell o $TMPDIR
// (e, desde a 5.52, o $TEMP e o $TMP) e variavel do proprio PowerShell (vazia: o alvo vira a raiz do
// disco), e no bash o $env:TEMP e o $env vazio. O %TEMP% e do cmd, que roda de dentro das duas. O nome
// do bash diferencia caixa ($tmpdir e outra variavel); o do PowerShell e o do cmd nao, no Windows. E o comando que mexe na variavel antes de
// apagar (`$env:TEMP = 'E:/'`, `export TMPDIR=~`, `TMPDIR=x;`, `Set-Item env:TEMP`) tira a confianca nela:
// o nome dela fora da forma de ler, ou a forma de ler seguida de =, e a trava nao le o alvo
// 5.52 (chat 2, Task 2b, 2026-11-05): o $TEMP e o $TMP do Bash (e o ${TEMP} e o ${TMP}), com caixa ($temp
// e outra variavel), so no Windows: o Git Bash os copia do ambiente do Windows (o /etc/profile so troca a
// barra), a mesma pasta do TEMP e do TMP do ambiente do hook. Sem valor no ambiente do hook a trava nao le
// (sem a queda no os.tmpdir() do $TMPDIR: no Git Bash sem eles o alvo vira a raiz dele), e fora do Windows
// o Bash nao tem essas duas por padrao, entao segue perguntando
// 5.52 (chat 2, Task 2b, revisao interna, 2026-11-05): na forma do Bash so a barra normal fecha o nome. A
// invertida fora de aspas escapa a letra seguinte e cola nela (`$TEMP\x` apaga a pasta `...\Tempx`, vizinha
// da temporaria), entao ela cai no $ de baixo e pergunta; vale tambem pro $TMPDIR
const VARIAVEIS_DA_TEMPORARIA = [
  { re: /^\$env:(TEMP|TMP)(?=[\\\/]|$)/i, shell: 'PowerShell', semCaixa: true },
  { re: /^%(TEMP|TMP)%(?=[\\\/]|$)/i, shell: 'cmd', semCaixa: true },
  { re: /^\$(TMPDIR)(?=\/|$)/, shell: 'Bash', semCaixa: false },
  { re: /^\$(TEMP|TMP)(?=\/|$)/, shell: 'Bash', semCaixa: false, soNoWindows: true },
]
const RE_LER_VARIAVEL = /\$env:(?:TEMP|TMP)(?!\w)|%(?:TEMP|TMP)%|\$(?:TMPDIR|TEMP|TMP)(?!\w)/gi
const RE_LER_E_ATRIBUIR = /(?:\$env:(?:TEMP|TMP)|\$(?:TMPDIR|TEMP|TMP))\s*[-+*\/?]?=(?!=)/i
const RE_NOME_DA_VARIAVEL = /(?<![A-Za-z0-9_])(?:TEMP|TMP|TMPDIR)(?![A-Za-z0-9_])/gi
// o ${TMPDIR} e o $TMPDIR do shell; o marcado partiria as chaves. 5.52 (chat 2, Task 2b): o ${TEMP} e o
// ${TMP} tambem
const semChavesNoTmpdir = comando => comando.replace(/\$\{(TMPDIR|TEMP|TMP)\}/g, (_, nome) => '$' + nome)
// 5.52 (chat 2, Task 2b, revisao interna, 2026-11-05): o IFS mexido parte o valor da variavel sem aspas do
// Bash (`IFS=:; rm -rf $TEMP/x` apaga a pasta `C` do cwd, pelo : da letra de disco; `IFS=/` parte o
// $TMPDIR), e a trava nao sabe se o alvo veio entre aspas: o nome IFS no comando tira a confianca nas
// formas do Bash. E o `env -i` (`-`, `--ignore-environment` ou o comeco unico dele) esvazia o ambiente de
// quem roda depois (`env -i bash -c 'rm -rf $TEMP/x'` apaga o /x da raiz do Git Bash): tira a confianca em
// todas as formas. 5.52 (chat 2, Task 2b, Codex comum, 2026-11-06): o nome sem caixa (o Windows roda `ENV
// -i`), e o `-S`/`--split-string` tira a confianca tambem, porque monta as opcoes de dentro de uma string
// (`env --split-string='-i bash' -c ...` esvazia o ambiente) que a trava nao le
const RE_IFS = /(?<![A-Za-z0-9_])IFS(?![A-Za-z0-9_])/
const RE_ENV_VAZIO = /(?<![A-Za-z0-9_.-])env(?:\.exe)?["']?\s(?:[^;&|\n]*?\s)?["']?(?:-[A-Za-z0-9]*i[A-Za-z0-9]*|--i[a-z-]*|-)(?=["']?(?:\s|$))/i
const RE_ENV_PARTE = /(?<![A-Za-z0-9_.-])env(?:\.exe)?["']?\s(?:[^;&|\n]*?\s)?["']?(?:-[A-Za-z0-9]*S|--s[a-z-]*(?=[=\s]))/i
function leituraDasVariaveis(texto, env, ferramenta) {
  const mexidas = new Set((texto.replace(RE_LER_VARIAVEL, ' ').match(RE_NOME_DA_VARIAVEL) || []).map(n => n.toUpperCase()))
  const atribui = RE_LER_E_ATRIBUIR.test(texto) || RE_ENV_VAZIO.test(texto) || RE_ENV_PARTE.test(texto)
  const ifs = RE_IFS.test(texto)
  const shells = ferramenta === 'PowerShell' ? ['PowerShell', 'cmd'] : ferramenta === 'Bash' || ferramenta === 'Monitor' ? ['Bash', 'cmd'] : ['PowerShell', 'cmd', 'Bash']
  return { env, shells, confia: (nome, shell) => !atribui && !mexidas.has(nome.toUpperCase()) && !(ifs && shell === 'Bash') }
}
function valorDoAmbiente(env, nome, semCaixa) {
  if (typeof env[nome] === 'string') return env[nome]
  if (!semCaixa || process.platform !== 'win32') return undefined
  const chave = Object.keys(env).find(k => k.toUpperCase() === nome.toUpperCase())
  return chave === undefined ? undefined : env[chave]
}
// 5.49 (Codex comum, 2026-11-04): o alvo com trecho literal (aspas simples com $ ou %, marca LITERAL na
// frente) nao casa nenhuma forma da temporaria e cai no $ ou no % de baixo: pergunta "uma pasta"
function caminhoDoAlvo(alvo, cwd, leitura) {
  let a = alvo
  // 5.49 (autonomia, 2026-11-04): o /tmp do Git Bash e a temporaria do usuario (ver tmpDoBash)
  if (tmpDoBash(a) && leitura.shells.includes('Bash')) a = tmpdir() + a.slice('/tmp'.length)
  for (const forma of VARIAVEIS_DA_TEMPORARIA) {
    const v = forma.re.exec(a)
    if (!v) continue
    if (!leitura.shells.includes(forma.shell) || !leitura.confia(v[1], forma.shell)) return null
    if (forma.soNoWindows && process.platform !== 'win32') return null
    let valor = valorDoAmbiente(leitura.env, v[1], forma.semCaixa)
    // 5.49 (autonomia, 2026-11-04): sem TMPDIR no ambiente do hook, no Windows, o /etc/profile do Git Bash
    // poe nele o TMP do Windows (quando o TMPDIR nao e pasta), a mesma temporaria que o os.tmpdir() le
    if (!valor && v[1] === 'TMPDIR' && process.platform === 'win32') valor = tmpdir()
    if (typeof valor !== 'string' || !valor) return null
    // 5.49 (Codex final, 2026-11-04): no Bash e no cmd a variavel sem aspas se parte no espaco do valor
    // (`rm -rf $TMPDIR/x` com a temporaria em `.../pasta com espaco` apaga `com` e `espaco/x` na pasta de
    // trabalho); a trava nao sabe se o alvo veio entre aspas, entao o valor com espaco nao conta como
    // temporaria nesses dois e pergunta. No PowerShell a variavel nao se parte
    if (forma.shell !== 'PowerShell' && /\s/.test(valor)) return null
    a = valor + a.slice(v[0].length)
    break
  }
  a = expandir(a)
  if (a.includes('$') || a.includes('`') || /%[^%\s]*%/.test(a)) return null
  // 5.49 (bloco 5, revisao interna): o caminho com o provedor do PowerShell (`FileSystem::` e o drive) e o
  // da pasta que ele aponta; outro provedor, ou drive de nome com mais de uma letra (`proj:\x`, do
  // New-PSDrive), a trava nao le: pro node eles seriam relativos e cairiam dentro do cwd
  a = a.replace(/^(?:Microsoft\.PowerShell\.Core\\)?FileSystem::/i, '')
  if (/^[^\\\/:]{2,}:/.test(a)) return null
  // o caminho do Git Bash (/c/Users/...) e o caminho com letra de drive do Windows
  if (process.platform === 'win32') a = a.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:')
  return resolve(cwd, a)
}
// temporaria = dentro do os.tmpdir() ou do /tmp, pelo caminho real dos dois lados (atalho, juncao e,
// no Windows, o nome curto 8.3 resolvidos); no Windows sem diferenca de caixa. O /tmp so conta fora
// do Windows: la o node le /tmp como a pasta tmp da raiz do disco, nao a temporaria do Git Bash.
// 5.49 (autonomia, 2026-11-04): no Windows o /tmp do Git Bash (o mount usertemp, a temporaria do usuario,
// a mesma do os.tmpdir()) vira o os.tmpdir() no caminhoDoAlvo, so no shell que le assim (Bash e Monitor);
// no PowerShell e no cmd o /tmp segue a pasta tmp da raiz do disco
const tmpDoBash = a => process.platform === 'win32' && typeof a === 'string' && /^\/tmp(?=[\\\/]|$)/.test(a)
function basesTemporarias() {
  const bases = []
  for (const b of [tmpdir(), ...(process.platform === 'win32' ? [] : ['/tmp'])]) {
    try { bases.push(realpathSync.native(b)) } catch { /* sem a pasta, ela nao conta */ }
  }
  return bases
}
// o alvo que ainda nao existe usa o caminho real da pasta mais funda que existe
function caminhoReal(caminho) {
  const resto = []
  for (let atual = caminho; ;) {
    try { return join(realpathSync.native(atual), ...resto) } catch { /* sobe uma pasta */ }
    const pai = dirname(atual)
    if (pai === atual) return caminho
    resto.unshift(basename(atual))
    atual = pai
  }
}
const semCaixa = p => process.platform === 'win32' ? p.toLowerCase() : p
function dentroDaTemporaria(caminho, bases) {
  const real = semCaixa(caminhoReal(caminho))
  return bases.some(b => {
    const rel = relative(semCaixa(b), real)
    return rel !== '' && rel.split(sep)[0] !== '..' && !isAbsolute(rel)
  })
}

// o sim do aluno libera o comando inteiro, entao a pergunta nomeia cada alvo, diz quantos arquivos
// tem cada pasta e fecha com o comando (achado 2 da comum no plano da 5.40); comando comprido sai
// cortado, com o aviso. A contagem tem teto, e erro nela nao derruba a pergunta
const MAX_COMANDO_NA_PERGUNTA = 300
const MAX_NOMES_NA_PERGUNTA = 10
const MAX_ARQUIVOS_CONTADOS = 1000
// 5.52 (chat 2, Task 2e, 2026-11-05): decisao 11. A pergunta traz a avaliacao que o codigo sabe fazer: quantos
// arquivos, quantos fora do backup (o git check-ignore, so com a pasta num repositorio; sem rede) e o nome sensivel
// (.env e dados/sessao). So roda quando a trava ja vai perguntar. Teto de 1000 arquivos e de 2 segundos pra pergunta
// inteira: estourado, diz "mais de N" e "pelo menos N"
const MAX_MS_DA_AVALIACAO = 2000
const SENHA = 'senha no .env'
const SESSAO = 'login salvo em dados/sessao'
const ehSessao = dir => basename(dir) === 'sessao' && basename(dirname(dir)) === 'dados'
export function avaliarPasta(pasta, prazo) {
  const arquivos = []
  const sensiveis = new Set(ehSessao(pasta) ? [SESSAO] : [])
  let estourou = false
  const pilha = [[pasta, '']]
  while (pilha.length && !estourou) {
    const [dir, rel] = pilha.pop()
    // Codex comum: o prazo vale tambem a cada pasta, senao uma arvore de pastas vazias passava dele
    if (Date.now() > prazo) { estourou = true; break }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name
      if (e.isDirectory()) {
        pilha.push([join(dir, e.name), r])
        if (e.name === 'sessao' && basename(dir) === 'dados') sensiveis.add(SESSAO)
        continue
      }
      if (e.name === '.env') sensiveis.add(SENHA)
      if (arquivos.length >= MAX_ARQUIVOS_CONTADOS || Date.now() > prazo) { estourou = true; break }
      arquivos.push(r)
    }
  }
  return { arquivos, estourou, sensiveis }
}
// quantos dos arquivos o git ignora (nao vao pro backup), ou null fora de repositorio, sem git ou sem tempo
function foraDoBackup(pasta, arquivos, prazo) {
  const resta = prazo - Date.now()
  if (!arquivos.length || resta <= 0) return null
  const r = spawnSync('git', ['-C', pasta, 'check-ignore', '--stdin', '-z'], {
    input: arquivos.join(NUL), encoding: 'utf8', timeout: resta, windowsHide: true,
  })
  if (r.status === 1) return 0
  if (r.status !== 0 || typeof r.stdout !== 'string') return null
  return r.stdout.split(NUL).filter(Boolean).length
}
// 5.49 (autonomia, 2026-11-04): o alvo que a trava nao le (find -delete, pipe pro Remove-Item, node -e,
// python -c) saia como "uma pasta inteira", que assustava sem ser verdade; agora diz o que se sabe
const ALVO_DESCONHECIDO = 'arquivos que o comando escolhe, a trava nao sabe quais'
function descreverAlvo(alvo, cwd, leitura, prazo) {
  if (alvo === null) return ALVO_DESCONHECIDO
  // 5.49 (autonomia, revisao interna, 2026-11-04): o curinga (`rm -rf *`, `del /s /q *.*`) saia como
  // "a pasta * (que nao existe)", que parecia inofensivo; agora diz que apaga tudo o que casa com ele
  if (/[*?]/.test(alvo)) return `tudo o que casa com ${alvo} (curinga, a trava nao conta quantos arquivos)`
  try {
    const caminho = caminhoDoAlvo(alvo, cwd, leitura)
    if (caminho !== null) {
      const info = lstatSync(caminho, { throwIfNoEntry: false })
      if (!info) return `a pasta ${alvo} (que nao existe)`
      const ehPasta = info.isDirectory()
      const nome = basename(caminho)
      const av = ehPasta ? avaliarPasta(caminho, prazo) : { arquivos: [nome], estourou: false, sensiveis: new Set(nome === '.env' ? [SENHA] : []) }
      const fora = foraDoBackup(ehPasta ? caminho : dirname(caminho), av.arquivos, prazo)
      const n = av.arquivos.length
      const partes = !ehPasta ? [] : [av.estourou ? `mais de ${n} arquivos` : n === 1 ? '1 arquivo' : `${n} arquivos`]
      if (fora) partes.push(!ehPasta ? 'fora do backup' : `${av.estourou ? 'pelo menos ' : ''}${fora} fora do backup`)
      const sensiveis = [SENHA, SESSAO].filter(s => av.sensiveis.has(s))
      if (sensiveis.length) partes.push('com ' + sensiveis.join(' e '))
      if (!ehPasta) return `o arquivo ${alvo}` + (partes.length ? ` (${partes.join(', ')})` : '')
      return `a pasta ${alvo} inteira (${partes.join(', ')})`
    }
  } catch { /* sem a contagem, o nome sai do mesmo jeito */ }
  return `a pasta ${alvo} inteira`
}
// 5.52 (chat 2, Task 2d, 2026-11-05): opcoes.deVez (o que o apagaDeVez devolveu) entra na mesma pergunta, com
// as duas regras; sem alvo de apagar pasta, a pergunta e so da regra apaga-de-vez
export function textoDaPergunta(alvos, comando, opcoes = {}) {
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const env = opcoes.env && typeof opcoes.env === 'object' ? opcoes.env : process.env
  const leitura = leituraDasVariaveis(semChavesNoTmpdir(comando), env, opcoes.ferramenta)
  const prazo = Date.now() + MAX_MS_DA_AVALIACAO
  const nomes = alvos.slice(0, MAX_NOMES_NA_PERGUNTA).map(a => descreverAlvo(a, cwd, leitura, prazo))
  if (alvos.length > MAX_NOMES_NA_PERGUNTA) nomes.push(`mais ${alvos.length - MAX_NOMES_NA_PERGUNTA} pastas`)
  const quais = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  const linha = comando.replace(/\s+/g, ' ').trim()
  const mostrado = linha.length > MAX_COMANDO_NA_PERGUNTA
    ? linha.slice(0, MAX_COMANDO_NA_PERGUNTA) + ' ... (comando cortado: pede pra IA mostrar ele inteiro antes de responder)'
    : linha
  const deVez = typeof opcoes.deVez === 'string' && opcoes.deVez ? opcoes.deVez : null
  // 5.52 (chat 2, Task 2f, 2026-11-05): opcoes.naoLidos (o script que a trava nao leu, regra script-nao-lido) e
  // opcoes.scripts (o script lido de onde veio o apagar) entram na mesma pergunta; as regras se juntam por " e "
  const naoLidos = Array.isArray(opcoes.naoLidos) ? opcoes.naoLidos : []
  const scripts = Array.isArray(opcoes.scripts) ? [...new Set(opcoes.scripts)] : []
  // 5.52 (chat 3, Task 3c): opcoes.autonomia (o comando grava no _contexto/autonomia.md) entra na mesma pergunta
  const autonomia = opcoes.autonomia === true
  // 5.52 (chat 3, Task 3c, revisao interna): opcoes.foraDoAllow (o que o allow solta mas sai dele) tambem entra
  const foraDoAllow = Array.isArray(opcoes.foraDoAllow) ? opcoes.foraDoAllow : []
  const regras = [...(alvos.length ? [REGRA_APAGAR] : []), ...(deVez ? [REGRA_APAGA_DE_VEZ] : []), ...(naoLidos.length ? [REGRA_SCRIPT_NAO_LIDO] : []),
    ...(autonomia ? [REGRA_GRAVA_AUTONOMIA] : []), ...(foraDoAllow.length ? [REGRA_FORA_DO_ALLOW] : [])]
  const regra = regras.length ? regras.join(' e ') : REGRA_APAGA_DE_VEZ
  const apaga = [alvos.length ? `apagar ${quais}` : '', deVez || ''].filter(Boolean).join(' e tambem ')
  const deOnde = apaga && scripts.length ? ` (de dentro do script ${scripts.slice(0, MAX_NOMES_NA_PERGUNTA).join(', ')})` : ''
  const roda = naoLidos.slice(0, MAX_NOMES_NA_PERGUNTA).map(s => `rodar o script ${s.nome} (a trava nao leu o script: ${s.porque})`).join(', ')
  const grava = autonomia ? 'mudar pelo terminal o _contexto/autonomia.md, o arquivo que diz o que a IA pode fazer sem perguntar' : ''
  const fora = foraDoAllow.slice(0, MAX_NOMES_NA_PERGUNTA).join(', ')
  const quer = [apaga ? apaga + deOnde + ', sem volta' : '', roda, grava, fora].filter(Boolean).join(', e tambem ')
  return `Pergunta da trava barrar-perigoso, regra ${regra}: A IA quer ${quer}. Pode? Comando: ${mostrado}`
}

// 5.52 (chat 2, Task 2f, 2026-11-05): decisao 2 das pendentes, script lido. O script que o comando manda rodar por
// bash, sh, source, . (ponto), & x.ps1 (e o .ps1, o bat e o .cmd na posicao de programa), powershell -File, pwsh
// -File (e o pwsh com o .ps1 solto), call e cmd /c com o bat ou o .cmd, e lido e julgado como se fosse digitado,
// com o shell dele (bash, sh, source e . = Bash, o .ps1 e o -File = PowerShell, o bat, o .cmd e o call = cmd): o
// ehPerigoso barra, a perguntaDeApagar (com o alvo relativo a pasta do comando, a temporaria e a lista fechada
// valendo) e o apagaDeVez perguntam. O corpo do heredoc que o cat ou o tee grava num arquivo e o mesmo comando roda
// vale no lugar do arquivo do disco (com >> ou tee -a, os dois). Um nivel so: o script de dentro do script nao e
// lido. Teto de 256 KB; o BOM do UTF-8, o UTF-16 (com BOM, ou sem BOM com NUL entre as letras) e o CRLF se
// decodificam, como leitura a mais da leitura crua (T55). O script que a trava nao acha, nao abre, maior que o teto,
// com variavel ou curinga no caminho, ou com o caminho relativo depois de o comando mudar de pasta (cd, env -C,
// pwsh -WorkingDirectory) pergunta pela regra script-nao-lido. Excecao: o caminho real dentro de
// realpath(CLAUDE_PROJECT_DIR, senao o cwd)/.claude/skills nao e lido (o /otimizar-pc nao pergunta de novo o que a
// pessoa aprovou por bloco); o .. e o atalho ou juncao que leva pra fora dela sao lidos, e o arquivo que o heredoc
// grava ali tambem. Fora do projeto (source ~/.bashrc) le igual: so pergunta se nao conseguir ler. So abre arquivo
// quando o comando tem uma dessas formas. Furos nomeados no T53: o ./x.sh direto, o bash < x.sh, o cat x.sh | bash,
// o bash <(...), o node e o python rodando arquivo, o here-string do PowerShell gravando .ps1 e o heredoc gravado
// depois de rodado no mesmo comando (vale o corpo, nao o disco)
export const REGRA_SCRIPT_NAO_LIDO = 'script-nao-lido'
export const MAX_BYTES_DO_SCRIPT = 256 * 1024
const NAO_ACHOU = 'nao achou o arquivo'
const NAO_ABRE = 'nao conseguiu abrir o arquivo'
const GRANDE = 'arquivo maior que 256 KB'
const ESCONDIDO = 'o caminho tem variavel ou curinga'
const MUDOU_PASTA = 'o comando muda de pasta antes'
const REGRAVADO = 'o comando grava por cima do script'
const MAX_NOME_DO_SCRIPT = 120
// 5.52 (chat 2, Task 2f, revisao interna): quem grava arquivo (cp, mv, tee, sed -i, Copy-Item, Set-Content...); a
// palavra solta dele, ou o destino do > e do >>, que e o script rodado faz o script nao ser lido (o disco e o velho)
const GRAVAM = new Set(['cp', 'mv', 'install', 'ln', 'tee', 'dd', 'copy', 'move', 'xcopy', 'copy-item', 'cpi',
  'move-item', 'mi', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'rename-item', 'ren', 'rni'])
// cmd e PowerShell rodam o script chamado sem a extensao (`call deploy`, `& ./deploy`): as que a trava procura
const EXTENSOES_SEM_NOME = { cmd: ['bat', 'cmd'], PowerShell: ['ps1', 'bat', 'cmd'] }
const RE_EXTENSAO_DE_SCRIPT = /\.(ps1|bat|cmd)$/i
const shellDaExtensao = (t, padrao) => {
  const m = RE_EXTENSAO_DE_SCRIPT.exec(t)
  return !m ? padrao : m[1].toLowerCase() === 'ps1' ? 'PowerShell' : 'cmd'
}
// as opcoes do powershell e do pwsh que pedem valor (o valor nao e o script)
const PS_COM_VALOR = ['executionpolicy', 'windowstyle', 'configurationname', 'outputformat', 'inputformat', 'version',
  'psconsolefile', 'settingsfile', 'custompipename']
const PS_COM_VALOR_CURTA = new Set(['ep', 'ex', 'w', 'o', 'of', 'i', 'if', 'v', 'config'])
const RE_CURINGA_NO_SCRIPT = /[*?[\]{}`]/
// o script de um comando simples (palavras do comandosSimples), ou nada; achados.mudou liga com a troca de pasta
// o nome que roda script, que o pulo de quem vem antes nunca come (`sudo -E bash x.sh`)
const RODA_SCRIPT = new Set(['bash', 'sh', 'source', 'powershell', 'pwsh', 'cmd', 'call'])
// 5.52 (chat 2, Codex final, 2026-11-07): a palavra de controle do bash que abre comando (`if true; then bash x.sh;
// fi`, `for ...; do bash x.sh; done`, `! bash x.sh`) vem antes do programa e se pula, so no comeco do comando ou
// depois de outra (`if ! bash x.sh`); antes o then e o do paravam a procura e o script nem era lido
const CONTROLE_DO_BASH = new Set(['if', 'then', 'do', 'else', 'elif', 'while', 'until', '!', '{', 'coproc'])
// pula quem vem antes do programa nas palavras p desde a k e devolve onde o programa esta. Depois de quem lanca outro
// programa (sudo, env, timeout, nice...), o numero e o valor da opcao tambem se pulam (`sudo -u root bash x.sh`,
// `timeout 5 sh x.sh`), como no lerEmbrulho. para(t, nome) diz o programa procurado, que o pulo nunca come;
// aoPular(t, k) ve cada palavra pulada. Lancado diz se passou por quem lanca (LANCADORES, LANCADORES_DO_EMBRULHO, builtin)
// 5.52 (chat 2, Task 2f, comum, 2026-11-06): a atribuicao com aspas no valor (`A='b' bash x.sh`, `env
// TMPDIR="..." bash x.sh`) tambem se pula; antes a aspa parava a procura e o script nem era lido
// 5.52 (chat 3, Task 3c, Codex comum): saiu do scriptDoComando pra o escapaDoAllow pular o mesmo embrulho
// 5.52 (chat 3, Task 3c, segunda Codex comum): o argumento do lancador entre aspas se le como o shell o le (`timeout
// "30"`, `nice "-n" '5'`): o comandosSimples ja tirou as aspas do t. A palavra que a trava nao le com certeza (com $ ou
// crase fora da aspa simples, o $ escapado na dupla, o pedaco entre aspas emendado em outro), fora a atribuicao, depois
// de um lancador liga o pulados.incerto, pro escapaDoAllow perguntar; o pulo dela segue a regra de antes
const palavraIncerta = w => w.aspas === 'escapada' || (w.aspas !== "'" && /[$`]/.test(w.t)) || (!!w.aspas && !!w.ps && w.ps.length > 1)
function pularEmbrulho(p, k, para, aoPular, pulados = []) {
  let lancado = false
  while (k < p.length && p[k].t !== '.') {
    const t = p[k].t
    const atribuicao = /^\w+=/.test(t)
    if (lancado && !atribuicao && palavraIncerta(p[k])) pulados.incerto = true
    if (p[k].aspas && !atribuicao && !(lancado && !palavraIncerta(p[k]))) break
    const nome = nomeDoPrograma(t)
    if (para(t, nome)) break
    // 5.52 (chat 2, Task 2f, revisao interna): o `builtin source x.sh` do bash roda o script
    if (LANCADORES.has(nome) || LANCADORES_DO_EMBRULHO.has(nome) || nome === 'builtin') lancado = true
    else if (!pulaAntesDoApagador(t, k) && !(lancado && k > 0 && (/^\d[\d.]*[smhd]?$/.test(t) || p[k - 1].t.startsWith('-')))) break
    if (aoPular) aoPular(t, k)
    pulados.push(nome)
    k++
  }
  return k
}
function scriptDoComando(p, padrao, achados) {
  let k = 0
  // o cabecalho do heredoc (`cat > x.sh <<'EOF'`) fica com o heredocsGravados, que le o corpo
  const doHeredoc = p.some(w => w.t.startsWith('<<') && !w.t.startsWith('<<<'))
  if (!doHeredoc) {
    for (let i = 0; i < p.length; i++) {
      const r = p[i].aspas ? null : /^\d*&?>>?(.*)$/.exec(p[i].t)
      const destino = r && (r[1] || (p[i + 1] && p[i + 1].t))
      if (destino && !destino.startsWith('&')) achados.gravam.push(destino)
    }
  }
  let noCmd = false
  while (padrao === 'Bash' && k < p.length && !p[k].aspas && CONTROLE_DO_BASH.has(p[k].t)) k++
  for (;;) {
    k = pularEmbrulho(p, k, (t, nome) => RODA_SCRIPT.has(nome) || RE_EXTENSAO_DE_SCRIPT.test(t), (t, j) => {
      if (j > 0 && RE_OPCAO_DE_PASTA.test(t)) achados.mudou = true
    })
    if (!p[k]) return
    const t = p[k].t
    const nome = nomeDoPrograma(t)
    if (CDS_DO_APAGAR.has(nome)) { achados.mudou = true; return }
    if (!doHeredoc && (GRAVAM.has(nome) || (nome === 'sed' && p.some(w => /^-[a-zA-Z]*i|^--in-place/.test(w.t))))) {
      for (const w of p.slice(k + 1)) if (!/^[-<>]/.test(w.t)) achados.gravam.push(w.t.replace(/^of=/, ''))
      return
    }
    // 5.52 (chat 2, Task 2f, comum, 2026-11-06): o script dado ao bash, ao sh, ao source e ao . do bash, e ao
    // powershell e ao pwsh, e lido no shell de quem o roda (fixo); a extensao so decide no chamado direto, no call e
    // no cmd /c (antes o `bash x.ps1` com `rm -rf .\dist` se lia como PowerShell e o dist calava)
    const poe = (w, shell, fixo) => { if (w && !w.t.startsWith('<')) achados.lista.push({ t: w.t, shell: fixo ? shell : shellDaExtensao(w.t, shell), mudou: achados.mudou }) }
    // o chamado sem a extensao (`call deploy`, `& ./deploy`): a trava procura o arquivo com cada extensao que o
    // shell tenta; sem nenhum, e programa e segue calado
    const semExtensao = (w, shell) => {
      if (w && !w.t.startsWith('<') && !/\.[^\\\/.]+$/.test(w.t)) achados.lista.push({ t: w.t, shell, mudou: achados.mudou, exts: EXTENSOES_SEM_NOME[shell] })
    }
    // no PowerShell o ponto tambem chama comando (`. rm -r pasta`, da 5.40): la so o .ps1 e script
    if (t === '.' || nome === 'source') {
      const w = p[k + 1] && p[k + 1].t === '--' ? p[k + 2] : p[k + 1]
      if (padrao === 'Bash' || (w && RE_EXTENSAO_DE_SCRIPT.test(w.t))) poe(w, padrao, padrao === 'Bash')
      else if (w && /[\\\/]/.test(w.t)) semExtensao(w, 'PowerShell')
      return
    }
    if (nome === 'bash' || nome === 'sh') {
      for (let j = k + 1; j < p.length; j++) {
        const a = p[j].t
        if (!p[j].aspas && a === '--') { poe(p[j + 1], 'Bash', true); return }
        // 5.52 (chat 2, Task 2f, revisao interna): o -o e o -O pedem valor (`bash -o pipefail x.sh`), tambem no fim
        // do grupo de letras (`bash -euo pipefail x.sh`); antes o valor virava o nome do script
        if (!p[j].aspas && OPCAO_DO_SHELL_COM_VALOR.has(a)) { j++; continue }
        if (!p[j].aspas && /^-[a-zA-Z]+$/.test(a)) { if (/[cs]/.test(a)) return; if (/[oO]$/.test(a)) j++; continue }
        if (!p[j].aspas && /^[-+]/.test(a)) continue
        poe(p[j], 'Bash', true)
        return
      }
      return
    }
    if (nome === 'powershell' || nome === 'pwsh') {
      for (let j = k + 1; j < p.length; j++) {
        const a = p[j].t
        const o = p[j].aspas ? null : RE_OPCAO.exec(a.startsWith('--') ? a.slice(1) : a)
        if (!o) { if (nome === 'pwsh' || RE_EXTENSAO_DE_SCRIPT.test(a)) poe(p[j], 'PowerShell', true); return }
        const n = o[1].toLowerCase()
        if ('command'.startsWith(n) || 'encodedcommand'.startsWith(n) || n === 'ec') return
        if ('file'.startsWith(n)) { poe(p[j + 1], 'PowerShell', true); return }
        if (n === 'wd' || (n.length >= 2 && 'workingdirectory'.startsWith(n))) { achados.mudou = true; j++; continue }
        if (PS_COM_VALOR_CURTA.has(n) || (n.length >= 2 && PS_COM_VALOR.some(v => v.startsWith(n)))) j++
      }
      return
    }
    if (nome === 'call') {
      if (p[k + 1] && RE_EXTENSAO_DE_SCRIPT.test(p[k + 1].t)) poe(p[k + 1], 'cmd')
      else semExtensao(p[k + 1], 'cmd')
      return
    }
    if (nome === 'cmd') {
      let j = k + 1
      while (j < p.length && !p[j].aspas && RE_CHAVES_DO_CMD.test(p[j].t) && !RE_CHAVE_QUE_RODA.test(p[j].t)) j++
      if (!p[j] || p[j].aspas || !RE_CHAVES_DO_CMD.test(p[j].t)) return
      k = j + 1
      noCmd = true
      continue
    }
    if (RE_EXTENSAO_DE_SCRIPT.test(t)) poe(p[k], padrao)
    else if (noCmd || padrao === 'cmd') semExtensao(p[k], 'cmd')
    else if (padrao === 'PowerShell' && /[\\\/]/.test(t)) semExtensao(p[k], 'PowerShell')
    return
  }
}
// os scripts do comando e dos embrulhados dele (bash -c "bash x.sh"), cada um com o shell que o roda
function procurarScripts(comando, padrao, achados, vistos) {
  const chave = padrao + ' ' + comando
  if (vistos.has(chave)) return
  vistos.add(chave)
  // 5.52 (chat 2, Task 2f, comum, 2026-11-06): o corpo do heredoc de texto (cat ou tee gravando, delimitador entre
  // aspas, a mesma leitura do perguntaDeApagar) nao e comando: o `bash exemplo.sh` de dentro de uma nota nao pergunta.
  // O heredoc dado ao bash (`bash <<'EOF'`) segue varrido, e o corpo gravado segue no heredocsGravados
  const texto = padrao === 'Bash' ? semCorpoDeHeredocDeTexto(comando) : comando
  for (const p of comandosSimples(texto, padrao === 'Bash')) scriptDoComando(p, padrao, achados)
  const { desaspado } = classificarTrechosEntreAspas(texto)
  for (const [trecho, shell] of trechosComShell(texto, desaspado, padrao)) procurarScripts(trecho, shell || padrao, achados, vistos)
}
// o arquivo que o heredoc grava (cat > x, cat <<'EOF' > x, tee x, com >> ou tee -a juntando), pelo caminho sem caixa
const RE_CABECALHO_QUE_GRAVA = /(?:^|[;&(])\s*(cat|tee)((?:\s[^\n]*?)?)<<(-?)[ \t]*(['"]?)([^\s'"<>|;&()]+)\4(.*)$/
function heredocsGravados(comando, cwd, leitura) {
  const gravados = new Map()
  if (!comando.includes('<<')) return gravados
  const linhas = comando.split(LF_DO_HEREDOC).map(l => l.replace(/\r$/, ''))
  for (let i = 0; i < linhas.length; i++) {
    const m = RE_CABECALHO_QUE_GRAVA.exec(linhas[i])
    if (!m || linhas[i].includes('<<<')) continue
    const resto = (m[2] + ' ' + m[6]).trim()
    let destino = null
    let junta = false
    if (m[1] === 'cat') {
      const r = /(>>?)\s*([^\s>]+)/.exec(resto)
      if (r) { destino = r[2]; junta = r[1] === '>>' }
    } else {
      const palavras = resto.split(/\s+/).filter(Boolean)
      junta = palavras.some(w => w === '--append' || /^-[a-z]*a/.test(w))
      destino = palavras.find((w, j) => !/^[-<>]|^\d*>/.test(w) && !(j > 0 && /^\d*>>?$/.test(palavras[j - 1]))) || null
    }
    const tira = l => m[3] ? l.replace(/^\t+/, '') : l
    const corpo = []
    let fim = i + 1
    for (; fim < linhas.length && tira(linhas[fim]) !== m[5]; fim++) corpo.push(tira(linhas[fim]))
    const caminho = destino ? caminhoDoAlvo(destino.replace(/^['"]|['"]$/g, ''), cwd, leitura) : null
    // 5.52 (chat 2, Task 2f, comum, 2026-11-06): o segundo heredoc no mesmo arquivo soma ao primeiro em vez de
    // trocar (antes o `cat >> x.sh` de depois apagava o `rm -rf` do `cat > x.sh`); com o > tambem soma, leitura a mais
    const antes = caminho ? gravados.get(semCaixa(caminho)) : null
    if (caminho) gravados.set(semCaixa(caminho), antes
      ? { corpo: antes.corpo + LF_DO_HEREDOC + corpo.join(LF_DO_HEREDOC), junta: antes.junta || junta }
      : { corpo: corpo.join(LF_DO_HEREDOC), junta })
    i = fim
  }
  return gravados
}
// UTF-8 (com ou sem BOM) ou UTF-16 (com BOM, ou sem BOM com NUL entre as letras); devolve as leituras
function decodificar(buf) {
  const par = b => Buffer.from(b.subarray(0, b.length - (b.length % 2)))
  if (buf[0] === 0xff && buf[1] === 0xfe) return [buf.subarray(2).toString('utf16le')]
  if (buf[0] === 0xfe && buf[1] === 0xff) return [par(buf.subarray(2)).swap16().toString('utf16le')]
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return [buf.subarray(3).toString('utf8')]
  if (!buf.includes(0)) return [buf.toString('utf8')]
  let nosPares = 0
  let nosImpares = 0
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0) { if (i % 2) nosImpares++; else nosPares++ }
  // 5.52 (chat 2, Task 2f, revisao interna): o NUL solto num script UTF-8 (o bash roda o resto) nao faz a trava
  // perder a leitura UTF-8: o UTF-16 sem BOM e leitura a mais, nunca no lugar dela (T55)
  return [buf.toString('utf8'), nosImpares >= nosPares ? par(buf).toString('utf16le') : par(buf).swap16().toString('utf16le')]
}
function lerArquivoDeScript(caminho) {
  let info
  try { info = statSync(caminho) } catch { return { porque: NAO_ACHOU } }
  if (!info.isFile()) return { porque: NAO_ABRE }
  if (info.size > MAX_BYTES_DO_SCRIPT) return { porque: GRANDE }
  try { return { textos: decodificar(readFileSync(caminho)) } } catch { return { porque: NAO_ABRE } }
}
// o arquivo que existe com cada extensao que o shell tenta (`call deploy` acha o deploy com a do cmd)
function comExtensao(s, cwd, leitura) {
  const base = s.mudou && !RE_CAMINHO_ABSOLUTO.test(s.t) ? null : caminhoDoAlvo(s.t, cwd, leitura)
  if (base === null) return []
  return s.exts.filter(e => { try { return statSync(base + '.' + e).isFile() } catch { return false } })
    .map(e => ({ t: s.t + '.' + e, shell: shellDaExtensao('.' + e, s.shell), mudou: s.mudou }))
}
function dentroDasSkills(caminho, projeto) {
  try {
    const rel = relative(join(projeto, '.claude', 'skills'), semCaixa(realpathSync.native(caminho)))
    return rel !== '' && rel.split(sep)[0] !== '..' && !isAbsolute(rel)
  } catch { return false }
}
const RE_CAMINHO_ABSOLUTO = /^(?:[a-zA-Z]:|[\\\/~]|\$HOME|\$env:USERPROFILE|%USERPROFILE%)/i
// devolve { lidos: [{ nome, texto, shell }], naoLidos: [{ nome, porque }] }; cada lido sai cru e, quando muda,
// tambem com o CRLF trocado por LF e, no cmd, sem o @ do comeco da linha (leituras a mais)
export function scriptsRodados(comando, opcoes = {}) {
  const lidos = []
  const naoLidos = []
  if (typeof comando !== 'string' || comando.length === 0) return { lidos, naoLidos }
  const cwd = typeof opcoes.cwd === 'string' && opcoes.cwd ? opcoes.cwd : process.cwd()
  const env = opcoes.env && typeof opcoes.env === 'object' ? opcoes.env : process.env
  const padrao = opcoes.ferramenta === 'PowerShell' ? 'PowerShell' : 'Bash'
  const achados = { lista: [], mudou: false, gravam: [] }
  procurarScripts(comando, padrao, achados, new Set())
  if (!achados.lista.length) return { lidos, naoLidos }
  const leitura = leituraDasVariaveis(comando, env, opcoes.ferramenta)
  const gravados = padrao === 'Bash' ? heredocsGravados(comando, cwd, leitura) : new Map()
  const projeto = pastaDoProjeto(env, cwd)
  const regravados = new Set()
  for (const g of achados.gravam) {
    const c = RE_CURINGA_NO_SCRIPT.test(g) ? null : caminhoDoAlvo(g.replace(/^['"]|['"]$/g, ''), cwd, leitura)
    if (c !== null) regravados.add(semCaixa(c))
  }
  const vistos = new Set()
  for (const s of achados.lista.flatMap(s => s.exts ? comExtensao(s, cwd, leitura) : [s])) {
    const nome = s.t.length > MAX_NOME_DO_SCRIPT ? s.t.slice(0, MAX_NOME_DO_SCRIPT) + '...' : s.t
    const caminho = RE_CURINGA_NO_SCRIPT.test(s.t) ? null : caminhoDoAlvo(s.t, cwd, leitura)
    if (caminho === null) { naoLidos.push({ nome, porque: ESCONDIDO }); continue }
    // 5.52 (chat 2, Task 2f, revisao interna): so o cd que vem antes do script conta (s.mudou); o de depois nao
    if (s.mudou && !RE_CAMINHO_ABSOLUTO.test(s.t)) { naoLidos.push({ nome, porque: MUDOU_PASTA }); continue }
    // 5.52 (chat 2, Codex final, 2026-11-07): o mudou entra na chave; antes o mesmo script rodado de novo depois do
    // cd (`bash /p/x.sh; cd ..; bash /p/x.sh`) caia como repetido e o alvo relativo de outra pasta calava
    const chave = s.shell + ' ' + (s.mudou ? 'mudou ' : '') + semCaixa(caminho)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    // o cp, o mv, o > e o sed -i por cima do script no mesmo comando: o disco ainda e o velho
    if (regravados.has(semCaixa(caminho))) { naoLidos.push({ nome, porque: REGRAVADO }); continue }
    const textos = []
    const gravado = gravados.get(semCaixa(caminho))
    if (!gravado || gravado.junta) {
      if (!gravado && dentroDasSkills(caminho, projeto)) continue
      const lido = lerArquivoDeScript(caminho)
      if (lido.porque && !(gravado && lido.porque === NAO_ACHOU)) { naoLidos.push({ nome, porque: lido.porque }); continue }
      if (lido.textos) textos.push(...lido.textos)
    }
    if (gravado) textos.push(gravado.corpo)
    // depois de mudar de pasta, o alvo relativo de dentro e de outra pasta: o cd na frente faz a trava nao le-lo
    const antes = s.mudou ? 'cd .' + LF_DO_HEREDOC : ''
    for (const cru of textos) {
      const lf = cru.replace(/\r\n/g, LF_DO_HEREDOC)
      const leituras = [cru, lf, ...(s.shell === 'cmd' ? [lf.replace(/^([ \t]*)@+/gm, '$1')] : [])]
      for (const texto of new Set(leituras)) lidos.push({ nome, texto: antes + texto, shell: s.shell, confia: leitura.confia })
    }
  }
  return { lidos, naoLidos }
}

// 5.52 (chat 3, Task 3c, decisao 2): o _contexto/autonomia.md guarda a permissao do que a IA faz sozinha. Pela Edit e
// pela Write quem pergunta e a regra permissions.ask do settings; pelo shell ela nao pega, entao a trava pergunta
// quando o comando grava num arquivo com esse nome (em qualquer pasta): o destino do > e do >>, o arquivo que tee,
// mv, Set-Content, Add-Content, Out-File, sed -i e companhia recebem, e o destino do cp, Copy-Item e companhia (a
// ultima palavra ou a do -Destination e do -t). So ler (cat, grep, o add do git, cp dele pra outro) passa calado. Furos
// nomeados no T53: node e python gravando, o nome por variavel ou curinga, e o script que grava por la
// 5.52 (chat 3, Task 3c, revisao interna): tambem perguntam o Tee-Object, o New-Item, o Clear-Content, o truncate, o
// rsync, o ffmpeg (qualquer palavra dele: o allow solta o ffmpeg e o -y grava por cima), o --output e o -o do git (o
// allow solta o git diff e o git log), o >| do bash, o [IO.File]::Write...( do PowerShell e a copia de um autonomia.md
// pra dentro de uma pasta (`cp ../irmao/_contexto/autonomia.md _contexto/`: a ultima palavra sem extensao ou com barra)
export const REGRA_GRAVA_AUTONOMIA = 'grava-autonomia'
const COPIAM = new Set(['cp', 'copy', 'xcopy', 'install', 'ln', 'copy-item', 'cpi', 'rsync'])
const GRAVAM_A_AUTONOMIA = new Set([...GRAVAM, 'tee-object', 'new-item', 'ni', 'clear-content', 'clc', 'truncate', 'rsync', 'ffmpeg', 'ffprobe'])
const RE_DESTINO_DO_COPIA = /^(?:-destination|-t|--target-directory)$/i
const RE_EDITA_NO_LUGAR = /^(?:-[a-zA-Z]*i\S*|--in-place\S*)$/
const RE_IO_FILE_GRAVA = /\[\s*(?:system\.)?io\.file\s*\]\s*::\s*(?:write|append|copy|move|replace|create|open)\w*\s*\([^)]*autonomia\.md/i
const ehAutonomia = t => /(?:^|[\\\/=:])autonomia\.md$/i.test(t.replace(/^['"]+|['"]+$/g, ''))
// a pasta de destino da copia: termina em barra, ou o nome nao tem extensao (`_contexto`, `.`, `..`)
const ehPastaDeDestino = t => /[\\\/]$/.test(t) || !/\.[^\\\/.]+$/.test(t)
const nomeDoGravador = t => t.replace(/^.*[\\\/]/, '').replace(/\.exe$/i, '').toLowerCase()
function gravaAutonomiaNoComando(p) {
  // o > fora de aspas em qualquer pedaco da palavra (`echo x>a.md`, `echo "x">a.md`): o destino e o que vem depois
  for (let i = 0; i < p.length; i++) {
    const ps = p[i].ps || [p[i]]
    for (let j = 0; j < ps.length; j++) {
      if (ps[j].aspas || !ps[j].t.includes('>')) continue
      const depois = ps[j].t.slice(ps[j].t.lastIndexOf('>') + 1) + ps.slice(j + 1).map(x => x.t).join('')
      const destino = depois || (p[i + 1] && p[i + 1].t)
      if (destino && !destino.startsWith('&') && ehAutonomia(destino)) return true
    }
  }
  for (let k = 0; k < p.length; k++) {
    const nome = nomeDoGravador(p[k].t)
    const editaNoLugar = (nome === 'sed' || nome === 'perl') && p.slice(k + 1).some(w => RE_EDITA_NO_LUGAR.test(w.t))
    const resto = p.slice(k + 1)
    if (nome === 'git' && resto.some((w, j) => ehAutonomia(w.t) && (/^--output=/i.test(w.t) || (j > 0 && /^(?:--output|-o)$/.test(resto[j - 1].t))))) return true
    // 5.52 (chat 3, Task 3c, Codex comum): o -o do ffprobe grava, e grudado no nome tambem (`-oautonomia.md`)
    if (nome === 'ffprobe' && resto.some(w => /^-o./.test(w.t) && ehAutonomia(w.t.slice(2)))) return true
    if (!GRAVAM_A_AUTONOMIA.has(nome) && !editaNoLugar) continue
    if (!COPIAM.has(nome)) { if (resto.some(w => ehAutonomia(w.t))) return true; continue }
    const soltas = resto.filter(w => !/^-/.test(w.t))
    if (soltas.length && ehAutonomia(soltas[soltas.length - 1].t)) return true
    if (soltas.length > 1 && ehPastaDeDestino(soltas[soltas.length - 1].t) && soltas.slice(0, -1).some(w => ehAutonomia(w.t))) return true
    if (resto.some((w, j) => j > 0 && RE_DESTINO_DO_COPIA.test(resto[j - 1].t) && ehAutonomia(w.t))) return true
    if (resto.some(w => /^(?:-destination:|--target-directory=)/i.test(w.t) && ehAutonomia(w.t))) return true
  }
  return false
}
// o comando e os embrulhados dele (bash -c "...", powershell -Command "..."), como o procurarScripts
function lerGravaAutonomia(comando, padrao, vistos) {
  const chave = padrao + ' ' + comando
  if (vistos.has(chave)) return false
  vistos.add(chave)
  const texto = padrao === 'Bash' ? semCorpoDeHeredocDeTexto(comando) : comando
  if (RE_IO_FILE_GRAVA.test(texto)) return true
  // o >| do bash grava por cima mesmo com o noclobber; sem a troca o | partia o comando e o destino sumia
  if (comandosSimples(padrao === 'Bash' ? texto.replace(/>\|/g, '> ') : texto, padrao === 'Bash').some(gravaAutonomiaNoComando)) return true
  const { desaspado } = classificarTrechosEntreAspas(texto)
  for (const [trecho, shell] of trechosComShell(texto, desaspado, padrao)) if (lerGravaAutonomia(trecho, shell || padrao, vistos)) return true
  return false
}
export function gravaAutonomia(comando, opcoes = {}) {
  if (typeof comando !== 'string' || !/autonomia\.md/i.test(comando)) return false
  return lerGravaAutonomia(comando, opcoes.ferramenta === 'PowerShell' ? 'PowerShell' : 'Bash', new Set())
}

// 5.52 (chat 3, Task 3c, revisao interna): o permissions.allow do settings do _modelo (PERMISSOES_DO_KIT do
// atualizar-projeto) casa o comando da Bash pelo comeco do texto, sem olhar o .. nem o que vem depois. Entao a trava
// pergunta quando o node, o python ou o python3 roda um caminho de .claude/skills/ ou _ferramentas/ que sai dali pelo
// .. (`node .claude/skills/../../apaga.mjs`), e quando o npm install ou ci --prefix .claude/skills/ traz .. no caminho
// ou outra palavra solta depois dele (o pacote de fora, com o postinstall dele). So na ferramenta Bash, a unica que o
// allow solta. Furo nomeado no T53: o script gravado dentro de .claude/skills/ ou _ferramentas/ roda calado
export const REGRA_FORA_DO_ALLOW = 'fora-do-allow'
const RE_PASTA_DO_ALLOW = /^(?:\.\/)?(?:\.claude\/skills|_ferramentas)\//
const RE_PASTA_DO_NPM = /^(?:\.\/)?\.claude\/skills\//
const RODA_PELO_ALLOW = new Set(['node', 'python', 'python3'])
const temPontoPonto = t => /(?:^|[\\\/])\.\.(?:[\\\/]|$)/.test(t)
// 5.52 (chat 3, Task 3c, Codex comum): o npm install e o npm ci com --prefix .claude/skills/ so passam calados no
// formato exato do allow: o --prefix e uma pasta de um nivel so, sem .., e nenhuma palavra depois. O segundo --prefix
// (`--prefix=../fora` ganha do primeiro), a opcao e o pacote perguntam
const RE_PASTA_DE_UMA_SKILL = /^(?:\.\/)?\.claude\/skills\/(?!\.\.?\/?$)[^\\\/\s]+\/?$/
// 5.52 (chat 3, Task 3c, Codex comum): o Claude Code tira embrulhos antes de casar o allow (code.claude.com/docs/en/
// permissions, "Wrappers", conferido em 2026-11-07: timeout, time, nice, nohup, stdbuf, command, builtin, o noglob do
// zsh, o xargs sem opcao e a atribuicao de variavel conhecida). A trava pula os mesmos pelo pularEmbrulho; o noglob,
// que ela nao conhece, e o xargs, que traz palavra que ela nao le, perguntam quando vem antes do node, do python ou do npm
const EMBRULHOS_QUE_A_TRAVA_NAO_LE = new Set(['noglob', 'xargs'])
const ehDoAllow = t => RODA_PELO_ALLOW.has(t) || t === 'npm'
export function escapaDoAllow(comando, opcoes = {}) {
  if (typeof comando !== 'string' || (opcoes.ferramenta && opcoes.ferramenta !== 'Bash')) return []
  const achados = []
  const texto = semCorpoDeHeredocDeTexto(comando)
  // a substituicao parte o comando no comandosSimples (`timeout $(echo 30) node ...`, com crase tambem): o embrulho que
  // fica sem programa, ou acaba no $, deixa incerto o comando simples seguinte
  const temSubstituicao = /[$][(]|`/.test(texto)
  let depoisDaSubstituicao = false
  for (const p of comandosSimples(texto, true)) {
    const pulados = []
    let k = pularEmbrulho(p, 0, ehDoAllow, null, pulados)
    if (p[k] && nomeDoPrograma(p[k].t) === 'noglob') { pulados.push('noglob'); k = pularEmbrulho(p, k + 1, ehDoAllow, null, pulados) }
    const w = p.slice(k).map(x => x.t)
    if (depoisDaSubstituicao && ehDoAllow(w[0])) pulados.incerto = true
    if (temSubstituicao && pulados.length && (k >= p.length || /[$]$/.test(p[p.length - 1].t))) depoisDaSubstituicao = true
    if (pulados.incerto && w.some(ehDoAllow)) { achados.push(`rodar ${p.map(x => x.t).join(' ')} (a trava nao le com certeza o que vem antes do programa)`); continue }
    if (!ehDoAllow(w[0])) continue
    const naoLe = pulados.find(n => EMBRULHOS_QUE_A_TRAVA_NAO_LE.has(n))
    if (naoLe) { achados.push(`rodar ${p.map(x => x.t).join(' ')} (depois do ${naoLe} a trava nao le o comando inteiro)`); continue }
    if (RODA_PELO_ALLOW.has(w[0]) && w[1] && RE_PASTA_DO_ALLOW.test(w[1]) && temPontoPonto(w[1])) {
      achados.push(`rodar ${w[0]} ${w[1]} (o caminho sai da pasta do kit pelo ..)`)
    } else if (w[0] === 'npm' && (w[1] === 'install' || w[1] === 'ci') && w[2] === '--prefix' && w[3] && RE_PASTA_DO_NPM.test(w[3]) &&
      (w.length > 4 || !RE_PASTA_DE_UMA_SKILL.test(w[3]) || temPontoPonto(w[3]))) {
      achados.push(`rodar ${w.join(' ')} (instala fora do que a skill pede: caminho com .. ou mais fundo, outro --prefix, opcao ou pacote a mais)`)
    }
  }
  return achados
}
const FERRAMENTA_DO_SHELL = { Bash: 'Bash', PowerShell: 'PowerShell', cmd: undefined }

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
    const cwd = entrada && entrada.cwd
    const ferramenta = entrada && entrada.tool_name
    let motivo
    // 5.52 (chat 2, Task 2f, 2026-11-05): o script rodado (ver scriptsRodados) se julga depois do comando como veio,
    // pelas mesmas funcoes: barrar ganha de perguntar, e a barrada diz de qual script veio
    let scripts = { lidos: [], naoLidos: [] }
    let doScript = null
    try {
      motivo = ehPerigoso(comando, { cwd })
      if (!motivo) {
        scripts = scriptsRodados(comando, { cwd, ferramenta })
        for (const s of scripts.lidos) {
          motivo = ehPerigoso(s.texto, { cwd, shell: s.shell })
          if (motivo) { doScript = s.nome; break }
        }
      }
    } catch { motivo = MOTIVO_ERRO_INTERNO }
    if (!motivo) {
      // rodada 5.40: barrar ganha de perguntar (o ehPerigoso vem antes). Apagar pasta pergunta pelo
      // permissionDecision "ask" (doc conferida em 2026-11-01, code.claude.com/docs/en/hooks,
      // "PreToolUse decision control": saida 0 com o JSON no stdout, e o motivo aparece pra pessoa na
      // caixa de confirmacao). Medido no Claude Code 2.1.312: no `claude -p` a pergunta vira recusa,
      // inclusive com as perguntas desligadas. Sem process.exit aqui: ele podia cortar o stdout no meio.
      // 5.49 (bloco 5, 2026-11-03): a pergunta vale nas tres ferramentas, nao so na PowerShell, e
      // a ferramenta diz qual shell le a variavel da temporaria. Erro dentro dela barra com a regra
      // erro-interno, como no ehPerigoso (bloco 4, revisao interna: antes virava a pergunta)
      // 5.52 (chat 2, Task 2d, 2026-11-05): o apaga de vez entra na mesma pergunta do apagar pasta (uma so)
      // 5.52 (chat 2, Task 2f, 2026-11-05): o script lido soma os alvos e o apaga de vez dele, e o que a trava nao
      // leu entra na mesma pergunta pela regra script-nao-lido
      let razao = null
      try {
        const alvos = [...(perguntaDeApagar(comando, { cwd, ferramenta }) || [])]
        let deVez = apagaDeVez(comando)
        const deScripts = []
        // 5.52 (chat 3, Task 3c): gravar no _contexto/autonomia.md pelo shell pergunta, no comando e no script lido
        let autonomia = gravaAutonomia(comando, { ferramenta })
        for (const s of scripts.lidos) {
          const doScript = perguntaDeApagar(s.texto, { cwd, ferramenta: FERRAMENTA_DO_SHELL[s.shell], confia: s.confia })
          const deVezDoScript = apagaDeVez(s.texto, { shell: s.shell })
          const gravaDoScript = gravaAutonomia(s.texto, { ferramenta: FERRAMENTA_DO_SHELL[s.shell] })
          if (doScript) alvos.push(...doScript)
          if (deVezDoScript && !deVez) deVez = deVezDoScript
          if (gravaDoScript) autonomia = true
          if (doScript || deVezDoScript || gravaDoScript) deScripts.push(s.nome)
        }
        // 5.52 (chat 3, Task 3c, revisao interna): o comando que o allow solta mas sai dele pelo .. ou pelo pacote a mais
        const foraDoAllow = escapaDoAllow(comando, { ferramenta })
        if (alvos.length || deVez || scripts.naoLidos.length || autonomia || foraDoAllow.length) {
          razao = textoDaPergunta([...new Set(alvos)], comando, { cwd, ferramenta, deVez, naoLidos: scripts.naoLidos, scripts: deScripts, autonomia, foraDoAllow })
        }
      } catch { motivo = MOTIVO_ERRO_INTERNO }
      if (razao) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: {
          hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: razao,
        } }))
        return
      }
      if (!motivo) process.exit(0)
    }
    // 5.49 (bloco 4, 2026-11-03): saiu o "Pare aqui". A mensagem diz a trava e a regra, a IA
    // repete os dois pro usuario e decide o proximo passo sozinha, sem refazer a acao por outro caminho
    const regra = REGRA_DO_MOTIVO.get(motivo) || 'erro-interno'
    // 5.49 (autonomia, 2026-11-04, bloco 4: "a IA recebe o aviso e decide sozinha"): no erro-interno a trava
    // so nao conseguiu ler o comando, entao o recado autoriza reescrever mais simples ou seguir por
    // ferramenta equivalente, avisando; as outras regras seguem sem refazer por outro caminho
    const fim = regra === 'erro-interno'
      ? 'Diga ao usuario o nome da trava e da regra. A trava so nao conseguiu ler o comando: pode reescrever ele ' +
        'mais simples ou seguir por uma ferramenta equivalente, e avise o usuario do que fez.'
      : 'Diga ao usuario o nome da trava e da regra e decida o proximo passo; nao refaca esta acao por outro caminho.'
    const dito = doScript ? `${motivo} (no script ${doScript})` : motivo
    process.stderr.write(`Barrada pela trava barrar-perigoso, regra ${regra}: ${dito}. ${fim}\n`)
    process.exit(2)
  })
}
