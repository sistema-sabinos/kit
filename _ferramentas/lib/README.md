# lib antitrava

Quatro peças pra qualquer robô agendado (um script Node que roda sozinho, sem ninguém olhando) não travar em silêncio. A lição que gerou isso: travar não é falhar. Um robô que quebra manda erro e alguém vê. Um robô que trava fica pendurado pra sempre, não manda nada, e o silêncio parece "tudo certo" até alguém notar dias depois que ele parou de funcionar.

**O jeito montado:** dentro de um projeto, o `/agendar` já usa estas peças (cópias em `.claude/skills/agendar/scripts/lib/`, como a `mercado-livre` tem as dela), escreve o robô com você e cadastra no agendador. O passo a passo abaixo fica como referência pra quem monta na mão. Mudou uma peça aqui: copiar pras duas skills e rodar os testes delas.

## O que cada peça faz

- **`fetch-timeout.mjs`** dá um prazo pra cada chamada de rede. O `fetch` do Node não tem timeout padrão, então uma conexão que fica presa (sem resposta, sem cair) pendura o processo pra sempre. `fetchComTimeout(url, init, { timeoutMs })` cobre a chamada inteira, inclusive a leitura do corpo da resposta, que é onde o travamento gosta de se esconder.
- **`watchdog.mjs`** é o cão de guarda da rodada inteira. Se o robô passar de um tempo total sem terminar, `armarCaoDeGuarda({ ms, nome, aoEstourar })` avisa (chama a função que você passar, por exemplo mandar uma mensagem) e mata o processo. Pega o caso em que várias chamadas pequenas, cada uma dentro do próprio timeout, ainda assim somam uma rodada gigante.
- **`boot-guard.mjs`** evita que o robô rode logo que o computador liga, antes da rede e dos serviços externos subirem. `pularSeBootRecente(minutos, nome)` pula a rodada (pra robô que roda várias vezes ao dia); `esperarSeBootRecente(minutos, nome)` espera e roda mesmo assim (pra robô de ocorrência única, tipo 1x por dia, onde pular custaria o dia inteiro).
- **`backup-env.mjs`** guarda cópias do arquivo `.env` fora do projeto, pra um acidente (um processo que grava o arquivo errado, um `git clean` mal calibrado) não apagar todas as chaves de uma vez. `backupEnv({ envPath })` recusa fazer backup de um `.env` que pareça truncado, pra não sobrescrever as cópias boas com uma ruim.

## A regra de ouro

Toda automação agendada usa as quatro peças. Não é "usa a que parecer mais óbvia pro caso": rede trava independente de qual robô é, então o timeout de rede e o cão de guarda são padrão em qualquer robô que chama uma API ou abre uma página. O guardião de boot entra em qualquer robô que roda sozinho pelo agendador do sistema. O backup do `.env` é raro precisar rodar em todo robô (normalmente é uma tarefa própria, separada), mas a lib mora aqui porque a lógica é a mesma família de proteção.

**A ordem dos prazos importa e é sempre a mesma:**

```
cão de guarda  <  limite de execução da tarefa no agendador  <  intervalo entre rodadas
```

O cão de guarda tem que estourar ANTES do agendador achar que a tarefa travou e tomar uma atitude própria (matar o processo sem avisar, ou empilhar rodadas). E o limite do agendador tem que caber dentro do intervalo entre uma rodada e a próxima, senão uma rodada lenta ainda está rodando quando a próxima já devia começar.

**Os prazos são medidos, nunca chutados.** Antes de decidir "esse robô tem 10 minutos de cão de guarda", rode o robô algumas vezes em condição normal e veja quanto ele leva de verdade (log de início e fim já ajuda). Um prazo "generoso" chutado no escuro pode matar uma rodada legítima que só demorou um pouco mais porque a fila estava cheia naquele dia.

## Agendando o robô

### Windows (Task Scheduler)

1. Abra o **Agendador de Tarefas** (`taskschd.msc` ou busque "Agendador de Tarefas" no menu iniciar).
2. **Criar Tarefa** (não "Tarefa Básica", que esconde algumas opções importantes).
3. Aba **Geral**: dê um nome, marque "Executar estando o usuário conectado ou não" se o robô não precisar abrir janela visível, ou "Executar somente quando o usuário estiver conectado" se ele precisar (ex: abrir um navegador de verdade).
4. Aba **Disparadores**: novo disparador com a frequência desejada (diária, a cada X minutos, etc). Marque **"Executar tarefa assim que possível após uma inicialização agendada perdida"** (é o equivalente do `StartWhenAvailable`): garante que, se o computador estava desligado na hora agendada, a tarefa roda assim que ele ligar, em vez de esperar a próxima ocorrência.
5. Aba **Ações**: nova ação "Iniciar um programa", aponte pro `node.exe` (ou pro `.bat` que chama o `node`) e passe o caminho do script como argumento.
6. Aba **Configurações**: marque **"Parar a tarefa se ela for executada por mais de"** e ponha o limite de execução (o valor do meio da regra de ouro acima). Sem isso o padrão do Windows costuma ser de vários dias, e uma rodada travada (mesmo com o cão de guarda como rede de segurança) fica presa até esse prazo gigante vencer.

### Mac (launchd)

O `launchd` é o agendador nativo do macOS (não tem Agendador de Tarefas gráfico por padrão). Um arquivo `.plist` descreve a tarefa. Salve em `~/Library/LaunchAgents/com.seuprojeto.robo.plist` (troque `seuprojeto` e `robo` pelo nome real):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.seuprojeto.robo</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/caminho/completo/para/o/robo.mjs</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>12</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/robo.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/robo-erro.log</string>
</dict>
</plist>
```

Isso agenda o robô pra rodar todo dia às 12:00 (troque `Hour`/`Minute`, ou use um array de dicts em `StartCalendarInterval` pra mais de um horário por dia). Depois de salvar o arquivo, carregue com:

```bash
launchctl load ~/Library/LaunchAgents/com.seuprojeto.robo.plist
```

O `launchd` não tem um "StartWhenAvailable" configurável do jeito do Windows, mas por padrão ele já roda a tarefa perdida assim que a máquina volta a ligar (comportamento equivalente, sem precisar marcar nada a mais).

**Alternativa mais simples, pra quem já usa `cron`:** `crontab -e` e uma linha como `0 12 * * * /usr/local/bin/node /caminho/completo/para/o/robo.mjs` (roda todo dia às 12:00). O `cron` não tem o catch-up automático do `launchd` nem do Windows: se a máquina estiver desligada na hora marcada, a rodada simplesmente não acontece, o que reforça por que o robô de ocorrência única usa `esperarSeBootRecente` (funciona nos três agendadores, porque a lógica está no próprio script, não no agendador).

## Exemplo de uso combinado

```js
import { pularSeBootRecente } from './boot-guard.mjs';
import { armarCaoDeGuarda } from './watchdog.mjs';
import { fetchComTimeout } from './fetch-timeout.mjs';

pularSeBootRecente(30, 'meu-robo'); // sai sozinho se o boot foi ha menos de 30 min

const cao = armarCaoDeGuarda({
  ms: 15 * 60_000, // cao de guarda: 15 min (< limite da tarefa no agendador, que por sua
                    // vez tem que ser < o intervalo entre rodadas)
  nome: 'meu-robo',
  aoEstourar: async (info) => { /* manda um aviso, ex: mensagem de texto ou log critico */ },
});

try {
  const resp = await fetchComTimeout('https://exemplo.com/api', {}, { timeoutMs: 30_000 });
  // ... resto do trabalho do robo ...
} finally {
  cao.desarmar();
}
```
