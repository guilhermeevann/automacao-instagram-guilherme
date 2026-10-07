// A Meta aceita no maximo 1000 bytes (UTF-8) por mensagem. Texto maior que isso
// e dividido aqui em partes, cortando sempre no limite mais "natural" possivel:
// paragrafo > linha > frase > palavra > (ultimo caso) caractere.

const LIMITE_MENSAGEM_BYTES = 1000;
// folga sob o limite da Meta, pra nunca estourar por contagem diferente
const LIMITE_PARTE_BYTES = 900;

function bytes(texto) {
  return Buffer.byteLength(texto, "utf8");
}

function cabeEmUmaMensagem(texto) {
  return bytes(texto) <= LIMITE_MENSAGEM_BYTES && !/^[ \t]*<<<PARTE>>>[ \t]*$/m.test(texto);
}

// corta por caractere sem partir um caractere multibyte (acento, emoji)
function cortarPorCaractere(texto, limite) {
  const partes = [];
  let atual = "";
  for (const ch of texto) {
    if (bytes(atual + ch) > limite) {
      partes.push(atual);
      atual = ch;
    } else {
      atual += ch;
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

// divide `texto` em pedacos <= limite, tentando cada separador em ordem
function dividirPorSeparadores(texto, limite, separadores) {
  if (bytes(texto) <= limite) return [texto];
  if (separadores.length === 0) return cortarPorCaractere(texto, limite);

  const [sep, ...resto] = separadores;
  const pedacos = texto.split(sep);
  const saida = [];
  let atual = "";

  for (const pedaco of pedacos) {
    const candidato = atual === "" ? pedaco : atual + sep + pedaco;
    if (bytes(candidato) <= limite) {
      atual = candidato;
      continue;
    }
    if (atual !== "") saida.push(atual);
    if (bytes(pedaco) <= limite) {
      atual = pedaco;
    } else {
      // o pedaco sozinho nao cabe: desce pro proximo separador
      const subpartes = dividirPorSeparadores(pedaco, limite, resto);
      atual = subpartes.pop();
      saida.push(...subpartes);
    }
  }
  if (atual !== "") saida.push(atual);
  return saida;
}

// "titulo:" no fim de uma parte, com o conteudo na parte seguinte, fica orfao.
// Leva o titulo junto pra parte de baixo.
function terminaEmTitulo(paragrafo) {
  const ultimaLinha = paragrafo.trim().split("\n").pop();
  return ultimaLinha.length <= 80 && ultimaLinha.endsWith(":");
}

// Linha sozinha com este marcador separa mensagens: quem escreveu a DM ja decidiu
// onde cada uma comeca (ex.: cada pacote de codigos com o proprio cabecalho).
const MARCADOR_PARTE = /^[ \t]*<<<PARTE>>>[ \t]*$/m;

function temMarcador(texto) {
  return MARCADOR_PARTE.test(texto);
}

function dividirEmPartes(texto, limite = LIMITE_PARTE_BYTES) {
  const limpo = texto.replace(/\r\n/g, "\n").trim();

  if (temMarcador(limpo)) {
    // cada trecho marcado sai como esta, ate o limite da Meta; so um trecho
    // que passe de 1000 bytes e dividido pelo corte automatico
    return limpo
      .split(new RegExp(MARCADOR_PARTE.source, "mg"))
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => (cabeEmUmaMensagem(p) ? [p] : dividirEmPartes(p, limite)));
  }

  if (bytes(limpo) <= LIMITE_MENSAGEM_BYTES) return [limpo];

  // paragrafo (linha em branco) > linha > frase > palavra
  const unidades = dividirPorSeparadores(limpo, limite, ["\n\n", "\n", ". ", " "]);

  // dividirPorSeparadores ja junta unidades pequenas com o separador de mesmo
  // nivel, entao aqui so tratamos o titulo orfao entre partes vizinhas
  for (let i = 0; i < unidades.length - 1; i++) {
    const paragrafos = unidades[i].split("\n\n");
    const ultimo = paragrafos[paragrafos.length - 1];
    if (paragrafos.length > 1 && terminaEmTitulo(ultimo)) {
      const proxima = ultimo + "\n\n" + unidades[i + 1];
      if (bytes(proxima) <= limite) {
        unidades[i] = paragrafos.slice(0, -1).join("\n\n");
        unidades[i + 1] = proxima;
      }
    }
  }

  return unidades.map((p) => p.trim()).filter(Boolean);
}

module.exports = { dividirEmPartes, cabeEmUmaMensagem, bytes, LIMITE_MENSAGEM_BYTES, LIMITE_PARTE_BYTES };
