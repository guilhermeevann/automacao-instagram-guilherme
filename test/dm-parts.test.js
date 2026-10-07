const test = require("node:test");
const assert = require("node:assert");
const { dividirEmPartes, cabeEmUmaMensagem, bytes, LIMITE_MENSAGEM_BYTES } = require("../src/dm-parts");

const semEspaco = (t) => t.replace(/\s+/g, "");

function checarPartes(texto) {
  const partes = dividirEmPartes(texto);
  for (const p of partes) {
    assert.ok(bytes(p) <= LIMITE_MENSAGEM_BYTES, `parte com ${bytes(p)} bytes passa do limite`);
    assert.ok(p.length > 0, "parte vazia");
  }
  // nada some e nada duplica (ignorando quebras e espacos)
  assert.strictEqual(semEspaco(partes.join("")), semEspaco(texto));
  return partes;
}

test("texto curto vira uma parte so, intacto", () => {
  assert.deepStrictEqual(dividirEmPartes("Oi! Aqui esta."), ["Oi! Aqui esta."]);
  assert.ok(cabeEmUmaMensagem("a".repeat(1000)));
  assert.ok(!cabeEmUmaMensagem("a".repeat(1001)));
});

test("limite e em bytes, nao em caracteres (acento e emoji pesam mais)", () => {
  const texto = "ção 🚀 ".repeat(200); // ~1700 bytes, ~1200 caracteres
  assert.ok(bytes(texto) > 1000);
  checarPartes(texto);
});

test("corta em paragrafo e nao no meio da frase", () => {
  const par = (n) => `Paragrafo ${n}. ` + "Uma frase completa e normal. ".repeat(12).trim();
  const texto = [1, 2, 3, 4, 5, 6].map(par).join("\n\n");
  const partes = checarPartes(texto);
  assert.ok(partes.length >= 2);
  for (const p of partes) {
    assert.ok(/[.!?]$/.test(p), `parte nao termina em fim de frase: "${p.slice(-30)}"`);
  }
});

test("titulo terminado em dois pontos nao fica orfao no fim da parte", () => {
  const corpo = "Linha de conteudo normal aqui dentro do paragrafo. ".repeat(15).trim();
  const texto = [corpo, corpo, "Passo a passo:", corpo, corpo].join("\n\n");
  const partes = checarPartes(texto);
  for (const p of partes.slice(0, -1)) {
    const ultima = p.split("\n").pop().trim();
    assert.ok(!ultima.endsWith(":"), `titulo orfao no fim da parte: "${ultima}"`);
  }
});

test("bloco gigante sem quebra (tipo JSON numa linha) ainda e dividido sem estourar", () => {
  const json = JSON.stringify({ dados: "x".repeat(2500) });
  checarPartes(json);
});

test("linha unica longa sem espaco e dividida por caractere sem partir multibyte", () => {
  const texto = "ã".repeat(1500); // 3000 bytes, uma palavra so
  const partes = checarPartes(texto);
  assert.ok(partes.every((p) => !p.includes("�")));
});

test("preserva as quebras de linha dentro de uma parte", () => {
  const texto = ("1. item um\n2. item dois\n3. item tres\n\n").repeat(40);
  const partes = checarPartes(texto);
  assert.ok(partes.some((p) => p.includes("\n")));
});
