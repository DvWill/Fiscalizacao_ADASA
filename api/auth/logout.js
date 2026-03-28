const { applyCors, clearAuthCookie } = require("../_security");

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  clearAuthCookie(req, res);
  res.status(200).json({ ok: true });
};
