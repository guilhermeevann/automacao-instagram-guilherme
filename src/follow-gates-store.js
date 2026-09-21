const { pool } = require("./db");

// upsert: um comentario novo do mesmo usuario sempre substitui o gate pendente
// anterior (a regra mais recente e a que vale).
async function upsert({ accountId, igsid, ruleId, commentId }) {
  await pool.query(
    `INSERT INTO follow_gates (account_id, igsid, rule_id, comment_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id, igsid)
     DO UPDATE SET rule_id = EXCLUDED.rule_id, comment_id = EXCLUDED.comment_id, created_at = now()`,
    [accountId, igsid, ruleId, commentId || null]
  );
}

async function buscar(accountId, igsid) {
  const { rows } = await pool.query(
    "SELECT * FROM follow_gates WHERE account_id = $1 AND igsid = $2",
    [accountId, igsid]
  );
  return rows[0] || null;
}

async function remover(accountId, igsid) {
  await pool.query("DELETE FROM follow_gates WHERE account_id = $1 AND igsid = $2", [accountId, igsid]);
}

module.exports = { upsert, buscar, remover };
