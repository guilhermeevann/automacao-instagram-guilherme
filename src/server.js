const express = require("express");
const crypto = require("crypto");

const {
  PORT = 3000,
  VERIFY_TOKEN,
  IG_APP_SECRET,
  IG_ACCESS_TOKEN,
  IG_USER_ID,
  TRIGGER_KEYWORD = "AGENTE VERTICAL",
  REPLY_TEXT = "Oi! Recebi seu comentario, ja te chamo aqui no direct.",
} = process.env;

for (const [name, value] of Object.entries({
  VERIFY_TOKEN,
  IG_APP_SECRET,
  IG_ACCESS_TOKEN,
  IG_USER_ID,
})) {
  if (!value) {
    console.error(`Variavel de ambiente faltando: ${name}`);
    process.exit(1);
  }
}

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

function normaliza(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

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

async function enviarPrivateReply(commentId) {
  const resp = await fetch(
    `https://graph.instagram.com/v25.0/${IG_USER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${IG_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: REPLY_TEXT },
      }),
    }
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Falha ao enviar private reply", commentId, data);
  } else {
    console.log("Private reply enviada", commentId, data);
  }
}

function tratarComentario(value) {
  const commentId = value?.id;
  const texto = value?.text;
  if (!commentId || !texto) return;
  if (value.from?.id === IG_USER_ID) return; // ignora comentario da propria conta
  if (seenCommentIds.has(commentId)) return; // dedupe: 1 private reply por comentario

  if (normaliza(texto).includes(normaliza(TRIGGER_KEYWORD))) {
    seenCommentIds.add(commentId);
    enviarPrivateReply(commentId);
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

app.get("/", (_req, res) => res.send("ok"));

app.listen(PORT, () => console.log(`Webhook receiver ouvindo na porta ${PORT}`));
