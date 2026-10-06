// Junta item + descrição + perguntas + opiniões num objeto só, com as dúvidas
// já agrupadas por repetição. É a matéria-prima do roteiro.

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '');

function chaveDaPergunta(texto) {
  return semAcento(texto).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function gerarSlug(titulo) {
  return semAcento(titulo).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join('-');
}

function extrairItensDoKit(texto) {
  const m = String(texto ?? '').match(/kit com ([^.]+)/i);
  if (!m) return [];
  return m[1].split(/,| e /).map((s) => s.trim()).filter(Boolean);
}

export function normalizarAnuncio({ item, descricao, perguntas, reviews } = {}) {
  const titulo = item?.title ?? '';
  const texto = descricao?.plain_text ?? '';

  const contagem = new Map();
  for (const q of perguntas?.questions ?? []) {
    const k = chaveDaPergunta(q.text);
    if (!k) continue;
    const atual = contagem.get(k) ?? { texto: q.text, vezes: 0 };
    contagem.set(k, { texto: atual.texto, vezes: atual.vezes + 1 });
  }
  const duvidas = [...contagem.values()].sort((a, b) => b.vezes - a.vezes);

  const lista = reviews?.reviews ?? [];
  const elogios = lista.filter((r) => r.rate >= 4).map((r) => r.content).filter(Boolean);
  // review sem nota vira queixa (lado conservador: melhor avisar que algo pode ser problema)
  const queixas = lista.filter((r) => (r.rate ?? 0) <= 3).map((r) => r.content).filter(Boolean);

  const itensDoKit = extrairItensDoKit(texto);

  return {
    mlb: item?.id ?? '',
    titulo,
    slug: gerarSlug(titulo),
    categoria: item?.category_id ?? '',
    atributos: Object.fromEntries((item?.attributes ?? []).map((a) => [a.id, a.value_name])),
    fotos: (item?.pictures ?? []).filter((p) => p != null && p.secure_url).map((p) => p.secure_url),
    // lookaround com classe que inclui acentuados, evita armadilha do \b (ex: "Sókit" não é kit)
    ehKit: /(?<![a-zà-ÿ])kit(?![a-zà-ÿ])/i.test(titulo) || itensDoKit.length > 1,
    itensDoKit,
    duvidas,
    elogios,
    queixas,
  };
}
