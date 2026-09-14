const { pool } = require("./db");

// Garante que existe uma linha pra essa conta (igsid). Se ja existir, so
// retorna o que tem no banco (o token la pode ja estar mais novo que o da
// env var, por causa da renovacao automatica).
async function ensureAccount(igsid, fallbackAccessToken) {
  const existente = await pool.query("SELECT * FROM ig_accounts WHERE igsid = $1", [igsid]);
  if (existente.rows.length > 0) return existente.rows[0];

  const inserida = await pool.query(
    `INSERT INTO ig_accounts (igsid, access_token) VALUES ($1, $2) RETURNING *`,
    [igsid, fallbackAccessToken]
  );
  return inserida.rows[0];
}

async function atualizarToken(accountId, accessToken, expiresInSeconds) {
  await pool.query(
    `UPDATE ig_accounts
     SET access_token = $2, token_updated_at = now(), expires_in_seconds = $3
     WHERE id = $1`,
    [accountId, accessToken, expiresInSeconds || null]
  );
}

async function statusToken(accountId) {
  const { rows } = await pool.query(
    "SELECT token_updated_at, expires_in_seconds FROM ig_accounts WHERE id = $1",
    [accountId]
  );
  return rows[0] || null;
}

module.exports = { ensureAccount, atualizarToken, statusToken };
