const {
  applyCors,
  safeEquals,
  getLoginCredentials,
  setAuthCookie,
  checkRateLimit,
  getClientIp
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

  const clientIp = getClientIp(req);
  const ipLimit = checkRateLimit(`login:ip:${clientIp}`, { limit: 20, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed) {
    res.setHeader("Retry-After", String(ipLimit.retryAfterSeconds));
    res.status(429).json({ error: "Muitas tentativas de login. Tente novamente mais tarde." });
    return;
  }

  const payload = readBody(req.body);
  const login = String(payload.login || payload.username || "").trim();
  const senha = String(payload.senha || payload.password || "");

  if (!login || !senha) {
    res.status(400).json({ error: "Informe login e senha." });
    return;
  }

  const loginLimit = checkRateLimit(`login:user:${login.toLowerCase()}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!loginLimit.allowed) {
    res.setHeader("Retry-After", String(loginLimit.retryAfterSeconds));
    res.status(429).json({ error: "Muitas tentativas de login. Tente novamente mais tarde." });
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
