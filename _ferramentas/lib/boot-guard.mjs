// Guardião de boot: evita que um robô agendado rode logo que o computador liga, quando a
// rede e os serviços externos ainda não subiram. Nesse momento o agendador dispara de uma
// vez todas as tarefas com "rodar assim que possível" (StartWhenAvailable no Windows, ou
// equivalente), elas caem num ambiente frio, dão timeout e mandam alarme falso.
//
// Regra: cada robô só entra em ação depois que o computador está ligado há pelo menos o
// PRÓPRIO intervalo. Ex: o robô que roda a cada 40 min só roda 40 min após o boot; o que
// roda a cada 2h só após 2h. Como os intervalos diferem entre robôs, isso também escalona
// eles em vez de todos atropelarem juntos no boot.
//
// Mede "tempo desde que ligou" por os.uptime() (segundos desde o boot; zera em
// desligamento real). Se a rodada for pulada, sai com código 0 (sucesso), então NÃO
// dispara alarme, e o próprio agendamento roda de novo na próxima ocorrência.
//
// Bypass manual: passar --force (ou --agora) na linha de comando (rodar na mão ignora o
// guardião).
//
// Opção { soAgendado: true }: o guardião só age quando o argv traz --agendado (que o
// script disparado pelo agendador passa). Serve pros robôs que TAMBÉM rodam na mão por
// comando direto: a rodada manual (sem --agendado) nunca pula.
//
// DUAS MODALIDADES:
//
//   pularSeBootRecente()   -> PULA a rodada. Só pra robô que repete várias vezes ao dia:
//                             pular custa no máximo um intervalo, a próxima ocorrência
//                             resolve.
//
//   esperarSeBootRecente() -> ESPERA os minutos que faltam e roda. Pra robô de ocorrência
//                             ÚNICA (1x/dia, 1x/semana): pra esses, pular não custa um
//                             intervalo, custa o DIA ou a SEMANA inteira.
//
// Por que a separação existe: já aconteceu na prática de um robô de ocorrência única não
// rodar dois dias seguidos porque o computador foi ligado perto do horário da tarefa, o
// catch-up do agendador disparou na hora, o guardião viu "computador ligado há poucos
// minutos" e pulou. Como esse robô só roda 1x por dia, cada pulo apagou o dia inteiro de
// trabalho. O mesmo padrão num robô semanal apagaria a semana inteira. Esperar alguns
// minutos e rodar mesmo assim resolve os dois casos sem reintroduzir o problema original
// (rodar em ambiente frio).
//
// NÃO usar nenhuma das duas modalidades numa tarefa mensal: nesse caso o certo é rodar
// mesmo em ambiente frio e depender de um retry interno, porque pular ou atrasar pode
// custar o resultado do mês inteiro.
import os from "node:os";

// Decide se o guardião se aplica nesta rodada e quantos minutos ainda faltam de boot.
// Devolve 0 quando o robô está liberado pra rodar agora.
function minutosQueFaltam(minutos, opts) {
  const { argv = process.argv, soAgendado = false } = opts;
  if (soAgendado) {
    if (!argv.includes("--agendado")) return 0; // rodada manual: nunca pula nem espera
  } else if (argv.includes("--force") || argv.includes("--agora")) {
    return 0;
  }
  const uptimeMin = os.uptime() / 60;
  return uptimeMin < minutos ? minutos - uptimeMin : 0;
}

// Robô que repete várias vezes ao dia: pula a rodada, a próxima ocorrência resolve.
export function pularSeBootRecente(minutos, nome = "robo", opts = {}) {
  const faltam = minutosQueFaltam(minutos, opts);
  if (faltam > 0) {
    console.log(
      `[boot-guard] ${nome}: PC ligado ha ${(minutos - faltam).toFixed(0)} min (< ${minutos} min combinado). ` +
        `Pulando esta rodada pra nao rodar no ambiente frio do boot; roda na proxima ocorrencia.`
    );
    process.exit(0);
  }
  return false;
}

// Robô de ocorrência única (1x/dia, 1x/semana): espera a rede subir e roda mesmo assim,
// porque pular aqui custaria o dia ou a semana inteira. Espera no máximo `minutos`.
export async function esperarSeBootRecente(minutos, nome = "robo", opts = {}) {
  const faltam = minutosQueFaltam(minutos, opts);
  if (faltam <= 0) return false;
  console.log(
    `[boot-guard] ${nome}: PC ligado ha ${(minutos - faltam).toFixed(0)} min (< ${minutos} min combinado). ` +
      `Esperando ${faltam.toFixed(0)} min a rede subir antes de rodar (ocorrencia unica, pular custaria a rodada inteira).`
  );
  await new Promise((r) => setTimeout(r, Math.ceil(faltam * 60_000)));
  console.log(`[boot-guard] ${nome}: espera concluida, seguindo.`);
  return true;
}
