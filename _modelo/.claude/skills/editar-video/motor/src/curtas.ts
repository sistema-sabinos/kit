// Paginas da legenda (ate 3 palavras, 4 quando as 3 primeiras sao curtas) com a regra da palavra curta: artigo,
// preposicao, conjuncao, pronome curto, numero solto ou R$ nunca fecha pagina. Na hora de fechar por contagem ou
// pela janela de tempo, as curtas do fim passam pro comeco da pagina seguinte ("sinto dor no o joelho" vira
// "sinto dor" e "no o joelho"), e pagina que so tem curta espera a primeira palavra cheia ("o que e bom"). R$ gruda
// no numero ("por R$ 89"). Pausa de mais de 0,35 s nao se atravessa. pageBreakAfter na palavra (camera lenta)
// fecha a pagina ali. A mesma regra mora no scripts/legenda_curtas.py (o teste confere que as listas sao iguais).
import type { Caption, TikTokPage } from "@remotion/captions";

export const CURTAS = new Set(
  (
    "a o as os um uma uns umas " +
    "de do da dos das em no na nos nas num numa ao aos à às " +
    "por pelo pela pelos pelas pra pro pras pros para com sem " +
    "e ou nem mas que se " +
    "eu me te lhe meu minha seu sua é " +
    "r$"
  ).split(" "),
);
const PAUSA_MS = 350;
const FIM_DE_FRASE = ".,?!:;…";
const ALGARISMOS = "0123456789";
const fimDeFrase = (texto: string): boolean => FIM_DE_FRASE.includes(texto.trim().slice(-1));

// 60, 2,5, 10%, R$89: tirando o R$ da frente e o % do fim, sobra so algarismo, ponto ou virgula
const numero = (w: string): boolean => {
  let s = w.toLowerCase();
  if (s.startsWith("r$")) s = s.slice(2);
  if (s.endsWith("%")) s = s.slice(0, -1);
  return s !== "" && [...s].every((c) => (ALGARISMOS + ".,").includes(c));
};

export const curta = (texto: string): boolean => {
  const w = texto.trim();
  return w !== "" && !fimDeFrase(w) && (CURTAS.has(w.toLowerCase()) || numero(w));
};

// "R$" seguido de numero: o preco fica na mesma pagina
const gruda = (a: Caption, b: Caption): boolean => a.text.trim().toLowerCase() === "r$" && numero(b.text.trim());

export const paginas = (captions: Caption[], maxPalavras: number, janelaMs: number): TikTokPage[] => {
  const grupos: Caption[][] = [];
  let atual: Caption[] = [];
  for (const w of captions.filter((c) => c.text.trim())) {
    if (atual.length) {
      const ult = atual[atual.length - 1];
      const cheia = atual.length >= maxPalavras || ult.endMs - atual[0].startMs > janelaMs;
      const pausa = w.startMs - ult.endMs > PAUSA_MS;
      const soCurtas = atual.length <= maxPalavras && atual.every((x) => curta(x.text));
      const espera = !pausa && soCurtas && (!curta(w.text) || gruda(ult, w));
      if ((cheia || pausa) && !espera) {
        let n = atual.length;
        if (!pausa) {
          while (n > 1 && curta(atual[n - 1].text)) n--;
          if (n === 1 && curta(atual[0].text)) n = Math.min(2, atual.length);
          if (n < atual.length && gruda(atual[n - 1], atual[n])) n++;
        }
        grupos.push(atual.slice(0, n));
        atual = atual.slice(n);
      }
    }
    atual.push(w);
    if (w.pageBreakAfter) {
      grupos.push(atual);
      atual = [];
    }
  }
  if (atual.length) grupos.push(atual);
  // curta sozinha no fim (trecho cortado no meio da frase) volta pra pagina de antes, se couber ali com uma a mais
  const [ant, ult] = grupos.slice(-2);
  if (grupos.length > 1 && ult.length === 1 && curta(ult[0].text)) {
    const fim = ant[ant.length - 1];
    const cabe = ant.length <= maxPalavras && !fimDeFrase(fim.text) && !fim.pageBreakAfter;
    if (cabe && ult[0].startMs - fim.endMs <= PAUSA_MS) ant.push(...grupos.pop()!);
  }
  return grupos.map((g, k) => {
    const tokens = g.map((c, i) => ({ text: (i ? " " : "") + c.text.trim(), fromMs: c.startMs, toMs: c.endMs }));
    const fim = k + 1 < grupos.length ? grupos[k + 1][0].startMs : g[g.length - 1].endMs;
    return { text: tokens.map((t) => t.text).join(""), startMs: g[0].startMs, durationMs: fim - g[0].startMs, tokens };
  });
};

// ate quando a pagina fica na tela: ate a proxima entrar, sem passar de 0,3 s depois da janela ou da ultima
// palavra dela, o que vier depois (pagina que recebeu curtas pode ficar mais longa que a janela)
export const fimDaPaginaMs = (page: TikTokPage, prox: TikTokPage | null, janelaMs: number): number => {
  const ultima = page.tokens[page.tokens.length - 1];
  return Math.min(prox ? prox.startMs : Infinity, Math.max(page.startMs + janelaMs, ultima ? ultima.toMs : 0) + 300);
};
