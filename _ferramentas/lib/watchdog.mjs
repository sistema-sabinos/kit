// Cão de guarda de tempo total de uma rodada de robô.
//
// Por que existe: já aconteceu de verdade um robô agendado travar numa chamada de rede
// sem timeout e ficar HORAS pendurado. Como a tarefa do agendador estava configurada pra
// não permitir rodada dupla, toda rodada seguinte foi recusada, e como o robô só avisa
// quando FALHA, ninguém soube. Travar é pior que falhar, porque o silêncio parece
// "tudo certo". O cão transforma trava em alarme.
//
// É a segunda camada. A primeira é o timeout por requisição (`fetch-timeout.mjs`) e a
// terceira é o limite de execução da própria tarefa no agendador (Task Scheduler no
// Windows, launchd no Mac). Ver o README desta pasta pra ordem completa.

const PRAZO_AVISO_PADRAO_MS = 10_000;

/**
 * Arma o relógio. Passou de `ms` sem alguém chamar `desarmar()`, ele chama `aoEstourar`
 * (com um prazo curto próprio, porque o aviso é rede e rede também trava) e mata o
 * processo.
 *
 * O relógio é `unref`: quem esquecer de desarmar não segura o robô vivo à toa.
 */
export function armarCaoDeGuarda({ ms, nome, aoEstourar, sair = (c) => process.exit(c), prazoAvisoMs = PRAZO_AVISO_PADRAO_MS }) {
  if (!Number.isFinite(ms) || ms <= 0) throw new Error("cão de guarda: prazo (ms) tem que ser positivo");

  const timer = setTimeout(async () => {
    const info = {
      nome,
      ms,
      motivo: `${nome} passou de ${Math.round(ms / 60000)} min numa rodada só e foi encerrado pelo cão de guarda. Provável trava de rede. A fila não se perde: o próximo ciclo pega os pedidos de novo.`,
    };
    try {
      // Corrida: ou o aviso sai, ou o prazo dele acaba. De um jeito ou de outro, morre.
      // O relógio do aviso é limpo assim que o aviso termina, senão ele segura o
      // processo vivo de graça pelo prazo inteiro depois de tudo resolvido.
      let relogioAviso;
      await Promise.race([
        Promise.resolve().then(() => aoEstourar(info)).finally(() => clearTimeout(relogioAviso)),
        new Promise((r) => { relogioAviso = setTimeout(r, prazoAvisoMs); }),
      ]);
    } catch {
      // Aviso quebrado não pode salvar o processo travado.
    }
    sair(1);
  }, ms);
  timer.unref?.();

  return { desarmar: () => clearTimeout(timer) };
}
