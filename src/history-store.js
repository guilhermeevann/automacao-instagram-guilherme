const { pool } = require("./db");

async function registrar({ accountId, comment_id, media_id, regra_id, commenter_id, commenter_username, comment_text, reply_text, status, error, comment_reply_status, comment_reply_error }) {
  await pool.query(
    `INSERT INTO comment_history
       (account_id, comment_id, media_id, rule_id, commenter_id, commenter_username, comment_text, reply_text, status, error, comment_reply_status, comment_reply_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      accountId, comment_id, media_id || null, regra_id || null, commenter_id || null, commenter_username || null,
      comment_text || null, reply_text || null, status, error ? JSON.stringify(error) : null,
      comment_reply_status || null, comment_reply_error ? JSON.stringify(comment_reply_error) : null,
    ]
  );
}

async function listar(accountId, limite = 100) {
  const { rows } = await pool.query(
    `SELECT comment_id, media_id, commenter_id, commenter_username, comment_text, reply_text, status, error,
            comment_reply_status, comment_reply_error, created_at
     FROM comment_history
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [accountId, limite]
  );
  // node-pg devolve timestamptz como Date; convertido pra epoch-ms aqui pra
  // o front nao precisar lidar com formato de data variavel.
  return rows.map((r) => ({ ...r, timestamp: r.created_at.getTime(), created_at: undefined }));
}

module.exports = { registrar, listar };
