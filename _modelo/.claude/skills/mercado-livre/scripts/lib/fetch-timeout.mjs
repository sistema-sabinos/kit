// fetch com prazo de validade.
//
// Por que existe: o `fetch` do Node NÃO tem timeout padrão. Conexão que fica presa
// (aberta, sem resposta e sem cair) pendura o processo PRA SEMPRE, calada. Já aconteceu
// de verdade: um robô agendado travou numa chamada a uma API externa e ficou horas
// parado, sem nada no log e sem nenhum aviso, porque travar não é falhar. Ver o README
// desta pasta.
//
// O timeout cobre a requisição INTEIRA, inclusive a leitura do corpo, que é o caso
// traiçoeiro: o cabeçalho chega, o `fetch` resolve, e quem trava é o `resp.text()`.

export const TIMEOUT_PADRAO_MS = 30_000;

// Tira a query da URL antes de logar: token e chave viajam ali.
function alvo(url) {
  const s = String(url);
  const i = s.indexOf("?");
  return i === -1 ? s : s.slice(0, i);
}

function erroTimeout(url, ms) {
  const e = new Error(`Tempo esgotado depois de ${ms}ms em ${alvo(url)}`);
  e.code = "TIMEOUT";
  e.timeoutMs = ms;
  return e;
}

/** Reconhece o estouro de prazo, venha do nosso relógio ou do próprio Node. */
export function ehTimeout(e) {
  if (!e || typeof e !== "object") return false;
  return e.code === "TIMEOUT" || e.name === "TimeoutError";
}

/**
 * Igual ao `fetch`, com prazo. Estourou, rejeita com um erro `code: "TIMEOUT"`.
 * O `signal` de quem chama continua valendo: os dois abortam, quem chegar primeiro manda.
 */
export function fetchComTimeout(url, init = {}, { timeoutMs = TIMEOUT_PADRAO_MS } = {}) {
  const ctrl = new AbortController();
  // unref: o relógio não segura o processo vivo depois que a resposta já foi lida.
  // Ele continua armado durante a leitura do corpo, que é onde mora o travamento sorrateiro.
  const timer = setTimeout(() => ctrl.abort(erroTimeout(url, timeoutMs)), timeoutMs);
  timer.unref?.();
  const signal = init.signal ? AbortSignal.any([init.signal, ctrl.signal]) : ctrl.signal;
  return fetch(url, { ...init, signal });
}
