const fs = require("fs");
const path = require("path");

const STORE_PATH =
  process.env.TOKEN_STORE_PATH || path.join(__dirname, "..", "data", "token.json");

function load() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function save(accessToken) {
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify({ access_token: accessToken, updated_at: Date.now() }, null, 2)
  );
}

module.exports = { load, save };
