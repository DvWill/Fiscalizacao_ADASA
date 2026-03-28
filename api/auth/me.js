const { applyCors, resolveAuthorization } = require("../_security");

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET") {
    res.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const auth = resolveAuthorization(req);
  if (!auth.authenticated) {
    res.status(401).json({
      authenticated: false,
      authRequired: true
    });
    return;
  }

  res.status(200).json({
    authenticated: true,
    authRequired: auth.authRequired,
    mode: auth.mode,
    login: auth.login || ""
  });
};
