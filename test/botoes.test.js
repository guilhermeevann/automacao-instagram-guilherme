const test = require("node:test");
const assert = require("node:assert");
const { montarMensagem, BOTAO_QUERO, BOTAO_SEGUI } = require("../src/botoes");

test("sem botoes, a mensagem e so texto", () => {
  assert.deepStrictEqual(montarMensagem("oi"), { text: "oi" });
  assert.deepStrictEqual(montarMensagem("oi", []), { text: "oi" });
  assert.deepStrictEqual(montarMensagem("oi", null), { text: "oi" });
});

test("com botao, vai quick_replies no formato da Meta", () => {
  const m = montarMensagem("Toca no botao", [BOTAO_QUERO]);
  assert.strictEqual(m.text, "Toca no botao");
  assert.deepStrictEqual(m.quick_replies, [{ content_type: "text", title: "Quero receber", payload: "QUERO_RECEBER" }]);
});

test("os botoes padrao cabem nos 20 caracteres da Meta", () => {
  for (const b of [BOTAO_QUERO, BOTAO_SEGUI]) assert.ok(Array.from(b.title).length <= 20, b.title);
});

test("titulo acima de 20 caracteres e cortado sem partir acento", () => {
  const m = montarMensagem("x", [{ title: "ação ".repeat(10), payload: "P" }]);
  assert.strictEqual(Array.from(m.quick_replies[0].title).length, 20);
  assert.ok(!m.quick_replies[0].title.includes("\ufffd"));
});
