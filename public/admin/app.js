// Basic Auth explicito por fetch: navegador nao reenvia sozinho a senha da URL
// em toda chamada da API, entao guardamos o header em memoria (sessionStorage)
// e anexamos manualmente.
function authHeader() {
  const cred = sessionStorage.getItem("adminAuth");
  return cred ? { Authorization: `Basic ${cred}` } : {};
}

const api = {
  async get(path) {
    const resp = await fetch(path, { headers: { ...authHeader() } });
    if (resp.status === 401) throw new Error("nao autorizado");
    if (!resp.ok) throw new Error(`GET ${path} -> ${resp.status}`);
    return resp.json();
  },
  async send(method, path, body) {
    const resp = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 401) throw new Error("nao autorizado");
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `${method} ${path} -> ${resp.status}`);
    return data;
  },
};

let postSelecionado = null;
let editandoId = null;

// ---- input de palavras-chave (chips) ----
function criarTagsInput(containerEl, inputEl) {
  let tags = [];

  function render() {
    containerEl.querySelectorAll(".tag-chip").forEach((el) => el.remove());
    tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      const label = document.createElement("span");
      label.textContent = tag;
      const remover = document.createElement("button");
      remover.type = "button";
      remover.textContent = "×";
      remover.setAttribute("aria-label", `Remover ${tag}`);
      remover.addEventListener("click", () => {
        tags = tags.filter((t) => t !== tag);
        render();
      });
      chip.append(label, remover);
      containerEl.insertBefore(chip, inputEl);
    });
  }

  function adicionar(valorBruto) {
    const valor = valorBruto.trim();
    if (!valor || tags.includes(valor)) return;
    tags.push(valor);
    render();
  }

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      adicionar(inputEl.value);
      inputEl.value = "";
    } else if (e.key === "Backspace" && !inputEl.value && tags.length) {
      tags.pop();
      render();
    }
  });

  inputEl.addEventListener("blur", () => {
    if (inputEl.value.trim()) {
      adicionar(inputEl.value);
      inputEl.value = "";
    }
  });

  containerEl.addEventListener("click", (e) => {
    if (e.target === containerEl) inputEl.focus();
  });

  return {
    get: () => tags,
    set: (novasTags) => { tags = [...(novasTags || [])]; render(); },
  };
}

const tagsKeywords = criarTagsInput(
  document.getElementById("tags-keywords"),
  document.getElementById("tags-keywords-input")
);

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---- abas ----
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "historico") carregarHistorico();
  });
});

// ---- status do token ----
async function carregarTokenStatus() {
  const el = document.getElementById("token-status");
  try {
    const status = await api.get("/api/token-status");
    if (!status.updated_at) {
      el.textContent = "Token: nunca renovado automaticamente ainda";
      el.className = "token-status alerta";
      return;
    }
    const dias = Math.floor((Date.now() - status.updated_at) / 86400000);
    const validoPor = status.expires_in_seconds
      ? Math.round(status.expires_in_seconds / 86400 - dias)
      : null;
    el.textContent = validoPor
      ? `Token renovado há ${dias}d, válido por ~${validoPor}d`
      : `Token renovado há ${dias}d`;
    el.className = `token-status ${validoPor !== null && validoPor < 10 ? "alerta" : "ok"}`;
  } catch {
    el.textContent = "Não consegui checar o status do token";
    el.className = "token-status erro";
  }
}

// ---- regras ----
async function carregarRegras() {
  const container = document.getElementById("lista-regras");
  try {
    const regras = await api.get("/api/rules");
    if (regras.length === 0) {
      container.innerHTML = "<p>Nenhuma regra criada ainda.</p>";
      return;
    }
    container.innerHTML = regras.map(renderRegraCard).join("");
    container.querySelectorAll("[data-editar]").forEach((btn) =>
      btn.addEventListener("click", () => abrirModalEdicao(regras.find((r) => r.id === btn.dataset.editar)))
    );
    container.querySelectorAll("[data-apagar]").forEach((btn) =>
      btn.addEventListener("click", () => apagarRegra(btn.dataset.apagar))
    );
  } catch (err) {
    container.innerHTML = `<p class="erro">Erro ao carregar regras: ${escapeHtml(err.message)}</p>`;
  }
}

