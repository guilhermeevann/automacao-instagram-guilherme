const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");
const accountsStore = require("./accounts-store");
const rulesStore = require("./rules-store");
const historyStore = require("./history-store");
const followGatesStore = require("./follow-gates-store");
const { dividirEmPartes, cabeEmUmaMensagem } = require("./dm-parts");
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
  DATABASE_URL,
} = process.env;

for (const [name, value] of Object.entries({
  VERIFY_TOKEN,
  IG_APP_SECRET,
  IG_ACCESS_TOKEN,
  IG_USER_ID,
  ADMIN_USER,
  ADMIN_PASSWORD,
  DATABASE_URL,
})) {
  if (!value) {
    console.error(`Variavel de ambiente faltando: ${name}`);
    process.exit(1);
  }
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;
// so muda em teste local, apontando pra um servidor falso
const GRAPH_BASE = process.env.GRAPH_BASE || "https://graph.instagram.com";

async function main() {
  await db.init();
  const account = await accountsStore.ensureAccount(IG_USER_ID, IG_ACCESS_TOKEN);
  await rulesStore.semearSeVazio(account.id);

  let currentAccessToken = account.access_token;
  let tokenUpdatedAt = new Date(account.token_updated_at).getTime();
  let tokenExpiresInSeconds = account.expires_in_seconds;

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
      await accountsStore.atualizarToken(account.id, currentAccessToken, tokenExpiresInSeconds);
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
  const seenMessageIds = new Set();

  function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // pausa de 2-5s antes de cada envio, pra nao parecer um robo respondendo
  // instantaneamente.
  function delayHumano() {
    return esperar(2000 + Math.random() * 3000);
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

  async function enviarPrivateReply(commentId, replyText) {
    await delayHumano();
    const resp = await fetch(
      `${GRAPH_BASE}/v25.0/${IG_USER_ID}/messages`,
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

  async function enviarRespostaPublica(commentId, texto) {
    await delayHumano();
    const resp = await fetch(
      `${GRAPH_BASE}/v25.0/${commentId}/replies`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentAccessToken}`,
        },
        body: JSON.stringify({ message: texto }),
      }
    );
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, data };
  }

  async function buscarStatusSeguidor(igsid) {
    try {
      const resp = await fetch(
        `${GRAPH_BASE}/v25.0/${igsid}?fields=is_user_follow_business,name&access_token=${encodeURIComponent(
          currentAccessToken
        )}`
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("Falha ao checar se segue", igsid, data);
        return { segue: false, nome: null }; // na duvida, pede pra seguir -- mais seguro que liberar sem checar
      }
      return { segue: Boolean(data.is_user_follow_business), nome: data.name || null };
    } catch (err) {
      console.error("Erro ao checar se segue", igsid, err);
      return { segue: false, nome: null };
    }
  }

  const TEXTO_PEDIR_SEGUIR_PADRAO =
    'Fala {first_name}, vi que você comentou mas ainda não me segue. Aperta em me seguir e responde "segui" que envio para você.';

  // a Meta nao faz substituicao de variavel na mensagem -- o {first_name} e
  // preenchido aqui, com o nome que a gente busca via API. Sem nome, remove
  // o trecho do placeholder pra nao mandar "Fala , vi que...".
  function personalizarTexto(template, nomeCompleto) {
    const primeiroNome = (nomeCompleto || "").trim().split(/\s+/)[0] || "";
    if (primeiroNome) {
      return template.replace(/\{first_name\}/g, primeiroNome);
    }
    return template.replace(/\s*\{first_name\},?/g, "").replace(/\s{2,}/g, " ").trim();
  }

  async function enviarMensagemDireta(igsid, texto) {
    await delayHumano();
    const resp = await fetch(
      `${GRAPH_BASE}/v25.0/${IG_USER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentAccessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: igsid },
          message: { text: texto },
        }),
      }
    );
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, data };
  }

  const TEXTO_ABERTURA_PADRAO =
    'Fala {first_name}! Separei o conteúdo pra você. Me responde "quero" que eu te mando agora.';

  // Manda o texto em quantas mensagens precisar (1 se couber), em ordem, uma
  // depois da outra; cada envio ja espera o delay humano. Se uma parte falhar,
  // para ali e diz qual foi, pra nao mandar o resto fora de ordem.
  async function entregarConteudo(igsid, texto) {
    const partes = dividirEmPartes(texto);
    for (let i = 0; i < partes.length; i++) {
      const r = await enviarMensagemDireta(igsid, partes[i]);
      if (!r.ok) return { ok: false, data: r.data, parte: i + 1, total: partes.length };
    }
    return { ok: true, total: partes.length };
  }

  async function tratarComentario(value) {
    const commentId = value?.id;
    const texto = value?.text;
    const mediaId = value?.media?.id;
    if (!commentId || !texto) return;
    if (value.from?.id === IG_USER_ID) return; // ignora comentario da propria conta
    if (seenCommentIds.has(commentId)) return; // dedupe: 1 private reply por comentario

    console.log(`Comentario recebido: media_id=${mediaId} texto="${texto}"`);

    const regras = await rulesStore.listar(account.id);
    const regra = encontrarRegra(regras, mediaId, texto);
    if (!regra) return;

    seenCommentIds.add(commentId);
    const commenterId = value.from?.id || null;

    // A private reply aceita uma mensagem so, de ate 1000 bytes. DM maior que
    // isso abre com uma mensagem curta e so entrega o resto, em partes, quando
    // a pessoa responder (a resposta dela abre a janela de 24h pra mandar mais).
    const conteudoLongo = !cabeEmUmaMensagem(regra.reply_text);

    let precisaSeguir = false;
    let aguardaResposta = false;
    let textoParaEnviar = regra.reply_text;
    let nome = null;

    if (commenterId && (regra.require_follow || conteudoLongo)) {
      const status = await buscarStatusSeguidor(commenterId);
      nome = status.nome;
      precisaSeguir = Boolean(regra.require_follow) && !status.segue;
    }

    if (precisaSeguir) {
      textoParaEnviar = personalizarTexto(regra.follow_request_text || TEXTO_PEDIR_SEGUIR_PADRAO, nome);
    } else if (conteudoLongo) {
      aguardaResposta = true;
      textoParaEnviar = personalizarTexto(regra.dm_abertura || TEXTO_ABERTURA_PADRAO, nome);
    }

    const resultado = await enviarPrivateReply(commentId, textoParaEnviar);

    if ((precisaSeguir || aguardaResposta) && resultado.ok) {
      await followGatesStore.upsert({
        accountId: account.id,
        igsid: commenterId,
        ruleId: regra.id,
        commentId,
      });
    }

    let resultadoPublico = null;
    if (regra.comment_reply_text) {
      resultadoPublico = await enviarRespostaPublica(commentId, regra.comment_reply_text);
    }

    await historyStore.registrar({
      accountId: account.id,
      comment_id: commentId,
      media_id: mediaId,
      regra_id: regra.id,
      commenter_id: commenterId,
      commenter_username: value.from?.username || null,
      comment_text: texto,
      reply_text: textoParaEnviar,
      status: resultado.ok
        ? precisaSeguir
          ? "aguardando_seguir"
          : aguardaResposta
            ? "aguardando_resposta"
            : "sent"
        : "failed",
      error: resultado.ok ? null : resultado.data,
      comment_reply_status: resultadoPublico ? (resultadoPublico.ok ? "sent" : "failed") : null,
      comment_reply_error: resultadoPublico && !resultadoPublico.ok ? resultadoPublico.data : null,
    });

    if (resultado.ok) {
      console.log(
        precisaSeguir
          ? "Pedido pra seguir enviado"
          : aguardaResposta
            ? "Abertura da DM longa enviada, aguardando resposta"
            : "Private reply enviada",
        commentId,
        resultado.data
      );
    } else {
      console.error("Falha ao enviar private reply", commentId, resultado.data);
    }
    if (resultadoPublico) {
      if (resultadoPublico.ok) {
        console.log("Resposta publica enviada", commentId, resultadoPublico.data);
      } else {
        console.error("Falha ao enviar resposta publica", commentId, resultadoPublico.data);
      }
    }
  }

  async function tratarMensagem(evento) {
    const senderId = evento?.sender?.id;
    const mensagem = evento?.message;
    const mensagemId = mensagem?.mid;
    const texto = mensagem?.text;
    if (!senderId || senderId === IG_USER_ID) return; // ignora eco/mensagem da propria conta
    // so processa mensagem de texto de verdade -- o webhook manda tambem
    // "visto", reacao, edicao etc no mesmo campo "messaging", sem "message"
    // (ou sem texto), e cada um contava como se a pessoa tivesse mandado uma
    // mensagem nova, disparando o lembrete repetidas vezes.
    if (!mensagem || mensagem.is_echo || !texto) return;
    if (mensagemId) {
      if (seenMessageIds.has(mensagemId)) return; // dedupe: reentrega do webhook
      seenMessageIds.add(mensagemId);
    }

    const pendente = await followGatesStore.buscar(account.id, senderId);
    if (!pendente) return; // mensagem sem gate pendente pra essa pessoa, nao e conosco

    console.log(`Mensagem de quem estava aguardando: igsid=${senderId} texto="${texto || ""}"`);

    const regras = await rulesStore.listar(account.id);
    const regra = regras.find((r) => r.id === pendente.rule_id);
    if (!regra) {
      await followGatesStore.remover(account.id, senderId); // regra apagada, nada a entregar
      return;
    }

    // so confere o follow quando a regra exige; DM longa sem "exigir seguir"
    // so estava esperando a pessoa responder
    if (regra.require_follow) {
      const { segue, nome } = await buscarStatusSeguidor(senderId);
      if (!segue) {
        await enviarMensagemDireta(
          senderId,
          personalizarTexto(
            "{first_name}, ainda não te vejo seguindo -- confere se salvou certinho e me chama de novo assim que seguir.",
            nome
          )
        );
        return;
      }
    }

    // "reivindicar" apaga o gate e devolve a linha; se duas respostas chegarem
    // juntas, so uma entrega (a outra recebe null e sai), evitando conteudo em dobro
    const reivindicado = await followGatesStore.reivindicar(account.id, senderId);
    if (!reivindicado) return;

    const resultado = await entregarConteudo(senderId, regra.reply_text);

    await historyStore.registrar({
      accountId: account.id,
      comment_id: pendente.comment_id,
      media_id: null,
      regra_id: regra.id,
      commenter_id: senderId,
      commenter_username: null,
      comment_text: texto || null,
      reply_text: regra.reply_text,
      status: resultado.ok ? "sent" : "failed",
      error: resultado.ok ? null : { parte: resultado.parte, de: resultado.total, ...resultado.data },
      comment_reply_status: null,
      comment_reply_error: null,
    });

    if (resultado.ok) {
      console.log(`Conteudo liberado em ${resultado.total} mensagem(ns)`, senderId);
    } else {
      console.error(`Falha ao liberar conteudo na parte ${resultado.parte}/${resultado.total}`, senderId, resultado.data);
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

    // diagnostico: com DEBUG_WEBHOOK_RAW=1 grava o JSON bruto de todo evento no log, pra ver
    // quais campos a Meta realmente manda (ex.: se a etiqueta de conversa vem no evento)
    if (process.env.DEBUG_WEBHOOK_RAW === "1") {
      console.log("[webhook-raw]", JSON.stringify(req.body));
    }

    for (const entry of req.body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "comments") {
          tratarComentario(change.value);
        }
      }
      for (const evento of entry.messaging || []) {
        tratarMensagem(evento);
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

  app.get("/api/rules", async (_req, res) => {
    res.json(await rulesStore.listar(account.id));
  });

  app.post("/api/rules", async (req, res) => {
    try {
      res.status(201).json(await rulesStore.criar({ ...req.body, accountId: account.id }));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put("/api/rules/:id", async (req, res) => {
    try {
      const atualizada = await rulesStore.atualizar(account.id, req.params.id, req.body);
      if (!atualizada) return res.sendStatus(404);
      res.json(atualizada);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/rules/:id", async (req, res) => {
    const removida = await rulesStore.remover(account.id, req.params.id);
    if (!removida) return res.sendStatus(404);
    res.sendStatus(204);
  });

  // pre-visualizacao pro painel: usa a mesma divisao que o envio de verdade
  app.post("/api/dm-partes", (req, res) => {
    const texto = String(req.body?.texto || "");
    const partes = texto.trim() ? dividirEmPartes(texto) : [];
    res.json({
      bytes: Buffer.byteLength(texto, "utf8"),
      cabe: cabeEmUmaMensagem(texto),
      partes: partes.map((p) => Buffer.byteLength(p, "utf8")),
    });
  });

  app.get("/api/media", async (_req, res) => {
    try {
      const media = await buscarMediaRecente(currentAccessToken, IG_USER_ID);
      res.json(media);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get("/api/history", async (_req, res) => {
    res.json(await historyStore.listar(account.id));
  });

  app.get("/api/token-status", async (_req, res) => {
    const status = await accountsStore.statusToken(account.id);
    res.json({
      updated_at: status ? new Date(status.token_updated_at).getTime() : null,
      expires_in_seconds: status?.expires_in_seconds || null,
    });
  });

  app.get("/", (_req, res) => res.send("ok"));

  app.listen(PORT, () => console.log(`Webhook receiver ouvindo na porta ${PORT}`));
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor", err);
  process.exit(1);
});
