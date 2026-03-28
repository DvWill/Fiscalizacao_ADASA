const {
  applyCors,
  safeEquals,
  getLoginCredentials,
  setAuthCookie
} = require("../_security");

function readBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) return;

  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const credentials = getLoginCredentials();
  if (!credentials.enabled) {
    res.status(503).json({ error: "Login nao configurado no servidor." });
    return;
  }

  const payload = readBody(req.body);
  const login = String(payload.login || payload.username || "").trim();
  const senha = String(payload.senha || payload.password || "");

  if (!login || !senha) {
    res.status(400).json({ error: "Informe login e senha." });
    return;
  }

  const validLogin = safeEquals(login, credentials.login);
  const validPassword = safeEquals(senha, credentials.password);
  if (!validLogin || !validPassword) {
    res.status(401).json({ error: "Login ou senha invalidos." });
    return;
  }

  const cookieSet = setAuthCookie(req, res, credentials.login);
  if (!cookieSet) {
    res.status(500).json({ error: "Nao foi possivel iniciar sessao." });
    return;
  }

  res.status(200).json({
    authenticated: true,
    login: credentials.login
  });
};
