const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("./db");

const SEED_PATH = path.join(__dirname, "..", "rules.json");

// roda uma vez no boot: se essa conta ainda nao tem nenhuma regra, semeia
// com o rules.json da raiz (serve so de modelo inicial).
async function semearSeVazio(accountId) {
  const { rows } = await pool.query("SELECT 1 FROM rules WHERE account_id = $1 LIMIT 1", [accountId]);
  if (rows.length > 0) return;
  if (!fs.existsSync(SEED_PATH)) return;

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  for (const regra of seed) {
    await criar({ ...regra, accountId });
  }
}

async function listar(accountId) {
  const { rows } = await pool.query(
    "SELECT * FROM rules WHERE account_id = $1 ORDER BY created_at ASC",
    [accountId]
  );
  return rows;
}

async function criar({ accountId, media_id, media_thumbnail, media_caption_snippet, media_permalink, keywords, reply_text }) {
  if (!media_id || !Array.isArray(keywords) || keywords.length === 0 || !reply_text) {
    throw new Error("media_id, keywords[] (>=1) e reply_text sao obrigatorios");
  }
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO rules (id, account_id, media_id, media_thumbnail, media_caption_snippet, media_permalink, keywords, reply_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [id, accountId, media_id, media_thumbnail || null, media_caption_snippet || null, media_permalink || null, keywords, reply_text]
  );
  return rows[0];
}

async function atualizar(accountId, id, patch) {
  const { rows } = await pool.query(
    `UPDATE rules SET
       keywords = COALESCE($3, keywords),
       reply_text = COALESCE($4, reply_text),
       updated_at = now()
     WHERE id = $1 AND account_id = $2
     RETURNING *`,
    [id, accountId, patch.keywords || null, patch.reply_text || null]
  );
  return rows[0] || null;
}

async function remover(accountId, id) {
  const { rowCount } = await pool.query(
    "DELETE FROM rules WHERE id = $1 AND account_id = $2",
    [id, accountId]
  );
  return rowCount > 0;
}

module.exports = { semearSeVazio, listar, criar, atualizar, remover };