function renderRegraCard(regra) {
  const thumb = regra.media_id === "all"
    ? `<div class="regra-thumb all">🌐</div>`
    : `<img class="regra-thumb" src="${escapeHtml(regra.media_thumbnail || "")}" alt="" />`;
  const titulo = regra.media_id === "all" ? "Todos os posts" : "Post específico";
  const legenda = regra.media_id === "all" ? "" : escapeHtml(regra.media_caption_snippet || "");
  const keywords = regra.keywords.map((k) => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("");

  return `
    <div class="regra-card">
      ${thumb}
      <div class="regra-corpo">
        <div class="regra-titulo">${titulo}</div>
        ${legenda ? `<div class="regra-legenda">${legenda}</div>` : ""}
        <div class="regra-keywords">${keywords}</div>
        <div class="regra-reply">${escapeHtml(regra.reply_text)}</div>
      </div>
      <div class="regra-acoes">
        <button class="icone" data-editar="${regra.id}" title="Editar">✏️</button>
        <button class="icone perigo" data-apagar="${regra.id}" title="Apagar">🗑️</button>
      </div>
    </div>
  `;
}

async function apagarRegra(id) {
  if (!confirm("Apagar essa regra?")) return;
  await api.send("DELETE", `/api/rules/${id}`);
  carregarRegras();
}

// ---- modal ----
const overlay = document.getElementById("modal-overlay");
const campoPosts = document.getElementById("campo-posts");
const gridPosts = document.getElementById("grid-posts");

document.getElementById("btn-nova-regra").addEventListener("click", () => abrirModalCriacao());
document.getElementById("btn-cancelar").addEventListener("click", fecharModal);
document.querySelectorAll('input[name="escopo"]').forEach((r) =>
  r.addEventListener("change", (e) => {
    campoPosts.hidden = e.target.value !== "post";
    if (e.target.value === "post" && gridPosts.dataset.carregado !== "1") carregarPosts();
  })
);

function fecharModal() {
  overlay.hidden = true;
  postSelecionado = null;
  editandoId = null;
  document.getElementById("modal-erro").hidden = true;
}

function abrirModalCriacao() {
  editandoId = null;
  postSelecionado = null;
  document.getElementById("modal-titulo").textContent = "Nova regra";
  document.getElementById("campo-escopo").hidden = false;
  document.querySelector('input[name="escopo"][value="all"]').checked = true;
  campoPosts.hidden = true;
  tagsKeywords.set([]);
  document.getElementById("input-reply").value = "";
  overlay.hidden = false;
}

function abrirModalEdicao(regra) {
  editandoId = regra.id;
  postSelecionado = null;
  document.getElementById("modal-titulo").textContent = "Editar regra";
  document.getElementById("campo-escopo").hidden = true; // nao muda o post depois de criada
  campoPosts.hidden = true;
  tagsKeywords.set(regra.keywords);
  document.getElementById("input-reply").value = regra.reply_text;
  overlay.hidden = false;
}

async function carregarPosts() {
  gridPosts.innerHTML = "carregando…";
  try {
    const posts = await api.get("/api/media");
    gridPosts.dataset.carregado = "1";
    gridPosts.innerHTML = posts.map((p) => `
      <div class="post-item" data-id="${p.id}" data-thumb="${escapeHtml(p.thumbnail || "")}" data-legenda="${escapeHtml(p.caption_snippet || "")}" data-link="${escapeHtml(p.permalink || "")}">
        <img src="${escapeHtml(p.thumbnail || "")}" alt="" />
        <span>${new Date(p.timestamp).toLocaleDateString("pt-BR")}</span>
      </div>
    `).join("");
    gridPosts.querySelectorAll(".post-item").forEach((el) =>
      el.addEventListener("click", () => {
        gridPosts.querySelectorAll(".post-item").forEach((e) => e.classList.remove("selecionado"));
        el.classList.add("selecionado");
        postSelecionado = {
          id: el.dataset.id,
          thumbnail: el.dataset.thumb,
          caption_snippet: el.dataset.legenda,
          permalink: el.dataset.link,
        };
      })
    );
  } catch (err) {
    gridPosts.innerHTML = `<p class="erro">Erro ao buscar posts: ${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById("btn-salvar").addEventListener("click", async () => {
  const erroEl = document.getElementById("modal-erro");
  erroEl.hidden = true;

  const keywords = tagsKeywords.get();
  const reply_text = document.getElementById("input-reply").value.trim();

  if (keywords.length === 0 || !reply_text) {
    erroEl.textContent = "Preenche pelo menos uma palavra-chave e a mensagem.";
    erroEl.hidden = false;
    return;
  }

  try {
    if (editandoId) {
      await api.send("PUT", `/api/rules/${editandoId}`, { keywords, reply_text });
    } else {
      const escopo = document.querySelector('input[name="escopo"]:checked').value;
      if (escopo === "post" && !postSelecionado) {
        erroEl.textContent = "Escolhe um post na lista.";
        erroEl.hidden = false;
        return;
      }
      const body = escopo === "all"
        ? { media_id: "all", keywords, reply_text }
        : {
            media_id: postSelecionado.id,
            media_thumbnail: postSelecionado.thumbnail,
            media_caption_snippet: postSelecionado.caption_snippet,
            media_permalink: postSelecionado.permalink,
            keywords,
            reply_text,
          };
      await api.send("POST", "/api/rules", body);
    }
    fecharModal();
    carregarRegras();
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.hidden = false;
  }
});

// ---- historico ----
async function carregarHistorico() {
  const container = document.getElementById("lista-historico");
  try {
    const historico = await api.get("/api/history");
    if (historico.length === 0) {
      container.innerHTML = "<p>Nenhum comentário respondido ainda.</p>";
      return;
    }
    container.innerHTML = `
      <table>
        <thead><tr><th>Quando</th><th>Quem</th><th>Comentário</th><th>Status</th></tr></thead>
        <tbody>
          ${historico.map((h) => `
            <tr>
              <td>${new Date(h.timestamp).toLocaleString("pt-BR")}</td>
              <td>${escapeHtml(h.commenter_username || h.commenter_id || "?")}</td>
              <td>${escapeHtml(h.comment_text || "")}</td>
              <td class="${h.status === "sent" ? "status-ok" : "status-erro"}">${h.status === "sent" ? "Enviado" : "Falhou"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p class="erro">Erro ao carregar histórico: ${escapeHtml(err.message)}</p>`;
  }
}

// ---- login ----
function mostrarApp() {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("app-screen").hidden = false;
  carregarTokenStatus();
  carregarRegras();
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const erroEl = document.getElementById("login-erro");
  erroEl.hidden = true;

  const usuario = document.getElementById("login-user").value.trim();
  const senha = document.getElementById("login-senha").value;
  const cred = btoa(`${usuario}:${senha}`);

  try {
    const resp = await fetch("/api/token-status", { headers: { Authorization: `Basic ${cred}` } });
    if (!resp.ok) throw new Error("Usuário ou senha incorretos.");
    sessionStorage.setItem("adminAuth", cred);
    mostrarApp();
  } catch (err) {
    erroEl.textContent = err.message;
    erroEl.hidden = false;
  }
});

// se ja tem credencial guardada nessa aba, tenta entrar direto
const credSalva = sessionStorage.getItem("adminAuth");
if (credSalva) {
  mostrarApp();
}
