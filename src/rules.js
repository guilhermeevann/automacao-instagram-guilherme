function normaliza(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

// post especifico tem prioridade sobre a regra "all" (mesma logica do
// Comments Growth Tool do ManyChat: post especifico > todos os posts)
function encontrarRegra(regras, mediaId, texto) {
  const textoNormalizado = normaliza(texto);
  const candidatas = regras
    .filter((r) => r.media_id === mediaId)
    .concat(regras.filter((r) => r.media_id === "all"));

  for (const regra of candidatas) {
    const bateu = regra.keywords.some((kw) =>
      textoNormalizado.includes(normaliza(kw))
    );
    if (bateu) return regra;
  }
  return null;
}

module.exports = { normaliza, encontrarRegra };
