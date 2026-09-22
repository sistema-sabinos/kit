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

const PADROES_ESCRITOR_DE_TEXTO = [
  /\becho\s+$/i,
  /\bprintf\s+$/i,
  // -am e a forma combinada de -a (adiciona tudo) e -m (mensagem); --message e a forma
  // longa. O grupo opcional deixa passar outra flag no meio, tipo
  // `git commit --allow-empty -m "..."`
  /\bgit\s+commit\s+(?:-\S+\s+)*(?:-a?m|--message)\s+$/i,
  /\bgit\s+tag\s+(?:-\S+\s+)*-m\s+$/i,
  // correcao 7 (quinta revisao): "echo" no PowerShell e so um apelido; o nome de
  // verdade e Write-Output (doc: "PowerShell includes the following aliases for
  // Write-Output: All platforms: echo; Windows: write"). O apelido "echo" ja batia no
  // padrao acima (a palavra e igual); faltava o nome de verdade e o outro apelido
  // ("write"), que o aluno de Windows tambem pode digitar.
  /\bWrite-Output\s+$/i,
  /\bwrite\s+$/i,
  // paridade Windows do echo/printf: no PowerShell, anotar licao se faz com
  // Add-Content, Set-Content ou Out-File, geralmente com um nome de arquivo ou -Path
  // antes do texto (`Add-Content notas.md "..."`, `Set-Content -Path x -Value "..."`)
  new RegExp(String.raw`\b(?:Add-Content|Set-Content|Out-File)\b(?:\s+-?${TOKEN_SEGURO})*\s+$`, 'i'),
  // grep/rg/findstr/Select-String so leem e comparam texto, nunca executam o padrao de
  // busca; procurar licao antiga sobre comando perigoso (`grep -rn "rm -rf" licoes.md`)
  // e rotina dentro do kit, e nao pode continuar sendo barrado. correcao 7: findstr e
  // do mundo do cmd, entao a opcao dele e com barra (/s), nao traco; o traco continua
  // valendo pro grep/rg
  /\bgrep\b(?:\s+-\S+)*\s+$/i,
  /\brg\b(?:\s+-\S+)*\s+$/i,
  /\bfindstr\b(?:\s+\/\S+)*\s+$/i,
  new RegExp(String.raw`\bSelect-String\b(?:\s+-?${TOKEN_SEGURO})*\s+$`, 'i'),
  // correcao 7: opcao com "=" no meio (`git log --grep="..."`) nao tem espaco antes da
  // aspa, entao nao usa o "\s+$" das outras; git log tambem so le, nunca executa a
  // mensagem que esta procurando
  /\bgit\s+log\b(?:\s+-\S+)*\s+--grep=$/i,
]

function ehEscritorDeTexto(textoAntesDaAspa) {
  return PADROES_ESCRITOR_DE_TEXTO.some(re => re.test(textoAntesDaAspa))
}

// Dois limites conhecidos, fora do escopo desta trava de proposito: resolver os dois
// de verdade pede um analisador de shell (tokenizar variavel, aspas, escape), nao regex.
// Confirmados contra o codigo de hoje (nao e so teoria, os dois passam batido agora):
// 1. Comando montado em duas variaveis separadas e rodado por expansao depois:
//    `CMD=rm; ARGS=-rf; $CMD $ARGS pasta` (nenhum padrao ve "rm" e "-rf" juntos, porque
//    nunca aparecem na mesma janela de texto).
// 2. Apostrofo no meio de uma citacao legitima criando um par de aspas com uma aspa
//    real mais adiante, e o comando perigoso caindo picotado entre o texto que sobra
//    fora do par (onde falta uma das duas flags) e o texto suspeito extraido de dentro
//    dele (onde falta a outra): `rm -r pasta's_backup -f && echo it's feito`.
function classificarTrechosEntreAspas(comando) {
  const RE_ASPAS = /"([^"]*)"|'([^']*)'/g
  const suspeitos = []
  let limpo = ''
  let ultimoIndice = 0
  let m
  while ((m = RE_ASPAS.exec(comando))) {
    const antes = comando.slice(0, m.index)
    const conteudo = m[1] !== undefined ? m[1] : m[2]
    limpo += comando.slice(ultimoIndice, m.index)
    ultimoIndice = RE_ASPAS.lastIndex
    if (conteudo && !ehEscritorDeTexto(antes)) suspeitos.push(conteudo)
  }
  limpo += comando.slice(ultimoIndice)
  return { limpo, suspeitos }
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
const RE_RM_RECURSIVO_E_FORCADO =
  /\brm\b(?=[^\n]*\s(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?:\s|$))(?=[^\n]*\s(?:-[a-zA-Z]*f[a-zA-Z]*|--force)(?:\s|$))/i

// correcao 7 (quinta revisao): -WhatIf so simula, nunca apaga nada, igual ao --dry-run
// do git clean que a trava ja respeita. Vale pra qualquer comando desta familia
// (Remove-Item e apelidos, rm), entao mora num teste a parte em vez de repetido em
// cada padrao. "-wi" e o alias oficial; o resto e prefixo de "WhatIf" (abreviacao que
// o PowerShell aceita).
const RE_WHATIF = /\s-(?:wh(?:a(?:t(?:i(?:f)?)?)?)?|wi)\b/i

