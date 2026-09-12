const fs = require("fs");
const path = require("path");

const RULES_PATH = process.env.RULES_PATH || path.join(__dirname, "..", "rules.json");

function normaliza(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function carregarRegras() {
  const raw = fs.readFileSync(RULES_PATH, "utf8");
  const regras = JSON.parse(raw);
  if (!Array.isArray(regras) || regras.length === 0) {
    throw new Error("rules.json precisa ser uma lista com pelo menos 1 regra");
  }
  for (const regra of regras) {
    if (!regra.media_id || !Array.isArray(regra.keywords) || !regra.reply_text) {
      throw new Error(
        `Regra invalida em rules.json: precisa de media_id, keywords[] e reply_text -> ${JSON.stringify(
          regra
        )}`
      );
    }
  }
  return regras;
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

module.exports = { carregarRegras, encontrarRegra };
