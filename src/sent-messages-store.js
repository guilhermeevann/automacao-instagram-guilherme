const { pool } = require("./db");

// Guarda o id de toda mensagem que o proprio sistema mandou. Serve pra separar,
// no eco do webhook e na conversa, o que foi automacao do que foi a pessoa
// dona da conta digitando na mao (que e quando a automacao tem que parar).
async function registrar(accountId, igsid, mid) {
  if (!mid) return;
  await pool.query(
    `INSERT INTO sent_messages (mid, account_id, igsid) VALUES ($1, $2, $3)
     ON CONFLICT (mid) DO NOTHING`,
    [mid, accountId, igsid || null]
  );
}

async function existe(mid) {
  if (!mid) return false;
  const { rows } = await pool.query("SELECT 1 FROM sent_messages WHERE mid = $1", [mid]);
  return rows.length > 0;
}

async function limparAntigas() {
  await pool.query("DELETE FROM sent_messages WHERE created_at < now() - interval '30 days'");
}

module.exports = { registrar, existe, limparAntigas };
