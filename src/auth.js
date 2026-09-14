const crypto = require("crypto");

function compararSeguro(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function basicAuth(usuarioEsperado, senhaEsperada) {
  return (req, res, next) => {
    const header = req.get("Authorization") || "";
    const [tipo, credenciais] = header.split(" ");

    if (tipo === "Basic" && credenciais) {
      const [usuario, senha] = Buffer.from(credenciais, "base64")
        .toString("utf8")
        .split(":");
      if (
        usuario &&
        senha &&
        compararSeguro(usuario, usuarioEsperado) &&
        compararSeguro(senha, senhaEsperada)
      ) {
        return next();
      }
    }

    res.set("WWW-Authenticate", 'Basic realm="admin"');
    return res.sendStatus(401);
  };
}

module.exports = { basicAuth };
