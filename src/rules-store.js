const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STORE_PATH =
  process.env.RULES_STORE_PATH || path.join(__dirname, "..", "data", "rules.json");
const SEED_PATH = path.join(__dirname, "..", "rules.json");

function garantirArquivo() {
  if (fs.existsSync(STORE_PATH)) return;
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const seed = fs.existsSync(SEED_PATH) ? fs.readFileSync(SEED_PATH, "utf8") : "[]";
  fs.writeFileSync(STORE_PATH, seed);
}

function ler() {
  garantirArquivo();
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  const regras = JSON.parse(raw);
  // regras antigas (seed) podem nao ter id ainda
  let mudou = false;
  for (const regra of regras) {
    if (!regra.id) {
      regra.id = crypto.randomUUID();
      mudou = true;
    }
  }
  if (mudou) escrever(regras);
  return regras;
}

function escrever(regras) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(regras, null, 2));
}

function listar() {
  return ler();
}

function criar({ media_id, media_thumbnail, media_caption_snippet, media_permalink, keywords, reply_text }) {
  if (!media_id || !Array.isArray(keywords) || keywords.length === 0 || !reply_text) {
    throw new Error("media_id, keywords[] (>=1) e reply_text sao obrigatorios");
  }
  const regras = ler();
  const nova = {
    id: crypto.randomUUID(),
    media_id,
    media_thumbnail: media_thumbnail || null,
    media_caption_snippet: media_caption_snippet || null,
    media_permalink: media_permalink || null,
    keywords,
    reply_text,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  regras.push(nova);
  escrever(regras);
  return nova;
}

function atualizar(id, patch) {
  const regras = ler();
  const idx = regras.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  regras[idx] = {
    ...regras[idx],
    ...(patch.keywords ? { keywords: patch.keywords } : {}),
    ...(patch.reply_text ? { reply_text: patch.reply_text } : {}),
    updated_at: Date.now(),
  };
  escrever(regras);
  return regras[idx];
}

function remover(id) {
  const regras = ler();
  const restantes = regras.filter((r) => r.id !== id);
  if (restantes.length === regras.length) return false;
  escrever(restantes);
  return true;
}

module.exports = { listar, criar, atualizar, remover };
