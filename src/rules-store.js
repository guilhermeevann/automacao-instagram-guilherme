const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("./db");
const { bytes, LIMITE_MENSAGEM_BYTES } = require("./dm-parts");

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

// textos que saem como UMA mensagem (abertura da DM longa, pedido pra seguir)
// precisam caber nos 1000 bytes da Meta; o reply_text nao, porque e dividido
function validarTamanhos({ dm_abertura, follow_request_text }) {
  for (const [nome, valor] of [["dm_abertura", dm_abertura], ["follow_request_text", follow_request_text]]) {
    if (valor && bytes(valor) > LIMITE_MENSAGEM_BYTES) {
      throw new Error(`${nome} passa de ${LIMITE_MENSAGEM_BYTES} bytes (${bytes(valor)}); a Meta nao aceita`);
    }
  }
}

async function criar({ accountId, media_id, media_thumbnail, media_caption_snippet, media_permalink, keywords, reply_text, comment_reply_text, require_follow, follow_request_text, dm_abertura }) {
  validarTamanhos({ dm_abertura, follow_request_text });
  if (!media_id || !Array.isArray(keywords) || keywords.length === 0 || !reply_text) {
    throw new Error("media_id, keywords[] (>=1) e reply_text sao obrigatorios");
  }
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO rules (id, account_id, media_id, media_thumbnail, media_caption_snippet, media_permalink, keywords, reply_text, comment_reply_text, require_follow, follow_request_text, dm_abertura)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [id, accountId, media_id, media_thumbnail || null, media_caption_snippet || null, media_permalink || null, keywords, reply_text, comment_reply_text || null, Boolean(require_follow), follow_request_text || null, dm_abertura || null]
  );
  return rows[0];
}

async function atualizar(accountId, id, patch) {
  validarTamanhos(patch);
  const { rows } = await pool.query(
    `UPDATE rules SET
       keywords = COALESCE($3, keywords),
       reply_text = COALESCE($4, reply_text),
       comment_reply_text = $5,
       require_follow = $6,
       follow_request_text = $7,
       dm_abertura = $8,
       updated_at = now()
     WHERE id = $1 AND account_id = $2
     RETURNING *`,
    [id, accountId, patch.keywords || null, patch.reply_text || null, patch.comment_reply_text || null, Boolean(patch.require_follow), patch.follow_request_text || null, patch.dm_abertura || null]
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