function rmPerigoso(comando) {
  if (RE_WHATIF.test(comando)) return false
  const segmentos = semTrechoEntreAspas(comando).split(/&&|\|\||[;&|`\n]/)
  return segmentos.some(seg => RE_RM_RECURSIVO_E_FORCADO.test(seg))
}

// correcao 7: Remove-Item e os apelidos oficiais dele que nao sao "rm" (ver comentario
// da regra abaixo). So exige a ideia de recursivo (nunca -Force, doc na regra abaixo).
function removeItemPerigoso(comando) {
  if (RE_WHATIF.test(comando)) return false
  return /\b(?:Remove-Item|ri|del|erase|rd|rmdir)\b(?=[^\n]*\s-r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?\b)/i.test(comando)
}

// correcao 7: a regra do pipe nao pode depender de um nome literal do lado esquerdo
// (Get-ChildItem tem apelidos gci/dir/ls, e podia vir qualquer outro comando gerando a
// lista), entao aceita QUALQUER coisa antes do "|" e olha so o que vem depois: um
// apelido de Remove-Item direto, ou um ForEach-Object/% cujo bloco chama Remove-Item.
function removeItemPipePerigoso(comando) {
  if (RE_WHATIF.test(comando)) return false
  const RE_ALIAS = /(?:Remove-Item|ri|del|erase|rd|rmdir|rm)/.source
  // "%" nao e caractere de palavra, entao \b logo depois dele nunca casa (nem "{" nem
  // " " sao \w); o \b so faz sentido nas duas outras formas, que sao palavras de verdade
  return new RegExp(String.raw`\|\s*${RE_ALIAS}\b`, 'i').test(comando) ||
    new RegExp(String.raw`\|\s*(?:%|foreach\b|ForEach-Object\b)[^\n]*\b${RE_ALIAS}\b`, 'i').test(comando)
}

const PERIGOS = [
  { teste: rmPerigoso, motivo: 'apaga uma pasta inteira de uma vez' },
  // --force-with-lease e a variante segura (nao sobrescreve o que outra pessoa subiu);
  // barrar ela empurraria o aluno avancado a desligar a trava inteira, entao o
  // lookahead negativo deixa exatamente essa variante passar.
  { re: /\bgit\s+push\b[^\n]*--force(?!-with-lease)\b/, motivo: 'reescreve o historico do backup no GitHub' },
  { re: /\bgit\s+push\b[^\n]*\s-f(?:\s|$)/, motivo: 'reescreve o historico do backup no GitHub' },
  // empurrao forcado tambem se escreve com "+" na frente do nome da branch, sem --force
  { re: /\bgit\s+push\b[^\n]*\s\+\S+/, motivo: 'reescreve o historico do backup no GitHub' },
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
  { re: /\bgit\s+clean\b(?=[^\n]*\s-[fdxniqeX]*f[fdxniqeX]*\b)(?=[^\n]*\s-[fdxniqeX]*d[fdxniqeX]*\b)/, motivo: 'apaga arquivo e pasta fora do controle de versao, sem confirmacao' },
  // "sudo" no meio do pipe (curl ... | sudo bash) e o jeito mais comum de instalar
  // script de terceiro com privilegio elevado, e tem que continuar batendo
  { re: /\bcurl\b[^\n]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/, motivo: 'roda um script baixado da internet sem ninguem ler' },
  { re: /\bwget\b[^\n]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/, motivo: 'roda um script baixado da internet sem ninguem ler' },
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
  { re: /\b(?:rmdir|rd)\b(?=[^\n]*\s\/s\b)/i, motivo: 'apaga uma pasta inteira de uma vez' },
  // correcao 7: "erase" e sinonimo de "del" no cmd e aceita a mesma sintaxe (/s), doc da
  // Microsoft confirma os dois como apelido do mesmo Remove-Item; cobrir um so e deixar
  // o gemeo de fora era o buraco que esta rodada veio fechar
  { re: /\b(?:del|erase)\b(?=[^\n]*\s\/s\b)/i, motivo: 'apaga arquivo de varias pastas de uma vez' },
  // "format" sozinho e o comando de formatar disco; a negativa evita casar cmdlet tipo
  // Format-Table/Format-List, que so mostra dado na tela e nao apaga nada
  { re: /\bformat\b(?!-)(?=[^\n]*\b[a-zA-Z]:(?:\\|\/|\s|$))/i, motivo: 'apaga tudo do disco pra sempre' },
]

function testarPadroes(comando) {
  for (const p of PERIGOS) {
    const bateu = p.teste ? p.teste(comando) : p.re.test(comando)
    if (bateu) return p.motivo
  }
  return null
}

export function ehPerigoso(comando) {
  if (typeof comando !== 'string' || comando.length === 0) return null
  const { limpo, suspeitos } = classificarTrechosEntreAspas(comando)
  // menor 1: a limpeza de aspas vale pra todos os padroes, nao so pro rm, senao
  // escrever licao sobre qualquer outro comando perigoso continua barrado
  // (ex.: `echo "nunca rode chmod 777" >> licoes.md`).
  const motivo = testarPadroes(limpo)
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
