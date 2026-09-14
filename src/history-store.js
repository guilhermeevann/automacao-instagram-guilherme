const fs = require("fs");
const path = require("path");

const STORE_PATH =
  process.env.HISTORY_STORE_PATH || path.join(__dirname, "..", "data", "history.json");
const LIMITE = 200;

function ler() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function registrar(entrada) {
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const historico = ler();
  historico.push({ timestamp: Date.now(), ...entrada });
  const cortado = historico.slice(-LIMITE);
  fs.writeFileSync(STORE_PATH, JSON.stringify(cortado, null, 2));
}

function listar(limite = 100) {
  return ler().slice(-limite).reverse();
}

module.exports = { registrar, listar };
