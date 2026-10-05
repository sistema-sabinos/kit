// Contagem aproximada de sílabas em PT-BR: cada grupo de vogais seguidas conta 1.
// Superestima hiato ("saída" = 2 aqui, 3 na gramática) e isso é aceitável:
// serve como trava de tamanho de fala, não como análise linguística.

const VOGAIS = /[aeiouáàâãéêíóôõúüy]+/gi;

export function contarSilabas(texto) {
  if (!texto) return 0;
  const limpo = String(texto).toLowerCase().replace(/[^a-záàâãéêíóôõúüçy\s]/g, ' ');
  let total = 0;
  for (const palavra of limpo.split(/\s+/).filter(Boolean)) {
    const grupos = palavra.match(VOGAIS);
    total += grupos ? grupos.length : 1; // palavra sem vogal ainda vale 1
  }
  return total;
}

// Faixa medida na nossa própria voz em 08/08: ~4,3 sílabas por segundo,
// então 8 segundos comportam de 30 a 38 sílabas com respiração.
export function validarBloco(texto, { min = 30, max = 38 } = {}) {
  const silabas = contarSilabas(texto);
  if (silabas < min) return { ok: false, silabas, motivo: `fala curta demais (${silabas} sílabas, mínimo ${min}), sobra silêncio no bloco` };
  if (silabas > max) return { ok: false, silabas, motivo: `fala longa demais (${silabas} sílabas, máximo ${max}), o locutor atropela ou corta` };
  return { ok: true, silabas };
}
