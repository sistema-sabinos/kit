// Tempo de cartão, chave e inserção medido na legenda alinhada, em vez de digitado na mão.
// Motivo: tempo contado no olho já desencontrou de fala, e número solto no props não avisa quando a frase muda.
// O alinhado.json vem do passo de cortes e voz do /editar-video (whisper + alinhar.py), palavra por palavra com startMs/endMs.

type Palavra = { text: string; startMs: number; endMs: number };

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();

/**
 * Devolve `quando("frase")`, o segundo em que a frase começa a ser dita, e `.fim("frase")`, em que acaba.
 * Frase repetida: `quando("passo um", 2)` pega a 2a vez. Frase que não existe na fala derruba o render.
 */
export const criarQuando = (alinhado: Palavra[]) => {
  const pal = alinhado.map((p) => norm(p.text)).filter((t) => t !== "");
  const idx = alinhado.filter((p) => norm(p.text) !== "");

  const achar = (frase: string, ocorrencia: number) => {
    const alvo = norm(frase).split(/\s+/).filter(Boolean);
    if (alvo.length === 0) throw new Error("quando(): frase vazia");
    let n = 0;
    for (let i = 0; i <= pal.length - alvo.length; i++) {
      if (!alvo.every((a, k) => pal[i + k] === a)) continue;
      if (++n === ocorrencia) return { de: idx[i].startMs / 1000, ate: idx[i + alvo.length - 1].endMs / 1000 };
    }
    throw new Error(
      n === 0
        ? `quando(): "${frase}" não aparece na fala alinhada`
        : `quando(): "${frase}" aparece ${n}x, pediram a ${ocorrencia}a`,
    );
  };

  const quando = (frase: string, ocorrencia = 1) => achar(frase, ocorrencia).de;
  quando.fim = (frase: string, ocorrencia = 1) => achar(frase, ocorrencia).ate;
  return quando;
};
