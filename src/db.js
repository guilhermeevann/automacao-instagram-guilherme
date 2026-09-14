const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: { rejectUnauthorized: false }, // exige TLS com verificacao normal de certificado
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ig_accounts (
      id SERIAL PRIMARY KEY,
      igsid TEXT UNIQUE NOT NULL,
      username TEXT,
      access_token TEXT NOT NULL,
      token_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_in_seconds INTEGER
    );

    CREATE TABLE IF NOT EXISTS rules (
      id UUID PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES ig_accounts(id),
      media_id TEXT NOT NULL,
      media_thumbnail TEXT,
      media_caption_snippet TEXT,
      media_permalink TEXT,
      keywords TEXT[] NOT NULL,
      reply_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS comment_history (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES ig_accounts(id),
      comment_id TEXT NOT NULL,
      media_id TEXT,
      rule_id UUID REFERENCES rules(id) ON DELETE SET NULL,
      commenter_id TEXT,
      commenter_username TEXT,
      comment_text TEXT,
      reply_text TEXT,
      status TEXT NOT NULL,
      error JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS rules_account_media_idx ON rules (account_id, media_id);
    CREATE INDEX IF NOT EXISTS comment_history_account_idx ON comment_history (account_id, created_at DESC);

    ALTER TABLE rules ADD COLUMN IF NOT EXISTS comment_reply_text TEXT;
    ALTER TABLE comment_history ADD COLUMN IF NOT EXISTS comment_reply_status TEXT;
    ALTER TABLE comment_history ADD COLUMN IF NOT EXISTS comment_reply_error JSONB;
  `);
}

module.exports = { pool, init };
