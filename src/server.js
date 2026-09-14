const express = require("express");
const path = require("path");
const crypto = require("crypto");
const tokenStore = require("./token-store");
const rulesStore = require("./rules-store");
const historyStore = require("./history-store");
const { encontrarRegra } = require("./rules");
const { buscarMediaRecente } = require("./media");
const { basicAuth } = require("./auth");

const {
  PORT = 3000,
  VERIFY_TOKEN,
  IG_APP_SECRET,
  IG_ACCESS_TOKEN,
  IG_USER_ID,
  ADMIN_USER,
  ADMIN_PASSWORD,
} = process.env;

for (const [name, value] of Object.entries({
  VERIFY_TOKEN,
  IG_APP_SECRET,
  IG_ACCESS_TOKEN,
  IG_USER_ID,
  ADMIN_USER,
  ADMIN_PASSWORD,
})) {
  if (!value) {
    console.error(`Variavel de ambiente faltando: ${name}`);
    process.exit(1);
  }
}

// token de longa duracao (60 dias) do "Gerar token" do painel. Persistido em
// disco (volume do EasyPanel) pra sobreviver a restarts e redeploys.
const salvo = tokenStore.load();
let currentAccessToken = salvo?.access_token || IG_ACCESS_TOKEN;
let tokenUpdatedAt = salvo?.updated_at || Date.now();
let tokenExpiresInSeconds = salvo?.expires_in_seconds || null;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

async function renovarTokenSeNecessario() {
  const idadeMs = Date.now() - tokenUpdatedAt;
  if (idadeMs < UM_DIA_MS) return; // Meta exige token com pelo menos 24h pra renovar

  try {
    const resp = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
        currentAccessToken
      )}`
    );
    const data = await resp.json();
    if (!resp.ok || !data.access_token) {
      console.error("Falha ao renovar token de acesso", data);
      return;
    }
    currentAccessToken = data.access_token;
    tokenUpdatedAt = Date.now();
    tokenExpiresInSeconds = data.expires_in || null;
    tokenStore.save(currentAccessToken, tokenExpiresInSeconds);
    const dias = Math.round((data.expires_in || 0) / 86400);
    console.log(`Token renovado, valido por mais ~${dias} dias`);
  } catch (err) {
    console.error("Erro ao chamar refresh_access_token", err);
  }
}

setInterval(renovarTokenSeNecessario, UM_DIA_MS);
renovarTokenSeNecessario();

const app = express();

// precisa do corpo cru para validar a assinatura antes do JSON.parse
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

const seenCommentIds = new Set();

function assinaturaValida(req) {
  const assinatura = req.get("X-Hub-Signature-256");
  if (!assinatura || !req.rawBody) return false;
  const esperada =
    "sha256=" +
    crypto.createHmac("sha256", IG_APP_SECRET).update(req.rawBody).digest("hex");
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function enviarPrivateReply(commentId, replyText) {
  const resp = await fetch(
    `https://graph.instagram.com/v25.0/${IG_USER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: replyText },
      }),
    }
  );
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
}

async function tratarComentario(value) {
  const commentId = value?.id;
  const texto = value?.text;
  const mediaId = value?.media?.id;
  if (!commentId || !texto) return;
  if (value.from?.id === IG_USER_ID) return; // ignora comentario da propria conta
  if (seenCommentIds.has(commentId)) return; // dedupe: 1 private reply por comentario

  console.log(`Comentario recebido: media_id=${mediaId} texto="${texto}"`);

  const regras = rulesStore.listar();
  const regra = encontrarRegra(regras, mediaId, texto);
  if (!regra) return;

  seenCommentIds.add(commentId);
  const resultado = await enviarPrivateReply(commentId, regra.reply_text);

  historyStore.registrar({
    comment_id: commentId,
    media_id: mediaId,
    regra_id: regra.id,
    commenter_id: value.from?.id || null,
    commenter_username: value.from?.username || null,
    comment_text: texto,
    reply_text: regra.reply_text,
    status: resultado.ok ? "sent" : "failed",
    error: resultado.ok ? null : resultado.data,
  });

  if (resultado.ok) {
    console.log("Private reply enviada", commentId, resultado.data);
  } else {
    console.error("Falha ao enviar private reply", commentId, resultado.data);
  }
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  if (!assinaturaValida(req)) {
    return res.sendStatus(401);
  }
  // responde rapido, processa depois
  res.sendStatus(200);

  for (const entry of req.body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "comments") {
        tratarComentario(change.value);
      }
    }
  }
});

// ---- painel de administracao ----

// arquivos estaticos do painel ficam sem auth no servidor (sao so HTML/JS/CSS,
// nenhum dado sensivel) -- quem protege de verdade e a Basic Auth na API,
// verificada explicitamente pelo app.js (o navegador nao reenvia sozinho a
// senha da URL em toda chamada fetch).
app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));
app.use("/api", basicAuth(ADMIN_USER, ADMIN_PASSWORD));

app.get("/api/rules", (_req, res) => {
  res.json(rulesStore.listar());
});

app.post("/api/rules", (req, res) => {
  try {
    res.status(201).json(rulesStore.criar(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/rules/:id", (req, res) => {
  const atualizada = rulesStore.atualizar(req.params.id, req.body);
  if (!atualizada) return res.sendStatus(404);
  res.json(atualizada);
});

app.delete("/api/rules/:id", (req, res) => {
  const removida = rulesStore.remover(req.params.id);
  if (!removida) return res.sendStatus(404);
  res.sendStatus(204);
});

app.get("/api/media", async (_req, res) => {
  try {
    const media = await buscarMediaRecente(currentAccessToken, IG_USER_ID);
    res.json(media);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/history", (_req, res) => {
  res.json(historyStore.listar());
});

app.get("/api/token-status", (_req, res) => {
  res.json({ updated_at: tokenUpdatedAt, expires_in_seconds: tokenExpiresInSeconds });
});

app.get("/", (_req, res) => res.send("ok"));

app.listen(PORT, () => console.log(`Webhook receiver ouvindo na porta ${PORT}`));
